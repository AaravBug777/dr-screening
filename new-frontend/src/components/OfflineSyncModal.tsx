import React, { useEffect, useState } from 'react';
import { ScreeningRecord } from '../types';
import { exportRecordsToCSV } from '../services/storage';
import * as idb from '../services/indexedDBStorage';
import { flushSyncQueue } from '../services/fieldSync';
import {
  X,
  Wifi,
  WifiOff,
  Database,
  Clock,
  Save,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  simulateOffline: boolean;
  onToggleSimulateOffline: (value: boolean) => void;
  records: ScreeningRecord[];
  onSynced: () => void;
}

export function OfflineSyncModal({
  isOpen,
  onClose,
  isOnline,
  simulateOffline,
  onToggleSimulateOffline,
  records,
  onSynced
}: OfflineSyncModalProps) {
  const [health, setHealth] = useState<idb.CacheHealth | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const refreshHealth = () => {
    idb.getCacheHealth().then(setHealth);
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshHealth();
    const interval = setInterval(refreshHealth, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setLastSyncMessage(null);
    try {
      const result = await flushSyncQueue();
      if (result.total === 0) {
        setLastSyncMessage('Nothing queued -- everything is already synced.');
      } else {
        setLastSyncMessage(
          `Synced ${result.processed} of ${result.total} queued case${result.total === 1 ? '' : 's'}.` +
            (result.failed > 0 ? ` ${result.failed} still queued (will retry).` : '')
        );
      }
      onSynced();
    } catch (err) {
      setLastSyncMessage(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setIsSyncing(false);
      refreshHealth();
    }
  };

  const handleExportJson = async () => {
    setIsExportingJson(true);
    try {
      const dump = await idb.exportFullDatabaseJSON();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NETRA_Field_DB_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingJson(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">
              <Database className="w-4 h-4" />
              <span>Rural Field Cache</span>
            </div>
            <h2 className="text-xl font-bold">Field Cache &amp; Sync Hub</h2>
            <p className="text-xs text-slate-300 mt-1">IndexedDB-backed local storage for offline clinical field work.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Connectivity + Simulate Offline */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-amber-600" />}
                <span>{isOnline ? 'Online -- connected to tele-retina hub' : 'Offline -- no field connectivity'}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isOnline ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onToggleSimulateOffline(!simulateOffline)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <span className="text-xs text-slate-600">
                Simulate Offline <span className="text-slate-400">(test field operation without disconnecting WiFi)</span>
              </span>
              {simulateOffline ? (
                <ToggleRight className="w-6 h-6 text-amber-600" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-slate-400" />
              )}
            </button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 text-center">
              <Database className="w-4 h-4 text-cyan-600 mx-auto mb-1" />
              <div className="text-lg font-black text-slate-900">{health?.cachedCases ?? '--'}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Cached Cases</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 text-center">
              <Clock className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <div className="text-lg font-black text-slate-900">{health?.pendingSyncQueue ?? '--'}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Pending Sync</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 text-center">
              <Save className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
              <div className="text-lg font-black text-slate-900">{health?.hasActiveDraft ? '1' : '0'}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Draft</div>
            </div>
          </div>

          {health?.hasActiveDraft && health.activeDraftPatientId && (
            <p className="text-[11px] text-slate-500 -mt-2">
              Draft in progress for patient <span className="font-mono font-semibold">{health.activeDraftPatientId}</span>.
            </p>
          )}

          {lastSyncMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-900">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{lastSyncMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing || !isOnline || (health?.pendingSyncQueue ?? 0) === 0}
              className="w-full py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>{isSyncing ? 'Syncing queue...' : 'Sync Queue Now'}</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                disabled={isExportingJson}
                className="py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isExportingJson ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}
                <span>Export Field DB (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => exportRecordsToCSV(records)}
                className="py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Registry (CSV)</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
          Database: <span className="font-mono">{idb.DB_NAME}</span> -- all data stays on this device until synced.
        </div>
      </div>
    </div>
  );
}
