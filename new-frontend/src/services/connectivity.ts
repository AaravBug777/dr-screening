// Single source of truth for "are we effectively online" that plain
// (non-component) modules like storage.ts can read synchronously --
// combines the real navigator.onLine flag with the OfflineSyncModal's
// "Simulate Offline" testing toggle (App.tsx owns the toggle's React
// state and mirrors it here on change via setSimulatedOffline).
type Listener = () => void;

let simulatedOffline = false;
const listeners = new Set<Listener>();

export function setSimulatedOffline(value: boolean): void {
  if (simulatedOffline === value) return;
  simulatedOffline = value;
  listeners.forEach((l) => l());
}

export function isSimulatedOffline(): boolean {
  return simulatedOffline;
}

export function isEffectivelyOnline(): boolean {
  if (simulatedOffline) return false;
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

// For non-React code that still wants to react to the simulate-offline
// toggle changing (real online/offline browser events are listened to
// directly by App.tsx via window 'online'/'offline').
export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
