import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Mirrors the actual stages backend/main.py's /predict runs through, in
// order -- MATLAB quality gate, then preprocessing, then the model, then
// Grad-CAM + the MATLAB segmentation overlay. This is a visual pacing
// device, not a real progress feed (the backend call is one request/
// response, not a stream) -- so it advances on a timer but deliberately
// never reaches "done" on its own. It holds on the last stage, pulsing,
// until the real response actually lands and the parent unmounts it by
// changing `status`. Never claim completion before the API does.
const STAGES = [
  'Running the MATLAB quality gate',
  'Preprocessing the photograph',
  'Grading severity',
  'Generating Grad-CAM & structural overlays',
]

export default function PipelineSequence({ active }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setStepIndex(0)
      return
    }
    const timers = STAGES.slice(0, -1).map((_, i) =>
      setTimeout(() => setStepIndex(i + 1), (i + 1) * 850)
    )
    return () => timers.forEach(clearTimeout)
  }, [active])

  if (!active) return null

  return (
    <ol className="mt-5 space-y-2.5">
      {STAGES.map((label, i) => {
        const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending'
        return (
          <motion.li
            key={label}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: state === 'pending' ? 0.4 : 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2.5"
          >
            <span
              className={`relative w-4 h-4 rounded-full border shrink-0 flex items-center justify-center
                ${state === 'done' ? 'bg-scope-trust border-scope-trust' : state === 'active' ? 'border-scope-accent' : 'border-scope-line'}`}
            >
              {state === 'done' && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none">
                  <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {state === 'active' && (
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-scope-accent"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </span>
            <span className={`font-mono text-[11px] uppercase tracking-wide ${state === 'active' ? 'text-scope-text/80' : 'text-scope-text/50'}`}>
              {label}
            </span>
          </motion.li>
        )
      })}
    </ol>
  )
}
