use crate::terminal::TerminalManager;
use std::sync::Arc;

pub struct AppState {
    pub terminal_manager: Arc<TerminalManager>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            terminal_manager: Arc::new(TerminalManager::new()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
