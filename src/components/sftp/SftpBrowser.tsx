import { useEffect, useState, useCallback } from "react";
import { useSftpStore } from "../../stores/sftpStore";
import { FileTree } from "./FileTree";
import { TransferQueue } from "./TransferQueue";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VscClose,
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
} from "react-icons/vsc";
import "./SftpBrowser.css";

interface SftpBrowserProps {
  sessionId: string;
  onClose: () => void;
}

export function SftpBrowser({ sessionId, onClose }: SftpBrowserProps) {
  const {
    currentPath,
    files,
    loading,
    error,
    transfers,
    openSftp,
    closeSftp,
    navigateTo,
    refresh,
    createDirectory,
    deleteItem,
    upload,
    uploadFolder,
  } = useSftpStore();

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    openSftp(sessionId);
    return () => {
      closeSftp();
    };
  }, [sessionId]);

  const handleNavigateUp = () => {
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    navigateTo(parentPath);
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (name) {
      await createDirectory(name);
    }
  };

  const handleDelete = async (path: string, isDir: boolean) => {
    if (confirm(`Delete ${isDir ? "folder" : "file"} "${path.split("/").pop()}"?`)) {
      await deleteItem(path, isDir);
    }
  };

  const handleUploadFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Select files to upload",
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const localPath of paths) {
        const filename = localPath.split(/[/\\]/).pop() || "file";
        const remotePath = `${currentPath}/${filename}`;
        await upload(localPath, remotePath);
      }
    }
  };

  const handleUploadFolder = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select folder to upload",
    });

    if (selected && typeof selected === "string") {
      await uploadFolder(selected, currentPath);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      // Note: In Tauri, drag-drop from native file manager gives us file paths
      // This requires the tauri drag-drop feature to work properly
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        // For web drag-drop, we can't easily get file paths
        // Users should use the upload button instead
        alert("Please use the upload button to select files or folders.");
      }
    },
    [currentPath, upload, uploadFolder]
  );

  const activeTransfers = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  );

  return (
    <div className="sftp-browser">
      <div className="sftp-header">
        <div className="sftp-title">
          <span>SFTP</span>
          <button className="close-btn" onClick={onClose} title="Close SFTP">
            <VscClose />
          </button>
        </div>
        <div className="sftp-toolbar">
          <div className="sftp-path">
            <button
              className="nav-btn"
              onClick={handleNavigateUp}
              disabled={currentPath === "/"}
              title="Go up"
            >
              <VscChevronUp />
            </button>
            <span className="path-text">{currentPath}</span>
          </div>
          <div className="sftp-actions">
            <button onClick={refresh} disabled={loading} title="Refresh">
              <VscRefresh />
            </button>
            <button onClick={handleCreateFolder} title="New folder">
              <VscNewFolder />
            </button>
            <button onClick={handleUploadFiles} title="Upload files">
              <VscCloudUpload />
            </button>
            <button onClick={handleUploadFolder} title="Upload folder">
              <VscFolderOpened />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="sftp-error">{error}</div>}

      <div
        className={`sftp-content ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <div className="drop-message">Drop files here to upload</div>
          </div>
        )}
        {loading && !files.length ? (
          <div className="sftp-loading">Loading...</div>
        ) : (
          <FileTree
            files={files}
            currentPath={currentPath}
            onNavigate={navigateTo}
            onDelete={handleDelete}
          />
        )}
      </div>

      {activeTransfers.length > 0 && (
        <TransferQueue transfers={activeTransfers} />
      )}
    </div>
  );
}
