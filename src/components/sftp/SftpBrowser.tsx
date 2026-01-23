import { useEffect, useState, useCallback } from "react";
import { useSftpStore } from "../../stores/sftpStore";
import { FileTree } from "./FileTree";
import { TransferQueue } from "./TransferQueue";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Input, Modal } from "@heroui/react";
import { toast } from "sonner";
import {
  VscClose,
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
} from "react-icons/vsc";
import { cn } from "@/lib/utils";

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
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    path: string;
    isDir: boolean;
    name: string;
  } | null>(null);

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
    setShowNewFolderModal(true);
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setCreating(true);
    try {
      await createDirectory(newFolderName.trim());
      toast.success(`Created folder "${newFolderName}"`);
      setShowNewFolderModal(false);
      setNewFolderName("");
    } catch (err) {
      toast.error(`Failed to create folder: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (path: string, isDir: boolean) => {
    const name = path.split("/").pop() || path;
    setDeleteConfirm({ path, isDir, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteItem(deleteConfirm.path, deleteConfirm.isDir);
      toast.success(`Deleted "${deleteConfirm.name}"`);
    } catch (err) {
      toast.error(`Failed to delete: ${err}`);
    }
    setDeleteConfirm(null);
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
      toast.info(`Uploading ${paths.length} file(s)`);
    }
  };

  const handleUploadFolder = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select folder to upload",
    });

    if (selected && typeof selected === "string") {
      const folderName = selected.split(/[/\\]/).pop() || "folder";
      await uploadFolder(selected, currentPath);
      toast.info(`Uploading folder "${folderName}"`);
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
      toast.info("Please use the upload button to select files or folders.");
    }
  }, []);

  const activeTransfers = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-300 dark:border-neutral-700">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            SFTP Browser
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            onClick={onClose}
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

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-2.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-md">
          {error}
        </div>
      )}

      {/* File List */}
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

      {/* Transfer Queue */}
      {activeTransfers.length > 0 && (
        <TransferQueue transfers={activeTransfers} />
      )}

      {/* New Folder Dialog */}
      <Modal isOpen={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <form onSubmit={handleCreateFolderSubmit}>
                <Modal.Header>
                  <Modal.Heading>Create New Folder</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="py-4">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    autoFocus
                  />
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    type="button"
                    variant="ghost"
                    onPress={() => {
                      setShowNewFolderModal(false);
                      setNewFolderName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isDisabled={creating} className="bg-blue-600 text-white hover:bg-blue-700">
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  Delete {deleteConfirm?.isDir ? "Folder" : "File"}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="py-4">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button type="button" variant="ghost" onPress={() => setDeleteConfirm(null)}>Cancel</Button>
                <Button
                  type="button"
                  onPress={confirmDelete}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
