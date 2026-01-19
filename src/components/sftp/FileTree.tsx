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
import "./FileTree.css";

interface FileTreeProps {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
}

export function FileTree({ files, onNavigate, onDelete }: FileTreeProps) {
  const getFileIcon = (file: FileEntry) => {
    if (file.file_type === "Directory") return <VscFolder />;
    if (file.file_type === "Symlink") return <VscFileSymlinkFile />;

    const ext = file.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "txt":
      case "md":
      case "log":
        return <VscFile />;
      case "js":
      case "ts":
      case "jsx":
      case "tsx":
      case "py":
      case "rs":
      case "go":
      case "c":
      case "cpp":
      case "h":
        return <VscFileCode />;
      case "json":
      case "yaml":
      case "yml":
      case "xml":
      case "toml":
        return <VscJson />;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
      case "webp":
      case "ico":
        return <VscFileMedia />;
      case "zip":
      case "tar":
      case "gz":
      case "rar":
      case "7z":
        return <VscArchive />;
      case "sh":
      case "bash":
      case "zsh":
        return <VscTerminalBash />;
      default:
        return <VscFile />;
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
    // Simple context menu via confirm for now
    if (confirm(`Delete "${file.name}"?`)) {
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
    return <div className="file-tree-empty">Empty directory</div>;
  }

  return (
    <div className="file-tree">
      <table className="file-table">
        <thead>
          <tr>
            <th className="col-name">Name</th>
            <th className="col-size">Size</th>
            <th className="col-date">Modified</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file) => (
            <tr
              key={file.path}
              className={`file-row ${file.file_type === "Directory" ? "is-dir" : ""}`}
              onClick={() => handleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <td className="col-name">
                <span className="file-icon">{getFileIcon(file)}</span>
                <span className="file-name">{file.name}</span>
              </td>
              <td className="col-size">
                {file.file_type === "Directory" ? "-" : formatSize(file.size)}
              </td>
              <td className="col-date">{formatDate(file.modified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
