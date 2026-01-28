import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SessionInfo, TerminalTab, FtpTab, SftpTab, VncTab, RdpTab } from "../types";

interface TerminalState {
  tabs: TerminalTab[];
  ftpTabs: FtpTab[];
  sftpTabs: SftpTab[];
  vncTabs: VncTab[];
  rdpTabs: RdpTab[];
  activeTabId: string | null;

  // Actions
  createTerminal: () => Promise<string>;
  closeTerminal: (tabId: string) => Promise<void>;
  addFtpTab: (ftpTab: FtpTab) => void;
  closeFtpTab: (tabId: string) => void;
  addSftpTab: (sftpTab: SftpTab) => void;
  closeSftpTab: (tabId: string) => void;
  addVncTab: (vncTab: VncTab) => void;
  closeVncTab: (tabId: string) => void;
  addRdpTab: (rdpTab: RdpTab) => void;
  closeRdpTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, _get) => ({
  tabs: [],
  ftpTabs: [],
  sftpTabs: [],
  vncTabs: [],
  rdpTabs: [],
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

  addFtpTab: (ftpTab: FtpTab) => {
    set((state) => ({
      ftpTabs: [...state.ftpTabs, ftpTab],
      activeTabId: ftpTab.id,
    }));
  },

  closeFtpTab: (tabId: string) => {
    set((state) => {
      const newFtpTabs = state.ftpTabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIndex = state.ftpTabs.findIndex((tab) => tab.id === tabId);
        if (newFtpTabs.length > 0) {
          newActiveTabId =
            newFtpTabs[Math.min(closedIndex, newFtpTabs.length - 1)]?.id ?? null;
        } else if (state.sftpTabs.length > 0) {
          newActiveTabId = state.sftpTabs[0]?.id ?? null;
        } else if (state.vncTabs.length > 0) {
          newActiveTabId = state.vncTabs[0]?.id ?? null;
        } else if (state.rdpTabs.length > 0) {
          newActiveTabId = state.rdpTabs[0]?.id ?? null;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        ftpTabs: newFtpTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  addSftpTab: (sftpTab: SftpTab) => {
    set((state) => ({
      sftpTabs: [...state.sftpTabs, sftpTab],
      activeTabId: sftpTab.id,
    }));
  },

  closeSftpTab: (tabId: string) => {
    set((state) => {
      const newSftpTabs = state.sftpTabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIndex = state.sftpTabs.findIndex((tab) => tab.id === tabId);
        if (newSftpTabs.length > 0) {
          newActiveTabId =
            newSftpTabs[Math.min(closedIndex, newSftpTabs.length - 1)]?.id ?? null;
        } else if (state.tabs.length > 0) {
          newActiveTabId = state.tabs[0]?.id ?? null;
        } else if (state.ftpTabs.length > 0) {
          newActiveTabId = state.ftpTabs[0]?.id ?? null;
        } else if (state.vncTabs.length > 0) {
          newActiveTabId = state.vncTabs[0]?.id ?? null;
        } else if (state.rdpTabs.length > 0) {
          newActiveTabId = state.rdpTabs[0]?.id ?? null;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        sftpTabs: newSftpTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  addVncTab: (vncTab: VncTab) => {
    set((state) => ({
      vncTabs: [...state.vncTabs, vncTab],
      activeTabId: vncTab.id,
    }));
  },

  closeVncTab: (tabId: string) => {
    set((state) => {
      const newVncTabs = state.vncTabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIndex = state.vncTabs.findIndex((tab) => tab.id === tabId);
        if (newVncTabs.length > 0) {
          newActiveTabId =
            newVncTabs[Math.min(closedIndex, newVncTabs.length - 1)]?.id ?? null;
        } else if (state.tabs.length > 0) {
          newActiveTabId = state.tabs[0]?.id ?? null;
        } else if (state.ftpTabs.length > 0) {
          newActiveTabId = state.ftpTabs[0]?.id ?? null;
        } else if (state.sftpTabs.length > 0) {
          newActiveTabId = state.sftpTabs[0]?.id ?? null;
        } else if (state.rdpTabs.length > 0) {
          newActiveTabId = state.rdpTabs[0]?.id ?? null;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        vncTabs: newVncTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  addRdpTab: (rdpTab: RdpTab) => {
    set((state) => ({
      rdpTabs: [...state.rdpTabs, rdpTab],
      activeTabId: rdpTab.id,
    }));
  },

  closeRdpTab: (tabId: string) => {
    set((state) => {
      const newRdpTabs = state.rdpTabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIndex = state.rdpTabs.findIndex((tab) => tab.id === tabId);
        if (newRdpTabs.length > 0) {
          newActiveTabId =
            newRdpTabs[Math.min(closedIndex, newRdpTabs.length - 1)]?.id ?? null;
        } else if (state.tabs.length > 0) {
          newActiveTabId = state.tabs[0]?.id ?? null;
        } else if (state.ftpTabs.length > 0) {
          newActiveTabId = state.ftpTabs[0]?.id ?? null;
        } else if (state.sftpTabs.length > 0) {
          newActiveTabId = state.sftpTabs[0]?.id ?? null;
        } else if (state.vncTabs.length > 0) {
          newActiveTabId = state.vncTabs[0]?.id ?? null;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        rdpTabs: newRdpTabs,
        activeTabId: newActiveTabId,
      };
    });
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
