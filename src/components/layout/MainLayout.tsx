import { useRef, useState } from "react";
import { TerminalTabs } from "../terminal/TerminalTabs";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useTerminalStore } from "../../stores/terminalStore";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
  PanelImperativeHandle,
} from "react-resizable-panels";
import { VscLayoutSidebarLeft } from "react-icons/vsc";
import { Button } from "@heroui/react";

export function MainLayout() {
  const { tabs, activeTabId } = useTerminalStore();
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const [sidebarActiveTab, setSidebarActiveTab] = useState<"connections" | "sftp" | "ftp">("connections");

  // Find if the active tab is an SSH session
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeSshSession =
    activeTab?.sessionInfo.session_type.type === "Ssh" ? activeTab.id : null;

  const toggleSidebar = () => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      if (sidebar.isCollapsed()) {
        sidebar.expand();
      } else {
        sidebar.collapse();
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-neutral-950">
      {/* Title Bar */}
      <header className="flex items-center h-9 bg-neutral-200 dark:bg-neutral-900/80 backdrop-blur-sm px-4 select-none border-b border-neutral-300 dark:border-white/10 shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="flex items-center gap-2 mr-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={toggleSidebar}
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-black/10 dark:data-[hover=true]:bg-white/10 w-6 h-6 min-w-6 rounded-sm"
            aria-label="Toggle Sidebar"
          >
            <VscLayoutSidebarLeft size={16} />
          </Button>
          <ThemeToggle />
        </div>
        <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">OpenTerm</span>
      </header>

      {/* Main Content with Resizable Panels */}
      <main className="flex-1 overflow-hidden h-full">
        <PanelGroup orientation="horizontal" className="h-full w-full">
          {/* Sidebar Panel */}
          <Panel
            panelRef={sidebarRef}
            id="sidebar"
            // defaultSize={15}
            // minSize={15}
            maxSize={500}
            className="bg-neutral-100 dark:bg-neutral-900 overflow-hidden flex flex-col"
            collapsible={true}
            collapsedSize={0}
          >
            <Sidebar 
              activeSshSession={activeSshSession}
              activeTab={sidebarActiveTab}
              onActiveTabChange={setSidebarActiveTab}
            />
          </Panel>

          {/* Resize Handle - only show when terminal is visible */}
          {sidebarActiveTab !== "ftp" && (
            <PanelResizeHandle className="w-1 hover:cursor-auto bg-neutral-300 dark:bg-neutral-800 hover:bg-blue-600/50 transition-colors duration-200 outline-none flex justify-center items-center group cursor-col-resize z-10" />
          )}

          {/* Terminal Panel - hide only when FTP is active, keep visible for SFTP */}
          {sidebarActiveTab !== "ftp" && (
            <Panel id="terminal" defaultSize={80} minSize={40}>
              <div className="h-full flex flex-col overflow-hidden">
                <TerminalTabs />
              </div>
            </Panel>
          )}
        </PanelGroup>
      </main>
    </div>
  );
}
