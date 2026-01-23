export type SessionType =
  | { type: "Local" }
  | { type: "Ssh"; host: string; port: number; username: string };

export interface SessionInfo {
  id: string;
  session_type: SessionType;
  title: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  sessionInfo: SessionInfo;
}

// Auth types
export type AuthMethod =
  | { type: "Password"; password: string }
  | { type: "PublicKey"; private_key_path: string; passphrase?: string }
  | { type: "Agent" };

export type StoredAuthMethod =
  | { auth_type: "Password" }
  | { auth_type: "PublicKey"; private_key_path: string }
  | { auth_type: "Agent" };

// Connection types
export type ConnectionType =
  | {
      connection_type: "ssh";
      host: string;
      port: number;
      username: string;
      auth_method: StoredAuthMethod;
    }
  | {
      connection_type: "ftp";
      host: string;
      port: number;
      username: string | null;
      anonymous: boolean;
    };

export interface ConnectionProfile {
  id: string;
  name: string;
  connection_type: ConnectionType["connection_type"];
  host: string;
  port: number;
  username?: string;
  auth_method?: StoredAuthMethod;
  anonymous?: boolean;
  created_at: string;
  last_used: string | null;
}

// SFTP types
export type FileType = "File" | "Directory" | "Symlink" | "Other";

export interface FileEntry {
  name: string;
  path: string;
  file_type: FileType;
  size: number;
  modified: number | null;
  permissions: number | null;
}

export type TransferStatus =
  | "Pending"
  | "InProgress"
  | "Completed"
  | { Failed: string }
  | "Cancelled";

export interface TransferProgress {
  id: string;
  filename: string;
  local_path: string;
  remote_path: string;
  is_upload: boolean;
  total_bytes: number;
  transferred_bytes: number;
  status: TransferStatus;
}
