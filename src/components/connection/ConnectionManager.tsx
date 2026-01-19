import { useEffect, useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import type { ConnectionProfile } from "../../types";
import "./ConnectionManager.css";

interface ConnectionManagerProps {
  onNewConnection: () => void;
}

export function ConnectionManager({ onNewConnection }: ConnectionManagerProps) {
  const { connections, loading, loadConnections, deleteConnection, connectToSaved, hasStoredPassword } =
    useConnectionStore();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    connectionId: string;
    needsPassword: boolean;
    needsPassphrase: boolean;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const handleConnect = async (connection: ConnectionProfile) => {
    setError(null);

    // Check if we need to prompt for password/passphrase
    const hasPassword = await hasStoredPassword(connection.id);
    const needsPassword =
      connection.auth_method.auth_type === "Password" && !hasPassword;
    const needsPassphrase = connection.auth_method.auth_type === "PublicKey";

    if (needsPassword || needsPassphrase) {
      setPasswordPrompt({
        connectionId: connection.id,
        needsPassword,
        needsPassphrase,
      });
      return;
    }

    await doConnect(connection.id);
  };

  const doConnect = async (
    connectionId: string,
    pwd?: string,
    phrase?: string
  ) => {
    setConnectingId(connectionId);
    setError(null);

    try {
      const sessionInfo = await connectToSaved(connectionId, pwd, phrase);

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

      setPasswordPrompt(null);
      setPassword("");
      setPassphrase("");
    } catch (err) {
      setError(String(err));
    } finally {
      setConnectingId(null);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPrompt) return;

    await doConnect(
      passwordPrompt.connectionId,
      passwordPrompt.needsPassword ? password : undefined,
      passwordPrompt.needsPassphrase ? passphrase : undefined
    );
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this connection?")) {
      await deleteConnection(id);
    }
  };

  const formatAuthType = (authMethod: ConnectionProfile["auth_method"]) => {
    switch (authMethod.auth_type) {
      case "Password":
        return "Password";
      case "PublicKey":
        return "Key";
      case "Agent":
        return "Agent";
    }
  };

  return (
    <div className="connection-manager">
      <div className="connection-manager-header">
        <h3>Connections</h3>
        <button className="new-connection-btn" onClick={onNewConnection}>
          + New
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : connections.length === 0 ? (
        <div className="empty">
          <p>No saved connections</p>
        </div>
      ) : (
        <div className="connection-list">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`connection-item ${connectingId === conn.id ? "connecting" : ""}`}
              onClick={() => handleConnect(conn)}
            >
              <div className="connection-info">
                <div className="connection-name">{conn.name}</div>
                <div className="connection-details">
                  {conn.username}@{conn.host}:{conn.port} ({formatAuthType(conn.auth_method)})
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(conn.id, e)}
                title="Delete connection"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {passwordPrompt && (
        <div className="password-overlay">
          <div className="password-dialog">
            <h3>Authentication Required</h3>
            <form onSubmit={handlePasswordSubmit}>
              {passwordPrompt.needsPassword && (
                <div className="form-row">
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              {passwordPrompt.needsPassphrase && (
                <div className="form-row">
                  <label>Key Passphrase</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoFocus={!passwordPrompt.needsPassword}
                  />
                </div>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordPrompt(null);
                    setPassword("");
                    setPassphrase("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit">Connect</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
