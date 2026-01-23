import { useState, useCallback, useEffect } from "react";
import { useFtpStore } from "../../stores/ftpStore";
import { useLocalStore } from "../../stores/localStore";
import { FileTree } from "../sftp/FileTree";
import { TransferQueue } from "../sftp/TransferQueue";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";
import {
  VscClose,
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscHome,
  VscArrowRight,
  VscArrowLeft,
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
    download,
    disconnect,
  } = useFtpStore();

  const local = useLocalStore();
  const [isDraggingToRemote, setIsDraggingToRemote] = useState(false);
  const [isDraggingToLocal, setIsDraggingToLocal] = useState(false);

  // Initialize local browser
  useEffect(() => {
    if (ftpId && !local.currentPath) {
      local.initialize();
    }
  }, [ftpId]);

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

  const handleLocalDelete = async (path: string, isDir: boolean) => {
    if (
      confirm(`Delete local ${isDir ? "folder" : "file"} "${path.split(/[/\\]/).pop()}"?`)
    ) {
      // TODO: Implement local delete
      alert("Local delete not yet implemented");
    }
  };

  const handleLocalSelect = (path: string, isMulti: boolean) => {
    if (isMulti) {
      local.toggleFileSelection(path);
    } else {
      local.selectFile(path);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRemoteSelect = (path: string, isMulti: boolean) => {
    // TODO: Implement remote selection in FTP store
    console.log("Remote select:", path, isMulti);
  };

  const handleUploadSelected = async () => {
    const selectedFiles = local.getSelectedFiles();
    if (selectedFiles.length === 0) {
      alert("Please select files to upload");
      return;
    }

    for (const file of selectedFiles) {
      const filename = file.name;
      const remotePath = `${currentPath}/${filename}`;
      
      if (file.file_type === "Directory") {
        // Upload folder recursively
        const { uploadFolder } = useFtpStore.getState();
        await uploadFolder(file.path, currentPath);
      } else {
        await upload(file.path, remotePath);
      }
    }
    
    local.clearSelection();
  };

  const handleDownloadSelected = async () => {
    // TODO: Implement remote selection and download
    alert("Please select remote files first (selection not yet implemented for remote)");
  };

  // Drag and drop handlers for local to remote
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLocalDragStart = useCallback((e: React.DragEvent, filePath: string) => {
    e.dataTransfer.setData("localPath", filePath);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleRemoteDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingToRemote(true);
  }, []);

  const handleRemoteDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingToRemote(false);
  }, []);

  const handleRemoteDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingToRemote(false);

    const localPath = e.dataTransfer.getData("localPath");
    if (localPath) {
      const filename = localPath.split(/[/\\]/).pop() || "file";
      const remotePath = `${currentPath}/${filename}`;
      await upload(localPath, remotePath);
    }
  }, [currentPath, upload]);

  // Drag and drop handlers for remote to local
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRemoteDragStart = useCallback((e: React.DragEvent, filePath: string) => {
    e.dataTransfer.setData("remotePath", filePath);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleLocalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingToLocal(true);
  }, []);

  const handleLocalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingToLocal(false);
  }, []);

  const handleLocalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingToLocal(false);

    const remotePath = e.dataTransfer.getData("remotePath");
    if (remotePath) {
      const filename = remotePath.split("/").pop() || "file";
      const localPath = `${local.currentPath}/${filename}`;
      await download(remotePath, localPath);
      await local.refresh();
    }
  }, [local, download]);

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
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-md">
          {error}
        </div>
      )}

      {/* Dual-pane layout */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Local Browser (Left) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={local.navigateUp}
              isDisabled={local.currentPath === "/" || !local.currentPath}
            >
              <VscChevronUp className="h-4 w-4" />
            </Button>
            <div className="flex-1 px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded-md border-2 border-neutral-400 dark:border-neutral-600 truncate">
              {local.currentPath || "Local"}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                onClick={local.goHome}
                aria-label="Home"
              >
                <VscHome className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                onClick={local.refresh}
                isDisabled={local.loading}
              >
                <VscRefresh className={cn("h-4 w-4", local.loading && "animate-spin")} />
              </Button>
            </div>
          </div>
          
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 px-2">
            Local Computer
            {local.selectedFiles.size > 0 && (
              <span className="ml-2 text-blue-500">
                ({local.selectedFiles.size} selected)
              </span>
            )}
          </div>

          <div
            className={cn(
              "flex-1 overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 relative transition-colors duration-200",
              isDraggingToLocal && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            )}
            onDragOver={handleLocalDragOver}
            onDragLeave={handleLocalDragLeave}
            onDrop={handleLocalDrop}
          >
            {isDraggingToLocal && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 z-10 backdrop-blur-sm">
                <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                  Drop to download here
                </span>
              </div>
            )}
            {local.loading && !local.files.length ? (
              <div className="flex items-center justify-center h-full text-neutral-600 dark:text-neutral-400 text-sm">
                Loading...
              </div>
            ) : (
              <FileTree
                files={local.files}
                currentPath={local.currentPath}
                onNavigate={local.navigateTo}
                onDelete={handleLocalDelete}
                selectedFiles={local.selectedFiles}
                onSelect={handleLocalSelect}
                onClearSelection={local.clearSelection}
              />
            )}
          </div>
        </div>

        {/* Transfer Buttons (Center) */}
        <div className="flex flex-col items-center justify-center gap-3">
          <Button
            variant="primary"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={handleUploadSelected}
            isDisabled={local.selectedFiles.size === 0 || loading}
            aria-label="Upload selected files to remote"
          >
            <VscArrowRight className="h-5 w-5" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={handleDownloadSelected}
            isDisabled={loading}
            aria-label="Download selected files to local"
          >
            <VscArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Remote Browser (Right) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={handleNavigateUp}
              isDisabled={currentPath === "/"}
            >
              <VscChevronUp className="h-4 w-4" />
            </Button>
            <div className="flex-1 px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded-md border-2 border-neutral-400 dark:border-neutral-600 truncate">
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
            </div>
          </div>
          
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 px-2">
            Remote Server: {host}
          </div>

          <div
            className={cn(
              "flex-1 overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 relative transition-colors duration-200",
              isDraggingToRemote && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            )}
            onDragOver={handleRemoteDragOver}
            onDragLeave={handleRemoteDragLeave}
            onDrop={handleRemoteDrop}
          >
            {isDraggingToRemote && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 z-10 backdrop-blur-sm">
                <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                  Drop to upload here
                </span>
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
        </div>
      </div>

      {activeTransfers.length > 0 && (
        <TransferQueue transfers={activeTransfers} />
      )}
    </div>
  );
}
