import { useState } from "react";
import { ConnectionManager } from "../connection/ConnectionManager";
import { ConnectionForm } from "../connection/ConnectionForm";

interface SidebarProps {
  onOpenSftp: (sessionId: string) => void;
  onOpenFtp: () => void;
}

export function Sidebar({ onOpenSftp, onOpenFtp }: SidebarProps) {
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionFormDefaultTab, setConnectionFormDefaultTab] = useState<"ssh" | "ftp">("ssh");

  const handleConnectionConnected = () => {
    setShowConnectionForm(false);
  };

  const handleFtpConnected = () => {
    setShowConnectionForm(false);
    onOpenFtp();
  };

  const openConnectionForm = (defaultTab: "ssh" | "ftp" = "ssh") => {
    setConnectionFormDefaultTab(defaultTab);
    setShowConnectionForm(true);
  };

  return (
    <div className="flex w-full h-full min-w-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
      <ConnectionManager
        onNewConnection={() => openConnectionForm("ssh")}
        onOpenSftp={onOpenSftp}
        onOpenFtp={onOpenFtp}
      />

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
