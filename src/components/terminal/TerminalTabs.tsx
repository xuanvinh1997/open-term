import { useTerminalStore } from "../../stores/terminalStore";
import { useFtpStore } from "../../stores/ftpStore";
import { Terminal } from "./Terminal";
import { FtpBrowser } from "../ftp/FtpBrowser";
import { cn } from "@/lib/utils";
import { VscTerminal, VscCloud } from "react-icons/vsc";

export function TerminalTabs() {
  const { tabs, ftpTabs, activeTabId, createTerminal, closeTerminal, closeFtpTab, setActiveTab } =
    useTerminalStore();
  const { disconnect: ftpDisconnect } = useFtpStore();

  const allTabs = [...tabs, ...ftpTabs.map(t => ({ ...t, isFtp: true }))];

  const handleNewTab = async () => {
    await createTerminal();
  };

  const handleCloseTab = async (
    e: React.MouseEvent,
    tabId: string,
    isFtp: boolean
  ) => {
    e.stopPropagation();
    if (isFtp) {
      await ftpDisconnect();
      closeFtpTab(tabId);
    } else {
      await closeTerminal(tabId);
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center h-10 bg-neutral-200 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-700 overflow-x-auto shrink-0">
        {allTabs.map((tab) => {
          const isFtp = 'isFtp' in tab && tab.isFtp;
          return (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-2 px-3 h-full border-r border-neutral-300 dark:border-neutral-700 cursor-pointer select-none transition-colors group min-w-[120px] max-w-[200px]",
                activeTabId === tab.id
                  ? "bg-neutral-300 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  : "bg-neutral-200 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {isFtp ? (
                <VscCloud className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <VscTerminal className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate text-sm">{tab.title}</span>
              <button
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-neutral-400 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                onClick={(e) => handleCloseTab(e, tab.id, isFtp)}
                title={isFtp ? "Close FTP" : "Close terminal"}
              >
                ×
              </button>
            </div>
          );
        })}
        <button 
          className="flex items-center justify-center px-3 h-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-300 dark:hover:bg-neutral-800 transition-colors border-r border-neutral-300 dark:border-neutral-700" 
          onClick={handleNewTab} 
          title="New terminal"
        >
          +
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {tabs.map((tab) => (
          <Terminal
            key={tab.id}
            sessionId={tab.id}
            isActive={activeTabId === tab.id}
          />
        ))}
        {ftpTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0",
              activeTabId === tab.id ? "block" : "hidden"
            )}
          >
            <FtpBrowser onClose={() => {}} />
          </div>
        ))}
        {allTabs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 dark:text-neutral-400">
            <p className="mb-4">No terminals open</p>
            <button 
              onClick={handleNewTab}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Open Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
