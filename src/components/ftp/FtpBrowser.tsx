import { useState, useCallback } from "react";
import { useFtpStore } from "../../stores/ftpStore";
import { FileTree } from "../sftp/FileTree";
import { TransferQueue } from "../sftp/TransferQueue";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";
import {
  VscClose,
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
} from "react-icons/vsc";

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
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-300 dark:border-neutral-700">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            FTP - {host}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            onClick={handleClose}
          >
            <VscClose className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            onClick={handleNavigateUp}
            isDisabled={currentPath === "/"}
          >
            <VscChevronUp className="h-4 w-4" />
          </Button>
          <div className="flex-1 px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded-md border border-neutral-300 dark:border-neutral-700 truncate">
            {currentPath}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={refresh}
              isDisabled={loading}
            >
              <VscRefresh className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={handleCreateFolder}
            >
              <VscNewFolder className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={handleUploadFiles}
            >
              <VscCloudUpload className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={handleUploadFolder}
            >
              <VscFolderOpened className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-md">
          {error}
        </div>
      )}

      <div
        className={cn(
          "flex-1 overflow-hidden mx-4 my-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 relative transition-colors duration-200",
          isDragging && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 z-10 backdrop-blur-sm">
            <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">Drop files here to upload</span>
          </div>
        )}
        {loading && !files.length ? (
          <div className="flex items-center justify-center h-full text-neutral-600 dark:text-neutral-400 text-sm">
            Loading...
          </div>
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
