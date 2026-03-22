#!/usr/bin/env bun

import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import { loadBootstrapMigrations, packageRoot, splitStatements } from '../src/migrations'

const outputPath = resolve(packageRoot, 'assets', 'openpos-bootstrap.sqlite')

async function main() {
  mkdirSync(dirname(outputPath), { recursive: true })
  rmSync(outputPath, { force: true })

  const database = new Database(outputPath, { create: true, strict: false })

  try {
    for (const migration of loadBootstrapMigrations()) {
      console.log(`apply bootstrap V${String(migration.version).padStart(3, '0')} ${migration.description}`)
      for (const statement of splitStatements(migration.sql)) {
        database.run(statement)
      }
    }
  } finally {
    database.close()
  }

  console.log(`Bootstrap database written to ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
