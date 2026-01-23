use crate::ssh::AuthMethod;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Connection not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "auth_type")]
pub enum StoredAuthMethod {
    Password,
    PublicKey { private_key_path: String },
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "connection_type")]
pub enum ConnectionType {
    #[serde(rename = "ssh")]
    Ssh {
        host: String,
        port: u16,
        username: String,
        auth_method: StoredAuthMethod,
    },
    #[serde(rename = "ftp")]
    Ftp {
        host: String,
        port: u16,
        username: Option<String>,
        anonymous: bool,
    },
}

// Old format for backward compatibility
#[derive(Debug, Clone, Deserialize)]
struct OldConnectionProfile {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_method: StoredAuthMethod,
    created_at: DateTime<Utc>,
    last_used: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub connection_type: ConnectionType,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
}

impl<'de> Deserialize<'de> for ConnectionProfile {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum ProfileFormat {
            New(NewFormat),
            Old(OldConnectionProfile),
        }

        #[derive(Deserialize)]
        struct NewFormat {
            id: String,
            name: String,
            #[serde(flatten)]
            connection_type: ConnectionType,
            created_at: DateTime<Utc>,
            last_used: Option<DateTime<Utc>>,
        }

        match ProfileFormat::deserialize(deserializer)? {
            ProfileFormat::New(new) => Ok(ConnectionProfile {
                id: new.id,
                name: new.name,
                connection_type: new.connection_type,
                created_at: new.created_at,
                last_used: new.last_used,
            }),
            ProfileFormat::Old(old) => {
                // Convert old format to new format (assume SSH)
                Ok(ConnectionProfile {
                    id: old.id,
                    name: old.name,
                    connection_type: ConnectionType::Ssh {
                        host: old.host,
                        port: old.port,
                        username: old.username,
                        auth_method: old.auth_method,
                    },
                    created_at: old.created_at,
                    last_used: old.last_used,
                })
            }
        }
    }
}

impl ConnectionProfile {
    pub fn new_ssh(
        name: String,
        host: String,
        port: u16,
        username: String,
        auth_method: StoredAuthMethod,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            connection_type: ConnectionType::Ssh {
                host,
                port,
                username,
                auth_method,
            },
            created_at: Utc::now(),
            last_used: None,
        }
    }

    pub fn new_ftp(
        name: String,
        host: String,
        port: u16,
        username: Option<String>,
        anonymous: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            connection_type: ConnectionType::Ftp {
                host,
                port,
                username,
                anonymous,
            },
            created_at: Utc::now(),
            last_used: None,
        }
    }

    pub fn to_auth_method(&self, password: Option<String>, passphrase: Option<String>) -> AuthMethod {
        match &self.connection_type {
            ConnectionType::Ssh { auth_method, .. } => match auth_method {
                StoredAuthMethod::Password => {
                    AuthMethod::Password {
                        password: password.unwrap_or_default(),
                    }
                }
                StoredAuthMethod::PublicKey { private_key_path } => {
                    AuthMethod::PublicKey {
                        private_key_path: private_key_path.clone(),
                        passphrase,
                    }
                }
                StoredAuthMethod::Agent => AuthMethod::Agent,
            },
            ConnectionType::Ftp { .. } => {
                // FTP connections don't use SSH auth
                AuthMethod::Password {
                    password: password.unwrap_or_default(),
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ConnectionsFile {
    connections: HashMap<String, ConnectionProfile>,
}

pub struct ConnectionStorage {
    file_path: PathBuf,
}

impl ConnectionStorage {
    pub fn new() -> Result<Self, StorageError> {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("openterm");

        fs::create_dir_all(&config_dir)?;

        let file_path = config_dir.join("connections.json");

        // Create file if it doesn't exist
        if !file_path.exists() {
            let empty = ConnectionsFile::default();
            let json = serde_json::to_string_pretty(&empty)?;
            fs::write(&file_path, json)?;
        }

        Ok(Self { file_path })
    }

    fn load(&self) -> Result<ConnectionsFile, StorageError> {
        let content = fs::read_to_string(&self.file_path)?;
        let data: ConnectionsFile = serde_json::from_str(&content)?;
        Ok(data)
    }

    fn save(&self, data: &ConnectionsFile) -> Result<(), StorageError> {
        let json = serde_json::to_string_pretty(data)?;
        fs::write(&self.file_path, json)?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<ConnectionProfile>, StorageError> {
        let data = self.load()?;
        let mut connections: Vec<_> = data.connections.into_values().collect();
        connections.sort_by(|a, b| {
            // Sort by last_used (most recent first), then by name
            match (&b.last_used, &a.last_used) {
                (Some(b_time), Some(a_time)) => b_time.cmp(a_time),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.name.cmp(&b.name),
            }
        });
        Ok(connections)
    }

    pub fn get(&self, id: &str) -> Result<ConnectionProfile, StorageError> {
        let data = self.load()?;
        data.connections
            .get(id)
            .cloned()
            .ok_or_else(|| StorageError::NotFound(id.to_string()))
    }

    pub fn save_connection(&self, profile: ConnectionProfile) -> Result<(), StorageError> {
        let mut data = self.load()?;
        data.connections.insert(profile.id.clone(), profile);
        self.save(&data)
    }

    pub fn update_last_used(&self, id: &str) -> Result<(), StorageError> {
        let mut data = self.load()?;
        if let Some(profile) = data.connections.get_mut(id) {
            profile.last_used = Some(Utc::now());
            self.save(&data)?;
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), StorageError> {
        let mut data = self.load()?;
        data.connections.remove(id);
        self.save(&data)
    }
}

impl Default for ConnectionStorage {
    fn default() -> Self {
        Self::new().expect("Failed to create connection storage")
    }
}
