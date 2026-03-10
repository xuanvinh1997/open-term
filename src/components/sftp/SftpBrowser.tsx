import { useEffect, useState } from "react";
import { useSftpStore } from "../../stores/sftpStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { FileTree, type FileContextMenuEvent } from "./FileTree";
import { isBinaryFile } from "../editor/TextEditor";
import type { FileEntry } from "../../types";
import { TransferQueue } from "./TransferQueue";
import Terminal from "../terminal/Terminal";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Modal } from "@heroui/react";
import { toast } from "sonner";
import {
  VscChevronUp,
  VscRefresh,
  VscNewFolder,
  VscCloudUpload,
  VscFolderOpened,
  VscHome,
  VscCloudDownload,
  VscEdit,
  VscTrash,
  VscGoToFile,
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
    download,
    rename,
  } = useSftpStore();

  const [pathInput, setPathInput] = useState(currentPath);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    path: string;
    isDir: boolean;
    name: string;
  } | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<{
    file: FileEntry;
    x: number;
    y: number;
  } | null>(null);
  const [renameModal, setRenameModal] = useState<{
    file: FileEntry;
  } | null>(null);
  const [renameName, setRenameName] = useState("");

  useEffect(() => {
    openSftp(sessionId);
    return () => {
      closeSftp();
    };
  }, [sessionId]);

  // Sync pathInput when currentPath changes from navigation
  useEffect(() => {
    if (!isEditingPath) {
      setPathInput(currentPath);
    }
  }, [currentPath, isEditingPath]);

  // Tauri native drag-and-drop for file/folder uploads
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(listen("tauri://drag-enter", () => setIsDragging(true)));
    unlisteners.push(listen("tauri://drag-leave", () => setIsDragging(false)));
    unlisteners.push(
      listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;

        for (const localPath of paths) {
          const isDir = await invoke<boolean>("check_is_directory", { path: localPath });
          const name = localPath.split(/[/\\]/).pop() || "file";
          if (isDir) {
            await uploadFolder(localPath, currentPath);
          } else {
            const remotePath = `${currentPath}/${name}`;
            await upload(localPath, remotePath);
          }
        }
        toast.info(`Uploading ${paths.length} item(s)`);
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [currentPath, upload, uploadFolder]);

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

  const handleFileContextMenu = (event: FileContextMenuEvent) => {
    setFileContextMenu(event);
  };

  const handleDownload = async (file: FileEntry) => {
    setFileContextMenu(null);
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select download location",
    });
    if (selected && typeof selected === "string") {
      const localPath = `${selected}/${file.name}`;
      try {
        await download(file.path, localPath);
        toast.success(`Downloaded "${file.name}"`);
      } catch (err) {
        toast.error(`Download failed: ${err}`);
      }
    }
  };

  const handleRenameStart = (file: FileEntry) => {
    setFileContextMenu(null);
    setRenameModal({ file });
    setRenameName(file.name);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal || !renameName.trim()) return;
    const oldPath = renameModal.file.path;
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = `${parentDir}/${renameName.trim()}`;
    try {
      await rename(oldPath, newPath);
      toast.success(`Renamed to "${renameName.trim()}"`);
      setRenameModal(null);
      setRenameName("");
    } catch (err) {
      toast.error(`Rename failed: ${err}`);
    }
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!fileContextMenu) return;
    const handler = () => setFileContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [fileContextMenu]);

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

  const handleOpenFile = (file: FileEntry) => {
    if (isBinaryFile(file.name)) {
      toast.error("Cannot open binary files in the editor");
      return;
    }
    const sftpId = useSftpStore.getState().sftpId;
    if (!sftpId) return;
    useTerminalStore.getState().addEditorTab({
      id: `editor-${Date.now()}`,
      title: file.name,
      filePath: file.path,
      source: "sftp",
      sessionId: sftpId,
      isDirty: false,
    });
  };

  const activeTransfers = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Browser - Left Side */}
        <div className="w-[30%] flex flex-col border-r border-neutral-200 dark:border-[#2b2b2b]">
          {/* File Browser Toolbar */}
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-neutral-200 dark:border-[#2b2b2b] bg-neutral-50 dark:bg-[#252526]">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
              onClick={handleNavigateHome}
              aria-label="Go to home"
            >
              <VscHome className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
              onClick={handleNavigateUp}
              isDisabled={currentPath === "/"}
              aria-label="Go up"
            >
              <VscChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
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
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
              onClick={() => setShowNewFolderModal(true)}
              aria-label="New folder"
            >
              <VscNewFolder className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
              onClick={handleUploadFiles}
              aria-label="Upload files"
            >
              <VscCloudUpload className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 min-w-0 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-neutral-200 dark:data-[hover=true]:bg-[#3c3c3c]"
              onClick={handleUploadFolder}
              aria-label="Upload folder"
            >
              <VscFolderOpened className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Path Bar */}
          <div className="px-2 py-1.5 bg-white dark:bg-[#1e1e1e] border-b border-neutral-200 dark:border-[#2b2b2b]">
            <input
              className="w-full text-xs font-mono text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#3c3c3c] outline-none border border-neutral-200 dark:border-[#3c3c3c] focus:border-blue-500 focus:bg-white dark:focus:bg-[#1e1e1e] rounded px-2 py-1 transition-colors"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onFocus={() => setIsEditingPath(true)}
              onBlur={() => {
                setIsEditingPath(false);
                setPathInput(currentPath);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                  const trimmed = pathInput.trim();
                  if (trimmed && trimmed !== currentPath) {
                    navigateTo(trimmed);
                  }
                  setIsEditingPath(false);
                } else if (e.key === "Escape") {
                  setPathInput(currentPath);
                  setIsEditingPath(false);
                  e.currentTarget.blur();
                }
              }}
              title="Press Enter to navigate, Escape to cancel"
              spellCheck={false}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-2 mt-2 p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded">
              {error}
            </div>
          )}

          {/* File List */}
          <div className={cn(
            "flex-1 overflow-hidden relative transition-colors duration-200",
            isDragging && "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          )}>
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100/80 dark:bg-blue-900/30 z-10 backdrop-blur-sm">
                <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                  Drop files/folders to upload
                </span>
              </div>
            )}
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
                onContextMenu={handleFileContextMenu}
                onOpenFile={handleOpenFile}
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

      {/* Rename Modal */}
      <Modal isOpen={!!renameModal} onOpenChange={(open) => { if (!open) { setRenameModal(null); setRenameName(""); } }}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <form onSubmit={handleRenameSubmit}>
                <Modal.Header>
                  <Modal.Heading>Rename</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="py-4">
                  <Input variant="secondary"
                    placeholder="New name"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    autoFocus
                  />
                </Modal.Body>
                <Modal.Footer>
                  <Button type="button" variant="ghost" onPress={() => { setRenameModal(null); setRenameName(""); }}>
                    Cancel
                  </Button>
                  <Button type="submit" isDisabled={!renameName.trim()} className="bg-blue-600 text-white hover:bg-blue-700">
                    Rename
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* File Context Menu */}
      {fileContextMenu && (
        <div
          className="fixed z-50 min-w-[180px] bg-white dark:bg-[#2d2d2d] border border-neutral-200 dark:border-[#454545] rounded-md shadow-xl py-1"
          style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {fileContextMenu.file.file_type !== "Directory" && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-neutral-700 dark:text-neutral-200 hover:bg-blue-500 hover:text-white transition-colors"
              onClick={() => {
                handleOpenFile(fileContextMenu.file);
                setFileContextMenu(null);
              }}
            >
              <VscGoToFile className="h-3.5 w-3.5" /> Open in Editor
            </button>
          )}
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-neutral-700 dark:text-neutral-200 hover:bg-blue-500 hover:text-white transition-colors"
            onClick={() => handleDownload(fileContextMenu.file)}
          >
            <VscCloudDownload className="h-3.5 w-3.5" /> Download
          </button>
          <div className="h-px bg-neutral-200 dark:bg-[#454545] my-1" />
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-neutral-700 dark:text-neutral-200 hover:bg-blue-500 hover:text-white transition-colors"
            onClick={() => handleRenameStart(fileContextMenu.file)}
          >
            <VscEdit className="h-3.5 w-3.5" /> Rename
          </button>
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            onClick={() => {
              handleDelete(fileContextMenu.file.path, fileContextMenu.file.file_type === "Directory");
              setFileContextMenu(null);
            }}
          >
            <VscTrash className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
