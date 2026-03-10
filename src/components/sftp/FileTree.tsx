import { FileEntry } from "../../types";
import {
  VscFolder,
  VscFile,
  VscFileSymlinkFile,
  VscFileCode,
  VscJson,
  VscFileMedia,
  VscArchive,
  VscTerminalBash,
  VscCheck,
} from "react-icons/vsc";
import { cn } from "@/lib/utils";

export interface FileContextMenuEvent {
  file: FileEntry;
  x: number;
  y: number;
}

interface FileTreeProps {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onContextMenu?: (event: FileContextMenuEvent) => void;
  selectedFiles?: Set<string>;
  onSelect?: (path: string, isMulti: boolean) => void;
  onClearSelection?: () => void;
  onOpenFile?: (file: FileEntry) => void;
}

export function FileTree({
  files,
  onNavigate,
  onDelete,
  onContextMenu: onContextMenuProp,
  selectedFiles,
  onSelect,
  onClearSelection,
  onOpenFile,
}: FileTreeProps) {
  const getFileIcon = (file: FileEntry) => {
    if (file.file_type === "Directory") return <VscFolder className="text-amber-400" />;
    if (file.file_type === "Symlink") return <VscFileSymlinkFile className="text-purple-400" />;

    const ext = file.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "ts":
      case "jsx":
      case "tsx":
        return <VscFileCode className="text-blue-400" />;
      case "py":
        return <VscFileCode className="text-yellow-400" />;
      case "rs":
        return <VscFileCode className="text-orange-400" />;
      case "go":
        return <VscFileCode className="text-cyan-400" />;
      case "json":
      case "yaml":
      case "yml":
      case "xml":
      case "toml":
        return <VscJson className="text-yellow-300" />;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
      case "webp":
      case "ico":
        return <VscFileMedia className="text-purple-300" />;
      case "zip":
      case "tar":
      case "gz":
      case "rar":
      case "7z":
        return <VscArchive className="text-orange-300" />;
      case "sh":
      case "bash":
      case "zsh":
        return <VscTerminalBash className="text-green-400" />;
      default:
        return <VscFile className="text-neutral-500 dark:text-neutral-400" />;
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  };


  const handleClick = (file: FileEntry, e: React.MouseEvent) => {
    // Handle selection if enabled
    if (onSelect) {
      const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
      onSelect(file.path, isMulti);

      // Don't navigate on selection click
      if (isMulti) {
        return;
      }
    }

    // Navigate to directory
    if (file.file_type === "Directory") {
      if (onClearSelection) {
        onClearSelection();
      }
      onNavigate(file.path);
    }
  };

  const handleDoubleClick = (file: FileEntry) => {
    if (file.file_type !== "Directory" && onOpenFile) {
      onOpenFile(file);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    if (onContextMenuProp) {
      onContextMenuProp({ file, x: e.clientX, y: e.clientY });
    } else {
      onDelete(file.path, file.file_type === "Directory");
    }
  };

  // Sort files: directories first, then by name
  const sortedFiles = [...files].sort((a, b) => {
    if (a.file_type === "Directory" && b.file_type !== "Directory") return -1;
    if (a.file_type !== "Directory" && b.file_type === "Directory") return 1;
    return a.name.localeCompare(b.name);
  });

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-neutral-400 dark:text-neutral-500">
        <VscFolder className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-xs font-medium">Empty directory</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-neutral-50 dark:bg-[#252526] z-10">
          <tr>
            <th className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 py-1 px-3 border-b border-neutral-200 dark:border-[#2b2b2b]">Name</th>
            <th className="text-right text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 py-1 px-3 border-b border-neutral-200 dark:border-[#2b2b2b] w-20">Size</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file) => {
            const isSelected = selectedFiles?.has(file.path) || false;

            return (
              <tr
                key={file.path}
                className={cn(
                  "cursor-default transition-colors duration-100",
                  "hover:bg-neutral-100/60 dark:hover:bg-[#2a2d2e]",
                  file.file_type === "Directory" && "cursor-pointer",
                  onSelect && "cursor-pointer",
                  isSelected && "bg-blue-500/10 dark:bg-blue-500/15 hover:bg-blue-500/15 dark:hover:bg-blue-500/20"
                )}
                onClick={(e) => handleClick(file, e)}
                onDoubleClick={() => handleDoubleClick(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
              >
                <td className="py-[5px] px-3">
                  <div className="flex items-center gap-2">
                    {onSelect && (
                      <span className={cn(
                        "flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-neutral-300 dark:border-neutral-600"
                      )}>
                        {isSelected && <VscCheck className="w-2.5 h-2.5 text-white" />}
                      </span>
                    )}
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {getFileIcon(file)}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[13px] text-neutral-800 dark:text-neutral-200",
                        file.file_type === "Symlink" && "text-purple-500 dark:text-purple-400 italic"
                      )}
                    >
                      {file.name}
                    </span>
                  </div>
                </td>
                <td className="text-right text-neutral-400 dark:text-neutral-500 text-[11px] font-mono py-[5px] px-3">
                  {file.file_type === "Directory" ? "" : formatSize(file.size)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}