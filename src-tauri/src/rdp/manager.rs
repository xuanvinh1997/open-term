use super::{InputEvent, RdpClient};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct RdpManager {
    sessions: Arc<Mutex<HashMap<String, Arc<RdpClient>>>>,
}

impl RdpManager {
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
        username: &str,
        password: &str,
        domain: Option<&str>,
        width: u16,
        height: u16,
    ) -> Result<(u16, u16), String> {
        let client = RdpClient::connect(host, port, username, password, domain, width, height)
            .map_err(|e| format!("RDP connection failed: {}", e))?;

        let w = client.width();
        let h = client.height();

        let client = Arc::new(client);
        self.sessions.lock().insert(session_id, client);

        Ok((w, h))
    }

    pub fn start_frame_reader(&self, session_id: &str, app_handle: AppHandle) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "RDP session not found".to_string())?
            .clone();

        let session_id = session_id.to_string();

        thread::spawn(move || {
            let mut frame_count = 0;
            let mut pending_update = false;
            let mut last_frame_time = std::time::Instant::now();
            let frame_interval = Duration::from_millis(50); // ~20 FPS max to reduce data transfer
            
            eprintln!("RDP: Starting frame reader for session {}", session_id);
            
            while client.is_connected() {
                // Process RDP events - this accumulates updates in the image buffer
                match client.process_events() {
                    Ok(Some(_)) => {
                        // Frame was updated, mark as pending
                        pending_update = true;
                    }
                    Ok(None) => {
                        // No update from server - send initial frame if needed
                        if frame_count == 0 {
                            let frame_data = client.get_frame();
                            let event_name = format!("rdp-frame-{}", session_id);
                            if let Err(e) = app_handle.emit(&event_name, &frame_data) {
                                eprintln!("RDP: Failed to emit initial frame: {}", e);
                            }
                            frame_count = 1;
                            last_frame_time = std::time::Instant::now();
                        }
                    }
                    Err(e) => {
                        eprintln!("RDP: Read error: {}", e);
                        let _ = app_handle.emit(&format!("rdp-error-{}", session_id), e);
                        break;
                    }
                }
                
                // Send pending update if enough time has passed (throttle frame rate)
                if pending_update && last_frame_time.elapsed() >= frame_interval {
                    let frame_data = client.get_frame();
                    let event_name = format!("rdp-frame-{}", session_id);
                    if let Err(e) = app_handle.emit(&event_name, &frame_data) {
                        eprintln!("RDP: Failed to emit frame: {}", e);
                        break;
                    }
                    pending_update = false;
                    frame_count += 1;
                    last_frame_time = std::time::Instant::now();
                    
                    if frame_count % 60 == 0 {
                        eprintln!("RDP: Sent {} frames for session {}", frame_count, session_id);
                    }
                }

                // Small sleep to prevent CPU spinning
                thread::sleep(Duration::from_millis(5));
            }
            
            eprintln!("RDP: Frame reader stopped for session {}", session_id);
        });

        Ok(())
    }

    pub fn send_input(&self, session_id: &str, event: InputEvent) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "RDP session not found".to_string())?;

        match event {
            InputEvent::MouseMove { x, y } => {
                client.send_mouse_move(x, y)?;
            }
            InputEvent::MouseButton { button, down, x, y } => {
                client.send_mouse_button(button, down, x, y)?;
            }
            InputEvent::MouseWheel { delta, x, y } => {
                client.send_mouse_wheel(delta, x, y)?;
            }
            InputEvent::Keyboard { scancode, down } => {
                client.send_keyboard(scancode, down)?;
            }
        }

        Ok(())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        if let Some(client) = sessions.remove(session_id) {
            client.disconnect();
        }
        Ok(())
    }

    pub fn get_dimensions(&self, session_id: &str) -> Result<(u16, u16), String> {
        let sessions = self.sessions.lock();
        let client = sessions
            .get(session_id)
            .ok_or_else(|| "RDP session not found".to_string())?;
        Ok((client.width(), client.height()))
    }
}

impl Default for RdpManager {
    fn default() -> Self {
        Self::new()
    }
}
