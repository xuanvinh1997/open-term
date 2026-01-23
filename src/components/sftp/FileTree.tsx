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
} from "react-icons/vsc";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
}

export function FileTree({ files, onNavigate, onDelete }: FileTreeProps) {
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

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return "-";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleClick = (file: FileEntry) => {
    if (file.file_type === "Directory") {
      onNavigate(file.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    onDelete(file.path, file.file_type === "Directory");
  };

  // Sort files: directories first, then by name
  const sortedFiles = [...files].sort((a, b) => {
    if (a.file_type === "Directory" && b.file_type !== "Directory") return -1;
    if (a.file_type !== "Directory" && b.file_type === "Directory") return 1;
    return a.name.localeCompare(b.name);
  });

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-neutral-400 dark:text-neutral-500">
        <VscFolder className="w-14 h-14 mb-4 opacity-40" />
        <p className="text-sm font-medium">Empty directory</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
          <tr>
            <th className="text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 py-2 px-4 border-b border-neutral-200 dark:border-neutral-700">Name</th>
            <th className="text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 py-2 px-4 border-b border-neutral-200 dark:border-neutral-700">Size</th>
            <th className="text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 py-2 px-4 border-b border-neutral-200 dark:border-neutral-700">Modified</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file) => (
            <tr
              key={file.path}
              className={cn(
                "cursor-default border-b border-neutral-200 dark:border-neutral-700 transition-colors duration-150",
                file.file_type === "Directory" && "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
              )}
              onClick={() => handleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <td className="py-2 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-4 h-4">
                    {getFileIcon(file)}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm text-neutral-800 dark:text-neutral-200",
                      file.file_type === "Directory" && "text-blue-500 dark:text-blue-400 font-medium",
                      file.file_type === "Symlink" && "text-purple-500 dark:text-purple-400 italic"
                    )}
                  >
                    {file.name}
                  </span>
                </div>
              </td>
              <td className="text-right text-neutral-600 dark:text-neutral-400 text-xs font-mono py-2 px-4">
                {file.file_type === "Directory" ? "-" : formatSize(file.size)}
              </td>
              <td className="text-right text-neutral-600 dark:text-neutral-400 text-xs py-2 px-4">
                {formatDate(file.modified)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}