import { buildResultNarrative } from '../content'

/**
 * The "why this result" panel -- the single, consolidated explainability
 * surface. Deliberately one dense card rather than a paragraph card plus a
 * separate "structural analysis" card: a confidence badge up top, one
 * clean sentence, and a compact stat strip for the structural evidence,
 * so the reasoning reads like a lab report line rather than a spread of
 * loosely-related cards down the page.
 */
export default function ResultExplanation({ result, tone }) {
  if (!result) return null

  const { confidencePct, sentence, stats, lowConfidenceStats, footnote, lowConfidenceFootnote } = buildResultNarrative(result)
  const hasLowConfidenceStats = lowConfidenceStats?.some((s) => Number(s.value) > 0)
  const isAccent = tone === 'accent'
  const accentColor = isAccent ? 'text-scope-accent' : 'text-scope-trust'
  const accentBorder = isAccent ? 'border-scope-accent/50' : 'border-scope-trust/50'
  const accentBg = isAccent ? 'bg-scope-accent' : 'bg-scope-trust'
  const accentSoftBg = isAccent ? 'bg-scope-accent/10' : 'bg-scope-trust/10'

  return (
    <div
      className={`result-explanation-enter relative rounded-2xl border-2 bg-white/90 backdrop-blur-sm overflow-hidden
        ${accentBorder}
        ${isAccent
          ? 'shadow-[0_0_0_1px_rgba(232,93,61,0.12),0_20px_45px_-22px_rgba(232,93,61,0.55)]'
          : 'shadow-[0_0_0_1px_rgba(111,146,133,0.12),0_20px_45px_-22px_rgba(111,146,133,0.5)]'
        }`}
    >
      <div className={`h-1 w-full ${accentBg}`} />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`w-4 h-4 shrink-0 ${accentColor}`}
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <line x1="15.3" y1="15.3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/50">Why this result</p>
          {confidencePct !== null && (
            <span className={`ml-auto font-mono text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${accentSoftBg} ${accentColor}`}>
              {confidencePct}% confidence
            </span>
          )}
        </div>

        <p className="font-body text-sm text-scope-text/85 leading-snug">{sentence}</p>

        {stats.length > 0 && (
          <>
            <div className="mt-3 pt-3 border-t border-scope-text/10 flex flex-wrap gap-x-4 gap-y-1.5">
              {stats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-scope-text/40">{s.label}</span>
                  <span className="font-body text-xs font-medium text-scope-text/80 tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
            {footnote && (
              <p className="font-body text-[11px] text-scope-text/45 mt-2 leading-snug">{footnote}</p>
            )}
          </>
        )}

        {hasLowConfidenceStats && (
          <div className="mt-3 pt-3 border-t border-dashed border-scope-text/15">
            <p className="font-mono text-[10px] uppercase tracking-widest text-scope-text/35 mb-1.5">
              Early signal — lower confidence
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {lowConfidenceStats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-scope-text/35">{s.label}</span>
                  <span className="font-body text-xs font-medium text-scope-text/60 tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
            {lowConfidenceFootnote && (
              <p className="font-body text-[11px] text-scope-text/40 mt-2 leading-snug">{lowConfidenceFootnote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
