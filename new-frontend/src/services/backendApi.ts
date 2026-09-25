// Real calls to the Netra FastAPI backend (backend/main.py). This is the
// ACTUAL wiring for this app -- everything in screeningApi.ts before this
// existed was 100% client-side simulated data (see git history / the
// DEMO_PRESET_CASES it read from). Deliberately mirrors frontend/src/api.js
// (the original React app's client) field-for-field rather than inventing a
// new contract, since it's talking to the exact same backend.
//
// credentials:'include' + a relative '/api' base (proxied to the backend by
// vite.config.ts) is what lets the session cookie backend/auth.py sets work
// without any CORS configuration on the backend at all.

import type { BackendPredictResponse } from '../types';

export const API_BASE = '/api';

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  { retries = 2, backoffMs = 800 }: { retries?: number; backoffMs?: number } = {}
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...options, credentials: 'include' });
    } catch (err) {
      // fetch() only throws for network-level failures (offline, DNS,
      // connection refused) -- an HTTP error status still resolves
      // normally and is handled by the caller via res.ok, not retried here.
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

async function parseErrorDetail(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.detail || `Request failed (${res.status})`;
}

export interface BackendOperator {
  id: number;
  username: string;
  role: 'OPERATOR' | 'OPHTHALMOLOGIST' | 'ADMIN';
}

export async function fetchMe(): Promise<BackendOperator | null> {
  const res = await fetchWithRetry(`${API_BASE}/auth/me`);
  if (!res.ok) return null;
  return res.json();
}

export async function login(username: string, password: string): Promise<BackendOperator> {
  const res = await fetchWithRetry(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}

export async function logout(): Promise<void> {
  await fetchWithRetry(`${API_BASE}/auth/logout`, { method: 'POST' });
}

// The real inference call. Returns the raw backend JSON -- see
// BackendPredictResponse in types.ts, mirrored field-for-field from
// backend/main.py's /predict handler. Also returns measured round-trip
// latency (a REAL number, unlike the old mock's hardcoded "142ms").
export async function predictImage(
  file: File
): Promise<{ result: BackendPredictResponse; latencyMs: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const t0 = performance.now();
  const res = await fetchWithRetry(`${API_BASE}/predict`, { method: 'POST', body: formData }, { retries: 0 });
  const latencyMs = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  const result = (await res.json()) as BackendPredictResponse;
  return { result, latencyMs };
}

// Renders the real annotated PDF (backend/report_generator.py) from an
// already-computed /predict response -- no re-inference, so the report can
// never disagree with what's on screen.
export async function fetchReportPdf(result: BackendPredictResponse, sourceFilename?: string): Promise<Blob> {
  const res = await fetchWithRetry(`${API_BASE}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result, source_filename: sourceFilename }),
  });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.blob();
}

export async function fetchHealth(): Promise<{ status: string; checkpoint_found: boolean; matlab_engine_installed: boolean }> {
  const res = await fetch(`${API_BASE}/health`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

// --- Simulink capacity planning + real usage stats (backend/main.py's
// /stats and /capacity-live) -- the district-level throughput model
// (matlab/simulink/), surfaced in the app rather than left as a static
// assumptions dict only referenced in docs. ---

export interface RealStats {
  total: number;
  gradable: number;
  rejected: number;
  reject_rate: number | null;
  referable: number;
  referable_rate: number | null;
  grade_distribution: Record<string, number>;
  reject_reasons: Record<string, number>;
  screenings_by_day: Array<{ date: string; count: number }>;
  first_screening_at: string | null;
  last_screening_at: string | null;
}

export interface SimulinkAssumptions {
  referral_rate: number;
  sustainable_annual_capacity: number;
  target_annual_capacity: number;
  review_time_seconds: number;
  num_reviewers: number;
  source: string;
}

export async function fetchStats(): Promise<{ real: RealStats; simulink_assumptions: SimulinkAssumptions }> {
  const res = await fetchWithRetry(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}

export interface CapacitySnapshot {
  live: boolean;
  sustainable_annual_capacity: number;
  bottleneck_stage: string;
  target_annual_volume: number;
  currently_stable: boolean;
  review_backlog_growth_per_day: number;
  reviewers_by_volume: Array<{ volume: number; reviewers_needed: number }> | null;
  source: string;
}

export async function fetchCapacityLive(refresh = false): Promise<CapacitySnapshot> {
  const res = await fetchWithRetry(`${API_BASE}/capacity-live${refresh ? '?refresh=true' : ''}`, {}, { retries: 0 });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}
