use ironrdp_blocking::Framed;
use ironrdp_connector::{ClientConnector, Credentials, DesktopSize, ServerName};
use ironrdp_graphics::image_processing::PixelFormat;
use ironrdp_pdu::rdp::capability_sets::MajorPlatformType;
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
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("{}:{}", host, port);
        eprintln!("RDP: Connecting to {} as {}...", addr, username);

        // Create TCP connection
        let tcp_stream = TcpStream::connect(&addr)
            .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

        // Set read timeout to prevent blocking forever
        tcp_stream
            .set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| format!("Failed to set read timeout: {}", e))?;

        let client_addr = tcp_stream
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?;

        // Build connector config with all required fields
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
            bitmap: None,
            dig_product_id: String::new(),
            client_dir: String::new(),
            platform: MajorPlatformType::WINDOWS,
            hardware_id: None,
            request_data: None,
            autologon: true,
            enable_audio_playback: false,
            performance_flags: ironrdp_pdu::rdp::client_info::PerformanceFlags::default(),
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
    /// Returns the current RGBA frame data if there was an update
    pub fn process_events(&self) -> Result<Option<Vec<u8>>, String> {
        if !self.is_connected() {
            return Ok(None);
        }

        let mut framed = self.framed.lock();
        let mut active_stage = self.active_stage.lock();
        let mut image = self.image.lock();

        // Try to read a PDU (with timeout handling)
        let (action, payload) = match framed.read_pdu() {
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

        // Process the PDU
        let outputs = active_stage
            .process(&mut *image, action, &payload)
            .map_err(|e| format!("Failed to process PDU: {:?}", e))?;

        let mut frame_updated = false;

        for output in outputs {
            match output {
                ActiveStageOutput::ResponseFrame(frame) => {
                    // Send response back to server
                    framed
                        .write_all(&frame)
                        .map_err(|e| format!("Failed to write response: {}", e))?;
                }
                ActiveStageOutput::GraphicsUpdate(_region) => {
                    // Graphics were updated
                    frame_updated = true;
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

        // Return whether frame was updated (don't copy data here - get_frame will be called if needed)
        Ok(if frame_updated { Some(vec![]) } else { None })
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
        let mut active_stage = self.active_stage.lock();
        let mut image = self.image.lock();

        let outputs = active_stage
            .process_fastpath_input(&mut *image, &events)
            .map_err(|e| format!("Failed to process input: {:?}", e))?;

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

