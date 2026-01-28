use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use parking_lot::Mutex;
use vnc::{Client, PixelFormat, Rect};

pub struct VncClient {
    client: Arc<Mutex<Client>>,
    width: u16,
    height: u16,
    connection_info: super::VncConnectionInfo,
}

impl VncClient {
    pub fn connect(
        host: &str,
        port: u16,
        password: Option<&str>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let tcp = TcpStream::connect(format!("{}:{}", host, port))?;
        tcp.set_nonblocking(false)?;

        let mut client = Client::from_tcp_stream(tcp, false, |_auth_methods| {
            if let Some(pwd) = password {
                // VNC password is DES-encrypted 8 bytes
                let mut key = [0u8; 8];
                let bytes = pwd.as_bytes();
                let len = bytes.len().min(8);
                key[..len].copy_from_slice(&bytes[..len]);
                Some(vnc::client::AuthChoice::Password(key))
            } else {
                Some(vnc::client::AuthChoice::None)
            }
        })?;

        // Get framebuffer info
        let width = client.size().0;
        let height = client.size().1;

        // Request preferred pixel format (RGBA)
        let pixel_format = PixelFormat {
            bits_per_pixel: 32,
            depth: 24,
            big_endian: false,
            true_colour: true,
            red_max: 255,
            green_max: 255,
            blue_max: 255,
            red_shift: 16,
            green_shift: 8,
            blue_shift: 0,
        };
        client.set_format(pixel_format)?;

        // Set encodings (prefer efficient ones)
        client.set_encodings(&[
            vnc::Encoding::Zrle,
            vnc::Encoding::CopyRect,
            vnc::Encoding::Raw,
        ])?;

        // Request initial screen update
        client.request_update(
            vnc::Rect {
                left: 0,
                top: 0,
                width,
                height,
            },
            false,
        )?;

        Ok(Self {
            client: Arc::new(Mutex::new(client)),
            width,
            height,
            connection_info: super::VncConnectionInfo {
                host: host.to_string(),
                port,
            },
        })
    }

    pub fn send_pointer_event(
        &self,
        x: u16,
        y: u16,
        button_mask: u8,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.lock();
        client.send_pointer_event(button_mask, x, y)?;
        Ok(())
    }

    pub fn send_key_event(
        &self,
        key: u32,
        down: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.lock();
        client.send_key_event(down, key)?;
        Ok(())
    }

    pub fn request_update(
        &self,
        incremental: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.lock();
        client.request_update(
            Rect {
                left: 0,
                top: 0,
                width: self.width,
                height: self.height,
            },
            incremental,
        )?;
        Ok(())
    }

    pub fn read_event(&self) -> Result<Option<Vec<u8>>, Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.lock();
        
        match client.poll_event() {
            Some(event) => {
                // Process event and return framebuffer data if available
                // For now, return None as placeholder - actual implementation would handle
                // framebuffer updates from the VNC server
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn width(&self) -> u16 {
        self.width
    }

    pub fn height(&self) -> u16 {
        self.height
    }

    pub fn connection_info(&self) -> &super::VncConnectionInfo {
        &self.connection_info
    }

    pub fn get_client(&self) -> Arc<Mutex<Client>> {
        self.client.clone()
    }
}
