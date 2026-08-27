// Centralized API calls -- credentials:'include' (session cookie) and
// network-failure retry-with-backoff live here once, instead of being
// re-implemented per component.
//
// Offline handling, scoped honestly: this retries TRANSIENT network
// failures (a Wi-Fi blip, a momentary drop) automatically, and
// useOnlineStatus() below lets the UI show a clear "you're offline"
// state. It does NOT persist a failed upload across a page refresh or
// full offline period (that needs a service worker / IndexedDB queue --
// real-deployment-grade scope, not attempted here) -- a failed upload
// surfaces as a normal error the operator can retry once back online.

export const API_BASE = '/api'

async function fetchWithRetry(url, options = {}, { retries = 2, backoffMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...options, credentials: 'include' })
    } catch (err) {
      // fetch only throws for network-level failures (offline, DNS,
      // connection refused) -- an HTTP error status still resolves
      // normally and is handled by the caller via res.ok, not retried
      // here (retrying a 401/400 endlessly would be wrong).
      lastErr = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt))
      }
    }
  }
  throw lastErr
}

async function parseErrorDetail(res) {
  const body = await res.json().catch(() => ({}))
  return body.detail || `Request failed (${res.status})`
}

export async function fetchHealth() {
  // No auth needed (backend/main.py's /health is deliberately unauthenticated
  // -- a monitoring probe shouldn't need a session), and no retry wrapper --
  // this IS the retry loop (called on an interval by App.jsx), so a single
  // failed attempt should just wait for the next poll, not retry immediately.
  const res = await fetch(`${API_BASE}/health`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Health check failed (${res.status})`)
  return res.json()
}

export async function fetchMe() {
  const res = await fetchWithRetry(`${API_BASE}/auth/me`)
  if (!res.ok) return null
  return res.json()
}

export async function login(username, password) {
  const res = await fetchWithRetry(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function logout() {
  await fetchWithRetry(`${API_BASE}/auth/logout`, { method: 'POST' })
}

export async function predictImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetchWithRetry(`${API_BASE}/predict`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function fetchReportPdf(result, sourceFilename) {
  const res = await fetchWithRetry(`${API_BASE}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result, source_filename: sourceFilename }),
  })
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.blob()
}

// filters: { limit, offset, mineOnly, dateFrom, dateTo, grades, referableOnly, rejectedOnly }
// dateFrom/dateTo are unix timestamps (seconds) or omitted. grades is an
// array (multi-select) -- appended as repeated ?grades=X&grades=Y params,
// matching FastAPI's list[str] Query parsing on the backend.
function buildHistoryQuery(filters = {}) {
  const params = new URLSearchParams()
  params.set('limit', filters.limit ?? 50)
  params.set('offset', filters.offset ?? 0)
  params.set('mine_only', filters.mineOnly ?? false)
  if (filters.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters.dateTo) params.set('date_to', filters.dateTo)
  for (const g of filters.grades || []) params.append('grades', g)
  if (filters.referableOnly) params.set('referable_only', true)
  if (filters.rejectedOnly) params.set('rejected_only', true)
  return params.toString()
}

export async function fetchHistory(filters = {}) {
  const res = await fetchWithRetry(`${API_BASE}/history?${buildHistoryQuery(filters)}`)
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function fetchHistoryDetail(id) {
  const res = await fetchWithRetry(`${API_BASE}/history/${id}`)
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

// Not a fetch -- a plain URL for an <a href>. The session cookie is
// SameSite=Lax, which browsers still send on a top-level GET navigation
// across ports, so a direct link works without any blob-download
// plumbing (and sidesteps the artifact-viewer download restrictions that
// only apply to published Artifacts, not this actual running app).
export function historyExportCsvUrl(filters = {}) {
  return `${API_BASE}/history/export.csv?${buildHistoryQuery(filters)}`
}

// Real, measured operator review time -- the counterpart to
// matlab/simulink/throughputParams.m's assumed ReviewTimeSeconds=30. Fired
// once per result, when the operator moves on (see App.jsx's
// finalizeReview()) -- best-effort, deliberately not retried through
// fetchWithRetry's backoff (losing one timing sample to a network blip
// isn't worth delaying the operator's next action).
export async function recordReviewComplete(predictionId, durationSeconds) {
  if (predictionId == null) return
  try {
    await fetch(`${API_BASE}/history/${predictionId}/review-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ duration_seconds: durationSeconds }),
    })
  } catch {
    // best-effort telemetry -- a lost sample shouldn't surface as a user-facing error
  }
}

export async function fetchStats() {
  const res = await fetchWithRetry(`${API_BASE}/stats`)
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}
