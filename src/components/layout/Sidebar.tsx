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
    "w-[52px] h-[44px] flex items-center justify-center bg-transparent border-0 cursor-pointer transition-all border-l-2 my-0.5 text-neutral-700 dark:text-neutral-300",
    isActive 
      ? "opacity-100 bg-neutral-300 dark:bg-neutral-800 border-l-blue-500" 
      : "opacity-50 border-l-transparent hover:opacity-100 hover:bg-neutral-300/50 dark:hover:bg-neutral-800",
    "disabled:opacity-25 disabled:cursor-not-allowed"
  );

  return (
    <div className="flex w-full h-full min-w-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
      <div className="flex flex-col shrink-0 w-[52px] bg-neutral-200 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-700 pt-1">
        <button
          className={tabClass(activeTab === "connections")}
          onClick={() => {
            setActiveTab("connections");
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
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-neutral-600 dark:text-neutral-400 text-sm leading-normal">
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
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-neutral-600 dark:text-neutral-400 text-sm leading-normal">
            <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4">
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
