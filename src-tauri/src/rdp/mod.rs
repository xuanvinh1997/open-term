mod client;
mod framebuffer;
mod input;
mod manager;

pub use client::RdpClient;
pub use framebuffer::FrameBuffer;
pub use input::InputEvent;
pub use manager::RdpManager;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdpConnectionInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub domain: Option<String>,
}
