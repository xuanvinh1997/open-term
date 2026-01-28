use serde::{Deserialize, Serialize};

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
