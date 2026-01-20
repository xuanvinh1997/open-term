import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileEntry, TransferProgress } from "../types";

interface FtpState {
  ftpId: string | null;
  host: string;
  currentPath: string;
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  transfers: TransferProgress[];

  // Actions
  connect: (
    host: string,
    port: number,
    username?: string,
    password?: string
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  createDirectory: (name: string) => Promise<void>;
  deleteItem: (path: string, isDir: boolean) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  download: (remotePath: string, localPath: string) => Promise<void>;
  upload: (localPath: string, remotePath: string) => Promise<void>;
  uploadFolder: (localPath: string, remotePath: string) => Promise<void>;
  updateTransferProgress: (
    id: string,
    transferred: number,
    total: number
  ) => void;
  completeTransfer: (id: string) => void;
  failTransfer: (id: string, error: string) => void;
}

export const useFtpStore = create<FtpState>((set, get) => ({
  ftpId: null,
  host: "",
  currentPath: "/",
  files: [],
  loading: false,
  error: null,
  transfers: [],

  connect: async (host, port, username, password) => {
    set({ loading: true, error: null });
    try {
      const ftpId = await invoke<string>("ftp_connect", {
        host,
        port,
        username: username || null,
        password: password || null,
      });

      // Get the current working directory
      const currentPath = await invoke<string>("ftp_pwd", { ftpId });
      const files = await invoke<FileEntry[]>("ftp_list_dir", {
        ftpId,
        path: currentPath,
      });

      set({
        ftpId,
        host,
        currentPath,
        files,
        loading: false,
      });
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  disconnect: async () => {
    const { ftpId } = get();
    if (ftpId) {
      await invoke("ftp_disconnect", { ftpId });
    }
    set({
      ftpId: null,
      host: "",
      currentPath: "/",
      files: [],
    });
  },

  navigateTo: async (path) => {
    const { ftpId } = get();
    if (!ftpId) return;

    set({ loading: true, error: null });
    try {
      const files = await invoke<FileEntry[]>("ftp_list_dir", { ftpId, path });
      // Get the actual current path after navigation
      const currentPath = await invoke<string>("ftp_pwd", { ftpId });
      set({ currentPath, files, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  refresh: async () => {
    const { ftpId, currentPath } = get();
    if (!ftpId) return;

    set({ loading: true, error: null });
    try {
      const files = await invoke<FileEntry[]>("ftp_list_dir", {
        ftpId,
        path: currentPath,
      });
      set({ files, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  createDirectory: async (name) => {
    const { ftpId, currentPath } = get();
    if (!ftpId) return;

    const fullPath = `${currentPath}/${name}`;
    await invoke("ftp_mkdir", { ftpId, path: fullPath });
    await get().refresh();
  },

  deleteItem: async (path, isDir) => {
    const { ftpId } = get();
    if (!ftpId) return;

    await invoke("ftp_delete", { ftpId, path, isDir });
    await get().refresh();
  },

  rename: async (oldPath, newPath) => {
    const { ftpId } = get();
    if (!ftpId) return;

    await invoke("ftp_rename", { ftpId, fromPath: oldPath, toPath: newPath });
    await get().refresh();
  },

  download: async (remotePath, localPath) => {
    const { ftpId } = get();
    if (!ftpId) return;

    const progress = await invoke<TransferProgress>("ftp_download", {
      ftpId,
      remotePath,
      localPath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `ftp-transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(
          progress.id,
          event.payload[0],
          event.payload[1]
        );
      }
    );

    const completeUnsub = await listen<boolean>(
      `ftp-transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `ftp-transfer-error-${progress.id}`,
      (event) => {
        get().failTransfer(progress.id, event.payload);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );
  },

  upload: async (localPath, remotePath) => {
    const { ftpId } = get();
    if (!ftpId) return;

    const progress = await invoke<TransferProgress>("ftp_upload", {
      ftpId,
      localPath,
      remotePath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `ftp-transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(
          progress.id,
          event.payload[0],
          event.payload[1]
        );
      }
    );

    const completeUnsub = await listen<boolean>(
      `ftp-transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        get().refresh();
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `ftp-transfer-error-${progress.id}`,
      (event) => {
        get().failTransfer(progress.id, event.payload);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );
  },

  uploadFolder: async (localPath, remotePath) => {
    const { ftpId } = get();
    if (!ftpId) return;

    const progress = await invoke<TransferProgress>("ftp_upload_folder", {
      ftpId,
      localPath,
      remotePath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `ftp-transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(
          progress.id,
          event.payload[0],
          event.payload[1]
        );
      }
    );

    const completeUnsub = await listen<boolean>(
      `ftp-transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        get().refresh();
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `ftp-transfer-error-${progress.id}`,
      (event) => {
        get().failTransfer(progress.id, event.payload);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );
  },

  updateTransferProgress: (id, transferred, total) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id
          ? { ...t, transferred_bytes: transferred, total_bytes: total }
          : t
      ),
    }));
  },

  completeTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, status: "Completed" as const } : t
      ),
    }));
  },

  failTransfer: (id, error) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, status: { Failed: error } } : t
      ),
    }));
  },
}));
