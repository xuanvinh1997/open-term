use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthMethod {
    Password { password: String },
    PublicKey { private_key_path: String, passphrase: Option<String> },
    Agent,
}

impl AuthMethod {
    pub fn password(password: impl Into<String>) -> Self {
        Self::Password { password: password.into() }
    }

    pub fn public_key(private_key_path: impl Into<String>, passphrase: Option<String>) -> Self {
        Self::PublicKey {
            private_key_path: private_key_path.into(),
            passphrase,
        }
    }

    pub fn agent() -> Self {
        Self::Agent
    }
}

pub fn get_default_key_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let ssh_dir = home.join(".ssh");
        paths.push(ssh_dir.join("id_ed25519"));
        paths.push(ssh_dir.join("id_rsa"));
        paths.push(ssh_dir.join("id_ecdsa"));
        paths.push(ssh_dir.join("id_dsa"));
    }

    paths
}

pub fn find_default_key() -> Option<PathBuf> {
    get_default_key_paths()
        .into_iter()
        .find(|p| p.exists())
}
