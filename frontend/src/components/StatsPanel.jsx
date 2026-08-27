import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchStats } from '../api'

const GRADE_ORDER = ['No DR', 'Mild', 'Moderate', 'Severe', 'Proliferative DR']
const GRADE_COLOR = {
  'No DR': 'bg-scope-trust/60', 'Mild': 'bg-scope-trust/60',
  'Moderate': 'bg-scope-accent/70', 'Severe': 'bg-scope-accent/70', 'Proliferative DR': 'bg-scope-accent',
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-scope-line bg-white/90 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-scope-text/40 mb-1">{label}</p>
      <p className="font-display text-2xl text-scope-text">{value}</p>
      {sub && <p className="font-body text-xs text-scope-text/40 mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * Real operational numbers from this app's own usage, paired against
 * matlab/simulink/throughputParams.m's SIMULATED assumptions -- the
 * Simulink model answers "what capacity would we need at this referral
 * rate"; this answers "what is the referral rate actually turning out to
 * be, on images this app has actually graded". Neither replaces the
 * other -- see backend/main.py's /stats docstring.
 */
export default function StatsPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchStats()
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return <div className="max-w-3xl mx-auto px-6 py-10"><p className="font-body text-sm text-scope-accent">{error}</p></div>
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-6 py-10"><p className="font-mono text-xs text-scope-text/40 uppercase tracking-wide">Loading…</p></div>
  }

  const { real, simulink_assumptions: sim } = data

  if (real.total === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Screening statistics</p>
        <h2 className="font-display text-2xl text-scope-text mb-4">Real usage vs. the Simulink model</h2>
        <p className="font-body text-sm text-scope-text/50">No screenings recorded yet — this fills in automatically as the app is used.</p>
      </div>
    )
  }

  const maxDayCount = Math.max(1, ...real.screenings_by_day.map((d) => d.count))
  const referralDeltaPp = real.referable_rate !== null ? (real.referable_rate - sim.referral_rate) * 100 : null

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Screening statistics</p>
      <h2 className="font-display text-2xl text-scope-text mb-6">Real usage vs. the Simulink model</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total screened" value={real.total} />
        <Stat label="Quality-gate reject rate" value={`${(real.reject_rate * 100).toFixed(0)}%`} sub={`${real.rejected} of ${real.total}`} />
        <Stat label="Referable rate" value={real.referable_rate !== null ? `${(real.referable_rate * 100).toFixed(0)}%` : '—'} sub={`${real.referable} of ${real.gradable} gradable`} />
        <Stat label="Simulink assumed rate" value={`${(sim.referral_rate * 100).toFixed(0)}%`} sub="throughputParams.m" />
      </div>

      {referralDeltaPp !== null && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-scope-line bg-white/90 px-4 py-3 mb-6"
        >
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Reality check</p>
          <p className="font-body text-sm text-scope-text/80">
            The Simulink capacity model (~{sim.sustainable_annual_capacity.toLocaleString()} patients/year sustainable,
            {' '}{Math.round(sim.sustainable_annual_capacity / sim.target_annual_capacity)}x the {sim.target_annual_capacity.toLocaleString()}/year target)
            assumes a {(sim.referral_rate * 100).toFixed(1)}% referral rate. This app's actual referral rate so far is{' '}
            <span className="font-medium text-scope-text">{(real.referable_rate * 100).toFixed(1)}%</span>
            {' '}({referralDeltaPp >= 0 ? '+' : ''}{referralDeltaPp.toFixed(1)}pp {referralDeltaPp >= 0 ? 'higher' : 'lower'} than assumed).
          </p>
          <p className="font-body text-[11px] text-scope-text/40 mt-2 pt-2 border-t border-scope-text/10">
            Based on {real.total} screening{real.total === 1 ? '' : 's'} — a small sample moves this number a lot;
            treat it as an early signal, not a stable measurement, until volume grows.
          </p>
        </motion.div>
      )}

      <div className="rounded-xl border border-scope-line bg-white/90 px-4 py-3 mb-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-3">Grade distribution</p>
        <div className="space-y-2">
          {GRADE_ORDER.filter((g) => real.grade_distribution[g]).map((g) => {
            const count = real.grade_distribution[g]
            const pct = (count / real.gradable) * 100
            return (
              <div key={g} className="flex items-center gap-3">
                <span className="font-body text-xs w-32 shrink-0 text-scope-text/70">{g}</span>
                <div className="flex-1 h-2 rounded-full bg-scope-line/50 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${GRADE_COLOR[g]}`}
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                  />
                </div>
                <span className="font-mono text-xs w-10 text-right text-scope-text/60 tabular-nums">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {real.rejected > 0 && (
        <div className="rounded-xl border border-scope-line bg-white/90 px-4 py-3 mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-3">
            Why images get rejected ({real.rejected} rejected)
          </p>
          <div className="space-y-2">
            {Object.entries(real.reject_reasons)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => {
                const pct = (count / real.rejected) * 100
                return (
                  <div key={reason} className="flex items-center gap-3">
                    <span className="font-body text-xs w-40 shrink-0 text-scope-text/70 capitalize">
                      {reason.replaceAll('_', ' ')}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-scope-line/50 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-scope-accent/60"
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                      />
                    </div>
                    <span className="font-mono text-xs w-10 text-right text-scope-text/60 tabular-nums">{count}</span>
                  </div>
                )
              })}
          </div>
          <p className="font-body text-[11px] text-scope-text/40 mt-2 pt-2 border-t border-scope-text/10">
            One image can trip more than one reason (e.g. too dark AND soft focus) — counts can add up to more than the rejected total.
          </p>
        </div>
      )}

      {real.screenings_by_day.length > 0 && (
        <div className="rounded-xl border border-scope-line bg-white/90 px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-3">Screenings per day (last 14 days)</p>
          <div className="flex items-end gap-1.5 h-20">
            {real.screenings_by_day.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                <motion.div
                  className="w-full rounded-t bg-scope-trust/60"
                  initial={{ height: 0 }} animate={{ height: `${(d.count / maxDayCount) * 100}%` }}
                  transition={{ duration: 0.4 }}
                  style={{ minHeight: d.count > 0 ? 4 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px] text-scope-text/30">{real.screenings_by_day[0]?.date}</span>
            <span className="font-mono text-[10px] text-scope-text/30">{real.screenings_by_day[real.screenings_by_day.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  )
}
