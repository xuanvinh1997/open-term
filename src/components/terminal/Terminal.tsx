import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
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
  const [terminal, setTerminal] = useState<XTerm | null>(null);
  const { theme } = useTheme();

  const { writeToBackend, resize } = useTerminalChannel({
    sessionId,
    terminal,
  });

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme === "light" ? lightTheme : darkTheme,
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

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
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

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
