// Rural-field local cache: a real IndexedDB database (not a simulation)
// used as the resilient second layer behind storage.ts's synchronous
// localStorage reads/writes -- see storage.ts's module comment for how
// the two are paired. IndexedDB can hold actual File/Blob objects
// (structured-clone compatible), which is what lets `drafts` and
// `sync_queue` keep a captured fundus image on disk across a closed tab
// or a dead battery, without base64-inflating it in localStorage.
import { PatientInfo, ScreeningRecord, BackendPredictResponse } from '../types';

export const DB_NAME = 'NETRA_RURAL_FIELD_CACHE_V2';
export const DB_VERSION = 1;

const STORE_SCREENINGS = 'screenings';
const STORE_DRAFTS = 'drafts';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_METADATA = 'metadata';

export const ACTIVE_DRAFT_ID = 'active-draft';

export type EyeSide = 'Left (OS)' | 'Right (OD)';

export interface ScreeningDraft {
  id: string;
  currentStep: string;
  patientInfo: PatientInfo;
  eyeSide: EyeSide;
  imageFile: File | null;
  sourceFilename: string;
  // Present once the one real /predict call for this exam has already
  // completed -- lets "Resume Draft" restore every later step (quality,
  // grading, Grad-CAM, referral, report) without re-uploading the image.
  predictResult?: BackendPredictResponse | null;
  latencyMs?: number;
  updatedAt: string;
}

export type SyncQueueItem =
  | {
      id: string;
      kind: 'NEW_SCREENING';
      queuedAt: string;
      patientInfo: PatientInfo;
      eyeSide: EyeSide;
      imageFile: File;
      sourceFilename: string;
    }
  | {
      id: string;
      kind: 'RECORD_UPDATE';
      queuedAt: string;
      record: ScreeningRecord;
    };

export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this browser.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_SCREENINGS)) {
        const store = db.createObjectStore(STORE_SCREENINGS, { keyPath: 'id' });
        store.createIndex('by_patientId', 'patientInfo.patientId', { unique: false });
        store.createIndex('by_createdAt', 'createdAt', { unique: false });
        store.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
        queueStore.createIndex('by_queuedAt', 'queuedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// --- screenings -------------------------------------------------------

export async function putScreening(record: ScreeningRecord): Promise<void> {
  try {
    await withStore<IDBValidKey>(STORE_SCREENINGS, 'readwrite', (s) => s.put(record));
  } catch (err) {
    console.error('[indexedDBStorage] putScreening failed:', err);
  }
}

export async function getAllScreenings(): Promise<ScreeningRecord[]> {
  try {
    return await withStore<ScreeningRecord[]>(STORE_SCREENINGS, 'readonly', (s) => s.getAll());
  } catch (err) {
    console.error('[indexedDBStorage] getAllScreenings failed:', err);
    return [];
  }
}

export async function deleteScreening(id: string): Promise<void> {
  try {
    await withStore<undefined>(STORE_SCREENINGS, 'readwrite', (s) => s.delete(id));
  } catch (err) {
    console.error('[indexedDBStorage] deleteScreening failed:', err);
  }
}

export async function countScreenings(): Promise<number> {
  try {
    return await withStore<number>(STORE_SCREENINGS, 'readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

// --- drafts -------------------------------------------------------------

export async function saveDraft(draft: ScreeningDraft): Promise<void> {
  try {
    await withStore<IDBValidKey>(STORE_DRAFTS, 'readwrite', (s) => s.put(draft));
  } catch (err) {
    console.error('[indexedDBStorage] saveDraft failed:', err);
  }
}

export async function getDraft(id: string = ACTIVE_DRAFT_ID): Promise<ScreeningDraft | undefined> {
  try {
    return await withStore<ScreeningDraft | undefined>(STORE_DRAFTS, 'readonly', (s) => s.get(id));
  } catch (err) {
    console.error('[indexedDBStorage] getDraft failed:', err);
    return undefined;
  }
}

export async function clearDraft(id: string = ACTIVE_DRAFT_ID): Promise<void> {
  try {
    await withStore<undefined>(STORE_DRAFTS, 'readwrite', (s) => s.delete(id));
  } catch (err) {
    console.error('[indexedDBStorage] clearDraft failed:', err);
  }
}

// --- sync_queue -----------------------------------------------------------

export async function enqueueSyncItem(item: SyncQueueItem): Promise<void> {
  try {
    await withStore<IDBValidKey>(STORE_SYNC_QUEUE, 'readwrite', (s) => s.put(item));
  } catch (err) {
    console.error('[indexedDBStorage] enqueueSyncItem failed:', err);
  }
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const items = await withStore<SyncQueueItem[]>(STORE_SYNC_QUEUE, 'readonly', (s) => s.getAll());
    return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch (err) {
    console.error('[indexedDBStorage] getSyncQueue failed:', err);
    return [];
  }
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  try {
    await withStore<undefined>(STORE_SYNC_QUEUE, 'readwrite', (s) => s.delete(id));
  } catch (err) {
    console.error('[indexedDBStorage] removeSyncQueueItem failed:', err);
  }
}

export async function countSyncQueue(): Promise<number> {
  try {
    return await withStore<number>(STORE_SYNC_QUEUE, 'readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

// --- metadata -------------------------------------------------------------

export async function setMetadata(key: string, value: unknown): Promise<void> {
  try {
    await withStore<IDBValidKey>(STORE_METADATA, 'readwrite', (s) =>
      s.put({ key, value, updatedAt: new Date().toISOString() })
    );
  } catch (err) {
    console.error('[indexedDBStorage] setMetadata failed:', err);
  }
}

export async function getMetadata<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const row = await withStore<{ key: string; value: T } | undefined>(STORE_METADATA, 'readonly', (s) => s.get(key));
    return row?.value;
  } catch (err) {
    console.error('[indexedDBStorage] getMetadata failed:', err);
    return undefined;
  }
}

// --- cache health / export ------------------------------------------------

export interface CacheHealth {
  engine: 'IndexedDB';
  dbName: string;
  cachedCases: number;
  pendingSyncQueue: number;
  hasActiveDraft: boolean;
  activeDraftPatientId?: string;
  initializedAt?: string;
}

export async function getCacheHealth(): Promise<CacheHealth> {
  const [cachedCases, pendingSyncQueue, draft, initializedAt] = await Promise.all([
    countScreenings(),
    countSyncQueue(),
    getDraft(),
    getMetadata<string>('cacheInitializedAt')
  ]);
  return {
    engine: 'IndexedDB',
    dbName: DB_NAME,
    cachedCases,
    pendingSyncQueue,
    hasActiveDraft: draft != null,
    activeDraftPatientId: draft?.patientInfo?.patientId || undefined,
    initializedAt
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function draftForExport(draft: ScreeningDraft) {
  return {
    ...draft,
    imageFile: draft.imageFile
      ? { name: draft.imageFile.name, type: draft.imageFile.type, size: draft.imageFile.size, dataUrl: await fileToDataUrl(draft.imageFile) }
      : null
  };
}

async function syncQueueItemForExport(item: SyncQueueItem) {
  if (item.kind === 'NEW_SCREENING') {
    return {
      ...item,
      imageFile: { name: item.imageFile.name, type: item.imageFile.type, size: item.imageFile.size, dataUrl: await fileToDataUrl(item.imageFile) }
    };
  }
  return item;
}

// Full raw database dump -- for the "Export Field DB (.json)" button, meant
// for a physical pendrive/USB handoff at a rural PHC with no connectivity
// at all. Includes captured-but-ungraded images as data URLs so nothing is
// lost even for exams that never reached the backend.
export async function exportFullDatabaseJSON(): Promise<Record<string, unknown>> {
  const [screenings, rawDraft, rawQueue, health] = await Promise.all([
    getAllScreenings(),
    getDraft(),
    getSyncQueue(),
    getCacheHealth()
  ]);

  const drafts = rawDraft ? [await draftForExport(rawDraft)] : [];
  const syncQueue = await Promise.all(rawQueue.map(syncQueueItemForExport));

  return {
    engine: 'IndexedDB',
    database: DB_NAME,
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    cacheHealth: health,
    screenings,
    drafts,
    sync_queue: syncQueue
  };
}
