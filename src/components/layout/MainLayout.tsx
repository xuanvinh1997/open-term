import { useRef, useState } from "react";
import { TerminalTabs } from "../terminal/TerminalTabs";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useFtpStore } from "../../stores/ftpStore";
import { SftpBrowser } from "../sftp/SftpBrowser";
import { FtpBrowser } from "../ftp";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
  PanelImperativeHandle,
} from "react-resizable-panels";
import { VscLayoutSidebarLeft } from "react-icons/vsc";
import { Button } from "@heroui/react";

export function MainLayout() {
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const [activeSftpSession, setActiveSftpSession] = useState<string | null>(null);
  const [showFtpBrowser, setShowFtpBrowser] = useState(false);
  const ftpId = useFtpStore((state) => state.ftpId);

  const handleOpenSftp = (sessionId: string) => {
    setActiveSftpSession(sessionId);
    setShowFtpBrowser(false);
  };

  const handleCloseSftp = () => {
    setActiveSftpSession(null);
  };

  const handleOpenFtp = () => {
    setShowFtpBrowser(true);
    setActiveSftpSession(null);
  };

  const handleCloseFtp = () => {
    setShowFtpBrowser(false);
  };

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-[#1e1e1e]">
      {/* Title Bar */}
      <header className="relative flex items-center h-9 bg-neutral-100 dark:bg-[#323233] px-3 select-none border-b border-neutral-300 dark:border-[#2b2b2b] shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={toggleSidebar}
            className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-black/10 dark:data-[hover=true]:bg-white/10 w-6 h-6 min-w-6 rounded-sm"
            aria-label="Toggle Sidebar"
          >
            <VscLayoutSidebarLeft size={15} />
          </Button>
          <ThemeToggle />
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-neutral-500 dark:text-neutral-400 pointer-events-none">OpenTerm</span>
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
            maxSize={400}
            className="bg-neutral-50 dark:bg-[#252526] overflow-hidden flex flex-col"
            collapsible={true}
            collapsedSize={0}
          >
            <Sidebar 
              onOpenSftp={handleOpenSftp}
              onOpenFtp={handleOpenFtp}
            />
          </Panel>

          {/* Resize Handle - hide only when FTP is active */}
          {!showFtpBrowser && (
            <PanelResizeHandle className="w-px hover:w-1 hover:cursor-auto bg-neutral-200 dark:bg-[#2b2b2b] hover:bg-blue-500 transition-all duration-200 outline-none flex justify-center items-center group cursor-col-resize z-10" />
          )}

          {/* Main Content Panel */}
          <Panel id="main-content" defaultSize={80} minSize={40}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* FTP Browser - Full width, hides terminal */}
              {showFtpBrowser && ftpId ? (
                <FtpBrowser onClose={handleCloseFtp} />
              ) : (
                /* SFTP + Terminal Split or Terminal Only */
                <PanelGroup orientation="horizontal" className="h-full">
                  {/* SFTP Browser Panel - Only show when SFTP is active */}
                  {activeSftpSession && (
                    <>
                      <Panel id="sftp" defaultSize={50} minSize={30}>
                        <SftpBrowser
                          sessionId={activeSftpSession}
                          onClose={handleCloseSftp}
                        />
                      </Panel>
                      <PanelResizeHandle className="w-px hover:w-1 hover:cursor-auto bg-neutral-200 dark:bg-[#2b2b2b] hover:bg-blue-500 transition-all duration-200 outline-none flex justify-center items-center group cursor-col-resize z-10" />
                    </>
                  )}
                  {/* Terminal Panel */}
                  <Panel id="terminal" defaultSize={activeSftpSession ? 50 : 100} minSize={30}>
                    <TerminalTabs />
                  </Panel>
                </PanelGroup>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
