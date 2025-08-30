use tauri_plugin_sql::{Migration, MigrationKind};
use std::process::Command;
use std::env;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn print_thermal_receipt(receipt_data: String) -> Result<String, String> {
    println!("Tauri print command called with data length: {}", receipt_data.len());
    
    // Validate input data is not empty
    if receipt_data.trim().is_empty() {
        return Err("Receipt data cannot be empty".to_string());
    }
    
    // Escape single quotes in the JSON data for shell safety
    let escaped_data: String = receipt_data.replace("'", "'\\''"); 
    
    // Create the exact command string that works in your terminal
    let command: String = format!("print print '{}'", escaped_data);
    
    println!("Executing command: {}", command);
    
    // Choose shell based on operating system
    let shell = if env::consts::OS == "macos" {
        "zsh"
    } else {
        "bash"
    };
    
    println!("Using shell: {}", shell);
    
    // First try to see if print is available with which command
    let which_cmd = "which print";
    println!("Checking if print command exists: {}", which_cmd);
    
    if let Ok(which_output) = Command::new(shell)
        .arg("-l")
        .arg("-c")
        .arg(which_cmd)
        .output() {
        println!("Which print result: {}", String::from_utf8_lossy(&which_output.stdout));
        println!("Which print stderr: {}", String::from_utf8_lossy(&which_output.stderr));
    } else {
        println!("Failed to run which command");
    }
    
    // Try the actual command with both login shell and source the shell config
    let full_command = format!("source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true; {}", command);
    println!("Executing with source: {}", full_command);
    
    let output = Command::new(shell)
        .arg("-l")  // Load login shell environment
        .arg("-c")  // Execute command
        .arg(&full_command)
        .output()
        .map_err(|e| {
            let error_msg = format!("Failed to execute shell command '{}': {}", command, e);
            println!("Command execution error: {}", error_msg);
            error_msg
        })?;
    
    let stdout = String::from_utf8(output.stdout)
        .unwrap_or_else(|_| "[Invalid UTF-8 in stdout]".to_string());
    let stderr = String::from_utf8(output.stderr)
        .unwrap_or_else(|_| "[Invalid UTF-8 in stderr]".to_string());
    
    println!("Command exit status: {}", output.status);
    println!("Command stdout: {}", stdout);
    println!("Command stderr: {}", stderr);
    
    if output.status.success() {
        // Return the actual stdout output from the print command
        let output_msg = if stdout.trim().is_empty() {
            "Print command executed successfully (no output)".to_string()
        } else {
            format!("Print command executed: {}", stdout.trim())
        };
        Ok(output_msg)
    } else {
        let error_msg = if stderr.trim().is_empty() {
            format!("Print command failed with exit code: {} (no error message)", output.status)
        } else {
            format!("Print command failed: {}", stderr.trim())
        };
        Err(error_msg)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Define database migrations for authentication system
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_users_table",
            sql: "CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
                permissions TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "insert_default_users",
            sql: "INSERT OR IGNORE INTO users (id, email, password, name, role, permissions, created_at, last_login) VALUES 
                (1, 'admin@postpos.com', 'admin123', 'Admin User', 'admin', '[\"*\"]', '2024-01-01T00:00:00.000Z', '2025-01-24T10:30:00.000Z'),
                (2, 'manager@postpos.com', 'manager123', 'Store Manager', 'manager', '[\"sales.view\",\"sales.create\",\"sales.edit\",\"products.view\",\"products.create\",\"products.edit\",\"products.delete\",\"inventory.view\",\"inventory.edit\",\"reports.view\",\"reports.export\",\"users.view\",\"users.create\",\"users.edit\",\"users.delete\"]', '2024-01-15T00:00:00.000Z', '2025-01-23T14:45:00.000Z'),
                (3, 'user@postpos.com', 'user123', 'John Cashier', 'user', '[\"sales.view\",\"sales.create\",\"products.view\"]', '2024-02-01T00:00:00.000Z', '2025-01-24T09:00:00.000Z');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_products_table",
            sql: "CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price REAL NOT NULL,
                cost REAL NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL,
                barcode TEXT UNIQUE,
                image TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "insert_default_products",
            sql: "INSERT OR IGNORE INTO products (id, name, description, price, cost, stock, category, barcode, image, is_active, created_at, updated_at) VALUES
                (1, 'Coca Cola 500ml', 'Refreshing soft drink', 2.50, 1.20, 120, 'Beverages', '7501055363063', NULL, 1, '2024-01-01T00:00:00.000Z', '2024-01-15T10:30:00.000Z'),
                (2, 'Bread Loaf', 'Fresh whole wheat bread', 3.99, 1.80, 25, 'Bakery', '1234567890123', NULL, 1, '2024-01-02T00:00:00.000Z', '2024-01-16T14:45:00.000Z'),
                (3, 'Premium Coffee Beans 1kg', 'Arabica coffee beans from Colombia', 24.99, 12.00, 8, 'Coffee & Tea', '9876543210987', NULL, 1, '2024-01-03T00:00:00.000Z', '2024-01-17T09:15:00.000Z'),
                (4, 'Organic Milk 1L', 'Fresh organic whole milk', 4.50, 2.20, 45, 'Dairy', '5555666677778', NULL, 1, '2024-01-04T00:00:00.000Z', '2024-01-18T16:20:00.000Z'),
                (5, 'Chocolate Bar', 'Dark chocolate 70% cocoa', 5.99, 2.80, 0, 'Snacks', '1111222233334', NULL, 0, '2024-01-05T00:00:00.000Z', '2024-01-19T11:10:00.000Z'),
                (6, 'Fresh Salmon Fillet', 'Atlantic salmon, wild-caught', 18.99, 12.50, 12, 'Seafood', '2222333344445', NULL, 1, '2024-01-06T00:00:00.000Z', '2024-01-20T08:30:00.000Z'),
                (7, 'Frozen Pizza Margherita', 'Traditional Italian style pizza', 6.99, 3.50, 35, 'Frozen Foods', '3333444455556', NULL, 1, '2024-01-07T00:00:00.000Z', '2024-01-21T15:45:00.000Z'),
                (8, 'Bananas (per lb)', 'Fresh organic bananas', 1.29, 0.65, 150, 'Fresh Produce', '4444555566667', NULL, 1, '2024-01-08T00:00:00.000Z', '2024-01-22T12:15:00.000Z'),
                (9, 'Paper Towels (6-pack)', 'Ultra-absorbent paper towels', 12.99, 7.20, 28, 'Household Items', '5555666677778', NULL, 1, '2024-01-09T00:00:00.000Z', '2024-01-23T09:30:00.000Z'),
                (10, 'Shampoo & Conditioner Set', 'Moisturizing hair care set', 15.99, 8.90, 22, 'Personal Care', '6666777788889', NULL, 1, '2024-01-10T00:00:00.000Z', '2024-01-24T14:20:00.000Z');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_orders_table",
            sql: "CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subtotal REAL NOT NULL,
                tax REAL NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'completed')),
                payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'transfer')),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_order_items_table",
            sql: "CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                total_price REAL NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products (id)
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "insert_default_orders",
            sql: "INSERT OR IGNORE INTO orders (id, subtotal, tax, total, status, payment_method, created_at, updated_at, completed_at) VALUES
                (1, 8.99, 0.90, 9.89, 'completed', 'cash', '2024-01-15T10:30:00.000Z', '2024-01-15T10:35:00.000Z', '2024-01-15T10:35:00.000Z'),
                (2, 24.99, 2.50, 27.49, 'paid', 'card', '2024-01-16T14:45:00.000Z', '2024-01-16T14:50:00.000Z', '2024-01-16T14:50:00.000Z');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "insert_default_order_items",
            sql: "INSERT OR IGNORE INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price) VALUES
                (1, 1, 1, 'Coca Cola 500ml', 2, 2.50, 5.00),
                (2, 1, 2, 'Bread Loaf', 1, 3.99, 3.99),
                (3, 2, 3, 'Premium Coffee Beans 1kg', 1, 24.99, 24.99);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_company_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS company_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL DEFAULT 'Post POS',
                description TEXT DEFAULT 'Modern Point of Sale System',
                tax_enabled BOOLEAN DEFAULT 1,
                tax_percentage REAL DEFAULT 10.0,
                currency_symbol TEXT DEFAULT '$',
                language TEXT DEFAULT 'en',
                logo_url TEXT,
                address TEXT,
                phone TEXT,
                email TEXT,
                website TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "insert_default_company_settings",
            sql: "INSERT OR IGNORE INTO company_settings (id, name, description, tax_enabled, tax_percentage, currency_symbol, language, created_at, updated_at) VALUES
                (1, 'Post POS', 'Modern Point of Sale System', 1, 10.0, '$', 'en', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_user_id_to_orders",
            sql: "ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "update_existing_orders_with_default_user",
            sql: "UPDATE orders SET user_id = 1 WHERE user_id IS NULL;",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:postpos.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![greet, print_thermal_receipt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
