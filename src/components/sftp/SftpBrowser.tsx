import { useEffect, useState } from "react";
import { useSftpStore } from "../../stores/sftpStore";
import { FileTree } from "./FileTree";
import { TransferQueue } from "./TransferQueue";
import { Terminal } from "../terminal/Terminal";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Input, Modal } from "@heroui/react";
import { toast } from "sonner";
import {
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
  VscHome,
} from "react-icons/vsc";
import { cn } from "@/lib/utils";

interface SftpBrowserProps {
  sessionId: string;
  onClose: () => void;
}

export function SftpBrowser({ sessionId, onClose: _onClose }: SftpBrowserProps) {
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

  const handleNavigateHome = () => {
    navigateTo("~");
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

  const activeTransfers = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Browser - Left Side */}
        <div className="w-[30%] flex flex-col border-r border-neutral-300 dark:border-neutral-700">
          {/* File Browser Toolbar */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={handleNavigateHome}
              aria-label="Go to home"
            >
              <VscHome className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={handleNavigateUp}
              isDisabled={currentPath === "/"}
              aria-label="Go up"
            >
              <VscChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={refresh}
              isDisabled={loading}
              aria-label="Refresh"
            >
              <VscRefresh className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-600 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={() => setShowNewFolderModal(true)}
              aria-label="New folder"
            >
              <VscNewFolder className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={handleUploadFiles}
              aria-label="Upload files"
            >
              <VscCloudUpload className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0"
              onClick={handleUploadFolder}
              aria-label="Upload folder"
            >
              <VscFolderOpened className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Path Bar */}
          <div className="px-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <div className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate" title={currentPath}>
              {currentPath}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-2 mt-2 p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded">
              {error}
            </div>
          )}

          {/* File List */}
          <div className="flex-1 overflow-hidden">
            {loading && !files.length ? (
              <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400 text-sm">
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
        </div>

        {/* Terminal - Right Side */}
        <div className="w-[70%] flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Terminal sessionId={sessionId} isActive={true} />
          </div>
        </div>
      </div>

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
                  <Input variant="secondary" 
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
