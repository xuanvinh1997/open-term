import { TransferProgress, TransferStatus } from "../../types";
import { cn } from "@/lib/utils";
import {
  VscCloudUpload,
  VscCloudDownload,
  VscCheck,
  VscError,
  VscWatch,
  VscCircleSlash,
  VscSync,
} from "react-icons/vsc";

interface TransferQueueProps {
  transfers: TransferProgress[];
}

function isFailedStatus(status: TransferStatus): status is { Failed: string } {
  return typeof status === "object" && "Failed" in status;
}

function getStatusString(status: TransferStatus): string {
  if (typeof status === "string") {
    return status.toLowerCase();
  }
  if (isFailedStatus(status)) {
    return "failed";
  }
  return "unknown";
}

export function TransferQueue({ transfers }: TransferQueueProps) {
  const getStatusIcon = (status: TransferStatus) => {
    if (status === "Pending") return <VscWatch className="text-yellow-500" />;
    if (status === "InProgress") return <VscSync className="animate-spin text-blue-500" />;
    if (status === "Completed") return <VscCheck className="text-green-500" />;
    if (status === "Cancelled") return <VscCircleSlash className="text-neutral-500" />;
    if (isFailedStatus(status)) return <VscError className="text-red-500" />;
    return <VscWatch className="text-neutral-500" />;
  };

  const getDirectionIcon = (isUpload: boolean) => {
    return isUpload ? <VscCloudUpload /> : <VscCloudDownload />;
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  };

  const formatProgress = (transfer: TransferProgress): string => {
    const percent = transfer.total_bytes > 0
      ? Math.round((transfer.transferred_bytes / transfer.total_bytes) * 100)
      : 0;
    return `${formatSize(transfer.transferred_bytes)} / ${formatSize(transfer.total_bytes)} (${percent}%)`;
  };

  const getStatusDetails = (transfer: TransferProgress): string => {
    if (transfer.status === "InProgress" || transfer.status === "Completed") {
      return formatProgress(transfer);
    }
    if (isFailedStatus(transfer.status)) {
      return transfer.status.Failed || "Transfer failed";
    }
    if (transfer.status === "Cancelled") {
      return "Cancelled";
    }
    return "Waiting...";
  };

  if (transfers.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-300 dark:border-neutral-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Transfers ({transfers.length})
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {transfers.map((transfer) => {
          const statusString = getStatusString(transfer.status);
          return (
            <div
              key={transfer.id}
              className={cn(
                "px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0",
                statusString === "completed" && "bg-green-50 dark:bg-green-900/10",
                statusString === "failed" && "bg-red-50 dark:bg-red-900/10"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex-shrink-0 text-neutral-600 dark:text-neutral-400" title={transfer.is_upload ? "Upload" : "Download"}>
                  {getDirectionIcon(transfer.is_upload)}
                </span>
                <span className="flex-1 text-sm text-neutral-900 dark:text-neutral-100 truncate" title={transfer.filename}>
                  {transfer.filename}
                </span>
                <span className="flex-shrink-0">
                  {getStatusIcon(transfer.status)}
                </span>
              </div>
              {(transfer.status === "InProgress" || transfer.status === "Pending") && (
                <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, transfer.total_bytes > 0
                        ? Math.round((transfer.transferred_bytes / transfer.total_bytes) * 100)
                        : 0)}%`,
                    }}
                  />
                </div>
              )}
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                {getStatusDetails(transfer)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
