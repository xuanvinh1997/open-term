import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, SessionInfo, AuthMethod } from "../types";

interface ConnectionState {
  connections: ConnectionProfile[];
  loading: boolean;
  error: string | null;

  // Actions
  loadConnections: () => Promise<void>;
  saveConnection: (
    name: string,
    host: string,
    port: number,
    username: string,
    authType: "password" | "publickey" | "agent",
    privateKeyPath?: string,
    password?: string
  ) => Promise<ConnectionProfile>;
  deleteConnection: (id: string) => Promise<void>;
  connectToSaved: (
    connectionId: string,
    password?: string,
    passphrase?: string
  ) => Promise<SessionInfo>;
  connectDirect: (
    host: string,
    port: number,
    username: string,
    auth: AuthMethod
  ) => Promise<SessionInfo>;
  hasStoredPassword: (connectionId: string) => Promise<boolean>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  loading: false,
  error: null,

  loadConnections: async () => {
    set({ loading: true, error: null });
    try {
      const connections = await invoke<ConnectionProfile[]>("list_connections");
      set({ connections, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  saveConnection: async (
    name,
    host,
    port,
    username,
    authType,
    privateKeyPath,
    password
  ) => {
    const profile = await invoke<ConnectionProfile>("save_connection", {
      name,
      host,
      port,
      username,
      authType,
      privateKeyPath,
      password,
    });

    set((state) => ({
      connections: [...state.connections, profile],
    }));

    return profile;
  },

  deleteConnection: async (id) => {
    await invoke("delete_connection", { id });
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    }));
  },

  connectToSaved: async (connectionId, password, passphrase) => {
    return invoke<SessionInfo>("connect_saved", {
      connectionId,
      password,
      passphrase,
    });
  },

  connectDirect: async (host, port, username, auth) => {
    return invoke<SessionInfo>("create_ssh_terminal", {
      host,
      port,
      username,
      auth,
    });
  },

  hasStoredPassword: async (connectionId) => {
    return invoke<boolean>("has_stored_password", { connectionId });
  },
}));
