import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserSession, ScreeningRecord } from './types';
import { loadScreeningRecords, saveScreeningRecord, saveAllRecords, hydrateFromIndexedDBIfEmpty } from './services/storage';
import { fetchMe, fetchHistoryList, BackendOperator } from './services/backendApi';
import { mapBackendHistoryRowToRecord } from './services/backendMapping';
import { setSimulatedOffline } from './services/connectivity';
import { flushSyncQueue } from './services/fieldSync';
import * as idb from './services/indexedDBStorage';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { Navigation, NavigationTab } from './components/Navigation';
import { DashboardOverview } from './components/DashboardOverview';
import { ScreeningPipeline } from './components/NewScreening/ScreeningPipeline';
import { ScreeningHistory } from './components/ScreeningHistory';
import { PatientHistoryView } from './components/PatientHistoryView';
import { BatchScreening } from './components/BatchScreening';
import { TeleOphthalmologyReview } from './components/TeleOphthalmologyReview';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { CapacityPanel } from './components/CapacityPanel';
import { RecordDetailModal } from './components/RecordDetailModal';
import { OfflineFieldBanner } from './components/OfflineFieldBanner';
import { OfflineSyncModal } from './components/OfflineSyncModal';
import { LandingIntro } from './components/LandingIntro';
import { MedicalDisclaimerBanner, MedicalDisclaimerFooter } from './components/MedicalDisclaimer';

const INTRO_SEEN_KEY = 'netra_intro_seen';

export default function App() {
  const { t } = useTranslation();

  // Cinematic intro -- once per browser tab session, not on every render/
  // navigation within the app (sessionStorage, not localStorage: a fresh
  // tab/visit gets it again, but switching screens inside the app never
  // re-triggers it). The real auth check below runs in the background via
  // its own useEffect regardless of this, so by the time the intro finishes
  // auth has typically already resolved -- no extra "checking..." flash.
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem(INTRO_SEEN_KEY);
    } catch {
      return true;
    }
  });

  // Real auth gate: /predict and /report require a backend operator
  // session (backend/auth.py). 'checking' avoids flashing the login screen
  // before the /auth/me probe (which succeeds silently if a valid session
  // cookie already exists) has a chance to resolve.
  const [authStatus, setAuthStatus] = useState<'checking' | 'signedOut' | 'signedIn'>('checking');

  // Active User Session State. Role (OPERATOR/OPHTHALMOLOGIST/ADMIN) now
  // comes straight from the signed-in operator's account (backend/db.py's
  // operators.role, set at account-creation time via manage_operators.py)
  // -- it decides which tabs/UI this login sees, not a switch available
  // after signing in. See buildSessionForOperator below.
  const [session, setSession] = useState<UserSession>({
    id: 'user-op-01',
    name: 'Sunita Devi',
    role: 'OPERATOR',
    roleTitle: 'Vision Technician / CHW',
    center: 'PHC Chandpur Primary Health Centre',
    district: 'Bijnor',
    state: 'Uttar Pradesh'
  });

  // Static per-role display profile (title/center/district/state) --
  // the real backend has no concept of these beyond username + role, so
  // they stay as presentation fields layered onto the real operator identity.
  const buildSessionForOperator = (operator: BackendOperator): UserSession => {
    if (operator.role === 'OPHTHALMOLOGIST') {
      return {
        id: operator.username,
        name: operator.username,
        role: 'OPHTHALMOLOGIST',
        roleTitle: 'Senior Vitreoretinal Consultant',
        center: 'District Tele-Ophthalmology Reading Hub',
        district: 'Bijnor',
        state: 'Uttar Pradesh'
      };
    }
    if (operator.role === 'ADMIN') {
      return {
        id: operator.username,
        name: operator.username,
        role: 'ADMIN',
        roleTitle: 'Chief Medical Officer / District Admin',
        center: 'District Health Society, Bijnor',
        district: 'Bijnor',
        state: 'Uttar Pradesh'
      };
    }
    return {
      id: operator.username,
      name: operator.username,
      role: 'OPERATOR',
      roleTitle: 'Vision Technician / CHW',
      center: 'PHC Chandpur Primary Health Centre',
      district: 'Bijnor',
      state: 'Uttar Pradesh'
    };
  };

  // Sets the session from a signed-in operator and lands each role on its
  // most relevant tab, same as the old manual role switcher used to.
  const applySignedInOperator = (operator: BackendOperator) => {
    setSession(buildSessionForOperator(operator));
    if (operator.role === 'OPHTHALMOLOGIST') {
      setActiveTab('TELE_REVIEW');
    } else if (operator.role === 'ADMIN') {
      setActiveTab('ANALYTICS');
    }
    setAuthStatus('signedIn');
  };

  useEffect(() => {
    fetchMe().then((operator) => {
      if (operator) {
        applySignedInOperator(operator);
      } else {
        setAuthStatus('signedOut');
      }
    });
  }, []);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>('DASHBOARD');

  // Screening Records State
  const [records, setRecords] = useState<ScreeningRecord[]>([]);

  // Modals & Presets
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<ScreeningRecord | null>(null);
  const [patientProfileId, setPatientProfileId] = useState<string | null>(null);
  const [activePipelinePreset, setActivePipelinePreset] = useState<string | undefined>('case-moderate-03');

  // Rural Field Cache: real browser connectivity + the sync hub's testing
  // override, combined into one effective online flag (see
  // services/connectivity.ts, which non-component code like storage.ts's
  // save functions also reads from).
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const isOnline = browserOnline && !simulateOffline;

  const refreshQueuedCount = () => {
    idb.countSyncQueue().then(setQueuedCount);
  };

  // Live network listeners
  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleToggleSimulateOffline = (value: boolean) => {
    setSimulateOffline(value);
    setSimulatedOffline(value);
  };

  // Merges the real backend history (GET /history -- the actual
  // netra.db `predictions` table, persisted regardless of which frontend
  // or device made the screening) on top of this browser's own local
  // record cache. Fixes a real gap: every prediction was already being
  // saved server-side, but this app's History/Patient/Analytics views
  // previously only ever read the local cache, so a real screening never
  // appeared anywhere but the device that made it. Backend rows get a
  // `BACKEND-<id>` id (see backendMapping.ts), a different namespace than
  // local records' `NETRA-...` ids, so this never overwrites a local
  // record -- but it DOES mean a screening just finished in this same
  // session can briefly appear twice (once as the local record
  // handleFinishScreening already saved, once as its own now-persisted
  // backend row) until they'd otherwise be told apart; not attempted here,
  // since the backend list row doesn't return enough to correlate the two
  // reliably (see mapBackendHistoryRowToRecord's docstring). Backend fetch
  // failing (offline, backend down) is swallowed -- local records still
  // load and the app stays usable offline, which is this app's whole
  // design point.
  const mergeWithBackendHistory = async (localRecords: ScreeningRecord[]): Promise<ScreeningRecord[]> => {
    try {
      const { results } = await fetchHistoryList({ limit: 200 });
      const backendRecords = results.map(mapBackendHistoryRowToRecord);
      return [...localRecords, ...backendRecords].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return localRecords;
    }
  };

  // Load records on mount -- IndexedDB is checked first as the resilient
  // fallback (in case localStorage was ever cleared), then real backend
  // history is merged in, then the sync queue count is loaded for the
  // header badge.
  useEffect(() => {
    hydrateFromIndexedDBIfEmpty().then(async () => {
      const local = loadScreeningRecords();
      setRecords(local);
      setRecords(await mergeWithBackendHistory(local));
    });
    refreshQueuedCount();
  }, []);

  // Auto-sync: whenever real connectivity returns (and no offline
  // simulation is active), automatically drain anything left in the
  // field sync queue -- "automated ... upload ... once connectivity
  // returns" from the spec, not just the manual button.
  useEffect(() => {
    if (isOnline) {
      flushSyncQueue().then((result) => {
        if (result.processed > 0) {
          setRecords(loadScreeningRecords());
        }
        refreshQueuedCount();
      });
    }
  }, [isOnline]);

  const handleReloadRecords = () => {
    const loaded = loadScreeningRecords();
    setRecords(loaded); // immediate, synchronous -- local data first for responsiveness
    mergeWithBackendHistory(loaded).then(setRecords); // then layer in real backend history
    refreshQueuedCount();
  };

  // Start new screening from button or demo case
  const handleStartNewScreening = (presetId?: string) => {
    if (presetId) {
      setActivePipelinePreset(presetId);
    } else {
      setActivePipelinePreset('case-moderate-03');
    }
    setActiveTab('NEW_SCREENING');
  };

  // When a single screening is saved from report step (or queued offline)
  const handleFinishScreening = (newRecord: ScreeningRecord) => {
    const updated = loadScreeningRecords();
    setRecords(updated);
    mergeWithBackendHistory(updated).then(setRecords);
    refreshQueuedCount();
  };

  // Batch save
  const handleSaveBatchToHistory = (batchRecords: ScreeningRecord[]) => {
    const current = loadScreeningRecords();
    const combined = [...batchRecords, ...current];
    saveAllRecords(combined);
    setRecords(combined);
  };

  const pendingReviewCount = records.filter(
    (r) => r.referral.status === 'REFERABLE' && !r.reviewedByDoctor
  ).length;

  if (showIntro) {
    return (
      <LandingIntro
        onFinish={() => {
          try {
            sessionStorage.setItem(INTRO_SEEN_KEY, '1');
          } catch {
            // Private browsing / storage disabled -- fine, it just replays next time.
          }
          setShowIntro(false);
        }}
      />
    );
  }

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-slate-100/70 flex items-center justify-center text-slate-400 text-sm">
        {t('login.checkingSession')}
      </div>
    );
  }

  if (authStatus === 'signedOut') {
    return (
      <LoginScreen onLoggedIn={applySignedInOperator} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col text-slate-900 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Regulatory Clinical Safety Banner */}
      <MedicalDisclaimerBanner />

      {/* Main Global Header */}
      <Header
        session={session}
        onStartNewScreening={() => handleStartNewScreening()}
        onSignedOut={() => setAuthStatus('signedOut')}
        isOnline={isOnline}
        queuedCount={queuedCount}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
      />

      {/* Rural Field Drop Banner */}
      {!isOnline && (
        <OfflineFieldBanner queuedCount={queuedCount} onOpenSyncModal={() => setIsSyncModalOpen(true)} />
      )}

      {/* Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={session.role}
        pendingReviewCount={pendingReviewCount}
      />

      {/* Main Application Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'DASHBOARD' && (
          <DashboardOverview
            records={records}
            onStartNewScreening={handleStartNewScreening}
            onViewRecord={(rec) => setSelectedRecordForModal(rec)}
            onNavigateToHistory={() => setActiveTab('HISTORY')}
          />
        )}

        {activeTab === 'NEW_SCREENING' && (
          <ScreeningPipeline
            key={activePipelinePreset}
            initialPresetId={activePipelinePreset}
            onFinishScreening={handleFinishScreening}
            onQueuedForSync={refreshQueuedCount}
          />
        )}

        {activeTab === 'HISTORY' && (
          <ScreeningHistory
            records={records}
            onViewRecord={(rec) => setSelectedRecordForModal(rec)}
            onStartNewScreening={() => handleStartNewScreening()}
            onReloadRecords={handleReloadRecords}
            onViewPatient={(patientId) => {
              setPatientProfileId(patientId);
              setActiveTab('PATIENTS');
            }}
          />
        )}

        {activeTab === 'PATIENTS' && (
          <PatientHistoryView
            records={records}
            onViewRecord={(rec) => setSelectedRecordForModal(rec)}
            initialPatientId={patientProfileId}
          />
        )}

        {activeTab === 'BATCH' && (
          <BatchScreening
            onViewRecord={(rec) => setSelectedRecordForModal(rec)}
            onSaveBatchToHistory={handleSaveBatchToHistory}
          />
        )}

        {activeTab === 'TELE_REVIEW' && (
          <TeleOphthalmologyReview
            records={records}
            onRecordUpdated={handleReloadRecords}
            onViewRecord={(rec) => setSelectedRecordForModal(rec)}
          />
        )}

        {activeTab === 'ANALYTICS' && (
          <AnalyticsDashboard records={records} />
        )}

        {activeTab === 'CAPACITY' && <CapacityPanel />}
      </main>

      {/* Footer Disclaimer */}
      <MedicalDisclaimerFooter />

      {/* Record Full-Detail Modal */}
      <RecordDetailModal
        record={selectedRecordForModal}
        onClose={() => setSelectedRecordForModal(null)}
        allRecords={records}
      />

      {/* Field Cache & Sync Hub */}
      <OfflineSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        isOnline={browserOnline}
        simulateOffline={simulateOffline}
        onToggleSimulateOffline={handleToggleSimulateOffline}
        records={records}
        onSynced={handleReloadRecords}
      />
    </div>
  );
}
