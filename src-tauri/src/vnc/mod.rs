mod client;
mod framebuffer;
mod manager;

pub use client::VncClient;
pub use framebuffer::FrameBuffer;
pub use manager::VncManager;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VncConnectionInfo {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InputEvent {
    #[serde(rename = "pointer")]
    Pointer {
        x: u16,
        y: u16,
        button_mask: u8,
    },
    #[serde(rename = "key")]
    Key {
        key: u32,
        down: bool,
    },
}
