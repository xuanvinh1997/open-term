import { useEffect, useRef, useCallback, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { VncInputEvent } from "../../types";
import { toast } from "sonner";

interface VncViewerProps {
  sessionId: string;
  width: number;
  height: number;
  isActive: boolean;
}

export function VncViewer({ sessionId, width, height, isActive }: VncViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const mouseButtonMask = useRef<number>(0);

  const sendInput = useCallback(
    async (event: VncInputEvent) => {
      try {
        await invoke("vnc_send_input", { sessionId, event });
      } catch (err) {
        console.error("Failed to send VNC input:", err);
      }
    },
    [sessionId]
  );

  // Listen for frame updates
  useEffect(() => {
    if (!sessionId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let unlistenFrame: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    const setupListeners = async () => {
      // Frame updates
      unlistenFrame = await listen<number[]>(
        `vnc-frame-${sessionId}`,
        (event) => {
          const data = new Uint8ClampedArray(event.payload);
          const imageData = new ImageData(data, width, height);
          ctx.putImageData(imageData, 0, 0);
        }
      );

      // Error events
      unlistenError = await listen<string>(`vnc-error-${sessionId}`, (event) => {
        setError(event.payload);
        toast.error(`VNC error: ${event.payload}`);
      });
    };

    setupListeners();

    return () => {
      if (unlistenFrame) unlistenFrame();
      if (unlistenError) unlistenError();
    };
  }, [sessionId, width, height]);

  // Mouse event handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      sendInput({
        type: "pointer",
        x,
        y,
        button_mask: mouseButtonMask.current,
      });
    },
    [width, height, sendInput]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      // VNC button mask: 1=left, 2=middle, 4=right
      if (e.button === 0) mouseButtonMask.current |= 1;
      else if (e.button === 1) mouseButtonMask.current |= 2;
      else if (e.button === 2) mouseButtonMask.current |= 4;

      sendInput({
        type: "pointer",
        x,
        y,
        button_mask: mouseButtonMask.current,
      });
    },
    [width, height, sendInput]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      // Clear button from mask
      if (e.button === 0) mouseButtonMask.current &= ~1;
      else if (e.button === 1) mouseButtonMask.current &= ~2;
      else if (e.button === 2) mouseButtonMask.current &= ~4;

      sendInput({
        type: "pointer",
        x,
        y,
        button_mask: mouseButtonMask.current,
      });
    },
    [width, height, sendInput]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Keyboard event handlers
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;
      e.preventDefault();

      // Map JS key code to X11 keysym
      const key = keyCodeToKeysym(e.key, e.code);
      if (key) {
        sendInput({ type: "key", key, down: true });
      }
    },
    [isActive, sendInput]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;
      e.preventDefault();

      const key = keyCodeToKeysym(e.key, e.code);
      if (key) {
        sendInput({ type: "key", key, down: false });
      }
    },
    [isActive, sendInput]
  );

  useEffect(() => {
    if (!isActive) return;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isActive, handleKeyDown, handleKeyUp]);

  return (
    <div
      style={{
        display: isActive ? "flex" : "none",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#000",
      }}
    >
      {error && (
        <div style={{ color: "red", padding: "20px" }}>Error: {error}</div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          cursor: "none",
        }}
        tabIndex={0}
      />
    </div>
  );
}

// Basic key code to X11 keysym mapping
function keyCodeToKeysym(key: string, code: string): number | null {
  // ASCII characters
  if (key.length === 1) {
    return key.charCodeAt(0);
  }

  // Special keys (X11 keysyms)
  const specialKeys: Record<string, number> = {
    Backspace: 0xff08,
    Tab: 0xff09,
    Enter: 0xff0d,
    Escape: 0xff1b,
    Delete: 0xffff,
    Home: 0xff50,
    Left: 0xff51,
    Up: 0xff52,
    Right: 0xff53,
    Down: 0xff54,
    PageUp: 0xff55,
    PageDown: 0xff56,
    End: 0xff57,
    Insert: 0xff63,
    F1: 0xffbe,
    F2: 0xffbf,
    F3: 0xffc0,
    F4: 0xffc1,
    F5: 0xffc2,
    F6: 0xffc3,
    F7: 0xffc4,
    F8: 0xffc5,
    F9: 0xffc6,
    F10: 0xffc7,
    F11: 0xffc8,
    F12: 0xffc9,
    ShiftLeft: 0xffe1,
    ShiftRight: 0xffe2,
    ControlLeft: 0xffe3,
    ControlRight: 0xffe4,
    MetaLeft: 0xffe7,
    MetaRight: 0xffe8,
    AltLeft: 0xffe9,
    AltRight: 0xffea,
  };

  return specialKeys[key] || specialKeys[code] || null;
}
