import { useState } from "react";
import { ConnectionManager } from "../connection/ConnectionManager";
import { ConnectionForm } from "../connection/ConnectionForm";
import { SftpBrowser } from "../sftp/SftpBrowser";
import { FtpBrowser } from "../ftp";
import { useFtpStore } from "../../stores/ftpStore";
import { VscPlug, VscFolder, VscCloud } from "react-icons/vsc";
import { Button } from "@/components/ui/button";
import "./Sidebar.css";

interface SidebarProps {
  activeSshSession: string | null;
}

export function Sidebar({ activeSshSession }: SidebarProps) {
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionFormDefaultTab, setConnectionFormDefaultTab] = useState<"ssh" | "ftp">("ssh");
  const [showSftp, setShowSftp] = useState(false);
  const [activeTab, setActiveTab] = useState<"connections" | "sftp" | "ftp">("connections");
  const ftpId = useFtpStore((state) => state.ftpId);

  const handleConnectionConnected = () => {
    setShowConnectionForm(false);
  };

  const handleFtpConnected = () => {
    setShowConnectionForm(false);
    setActiveTab("ftp");
  };

  const openConnectionForm = (defaultTab: "ssh" | "ftp" = "ssh") => {
    setConnectionFormDefaultTab(defaultTab);
    setShowConnectionForm(true);
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
        <button
          className={`sidebar-tab ${activeTab === "ftp" ? "active" : ""}`}
          onClick={() => setActiveTab("ftp")}
          title="FTP Browser"
        >
          <VscCloud />
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === "connections" && (
          <ConnectionManager
            onNewConnection={() => openConnectionForm("ssh")}
          />
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

        {activeTab === "ftp" && ftpId && (
          <FtpBrowser
            onClose={() => {
              setActiveTab("connections");
            }}
          />
        )}

        {activeTab === "ftp" && !ftpId && (
          <div className="ftp-placeholder">
            <p className="text-muted-foreground text-sm mb-4">
              Connect to an FTP server to browse files.
            </p>
            <Button
              size="sm"
              onClick={() => openConnectionForm("ftp")}
            >
              Connect to FTP
            </Button>
          </div>
        )}
      </div>

      {/* Connection Form Modal */}
      <ConnectionForm
        open={showConnectionForm}
        onClose={() => setShowConnectionForm(false)}
        onConnected={handleConnectionConnected}
        onFtpConnected={handleFtpConnected}
        defaultTab={connectionFormDefaultTab}
      />
    </div>
  );
}
