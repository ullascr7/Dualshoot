import React from 'react';
import { HardDrive, Trash2, X } from 'lucide-react';
import { StorageCleanupStatus } from '../utils/indexedDb';
import { formatBytes } from '../utils/cropMath';

interface StorageCleanupModalProps {
  isOpen: boolean;
  status: StorageCleanupStatus | null;
  isCleaning: boolean;
  onConfirmCleanup: () => void;
  onDismiss: () => void;
}

export const StorageCleanupModal: React.FC<StorageCleanupModalProps> = ({
  isOpen,
  status,
  isCleaning,
  onConfirmCleanup,
  onDismiss,
}) => {
  if (!isOpen || !status) return null;

  const usagePercent = Math.min(
    100,
    Math.round((status.usedBytes / Math.max(1, status.thresholdBytes)) * 100)
  );

  return (
    <div
      className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-5 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-cleanup-title"
    >
      <div className="w-full max-w-sm rounded-3xl bg-neutral-950 border border-white/12 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 id="storage-cleanup-title" className="text-sm font-semibold text-white">
                Storage Limit Reached
              </h3>
              <p className="text-[11px] text-neutral-400 font-mono tabular-nums mt-0.5">
                {formatBytes(status.usedBytes)} / {formatBytes(status.thresholdBytes)} ({usagePercent}%)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            disabled={isCleaning}
            className="w-8 h-8 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white disabled:opacity-40"
            aria-label="Dismiss Storage Cleanup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Usage Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-2 rounded-full bg-neutral-900 overflow-hidden border border-white/8">
            <div
              className="h-full rounded-full bg-amber-400 transition-[width] duration-200"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Local camera storage has exceeded {formatBytes(status.thresholdBytes)}. Clear{' '}
            <span className="font-semibold text-white">
              {status.cleanableSessionCount} older{' '}
              {status.cleanableSessionCount === 1 ? 'capture' : 'captures'}
            </span>{' '}
            ({formatBytes(status.estimatedReclaimableBytes)}) to keep your newest shots and prevent
            recording crashes.
          </p>
        </div>

        <div className="pt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirmCleanup}
            disabled={isCleaning || status.cleanableSessionCount === 0}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isCleaning
                ? 'Clearing Older Sessions...'
                : `Clear Older Sessions (${status.cleanableSessionCount})`}
            </span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            disabled={isCleaning}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-white/12 text-white/85 text-xs font-medium transition-colors disabled:opacity-50"
          >
            Keep For Now
          </button>
        </div>
      </div>
    </div>
  );
};
