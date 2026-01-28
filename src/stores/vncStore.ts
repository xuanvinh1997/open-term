import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface VncState {
  sessionId: string | null;
  host: string;
  port: number;
  width: number;
  height: number;
  connected: boolean;
  error: string | null;
  connectionName: string | null;
  connectionId: string | null;

  // Actions
  connect: (
    host: string,
    port: number,
    password?: string,
    connectionName?: string,
    connectionId?: string
  ) => Promise<string>;
  disconnect: () => Promise<void>;
  sendInput: (event: import("../types").VncInputEvent) => Promise<void>;
}

export const useVncStore = create<VncState>((set, get) => ({
  sessionId: null,
  host: "",
  port: 5900,
  width: 1024,
  height: 768,
  connected: false,
  error: null,
  connectionName: null,
  connectionId: null,

  connect: async (host, port, password, connectionName, connectionId) => {
    set({ error: null });
    try {
      const [sessionId, width, height] = await invoke<[string, number, number]>(
        "vnc_connect",
        {
          host,
          port,
          password: password || null,
        }
      );

      set({
        sessionId,
        host,
        port,
        width,
        height,
        connected: true,
        connectionName: connectionName || null,
        connectionId: connectionId || null,
      });

      return sessionId;
    } catch (error) {
      set({ error: String(error), connected: false });
      throw error;
    }
  },

  disconnect: async () => {
    const { sessionId } = get();
    if (sessionId) {
      try {
        await invoke("vnc_disconnect", { sessionId });
      } catch (error) {
        console.error("Failed to disconnect VNC:", error);
      }
    }
    set({
      sessionId: null,
      host: "",
      port: 5900,
      connected: false,
      connectionName: null,
      connectionId: null,
      error: null,
    });
  },

  sendInput: async (event) => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await invoke("vnc_send_input", { sessionId, event });
    } catch (error) {
      console.error("Failed to send VNC input:", error);
    }
  },
}));
