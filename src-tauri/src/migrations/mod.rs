//! File-based migration loader for OpenPOS
//!
//! This module loads SQL migration files from the schema/ and seeds/ directories
//! and combines them into a vector compatible with tauri_plugin_sql.

use std::fs;
use std::path::Path;

/// Migration data with owned strings for file-based loading
pub struct OwnedMigration {
    pub version: i64,
    pub description: String,
    pub sql: String,
    pub kind: MigrationKind,
}

/// Migration kind (Up or Down)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationKind {
    Up,
    Down,
}

/// Metadata extracted from migration file comments
#[derive(Debug, Clone)]
struct MigrationMetadata {
    version: i64,
    description: String,
    migration_type: String,
}

/// Parse migration metadata from SQL file comments
///
/// Expected format:
/// ```sql
/// -- Migration: V001
/// -- Description: Create users table
/// -- Type: schema
/// ```
fn parse_migration_metadata(content: &str) -> Option<MigrationMetadata> {
    let mut version = None;
    let mut description = None;
    let mut migration_type = None;

    for line in content.lines().take(20) {
        let line = line.trim();
        if line.starts_with("-- Migration: ") {
            let v_str = line.strip_prefix("-- Migration: ")?;
            // Remove 'V' prefix and parse
            let v_num = v_str.strip_prefix('V').unwrap_or(v_str);
            version = v_num.parse().ok();
        } else if line.starts_with("-- Description: ") {
            description = line.strip_prefix("-- Description: ").map(|s| s.to_string());
        } else if line.starts_with("-- Type: ") {
            migration_type = line.strip_prefix("-- Type: ").map(|s| s.to_string());
        }
    }

    match (version, description, migration_type) {
        (Some(v), Some(d), Some(t)) => Some(MigrationMetadata {
            version: v,
            description: d,
            migration_type: t,
        }),
        _ => None,
    }
}

/// Load SQL content from a single migration file
fn load_migration_sql(path: &Path) -> Result<String, String> {
    fs::read_to_string(path)
        .map_err(|e| format!("Failed to read migration file {:?}: {}", path, e))
}

/// Load all migrations from a directory
///
/// Files are sorted by filename to ensure version order
fn load_migrations_from_dir(dir: &Path) -> Result<Vec<OwnedMigration>, String> {
    let mut migrations = Vec::new();

    if !dir.exists() {
        return Ok(migrations);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read migration directory {:?}: {}", dir, e))?;

    let mut files: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension().map_or(false, |ext| ext == "sql")
        })
        .collect();

    // Sort by filename to ensure version order (V001, V002, etc.)
    files.sort_by_key(|entry| entry.file_name());

    for entry in files {
        let path = entry.path();
        let sql_content = load_migration_sql(&path)?;

        // Parse metadata from comments
        let metadata = parse_migration_metadata(&sql_content)
            .ok_or_else(|| {
                format!(
                    "Invalid metadata in migration file {:?}. \
                    Expected comments: -- Migration: V###, -- Description: ..., -- Type: ...",
                    path
                )
            })?;

        // Extract the actual SQL (skip metadata comments at the top)
        let sql_body: String = sql_content
            .lines()
            .skip_while(|line| {
                let trimmed = line.trim();
                trimmed.starts_with("--") || trimmed.is_empty()
            })
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();

        migrations.push(OwnedMigration {
            version: metadata.version,
            description: metadata.description,
            sql: sql_body,
            kind: MigrationKind::Up,
        });
    }

    Ok(migrations)
}

/// Load all migrations from schema/ and seeds/ directories
///
/// Returns a combined vector of migrations sorted by version number.
/// Schema migrations are loaded first, then seed migrations.
pub fn load_all_migrations() -> Vec<OwnedMigration> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let migrations_dir = manifest_dir.join("src").join("migrations");

    let schema_dir = migrations_dir.join("schema");
    let seeds_dir = migrations_dir.join("seeds");

    let mut all_migrations = Vec::new();

    // Load schema migrations
    match load_migrations_from_dir(&schema_dir) {
        Ok(schema_migrations) => {
            all_migrations.extend(schema_migrations);
        }
        Err(e) => {
            eprintln!("Warning: Failed to load schema migrations: {}", e);
        }
    }

    // Load seed migrations
    match load_migrations_from_dir(&seeds_dir) {
        Ok(seed_migrations) => {
            all_migrations.extend(seed_migrations);
        }
        Err(e) => {
            eprintln!("Warning: Failed to load seed migrations: {}", e);
        }
    }

    // Sort by version to ensure correct order
    all_migrations.sort_by_key(|m| m.version);

    // Check for duplicate versions
    let mut versions = std::collections::HashSet::new();
    for migration in &all_migrations {
        if !versions.insert(migration.version) {
            eprintln!(
                "Warning: Duplicate migration version {} detected",
                migration.version
            );
        }
    }

    all_migrations
}

/// Convert OwnedMigration to tauri_plugin_sql::Migration
///
/// This function converts our owned migration format to the Tauri SQL plugin format.
/// We use `Box::leak` to convert Strings to `&'static str` since the Migration
/// struct expects static references and our migrations live for the program's lifetime.
pub fn owned_to_tauri_migration(m: OwnedMigration) -> tauri_plugin_sql::Migration {
    tauri_plugin_sql::Migration {
        version: m.version,
        description: Box::leak(m.description.into_boxed_str()),
        sql: Box::leak(m.sql.into_boxed_str()),
        kind: tauri_plugin_sql::MigrationKind::Up,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_migration_metadata() {
        let content = r#"
-- Migration: V001
-- Description: Create users table
-- Type: schema
-- Created: 2024-01-01

CREATE TABLE users (id INTEGER PRIMARY KEY);
"#;
        let metadata = parse_migration_metadata(content).unwrap();
        assert_eq!(metadata.version, 1);
        assert_eq!(metadata.description, "Create users table");
        assert_eq!(metadata.migration_type, "schema");
    }

    #[test]
    fn test_parse_migration_metadata_missing_fields() {
        let content = r#"
-- Migration: V001
-- Description: Create users table
CREATE TABLE users (id INTEGER PRIMARY KEY);
"#;
        assert!(parse_migration_metadata(content).is_none());
    }

    #[test]
    fn test_parse_migration_metadata_strips_v_prefix() {
        let content = r#"
-- Migration: V015
-- Description: Add customer table
-- Type: schema

CREATE TABLE customers (id INTEGER PRIMARY KEY);
"#;
        let metadata = parse_migration_metadata(content).unwrap();
        assert_eq!(metadata.version, 15);
    }
}
