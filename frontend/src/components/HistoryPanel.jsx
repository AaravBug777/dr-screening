import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchHistory, historyExportCsvUrl } from '../api'

const PAGE_SIZE = 50
const GRADE_OPTIONS = ['No DR', 'Mild', 'Moderate', 'Severe', 'Proliferative DR']

const GRADE_TONE = {
  'No DR': 'text-scope-trust',
  'Mild': 'text-scope-trust',
  'Moderate': 'text-scope-accent',
  'Severe': 'text-scope-accent',
  'Proliferative DR': 'text-scope-accent',
}

function formatWhen(unixSeconds) {
  const d = new Date(unixSeconds * 1000)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// <input type="date"> gives/wants "YYYY-MM-DD" in local time; the API
// wants a unix timestamp. dateTo is bumped to end-of-day so an inclusive
// day-picker actually includes that whole day, not just its first instant.
function dateInputToUnix(value, endOfDay = false) {
  if (!value) return undefined
  const d = new Date(value + (endOfDay ? 'T23:59:59' : 'T00:00:00'))
  return Math.floor(d.getTime() / 1000)
}

/**
 * The shared clinic screening history -- previously every prediction
 * vanished the moment its response was sent; backend/db.py now persists
 * every /predict call (rejected or graded) and this lists them. Not
 * per-operator-isolated by default (see main.py's /history docstring): a
 * PHC's screening record is something other staff at the same site
 * legitimately need to see. Filterable by date range/grade/referable-only,
 * paginated (load more), and exportable as CSV for offline
 * review/reporting -- the same filters apply to the export as to the
 * on-screen list, via the same query-building helper (api.js).
 */
export default function HistoryPanel({ onSelect }) {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const [mineOnly, setMineOnly] = useState(false)
  const [grades, setGrades] = useState([]) // multi-select
  const [referableOnly, setReferableOnly] = useState(false)
  const [rejectedOnly, setRejectedOnly] = useState(false)
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')

  // rejectedOnly and grades/referableOnly are mutually exclusive -- a
  // rejected row has no predicted_label/referable value, so combining them
  // would just silently return zero rows. Enforced here (picking one clears
  // the other) rather than leaving it to the backend's honest-but-confusing
  // "zero results" behavior for a conflicting combination.
  const toggleGrade = (g) => {
    setRejectedOnly(false)
    setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }
  const setReferableOnlyExclusive = (checked) => {
    setRejectedOnly(false)
    setReferableOnly(checked)
  }
  const setRejectedOnlyExclusive = (checked) => {
    if (checked) { setGrades([]); setReferableOnly(false) }
    setRejectedOnly(checked)
  }

  const activeFilters = () => ({
    mineOnly,
    grades: grades.length > 0 ? grades : undefined,
    referableOnly,
    rejectedOnly,
    dateFrom: dateInputToUnix(dateFromInput, false),
    dateTo: dateInputToUnix(dateToInput, true),
  })

  const load = (offset = 0, append = false) => {
    const setBusy = append ? setLoadingMore : () => setRows(null)
    setBusy(true)
    fetchHistory({ ...activeFilters(), limit: PAGE_SIZE, offset })
      .then((data) => {
        setTotal(data.total)
        setRows((prev) => (append ? [...(prev || []), ...data.results] : data.results))
      })
      .catch((err) => setError(err.message))
      .finally(() => { if (append) setLoadingMore(false) })
  }

  useEffect(() => {
    setError('')
    load(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly, grades.join(','), referableOnly, rejectedOnly, dateFromInput, dateToInput])

  const hasMore = rows && rows.length < total

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Screening history</p>
          <h2 className="font-display text-2xl text-scope-text">Past results</h2>
        </div>
        <a
          href={historyExportCsvUrl(activeFilters())}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-scope-text/60 hover:text-scope-accent transition-colors self-end"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
            <path d="M8 1.5v8.5m0 0L4.8 6.8M8 10l3.2-3.2M2.5 12v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V12"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 rounded-xl border border-scope-line bg-white/70 px-4 py-3">
        <label className="flex items-center gap-1.5 font-body text-xs text-scope-text/60 cursor-pointer">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          My uploads only
        </label>
        <label className="flex items-center gap-1.5 font-body text-xs text-scope-text/60 cursor-pointer">
          <input type="checkbox" checked={referableOnly} onChange={(e) => setReferableOnlyExclusive(e.target.checked)} />
          Referable only
        </label>
        <label className="flex items-center gap-1.5 font-body text-xs text-scope-text/60 cursor-pointer">
          <input type="checkbox" checked={rejectedOnly} onChange={(e) => setRejectedOnlyExclusive(e.target.checked)} />
          Rejected only
        </label>
        <div className="flex items-center gap-1.5 font-body text-xs text-scope-text/50">
          <input type="date" value={dateFromInput} onChange={(e) => setDateFromInput(e.target.value)}
            className="border border-scope-line rounded-md px-2 py-1 bg-white text-scope-text/70" />
          <span>–</span>
          <input type="date" value={dateToInput} onChange={(e) => setDateToInput(e.target.value)}
            className="border border-scope-line rounded-md px-2 py-1 bg-white text-scope-text/70" />
        </div>
        {(mineOnly || referableOnly || rejectedOnly || grades.length > 0 || dateFromInput || dateToInput) && (
          <button
            type="button"
            onClick={() => { setMineOnly(false); setGrades([]); setReferableOnly(false); setRejectedOnly(false); setDateFromInput(''); setDateToInput('') }}
            className="font-mono text-[10px] uppercase tracking-wide text-scope-accent/70 hover:text-scope-accent"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 mb-5 transition-opacity ${rejectedOnly ? 'opacity-40 pointer-events-none' : ''}`}>
        <span className="font-mono text-[10px] uppercase tracking-widest text-scope-text/40 mr-1">Grade</span>
        {GRADE_OPTIONS.map((g) => {
          const active = grades.includes(g)
          return (
            <button
              key={g}
              type="button"
              disabled={rejectedOnly}
              onClick={() => toggleGrade(g)}
              className={`font-body text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'bg-scope-accent text-white border-scope-accent'
                  : 'bg-white text-scope-text/60 border-scope-line hover:border-scope-accent/50'
              }`}
            >
              {g}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="font-body text-sm text-scope-accent">{error}</p>
      )}

      {rows === null && !error && (
        <p className="font-mono text-xs text-scope-text/40 uppercase tracking-wide">Loading…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="font-body text-sm text-scope-text/50">
          No screenings match these filters{total > 0 ? ' — try clearing some' : ' yet — results appear here automatically after each upload'}.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          <p className="font-mono text-[11px] text-scope-text/30 mb-2">{rows.length} of {total}</p>
          <div className="rounded-xl border border-scope-line overflow-hidden">
            {rows.map((r, i) => (
              <motion.button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min((i % PAGE_SIZE) * 0.02, 0.3) }}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left border-b border-scope-line last:border-b-0 bg-white hover:bg-scope-bgLight transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-body text-sm text-scope-text truncate">{r.source_filename || 'Untitled upload'}</p>
                  <p className="font-mono text-[11px] text-scope-text/40">{formatWhen(r.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  {r.gradable ? (
                    <>
                      <p className={`font-body text-sm font-medium ${GRADE_TONE[r.predicted_label] || 'text-scope-text'}`}>{r.predicted_label}</p>
                      {r.referable ? (
                        <p className="font-mono text-[10px] uppercase tracking-wide text-scope-accent/70">Referable</p>
                      ) : (
                        <p className="font-mono text-[10px] uppercase tracking-wide text-scope-text/30">Not referable</p>
                      )}
                    </>
                  ) : (
                    <p className="font-mono text-[11px] uppercase tracking-wide text-scope-text/40">Rejected — {r.quality_verdict}</p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => load(rows.length, true)}
              disabled={loadingMore}
              className="mt-4 w-full font-mono text-[11px] uppercase tracking-wide text-scope-text/50 hover:text-scope-accent transition-colors disabled:opacity-50 py-2"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - rows.length} remaining)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
