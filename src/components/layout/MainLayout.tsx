import { TerminalTabs } from "../terminal/TerminalTabs";
import { Sidebar } from "./Sidebar";
import { useTerminalStore } from "../../stores/terminalStore";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export function MainLayout() {
  const { tabs, activeTabId } = useTerminalStore();

  // Find if the active tab is an SSH session
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeSshSession =
    activeTab?.sessionInfo.session_type.type === "Ssh" ? activeTab.id : null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Title Bar */}
      <header className="flex items-center h-9 bg-card/80 backdrop-blur-sm px-4 select-none border-b border-border/50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-sm font-semibold text-foreground/90 tracking-tight">OpenTerm</span>
      </header>

      {/* Main Content with Resizable Panels */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Sidebar Panel */}
          <ResizablePanel
            id="sidebar"
            defaultSize="20%"
            minSize="150px"
            maxSize="40%"
            className="bg-card overflow-hidden"
          >
            <Sidebar activeSshSession={activeSshSession} />
          </ResizablePanel>

          {/* Resize Handle */}
          <ResizableHandle className="w-[3px] bg-transparent hover:bg-primary/40 transition-colors duration-200" />

          {/* Terminal Panel */}
          <ResizablePanel id="terminal" defaultSize="80%" minSize="40%">
            <div className="h-full flex flex-col overflow-hidden">
              <TerminalTabs />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
