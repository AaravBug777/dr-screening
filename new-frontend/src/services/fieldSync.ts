// Drains the sync_queue built up by ScreeningPipeline (exams captured
// while offline) and storage.ts (record edits saved while offline) --
// called automatically when the app comes back online (App.tsx) and
// manually via the "Sync Queue Now" button (OfflineSyncModal.tsx).
//
// Deliberately NOT a fake "upload" -- a NEW_SCREENING item has never
// been graded yet (grading is the one real backend call this app makes,
// see ScreeningPipeline.tsx), so "syncing" it means actually calling
// /predict now and turning it into a real graded record. A RECORD_UPDATE
// item (e.g. a doctor's offline review) was already saved locally; syncing
// it just confirms it into the IndexedDB mirror and flips it to 'synced'.
import { predictImage } from './backendApi';
import { mapToLegacyRecord } from './screeningApi';
import { saveScreeningRecord } from './storage';
import { isEffectivelyOnline } from './connectivity';
import * as idb from './indexedDBStorage';

export interface FlushResult {
  processed: number;
  failed: number;
  total: number;
}

export async function flushSyncQueue(): Promise<FlushResult> {
  if (!isEffectivelyOnline()) {
    return { processed: 0, failed: 0, total: 0 };
  }

  const queue = await idb.getSyncQueue();
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.kind === 'NEW_SCREENING') {
        const { result, latencyMs } = await predictImage(item.imageFile);
        const record = mapToLegacyRecord(result, item.patientInfo, item.eyeSide, latencyMs);
        saveScreeningRecord(record);
      } else {
        saveScreeningRecord({ ...item.record, syncStatus: 'synced' });
      }
      await idb.removeSyncQueueItem(item.id);
      processed++;
    } catch (err) {
      console.error('[fieldSync] failed to sync queued item', item.id, err);
      failed++;
      // Left in the queue -- next online transition or manual retry
      // will pick it up again.
    }
  }

  return { processed, failed, total: queue.length };
}
