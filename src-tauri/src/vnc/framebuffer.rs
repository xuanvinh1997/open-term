pub struct FrameBuffer {
    pub width: u16,
    pub height: u16,
    pub data: Vec<u8>, // RGBA format
}

impl FrameBuffer {
    pub fn new(width: u16, height: u16) -> Self {
        let size = (width as usize) * (height as usize) * 4;
        Self {
            width,
            height,
            data: vec![0; size],
        }
    }

    pub fn update_rect(&mut self, x: u16, y: u16, width: u16, height: u16, data: &[u8]) {
        for row in 0..height {
            let src_offset = (row as usize) * (width as usize) * 4;
            let dst_offset = ((y + row) as usize * self.width as usize + x as usize) * 4;
            let len = (width as usize) * 4;

            if src_offset + len <= data.len() && dst_offset + len <= self.data.len() {
                self.data[dst_offset..dst_offset + len]
                    .copy_from_slice(&data[src_offset..src_offset + len]);
            }
        }
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.data
    }
}
