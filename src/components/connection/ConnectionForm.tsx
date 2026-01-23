import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useFtpStore } from "../../stores/ftpStore";
import { Button, Input, TextField } from "@heroui/react";
import { toast } from "sonner";
import type { AuthMethod } from "../../types";

interface ConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (sessionId: string) => void;
  onFtpConnected?: () => void;
  defaultTab?: "ssh" | "ftp";
}

type AuthType = "password" | "publickey" | "agent";

export function ConnectionForm({
  open,
  onClose,
  onConnected,
  onFtpConnected,
  defaultTab = "ssh",
}: ConnectionFormProps) {
  const [connectionType, setConnectionType] = useState<"ssh" | "ftp">(defaultTab);

  // SSH state
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<AuthType>("password");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveConnection, setSaveConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FTP state
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState(21);
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [useAnonymous, setUseAnonymous] = useState(false);

  const { saveConnection: saveConn, connectDirect } = useConnectionStore();
  const { connect: ftpConnect } = useFtpStore();

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
    setFtpHost("");
    setFtpPort(21);
    setFtpUsername("");
    setFtpPassword("");
    setUseAnonymous(false);
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

      // Add to terminal tabs
      useTerminalStore.setState((state) => ({
        tabs: [
          ...state.tabs,
          {
            id: sessionInfo.id,
            title: sessionInfo.title,
            sessionInfo,
          },
        ],
        activeTabId: sessionInfo.id,
      }));

      toast.success(`Successfully connected to ${host}`);
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
          </div>

          {connectionType === "ssh" && (
            <form onSubmit={handleSshConnect} className="space-y-4">
              {error && connectionType === "ssh" && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-port">Port</label>
                  <Input variant="secondary" 
                    id="ssh-port"
                    type="number"
                    value={port.toString()}
                    onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                    min={1}
                    max={65535}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-username">Username</label>
                  <Input variant="secondary" 
                    id="ssh-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="ssh-password">Password</label>
                  <Input variant="secondary" 
                    id="ssh-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {/* Public key fields */}
              {authType === "publickey" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="privateKeyPath">Private Key Path</label>
                    <Input variant="secondary" 
                      id="privateKeyPath"
                      type="text"
                      value={privateKeyPath}
                      onChange={(e) => setPrivateKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="passphrase">Passphrase (optional)</label>
                    <Input variant="secondary" 
                      id="passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="connectionName">Connection Name</label>
                  <Input variant="secondary" 
                    id="connectionName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Server"
                    required={saveConnection}
                  />
                </div>
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
        </div>
      </div>
    </div>
  );
}
