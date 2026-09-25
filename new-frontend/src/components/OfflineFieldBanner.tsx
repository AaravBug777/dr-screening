import React from 'react';
import { WifiOff, Database, ArrowRight } from 'lucide-react';

interface OfflineFieldBannerProps {
  queuedCount: number;
  onOpenSyncModal: () => void;
}

export function OfflineFieldBanner({ queuedCount, onOpenSyncModal }: OfflineFieldBannerProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            <strong className="font-bold">Rural field connectivity drop detected.</strong> All evaluations, scans, and
            Grad-CAM heatmaps are persisting safely on this device via IndexedDB.
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenSyncModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 font-semibold text-[11px] transition-colors cursor-pointer shrink-0"
        >
          <Database className="w-3.5 h-3.5" />
          <span>{queuedCount > 0 ? `${queuedCount} case${queuedCount === 1 ? '' : 's'} queued locally` : 'Field Cache & Sync Hub'}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
