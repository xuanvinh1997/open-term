use keyring::Entry;
use thiserror::Error;

const SERVICE_NAME: &str = "openterm";

#[derive(Error, Debug)]
pub enum KeychainError {
    #[error("Keychain error: {0}")]
    Keyring(String),
    #[error("Entry not found")]
    NotFound,
}

impl From<keyring::Error> for KeychainError {
    fn from(e: keyring::Error) -> Self {
        match e {
            keyring::Error::NoEntry => KeychainError::NotFound,
            _ => KeychainError::Keyring(e.to_string()),
        }
    }
}

pub struct KeychainManager;

impl KeychainManager {
    pub fn store_password(connection_id: &str, password: &str) -> Result<(), KeychainError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        entry.set_password(password)?;
        Ok(())
    }

    pub fn get_password(connection_id: &str) -> Result<String, KeychainError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        let password = entry.get_password()?;
        Ok(password)
    }

    pub fn delete_password(connection_id: &str) -> Result<(), KeychainError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        entry.delete_password()?;
        Ok(())
    }

    pub fn has_password(connection_id: &str) -> bool {
        Self::get_password(connection_id).is_ok()
    }
}
