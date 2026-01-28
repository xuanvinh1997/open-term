use ironrdp_blocking::Framed;
use ironrdp_connector::{ClientConnector, Credentials, DesktopSize, ServerName};
use ironrdp_graphics::image_processing::PixelFormat;
use ironrdp_pdu::rdp::capability_sets::{MajorPlatformType, BitmapCodecs, Codec, CodecProperty, RemoteFxContainer, RfxClientCapsContainer, RfxCaps, RfxCapset, RfxICap, RfxICapFlags, EntropyBits, CaptureFlags, NsCodec};
use ironrdp_session::image::DecodedImage;
use ironrdp_session::{ActiveStage, ActiveStageOutput};
use parking_lot::Mutex;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Stream wrapper type after TLS upgrade
type TlsFramed = Framed<native_tls::TlsStream<TcpStream>>;

/// A working RDP client using IronRDP
pub struct RdpClient {
    /// The active RDP session
    active_stage: Arc<Mutex<ActiveStage>>,
    /// Decoded image buffer (RGBA)
    image: Arc<Mutex<DecodedImage>>,
    /// Framed TLS stream for communication
    framed: Arc<Mutex<TlsFramed>>,
    /// Connection info
    connection_info: super::RdpConnectionInfo,
    /// Connection state
    connected: Arc<AtomicBool>,
    /// Desktop dimensions
    width: u16,
    height: u16,
}

// Safety: All internal types are wrapped in synchronization primitives
unsafe impl Sync for RdpClient {}
unsafe impl Send for RdpClient {}

impl RdpClient {
    pub fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        domain: Option<&str>,
        width: u16,
        height: u16,
        quality: super::RdpQuality,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("{}:{}", host, port);
        eprintln!("RDP: Connecting to {} as {}...", addr, username);

        // Create TCP connection
        let tcp_stream = TcpStream::connect(&addr)
            .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

        // Use blocking mode during connection handshake (no timeout)
        tcp_stream
            .set_read_timeout(None)
            .map_err(|e| format!("Failed to set read timeout: {}", e))?;

        let client_addr = tcp_stream
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?;

        // Performance flags based on quality preset
        use ironrdp_pdu::rdp::client_info::PerformanceFlags;
        let perf_flags = match quality {
            super::RdpQuality::Ultra => {
                // Ultra quality - all visual features enabled
                PerformanceFlags::ENABLE_FONT_SMOOTHING 
                    | PerformanceFlags::ENABLE_DESKTOP_COMPOSITION
            },
            super::RdpQuality::High => {
                // High quality - minimal performance flags
                PerformanceFlags::ENABLE_FONT_SMOOTHING 
                    | PerformanceFlags::ENABLE_DESKTOP_COMPOSITION
            },
            super::RdpQuality::Balanced => {
                // Balanced - some optimizations but keep visual quality
                PerformanceFlags::DISABLE_WALLPAPER
                    | PerformanceFlags::DISABLE_FULLWINDOWDRAG
                    | PerformanceFlags::ENABLE_FONT_SMOOTHING
                    | PerformanceFlags::ENABLE_DESKTOP_COMPOSITION
            },
            super::RdpQuality::Performance => {
                // Performance focused - aggressive optimizations
                PerformanceFlags::DISABLE_WALLPAPER
                    | PerformanceFlags::DISABLE_FULLWINDOWDRAG
                    | PerformanceFlags::DISABLE_MENUANIMATIONS
                    | PerformanceFlags::DISABLE_THEMING
                    | PerformanceFlags::ENABLE_FONT_SMOOTHING
            },
            super::RdpQuality::LowBandwidth => {
                // Maximum compression for low bandwidth
                PerformanceFlags::DISABLE_WALLPAPER
                    | PerformanceFlags::DISABLE_FULLWINDOWDRAG
                    | PerformanceFlags::DISABLE_MENUANIMATIONS
                    | PerformanceFlags::DISABLE_THEMING
                    | PerformanceFlags::DISABLE_CURSORSETTINGS
            },
        };

        // Build connector config with optimized settings
        let config = ironrdp_connector::Config {
            credentials: Credentials::UsernamePassword {
                username: username.to_string(),
                password: password.to_string(),
            },
            domain: domain.map(|s| s.to_string()),
            desktop_size: DesktopSize { width, height },
            desktop_scale_factor: 100,
            enable_tls: true,
            enable_credssp: true,
            client_build: 0,
            client_name: "OpenTerm".to_string(),
            keyboard_type: ironrdp_pdu::gcc::KeyboardType::IbmEnhanced,
            keyboard_subtype: 0,
            keyboard_functional_keys_count: 12,
            keyboard_layout: 0x409, // US English
            ime_file_name: String::new(),
            bitmap: Some(ironrdp_connector::BitmapConfig {
                lossy_compression: match quality {
                    super::RdpQuality::Ultra => false,        // Lossless for ultra quality
                    super::RdpQuality::High => false,         // Lossless for high quality
                    super::RdpQuality::Balanced => false,     // Lossless for balanced (NSCodec)
                    super::RdpQuality::Performance => true,   // Allow lossy for performance
                    super::RdpQuality::LowBandwidth => true,  // Lossy for bandwidth
                },
                color_depth: match quality {
                    super::RdpQuality::Ultra => 32,        // Full 32-bit color
                    super::RdpQuality::High => 32,         // Full 32-bit color
                    super::RdpQuality::Balanced => 24,     // Good 24-bit color
                    super::RdpQuality::Performance => 16,  // Fast 16-bit color
                    super::RdpQuality::LowBandwidth => 8,  // Low bandwidth 8-bit
                },
                codecs: Self::get_advanced_codecs(quality), // Use advanced codec configuration
            }),
            dig_product_id: String::new(),
            client_dir: String::new(),
            platform: MajorPlatformType::WINDOWS,
            hardware_id: None,
            request_data: None,
            autologon: true,
            enable_audio_playback: false,
            performance_flags: perf_flags,
            license_cache: None,
            timezone_info: ironrdp_pdu::rdp::client_info::TimezoneInfo::default(),
            enable_server_pointer: true,
            pointer_software_rendering: false,
        };

        // Create connector
        let mut connector = ClientConnector::new(config, client_addr);

        // Create framed transport
        let mut framed = Framed::new(tcp_stream);

        eprintln!("RDP: Starting connection sequence (before TLS)...");

        // Begin connection (before TLS upgrade)
        let should_upgrade = ironrdp_blocking::connect_begin(&mut framed, &mut connector)
            .map_err(|e| format!("Connection begin failed: {:?}", e))?;

        // Get the underlying stream and upgrade to TLS
        eprintln!("RDP: Upgrading to TLS...");
        let initial_stream = framed.into_inner_no_leftover();

        // Create TLS connector
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true) // Accept self-signed certs (common for RDP)
            .danger_accept_invalid_hostnames(true)
            .build()
            .map_err(|e| format!("Failed to create TLS connector: {}", e))?;

        let tls_stream = tls_connector
            .connect(host, initial_stream)
            .map_err(|e| format!("TLS handshake failed: {}", e))?;

        // Keep blocking mode for CredSSP/NLA handshake

        // Get server public key from TLS certificate
        let server_public_key = Self::extract_server_public_key(&tls_stream)?;

        let mut tls_framed = Framed::new(tls_stream);

        // Mark as upgraded
        let upgraded = ironrdp_blocking::mark_as_upgraded(should_upgrade, &mut connector);

        eprintln!("RDP: Finalizing connection (CredSSP/NLA)...");

        // Create a no-op network client for CredSSP (we don't do Kerberos)
        let mut network_client = NoopNetworkClient;
        let server_name = ServerName::new(host.to_string());

        // Finalize connection
        let connection_result = ironrdp_blocking::connect_finalize(
            upgraded,
            connector,
            &mut tls_framed,
            &mut network_client,
            server_name,
            server_public_key,
            None, // No Kerberos config
        )
        .map_err(|e| format!("Connection finalize failed: {:?}", e))?;

        let desktop_size = connection_result.desktop_size;
        eprintln!(
            "RDP: Connected! Desktop size: {}x{}",
            desktop_size.width, desktop_size.height
        );

        // NOW switch to short read timeout for responsive input handling
        // This is safe because the connection handshake is complete
        // We need to extract the stream, set timeout, and re-wrap it
        let tls_stream = tls_framed.into_inner_no_leftover();
        if let Err(e) = tls_stream.get_ref().set_read_timeout(Some(Duration::from_millis(50))) {
            eprintln!("RDP: Warning - failed to set read timeout: {}", e);
        }
        let tls_framed = Framed::new(tls_stream);

        // Create decoded image for frame buffer (RGBA format)
        let image = DecodedImage::new(PixelFormat::RgbA32, desktop_size.width, desktop_size.height);

        // Create active stage for processing RDP events
        let active_stage = ActiveStage::new(connection_result);

        Ok(Self {
            active_stage: Arc::new(Mutex::new(active_stage)),
            image: Arc::new(Mutex::new(image)),
            framed: Arc::new(Mutex::new(tls_framed)),
            connection_info: super::RdpConnectionInfo {
                host: host.to_string(),
                port,
                username: username.to_string(),
                domain: domain.map(|s| s.to_string()),
            },
            connected: Arc::new(AtomicBool::new(true)),
            width: desktop_size.width,
            height: desktop_size.height,
        })
    }

    /// Extract server's public key from TLS certificate
    fn extract_server_public_key(
        tls_stream: &native_tls::TlsStream<TcpStream>,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        use x509_cert::der::Decode;
        
        // Get the peer certificate
        let cert = tls_stream
            .peer_certificate()
            .map_err(|e| format!("Failed to get peer certificate: {}", e))?
            .ok_or_else(|| "No peer certificate available".to_string())?;

        // Get the DER-encoded certificate
        let der = cert
            .to_der()
            .map_err(|e| format!("Failed to get DER certificate: {}", e))?;

        // Parse the certificate using x509-cert
        let x509_cert = x509_cert::Certificate::from_der(&der)
            .map_err(|e| format!("Failed to parse certificate: {}", e))?;

        // Extract the SubjectPublicKeyInfo raw bytes
        let public_key = x509_cert
            .tbs_certificate
            .subject_public_key_info
            .subject_public_key
            .as_bytes()
            .ok_or_else(|| "Failed to extract public key bytes".to_string())?;

        Ok(public_key.to_vec())
    }

    /// Process incoming RDP events and update the framebuffer
    /// Returns dirty rectangles if there were updates
    pub fn process_events(&self) -> Result<Option<Vec<super::DirtyRect>>, String> {
        if !self.is_connected() {
            return Ok(None);
        }

        // Step 1: Read PDU with minimal lock scope - this is the blocking call
        let pdu_result = {
            let mut framed = self.framed.lock();
            framed.read_pdu()
        };

        let (action, payload) = match pdu_result {
            Ok(pdu) => pdu,
            Err(e) => {
                // Check for timeout (expected during normal operation)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut
                {
                    return Ok(None);
                }
                // Connection closed
                if e.kind() == std::io::ErrorKind::UnexpectedEof
                    || e.kind() == std::io::ErrorKind::ConnectionReset
                {
                    self.connected.store(false, Ordering::SeqCst);
                    return Err("Connection closed".to_string());
                }
                return Err(format!("Failed to read PDU: {}", e));
            }
        };

        // Step 2: Process the PDU
        let outputs = {
            let mut active_stage = self.active_stage.lock();
            let mut image = self.image.lock();
            active_stage
                .process(&mut *image, action, &payload)
                .map_err(|e| format!("Failed to process PDU: {:?}", e))?
        };

        let mut frame_updated = false;
        let mut responses: Vec<Vec<u8>> = Vec::new();
        let mut dirty_rects: Vec<super::DirtyRect> = Vec::new();

        for output in outputs {
            match output {
                ActiveStageOutput::ResponseFrame(frame) => {
                    // Collect responses to send later
                    responses.push(frame);
                }
                ActiveStageOutput::GraphicsUpdate(region) => {
                    // Graphics were updated - capture the dirty region
                    frame_updated = true;
                    
                    // Extract region data from image buffer
                    let image = self.image.lock();
                    let full_data = image.data();
                    let full_width = self.width as usize;
                    
                    let x = region.left as usize;
                    let y = region.top as usize;
                    let w = (region.right - region.left) as usize;
                    let h = (region.bottom - region.top) as usize;
                    
                    // Extract just the dirty region pixels
                    let mut rect_data = Vec::with_capacity(w * h * 4);
                    for row in y..(y + h) {
                        let start = (row * full_width + x) * 4;
                        let end = start + w * 4;
                        if end <= full_data.len() {
                            rect_data.extend_from_slice(&full_data[start..end]);
                        }
                    }
                    
                    // Use Base64-encoded DirtyRect
                    dirty_rects.push(super::DirtyRect::new(
                        region.left as u16,
                        region.top as u16,
                        w as u16,
                        h as u16,
                        &rect_data,
                    ));
                }
                ActiveStageOutput::PointerDefault | ActiveStageOutput::PointerHidden => {
                    // Pointer updates
                }
                ActiveStageOutput::PointerPosition { .. } => {
                    // Pointer position update
                }
                ActiveStageOutput::PointerBitmap(_) => {
                    // Custom cursor bitmap
                }
                ActiveStageOutput::Terminate(reason) => {
                    eprintln!("RDP: Session terminated: {:?}", reason);
                    self.connected.store(false, Ordering::SeqCst);
                    return Ok(None);
                }
                ActiveStageOutput::DeactivateAll(_reactivation) => {
                    eprintln!("RDP: Deactivation requested");
                    // Could handle reactivation here
                }
            }
        }

        // Step 3: Send responses back to server
        if !responses.is_empty() {
            let mut framed = self.framed.lock();
            for frame in responses {
                framed
                    .write_all(&frame)
                    .map_err(|e| format!("Failed to write response: {}", e))?;
            }
        }

        // Return dirty rectangles if there were updates
        Ok(if frame_updated && !dirty_rects.is_empty() {
            Some(dirty_rects)
        } else {
            None
        })
    }

    /// Send mouse movement event
    pub fn send_mouse_move(&self, x: u16, y: u16) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected".to_string());
        }

        use ironrdp_pdu::input::fast_path::FastPathInputEvent;
        use ironrdp_pdu::input::mouse::{MousePdu, PointerFlags};

        let event = FastPathInputEvent::MouseEvent(MousePdu {
            flags: PointerFlags::MOVE,
            number_of_wheel_rotation_units: 0,
            x_position: x,
            y_position: y,
        });

        self.send_fastpath_input(vec![event])
    }

    /// Send mouse button event
    pub fn send_mouse_button(&self, button: u8, down: bool, x: u16, y: u16) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected".to_string());
        }

        use ironrdp_pdu::input::fast_path::FastPathInputEvent;
        use ironrdp_pdu::input::mouse::{MousePdu, PointerFlags};

        let mut flags = if down {
            PointerFlags::DOWN
        } else {
            PointerFlags::empty()
        };

        // Map button to flags
        flags |= match button {
            1 => PointerFlags::LEFT_BUTTON,
            2 => PointerFlags::RIGHT_BUTTON,
            3 => PointerFlags::MIDDLE_BUTTON_OR_WHEEL,
            _ => PointerFlags::LEFT_BUTTON,
        };

        let event = FastPathInputEvent::MouseEvent(MousePdu {
            flags,
            number_of_wheel_rotation_units: 0,
            x_position: x,
            y_position: y,
        });

        self.send_fastpath_input(vec![event])
    }

    /// Send mouse wheel event
    pub fn send_mouse_wheel(&self, delta: i16, x: u16, y: u16) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected".to_string());
        }

        use ironrdp_pdu::input::fast_path::FastPathInputEvent;
        use ironrdp_pdu::input::mouse::{MousePdu, PointerFlags};

        let mut flags = PointerFlags::VERTICAL_WHEEL;
        if delta < 0 {
            flags |= PointerFlags::WHEEL_NEGATIVE;
        }

        let event = FastPathInputEvent::MouseEvent(MousePdu {
            flags,
            number_of_wheel_rotation_units: delta,
            x_position: x,
            y_position: y,
        });

        self.send_fastpath_input(vec![event])
    }

    /// Send keyboard event
    pub fn send_keyboard(&self, scancode: u16, down: bool) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected".to_string());
        }

        use ironrdp_pdu::input::fast_path::{FastPathInputEvent, KeyboardFlags};

        let mut flags = KeyboardFlags::empty();
        if !down {
            flags |= KeyboardFlags::RELEASE;
        }

        // Handle extended keys (scancodes > 0x7F typically need extended flag)
        let scancode = if scancode > 0x7F {
            flags |= KeyboardFlags::EXTENDED;
            scancode as u8
        } else {
            scancode as u8
        };

        let event = FastPathInputEvent::KeyboardEvent(flags, scancode);

        self.send_fastpath_input(vec![event])
    }

    fn send_fastpath_input(
        &self,
        events: Vec<ironrdp_pdu::input::fast_path::FastPathInputEvent>,
    ) -> Result<(), String> {
        // Process input events
        let outputs = {
            let mut active_stage = self.active_stage.lock();
            let mut image = self.image.lock();
            active_stage
                .process_fastpath_input(&mut *image, &events)
                .map_err(|e| format!("Failed to process input: {:?}", e))?
        };

        // Send responses (separate lock scope)
        let mut framed = self.framed.lock();
        for output in outputs {
            if let ActiveStageOutput::ResponseFrame(frame) = output {
                framed
                    .write_all(&frame)
                    .map_err(|e| format!("Failed to send input: {}", e))?;
            }
        }

        Ok(())
    }

    pub fn get_frame(&self) -> Vec<u8> {
        let image = self.image.lock();
        image.data().to_vec()
    }

    pub fn width(&self) -> u16 {
        self.width
    }

    pub fn height(&self) -> u16 {
        self.height
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub fn disconnect(&self) {
        self.connected.store(false, Ordering::SeqCst);
    }

    pub fn connection_info(&self) -> &super::RdpConnectionInfo {
        &self.connection_info
    }

    /// Configure codecs with conservative settings for stability
    fn get_advanced_codecs(quality: super::RdpQuality) -> ironrdp_pdu::rdp::capability_sets::BitmapCodecs {
        // Use default codecs for now to ensure compatibility
        // Advanced codec configuration can cause issues with some servers
        ironrdp_pdu::rdp::capability_sets::BitmapCodecs::default()
    }
}

/// No-op network client for CredSSP (used when Kerberos is not needed)
struct NoopNetworkClient;

impl ironrdp_connector::sspi::network_client::NetworkClient for NoopNetworkClient {
    fn send(
        &self,
        _request: &ironrdp_connector::sspi::generator::NetworkRequest,
    ) -> ironrdp_connector::sspi::Result<Vec<u8>> {
        // Return an error indicating no network is available
        Err(ironrdp_connector::sspi::Error::new(
            ironrdp_connector::sspi::ErrorKind::NoCredentials,
            "No network client available for Kerberos",
        ))
    }
}

