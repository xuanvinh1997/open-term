import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useFtpStore } from "../../stores/ftpStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { AuthMethod } from "../../types";

interface ConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (sessionId: string) => void;
  onFtpConnected?: () => void;
  defaultTab?: "ssh" | "ftp";
}

type AuthType = "password" | "publickey" | "agent";

export function ConnectionForm({
  open,
  onClose,
  onConnected,
  onFtpConnected,
  defaultTab = "ssh",
}: ConnectionFormProps) {
  const [connectionType, setConnectionType] = useState<"ssh" | "ftp">(defaultTab);

  // SSH state
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<AuthType>("password");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveConnection, setSaveConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FTP state
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState(21);
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [useAnonymous, setUseAnonymous] = useState(false);

  const { saveConnection: saveConn, connectDirect } = useConnectionStore();
  const { connect: ftpConnect } = useFtpStore();

  const resetForm = () => {
    // SSH
    setName("");
    setHost("");
    setPort(22);
    setUsername("");
    setAuthType("password");
    setPassword("");
    setPrivateKeyPath("");
    setPassphrase("");
    setSaveConnection(false);
    setError(null);
    // FTP
    setFtpHost("");
    setFtpPort(21);
    setFtpUsername("");
    setFtpPassword("");
    setUseAnonymous(false);
  };

  const handleClose = () => {
    if (!connecting) {
      resetForm();
      setConnectionType(defaultTab);
      onClose();
    }
  };

  const handleSshConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      let auth: AuthMethod;
      switch (authType) {
        case "password":
          auth = { type: "Password", password };
          break;
        case "publickey":
          auth = {
            type: "PublicKey",
            private_key_path: privateKeyPath,
            passphrase: passphrase || undefined,
          };
          break;
        case "agent":
          auth = { type: "Agent" };
          break;
      }

      // Save connection if requested
      if (saveConnection && name) {
        await saveConn(
          name,
          host,
          port,
          username,
          authType,
          authType === "publickey" ? privateKeyPath : undefined,
          authType === "password" ? password : undefined
        );
      }

      // Connect
      const sessionInfo = await connectDirect(host, port, username, auth);

      // Add to terminal tabs
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

      toast.success(`Successfully connected to ${host}`);
      onConnected?.(sessionInfo.id);
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleFtpConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      if (useAnonymous) {
        await ftpConnect(ftpHost, ftpPort);
      } else {
        await ftpConnect(ftpHost, ftpPort, ftpUsername, ftpPassword);
      }

      toast.success(`Successfully connected to ${ftpHost}`);
      onFtpConnected?.();
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Connection failed: ${errorMsg}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Connection</DialogTitle>
        </DialogHeader>

        <Tabs
          value={connectionType}
          onValueChange={(v) => {
            setConnectionType(v as "ssh" | "ftp");
            setError(null);
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="ssh" className="text-sm">
              SSH
            </TabsTrigger>
            <TabsTrigger value="ftp" className="text-sm">
              FTP
            </TabsTrigger>
          </TabsList>

          {/* SSH Form */}
          <TabsContent value="ssh" className="mt-0">
            <form onSubmit={handleSshConnect} className="space-y-4">
              {error && connectionType === "ssh" && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ssh-host">Host</Label>
                <Input
                  id="ssh-host"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="hostname or IP"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ssh-port">Port</Label>
                  <Input
                    id="ssh-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                    min={1}
                    max={65535}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ssh-username">Username</Label>
                  <Input
                    id="ssh-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Authentication */}
              <div className="space-y-2">
                <Label>Authentication</Label>
                <div className="flex gap-4">
                  {(["password", "publickey", "agent"] as const).map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground"
                    >
                      <input
                        type="radio"
                        name="authType"
                        value={type}
                        checked={authType === type}
                        onChange={() => setAuthType(type)}
                        className="cursor-pointer accent-primary"
                      />
                      {type === "password"
                        ? "Password"
                        : type === "publickey"
                          ? "Public Key"
                          : "SSH Agent"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Password field */}
              {authType === "password" && (
                <div className="space-y-2">
                  <Label htmlFor="ssh-password">Password</Label>
                  <Input
                    id="ssh-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {/* Public key fields */}
              {authType === "publickey" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="privateKeyPath">Private Key Path</Label>
                    <Input
                      id="privateKeyPath"
                      type="text"
                      value={privateKeyPath}
                      onChange={(e) => setPrivateKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">Passphrase (optional)</Label>
                    <Input
                      id="passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Save connection checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveConnection}
                    onChange={(e) => setSaveConnection(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Save connection
                </label>
              </div>

              {/* Connection name (shown when save is checked) */}
              {saveConnection && (
                <div className="space-y-2">
                  <Label htmlFor="connectionName">Connection Name</Label>
                  <Input
                    id="connectionName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Server"
                    required={saveConnection}
                  />
                </div>
              )}

              <DialogFooter className="gap-2 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={connecting} className="min-w-[110px]">
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* FTP Form */}
          <TabsContent value="ftp" className="mt-0">
            <form onSubmit={handleFtpConnect} className="space-y-4">
              {error && connectionType === "ftp" && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="ftp-host">Host</Label>
                  <Input
                    id="ftp-host"
                    type="text"
                    value={ftpHost}
                    onChange={(e) => setFtpHost(e.target.value)}
                    placeholder="ftp.example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ftp-port">Port</Label>
                  <Input
                    id="ftp-port"
                    type="number"
                    value={ftpPort}
                    onChange={(e) => setFtpPort(parseInt(e.target.value) || 21)}
                    min={1}
                    max={65535}
                  />
                </div>
              </div>

              {/* Anonymous checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useAnonymous}
                    onChange={(e) => setUseAnonymous(e.target.checked)}
                    className="cursor-pointer accent-primary"
                  />
                  Anonymous login
                </label>
              </div>

              {!useAnonymous && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ftp-username">Username</Label>
                    <Input
                      id="ftp-username"
                      type="text"
                      value={ftpUsername}
                      onChange={(e) => setFtpUsername(e.target.value)}
                      placeholder="username"
                      required={!useAnonymous}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ftp-password">Password</Label>
                    <Input
                      id="ftp-password"
                      type="password"
                      value={ftpPassword}
                      onChange={(e) => setFtpPassword(e.target.value)}
                      placeholder="password"
                    />
                  </div>
                </>
              )}

              <DialogFooter className="gap-2 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={connecting}
                  className="px-5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={connecting || !ftpHost}
                  className="min-w-[110px]"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
