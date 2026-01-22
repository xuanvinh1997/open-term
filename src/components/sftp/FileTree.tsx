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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
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
        return <VscFile className="text-muted-foreground" />;
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
      <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground/60">
        <VscFolder className="w-14 h-14 mb-4 opacity-40" />
        <p className="text-sm font-medium">Empty directory</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <Table aria-label="File Tree" removeWrapper isCompact>
        <TableHeader>
            <TableColumn className="text-xs font-semibold text-default-500">Name</TableColumn>
            <TableColumn className="text-right text-xs font-semibold text-default-500">Size</TableColumn>
            <TableColumn className="text-right text-xs font-semibold text-default-500">Modified</TableColumn>
        </TableHeader>
        <TableBody>
          {sortedFiles.map((file) => (
            <TableRow
              key={file.path}
              className={cn(
                "cursor-default border-border/30 transition-colors duration-150",
                file.file_type === "Directory" && "cursor-pointer hover:bg-accent/50"
              )}
              onClick={() => handleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <TableCell className="py-2 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-4 h-4">
                    {getFileIcon(file)}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm",
                      file.file_type === "Directory" && "text-blue-400 font-medium",
                      file.file_type === "Symlink" && "text-purple-400 italic"
                    )}
                  >
                    {file.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground/70 text-xs font-mono py-2 px-4">
                {file.file_type === "Directory" ? "-" : formatSize(file.size)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground/70 text-xs py-2 px-4">
                {formatDate(file.modified)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
