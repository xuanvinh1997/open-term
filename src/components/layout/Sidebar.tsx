import { useState } from "react";
import { ConnectionManager } from "../connection/ConnectionManager";
import { ConnectionForm } from "../connection/ConnectionForm";
import { SftpBrowser } from "../sftp/SftpBrowser";
import { FtpBrowser } from "../ftp";
import { useFtpStore } from "../../stores/ftpStore";
import { VscPlug, VscFolder, VscCloud } from "react-icons/vsc";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";

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

  const tabClass = (isActive: boolean) => cn(
    "w-[52px] h-[44px] flex items-center justify-center bg-transparent border-0 cursor-pointer transition-all border-l-2 my-0.5 text-foreground",
    isActive 
      ? "opacity-100 bg-[var(--card)] border-l-[var(--primary)]" 
      : "opacity-50 border-l-transparent hover:opacity-100 hover:bg-[#333]",
    "disabled:opacity-25 disabled:cursor-not-allowed"
  );

  return (
    <div className="flex w-full h-full min-w-0 overflow-hidden bg-[var(--card)]">
      <div className="flex flex-col shrink-0 w-[52px] bg-neutral-900 border-r border-[#3c3c3c] pt-1">
        <button
          className={tabClass(activeTab === "connections")}
          onClick={() => {
            setActiveTab("connections");
            // console.log("connections");
          }}
          title="Connections"
        >
          <VscPlug size={20} />
        </button>
        <button
          className={tabClass(activeTab === "sftp")}
          onClick={() => {
            if (activeSshSession) {
              setActiveTab("sftp");
              setShowSftp(true);
            }
          }}
          disabled={!activeSshSession}
          title={activeSshSession ? "SFTP Browser" : "Connect to SSH to use SFTP"}
        >
          <VscFolder size={20} />
        </button>
        <button
          className={tabClass(activeTab === "ftp")}
          onClick={() => setActiveTab("ftp")}
          title="FTP Browser"
        >
          <VscCloud size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 h-full w-full relative">
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
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground text-sm leading-normal">
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
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground text-sm leading-normal">
            <p className="text-muted-foreground text-sm mb-4">
              Connect to an FTP server to browse files.
            </p>
            <Button
              size="sm"
              onPress={() => openConnectionForm("ftp")}
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
