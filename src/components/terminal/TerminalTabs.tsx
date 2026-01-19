import { useTerminalStore } from "../../stores/terminalStore";
import { Terminal } from "./Terminal";
import "./TerminalTabs.css";

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
    <div className="terminal-tabs-container">
      <div className="tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(e, tab.id)}
              title="Close terminal"
            >
              ×
            </button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={handleNewTab} title="New terminal">
          +
        </button>
      </div>
      <div className="terminals-container">
        {tabs.map((tab) => (
          <Terminal
            key={tab.id}
            sessionId={tab.id}
            isActive={activeTabId === tab.id}
          />
        ))}
        {tabs.length === 0 && (
          <div className="empty-state">
            <p>No terminals open</p>
            <button onClick={handleNewTab}>Open Terminal</button>
          </div>
        )}
      </div>
    </div>
  );
}
