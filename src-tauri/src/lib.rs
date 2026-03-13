mod migrations;

use std::process::Command;
use std::env;

#[tauri::command]
async fn hash_password(password: String) -> Result<String, String> {
    let cost = 12u32;
    bcrypt::hash(password, cost).map_err(|e| e.to_string())
}

#[tauri::command]
async fn verify_password(password: String, hash: String) -> Result<bool, String> {
    bcrypt::verify(&password, &hash).map_err(|e| e.to_string())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!!", name)
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
    
    // Check if it's available as a function after sourcing
    let test_function = "source ~/.zshrc 2>/dev/null || true; type print";
    println!("Testing print after sourcing: {}", test_function);
    
    if let Ok(test_output) = Command::new(shell)
        .arg("-c")
        .arg(&test_function)
        .output() {
        println!("Type print result: {}", String::from_utf8_lossy(&test_output.stdout));
        println!("Type print stderr: {}", String::from_utf8_lossy(&test_output.stderr));
    }
    
    // Try with interactive shell to load functions
    let output = Command::new(shell)
        .arg("-i")  // Interactive mode to load shell functions
        .arg("-c")  // Execute command  
        .arg(&command)
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
    // Load migrations from the migrations/ directory
    let owned_migrations = migrations::load_all_migrations();
    let migrations: Vec<_> = owned_migrations
        .into_iter()
        .map(migrations::owned_to_tauri_migration)
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:postpos.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![greet, print_thermal_receipt, hash_password, verify_password])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
