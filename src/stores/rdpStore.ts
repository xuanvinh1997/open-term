import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface RdpState {
  sessionId: string | null;
  host: string;
  port: number;
  username: string;
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
    username: string,
    password: string,
    domain?: string,
    width?: number,
    height?: number,
    connectionName?: string,
    connectionId?: string
  ) => Promise<string>;
  disconnect: () => Promise<void>;
  sendInput: (event: import("../types").RdpInputEvent) => Promise<void>;
}

export const useRdpStore = create<RdpState>((set, get) => ({
  sessionId: null,
  host: "",
  port: 3389,
  username: "",
  width: 1920,
  height: 1080,
  connected: false,
  error: null,
  connectionName: null,
  connectionId: null,

  connect: async (
    host,
    port,
    username,
    password,
    domain,
    width = 1920,
    height = 1080,
    connectionName,
    connectionId
  ) => {
    set({ error: null });
    try {
      const sessionId = await invoke<string>("rdp_connect", {
        host,
        port,
        username,
        password,
        domain: domain || null,
        width,
        height,
      });

      set({
        sessionId,
        host,
        port,
        username,
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
        await invoke("rdp_disconnect", { sessionId });
      } catch (error) {
        console.error("Failed to disconnect RDP:", error);
      }
    }
    set({
      sessionId: null,
      host: "",
      port: 3389,
      username: "",
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
      await invoke("rdp_send_input", { sessionId, event });
    } catch (error) {
      console.error("Failed to send RDP input:", error);
    }
  },
}));
