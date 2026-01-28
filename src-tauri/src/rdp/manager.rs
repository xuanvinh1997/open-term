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
        quality: super::RdpQuality,
    ) -> Result<(u16, u16), String> {
        let client = RdpClient::connect(host, port, username, password, domain, width, height, quality)
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
        let width = client.width();
        let height = client.height();

        thread::spawn(move || {
            let mut frame_count = 0;
            let mut pending_rects: Vec<super::DirtyRect> = Vec::new();
            let mut last_frame_time = std::time::Instant::now();
            let frame_interval = Duration::from_millis(13); // ~75 FPS for dirty rects (Base64 is efficient)
            
            eprintln!("RDP: Starting frame reader for session {}", session_id);
            
            while client.is_connected() {
                // Process RDP events - collect dirty rectangles
                match client.process_events() {
                    Ok(Some(mut rects)) => {
                        // Accumulate dirty rectangles
                        pending_rects.append(&mut rects);
                    }
                    Ok(None) => {
                        // No update from server - send initial full frame if needed
                        if frame_count == 0 {
                            let frame_data = client.get_frame();
                            // Use Base64-encoded full frame
                            let update = super::FrameUpdate::full(width, height, &frame_data);
                            let event_name = format!("rdp-frame-{}", session_id);
                            if let Err(e) = app_handle.emit(&event_name, &update) {
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
                
                // Send accumulated dirty rectangles if enough time has passed
                if !pending_rects.is_empty() && last_frame_time.elapsed() >= frame_interval {
                    let update = super::FrameUpdate::Partial {
                        rects: std::mem::take(&mut pending_rects),
                    };
                    let event_name = format!("rdp-frame-{}", session_id);
                    if let Err(e) = app_handle.emit(&event_name, &update) {
                        eprintln!("RDP: Failed to emit frame update: {}", e);
                        break;
                    }
                    frame_count += 1;
                    last_frame_time = std::time::Instant::now();
                    
                    if frame_count % 100 == 0 {
                        eprintln!("RDP: Sent {} frame updates for session {}", frame_count, session_id);
                    }
                }

                // Minimal sleep - read timeout handles pacing
                thread::sleep(Duration::from_millis(1));
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
