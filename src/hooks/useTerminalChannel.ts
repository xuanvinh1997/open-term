import { useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";

interface UseTerminalChannelOptions {
  sessionId: string;
  terminal: Terminal | null;
  isActive?: boolean;
}

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB cap for inactive terminals

export function useTerminalChannel({
  sessionId,
  terminal,
  isActive = true,
}: UseTerminalChannelOptions) {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const bufferRef = useRef<Uint8Array[]>([]);
  const rafRef = useRef<number | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const isActiveRef = useRef(isActive);

  // Keep isActive ref in sync
  useEffect(() => {
    isActiveRef.current = isActive;

    // When becoming active, flush any accumulated buffer
    if (isActive && terminal && bufferRef.current.length > 0) {
      flushBuffer();
    }
  }, [isActive, terminal]);

  const flushBuffer = useCallback(() => {
    if (!terminal || bufferRef.current.length === 0) {
      rafRef.current = null;
      return;
    }

    // Concatenate all pending chunks
    const chunks = bufferRef.current;
    bufferRef.current = [];

    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;

    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    terminal.write(decoderRef.current.decode(combined));
    rafRef.current = null;
  }, [terminal]);

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

  // Listen for terminal output events with RAF-based batching
  useEffect(() => {
    if (!sessionId || !terminal) return;

    const eventName = `terminal-output-${sessionId}`;

    const setupListener = async () => {
      unlistenRef.current = await listen<number[]>(eventName, (event) => {
        const chunk = new Uint8Array(event.payload);

        // Cap buffer size for inactive terminals
        if (!isActiveRef.current) {
          let currentSize = 0;
          for (const c of bufferRef.current) currentSize += c.length;
          if (currentSize > MAX_BUFFER_SIZE) {
            // Discard oldest chunks to stay under cap
            while (bufferRef.current.length > 0 && currentSize > MAX_BUFFER_SIZE) {
              const removed = bufferRef.current.shift()!;
              currentSize -= removed.length;
            }
          }
        }

        bufferRef.current.push(chunk);

        // Only schedule RAF flush for active terminals
        if (isActiveRef.current && rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            flushBuffer();
          });
        }
      });
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [sessionId, terminal, flushBuffer]);

  return { writeToBackend, resize };
}
