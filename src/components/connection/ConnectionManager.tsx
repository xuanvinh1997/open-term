import { useEffect, useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { Button, Input, Modal, TextField} from "@heroui/react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ConnectionProfile } from "../../types";
import { VscAdd, VscTrash } from "react-icons/vsc";

interface ConnectionManagerProps {
  onNewConnection: () => void;
}

export function ConnectionManager({ onNewConnection }: ConnectionManagerProps) {
  const {
    connections,
    loading,
    error,
    loadConnections,
    deleteConnection,
    connectToSaved,
    hasStoredPassword,
  } = useConnectionStore();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    connectionId: string;
    connectionName: string;
    needsPassword: boolean;
    needsPassphrase: boolean;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<ConnectionProfile | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const handleConnect = async (connection: ConnectionProfile) => {
    // Check if we need to prompt for password/passphrase
    const hasPassword = await hasStoredPassword(connection.id);
    const needsPassword =
      connection.auth_method.auth_type === "Password" && !hasPassword;
    const needsPassphrase = connection.auth_method.auth_type === "PublicKey";

    if (needsPassword || needsPassphrase) {
      setPasswordPrompt({
        connectionId: connection.id,
        connectionName: connection.name,
        needsPassword,
        needsPassphrase,
      });
      return;
    }

    await doConnect(connection.id, connection.name);
  };

  const doConnect = async (
    connectionId: string,
    connectionName: string,
    pwd?: string,
    phrase?: string
  ) => {
    setConnectingId(connectionId);

    try {
      const sessionInfo = await connectToSaved(connectionId, pwd, phrase);

      useTerminalStore.setState((state) => ({
        tabs: [
          ...state.tabs,
          {
            id: sessionInfo.id,
            title: sessionInfo.title,
            sessionInfo,
          },
        ],
        activeTabId: sessionInfo.id,
      }));

      toast.success(`Connected to ${connectionName}`);
      setPasswordPrompt(null);
      setPassword("");
      setPassphrase("");
    } catch (err) {
      toast.error(`Connection failed: ${String(err)}`);
    } finally {
      setConnectingId(null);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPrompt) return;

    await doConnect(
      passwordPrompt.connectionId,
      passwordPrompt.connectionName,
      passwordPrompt.needsPassword ? password : undefined,
      passwordPrompt.needsPassphrase ? passphrase : undefined
    );
  };

  const handleDelete = (connection: ConnectionProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(connection);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteConnection(deleteConfirm.id);
      toast.success(`Connection "${deleteConfirm.name}" deleted`);
    } catch (err) {
      toast.error(`Failed to delete: ${err}`);
    }
    setDeleteConfirm(null);
  };

  const formatAuthType = (authMethod: ConnectionProfile["auth_method"]) => {
    switch (authMethod.auth_type) {
      case "Password":
        return "Password";
      case "PublicKey":
        return "Key";
      case "Agent":
        return "Agent";
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between h-10 border-b border-neutral-300 dark:border-white/10 shrink-0 px-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 select-none">
          Connections
        </h3>
        <Button size="sm" variant="ghost" className="h-6 text-xs min-w-16 bg-blue-500 text-white dark:bg-blue-600 dark:text-white hover:bg-blue-600 dark:hover:bg-blue-700 font-medium gap-1 flex" onPress={onNewConnection}>
          <VscAdd /> New
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-center p-4 text-red-500 text-sm h-32 text-center">
          Error: {error}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-32 text-neutral-600 dark:text-neutral-400 text-sm">
          Loading...
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-neutral-500 dark:text-neutral-400 text-sm p-4">
          <p className="font-medium">No saved connections</p>
          <p className="text-xs mt-2">Click "+ New" to add a connection</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="p-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={cn(
                  "flex items-center px-3 py-2.5 cursor-pointer rounded-lg group transition-colors duration-150",
                  "hover:bg-neutral-200 dark:hover:bg-neutral-700/50",
                  connectingId === conn.id && "opacity-50 pointer-events-none"
                )}
                onClick={() => handleConnect(conn)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate font-medium">{conn.name}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-1">
                    {conn.username}@{conn.host}:{conn.port} ({formatAuthType(conn.auth_method)})
                  </div>
                </div>
                <button
                  className="p-1.5 text-neutral-600 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                  onClick={(e) => handleDelete(conn, e)}
                  title="Delete connection"
                >
                  <VscTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Password/Passphrase Modal */}
      <Modal
        isOpen={!!passwordPrompt}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPasswordPrompt(null);
            setPassword("");
            setPassphrase("");
          }
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <form onSubmit={handlePasswordSubmit}>
                <Modal.Header>
                  <Modal.Heading>Enter Credentials</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="py-4 gap-4">
                  {passwordPrompt?.needsPassword && (
                    <TextField className="space-y-2">
                      <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="conn-password">Password</label>
                      <Input variant="secondary" 
                        id="conn-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                        className="w-full h-10"
                      />
                    </TextField>
                  )}
                  {passwordPrompt?.needsPassphrase && (
                    <TextField className="space-y-2">
                      <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100" htmlFor="conn-passphrase">Key Passphrase</label>
                      <Input variant="secondary" 
                        id="conn-passphrase"
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        autoFocus={!passwordPrompt?.needsPassword}
                        className="w-full h-10"
                      />
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Leave empty if your key has no passphrase
                      </p>
                    </TextField>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    type="button"
                    variant="ghost"
                    onPress={() => {
                      setPasswordPrompt(null);
                      setPassword("");
                      setPassphrase("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                    Connect
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteConfirm(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Delete Connection</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="py-4">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Are you sure you want to delete the connection <strong>"{deleteConfirm?.name}"</strong>? This action cannot be undone.
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  type="button"
                  variant="ghost"
                  onPress={() => setDeleteConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onPress={confirmDelete}
                >
                  Delete
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

    </div>
  );
}
