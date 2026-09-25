import React, { useEffect, useMemo, useState } from 'react';
import { ScreeningRecord } from '../types';
import { ComparisonSlider } from './ComparisonSlider';
import {
  getComparableVisits,
  computeStabilityIndicator,
  computeLesionDelta,
  StabilityStatus
} from '../services/progressionAnalysis';
import { History, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface RetinalProgressionCompareProps {
  currentRecord: ScreeningRecord;
  allRecords: ScreeningRecord[];
}

const STABILITY_STYLES: Record<StabilityStatus, { badge: string; icon: React.ReactNode }> = {
  STABLE: { badge: 'bg-slate-100 text-slate-800 border-slate-300', icon: <Minus className="w-4 h-4" /> },
  REGRESSING: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: <TrendingDown className="w-4 h-4" /> },
  PROGRESSING: { badge: 'bg-amber-100 text-amber-800 border-amber-300', icon: <TrendingUp className="w-4 h-4" /> },
  RAPIDLY_PROGRESSING: { badge: 'bg-rose-100 text-rose-800 border-rose-300', icon: <TrendingUp className="w-4 h-4" /> }
};

export function RetinalProgressionCompare({ currentRecord, allRecords }: RetinalProgressionCompareProps) {
  const priorVisits = useMemo(
    () => getComparableVisits(allRecords, currentRecord),
    [allRecords, currentRecord]
  );

  // Default comparison target: the OLDEST comparable visit (baseline).
  // priorVisits is newest-first, so that's the last entry.
  const defaultId = priorVisits[priorVisits.length - 1]?.id ?? '';
  const [selectedId, setSelectedId] = useState(defaultId);

  useEffect(() => {
    setSelectedId(defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRecord.id]);

  if (priorVisits.length === 0) return null;

  const baseline = priorVisits.find((r) => r.id === selectedId) ?? priorVisits[priorVisits.length - 1];
  const stability = computeStabilityIndicator(baseline, currentRecord);
  const lesionDelta = computeLesionDelta(baseline, currentRecord);
  const style = STABILITY_STYLES[stability.status];

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          <span>Longitudinal Comparison ({priorVisits.length} prior visit{priorVisits.length === 1 ? '' : 's'} for this eye)</span>
        </h4>
        {priorVisits.length > 1 && (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {priorVisits.map((v) => (
              <option key={v.id} value={v.id}>
                Compare vs {v.createdAt} ({v.grading.stageName})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stability Indicator */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${style.badge}`}>
        {style.icon}
        <span>{stability.label}</span>
        <span className="font-mono font-normal opacity-75">
          (ICDR {baseline.grading.stageNumber} &rarr; {currentRecord.grading.stageNumber})
        </span>
      </div>

      {/* Side-by-Side Slider */}
      <ComparisonSlider
        before={baseline}
        after={currentRecord}
        beforeLabel={`Baseline: ${baseline.createdAt}`}
        afterLabel={`Latest: ${currentRecord.createdAt}`}
      />

      {/* Lesion Count Delta */}
      <div>
        <p className="text-[11px] text-slate-500 mb-2">
          Lesion count change since the selected visit (real backend segmentation counts, not a fabricated pixel-level diff):
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {lesionDelta.map((row) => (
            <div key={row.key} className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
              <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider truncate">{row.label}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-slate-700">
                  {row.baseline} &rarr; {row.latest}
                </span>
                {row.delta > 0 && (
                  <span className="flex items-center gap-0.5 text-rose-700 font-bold">
                    <ArrowUpRight className="w-3 h-3" />+{row.delta}
                  </span>
                )}
                {row.delta < 0 && (
                  <span className="flex items-center gap-0.5 text-emerald-700 font-bold">
                    <ArrowDownRight className="w-3 h-3" />
                    {row.delta}
                  </span>
                )}
                {row.delta === 0 && <span className="text-slate-400 font-bold">0</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
