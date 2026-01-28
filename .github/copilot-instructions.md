# Open-Term AI Agent Instructions

## Project Overview

Open-Term is a **Tauri v2 desktop application** for terminal emulation and remote file/desktop management (SSH/SFTP/FTP/VNC/RDP). The frontend is React + TypeScript + Vite, and the backend is Rust using Tauri's IPC system.

## Architecture

### Tauri IPC Pattern
- **Frontend → Backend**: Use `invoke("command_name", { params })` from `@tauri-apps/api/core`
- **Backend → Frontend**: Use `app_handle.emit("event-name", payload)` for streaming data
- All Tauri commands are in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) with `#[tauri::command]` macro

### State Management

**Frontend (Zustand stores):**
- [stores/connectionStore.ts](../src/stores/connectionStore.ts) - saved connections
- [stores/terminalStore.ts](../src/stores/terminalStore.ts) - terminal tabs
- [stores/sftpStore.ts](../src/stores/sftpStore.ts) - SFTP sessions
- [stores/ftpStore.ts](../src/stores/ftpStore.ts) - FTP sessions
- [stores/vncStore.ts](../src/stores/vncStore.ts) - VNC sessions
- [stores/rdpStore.ts](../src/stores/rdpStore.ts) - RDP sessions
- Pattern: Zustand stores call Tauri commands and update local state

**Backend (Rust):**
- [AppState](../src-tauri/src/state.rs) holds `TerminalManager` singleton
- `SftpSessions` and `FtpSessions` are `Arc<Mutex<HashMap>>` in [lib.rs](../src-tauri/src/lib.rs)
- `VncManager` and `RdpManager` are `Arc<Manager>` for remote desktop sessions
- Use `State<'_, Arc<AppState>>` in command signatures

### Terminal System

**Critical flow:**
1. Frontend creates session via `create_terminal()` or `create_ssh_terminal()` → Returns `SessionInfo` with ID
2. Backend spawns PTY ([terminal/pty.rs](../src-tauri/src/terminal/pty.rs)) and starts reader thread
3. Reader emits `terminal-output-{sessionId}` events with `Vec<u8>` payloads
4. Frontend ([useTerminalChannel.ts](../src/hooks/useTerminalChannel.ts)) listens to events and writes to xterm.js
5. User input: xterm.js → `writeToBackend()` → `invoke("write_terminal")` → PTY

**Session management:**
- UUIDs for session IDs
- Store in `TerminalManager.sessions` (`RwLock<HashMap>`)
- Clean up on close with `close_terminal` command

### SFTP/FTP Sessions

**Pattern differs from terminals:**
- SFTP: Persistent SSH2 connections stored in `SftpSessions` HashMap
- Commands: `sftp_open`, `sftp_list_dir`, `sftp_download`, `sftp_upload`
- Transfer progress uses events: `sftp-transfer-progress-{id}`
- Each session has separate ID from its parent SSH terminal


### VNC/RDP Remote Desktop Sessions

**Architecture differs from file transfer:**
- **VNC**: Uses `vnc` crate for RFB protocol, password-only auth
- **RDP**: Uses `ironrdp` crate (placeholder implementation), supports NLA/TLS
- Frame-based rendering: Backend emits `vnc-frame-{id}` / `rdp-frame-{id}` events with RGBA pixel data
- Frontend: Canvas element with `putImageData()` for rendering
- Input: Mouse (pointer/button/wheel) and keyboard events → Tauri commands → protocol-specific handlers
- Session management: `VncManager` and `RdpManager` with `Arc<Mutex<HashMap<String, Client>>>`

**Key differences:**
- Terminals: text-based (xterm.js), byte streams
- SFTP/FTP: file browser UI, directory listings
- VNC/RDP: pixel-based (canvas), frame buffers, input event translation
**FTP:** Similar pattern with `FtpSessions`, uses `suppaftp` crate.

## Key Conventions

### Tauri Command Naming
- Snake case: `create_terminal`, `sftp_list_dir`, `save_connection`
- Group by feature: `terminal_*`, `sftp_*`, `ftp_*`, `local_*`

### Type Definitions
- Shared types in [src/types/index.ts](../src/types/index.ts)
- Must match Rust serde types exactly (use `#[derive(Serialize, Deserialize)]`)
- Enums: Rust uses `#[serde(tag = "type")]` → TypeScript discriminated unions

Example:
```rust
// Rust
#[serde(tag = "type")]
pub enum SessionType {
    Local,
    Ssh { host: String, port: u16, username: String },
}
```
```typescript
// TypeScript
type SessionType = 
  | { type: "Local" }
  | { type: "Ssh"; host: string; port: number; username: string };
```

### Component Structure
- Feature-based folders: `components/terminal/`, `components/sftp/`, `components/ftp/`
- Each feature exports main component + index.ts barrel
- Use HeroUI components (`@heroui/react`) for UI primitives
- Theme: `next-themes` + Tailwind, use `useTheme()` hook

### Styling
- Tailwind CSS 4 with `@tailwindcss/postcss`
- Use `cn()` helper from [lib/utils.ts](../src/lib/utils.ts) for conditional classes
- Theme colors defined in HeroUI provider

### Storage
- **Connections**: JSON file in `~/.config/open-term/connections.json` ([storage/connections.rs](../src-tauri/src/storage/connections.rs))
- **Passwords**: System keychain via `keyring` crate ([storage/keychain.rs](../src-tauri/src/storage/keychain.rs))
- Migration logic handles old connection format

## Development Workflow

### Running the app:
```bash
yarn dev           # Frontend dev server on :1420
yarn tauri dev     # Full Tauri app (auto-runs yarn dev)
```

### Building:
```bash
yarn build         # Frontend build
yarn tauri build   # Create Linux packages (deb, rpm)
```

### Common pitfalls:
- **Event listeners**: Always unlisten in useEffect cleanup to prevent leaks
- **Async commands**: Tauri commands are async Rust but use `await invoke()` in TypeScript
- **Binary data**: Use `Vec<u8>` in Rust, `number[]` or `Uint8Array` in TypeScript
- **Session cleanup**: Call close commands to avoid resource leaks (SSH connections, PTYs)

### Error handling:
- Rust commands return `Result<T, String>` (String is error message)
- Fvnc` (vnc-rs) for VNC client
- `ironrdp` for RDP client (placeholder)
- `rontend catches with try/catch and shows toast via `sonner`
- Use `thiserror` crate for custom errors ([storage/connections.rs](../src-tauri/src/storage/connections.rs#L9))

## Dependencies

**Frontend:**
- `@xterm/xterm` + addons for terminal rendering
- `zustand` for state (no Redux)
- `react-resizable-panels` for layout splits
- `sonner` for toast notifications

**Backend:**
- `portable-pty` for local terminals
- `ssh2` for SSH/SFTP
- `suppaftp` for FTP
- `parking_lot` for faster mutexes
- `keyring` for secure password storage

## Quick Reference

**Adding a new Tauri command:**
1. Define in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) with `#[tauri::command]`
2. Add to `.invoke_handler()` in `run()` function
3. Call from frontend with `invoke("command_name", { params })`

**Creating a new store:**
1. Create `src/stores/featureStore.ts` with Zustand
2. Define state interface and actions
3. Import and use in components with `const { action } = useFeatureStore()`

**Emitting events from Rust:**
```rust
app_handle.emit(&format!("event-name-{id}"), payload)?;
```

**Listening in React:**
```typescript
const unlisten = await listen<PayloadType>('event-name', (event) => {
  // handle event.payload
});
return () => { unlisten(); }; // cleanup
```
