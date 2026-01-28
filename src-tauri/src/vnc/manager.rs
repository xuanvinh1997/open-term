use super::{InputEvent, VncClient};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct VncManager {
    sessions: Arc<Mutex<HashMap<String, Arc<VncClient>>>>,
}

impl VncManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_session(
        &self,
        session_id: String,
        host: &str,
        port: u16,
        password: Option<&str>,
    ) -> Result<(u16, u16), String> {
        let client = VncClient::connect(host, port, password)
            .map_err(|e| format!("VNC connection failed: {}", e))?;

        let width = client.width();
        let height = client.height();

        let client = Arc::new(client);
        self.sessions.lock().insert(session_id.clone(), client);

        Ok((width, height))
    }

    pub fn start_frame_reader(&self, session_id: &str, app_handle: AppHandle) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "VNC session not found".to_string())?
            .clone();

        let session_id = session_id.to_string();

        thread::spawn(move || {
            loop {
                // Request incremental update
                if let Err(e) = client.request_update(true) {
                    eprintln!("Failed to request VNC update: {}", e);
                    let _ = app_handle.emit(&format!("vnc-error-{}", session_id), format!("{}", e));
                    break;
                }

                // Read and emit frame data
                match client.read_event() {
                    Ok(Some(frame_data)) => {
                        let _ = app_handle.emit(&format!("vnc-frame-{}", session_id), frame_data);
                    }
                    Ok(None) => {
                        // No update, continue
                    }
                    Err(e) => {
                        eprintln!("VNC read error: {}", e);
                        let _ = app_handle.emit(&format!("vnc-error-{}", session_id), format!("{}", e));
                        break;
                    }
                }

                // Small delay to avoid busy loop
                thread::sleep(Duration::from_millis(16)); // ~60 FPS
            }
        });

        Ok(())
    }

    pub fn send_input(
        &self,
        session_id: &str,
        event: InputEvent,
    ) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "VNC session not found".to_string())?;

        match event {
            InputEvent::Pointer { x, y, button_mask } => {
                client
                    .send_pointer_event(x, y, button_mask)
                    .map_err(|e| e.to_string())?;
            }
            InputEvent::Key { key, down } => {
                client
                    .send_key_event(key, down)
                    .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        self.sessions.lock().remove(session_id);
        Ok(())
    }

    pub fn get_dimensions(&self, session_id: &str) -> Result<(u16, u16), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "VNC session not found".to_string())?;
        Ok((client.width(), client.height()))
    }
}

impl Default for VncManager {
    fn default() -> Self {
        Self::new()
    }
}
