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
import type { S3ClientConfig } from '@aws-sdk/client-s3'
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
const releasesEnvFile = resolve(repoRoot, 'apps/releases/.env')

export interface CliOptions {
  platforms: PlatformFamily[]
  notes: string | null
  skipCheck: boolean
  skipTest: boolean
  skipBuild: boolean
  dryRun: boolean
  localDir: string | null
}

export function parseArgs(argv: string[]): CliOptions {
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

export function applyEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): void {
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
    if (env[key] === undefined) env[key] = value
  }
}

/** Loads apps/releases/.env and maps Railway bucket names onto the upload variables. */
export function loadReleaseCredentials(
  env: NodeJS.ProcessEnv = process.env,
  envFilePath: string = releasesEnvFile,
): void {
  applyEnvFile(envFilePath, env)

  const aliases: Array<[from: string, to: string]> = [
    ['BUCKET', 'RELEASE_S3_BUCKET'],
    ['ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
    ['SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
    ['ENDPOINT', 'RELEASE_S3_ENDPOINT'],
    ['REGION', 'RELEASE_S3_REGION'],
  ]
  for (const [from, to] of aliases) {
    const source = env[from]
    if (!env[to] && source) env[to] = source
  }
}

export async function readPackageVersion(relativePath: string): Promise<string> {
  const fullPath = resolve(repoRoot, relativePath)
  const json = JSON.parse(await readFile(fullPath, 'utf8')) as { version?: string }
  return String(json.version)
}

export function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
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

export function buildCommands(platforms: PlatformFamily[]): Array<{ command: string; args: string[] }> {
  return platforms.map((platform) => buildCommandForPlatform(platform, process.platform))
}

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export async function uploadFile(client: unknown, bucketName: string, key: string, filePath: string): Promise<void> {
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

export function contentTypeFor(key: string): string {
  if (key.endsWith('.json')) return 'application/json'
  if (key.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (key.endsWith('.zip')) return 'application/zip'
  if (key.endsWith('.AppImage')) return 'application/x-executable'
  if (key.endsWith('.dmg')) return 'application/x-apple-diskimage'
  return 'application/octet-stream'
}

export async function publishLocal(
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

const versionFiles: Array<[string, string]> = [
  ['Root workspace', 'package.json'],
  ['Desktop app', 'apps/desktop/package.json'],
  ['API', 'apps/api/package.json'],
  ['Releases service', 'apps/releases/package.json'],
  ['Landing page', 'apps/landing/package.json'],
]

/** Step 1: validate package versions. Returns the expected version. */
export async function checkVersions(
  readVersionFile: (relativePath: string) => Promise<string> = readPackageVersion,
): Promise<string> {
  const expectedVersion = await readVersionFile('apps/desktop/package.json')

  const packages: Record<string, string> = {}
  for (const [name, path] of versionFiles) {
    packages[name] = await readVersionFile(path)
  }

  const versionErrors = validatePackageVersions(expectedVersion, packages)
  if (versionErrors.length > 0) {
    throw new Error(
      `Version mismatch against apps/desktop (${expectedVersion}):\n${versionErrors.map((error) => `  - ${error}`).join('\n')}\n\nRun \`pnpm run version:bump <x.y.z>\` first.`,
    )
  }
  console.log(`✓ Package versions match v${expectedVersion}`)
  return expectedVersion
}

export type RunCommand = (command: string, args: string[]) => void

/** Step 2+3: check, tests, and desktop builds. */
export async function runValidationSteps(options: CliOptions, runCommand: RunCommand): Promise<void> {
  if (!options.skipCheck) runCommand('pnpm', ['run', 'check'])
  else console.log('\nSkipping check (--skip-check)')

  if (!options.skipTest) runCommand('pnpm', ['run', 'test'])
  else console.log('\nSkipping tests (--skip-test)')

  if (!options.skipBuild) {
    for (const { command, args } of buildCommands(options.platforms)) {
      runCommand(command, args)
    }
  } else {
    console.log('\nSkipping desktop build (--skip-build)')
  }
}

export interface HashedArtifact {
  name: string
  filePath: string
  sha256: string
  size: number
}

/** Step 4: verify and hash artifacts. */
export async function collectHashedArtifacts(distDir: string, platforms: PlatformFamily[]): Promise<HashedArtifact[]> {
  const artifacts: ReleaseArtifact[] = filterArtifactsForPlatforms(await collectArtifacts(distDir), platforms)
  const missing = findMissingArtifacts(artifacts, platforms)
  if (missing.length > 0) {
    throw new Error(`Missing artifacts in apps/desktop/dist-electron:\n${missing.map((item) => `  - ${item}`).join('\n')}`)
  }

  const hashedArtifacts: HashedArtifact[] = []
  for (const artifact of artifacts) {
    const sha256 = await sha256File(artifact.filePath)
    const { size } = await stat(artifact.filePath)
    hashedArtifacts.push({ name: artifact.name, filePath: artifact.filePath, sha256, size })
    console.log(`✓ ${artifact.name} (${Math.round(size / 1024 / 1024)} MiB) sha256=${sha256.slice(0, 12)}…`)
  }
  return hashedArtifacts
}

/** Step 5: build the update manifest consumed by the desktop app. */
export async function writeManifestFile(
  distDir: string,
  options: { version: string; notes: string | null; cdnBaseUrl: string; prefix: string; artifacts: HashedArtifact[] },
): Promise<string> {
  const manifest = buildManifest({
    version: options.version,
    notes: options.notes,
    publishedAt: new Date(),
    cdnBaseUrl: options.cdnBaseUrl,
    prefix: options.prefix,
    artifacts: options.artifacts,
  })

  const manifestPath = resolve(distDir, 'latest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nManifest written to ${manifestPath}`)
  return manifestPath
}

export interface PublishOptions {
  artifacts: HashedArtifact[]
  manifestPath: string
  version: string
  localDir: string | null
  cdnBaseUrl: string
  prefix: string
}

export interface PublishDeps {
  env?: NodeJS.ProcessEnv
  createClient?: (config: Record<string, unknown>) => Promise<unknown>
  upload?: typeof uploadFile
  publishLocalFiles?: typeof publishLocal
}

/** Step 6: publish to a local dir and/or the S3-compatible bucket. */
export async function publishRelease(publish: PublishOptions, deps: PublishDeps = {}): Promise<void> {
  const env = deps.env ?? process.env
  const upload = deps.upload ?? uploadFile
  const publishLocalFiles = deps.publishLocalFiles ?? publishLocal

  const localDir = publish.localDir ? resolve(repoRoot, publish.localDir) : null
  if (localDir) {
    await publishLocalFiles(localDir, publish.prefix, publish.version, publish.artifacts, publish.manifestPath)
  }

  const bucketName = env.RELEASE_S3_BUCKET
  if (!bucketName && !localDir) {
    throw new Error('Missing RELEASE_S3_BUCKET. Pass --local-dir to publish on this machine instead.')
  }

  if (bucketName) {
    requireEnv('AWS_ACCESS_KEY_ID', env)
    requireEnv('AWS_SECRET_ACCESS_KEY', env)
    if (!deps.createClient) {
      throw new Error('Missing S3 client factory')
    }

    const s3Config: Record<string, unknown> = {
      region: env.RELEASE_S3_REGION || 'auto',
    }
    if (env.RELEASE_S3_ENDPOINT) {
      s3Config.endpoint = env.RELEASE_S3_ENDPOINT
    }
    if (env.RELEASE_S3_PATH_STYLE === '1') {
      s3Config.forcePathStyle = true
    }

    const client = await deps.createClient(s3Config)

    for (const artifact of publish.artifacts) {
      const key = assetKey(publish.prefix, publish.version, artifact.name)
      console.log(`Uploading ${artifact.name} → ${bucketName}/${key}`)
      await upload(client, bucketName, key, artifact.filePath)
    }

    const mKey = manifestKey(publish.prefix)
    console.log(`Uploading latest.json → ${bucketName}/${mKey}`)
    await upload(client, bucketName, mKey, publish.manifestPath)
  }

  console.log(`\n✅ Release v${publish.version} published.`)
  if (localDir) {
    console.log(`   Local layout: ${localDir}/${manifestKey(publish.prefix)}`)
  }
  if (bucketName) {
    console.log(`   Manifest: ${publish.cdnBaseUrl.replace(/\/+$/, '')}/${manifestKey(publish.prefix)}`)
  }
}

export interface ReleaseSteps {
  loadCredentials: () => void
  checkVersions: () => Promise<string>
  runValidation: (options: CliOptions) => Promise<void>
  collectHashed: (options: CliOptions) => Promise<HashedArtifact[]>
  writeManifest: (options: CliOptions, version: string, hashed: HashedArtifact[]) => Promise<string>
  publish: (options: CliOptions, version: string, hashed: HashedArtifact[], manifestPath: string) => Promise<void>
}

export async function runRelease(argv: string[], steps: ReleaseSteps): Promise<void> {
  steps.loadCredentials()
  const options = parseArgs(argv)

  console.log(`OpenPOS release — platforms: ${options.platforms.join(', ')}`)

  const expectedVersion = await steps.checkVersions()
  await steps.runValidation(options)
  const hashedArtifacts = await steps.collectHashed(options)
  const manifestPath = await steps.writeManifest(options, expectedVersion, hashedArtifacts)

  if (options.dryRun) {
    console.log('\nDry run complete — nothing was uploaded.')
    return
  }

  await steps.publish(options, expectedVersion, hashedArtifacts, manifestPath)
}

export function reportFailure(error: unknown): never {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

/* c8 ignore next: production entrypoint (tests call runRelease directly). */
if (!process.env.VITEST) {
  const productionSteps: ReleaseSteps = {
    loadCredentials: () => loadReleaseCredentials(),
    checkVersions: () => checkVersions(),
    runValidation: (options) => runValidationSteps(options, run),
    collectHashed: (options) =>
      collectHashedArtifacts(resolve(repoRoot, 'apps/desktop/dist-electron'), options.platforms),
    writeManifest: (options, version, hashed) =>
      writeManifestFile(resolve(repoRoot, 'apps/desktop/dist-electron'), {
        version,
        notes: options.notes,
        cdnBaseUrl: process.env.RELEASE_CDN_BASE_URL || 'https://releases.openpos.xyz',
        prefix: process.env.RELEASE_PREFIX || 'releases',
        artifacts: hashed,
      }),
    publish: (options, version, hashed, manifestPath) =>
      publishRelease(
        {
          artifacts: hashed,
          manifestPath,
          version,
          localDir: options.localDir,
          cdnBaseUrl: process.env.RELEASE_CDN_BASE_URL || 'https://releases.openpos.xyz',
          prefix: process.env.RELEASE_PREFIX || 'releases',
        },
        {
          createClient: async (config) => {
            const { S3Client } = await import('@aws-sdk/client-s3')
            return new S3Client(config as S3ClientConfig)
          },
        },
      ),
  }
  await runRelease(process.argv.slice(2), productionSteps).catch(reportFailure)
}
