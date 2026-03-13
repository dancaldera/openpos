use std::collections::HashSet;
use std::fs;
use std::path::Path;

fn main() {
    // Print cargo rerun-if-changed directives for migration directories
    println!("cargo:rerun-if-changed=src/migrations");

    // Validate migrations during build
    if let Err(e) = validate_migrations() {
        panic!("Migration validation failed: {}", e);
    }

    tauri_build::build()
}

/// Validate migration files
fn validate_migrations() -> Result<(), String> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let migrations_dir = manifest_dir.join("src").join("migrations");

    if !migrations_dir.exists() {
        return Err(format!(
            "Migrations directory does not exist: {:?}",
            migrations_dir
        ));
    }

    let schema_dir = migrations_dir.join("schema");
    let seeds_dir = migrations_dir.join("seeds");

    // Validate schema directory
    if !schema_dir.exists() {
        return Err(format!(
            "Schema migrations directory does not exist: {:?}",
            schema_dir
        ));
    }

    // Validate seeds directory
    if !seeds_dir.exists() {
        return Err(format!(
            "Seed migrations directory does not exist: {:?}",
            seeds_dir
        ));
    }

    // Collect all migration versions
    let mut versions = HashSet::new();
    let mut duplicate_versions = Vec::new();

    // Validate schema migrations
    let schema_entries = fs::read_dir(&schema_dir)
        .map_err(|e| format!("Failed to read schema directory: {}", e))?;

    for entry in schema_entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "sql") {
            if let Some(version) = extract_version_from_filename(&path) {
                if !versions.insert(version) {
                    duplicate_versions.push((version, path.clone()));
                }
            }
        }
    }

    // Validate seed migrations
    let seeds_entries = fs::read_dir(&seeds_dir)
        .map_err(|e| format!("Failed to read seeds directory: {}", e))?;

    for entry in seeds_entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "sql") {
            if let Some(version) = extract_version_from_filename(&path) {
                if !versions.insert(version) {
                    duplicate_versions.push((version, path.clone()));
                }
            }
        }
    }

    // Report duplicate versions
    if !duplicate_versions.is_empty() {
        let mut error_msg = String::from("Duplicate migration versions found:\n");
        for (version, path) in duplicate_versions {
            error_msg.push_str(&format!("  - Version {} in {:?}\n", version, path));
        }
        return Err(error_msg);
    }

    Ok(())
}

/// Extract version number from migration filename
/// Expected format: V###__description.sql
fn extract_version_from_filename(path: &Path) -> Option<i32> {
    let filename = path.file_stem()?.to_str()?;
    let version_str = filename.strip_prefix('V')?;
    let version_end = version_str.find("__")?;
    version_str[..version_end].parse().ok()
}
