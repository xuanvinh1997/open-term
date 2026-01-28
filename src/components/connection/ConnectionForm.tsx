import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useFtpStore } from "../../stores/ftpStore";
import { useVncStore } from "../../stores/vncStore";
import { useRdpStore } from "../../stores/rdpStore";
import { Button, Input, TextField } from "@heroui/react";
import { toast } from "sonner";
import type { AuthMethod } from "../../types";

interface ConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (sessionId: string) => void;
  onFtpConnected?: () => void;
  onVncConnected?: () => void;
  onRdpConnected?: () => void;
  defaultTab?: "ssh" | "ftp" | "vnc" | "rdp";
}

type AuthType = "password" | "publickey" | "agent";

export function ConnectionForm({
  open,
  onClose,
  onConnected,
  onFtpConnected,
  onVncConnected,
  onRdpConnected,
  defaultTab = "ssh",
}: ConnectionFormProps) {
  const [connectionType, setConnectionType] = useState<"ssh" | "ftp" | "vnc" | "rdp">(defaultTab);

  // SSH state
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<AuthType>("password");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveConnection, setSaveConnection] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FTP state
  const [ftpName, setFtpName] = useState("");
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState(21);
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [useAnonymous, setUseAnonymous] = useState(false);
  const [saveFtpConnection, setSaveFtpConnection] = useState(true);

  // VNC state
  const [vncName, setVncName] = useState("");
  const [vncHost, setVncHost] = useState("");
  const [vncPort, setVncPort] = useState(5900);
  const [vncPassword, setVncPassword] = useState("");
  const [saveVncConnection, setSaveVncConnection] = useState(true);

  // RDP state
  const [rdpName, setRdpName] = useState("");
  const [rdpHost, setRdpHost] = useState("");
  const [rdpPort, setRdpPort] = useState(3389);
  const [rdpUsername, setRdpUsername] = useState("");
  const [rdpPassword, setRdpPassword] = useState("");
  const [rdpDomain, setRdpDomain] = useState("");
  const [saveRdpConnection, setSaveRdpConnection] = useState(true);

  const { saveConnection: saveConn, saveFtpConnection: saveFtpConn, saveVncConnection: saveVncConn, saveRdpConnection: saveRdpConn, connectDirect } = useConnectionStore();
  const { connect: ftpConnect } = useFtpStore();
  const { connect: vncConnect } = useVncStore();
  const { connect: rdpConnect } = useRdpStore();

  const resetForm = () => {
    // SSH
    setName("");
    setHost("");
    setPort(22);
    setUsername("");
    setAuthType("password");
    setPassword("");
    setPrivateKeyPath("");
    setPassphrase("");
    setSaveConnection(false);
    setError(null);
    // FTP
    setFtpName("");
    setFtpHost("");
    setFtpPort(21);
    setFtpUsername("");
    setFtpPassword("");
    setUseAnonymous(false);
    setSaveFtpConnection(false);
    // VNC
    setVncName("");
    setVncHost("");
    setVncPort(5900);
    setVncPassword("");
    setSaveVncConnection(false);
    // RDP
    setRdpName("");
    setRdpHost("");
    setRdpPort(3389);
    setRdpUsername("");
    setRdpPassword("");
    setRdpDomain("");
    setSaveRdpConnection(false);
  };

  const handleClose = () => {
    if (!connecting) {
      resetForm();
      setConnectionType(defaultTab);
      onClose();
    }
  };

  const handleSshConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      let auth: AuthMethod;
      switch (authType) {
        case "password":
          auth = { type: "Password", password };
          break;
        case "publickey":
          auth = {
            type: "PublicKey",
            private_key_path: privateKeyPath,
            passphrase: passphrase || undefined,
          };
          break;
        case "agent":
          auth = { type: "Agent" };
          break;
      }

      // Save connection if requested
      if (saveConnection && name) {
        await saveConn(
          name,
          host,
          port,
          username,
          authType,
          authType === "publickey" ? privateKeyPath : undefined,
          authType === "password" ? password : undefined
        );
      }

      // Connect
      const sessionInfo = await connectDirect(host, port, username, auth);

      // Add SFTP tab (includes terminal) directly
      useTerminalStore.getState().addSftpTab({
        id: `sftp-${Date.now()}`,
        title: `SFTP: ${host}`,
        sessionId: sessionInfo.id,
        host: host,
        connectionName: saveConnection && name ? name : undefined,
        connectionId: undefined,
      });

      toast.success(`Connected to ${host}`);
      onConnected?.(sessionInfo.id);
      
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleFtpConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      // Save connection if requested
      if (saveFtpConnection && ftpName) {
        await saveFtpConn(
          ftpName,
          ftpHost,
          ftpPort,
          useAnonymous ? null : ftpUsername,
          useAnonymous ? null : ftpPassword,
          useAnonymous
        );
      }

      // Connect
      if (useAnonymous) {
        await ftpConnect(ftpHost, ftpPort);
      } else {
        await ftpConnect(ftpHost, ftpPort, ftpUsername, ftpPassword);
      }

      toast.success(`Successfully connected to ${ftpHost}`);
      onFtpConnected?.();
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleVncConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      // Save connection if requested
      if (saveVncConnection && vncName) {
        await saveVncConn(
          vncName,
          vncHost,
          vncPort,
          vncPassword || null
        );
      }

      // Connect
      const vncSessionId = await vncConnect(
        vncHost,
        vncPort,
        vncPassword || undefined
      );

      // Add VNC tab using the session ID from the backend
      useTerminalStore.getState().addVncTab({
        id: vncSessionId,
        title: saveVncConnection && vncName ? vncName : `${vncHost}:${vncPort}`,
        host: vncHost,
        width: 1024,
        height: 768,
      });

      toast.success(`Successfully connected to ${vncHost}`);
      onVncConnected?.();
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`VNC connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleRdpConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      // Save connection if requested
      if (saveRdpConnection && rdpName) {
        await saveRdpConn(
          rdpName,
          rdpHost,
          rdpPort,
          rdpUsername,
          rdpPassword || null,
          rdpDomain || null
        );
      }

      // Connect
      const rdpSessionId = await rdpConnect(
        rdpHost,
        rdpPort,
        rdpUsername,
        rdpPassword,
        rdpDomain || undefined,
        1920,
        1080
      );

      // Add RDP tab using the session ID from the backend
      useTerminalStore.getState().addRdpTab({
        id: rdpSessionId,
        title: saveRdpConnection && rdpName ? rdpName : `${rdpHost}:${rdpPort}`,
        host: rdpHost,
        width: 1920,
        height: 1080,
      });

      toast.success(`Successfully connected to ${rdpHost}`);
      onRdpConnected?.();
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`RDP connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'flex' : 'hidden'} items-center justify-center bg-black/50`}
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New Connection</h2>
        </div>
        
        <div className="p-6">
          {/* Tab Selection */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-700 mb-6">
            <button
              type="button"
              onClick={() => {
                setConnectionType("ssh");
                setError(null);
              }}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                connectionType === "ssh"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              SSH
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionType("ftp");
                setError(null);
              }}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                connectionType === "ftp"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              FTP
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionType("vnc");
                setError(null);
              }}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                connectionType === "vnc"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              VNC
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionType("rdp");
                setError(null);
              }}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                connectionType === "rdp"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              RDP
            </button>
          </div>

          {connectionType === "ssh" && (
            <form onSubmit={handleSshConnect} className="space-y-4">
              {error && connectionType === "ssh" && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <TextField className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-host">Host</label>
                <Input variant="secondary" 
                  id="ssh-host"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="hostname or IP"
                  required
                  autoFocus
                />
              </TextField>

              <div className="grid grid-cols-2 gap-3">
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-port">Port</label>
                  <Input variant="secondary" 
                    id="ssh-port"
                    type="number"
                    value={port.toString()}
                    onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                    min={1}
                    max={65535}
                  />
                </TextField>
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-username">Username</label>
                  <Input variant="secondary" 
                    id="ssh-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </TextField>
              </div>

              {/* Authentication */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Authentication</label>
                <div className="flex gap-4">
                  {(["password", "publickey", "agent"] as const).map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400"
                    >
                      <Input variant="secondary" 
                        type="radio"
                        name="authType"
                        value={type}
                        checked={authType === type}
                        onChange={() => setAuthType(type)}
                        className="cursor-pointer accent-primary"
                      />
                      {type === "password"
                        ? "Password"
                        : type === "publickey"
                          ? "Public Key"
                          : "SSH Agent"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Password field */}
              {authType === "password" && (
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-password">Password</label>
                  <Input variant="secondary" 
                    id="ssh-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </TextField>
              )}

              {/* Public key fields */}
              {authType === "publickey" && (
                <div className="space-y-4">
                  <TextField className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="privateKeyPath">Private Key Path</label>
                    <Input variant="secondary" 
                      id="privateKeyPath"
                      type="text"
                      value={privateKeyPath}
                      onChange={(e) => setPrivateKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                  </TextField>
                  <TextField className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="passphrase">Passphrase (optional)</label>
                    <Input variant="secondary" 
                      id="passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </TextField>
                </div>
              )}

              {/* Save connection checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                  <Input variant="secondary" 
                    type="checkbox"
                    checked={saveConnection}
                    onChange={(e) => setSaveConnection(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Save connection
                </label>
              </div>

              {/* Connection name (shown when save is checked) */}
              {saveConnection && (
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="connectionName">Connection Name</label>
                  <Input variant="secondary" 
                    id="connectionName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Server"
                    required={saveConnection}
                  />
                </TextField>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <Button
                  type="button"
                  // variant="light"
                  onClick={handleClose}
                  isDisabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button type="submit" isDisabled={connecting} className="min-w-[110px]">
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          )}

          {/* FTP Form */}
          {connectionType === "ftp" && (
            <form onSubmit={handleFtpConnect} className="space-y-4">
              {error && connectionType === "ftp" && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <TextField className="col-span-2 space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ftp-host">Host</label>
                  <Input variant="secondary" 
                    id="ftp-host"
                    type="text"
                    value={ftpHost}
                    onChange={(e) => setFtpHost(e.target.value)}
                    placeholder="ftp.example.com"
                    required
                  />
                </TextField>
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ftp-port">Port</label>
                  <Input variant="secondary" 
                    id="ftp-port"
                    type="number"
                    value={ftpPort.toString()}
                    onChange={(e) => setFtpPort(parseInt(e.target.value) || 21)}
                    min={1}
                    max={65535}
                  />
                </TextField>
              </div>

              {/* Anonymous checkbox */}
              <TextField className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                  <Input variant="secondary" 
                    type="checkbox"
                    checked={useAnonymous}
                    onChange={(e) => setUseAnonymous(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Anonymous login
                </label>
              </TextField>

              {!useAnonymous && (
                <>
                  <TextField className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ftp-username">Username</label>
                    <Input variant="secondary" 
                      id="ftp-username"
                      type="text"
                      value={ftpUsername}
                      onChange={(e) => setFtpUsername(e.target.value)}
                      placeholder="username"
                      required={!useAnonymous}
                    />
                  </TextField>

                  <TextField className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ftp-password">Password</label>
                    <Input variant="secondary" 
                      id="ftp-password"
                      type="password"
                      value={ftpPassword}
                      onChange={(e) => setFtpPassword(e.target.value)}
                      placeholder="password"
                      required={!useAnonymous}
                    />
                  </TextField>
                </>
              )}

              {/* Save connection checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                  <Input variant="secondary" 
                    type="checkbox"
                    checked={saveFtpConnection}
                    onChange={(e) => setSaveFtpConnection(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Save connection
                </label>
              </div>

              {/* Connection name (shown when save is checked) */}
              {saveFtpConnection && (
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ftp-connectionName">Connection Name</label>
                  <Input variant="secondary" 
                    id="ftp-connectionName"
                    type="text"
                    value={ftpName}
                    onChange={(e) => setFtpName(e.target.value)}
                    placeholder="My FTP Server"
                    required={saveFtpConnection}
                  />
                </TextField>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <Button
                  type="button"
                  // variant="light"
                  onClick={handleClose}
                  isDisabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isDisabled={connecting || !ftpHost}
                  className="min-w-[110px]"
                  // color="primary"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          )}

          {connectionType === "vnc" && (
            <form onSubmit={handleVncConnect} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <TextField className="space-y-2 col-span-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="vnc-host">Host</label>
                  <Input variant="secondary" 
                    id="vnc-host"
                    type="text"
                    value={vncHost}
                    onChange={(e) => setVncHost(e.target.value)}
                    placeholder="hostname or IP"
                    required
                    autoFocus
                  />
                </TextField>
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="vnc-port">Port</label>
                  <Input variant="secondary" 
                    id="vnc-port"
                    type="number"
                    value={vncPort.toString()}
                    onChange={(e) => setVncPort(parseInt(e.target.value) || 5900)}
                    min={1}
                    max={65535}
                  />
                </TextField>
              </div>

              <TextField className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="vnc-password">Password (optional)</label>
                <Input variant="secondary" 
                  id="vnc-password"
                  type="password"
                  value={vncPassword}
                  onChange={(e) => setVncPassword(e.target.value)}
                  placeholder="password"
                />
              </TextField>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                  <Input variant="secondary" 
                    type="checkbox"
                    checked={saveVncConnection}
                    onChange={(e) => setSaveVncConnection(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Save connection
                </label>
              </div>

              {saveVncConnection && (
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="vnc-connectionName">Connection Name</label>
                  <Input variant="secondary" 
                    id="vnc-connectionName"
                    type="text"
                    value={vncName}
                    onChange={(e) => setVncName(e.target.value)}
                    placeholder="My VNC Server"
                    required={saveVncConnection}
                  />
                </TextField>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <Button
                  type="button"
                  onClick={handleClose}
                  isDisabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isDisabled={connecting || !vncHost}
                  className="min-w-[110px]"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          )}

          {connectionType === "rdp" && (
            <form onSubmit={handleRdpConnect} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <TextField className="space-y-2 col-span-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-host">Host</label>
                  <Input variant="secondary" 
                    id="rdp-host"
                    type="text"
                    value={rdpHost}
                    onChange={(e) => setRdpHost(e.target.value)}
                    placeholder="hostname or IP"
                    required
                    autoFocus
                  />
                </TextField>
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-port">Port</label>
                  <Input variant="secondary" 
                    id="rdp-port"
                    type="number"
                    value={rdpPort.toString()}
                    onChange={(e) => setRdpPort(parseInt(e.target.value) || 3389)}
                    min={1}
                    max={65535}
                  />
                </TextField>
              </div>

              <TextField className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-username">Username</label>
                <Input variant="secondary" 
                  id="rdp-username"
                  type="text"
                  value={rdpUsername}
                  onChange={(e) => setRdpUsername(e.target.value)}
                  placeholder="username"
                  required
                />
              </TextField>

              <TextField className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-password">Password</label>
                <Input variant="secondary" 
                  id="rdp-password"
                  type="password"
                  value={rdpPassword}
                  onChange={(e) => setRdpPassword(e.target.value)}
                  placeholder="password"
                  required
                />
              </TextField>

              <TextField className="space-y-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-domain">Domain (optional)</label>
                <Input variant="secondary" 
                  id="rdp-domain"
                  type="text"
                  value={rdpDomain}
                  onChange={(e) => setRdpDomain(e.target.value)}
                  placeholder="DOMAIN"
                />
              </TextField>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                  <Input variant="secondary" 
                    type="checkbox"
                    checked={saveRdpConnection}
                    onChange={(e) => setSaveRdpConnection(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Save connection
                </label>
              </div>

              {saveRdpConnection && (
                <TextField className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="rdp-connectionName">Connection Name</label>
                  <Input variant="secondary" 
                    id="rdp-connectionName"
                    type="text"
                    value={rdpName}
                    onChange={(e) => setRdpName(e.target.value)}
                    placeholder="My RDP Server"
                    required={saveRdpConnection}
                  />
                </TextField>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <Button
                  type="button"
                  onClick={handleClose}
                  isDisabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isDisabled={connecting || !rdpHost || !rdpUsername || !rdpPassword}
                  className="min-w-[110px]"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
