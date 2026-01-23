import { useTerminalStore } from "../../stores/terminalStore";
import { Terminal } from "./Terminal";
import { cn } from "@/lib/utils";

export function TerminalTabs() {
  const { tabs, activeTabId, createTerminal, closeTerminal, setActiveTab } =
    useTerminalStore();

  const handleNewTab = async () => {
    await createTerminal();
  };

  const handleCloseTab = async (
    e: React.MouseEvent,
    tabId: string
  ) => {
    e.stopPropagation();
    await closeTerminal(tabId);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center h-10 bg-neutral-200 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-700 overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-4 h-full border-r border-neutral-300 dark:border-neutral-700 cursor-pointer select-none transition-colors group min-w-[120px] max-w-[200px]",
              activeTabId === tab.id
                ? "bg-neutral-300 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                : "bg-neutral-200 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="flex-1 truncate text-sm">{tab.title}</span>
            <button
              className="flex items-center justify-center w-5 h-5 rounded hover:bg-neutral-400 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              onClick={(e) => handleCloseTab(e, tab.id)}
              title="Close terminal"
            >
              ×
            </button>
          </div>
        ))}
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
        {tabs.length === 0 && (
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
