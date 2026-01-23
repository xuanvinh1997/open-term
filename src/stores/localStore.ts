import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";

interface LocalState {
  currentPath: string;
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  selectedFiles: Set<string>;

  // Actions
  initialize: () => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  goHome: () => Promise<void>;
  goDownloads: () => Promise<void>;
  selectFile: (path: string) => void;
  toggleFileSelection: (path: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  getSelectedFiles: () => FileEntry[];
}

export const useLocalStore = create<LocalState>((set, get) => ({
  currentPath: "",
  files: [],
  loading: false,
  error: null,
  selectedFiles: new Set(),

  initialize: async () => {
    try {
      const homeDir = await invoke<string>("local_get_home_dir");
      set({ currentPath: homeDir });
      await get().navigateTo(homeDir);
    } catch (error) {
      // If home dir fails, try current directory
      try {
        await get().navigateTo("/");
      } catch (e) {
        set({ error: String(e) });
      }
    }
  },

  navigateTo: async (path: string) => {
    set({ loading: true, error: null, selectedFiles: new Set() });
    try {
      const files = await invoke<FileEntry[]>("local_list_dir", { path });
      set({
        currentPath: path,
        files,
        loading: false,
      });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  navigateUp: async () => {
    const { currentPath } = get();
    const parts = currentPath.split(/[/\\]/);
    if (parts.length <= 1) return; // Already at root
    
    const parentPath = parts.slice(0, -1).join("/") || "/";
    await get().navigateTo(parentPath);
  },

  refresh: async () => {
    const { currentPath } = get();
    await get().navigateTo(currentPath);
  },

  goHome: async () => {
    try {
      const homeDir = await invoke<string>("local_get_home_dir");
      await get().navigateTo(homeDir);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  goDownloads: async () => {
    try {
      const downloadsDir = await invoke<string>("local_get_downloads_dir");
      await get().navigateTo(downloadsDir);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  selectFile: (path: string) => {
    set({ selectedFiles: new Set([path]) });
  },

  toggleFileSelection: (path: string) => {
    const { selectedFiles } = get();
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(path)) {
      newSelection.delete(path);
    } else {
      newSelection.add(path);
    }
    set({ selectedFiles: newSelection });
  },

  clearSelection: () => {
    set({ selectedFiles: new Set() });
  },

  selectAll: () => {
    const { files } = get();
    const allPaths = new Set(files.map((f) => f.path));
    set({ selectedFiles: allPaths });
  },

  getSelectedFiles: () => {
    const { files, selectedFiles } = get();
    return files.filter((f) => selectedFiles.has(f.path));
  },
}));
