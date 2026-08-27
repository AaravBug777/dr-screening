/**
 * Summarizes the MATLAB segmentation result: optic disc/fovea localization
 * status, plus lesion candidate counts. Deliberately framed as candidates
 * for review, not confirmed findings — matlab/segmentation/README.md
 * documents real, measured pixel-level precision as weak (a known
 * limitation of the classical detection methods, not a display bug), so
 * this view should never read as "we found N lesions."
 */
export default function SegmentationSummary({ summary }) {
  if (!summary) return null

  const candidates = [
    { label: 'Possible microaneurysms', count: summary.microaneurysm_candidates },
    { label: 'Possible hard exudates', count: summary.exudate_candidates },
    { label: 'Possible haemorrhages', count: summary.hemorrhage_candidates },
  ]

  return (
    <div className="rounded-xl border border-scope-line bg-white/75 backdrop-blur-sm px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-2">
        Structural analysis
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-body text-scope-text/70 mb-2">
        <span>Optic disc {summary.od_confidence >= 0.7 ? 'located' : 'uncertain'}</span>
        <span>Fovea {summary.fovea_found ? 'located' : 'not found'}</span>
      </div>
      <ul className="space-y-1">
        {candidates.map((c) => (
          <li key={c.label} className="flex justify-between text-xs font-body text-scope-text/70">
            <span>{c.label}</span>
            <span className="font-mono text-scope-text/50">{c.count}</span>
          </li>
        ))}
      </ul>
      <p className="font-body text-[11px] text-scope-text/40 mt-2 pt-2 border-t border-scope-text/10">
        AI-flagged candidate regions for ophthalmologist review — not confirmed
        findings. See the "Structures" view for where they were flagged.
      </p>
    </div>
  )
}
