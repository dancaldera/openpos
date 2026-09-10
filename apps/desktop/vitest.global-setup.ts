import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default function checkNodeVersion(): void {
  const { engines } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
    engines?: { node?: string }
  }
  const wanted = engines?.node?.match(/\d+/)?.[0]
  const actual = process.versions.node.split('.')[0]
  if (wanted !== undefined && actual !== wanted) {
    throw new Error(
      `OpenPOS desktop tests require Node ${engines?.node} but the running Node is ${process.version}. ` +
        'Switch with fnm/nvm (the repo .node-version file selects the right one) and re-run.',
    )
  }
}
