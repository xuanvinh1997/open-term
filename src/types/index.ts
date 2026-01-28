export type SessionType =
  | { type: "Local" }
  | { type: "Ssh"; host: string; port: number; username: string }
  | { type: "Ftp"; host: string; port: number; username?: string }
  | { type: "Vnc"; host: string; port: number }
  | { type: "Rdp"; host: string; port: number; username: string };

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

export interface FtpTab {
  id: string;
  title: string;
  host: string;
  connectionName?: string;
  connectionId?: string;
}

export interface SftpTab {
  id: string;
  title: string;
  sessionId: string;
  host: string;
  connectionName?: string;
  connectionId?: string;
}

export interface VncTab {
  id: string;
  title: string;
  host: string;
  width: number;
  height: number;
  connectionName?: string;
  connectionId?: string;
}

export interface RdpTab {
  id: string;
  title: string;
  host: string;
  width: number;
  height: number;
  connectionName?: string;
  connectionId?: string;
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
    }
  | {
      connection_type: "vnc";
      host: string;
      port: number;
    }
  | {
      connection_type: "rdp";
      host: string;
      port: number;
      username: string;
      domain: string | null;
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

// VNC types
export type VncInputEvent =
  | { type: "pointer"; x: number; y: number; button_mask: number }
  | { type: "key"; key: number; down: boolean };

// RDP types
export type RdpQuality = 
  | "Ultra"       // 32-bit, lossless, RemoteFX + NSCodec
  | "High"        // 32-bit, minimal loss, RemoteFX
  | "Balanced"    // 24-bit, NSCodec + RFX
  | "Performance" // 16-bit, aggressive compression
  | "LowBandwidth"; // 8-bit, maximum compression

export type RdpInputEvent =
  | { type: "mouse_move"; x: number; y: number }
  | { type: "mouse_button"; button: number; down: boolean; x: number; y: number }
  | { type: "mouse_wheel"; delta: number; x: number; y: number }
  | { type: "keyboard"; scancode: number; down: boolean };

// RDP frame update types - for efficient dirty rectangle updates
export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
  data: string; // Base64-encoded RGBA pixels
}

export type FrameUpdate =
  | { type: "Full"; width: number; height: number; data: string } // Base64-encoded
  | { type: "Partial"; rects: DirtyRect[] };

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
