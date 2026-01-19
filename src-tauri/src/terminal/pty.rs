use portable_pty::{native_pty_system, CommandBuilder, PtySize, Child, MasterPty, SlavePty};
use std::io::{Read, Write};
use std::sync::Arc;
use parking_lot::Mutex;

pub struct PtyHandle {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    slave: Arc<Mutex<Box<dyn SlavePty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    reader: Arc<Mutex<Box<dyn Read + Send>>>,
    child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
}

// Safety: We wrap all non-Sync types in Mutex which makes them Sync
unsafe impl Sync for PtyHandle {}

impl PtyHandle {
    pub fn new(cols: u16, rows: u16) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let pty_system = native_pty_system();

        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let writer = pair.master.take_writer()?;
        let reader = pair.master.try_clone_reader()?;

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            slave: Arc::new(Mutex::new(pair.slave)),
            writer: Arc::new(Mutex::new(writer)),
            reader: Arc::new(Mutex::new(reader)),
            child: Arc::new(Mutex::new(None)),
        })
    }

    pub fn spawn_shell(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let shell = if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        let mut cmd = CommandBuilder::new(&shell);

        if !cfg!(target_os = "windows") {
            cmd.arg("-l"); // Login shell on Unix
        }

        let slave = self.slave.lock();
        let child = slave.spawn_command(cmd)?;
        *self.child.lock() = Some(child);

        Ok(())
    }

    pub fn write(&self, data: &[u8]) -> Result<usize, std::io::Error> {
        let mut writer = self.writer.lock();
        let written = writer.write(data)?;
        writer.flush()?;
        Ok(written)
    }

    pub fn read(&self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        let mut reader = self.reader.lock();
        reader.read(buf)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let master = self.master.lock();
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn get_reader(&self) -> Arc<Mutex<Box<dyn Read + Send>>> {
        self.reader.clone()
    }
}
