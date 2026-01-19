import { useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";

interface UseTerminalChannelOptions {
  sessionId: string;
  terminal: Terminal | null;
}

export function useTerminalChannel({
  sessionId,
  terminal,
}: UseTerminalChannelOptions) {
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Write data to the terminal backend
  const writeToBackend = useCallback(
    async (data: string) => {
      if (!sessionId) return;

      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));

      try {
        await invoke("write_terminal", { sessionId, data: bytes });
      } catch (error) {
        console.error("Failed to write to terminal:", error);
      }
    },
    [sessionId]
  );

  // Resize the terminal
  const resize = useCallback(
    async (cols: number, rows: number) => {
      if (!sessionId) return;

      try {
        await invoke("resize_terminal", { sessionId, cols, rows });
      } catch (error) {
        console.error("Failed to resize terminal:", error);
      }
    },
    [sessionId]
  );

  // Listen for terminal output events
  useEffect(() => {
    if (!sessionId || !terminal) return;

    const eventName = `terminal-output-${sessionId}`;

    const setupListener = async () => {
      unlistenRef.current = await listen<number[]>(eventName, (event) => {
        const data = new Uint8Array(event.payload);
        const decoder = new TextDecoder();
        terminal.write(decoder.decode(data));
      });
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [sessionId, terminal]);

  return { writeToBackend, resize };
}
