import { useState } from "react";
import { useFtpStore } from "../../stores/ftpStore";

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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHost(e.target.value)}
            placeholder="ftp.example.com"
            required
            className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div className="form-group port-group">
          <label htmlFor="ftp-port">Port</label>
          <input 
            id="ftp-port"
            type="number"
            value={port}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPort(e.target.value)}
            placeholder="21"
            min="1"
            max="65535"
            required
            className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input 
            type="checkbox"
            checked={useAnonymous}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseAnonymous(e.target.checked)}
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
              placeholder="username"
              required={!useAnonymous}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="form-group">
            <label htmlFor="ftp-password">Password</label>
            <input 
              id="ftp-password"
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="password"
              className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-neutral-900 dark:text-neutral-100"
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
