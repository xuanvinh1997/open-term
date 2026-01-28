mod client;
mod framebuffer;
mod input;
mod manager;

pub use client::RdpClient;
pub use framebuffer::FrameBuffer;
pub use input::InputEvent;
pub use manager::RdpManager;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdpConnectionInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub domain: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum RdpQuality {
    /// Highest quality - lossless compression, full features
    High,
    /// Balanced quality vs performance
    Medium, 
    /// Prioritize performance over quality
    Fast,
}

impl Default for RdpQuality {
    fn default() -> Self {
        RdpQuality::High  // Default to high quality
    }
}

/// A dirty rectangle update - only the changed region
/// Uses Base64 encoding for efficient binary transfer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirtyRect {
    pub x: u16,
    pub y: u16,
    pub width: u16,
    pub height: u16,
    pub data: String, // Base64-encoded RGBA pixels (much smaller than number[])
}

impl DirtyRect {
    pub fn new(x: u16, y: u16, width: u16, height: u16, rgba_data: &[u8]) -> Self {
        Self {
            x,
            y,
            width,
            height,
            data: BASE64.encode(rgba_data),
        }
    }
}

/// Frame update type - either full frame or dirty rectangles
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FrameUpdate {
    /// Full frame update (used for initial frame)
    Full { width: u16, height: u16, data: String }, // Base64-encoded
    /// Partial update with dirty rectangles
    Partial { rects: Vec<DirtyRect> },
}

impl FrameUpdate {
    pub fn full(width: u16, height: u16, rgba_data: &[u8]) -> Self {
        Self::Full {
            width,
            height,
            data: BASE64.encode(rgba_data),
        }
    }
}
