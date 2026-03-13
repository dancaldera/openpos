# OpenPOS Database Migrations

This directory contains all database migrations for the OpenPOS application. Migrations are organized by type and loaded dynamically at build time.

## Directory Structure

```
migrations/
├── schema/           # Schema migrations (CREATE, ALTER statements)
├── seeds/            # Seed data migrations (INSERT, UPDATE statements)
├── mod.rs            # Migration loader module
└── README.md         # This file
```

### Schema Migrations (`schema/`)

Contains DDL (Data Definition Language) migrations that create or modify database structures:
- CREATE TABLE
- ALTER TABLE
- CREATE INDEX

### Seed Migrations (`seeds/`)

Contains DML (Data Manipulation Language) migrations that populate database with initial data:
- INSERT statements
- UPDATE statements for data migration

## File Naming Convention

Each migration file follows this format:

```
V{version}__{description}.sql
```

Examples:
- `V001__create_users_table.sql`
- `V015__create_customers_table.sql`
- `V002__insert_default_users.sql`

**Rules:**
- Version must be unique across all migration files
- Use zero-padded 3-digit numbers (V001, V002, etc.)
- Use lowercase, snake_case descriptions
- Separate version and description with double underscore (`__`)

## SQL File Format

Each migration file must include metadata comments at the top:

```sql
-- Migration: V001
-- Description: Create users table
-- Type: schema
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
    permissions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);
```

### Required Metadata

- `-- Migration: V###` - Version number with V prefix
- `-- Description: ...` - Human-readable description
- `-- Type: schema` or `-- Type: seeds` - Migration type

### Optional Metadata

- `-- Created: YYYY-MM-DD` - Date when migration was created

## How to Add a New Migration

### Step 1: Create the Migration File

```bash
# For a schema change (new table, column, etc.)
touch src-tauri/migrations/schema/V021__add_supplier_table.sql

# For seed data
touch src-tauri/migrations/seeds/V021__insert_default_suppliers.sql
```

### Step 2: Edit the File with SQL

```sql
-- Migration: V021
-- Description: Add supplier table
-- Type: schema

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Step 3: Build and Test

```bash
# Build the application (will validate migrations)
bun tauri build

# Or run in dev mode
bun tauri dev
```

**No need to edit `lib.rs`** - the migration loader will automatically discover and load your new file!

## Migration Loading

The migration loader (`mod.rs`) automatically:

1. **Scans directories** - Reads all `.sql` files from `schema/` and `seeds/`
2. **Parses metadata** - Extracts version and description from file comments
3. **Validates structure** - Ensures metadata is present and valid
4. **Sorts by version** - Orders migrations V001, V002, etc.
5. **Checks for duplicates** - Warns if duplicate version numbers exist
6. **Loads SQL content** - Extracts SQL body (skips metadata comments)
7. **Returns migrations** - Provides `Vec<Migration>` to Tauri SQL plugin

## Backward Compatibility

- Existing databases continue to work unchanged
- The migration versions are identical to the original hardcoded migrations
- The order of migrations is preserved
- Migration descriptions match the original values

## Current Migrations

### Schema Migrations (V001-V016)

| Version | Description |
|---------|-------------|
| V001 | Create users table |
| V003 | Add password hashed column |
| V004 | Create products table |
| V006 | Create orders table |
| V007 | Create order items table |
| V010 | Create company settings table |
| V012 | Add user id to orders |
| V014 | Add deleted at to users |
| V015 | Create customers table |
| V016 | Add customer id to orders |

### Seed Migrations (V002, V005, V008-V020)

| Version | Description |
|---------|-------------|
| V002 | Insert default users |
| V005 | Insert default products |
| V008 | Insert default orders |
| V009 | Insert default order items |
| V011 | Insert default company settings |
| V013 | Update existing orders with default user |
| V017 | Insert default customers |
| V018 | Insert additional test customers |
| V019 | Insert sample orders |
| V020 | Insert sample order items |

## Build-Time Validation

The `build.rs` script validates migrations during compilation:

- Checks that `migrations/schema/` and `migrations/seeds/` directories exist
- Validates file naming convention (V###__description.sql)
- Detects duplicate version numbers across all migrations
- Triggers rebuild when migration files change

If validation fails, the build will error with a descriptive message.

## Testing

### Test the Migration Loader

```bash
# Run unit tests for the migration loader
cargo test migrations

# Run all tests
cargo test
```

### Verify Migrations Load

```bash
# Run in dev mode and check console output
bun tauri dev

# Look for migration count confirmation in logs
```

### Test with Existing Database

1. Run the application with an existing `postpos.db`
2. Verify all existing data is intact
3. Check that new migrations (if any) are applied

## Common Issues

### Duplicate Version Numbers

**Error:** `Duplicate migration versions found: Version 21 in ...`

**Solution:** Ensure each version number is unique across all migration files.

### Missing Metadata

**Error:** `Invalid metadata in migration file ... Expected comments: -- Migration: V###, -- Description: ..., -- Type: ...`

**Solution:** Add the required metadata comments at the top of your SQL file.

### Wrong File Naming

**Error:** Build fails or migration not found

**Solution:** Use the correct format: `V###__description.sql` (double underscore, lowercase, snake_case).

## Future Enhancements

Planned improvements to the migration system:

- **Rollback Support:** Add `.down.sql` files for reversible migrations
- **CLI Tool:** `cargo run --bin migrate validate` for standalone validation
- **Migration History:** Track which migrations have been applied
- **Dry Run Mode:** Preview migrations before applying

## Related Files

- `src-tauri/src/lib.rs` - Tauri app setup (now clean of hardcoded migrations)
- `src-tauri/build.rs` - Build-time migration validation
- `src-tauri/migrations/mod.rs` - Migration loader implementation
