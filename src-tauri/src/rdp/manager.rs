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
            let mut last_input_time = std::time::Instant::now();
            let mut activity_detected = false;
            
            // More conservative frame rate: reduce from 75 FPS to reasonable levels
            let get_frame_interval = |has_activity: bool, has_changes: bool| {
                if has_activity || has_changes {
                    Duration::from_millis(50) // 20 FPS during activity (was 30 FPS)
                } else {
                    Duration::from_millis(200) // 5 FPS when static (was 10 FPS)
                }
            };
            
            eprintln!("RDP: Starting frame reader for session {} with adaptive frame rate", session_id);
            
            while client.is_connected() {
                // Check for recent input activity (within last 2 seconds)
                activity_detected = last_input_time.elapsed() < Duration::from_secs(2);
                
                // Process RDP events - collect dirty rectangles
                match client.process_events() {
                    Ok(Some(mut rects)) => {
                        // Accumulate dirty rectangles and coalesce overlapping ones
                        pending_rects.append(&mut rects);
                        pending_rects = Self::coalesce_dirty_rects(pending_rects);
                        activity_detected = true; // Visual changes indicate activity
                    }
                    Ok(None) => {
                        // No update from server - send initial full frame if needed
                        if frame_count == 0 {
                            let frame_data = client.get_frame();
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
                
                // Send accumulated dirty rectangles based on adaptive timing
                let has_changes = !pending_rects.is_empty();
                let frame_interval = get_frame_interval(activity_detected, has_changes);
                
                if has_changes && last_frame_time.elapsed() >= frame_interval {
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

    /// Coalesce overlapping dirty rectangles to reduce IPC overhead
    fn coalesce_dirty_rects(mut rects: Vec<super::DirtyRect>) -> Vec<super::DirtyRect> {
        if rects.len() <= 1 {
            return rects;
        }

        // Sort by position for better coalescing
        rects.sort_by(|a, b| a.y.cmp(&b.y).then(a.x.cmp(&b.x)));

        let mut result = Vec::new();
        let mut iter = rects.into_iter();
        let mut current = iter.next().unwrap();

        for rect in iter {
            // Check if rectangles are adjacent or overlapping
            if Self::can_merge_rects(&current, &rect) {
                current = Self::merge_rects(current, rect);
            } else {
                result.push(current);
                current = rect;
            }
        }
        result.push(current);

        result
    }

    /// Check if two dirty rectangles can be merged (adjacent or overlapping)
    fn can_merge_rects(a: &super::DirtyRect, b: &super::DirtyRect) -> bool {
        let a_right = a.x + a.width;
        let a_bottom = a.y + a.height;
        let b_right = b.x + b.width;
        let b_bottom = b.y + b.height;

        // Check for overlap or adjacency
        !(a_right < b.x || b_right < a.x || a_bottom < b.y || b_bottom < a.y)
    }

    /// Merge two dirty rectangles into a single rectangle
    fn merge_rects(a: super::DirtyRect, b: super::DirtyRect) -> super::DirtyRect {
        let min_x = a.x.min(b.x);
        let min_y = a.y.min(b.y);
        let max_x = (a.x + a.width).max(b.x + b.width);
        let max_y = (a.y + a.height).max(b.y + b.height);

        // For merged rectangles, we need to reconstruct the pixel data
        // For simplicity, we'll use the data from the larger rectangle
        let data = if a.data.len() >= b.data.len() { a.data } else { b.data };

        super::DirtyRect {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
            data,
        }
    }
}

impl Default for RdpManager {
    fn default() -> Self {
        Self::new()
    }
}
