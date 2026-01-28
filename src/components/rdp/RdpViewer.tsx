import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { RdpInputEvent } from "../../types";
import { toast } from "sonner";

interface RdpViewerProps {
  sessionId: string;
  width: number;
  height: number;
  isActive: boolean;
}

// Throttle function for mouse move events
function throttle<T extends (...args: Parameters<T>) => void>(
  func: T,
  limit: number
): T {
  let lastCall = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func(...args);
    }
  }) as T;
}

export function RdpViewer({ sessionId, width, height, isActive }: RdpViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  const sendInput = useCallback(
    async (event: RdpInputEvent) => {
      try {
        await invoke("rdp_send_input", { sessionId, event });
      } catch (err) {
        console.error("Failed to send RDP input:", err);
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
        `rdp-frame-${sessionId}`,
        (event) => {
          const data = new Uint8ClampedArray(event.payload);
          const imageData = new ImageData(data, width, height);
          ctx.putImageData(imageData, 0, 0);
        }
      );

      // Error events
      unlistenError = await listen<string>(`rdp-error-${sessionId}`, (event) => {
        setError(event.payload);
        toast.error(`RDP error: ${event.payload}`);
      });
    };

    setupListeners();

    return () => {
      if (unlistenFrame) unlistenFrame();
      if (unlistenError) unlistenError();
    };
  }, [sessionId, width, height]);

  // Mouse event handlers - throttled to 60 FPS to reduce lag
  const handleMouseMoveRaw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      sendInput({
        type: "mouse_move",
        x,
        y,
      });
    },
    [width, height, sendInput]
  );

  // Throttle mouse move to ~60 FPS (16ms)
  const handleMouseMove = useMemo(
    () => throttle(handleMouseMoveRaw, 16),
    [handleMouseMoveRaw]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      // RDP button: 1=left, 2=right, 3=middle
      let button = 1;
      if (e.button === 0) button = 1;
      else if (e.button === 1) button = 3;
      else if (e.button === 2) button = 2;

      sendInput({
        type: "mouse_button",
        button,
        down: true,
        x,
        y,
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

      let button = 1;
      if (e.button === 0) button = 1;
      else if (e.button === 1) button = 3;
      else if (e.button === 2) button = 2;

      sendInput({
        type: "mouse_button",
        button,
        down: false,
        x,
        y,
      });
    },
    [width, height, sendInput]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      sendInput({
        type: "mouse_wheel",
        delta: -Math.sign(e.deltaY) * 120, // Standard wheel delta
        x,
        y,
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

      const scancode = keyCodeToScancode(e.code);
      if (scancode) {
        sendInput({ type: "keyboard", scancode, down: true });
      }
    },
    [isActive, sendInput]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;
      e.preventDefault();

      const scancode = keyCodeToScancode(e.code);
      if (scancode) {
        sendInput({ type: "keyboard", scancode, down: false });
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
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          cursor: "default",
        }}
        tabIndex={0}
      />
    </div>
  );
}

// Basic key code to RDP scancode mapping (simplified)
function keyCodeToScancode(code: string): number | null {
  const scancodes: Record<string, number> = {
    Escape: 0x01,
    Digit1: 0x02,
    Digit2: 0x03,
    Digit3: 0x04,
    Digit4: 0x05,
    Digit5: 0x06,
    Digit6: 0x07,
    Digit7: 0x08,
    Digit8: 0x09,
    Digit9: 0x0a,
    Digit0: 0x0b,
    Minus: 0x0c,
    Equal: 0x0d,
    Backspace: 0x0e,
    Tab: 0x0f,
    KeyQ: 0x10,
    KeyW: 0x11,
    KeyE: 0x12,
    KeyR: 0x13,
    KeyT: 0x14,
    KeyY: 0x15,
    KeyU: 0x16,
    KeyI: 0x17,
    KeyO: 0x18,
    KeyP: 0x19,
    BracketLeft: 0x1a,
    BracketRight: 0x1b,
    Enter: 0x1c,
    ControlLeft: 0x1d,
    KeyA: 0x1e,
    KeyS: 0x1f,
    KeyD: 0x20,
    KeyF: 0x21,
    KeyG: 0x22,
    KeyH: 0x23,
    KeyJ: 0x24,
    KeyK: 0x25,
    KeyL: 0x26,
    Semicolon: 0x27,
    Quote: 0x28,
    Backquote: 0x29,
    ShiftLeft: 0x2a,
    Backslash: 0x2b,
    KeyZ: 0x2c,
    KeyX: 0x2d,
    KeyC: 0x2e,
    KeyV: 0x2f,
    KeyB: 0x30,
    KeyN: 0x31,
    KeyM: 0x32,
    Comma: 0x33,
    Period: 0x34,
    Slash: 0x35,
    ShiftRight: 0x36,
    NumpadMultiply: 0x37,
    AltLeft: 0x38,
    Space: 0x39,
    CapsLock: 0x3a,
    F1: 0x3b,
    F2: 0x3c,
    F3: 0x3d,
    F4: 0x3e,
    F5: 0x3f,
    F6: 0x40,
    F7: 0x41,
    F8: 0x42,
    F9: 0x43,
    F10: 0x44,
    Home: 0x47,
    ArrowUp: 0x48,
    PageUp: 0x49,
    ArrowLeft: 0x4b,
    ArrowRight: 0x4d,
    End: 0x4f,
    ArrowDown: 0x50,
    PageDown: 0x51,
    Insert: 0x52,
    Delete: 0x53,
  };

  return scancodes[code] || null;
}
