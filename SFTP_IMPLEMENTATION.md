# SFTP Tab Implementation

## Changes Made

### 1. Type Definitions (src/types/index.ts)
- Added `SftpTab` interface after `FtpTab`

### 2. Terminal Store (src/stores/terminalStore.ts)
- Added `sftpTabs: SftpTab[]` to state
- Added `addSftpTab` and `closeSftpTab` actions
- Updated close handlers to consider sftpTabs

### 3. Terminal Tabs (src/components/terminal/TerminalTabs.tsx)
- Imported SftpBrowser and useSftpStore
- Added SFTP tab rendering
- Added SFTP icon (VscFolder)
- Updated close handlers

### 4. Connection Handling
- ConnectionForm: Added SFTP tab creation after SSH connection
- ConnectionManager: Added SFTP tab creation for saved connections
