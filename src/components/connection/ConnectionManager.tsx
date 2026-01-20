import { useEffect, useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConnectionProfile } from "../../types";
import { VscAdd, VscTrash } from "react-icons/vsc";

interface ConnectionManagerProps {
  onNewConnection: () => void;
}

export function ConnectionManager({ onNewConnection }: ConnectionManagerProps) {
  const {
    connections,
    loading,
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-10 border-b border-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Connections
        </h3>
        <Button size="sm" className="h-7 text-xs w-15 font-semibold" onClick={onNewConnection}>
          <VscAdd />New 
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Loading...
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/60 text-sm p-4">
          <p className="font-medium">No saved connections</p>
          <p className="text-xs mt-2">Click "+ New" to add a connection</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={cn(
                  "flex items-center px-3 py-2.5 cursor-pointer rounded-lg group transition-colors duration-150",
                  "hover:bg-accent/50",
                  connectingId === conn.id && "opacity-50 pointer-events-none"
                )}
                onClick={() => handleConnect(conn)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate font-medium">{conn.name}</div>
                  <div className="text-xs text-muted-foreground/70 truncate mt-1">
                    {conn.username}@{conn.host}:{conn.port} ({formatAuthType(conn.auth_method)})
                  </div>
                </div>
                <button
                  className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                  onClick={(e) => handleDelete(conn, e)}
                  title="Delete connection"
                >
                  <VscTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Password/Passphrase Modal */}
      <Dialog
        open={!!passwordPrompt}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordPrompt(null);
            setPassword("");
            setPassphrase("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>{passwordPrompt?.connectionName}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordPrompt?.needsPassword && (
              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            {passwordPrompt?.needsPassphrase && (
              <div className="space-y-2">
                <Label htmlFor="auth-passphrase">Key Passphrase</Label>
                <Input
                  id="auth-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoFocus={!passwordPrompt?.needsPassword}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if your key has no passphrase
                </p>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                className="px-4"
                onClick={() => {
                  setPasswordPrompt(null);
                  setPassword("");
                  setPassphrase("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!!connectingId} className="min-w-[100px]">
                {connectingId ? "Connecting..." : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
