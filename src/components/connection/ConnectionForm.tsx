import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import type { AuthMethod } from "../../types";
import "./ConnectionForm.css";

interface ConnectionFormProps {
  onClose: () => void;
  onConnected?: (sessionId: string) => void;
}

type AuthType = "password" | "publickey" | "agent";

export function ConnectionForm({ onClose, onConnected }: ConnectionFormProps) {
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

  const { saveConnection: saveConn, connectDirect } = useConnectionStore();

  const handleConnect = async (e: React.FormEvent) => {
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

      onConnected?.(sessionInfo.id);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connection-form-overlay">
      <div className="connection-form">
        <div className="form-header">
          <h2>New SSH Connection</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleConnect}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <label htmlFor="host">Host</label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="hostname or IP"
              required
            />
          </div>

          <div className="form-row form-row-split">
            <div>
              <label htmlFor="port">Port</label>
              <input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                min={1}
                max={65535}
              />
            </div>
            <div>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <label>Authentication</label>
            <div className="auth-options">
              <label className="radio-label">
                <input
                  type="radio"
                  name="authType"
                  value="password"
                  checked={authType === "password"}
                  onChange={() => setAuthType("password")}
                />
                Password
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="authType"
                  value="publickey"
                  checked={authType === "publickey"}
                  onChange={() => setAuthType("publickey")}
                />
                Public Key
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="authType"
                  value="agent"
                  checked={authType === "agent"}
                  onChange={() => setAuthType("agent")}
                />
                SSH Agent
              </label>
            </div>
          </div>

          {authType === "password" && (
            <div className="form-row">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {authType === "publickey" && (
            <>
              <div className="form-row">
                <label htmlFor="keyPath">Private Key Path</label>
                <input
                  id="keyPath"
                  type="text"
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_rsa"
                />
              </div>
              <div className="form-row">
                <label htmlFor="passphrase">Passphrase (optional)</label>
                <input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-row checkbox-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={saveConnection}
                onChange={(e) => setSaveConnection(e.target.checked)}
              />
              Save connection
            </label>
          </div>

          {saveConnection && (
            <div className="form-row">
              <label htmlFor="name">Connection Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                required={saveConnection}
              />
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
