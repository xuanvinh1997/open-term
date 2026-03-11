import { TransferProgress, TransferStatus } from "../../types";
import { useSftpStore, type TransferMeta } from "../../stores/sftpStore";
import { cn } from "@/lib/utils";
import {
  VscCloudUpload,
  VscCloudDownload,
  VscCheck,
  VscError,
  VscWatch,
  VscCircleSlash,
  VscSync,
  VscClose,
  VscClearAll,
  VscChevronDown,
  VscChevronUp,
} from "react-icons/vsc";
import { useState } from "react";

interface TransferQueueProps {
  transfers: TransferProgress[];
}

function isFailedStatus(status: TransferStatus): status is { Failed: string } {
  return typeof status === "object" && "Failed" in status;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "--";
  return `${formatSize(bytesPerSec)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "--";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function TransferRow({
  transfer,
  meta,
}: {
  transfer: TransferProgress;
  meta?: TransferMeta;
}) {
  const removeTransfer = useSftpStore((s) => s.removeTransfer);
  const isActive = transfer.status === "InProgress" || transfer.status === "Pending";
  const isCompleted = transfer.status === "Completed";
  const isFailed = isFailedStatus(transfer.status);
  const percent =
    transfer.total_bytes > 0
      ? Math.min(100, Math.round((transfer.transferred_bytes / transfer.total_bytes) * 100))
      : 0;

  return (
    <div
      className={cn(
        "px-3 py-1.5 border-b border-neutral-200 dark:border-[#333] last:border-b-0 group",
        isCompleted && "opacity-70",
        isFailed && "bg-red-50/50 dark:bg-red-900/10"
      )}
    >
      <div className="flex items-center gap-2">
        {/* Direction icon */}
        <span className="flex-shrink-0 text-neutral-500 dark:text-neutral-400">
          {transfer.is_upload ? (
            <VscCloudUpload className="h-3.5 w-3.5" />
          ) : (
            <VscCloudDownload className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Filename */}
        <span
          className="flex-1 text-xs text-neutral-800 dark:text-neutral-200 truncate min-w-0"
          title={transfer.filename}
        >
          {transfer.filename}
        </span>

        {/* Size info */}
        <span className="flex-shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums w-[140px] text-right">
          {isActive
            ? `${formatSize(transfer.transferred_bytes)} / ${formatSize(transfer.total_bytes)}`
            : isCompleted
              ? formatSize(transfer.total_bytes)
              : isFailed
                ? "Failed"
                : "Waiting..."}
        </span>

        {/* Speed */}
        <span className="flex-shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums w-[80px] text-right">
          {transfer.status === "InProgress" && meta ? formatSpeed(meta.speed) : ""}
        </span>

        {/* ETA */}
        <span className="flex-shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums w-[50px] text-right">
          {transfer.status === "InProgress" && meta ? formatEta(meta.eta) : ""}
        </span>

        {/* Status icon */}
        <span className="flex-shrink-0 w-4 flex items-center justify-center">
          {transfer.status === "Pending" && <VscWatch className="h-3.5 w-3.5 text-yellow-500" />}
          {transfer.status === "InProgress" && <VscSync className="h-3.5 w-3.5 animate-spin text-blue-500" />}
          {isCompleted && <VscCheck className="h-3.5 w-3.5 text-green-500" />}
          {transfer.status === "Cancelled" && <VscCircleSlash className="h-3.5 w-3.5 text-neutral-400" />}
          {isFailed && <VscError className="h-3.5 w-3.5 text-red-500" />}
        </span>

        {/* Remove button (only for non-active) */}
        {!isActive && (
          <button
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            onClick={() => removeTransfer(transfer.id)}
            title="Remove"
          >
            <VscClose className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Progress bar for active transfers */}
      {isActive && (
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums w-8 text-right">
            {percent}%
          </span>
        </div>
      )}

      {/* Error message */}
      {isFailed && isFailedStatus(transfer.status) && (
        <div className="mt-0.5 text-[10px] text-red-500 dark:text-red-400 truncate" title={transfer.status.Failed}>
          {transfer.status.Failed}
        </div>
      )}
    </div>
  );
}

export function TransferQueue({ transfers }: TransferQueueProps) {
  const transferMeta = useSftpStore((s) => s.transferMeta);
  const clearCompletedTransfers = useSftpStore((s) => s.clearCompletedTransfers);
  const [collapsed, setCollapsed] = useState(false);

  if (transfers.length === 0) {
    return null;
  }

  const activeCount = transfers.filter(
    (t) => t.status === "InProgress" || t.status === "Pending"
  ).length;
  const completedCount = transfers.filter((t) => t.status === "Completed").length;

  return (
    <div className="border-t border-neutral-300 dark:border-[#333] bg-neutral-50 dark:bg-[#1e1e1e] flex flex-col max-h-[200px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-200 dark:border-[#333] bg-neutral-100 dark:bg-[#252526] shrink-0">
        <button
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <VscChevronUp className="h-3 w-3" /> : <VscChevronDown className="h-3 w-3" />}
          Transfers
          {activeCount > 0 && (
            <span className="text-blue-500 font-normal normal-case tracking-normal">
              ({activeCount} active)
            </span>
          )}
          {completedCount > 0 && activeCount === 0 && (
            <span className="text-green-500 font-normal normal-case tracking-normal">
              ({completedCount} done)
            </span>
          )}
        </button>
        {completedCount > 0 && (
          <button
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            onClick={clearCompletedTransfers}
            title="Clear completed"
          >
            <VscClearAll className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Transfer list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-[#2a2a2a]">
            <span className="w-3.5" />
            <span className="flex-1">File</span>
            <span className="w-[140px] text-right">Progress</span>
            <span className="w-[80px] text-right">Speed</span>
            <span className="w-[50px] text-right">ETA</span>
            <span className="w-4" />
          </div>
          {transfers.map((transfer) => (
            <TransferRow
              key={transfer.id}
              transfer={transfer}
              meta={transferMeta[transfer.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
