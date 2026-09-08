/**
 * OpenPOS release pipeline. Replaces the former GitHub Actions release workflow.
 *
 * Builds desktop artifacts on this machine, computes SHA-256 checksums, writes
 * an update manifest, and uploads everything to an S3-compatible bucket
 * (AWS S3, Cloudflare R2, MinIO...).
 *
 * Usage:
 *   pnpm run release                          # build for the host platform + upload
 *   pnpm run release --linux                  # AppImage + deb (Linux host, or container on macOS)
 *   pnpm run release --deb                    # Debian package only
 *   pnpm run release --mac                    # macOS zip + dmg (macOS host)
 *   pnpm run release --mac --linux            # both families in one publish
 *   pnpm run release --notes "..."            # attach release notes to the manifest
 *   pnpm run release --skip-check --skip-test # skip validation steps
 *   pnpm run release --skip-build             # reuse artifacts already in dist-electron
 *   pnpm run release --dry-run                # build + manifest but do not upload
 *   pnpm run release --local-dir dist-releases  # copy the bucket layout to a local folder
 *
 * Required environment (for upload). `apps/releases/.env` is loaded when present,
 * and Railway bucket names are accepted as aliases:
 *   RELEASE_S3_BUCKET / BUCKET
 *   AWS_ACCESS_KEY_ID / ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY / SECRET_ACCESS_KEY
 *   RELEASE_CDN_BASE_URL       public base URL of the releases service
 *                              (e.g. https://releases.openpos.xyz)
 * Optional environment:
 *   RELEASE_S3_ENDPOINT / ENDPOINT
 *   RELEASE_S3_REGION / REGION (default: auto; Railway uses auto)
 *   RELEASE_S3_PATH_STYLE      set to 1 to force path-style URLs (Railway
 *                              buckets use virtual-host style by default)
 *   RELEASE_PREFIX             key prefix inside the bucket (default: releases)
 */

import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assetKey,
  buildCommandForPlatform,
  buildManifest,
  collectArtifacts,
  filterArtifactsForPlatforms,
  findMissingArtifacts,
  manifestKey,
  type PlatformFamily,
  type ReleaseArtifact,
  resolveReleasePlatforms,
  sha256File,
  validatePackageVersions,
} from './release-lib'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

interface CliOptions {
  platforms: PlatformFamily[]
  notes: string | null
  skipCheck: boolean
  skipTest: boolean
  skipBuild: boolean
  dryRun: boolean
  localDir: string | null
}

function parseArgs(argv: string[]): CliOptions {
  const platformFlags: PlatformFamily[] = []
  const options: CliOptions = {
    platforms: [],
    notes: null,
    skipCheck: false,
    skipTest: false,
    skipBuild: false,
    dryRun: false,
    localDir: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--linux') platformFlags.push('linux')
    else if (arg === '--deb') platformFlags.push('deb')
    else if (arg === '--mac') platformFlags.push('mac')
    else if (arg === '--skip-check') options.skipCheck = true
    else if (arg === '--skip-test') options.skipTest = true
    else if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--notes') {
      options.notes = argv[i + 1] ?? null
      i++
    } else if (arg.startsWith('--notes=')) options.notes = arg.slice('--notes='.length)
    else if (arg === '--local-dir') {
      options.localDir = argv[i + 1] ?? null
      i++
    } else if (arg.startsWith('--local-dir=')) options.localDir = arg.slice('--local-dir='.length)
    else {
      console.error(`Unknown option: ${arg}`)
      console.error(
        'Usage: pnpm run release [--linux] [--deb] [--mac] [--notes <text>] [--local-dir <path>] [--skip-check] [--skip-test] [--skip-build] [--dry-run]',
      )
      process.exit(1)
    }
  }

  options.platforms = resolveReleasePlatforms(platformFlags, process.platform)
  return options
}

function applyEnvFile(path: string): void {
  if (!existsSync(path)) return

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue

    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

/** Loads apps/releases/.env and maps Railway bucket names onto the upload variables. */
function loadReleaseCredentials(): void {
  applyEnvFile(resolve(repoRoot, 'apps/releases/.env'))

  const aliases: Array<[from: string, to: string]> = [
    ['BUCKET', 'RELEASE_S3_BUCKET'],
    ['ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
    ['SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
    ['ENDPOINT', 'RELEASE_S3_ENDPOINT'],
    ['REGION', 'RELEASE_S3_REGION'],
  ]
  for (const [from, to] of aliases) {
    const source = process.env[from]
    if (!process.env[to] && source) process.env[to] = source
  }
}

async function readPackageVersion(relativePath: string): Promise<string> {
  const fullPath = resolve(repoRoot, relativePath)
  const json = JSON.parse(await readFile(fullPath, 'utf8')) as { version?: string }
  return String(json.version ?? '')
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function buildCommands(platforms: PlatformFamily[]): Array<{ command: string; args: string[] }> {
  return platforms.map((platform) => buildCommandForPlatform(platform, process.platform))
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

async function uploadFile(client: unknown, bucketName: string, key: string, filePath: string): Promise<void> {
  // Imported lazily so --dry-run works without credentials configured.
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3Client = client as { send: (command: unknown) => Promise<unknown> }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentTypeFor(key),
    }),
  )
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.json')) return 'application/json'
  if (key.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (key.endsWith('.zip')) return 'application/zip'
  if (key.endsWith('.AppImage')) return 'application/x-executable'
  if (key.endsWith('.dmg')) return 'application/x-apple-diskimage'
  return 'application/octet-stream'
}

async function publishLocal(
  localDir: string,
  prefix: string,
  version: string,
  artifacts: ReleaseArtifact[],
  manifestPath: string,
): Promise<void> {
  for (const artifact of artifacts) {
    const key = assetKey(prefix, version, artifact.name)
    const destination = resolve(localDir, key)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(artifact.filePath, destination)
    console.log(`Copied ${artifact.name} → ${destination}`)
  }

  const destManifest = resolve(localDir, manifestKey(prefix))
  await mkdir(dirname(destManifest), { recursive: true })
  await copyFile(manifestPath, destManifest)
  console.log(`Copied latest.json → ${destManifest}`)
}

async function main() {
  loadReleaseCredentials()
  const options = parseArgs(process.argv.slice(2))

  console.log(`OpenPOS release — platforms: ${options.platforms.join(', ')}`)

  // 1. Validate package versions.
  const expectedVersion = JSON.parse(await readFile(resolve(repoRoot, 'apps/desktop/package.json'), 'utf8'))
    .version as string

  const versionFiles: Array<[string, string]> = [
    ['Root workspace', 'package.json'],
    ['Desktop app', 'apps/desktop/package.json'],
    ['API', 'apps/api/package.json'],
    ['Releases service', 'apps/releases/package.json'],
    ['Landing page', 'apps/landing/package.json'],
  ]
  const packages: Record<string, string> = {}
  for (const [name, path] of versionFiles) {
    packages[name] = await readPackageVersion(path)
  }

  const versionErrors = validatePackageVersions(expectedVersion, packages)
  if (versionErrors.length > 0) {
    console.error(`\nVersion mismatch against apps/desktop (${expectedVersion}):`)
    for (const error of versionErrors) console.error(`  - ${error}`)
    console.error('\nRun `pnpm run version:bump <x.y.z>` first.')
    process.exit(1)
  }
  console.log(`✓ Package versions match v${expectedVersion}`)

  // 2. Check + tests.
  if (!options.skipCheck) run('pnpm', ['run', 'check'])
  else console.log('\nSkipping check (--skip-check)')

  if (!options.skipTest) run('pnpm', ['run', 'test'])
  else console.log('\nSkipping tests (--skip-test)')

  // 3. Build artifacts.
  if (!options.skipBuild) {
    for (const { command, args } of buildCommands(options.platforms)) {
      run(command, args)
    }
  } else {
    console.log('\nSkipping desktop build (--skip-build)')
  }

  // 4. Verify and hash artifacts.
  const distDir = resolve(repoRoot, 'apps/desktop/dist-electron')
  const artifacts: ReleaseArtifact[] = filterArtifactsForPlatforms(await collectArtifacts(distDir), options.platforms)
  const missing = findMissingArtifacts(artifacts, options.platforms)
  if (missing.length > 0) {
    console.error(`\nMissing artifacts in apps/desktop/dist-electron:`)
    for (const item of missing) console.error(`  - ${item}`)
    process.exit(1)
  }

  const prefix = process.env.RELEASE_PREFIX || 'releases'
  const hashedArtifacts: Array<{ name: string; sha256: string; size: number }> = []
  for (const artifact of artifacts) {
    const sha256 = await sha256File(artifact.filePath)
    const { size } = await stat(artifact.filePath)
    hashedArtifacts.push({ name: artifact.name, sha256, size })
    console.log(`✓ ${artifact.name} (${Math.round(size / 1024 / 1024)} MiB) sha256=${sha256.slice(0, 12)}…`)
  }

  // 5. Build the update manifest consumed by the desktop app.
  const cdnBaseUrl = process.env.RELEASE_CDN_BASE_URL || 'https://releases.openpos.xyz'

  const manifest = buildManifest({
    version: expectedVersion,
    notes: options.notes,
    publishedAt: new Date(),
    cdnBaseUrl,
    prefix,
    artifacts: hashedArtifacts,
  })

  const manifestPath = resolve(distDir, 'latest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nManifest written to ${manifestPath}`)

  if (options.dryRun) {
    console.log('\nDry run complete — nothing was uploaded.')
    return
  }

  const localDir = options.localDir ? resolve(repoRoot, options.localDir) : null
  if (localDir) {
    await publishLocal(localDir, prefix, expectedVersion, artifacts, manifestPath)
  }

  // 6. Upload to the S3-compatible bucket when credentials are present.
  const bucketName = process.env.RELEASE_S3_BUCKET
  if (!bucketName && !localDir) {
    console.error('Missing RELEASE_S3_BUCKET. Pass --local-dir to publish on this machine instead.')
    process.exit(1)
  }

  if (bucketName) {
    requireEnv('AWS_ACCESS_KEY_ID')
    requireEnv('AWS_SECRET_ACCESS_KEY')
    const { S3Client } = await import('@aws-sdk/client-s3')

    const s3Config: ConstructorParameters<typeof S3Client>[0] = {
      region: process.env.RELEASE_S3_REGION || 'auto',
    }
    if (process.env.RELEASE_S3_ENDPOINT) {
      s3Config.endpoint = process.env.RELEASE_S3_ENDPOINT
    }
    if (process.env.RELEASE_S3_PATH_STYLE === '1') {
      s3Config.forcePathStyle = true
    }

    const client = new S3Client(s3Config)

    for (const artifact of artifacts) {
      const key = assetKey(prefix, expectedVersion, artifact.name)
      console.log(`Uploading ${artifact.name} → ${bucketName}/${key}`)
      await uploadFile(client, bucketName, key, artifact.filePath)
    }

    const mKey = manifestKey(prefix)
    console.log(`Uploading latest.json → ${bucketName}/${mKey}`)
    await uploadFile(client, bucketName, mKey, manifestPath)
  }

  console.log(`\n✅ Release v${expectedVersion} published.`)
  if (localDir) {
    console.log(`   Local layout: ${localDir}/${manifestKey(prefix)}`)
  }
  if (bucketName) {
    console.log(`   Manifest: ${cdnBaseUrl.replace(/\/+$/, '')}/${manifestKey(prefix)}`)
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
