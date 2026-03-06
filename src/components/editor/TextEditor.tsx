import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useTerminalStore } from "../../stores/terminalStore";
import { toast } from "sonner";
import type { EditorTab } from "../../types";
import { VscLoading } from "react-icons/vsc";

interface TextEditorProps {
  tab: EditorTab;
  isActive: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB hard limit
const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB — enable perf optimizations

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
  "mp3", "mp4", "wav", "avi", "mkv", "mov", "flac", "ogg",
  "zip", "tar", "gz", "bz2", "xz", "rar", "7z",
  "exe", "dll", "so", "dylib", "bin", "dat",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "woff", "woff2", "ttf", "otf", "eot",
]);

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return BINARY_EXTENSIONS.has(ext);
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
    py: "python", rs: "rust", go: "go", java: "java",
    json: "json", yaml: "yaml", yml: "yaml", xml: "xml", toml: "toml",
    html: "html", css: "css", scss: "scss", less: "less",
    md: "markdown", sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
    lua: "lua", r: "r", dockerfile: "dockerfile",
    ini: "ini", conf: "ini", cfg: "ini",
    txt: "plaintext", log: "plaintext",
  };
  return map[ext || ""] || "plaintext";
}

export function TextEditor({ tab, isActive }: TextEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const savedContentRef = useRef<string>("");
  const updateEditorTab = useTerminalStore((s) => s.updateEditorTab);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let fileContent: string;
      switch (tab.source) {
        case "local":
          fileContent = await invoke<string>("read_local_file", { path: tab.filePath });
          break;
        case "sftp":
          fileContent = await invoke<string>("sftp_read_file", {
            sftpId: tab.sessionId,
            remotePath: tab.filePath,
          });
          break;
        case "ftp":
          fileContent = await invoke<string>("ftp_read_file", {
            ftpId: tab.sessionId,
            remotePath: tab.filePath,
          });
          break;
      }

      if (fileContent.length > MAX_FILE_SIZE) {
        setError(`File too large (${formatFileSize(fileContent.length)}). Maximum supported size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return;
      }

      setContent(fileContent);
      savedContentRef.current = fileContent;
    } catch (err) {
      setError(String(err));
      toast.error(`Failed to load file: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [tab.filePath, tab.source, tab.sessionId]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  const saveFile = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentContent = editor.getValue();
    try {
      switch (tab.source) {
        case "local":
          await invoke("write_local_file", { path: tab.filePath, content: currentContent });
          break;
        case "sftp":
          await invoke("sftp_write_file", {
            sftpId: tab.sessionId,
            remotePath: tab.filePath,
            content: currentContent,
          });
          break;
        case "ftp":
          await invoke("ftp_write_file", {
            ftpId: tab.sessionId,
            remotePath: tab.filePath,
            content: currentContent,
          });
          break;
      }
      savedContentRef.current = currentContent;
      updateEditorTab(tab.id, { isDirty: false });
      toast.success("File saved");
    } catch (err) {
      toast.error(`Failed to save: ${err}`);
    }
  }, [tab.id, tab.filePath, tab.source, tab.sessionId, updateEditorTab]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => saveFile()
    );

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  const handleChange = (value: string | undefined) => {
    if (value === undefined) return;
    const isDirty = value !== savedContentRef.current;
    if (isDirty !== tab.isDirty) {
      updateEditorTab(tab.id, { isDirty });
    }
  };

  // Re-layout editor when tab becomes active
  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.layout();
    }
  }, [isActive]);

  const language = getLanguage(tab.title);
  const isLargeFile = (content?.length ?? 0) > LARGE_FILE_THRESHOLD;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-neutral-900 text-neutral-500">
        <VscLoading className="animate-spin h-5 w-5 mr-2" />
        <span className="text-xs">Loading file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-neutral-900 text-red-500">
        <span className="text-xs">Error: {error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 min-h-0">
        <Editor
          defaultValue={content ?? ""}
          language={language}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          onMount={handleEditorMount}
          onChange={handleChange}
          options={{
            minimap: { enabled: isLargeFile },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: isLargeFile ? "off" : "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: !isLargeFile },
            largeFileOptimizations: isLargeFile,
            folding: !isLargeFile,
            links: !isLargeFile,
            colorDecorators: !isLargeFile,
          }}
        />
      </div>
      <div className="flex items-center justify-between px-3 py-0.5 bg-neutral-100 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
        <div className="flex items-center gap-3">
          <span>{tab.filePath}</span>
          <span className="uppercase">{language}</span>
        </div>
        <div className="flex items-center gap-3">
          {tab.isDirty && <span className="text-yellow-500 font-medium">Modified</span>}
          {isLargeFile && <span className="text-orange-400">Large file</span>}
          <span>{formatFileSize(content?.length ?? 0)}</span>
          <span>Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
          <span className="uppercase text-[10px]">{tab.source}</span>
        </div>
      </div>
    </div>
  );
}
