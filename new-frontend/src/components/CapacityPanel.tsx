import React, { useEffect, useState } from 'react';
import { fetchStats, fetchCapacityLive, RealStats, SimulinkAssumptions, CapacitySnapshot } from '../services/backendApi';
import { Gauge, RefreshCcw, Loader2, TrendingUp, AlertCircle, Users } from 'lucide-react';

// Real, live Simulink district-level throughput model
// (matlab/simulink/netraScreeningThroughput.slx) surfaced directly in the
// app -- SIH26038's brief asks for "a Simulink model optimizing screening
// resource allocation" as its own deliverable, not just a modeling
// exercise left in a .slx file nobody outside the team ever sees. Paired
// with this app's own real usage numbers (backend/db.py's compute_stats)
// for an honest reality check, same pairing the original frontend's
// StatsPanel.jsx already does -- ported here rather than reinvented.

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 font-mono">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function CapacityCard({
  capacity,
  loading,
  onRefresh
}: {
  capacity: CapacitySnapshot | null;
  loading: boolean;
  onRefresh: (refresh: boolean) => void;
}) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-600" />
          Simulink Capacity Planning
        </h3>
        <div className="flex items-center gap-2">
          {capacity && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                capacity.live ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {capacity.live ? '● Live from Simulink' : '○ Static fallback'}
            </span>
          )}
          <button
            type="button"
            onClick={() => onRefresh(true)}
            disabled={loading}
            className="text-[10px] px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400 disabled:opacity-50 flex items-center gap-1 font-semibold"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
            {loading ? 'Running...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !capacity && (
        <p className="text-xs text-slate-500">
          Running the live Simulink model (first run can take 1-2 minutes -- MATLAB engine cold start)...
        </p>
      )}

      {capacity && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Sustainable capacity"
              value={`${capacity.sustainable_annual_capacity.toLocaleString()}/yr`}
              sub={`${Math.round(capacity.sustainable_annual_capacity / capacity.target_annual_volume)}x the ${capacity.target_annual_volume.toLocaleString()}/yr target`}
            />
            <StatCard
              label="Bottleneck stage"
              value={capacity.bottleneck_stage}
              sub={capacity.currently_stable ? 'stable' : 'growing backlog'}
            />
            <StatCard
              label="Review backlog trend"
              value={`${capacity.review_backlog_growth_per_day >= 0 ? '+' : ''}${capacity.review_backlog_growth_per_day.toFixed(1)}/day`}
            />
          </div>

          {capacity.reviewers_by_volume && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Ophthalmologist reviewers needed, by district volume
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {capacity.reviewers_by_volume.map((r) => (
                  <span key={r.volume} className="text-xs font-mono text-slate-600">
                    {(r.volume / 1000).toLocaleString()}k/yr →{' '}
                    <span className="text-slate-900 font-bold">{r.reviewers_needed}</span> reviewer
                    {r.reviewers_needed === 1 ? '' : 's'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 pt-1">{capacity.source}</p>
        </>
      )}
    </div>
  );
}

export function CapacityPanel() {
  const [data, setData] = useState<{ real: RealStats; simulink_assumptions: SimulinkAssumptions } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(true);

  useEffect(() => {
    fetchStats()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'));
  }, []);

  const loadCapacity = (refresh = false) => {
    setCapacityLoading(true);
    fetchCapacityLive(refresh)
      .then(setCapacity)
      .catch(() => setCapacity(null))
      .finally(() => setCapacityLoading(false));
  };
  useEffect(() => {
    loadCapacity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-2">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>MATLAB / Simulink</span>
          <span className="text-slate-300">•</span>
          <span>District-Level Throughput Model</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">Real Usage vs. the Simulink Model</h2>
        <p className="text-sm text-slate-600 mt-1">
          matlab/simulink/netraScreeningThroughput.slx models acquisition rate, bandwidth, processing
          throughput, and human review capacity for a district-level program -- SIH26038's own framing
          ("~1 ophthalmologist per 100,000 rural population") turned into a quantified result. Paired below
          with this app's own real screening numbers so far, not just the simulated assumptions.
        </p>
      </div>

      <CapacityCard capacity={capacity} loading={capacityLoading} onRefresh={loadCapacity} />

      {!data ? (
        <div className="text-center text-slate-400 text-sm py-10">Loading real usage stats...</div>
      ) : data.real.total === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-sm text-slate-500">
          No screenings recorded yet in this app's history -- this fills in automatically as it's used. Run a
          screening from the New Screening tab, then check back here.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total screened" value={data.real.total} />
            <StatCard
              label="Quality-gate reject rate"
              value={data.real.reject_rate !== null ? `${(data.real.reject_rate * 100).toFixed(0)}%` : '—'}
              sub={`${data.real.rejected} of ${data.real.total}`}
            />
            <StatCard
              label="Referable rate"
              value={data.real.referable_rate !== null ? `${(data.real.referable_rate * 100).toFixed(0)}%` : '—'}
              sub={`${data.real.referable} of ${data.real.gradable} gradable`}
            />
            <StatCard
              label="Simulink assumed rate"
              value={`${(data.simulink_assumptions.referral_rate * 100).toFixed(0)}%`}
              sub="throughputParams.m"
            />
          </div>

          {data.real.referable_rate !== null && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Reality check
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                The Simulink model assumes a {(data.simulink_assumptions.referral_rate * 100).toFixed(1)}%
                referral rate. This app's actual referral rate so far is{' '}
                <span className="font-bold text-slate-900">
                  {(data.real.referable_rate * 100).toFixed(1)}%
                </span>
                {' '}
                ({data.real.referable_rate >= data.simulink_assumptions.referral_rate ? '+' : ''}
                {((data.real.referable_rate - data.simulink_assumptions.referral_rate) * 100).toFixed(1)}pp
                {data.real.referable_rate >= data.simulink_assumptions.referral_rate ? ' higher' : ' lower'} than
                assumed).
              </p>
              <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                Based on {data.real.total} screening{data.real.total === 1 ? '' : 's'} -- a small sample moves
                this number a lot; treat it as an early signal, not a stable measurement, until volume grows.
              </p>
            </div>
          )}

          {Object.keys(data.real.grade_distribution).length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Grade distribution</p>
              <div className="space-y-2">
                {Object.entries(data.real.grade_distribution).map(([grade, count]: [string, number]) => {
                  const pct = (count / data.real.gradable) * 100;
                  return (
                    <div key={grade} className="flex items-center gap-3">
                      <span className="text-xs w-32 shrink-0 text-slate-700">{grade}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs w-8 text-right font-mono text-slate-600">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.real.rejected > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                Why images get rejected ({data.real.rejected} rejected)
              </p>
              <div className="space-y-2">
                {Object.entries(data.real.reject_reasons)
                  .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
                  .map(([reason, count]: [string, number]) => {
                    const pct = (count / data.real.rejected) * 100;
                    return (
                      <div key={reason} className="flex items-center gap-3">
                        <span className="text-xs w-40 shrink-0 text-slate-700 capitalize">
                          {reason.replaceAll('_', ' ')}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs w-8 text-right font-mono text-slate-600">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
