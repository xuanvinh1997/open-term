import { useState } from "react";
import { ConnectionManager } from "../connection/ConnectionManager";
import { ConnectionForm } from "../connection/ConnectionForm";
import type { ConnectionProfile } from "../../types";

interface SidebarProps {
  onOpenSftp: (sessionId: string) => void;
  onOpenFtp: () => void;
}

export function Sidebar({ onOpenSftp, onOpenFtp }: SidebarProps) {
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionFormDefaultTab, setConnectionFormDefaultTab] = useState<"ssh" | "ftp">("ssh");
  const [editingConnection, setEditingConnection] = useState<ConnectionProfile | null>(null);

  const handleConnectionConnected = () => {
    setShowConnectionForm(false);
    setEditingConnection(null);
  };

  const handleFtpConnected = () => {
    setShowConnectionForm(false);
    setEditingConnection(null);
    onOpenFtp();
  };

  const openConnectionForm = (defaultTab: "ssh" | "ftp" = "ssh") => {
    setEditingConnection(null);
    setConnectionFormDefaultTab(defaultTab);
    setShowConnectionForm(true);
  };

  const handleEditConnection = (conn: ConnectionProfile) => {
    setEditingConnection(conn);
    setConnectionFormDefaultTab(conn.connection_type as "ssh" | "ftp");
    setShowConnectionForm(true);
  };

  const handleCloseForm = () => {
    setShowConnectionForm(false);
    setEditingConnection(null);
  };

  return (
    <div className="flex w-full h-full min-w-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
      <ConnectionManager
        onNewConnection={() => openConnectionForm("ssh")}
        onEditConnection={handleEditConnection}
        onOpenSftp={onOpenSftp}
        onOpenFtp={onOpenFtp}
      />

      {/* Connection Form Modal */}
      <ConnectionForm
        open={showConnectionForm}
        onClose={handleCloseForm}
        onConnected={handleConnectionConnected}
        onFtpConnected={handleFtpConnected}
        defaultTab={connectionFormDefaultTab}
        editingConnection={editingConnection}
      />
    </div>
  );
}
