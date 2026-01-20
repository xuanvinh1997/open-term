import { useState, useCallback } from "react";
import { useFtpStore } from "../../stores/ftpStore";
import { FileTree } from "../sftp/FileTree";
import { TransferQueue } from "../sftp/TransferQueue";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VscClose,
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
} from "react-icons/vsc";
import "./FtpBrowser.css";

interface FtpBrowserProps {
  onClose: () => void;
}

export function FtpBrowser({ onClose }: FtpBrowserProps) {
  const {
    ftpId,
    host,
    currentPath,
    files,
    loading,
    error,
    transfers,
    navigateTo,
    refresh,
    createDirectory,
    deleteItem,
    upload,
    uploadFolder,
    disconnect,
  } = useFtpStore();

  const [isDragging, setIsDragging] = useState(false);

  const handleClose = async () => {
    await disconnect();
    onClose();
  };

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
    if (
      confirm(`Delete ${isDir ? "folder" : "file"} "${path.split("/").pop()}"?`)
    ) {
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      alert("Please use the upload button to select files or folders.");
    }
  }, []);

  const activeTransfers = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  );

  if (!ftpId) {
    return null;
  }

  return (
    <div className="ftp-browser">
      <div className="ftp-header">
        <div className="ftp-title">
          <span>FTP - {host}</span>
          <button className="close-btn" onClick={handleClose} title="Disconnect">
            <VscClose />
          </button>
        </div>
        <div className="ftp-toolbar">
          <div className="ftp-path">
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
          <div className="ftp-actions">
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

      {error && <div className="ftp-error">{error}</div>}

      <div
        className={`ftp-content ${isDragging ? "dragging" : ""}`}
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
          <div className="ftp-loading">Loading...</div>
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
