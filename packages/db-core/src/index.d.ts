export type ReplicatedDeleteStrategy = 'soft' | 'hard'

export interface ReplicatedTableConfig {
  tableName: string
  primaryKey: string
  columns: string[]
  watermarkColumn: string
  deleteStrategy: ReplicatedDeleteStrategy
  pullOrder: number
}

export interface MigrationFile {
  name: string
  file: string
  fullPath: string
  sql: string
}

export interface LocalSqliteDb<TSchema = unknown> {
  client: any
  db: any
}

export interface TursoDb<TSchema = unknown> {
  client: any
  db: any
}

export function parseEnvFile(filePath: string): Record<string, string>
export function getDefaultEnvCandidates(repoRoot?: string): string[]
export function loadEnv(options?: { repoRoot?: string; candidates?: string[] }): Record<string, string | undefined>

export function defineProjectConfig(options: {
  schema: string
  out: string
  dialect?: string
  strict?: boolean
  verbose?: boolean
  dbCredentials?: Record<string, unknown>
}): Record<string, unknown>

export function resolveProjectPaths(packageRoot: string, options?: {
  schemaPath?: string
  migrationsDir?: string
  devMigrationsDir?: string
  bootstrapDatabasePath?: string
}): {
  packageRoot: string
  schemaPath: string
  migrationsDir: string
  devMigrationsDir: string
  bootstrapDatabasePath: string
}

export function createLocalSqliteDb<TSchema = unknown>(options?: {
  client?: any
  fileName?: string
  pragmas?: string[]
  schema?: TSchema
}): LocalSqliteDb<TSchema>

export function createTursoDb<TSchema = unknown>(options: {
  client?: any
  url?: string
  authToken?: string
  schema?: TSchema
}): TursoDb<TSchema>

export function splitStatements(sql: string): string[]
export function loadSqlMigrations(dirPath: string): MigrationFile[]
export function loadMigrationFiles(options: {
  migrationsDir: string
  extraMigrationDirs?: string[]
}): MigrationFile[]

export const DEFAULT_MIGRATIONS_TABLE: '__drizzle_migrations'

export function runLocalMigrations(options: {
  client?: any
  fileName?: string
  pragmas?: string[]
  schema?: unknown
  migrationsDir: string
  extraMigrationDirs?: string[]
  migrationsTable?: string
}): {
  appliedCount: number
  skippedCount: number
  migrations: MigrationFile[]
}

export function runTursoMigrations(options: {
  client?: any
  url?: string
  authToken?: string
  schema?: unknown
  migrationsDir: string
  extraMigrationDirs?: string[]
  migrationsTable?: string
}): Promise<{
  appliedCount: number
  skippedCount: number
  migrations: MigrationFile[]
}>

export function buildReplicatedTableConfig(table: unknown, options: {
  primaryKey: string
  watermarkColumn: string
  deleteStrategy: ReplicatedDeleteStrategy
  pullOrder: number
}): ReplicatedTableConfig

export function buildReplicatedTableMap(configs: ReplicatedTableConfig[]): Record<string, ReplicatedTableConfig>
