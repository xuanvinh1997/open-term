import { TransferProgress, TransferStatus } from "../../types";
import {
  VscCloudUpload,
  VscCloudDownload,
  VscCheck,
  VscError,
  VscWatch,
  VscCircleSlash,
  VscSync,
} from "react-icons/vsc";
import "./TransferQueue.css";

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
    if (status === "Pending") return <VscWatch />;
    if (status === "InProgress") return <VscSync className="spinning" />;
    if (status === "Completed") return <VscCheck />;
    if (status === "Cancelled") return <VscCircleSlash />;
    if (isFailedStatus(status)) return <VscError />;
    return <VscWatch />;
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
    <div className="transfer-queue">
      <div className="transfer-queue-header">
        <span>Transfers ({transfers.length})</span>
      </div>
      <div className="transfer-list">
        {transfers.map((transfer) => (
          <div key={transfer.id} className={`transfer-item status-${getStatusString(transfer.status)}`}>
            <div className="transfer-info">
              <span className="transfer-direction" title={transfer.is_upload ? "Upload" : "Download"}>
                {getDirectionIcon(transfer.is_upload)}
              </span>
              <span className="transfer-name" title={transfer.filename}>
                {transfer.filename}
              </span>
              <span className="transfer-status">
                {getStatusIcon(transfer.status)}
              </span>
            </div>
            {(transfer.status === "InProgress" || transfer.status === "Pending") && (
              <div className="transfer-progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${Math.min(100, transfer.total_bytes > 0
                      ? Math.round((transfer.transferred_bytes / transfer.total_bytes) * 100)
                      : 0)}%`,
                  }}
                />
              </div>
            )}
            <div className="transfer-details">
              {getStatusDetails(transfer)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
