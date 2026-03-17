/**
 * sync.ts — Offline-to-online reconciliation engine for OpenPOS
 *
 * Strategy:
 *   1. drainQueue()       — replay locally-queued writes to Turso (local-first,
 *                           last-write-wins; failures on individual rows are skipped
 *                           rather than blocking the entire drain)
 *   2. pullRemoteChanges() — pull rows from Turso that are newer than local copies
 *                            and upsert them into local SQLite
 *   3. syncOnReconnect()  — orchestrates 1 + 2, manages the connectionStatus signal
 *
 * Called automatically by db.ts when the health-check detects a local→remote
 * transition.  Can also be called manually.
 */

import { connect, type Connection as TursoClient } from '@tursodatabase/serverless'
import { connectionStatus, pendingCount } from './db'
import { isTauri } from './platform'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingSyncRow {
  id: number
  operation: string
  table_name: string
  record_id: string | null
  payload: string
  sql_statement: string
  created_at: string
}

interface MaxUpdatedAt {
  max_updated_at: string | null
}

interface MaxCreatedAt {
  max_created_at: string | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Local SQLite instance type — mirrors the Tauri plugin without a static import
interface LocalDb {
  select: <T>(sql: string, params?: unknown[]) => Promise<T>
  execute: (sql: string, params?: unknown[]) => Promise<{ lastInsertId: number; rowsAffected: number }>
}

/** Get a direct local SQLite client — used for queue operations. */
async function getLocalClient(): Promise<LocalDb> {
  if (!isTauri) throw new Error('[sync] getLocalClient called in web context — should never happen')
  // Force the local path by temporarily overriding nothing — we use the Tauri
  // Database.load API directly so we're always talking to local SQLite.
  const mod = await import('@tauri-apps/plugin-sql')
  return mod.default.load('sqlite:postpos.db') as Promise<LocalDb>
}

/** Get a Turso client. Throws if Turso is not configured. */
function getTursoClient(): TursoClient {
  const url = import.meta.env.VITE_TURSO_DATABASE_URL
  const token = import.meta.env.VITE_TURSO_AUTH_TOKEN
  if (!url || !token) throw new Error('[sync] Turso not configured')
  return connect({ url, authToken: token })
}

/** Refresh the pendingCount signal by counting unsynced rows. */
async function refreshPendingCount(local: LocalDb): Promise<void> {
  try {
    const rows = await local.select<[{ cnt: number }]>(
      'SELECT COUNT(*) AS cnt FROM pending_sync_queue WHERE synced_at IS NULL',
    )
    pendingCount.value = rows[0]?.cnt ?? 0
  } catch {
    // Non-critical — table may not exist yet on first boot before migration runs
    pendingCount.value = 0
  }
}

// ---------------------------------------------------------------------------
// drainQueue
// ---------------------------------------------------------------------------

/**
 * Replay every unsynced row from pending_sync_queue against Turso in order.
 * Marks synced_at on success.  Logs but does not throw on per-row failures so
 * one bad statement cannot block subsequent ones.
 */
export async function drainQueue(): Promise<void> {
  const local = await getLocalClient()
  const turso = getTursoClient()

  const rows = await local.select<PendingSyncRow[]>(
    `SELECT id, operation, table_name, record_id, payload, sql_statement, created_at
       FROM pending_sync_queue
      WHERE synced_at IS NULL
      ORDER BY created_at ASC`,
  )

  if (rows.length === 0) return

  console.log(`[sync] drainQueue: replaying ${rows.length} pending writes to Turso`)

  for (const row of rows) {
    try {
      let params: unknown[] = []
      try {
        params = JSON.parse(row.payload)
      } catch {
        console.warn(`[sync] drainQueue: could not parse payload for row ${row.id}`, row.payload)
      }

      await turso.execute(row.sql_statement, params)

      await local.execute('UPDATE pending_sync_queue SET synced_at = ? WHERE id = ?', [
        new Date().toISOString(),
        row.id,
      ])
    } catch (err: unknown) {
      console.error(`[sync] drainQueue: failed to replay row ${row.id} (${row.operation} ${row.table_name}):`, err)
      // Continue — don't let one failure abort the rest
    }
  }

  await refreshPendingCount(local)
}

// ---------------------------------------------------------------------------
// pullRemoteChanges
// ---------------------------------------------------------------------------

/**
 * Tables with updated_at that we pull from Turso and upsert locally.
 * Column lists are derived directly from the migration files — keep in sync
 * with src-tauri/src/migrations/schema/*.sql whenever the schema changes.
 */
const TABLES_WITH_UPDATED_AT = [
  {
    // V004 + V024: products table
    table: 'products',
    columns: [
      'id',
      'name',
      'description',
      'price',
      'cost',
      'stock',
      'category',
      'barcode',
      'image',
      'is_active',
      'variant_type',
      'default_variant_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    // V015: customers table (all 33 columns)
    table: 'customers',
    columns: [
      'id',
      'customer_number',
      'first_name',
      'last_name',
      'company_name',
      'email',
      'phone',
      'phone_secondary',
      'address_line1',
      'address_line2',
      'city',
      'state',
      'postal_code',
      'country',
      'customer_type',
      'customer_segment',
      'credit_limit',
      'current_balance',
      'tax_exempt',
      'tax_id',
      'loyalty_points',
      'total_purchases',
      'total_orders',
      'first_purchase_date',
      'last_purchase_date',
      'is_active',
      'notes',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
      'created_by',
      'deleted_at',
    ],
  },
  {
    // V006 + V012 + V016: orders table
    table: 'orders',
    columns: [
      'id',
      'subtotal',
      'tax',
      'total',
      'status',
      'payment_method',
      'notes',
      'completed_at',
      'user_id',
      'customer_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    // V010 + V028: company_settings table
    table: 'company_settings',
    columns: [
      'id',
      'name',
      'app_name',
      'description',
      'tax_enabled',
      'tax_percentage',
      'currency_symbol',
      'language',
      'logo_url',
      'address',
      'phone',
      'email',
      'website',
      'receipt_footer',
      'created_at',
      'updated_at',
    ],
  },
  {
    // V022: product_variants table
    table: 'product_variants',
    columns: [
      'id',
      'parent_product_id',
      'sku',
      'barcode',
      'price',
      'cost',
      'stock',
      'attributes',
      'image',
      'is_active',
      'position',
      'created_at',
      'updated_at',
    ],
  },
  {
    // V023: product_variant_settings table
    table: 'product_variant_settings',
    columns: [
      'id',
      'product_id',
      'has_variants',
      'attribute_ids',
      'variant_name_template',
      'pricing_strategy',
      'price_adjustment_formula',
      'stock_strategy',
      'created_at',
      'updated_at',
    ],
  },
  {
    // V021: product_attributes table (global attribute definitions, no product_id)
    table: 'product_attributes',
    columns: ['id', 'name', 'slug', 'values', 'is_active', 'created_at', 'updated_at'],
  },
] as const

/**
 * Pull rows from Turso that are newer than the local max updated_at and
 * upsert them into local SQLite.  Also re-syncs order_items for any orders
 * that were pulled (since order_items has no timestamps).
 */
export async function pullRemoteChanges(): Promise<void> {
  const local = await getLocalClient()
  const turso = getTursoClient()

  console.log('[sync] pullRemoteChanges: pulling newer rows from Turso')

  // ---- Tables with updated_at ----
  for (const { table, columns } of TABLES_WITH_UPDATED_AT) {
    try {
      const maxRows = await local.select<MaxUpdatedAt[]>(`SELECT MAX(updated_at) AS max_updated_at FROM ${table}`)
      const since = maxRows[0]?.max_updated_at ?? '1970-01-01T00:00:00.000Z'

      const remoteRows = await turso.execute(`SELECT ${columns.join(', ')} FROM ${table} WHERE updated_at > ?`, [since])

      if (remoteRows.rows.length === 0) continue

      console.log(`[sync] pullRemoteChanges: upserting ${remoteRows.rows.length} row(s) into ${table}`)

      for (const row of remoteRows.rows) {
        const placeholders = columns.map(() => '?').join(', ')
        const values = columns.map((c) => (row as Record<string, unknown>)[c] ?? null)
        await local.execute(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values)
      }
    } catch (err: unknown) {
      console.error(`[sync] pullRemoteChanges: failed for table ${table}:`, err)
    }
  }

  // ---- users (only has created_at) ----
  try {
    const maxRows = await local.select<MaxCreatedAt[]>('SELECT MAX(created_at) AS max_created_at FROM users')
    const since = maxRows[0]?.max_created_at ?? '1970-01-01T00:00:00.000Z'

    const userColumns = [
      'id',
      'email',
      'password',
      'name',
      'role',
      'permissions',
      'last_login',
      'password_hashed',
      'created_at',
      'deleted_at',
    ]
    const remoteUsers = await turso.execute(`SELECT ${userColumns.join(', ')} FROM users WHERE created_at > ?`, [since])

    for (const row of remoteUsers.rows) {
      const placeholders = userColumns.map(() => '?').join(', ')
      const values = userColumns.map((c) => (row as Record<string, unknown>)[c] ?? null)
      await local.execute(`INSERT OR REPLACE INTO users (${userColumns.join(', ')}) VALUES (${placeholders})`, values)
    }
  } catch (err: unknown) {
    console.error('[sync] pullRemoteChanges: failed for table users:', err)
  }

  // ---- order_items — re-pulled via parent orders ----
  // For every order that was (potentially) updated above, delete+re-insert its
  // items from Turso.  We identify which orders changed by re-querying Turso for
  // any order_items whose order_id matches recently-touched orders.
  // Simplest safe approach: pull ALL order_items whose order_id exists in any
  // order we hold locally.  This is bounded by the number of local orders.
  try {
    const localOrderIds = await local.select<{ id: number }[]>('SELECT id FROM orders')
    if (localOrderIds.length > 0) {
      const ids = localOrderIds.map((r) => r.id)

      // SQLite / Turso have parameter limits — chunk if needed
      const CHUNK = 200
      const itemColumns = [
        'id',
        'order_id',
        'product_id',
        'product_name',
        'quantity',
        'unit_price',
        'total_price',
        'variant_id',
        'variant_attributes',
      ]

      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const placeholders = chunk.map(() => '?').join(', ')
        const remoteItems = await turso.execute(
          `SELECT ${itemColumns.join(', ')} FROM order_items WHERE order_id IN (${placeholders})`,
          chunk,
        )

        for (const row of remoteItems.rows) {
          const valuePlaceholders = itemColumns.map(() => '?').join(', ')
          const values = itemColumns.map((c) => (row as Record<string, unknown>)[c] ?? null)
          await local.execute(
            `INSERT OR REPLACE INTO order_items (${itemColumns.join(', ')}) VALUES (${valuePlaceholders})`,
            values,
          )
        }
      }
    }
  } catch (err: unknown) {
    console.error('[sync] pullRemoteChanges: failed for table order_items:', err)
  }
}

// ---------------------------------------------------------------------------
// syncOnReconnect (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Called automatically by db.ts when the health-check detects that Turso has
 * become reachable again after a period of local-only operation.
 *
 * Sequence:
 *   1. Set connectionStatus → 'syncing'
 *   2. drainQueue()
 *   3. pullRemoteChanges()
 *   4. Set connectionStatus → 'remote'
 *   5. Refresh pendingCount
 */
export async function syncOnReconnect(): Promise<void> {
  console.log('[sync] syncOnReconnect: starting')
  connectionStatus.value = 'syncing'

  try {
    await drainQueue()
    await pullRemoteChanges()
    connectionStatus.value = 'remote'
    console.log('[sync] syncOnReconnect: complete')
  } catch (err: unknown) {
    console.error('[sync] syncOnReconnect: unexpected error:', err)
    // Don't leave the status as 'syncing' forever — fall back to remote since
    // we know the connection is up (the health-check just confirmed it)
    connectionStatus.value = 'remote'
  } finally {
    // Always refresh the pending count so the badge reflects reality
    try {
      const local = await getLocalClient()
      await refreshPendingCount(local)
    } catch {
      // Non-critical
    }
  }
}
