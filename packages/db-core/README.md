# `@openpos/db-core`

Lean Drizzle infrastructure for projects that need:

- local SQLite connections
- remote Turso/libSQL connections
- committed SQL migrations applied to both
- schema-derived sync metadata from Drizzle tables

## What it exports

- `createLocalSqliteDb(options)`
- `createTursoDb(options)`
- `runLocalMigrations(options)`
- `runTursoMigrations(options)`
- `defineProjectConfig(options)`
- `resolveProjectPaths(packageRoot, options)`
- `buildReplicatedTableConfig(table, options)`
- `buildReplicatedTableMap(configs)`
- `loadEnv(options)`

## Typical usage

```js
const { sqliteTable, integer, text } = require('drizzle-orm/sqlite-core')
const {
  buildReplicatedTableConfig,
  createLocalSqliteDb,
  createTursoDb,
  defineProjectConfig,
  runLocalMigrations,
  runTursoMigrations,
} = require('@openpos/db-core')

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
})

const replicatedUsers = buildReplicatedTableConfig(users, {
  primaryKey: 'id',
  watermarkColumn: 'updated_at',
  deleteStrategy: 'soft',
  pullOrder: 10,
})

const drizzleConfig = defineProjectConfig({
  schema: './src/schema/index.js',
  out: './drizzle',
})

const local = createLocalSqliteDb({ fileName: './data/app.sqlite' })
const remote = createTursoDb({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

runLocalMigrations({
  fileName: './data/app.sqlite',
  migrationsDir: './drizzle',
})

await runTursoMigrations({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  migrationsDir: './drizzle',
})
```

## Design

- Drizzle table definitions stay in the consumer package, not in `db-core`.
- Migration files are plain committed SQL so the same artifact can be applied to SQLite and Turso.
- The package is runtime-agnostic enough for Bun and Node; local migration helpers automatically use `bun:sqlite` when Bun is running.
