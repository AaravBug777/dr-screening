import { useEffect, useState } from 'react'
import { motion, animate } from 'framer-motion'

export default function ProbabilityBar({ label, probability, isTop, delay = 0 }) {
  const pct = Math.round(probability * 100)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const controls = animate(0, pct, {
      duration: 0.9,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return controls.stop
  }, [pct, delay])

  return (
    <div className="flex items-center gap-3">
      <span className={`font-body text-xs w-32 shrink-0 ${isTop ? 'text-scope-text font-medium' : 'text-scope-text/50'}`}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-scope-line/50 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isTop ? 'bg-scope-accent' : 'bg-scope-trust/60'}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="font-mono text-xs w-10 text-right text-scope-text/60 tabular-nums">{display}%</span>
    </div>
  )
}
