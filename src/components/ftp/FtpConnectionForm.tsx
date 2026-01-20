import { useState } from "react";
import { useFtpStore } from "../../stores/ftpStore";
import "./FtpConnectionForm.css";

interface FtpConnectionFormProps {
  onConnected: () => void;
}

export function FtpConnectionForm({ onConnected }: FtpConnectionFormProps) {
  const { connect, loading, error } = useFtpStore();

  const [host, setHost] = useState("");
  const [port, setPort] = useState("21");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useAnonymous, setUseAnonymous] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (useAnonymous) {
        await connect(host, parseInt(port, 10));
      } else {
        await connect(host, parseInt(port, 10), username, password);
      }
      onConnected();
    } catch {
      // Error is handled in the store
    }
  };

  return (
    <form className="ftp-connection-form" onSubmit={handleSubmit}>
      <div className="form-title">FTP Connection</div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-row">
        <div className="form-group flex-grow">
          <label htmlFor="ftp-host">Host</label>
          <input
            id="ftp-host"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="ftp.example.com"
            required
          />
        </div>
        <div className="form-group port-group">
          <label htmlFor="ftp-port">Port</label>
          <input
            id="ftp-port"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="21"
            min="1"
            max="65535"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={useAnonymous}
            onChange={(e) => setUseAnonymous(e.target.checked)}
          />
          <span>Anonymous login</span>
        </label>
      </div>

      {!useAnonymous && (
        <>
          <div className="form-group">
            <label htmlFor="ftp-username">Username</label>
            <input
              id="ftp-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              required={!useAnonymous}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ftp-password">Password</label>
            <input
              id="ftp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
            />
          </div>
        </>
      )}

      <button type="submit" className="connect-btn" disabled={loading || !host}>
        {loading ? "Connecting..." : "Connect"}
      </button>
    </form>
  );
}
