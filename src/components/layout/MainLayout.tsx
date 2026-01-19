import { TerminalTabs } from "../terminal/TerminalTabs";
import { Sidebar } from "./Sidebar";
import { useTerminalStore } from "../../stores/terminalStore";
import "./MainLayout.css";

export function MainLayout() {
  const { tabs, activeTabId } = useTerminalStore();

  // Find if the active tab is an SSH session
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeSshSession =
    activeTab?.sessionInfo.session_type.type === "Ssh" ? activeTab.id : null;

  return (
    <div className="main-layout">
      <header className="title-bar">
        <div className="title">OpenTerm</div>
      </header>
      <main className="content">
        <Sidebar activeSshSession={activeSshSession} />
        <div className="terminal-area">
          <TerminalTabs />
        </div>
      </main>
    </div>
  );
}
