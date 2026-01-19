import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SessionInfo, TerminalTab } from "../types";

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;

  // Actions
  createTerminal: () => Promise<string>;
  closeTerminal: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, _get) => ({
  tabs: [],
  activeTabId: null,

  createTerminal: async () => {
    const sessionInfo = await invoke<SessionInfo>("create_terminal");

    const newTab: TerminalTab = {
      id: sessionInfo.id,
      title: sessionInfo.title,
      sessionInfo,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    return newTab.id;
  },

  closeTerminal: async (tabId: string) => {
    await invoke("close_terminal", { sessionId: tabId });

    set((state) => {
      const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        // Select adjacent tab or null if no tabs left
        const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId);
        if (newTabs.length > 0) {
          newActiveTabId =
            newTabs[Math.min(closedIndex, newTabs.length - 1)]?.id ?? null;
        } else {
          newActiveTabId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveTabId };
    });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  updateTabTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, title } : tab
      ),
    }));
  },
}));
