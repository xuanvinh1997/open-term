import { useState } from "react";
import { ConnectionManager } from "../connection/ConnectionManager";
import { ConnectionForm } from "../connection/ConnectionForm";
import { SftpBrowser } from "../sftp/SftpBrowser";
import { VscPlug, VscFolder } from "react-icons/vsc";
import "./Sidebar.css";

interface SidebarProps {
  activeSshSession: string | null;
}

export function Sidebar({ activeSshSession }: SidebarProps) {
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [showSftp, setShowSftp] = useState(false);
  const [activeTab, setActiveTab] = useState<"connections" | "sftp">("connections");

  const handleConnectionConnected = () => {
    setShowConnectionForm(false);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "connections" ? "active" : ""}`}
          onClick={() => setActiveTab("connections")}
          title="Connections"
        >
          <VscPlug />
        </button>
        <button
          className={`sidebar-tab ${activeTab === "sftp" ? "active" : ""}`}
          onClick={() => {
            if (activeSshSession) {
              setActiveTab("sftp");
              setShowSftp(true);
            }
          }}
          disabled={!activeSshSession}
          title={activeSshSession ? "SFTP Browser" : "Connect to SSH to use SFTP"}
        >
          <VscFolder />
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === "connections" && (
          <>
            {showConnectionForm ? (
              <ConnectionForm
                onClose={() => setShowConnectionForm(false)}
                onConnected={handleConnectionConnected}
              />
            ) : (
              <ConnectionManager
                onNewConnection={() => setShowConnectionForm(true)}
              />
            )}
          </>
        )}

        {activeTab === "sftp" && activeSshSession && showSftp && (
          <SftpBrowser
            sessionId={activeSshSession}
            onClose={() => {
              setShowSftp(false);
              setActiveTab("connections");
            }}
          />
        )}

        {activeTab === "sftp" && !activeSshSession && (
          <div className="sftp-placeholder">
            <p>Connect to an SSH server to browse files via SFTP.</p>
          </div>
        )}
      </div>
    </div>
  );
}
