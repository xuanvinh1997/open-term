import { useEffect, useRef, useCallback, useState, memo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { useTerminalChannel } from "../../hooks/useTerminalChannel";
import { useTheme } from "next-themes";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  isActive: boolean;
}

const darkTheme = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

const lightTheme = {
  background: "#ffffff",
  foreground: "#383a42",
  cursor: "#383a42",
  cursorAccent: "#ffffff",
  selectionBackground: "#d7dae0",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#0184bc",
  magenta: "#a626a4",
  cyan: "#0997b3",
  white: "#fafafa",
  brightBlack: "#4f525e",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

export function Terminal({ sessionId, isActive }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [terminal, setTerminal] = useState<XTerm | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme } = useTheme();

  const { writeToBackend, resize } = useTerminalChannel({
    sessionId,
    terminal,
    isActive,
  });

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme === "light" ? lightTheme : darkTheme,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon could not be loaded:", e);
    }

    // Load web links addon for clickable URLs
    terminal.loadAddon(new WebLinksAddon());

    // Load Unicode 11 addon for emoji support
    const unicodeAddon = new Unicode11Addon();
    terminal.loadAddon(unicodeAddon);
    terminal.unicode.activeVersion = "11";

    // Load search addon
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminal(terminal);

    // Initial resize
    resize(terminal.cols, terminal.rows);

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, []);

  // Update terminal theme when theme changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.theme = theme === "light" ? lightTheme : darkTheme;
    }
  }, [theme]);

  // Handle terminal input
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const disposable = terminal.onData((data) => {
      writeToBackend(data);
    });

    return () => {
      disposable.dispose();
    };
  }, [writeToBackend]);

  // Handle resize
  const handleResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    fitAddon.fit();
    resize(terminal.cols, terminal.rows);
  }, [resize]);

  // Resize observer (debounced)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(handleResize, 150);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [handleResize]);

  // Focus and refit terminal when active
  useEffect(() => {
    if (isActive && terminalRef.current && fitAddonRef.current) {
      // Refit after becoming visible (container may have been hidden)
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [isActive]);

  // Font zoom: Ctrl+= / Ctrl+- / Ctrl+0
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const size = Math.min((terminal.options.fontSize ?? 14) + 1, 32);
        terminal.options.fontSize = size;
        fitAddonRef.current?.fit();
        resize(terminal.cols, terminal.rows);
      } else if (e.key === "-") {
        e.preventDefault();
        const size = Math.max((terminal.options.fontSize ?? 14) - 1, 8);
        terminal.options.fontSize = size;
        fitAddonRef.current?.fit();
        resize(terminal.cols, terminal.rows);
      } else if (e.key === "0") {
        e.preventDefault();
        terminal.options.fontSize = 14;
        fitAddonRef.current?.fit();
        resize(terminal.cols, terminal.rows);
      } else if (e.key === "f") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };

    const el = containerRef.current;
    el?.addEventListener("keydown", handleKeyDown);
    return () => el?.removeEventListener("keydown", handleKeyDown);
  }, [terminal, resize]);

  const handleSearchNext = () => {
    searchAddonRef.current?.findNext(searchQuery);
  };

  const handleSearchPrev = () => {
    searchAddonRef.current?.findPrevious(searchQuery);
  };

  const handleCloseSearch = () => {
    setShowSearch(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
        position: "relative",
      }}
    >
      {showSearch && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 16,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--search-bg, #252526)",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchAddonRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleSearchPrev() : handleSearchNext();
              } else if (e.key === "Escape") {
                handleCloseSearch();
              }
            }}
            placeholder="Search..."
            style={{
              background: "transparent",
              border: "1px solid #555",
              borderRadius: 3,
              color: "#ccc",
              padding: "2px 6px",
              fontSize: 12,
              outline: "none",
              width: 180,
            }}
          />
          <button onClick={handleSearchPrev} title="Previous" style={{ color: "#ccc", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>&#x25B2;</button>
          <button onClick={handleSearchNext} title="Next" style={{ color: "#ccc", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>&#x25BC;</button>
          <button onClick={handleCloseSearch} title="Close" style={{ color: "#ccc", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>&#x2715;</button>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export default memo(Terminal);
