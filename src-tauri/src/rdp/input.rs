use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InputEvent {
    #[serde(rename = "mouse_move")]
    MouseMove { x: u16, y: u16 },
    #[serde(rename = "mouse_button")]
    MouseButton { button: u8, down: bool, x: u16, y: u16 },
    #[serde(rename = "mouse_wheel")]
    MouseWheel { delta: i16, x: u16, y: u16 },
    #[serde(rename = "keyboard")]
    Keyboard { scancode: u16, down: bool },
}

// Mouse button constants
pub const MOUSE_BUTTON_LEFT: u8 = 1;
pub const MOUSE_BUTTON_RIGHT: u8 = 2;
pub const MOUSE_BUTTON_MIDDLE: u8 = 3;

/// Input event batcher to reduce network overhead by grouping rapid events
pub struct InputBatcher {
    pending_events: Vec<InputEvent>,
    last_flush: Instant,
    max_batch_time: Duration,
    max_batch_size: usize,
    last_mouse_pos: Option<(u16, u16)>,
}

impl InputBatcher {
    pub fn new() -> Self {
        Self {
            pending_events: Vec::new(),
            last_flush: Instant::now(),
            max_batch_time: Duration::from_millis(16), // ~60 FPS max input rate
            max_batch_size: 10,
            last_mouse_pos: None,
        }
    }

    /// Add an event to the batch, returns true if should flush immediately
    pub fn add_event(&mut self, event: InputEvent) -> bool {
        // For mouse moves, only keep the latest position to reduce spam
        match &event {
            InputEvent::MouseMove { x, y } => {
                // Remove any previous mouse move events in the batch
                self.pending_events.retain(|e| !matches!(e, InputEvent::MouseMove { .. }));
                self.last_mouse_pos = Some((*x, *y));
            }
            _ => {
                // For other events, always add them
            }
        }

        self.pending_events.push(event);

        // Check if we should flush
        self.should_flush()
    }

    /// Check if the batch should be flushed
    pub fn should_flush(&self) -> bool {
        !self.pending_events.is_empty() && (
            self.pending_events.len() >= self.max_batch_size ||
            self.last_flush.elapsed() >= self.max_batch_time ||
            // Always flush immediately for critical events
            self.has_critical_events()
        )
    }

    /// Check if batch contains events that should not be delayed
    fn has_critical_events(&self) -> bool {
        self.pending_events.iter().any(|event| matches!(
            event,
            InputEvent::MouseButton { .. } | InputEvent::Keyboard { .. }
        ))
    }

    /// Get and clear all pending events
    pub fn flush(&mut self) -> Vec<InputEvent> {
        self.last_flush = Instant::now();
        std::mem::take(&mut self.pending_events)
    }

    /// Force flush if enough time has passed
    pub fn maybe_flush(&mut self) -> Vec<InputEvent> {
        if self.should_flush() {
            self.flush()
        } else {
            Vec::new()
        }
    }
}

impl Default for InputBatcher {
    fn default() -> Self {
        Self::new()
    }
}
