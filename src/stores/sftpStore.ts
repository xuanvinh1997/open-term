import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileEntry, TransferProgress } from "../types";

interface SftpState {
  sftpId: string | null;
  sessionId: string | null;
  currentPath: string;
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  transfers: TransferProgress[];

  // Actions
  openSftp: (sessionId: string) => Promise<void>;
  closeSftp: () => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  createDirectory: (name: string) => Promise<void>;
  deleteItem: (path: string, isDir: boolean) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  download: (remotePath: string, localPath: string) => Promise<void>;
  upload: (localPath: string, remotePath: string) => Promise<void>;
  uploadFolder: (localPath: string, remotePath: string) => Promise<void>;
  updateTransferProgress: (id: string, transferred: number, total: number) => void;
  completeTransfer: (id: string) => void;
  failTransfer: (id: string, error: string) => void;
}

export const useSftpStore = create<SftpState>((set, get) => ({
  sftpId: null,
  sessionId: null,
  currentPath: "/",
  files: [],
  loading: false,
  error: null,
  transfers: [],

  openSftp: async (sessionId) => {
    set({ loading: true, error: null });
    try {
      const sftpId = await invoke<string>("sftp_open", { sessionId });
      const homePath = await invoke<string>("sftp_realpath", { sftpId, path: "." });
      const files = await invoke<FileEntry[]>("sftp_list_dir", { sftpId, path: homePath });

      set({
        sftpId,
        sessionId,
        currentPath: homePath,
        files,
        loading: false,
      });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  closeSftp: async () => {
    const { sftpId } = get();
    if (sftpId) {
      await invoke("sftp_close", { sftpId });
    }
    set({
      sftpId: null,
      sessionId: null,
      currentPath: "/",
      files: [],
    });
  },

  navigateTo: async (path) => {
    const { sftpId } = get();
    if (!sftpId) return;

    set({ loading: true, error: null });
    try {
      const realPath = await invoke<string>("sftp_realpath", { sftpId, path });
      const files = await invoke<FileEntry[]>("sftp_list_dir", { sftpId, path: realPath });
      set({ currentPath: realPath, files, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  refresh: async () => {
    const { sftpId, currentPath } = get();
    if (!sftpId) return;

    set({ loading: true, error: null });
    try {
      const files = await invoke<FileEntry[]>("sftp_list_dir", { sftpId, path: currentPath });
      set({ files, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  createDirectory: async (name) => {
    const { sftpId, currentPath } = get();
    if (!sftpId) return;

    const fullPath = `${currentPath}/${name}`;
    await invoke("sftp_mkdir", { sftpId, path: fullPath });
    await get().refresh();
  },

  deleteItem: async (path, isDir) => {
    const { sftpId } = get();
    if (!sftpId) return;

    await invoke("sftp_delete", { sftpId, path, isDir });
    await get().refresh();
  },

  rename: async (oldPath, newPath) => {
    const { sftpId } = get();
    if (!sftpId) return;

    await invoke("sftp_rename", { sftpId, oldPath, newPath });
    await get().refresh();
  },

  download: async (remotePath, localPath) => {
    const { sftpId } = get();
    if (!sftpId) return;

    const progress = await invoke<TransferProgress>("sftp_download", {
      sftpId,
      remotePath,
      localPath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(progress.id, event.payload[0], event.payload[1]);
      }
    );

    const completeUnsub = await listen<boolean>(
      `transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `transfer-error-${progress.id}`,
      (event) => {
        get().failTransfer(progress.id, event.payload);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );
  },

  upload: async (localPath, remotePath) => {
    const { sftpId } = get();
    if (!sftpId) return;

    const progress = await invoke<TransferProgress>("sftp_upload", {
      sftpId,
      localPath,
      remotePath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(progress.id, event.payload[0], event.payload[1]);
      }
    );

    const completeUnsub = await listen<boolean>(
      `transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        get().refresh();
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `transfer-error-${progress.id}`,
      (event) => {
        get().failTransfer(progress.id, event.payload);
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );
  },

  uploadFolder: async (localPath, remotePath) => {
    const { sftpId } = get();
    if (!sftpId) return;

    const progress = await invoke<TransferProgress>("sftp_upload_folder", {
      sftpId,
      localPath,
      remotePath,
    });

    set((state) => ({
      transfers: [...state.transfers, progress],
    }));

    // Listen for progress events
    const progressUnsub = await listen<[number, number]>(
      `transfer-progress-${progress.id}`,
      (event) => {
        get().updateTransferProgress(progress.id, event.payload[0], event.payload[1]);
      }
    );

    const completeUnsub = await listen<boolean>(
      `transfer-complete-${progress.id}`,
      () => {
        get().completeTransfer(progress.id);
        get().refresh();
        progressUnsub();
        completeUnsub();
        errorUnsub();
      }
    );

    const errorUnsub = await listen<string>(
      `transfer-error-${progress.id}`,
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
