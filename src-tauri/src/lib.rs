mod ftp;
mod local;
mod rdp;
mod sftp;
mod ssh;
mod state;
mod storage;
mod terminal;
mod vnc;

use ftp::{FtpAuthMethod, FtpBrowser, FtpClient};
use parking_lot::Mutex;
use rdp::RdpManager;
use sftp::{FileEntry, SftpBrowser, TransferProgress, TransferStatus};
use ssh::AuthMethod;
use state::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use storage::{ConnectionProfile, ConnectionStorage, KeychainManager, StoredAuthMethod};
use tauri::{AppHandle, Emitter, State};
use terminal::session::SessionInfo;
use vnc::VncManager;

// SFTP sessions stored separately with their own ID
type SftpSessions = Arc<Mutex<HashMap<String, SftpBrowser>>>;

// FTP sessions stored separately with their own ID
type FtpSessions = Arc<Mutex<HashMap<String, FtpBrowser>>>;

// VNC and RDP sessions
type VncManagerState = Arc<VncManager>;
type RdpManagerState = Arc<RdpManager>;

// ============ Terminal Commands ============

#[tauri::command]
async fn create_terminal(
    app_handle: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<SessionInfo, String> {
    let info = state.terminal_manager.create_local_session()?;
    state
        .terminal_manager
        .start_output_reader(&info.id, app_handle)?;
    Ok(info)
}

#[tauri::command]
async fn create_ssh_terminal(
    app_handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    host: String,
    port: u16,
    username: String,
    auth: AuthMethod,
) -> Result<SessionInfo, String> {
    let info = state
        .terminal_manager
        .create_ssh_session(&host, port, &username, &auth)?;
    state
        .terminal_manager
        .start_output_reader(&info.id, app_handle)?;
    Ok(info)
}

#[tauri::command]
async fn write_terminal(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: Vec<u8>,
) -> Result<usize, String> {
    state.terminal_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
async fn resize_terminal(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .terminal_manager
        .resize_session(&session_id, cols, rows)
}

#[tauri::command]
async fn close_terminal(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    state.terminal_manager.close_session(&session_id)
}

#[tauri::command]
async fn list_terminals(state: State<'_, Arc<AppState>>) -> Result<Vec<SessionInfo>, String> {
    Ok(state.terminal_manager.list_sessions())
}

// ============ Connection Storage Commands ============

#[tauri::command]
async fn list_connections() -> Result<Vec<ConnectionProfile>, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;
    storage.list().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_connection(id: String) -> Result<ConnectionProfile, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;
    storage.get(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_connection(
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    private_key_path: Option<String>,
    password: Option<String>,
) -> Result<ConnectionProfile, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;

    let auth_method = match auth_type.as_str() {
        "password" => StoredAuthMethod::Password,
        "publickey" => StoredAuthMethod::PublicKey {
            private_key_path: private_key_path.unwrap_or_default(),
        },
        "agent" => StoredAuthMethod::Agent,
        _ => return Err("Invalid auth type".to_string()),
    };

    let profile = ConnectionProfile::new_ssh(name, host, port, username, auth_method);

    // Store password in keychain if provided
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            KeychainManager::store_password(&profile.id, &pwd)
                .map_err(|e| format!("Failed to store password: {}", e))?;
        }
    }

    storage
        .save_connection(profile.clone())
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[tauri::command]
async fn save_ftp_connection(
    name: String,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    anonymous: bool,
) -> Result<ConnectionProfile, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;

    let profile = ConnectionProfile::new_ftp(name, host, port, username, anonymous);

    // Store password in keychain if provided and not anonymous
    if !anonymous {
        if let Some(pwd) = password {
            if !pwd.is_empty() {
                KeychainManager::store_password(&profile.id, &pwd)
                    .map_err(|e| format!("Failed to store password: {}", e))?;
            }
        }
    }

    storage
        .save_connection(profile.clone())
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[tauri::command]
async fn save_vnc_connection(
    name: String,
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<ConnectionProfile, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;

    let profile = ConnectionProfile::new_vnc(name, host, port);

    // Store password in keychain if provided
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            KeychainManager::store_password(&profile.id, &pwd)
                .map_err(|e| format!("Failed to store password: {}", e))?;
        }
    }

    storage
        .save_connection(profile.clone())
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[tauri::command]
async fn save_rdp_connection(
    name: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    domain: Option<String>,
) -> Result<ConnectionProfile, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;

    let profile = ConnectionProfile::new_rdp(name, host, port, username, domain);

    // Store password in keychain if provided
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            KeychainManager::store_password(&profile.id, &pwd)
                .map_err(|e| format!("Failed to store password: {}", e))?;
        }
    }

    storage
        .save_connection(profile.clone())
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[tauri::command]
async fn delete_connection(id: String) -> Result<(), String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;

    // Try to delete password from keychain (ignore errors if not found)
    let _ = KeychainManager::delete_password(&id);

    storage.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect_saved(
    app_handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    connection_id: String,
    password: Option<String>,
    passphrase: Option<String>,
) -> Result<SessionInfo, String> {
    let storage = ConnectionStorage::new().map_err(|e| e.to_string())?;
    let profile = storage.get(&connection_id).map_err(|e| e.to_string())?;

    // Extract SSH connection details
    let (host, port, username) = match &profile.connection_type {
        storage::connections::ConnectionType::Ssh { host, port, username, .. } => {
            (host.clone(), *port, username.clone())
        }
        storage::connections::ConnectionType::Ftp { .. } => {
            return Err("Cannot connect SSH to FTP connection profile".to_string());
        }
        storage::connections::ConnectionType::Vnc { .. } => {
            return Err("Cannot connect SSH to VNC connection profile".to_string());
        }
        storage::connections::ConnectionType::Rdp { .. } => {
            return Err("Cannot connect SSH to RDP connection profile".to_string());
        }
    };

    // Try to get password from keychain if not provided
    let pwd = password.or_else(|| KeychainManager::get_password(&connection_id).ok());

    let auth = profile.to_auth_method(pwd, passphrase);

    let info = state
        .terminal_manager
        .create_ssh_session(&host, port, &username, &auth)?;

    state
        .terminal_manager
        .start_output_reader(&info.id, app_handle)?;

    // Update last used timestamp
    let _ = storage.update_last_used(&connection_id);

    Ok(info)
}

// ============ SFTP Commands ============

#[tauri::command]
async fn sftp_open(
    state: State<'_, Arc<AppState>>,
    sftp_sessions: State<'_, SftpSessions>,
    session_id: String,
) -> Result<String, String> {
    // Get the SSH connection info from the terminal session
    let conn_info = state
        .terminal_manager
        .get_ssh_connection_info(&session_id)
        .ok_or_else(|| "SSH session not found or not an SSH session".to_string())?;

    // Create a NEW SSH connection specifically for SFTP to avoid mutex contention
    // with the terminal's session (which is used by the output reader thread)
    let sftp_client = ssh::SshClient::connect(
        &conn_info.host,
        conn_info.port,
        &conn_info.username,
        &conn_info.auth,
    )
    .map_err(|e| format!("Failed to create SFTP connection: {}", e))?;

    let sftp_session = sftp_client.open_sftp().map_err(|e| e.to_string())?;
    let browser = SftpBrowser::new(sftp_session.sftp(), sftp_session.session());

    let sftp_id = uuid::Uuid::new_v4().to_string();
    sftp_sessions.lock().insert(sftp_id.clone(), browser);

    Ok(sftp_id)
}

#[tauri::command]
async fn sftp_close(sftp_sessions: State<'_, SftpSessions>, sftp_id: String) -> Result<(), String> {
    sftp_sessions.lock().remove(&sftp_id);
    Ok(())
}

#[tauri::command]
async fn sftp_list_dir(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    browser.list_dir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_get_current_path(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
) -> Result<String, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    Ok(browser.current_path())
}

#[tauri::command]
async fn sftp_realpath(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    path: String,
) -> Result<String, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    browser.realpath(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_mkdir(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    path: String,
) -> Result<(), String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    browser.mkdir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_delete(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    if is_dir {
        browser.rmdir(&path).map_err(|e| e.to_string())
    } else {
        browser.delete(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn sftp_rename(
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    browser
        .rename(&old_path, &new_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_download(
    app_handle: AppHandle,
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    remote_path: String,
    local_path: String,
) -> Result<TransferProgress, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    let stat = browser.stat(&remote_path).map_err(|e| e.to_string())?;
    let filename = stat.name.clone();

    let mut progress = TransferProgress::new(
        filename,
        local_path.clone(),
        remote_path.clone(),
        false,
        stat.size,
    );

    let transfer = sftp::transfer::FileTransfer::new(browser.sftp.clone(), browser.session.clone());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.download(&remote_path, &local_path, |transferred, total| {
            let _ = app.emit(
                &format!("transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

#[tauri::command]
async fn sftp_upload(
    app_handle: AppHandle,
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    local_path: String,
    remote_path: String,
) -> Result<TransferProgress, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    let metadata = std::fs::metadata(&local_path).map_err(|e| e.to_string())?;
    let filename = std::path::Path::new(&local_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut progress = TransferProgress::new(
        filename,
        local_path.clone(),
        remote_path.clone(),
        true,
        metadata.len(),
    );

    let transfer = sftp::transfer::FileTransfer::new(browser.sftp.clone(), browser.session.clone());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.upload(&local_path, &remote_path, |transferred, total| {
            let _ = app.emit(
                &format!("transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

#[tauri::command]
async fn sftp_upload_folder(
    app_handle: AppHandle,
    sftp_sessions: State<'_, SftpSessions>,
    sftp_id: String,
    local_path: String,
    remote_path: String,
) -> Result<TransferProgress, String> {
    let sessions = sftp_sessions.lock();
    let browser = sessions
        .get(&sftp_id)
        .ok_or_else(|| "SFTP session not found".to_string())?;

    // Calculate folder size for progress
    let mut total_size: u64 = 0;
    for entry in walkdir::WalkDir::new(&local_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Ok(metadata) = entry.metadata() {
                total_size += metadata.len();
            }
        }
    }

    let folder_name = std::path::Path::new(&local_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "folder".to_string());

    let mut progress = TransferProgress::new(
        folder_name,
        local_path.clone(),
        remote_path.clone(),
        true,
        total_size,
    );

    let transfer = sftp::transfer::FileTransfer::new(browser.sftp.clone(), browser.session.clone());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.upload_folder(&local_path, &remote_path, |transferred, total, _filename| {
            let _ = app.emit(
                &format!("transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

// ============ FTP Commands ============

#[tauri::command]
async fn ftp_connect(
    ftp_sessions: State<'_, FtpSessions>,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    let auth = match (username, password) {
        (Some(user), Some(pwd)) => FtpAuthMethod::Password {
            username: user,
            password: pwd,
        },
        _ => FtpAuthMethod::Anonymous,
    };

    let client = FtpClient::connect(&host, port, &auth)
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    let browser = FtpBrowser::new(client.stream());

    let ftp_id = uuid::Uuid::new_v4().to_string();
    ftp_sessions.lock().insert(ftp_id.clone(), browser);

    // Don't drop client - we need to keep the connection alive
    std::mem::forget(client);

    Ok(ftp_id)
}

#[tauri::command]
async fn ftp_disconnect(ftp_sessions: State<'_, FtpSessions>, ftp_id: String) -> Result<(), String> {
    let mut sessions = ftp_sessions.lock();
    if let Some(browser) = sessions.remove(&ftp_id) {
        // Try to quit gracefully
        let stream = browser.stream();
        let mut stream_guard = stream.lock();
        let _ = stream_guard.quit();
    }
    Ok(())
}

#[tauri::command]
async fn ftp_list_dir(
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    path: String,
) -> Result<Vec<ftp::FileEntry>, String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    browser.list_dir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ftp_pwd(ftp_sessions: State<'_, FtpSessions>, ftp_id: String) -> Result<String, String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    browser.pwd().map_err(|e| e.to_string())
}

#[tauri::command]
async fn ftp_mkdir(
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    path: String,
) -> Result<(), String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    browser.mkdir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ftp_delete(
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    if is_dir {
        browser.rmdir(&path).map_err(|e| e.to_string())
    } else {
        browser.delete(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn ftp_rename(
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    browser.rename(&from_path, &to_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ftp_download(
    app_handle: AppHandle,
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    remote_path: String,
    local_path: String,
) -> Result<ftp::TransferProgress, String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    let size = browser.size(&remote_path).unwrap_or(0);
    let filename = std::path::Path::new(&remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut progress = ftp::TransferProgress::new(
        filename,
        local_path.clone(),
        remote_path.clone(),
        false,
        size,
    );

    let transfer = ftp::FtpTransfer::new(browser.stream());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = ftp::TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.download(&remote_path, &local_path, |transferred, total| {
            let _ = app.emit(
                &format!("ftp-transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("ftp-transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("ftp-transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

#[tauri::command]
async fn ftp_upload(
    app_handle: AppHandle,
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    local_path: String,
    remote_path: String,
) -> Result<ftp::TransferProgress, String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    let metadata = std::fs::metadata(&local_path).map_err(|e| e.to_string())?;
    let filename = std::path::Path::new(&local_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut progress = ftp::TransferProgress::new(
        filename,
        local_path.clone(),
        remote_path.clone(),
        true,
        metadata.len(),
    );

    let transfer = ftp::FtpTransfer::new(browser.stream());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = ftp::TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.upload(&local_path, &remote_path, |transferred, total| {
            let _ = app.emit(
                &format!("ftp-transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("ftp-transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("ftp-transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

#[tauri::command]
async fn ftp_upload_folder(
    app_handle: AppHandle,
    ftp_sessions: State<'_, FtpSessions>,
    ftp_id: String,
    local_path: String,
    remote_path: String,
) -> Result<ftp::TransferProgress, String> {
    let sessions = ftp_sessions.lock();
    let browser = sessions
        .get(&ftp_id)
        .ok_or_else(|| "FTP session not found".to_string())?;

    // Calculate folder size for progress
    let mut total_size: u64 = 0;
    for entry in walkdir::WalkDir::new(&local_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Ok(metadata) = entry.metadata() {
                total_size += metadata.len();
            }
        }
    }

    let folder_name = std::path::Path::new(&local_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "folder".to_string());

    let mut progress = ftp::TransferProgress::new(
        folder_name,
        local_path.clone(),
        remote_path.clone(),
        true,
        total_size,
    );

    let transfer = ftp::FtpTransfer::new(browser.stream());
    let transfer_id = progress.id.clone();
    let app = app_handle.clone();

    progress.status = ftp::TransferStatus::InProgress;

    std::thread::spawn(move || {
        let result = transfer.upload_folder(&local_path, &remote_path, |transferred, total, _filename| {
            let _ = app.emit(
                &format!("ftp-transfer-progress-{}", transfer_id),
                (transferred, total),
            );
        });

        match result {
            Ok(_) => {
                let _ = app.emit(&format!("ftp-transfer-complete-{}", transfer_id), true);
            }
            Err(e) => {
                let _ = app.emit(&format!("ftp-transfer-error-{}", transfer_id), e.to_string());
            }
        }
    });

    Ok(progress)
}

// ============ Local File System Commands ============

#[tauri::command]
async fn local_list_dir(path: String) -> Result<Vec<local::browser::FileEntry>, String> {
    local::browser::list_directory(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn local_get_home_dir() -> Result<String, String> {
    local::browser::get_home_dir().map_err(|e| e.to_string())
}

#[tauri::command]
async fn local_get_downloads_dir() -> Result<String, String> {
    local::browser::get_downloads_dir().map_err(|e| e.to_string())
}

// ============ Keychain Commands ============

#[tauri::command]
async fn has_stored_password(connection_id: String) -> Result<bool, String> {
    Ok(KeychainManager::has_password(&connection_id))
}

#[tauri::command]
async fn keychain_get_password(connection_id: String) -> Result<Option<String>, String> {
    KeychainManager::get_password(&connection_id)
        .map(Some)
        .or_else(|_| Ok(None))
}

// ============ VNC Commands ============

#[tauri::command]
async fn vnc_connect(
    app_handle: AppHandle,
    vnc_manager: State<'_, VncManagerState>,
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<(String, u16, u16), String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let (width, height) = vnc_manager.create_session(
        session_id.clone(),
        &host,
        port,
        password.as_deref(),
    )?;

    vnc_manager.start_frame_reader(&session_id, app_handle)?;

    Ok((session_id, width, height))
}

#[tauri::command]
async fn vnc_send_input(
    vnc_manager: State<'_, VncManagerState>,
    session_id: String,
    event: vnc::InputEvent,
) -> Result<(), String> {
    vnc_manager.send_input(&session_id, event)
}

#[tauri::command]
async fn vnc_disconnect(
    vnc_manager: State<'_, VncManagerState>,
    session_id: String,
) -> Result<(), String> {
    vnc_manager.close_session(&session_id)
}

#[tauri::command]
async fn vnc_get_dimensions(
    vnc_manager: State<'_, VncManagerState>,
    session_id: String,
) -> Result<(u16, u16), String> {
    vnc_manager.get_dimensions(&session_id)
}

// ============ RDP Commands ============

#[tauri::command]
async fn rdp_connect(
    app_handle: AppHandle,
    rdp_manager: State<'_, RdpManagerState>,
    host: String,
    port: u16,
    username: String,
    password: String,
    domain: Option<String>,
    width: u16,
    height: u16,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    rdp_manager.create_session(
        session_id.clone(),
        &host,
        port,
        &username,
        &password,
        domain.as_deref(),
        width,
        height,
    )?;

    rdp_manager.start_frame_reader(&session_id, app_handle)?;

    Ok(session_id)
}

#[tauri::command]
async fn rdp_send_input(
    rdp_manager: State<'_, RdpManagerState>,
    session_id: String,
    event: rdp::InputEvent,
) -> Result<(), String> {
    rdp_manager.send_input(&session_id, event)
}

#[tauri::command]
async fn rdp_disconnect(
    rdp_manager: State<'_, RdpManagerState>,
    session_id: String,
) -> Result<(), String> {
    rdp_manager.close_session(&session_id)
}

#[tauri::command]
async fn rdp_get_dimensions(
    rdp_manager: State<'_, RdpManagerState>,
    session_id: String,
) -> Result<(u16, u16), String> {
    rdp_manager.get_dimensions(&session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AppState::new()))
        .manage(SftpSessions::default())
        .manage(FtpSessions::default())
        .manage(VncManagerState::default())
        .manage(RdpManagerState::default())
        .invoke_handler(tauri::generate_handler![
            // Terminal
            create_terminal,
            create_ssh_terminal,
            write_terminal,
            resize_terminal,
            close_terminal,
            list_terminals,
            // Connections
            list_connections,
            get_connection,
            save_connection,
            save_ftp_connection,
            save_vnc_connection,
            save_rdp_connection,
            delete_connection,
            connect_saved,
            has_stored_password,
            keychain_get_password,
            // SFTP
            sftp_open,
            sftp_close,
            sftp_list_dir,
            sftp_get_current_path,
            sftp_realpath,
            sftp_mkdir,
            sftp_delete,
            sftp_rename,
            sftp_download,
            sftp_upload,
            sftp_upload_folder,
            // FTP
            ftp_connect,
            ftp_disconnect,
            ftp_list_dir,
            ftp_pwd,
            ftp_mkdir,
            ftp_delete,
            ftp_rename,
            ftp_download,
            ftp_upload,
            ftp_upload_folder,
            // Local File System
            local_list_dir,
            // VNC
            vnc_connect,
            vnc_send_input,
            vnc_disconnect,
            vnc_get_dimensions,
            // RDP
            rdp_connect,
            rdp_send_input,
            rdp_disconnect,
            rdp_get_dimensions,
            local_get_home_dir,
            local_get_downloads_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
