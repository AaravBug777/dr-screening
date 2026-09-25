import { ScreeningRecord, UserSession, UserRole } from '../types';
import { INITIAL_HISTORICAL_RECORDS } from '../data/demoCases';
import { isEffectivelyOnline } from './connectivity';
import * as idb from './indexedDBStorage';

const STORAGE_KEY_RECORDS = 'netra_screening_records_v1';
const STORAGE_KEY_SESSION = 'netra_user_session_v1';

// Dual-storage mirroring: localStorage stays the synchronous read/write
// path every existing call site here already depends on (instant
// rendering, no await needed) -- IndexedDB is mirrored asynchronously,
// best-effort, alongside it as the resilient fallback layer (survives a
// localStorage clear; the "screenings" store other views like
// ScreeningHistory's sync badge or the Field Cache & Sync modal read
// from). A record saved while offline gets stamped 'queued' instead of
// 'synced' and a RECORD_UPDATE marker in the sync queue, so field edits
// made with no connectivity are visibly not-yet-confirmed until the
// queue is flushed (see services/fieldSync.ts).
function mirrorToIndexedDB(record: ScreeningRecord): void {
  if (record.syncStatus === 'queued') {
    idb.enqueueSyncItem({
      id: `record-${record.id}`,
      kind: 'RECORD_UPDATE',
      record,
      queuedAt: new Date().toISOString()
    }).catch(() => {});
  } else {
    idb.putScreening(record).catch(() => {});
  }
}

function stampSyncStatus(record: ScreeningRecord): ScreeningRecord {
  return { ...record, syncStatus: isEffectivelyOnline() ? 'synced' : 'queued' };
}

// One-time startup check: if localStorage's record key is missing
// entirely (cleared by the browser, or a fresh profile) but the
// IndexedDB mirror still has data, restore from it instead of silently
// falling back to the demo cohort -- the whole point of the second
// storage layer is that a rural-field device losing localStorage
// shouldn't lose the day's screenings.
export async function hydrateFromIndexedDBIfEmpty(): Promise<void> {
  try {
    if (localStorage.getItem(STORAGE_KEY_RECORDS)) return;
    const cached = await idb.getAllScreenings();
    if (cached.length > 0) {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(cached));
    }
    const initializedAt = await idb.getMetadata<string>('cacheInitializedAt');
    if (!initializedAt) {
      await idb.setMetadata('cacheInitializedAt', new Date().toISOString());
    }
  } catch (err) {
    console.error('[storage] hydrateFromIndexedDBIfEmpty failed:', err);
  }
}

export const DEFAULT_OPERATOR_SESSION: UserSession = {
  id: 'usr-chw-402',
  name: 'Sunita Devi',
  role: 'OPERATOR',
  roleTitle: 'Community Health Worker / Vision Technician',
  center: 'Primary Health Centre (PHC) Chandpur',
  district: 'Bijnor',
  state: 'Uttar Pradesh'
};

export const OPHTHALMOLOGIST_SESSION: UserSession = {
  id: 'usr-doc-108',
  name: 'Dr. Arvind Swaminathan, MS (Ophthalmology)',
  role: 'OPHTHALMOLOGIST',
  roleTitle: 'Tele-Retina Consultant & Vitreoretinal Specialist',
  center: 'District Hospital Tele-Ophthalmology Hub',
  district: 'Bijnor',
  state: 'Uttar Pradesh'
};

export const ADMIN_SESSION: UserSession = {
  id: 'usr-adm-001',
  name: 'Dr. Meenakshi Sharma',
  role: 'ADMIN',
  roleTitle: 'District Nodal Officer (NPCB&VI)',
  center: 'State Health Mission Directorate',
  district: 'Lucknow',
  state: 'Uttar Pradesh'
};

export function getStoredRecords(): ScreeningRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (!raw) {
      // Seed default records
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(INITIAL_HISTORICAL_RECORDS));
      return INITIAL_HISTORICAL_RECORDS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading localStorage screening records:', err);
    return INITIAL_HISTORICAL_RECORDS;
  }
}

export const loadScreeningRecords = getStoredRecords;

export function saveScreeningRecord(record: ScreeningRecord): ScreeningRecord[] {
  const stamped = stampSyncStatus(record);
  const existing = getStoredRecords();
  const index = existing.findIndex((r) => r.id === stamped.id);
  let updated: ScreeningRecord[];
  if (index >= 0) {
    updated = [...existing];
    updated[index] = stamped;
  } else {
    updated = [stamped, ...existing];
  }
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error writing localStorage screening records:', err);
  }
  mirrorToIndexedDB(stamped);
  return updated;
}

export const updateScreeningRecord = saveScreeningRecord;

export function saveAllRecords(records: ScreeningRecord[]): void {
  const stamped = records.map(stampSyncStatus);
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(stamped));
  } catch (err) {
    console.error('Error saving all records:', err);
  }
  stamped.forEach(mirrorToIndexedDB);
}

export function deleteScreeningRecord(id: string): ScreeningRecord[] {
  const existing = getStoredRecords();
  const updated = existing.filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error deleting record:', err);
  }
  idb.deleteScreening(id).catch(() => {});
  return updated;
}

export function resetToDemoRecords(): ScreeningRecord[] {
  localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(INITIAL_HISTORICAL_RECORDS));
  INITIAL_HISTORICAL_RECORDS.forEach((r) => idb.putScreening({ ...r, syncStatus: 'synced' }).catch(() => {}));
  return INITIAL_HISTORICAL_RECORDS;
}

export const resetToDefaultRecords = resetToDemoRecords;

export function getStoredSession(): UserSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading session:', err);
  }
  return DEFAULT_OPERATOR_SESSION;
}

export function saveSession(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch (err) {
    console.error('Error saving session:', err);
  }
}

export function switchRole(role: UserRole): UserSession {
  let session: UserSession;
  if (role === 'OPHTHALMOLOGIST') {
    session = OPHTHALMOLOGIST_SESSION;
  } else if (role === 'ADMIN') {
    session = ADMIN_SESSION;
  } else {
    session = DEFAULT_OPERATOR_SESSION;
  }
  saveSession(session);
  return session;
}

export function exportRecordsToCSV(records: ScreeningRecord[]): void {
  const headers = [
    'Record_ID',
    'Patient_ID',
    'Age',
    'Sex',
    'Diabetes_Duration_Years',
    'Screening_Date',
    'Screening_Center',
    'District',
    'Operator',
    'Eye_Side',
    'Image_Quality_Status',
    'Quality_Score',
    'DR_Stage',
    'ICDR_Stage_Number',
    'AI_Confidence_Percent',
    'Referral_Status',
    'Referral_Priority',
    'Doctor_Reviewed',
    'Doctor_Notes'
  ];

  const rows = records.map((r) => [
    `"${r.id}"`,
    `"${r.patientInfo.patientId}"`,
    r.patientInfo.age,
    `"${r.patientInfo.sex}"`,
    r.patientInfo.diabetesDurationYears,
    `"${r.createdAt}"`,
    `"${r.patientInfo.screeningCenter}"`,
    `"${r.patientInfo.district}"`,
    `"${r.patientInfo.operatorName}"`,
    `"${r.eyeSide}"`,
    `"${r.quality.status}"`,
    r.quality.overallScore,
    `"${r.grading.stageName}"`,
    r.grading.stageNumber,
    r.grading.confidence,
    `"${r.referral.status}"`,
    `"${r.referral.priority}"`,
    r.reviewedByDoctor ? 'Yes' : 'No',
    `"${(r.doctorNotes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NETRA_DR_Screening_Cohort_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
