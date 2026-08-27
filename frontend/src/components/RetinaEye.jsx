import { useEffect, useRef, useState } from 'react'
import useReducedMotion from '../hooks/useReducedMotion'

/**
 * A living eye glyph. Always blinks on an interval. When `interactive`,
 * the iris actually tracks the pointer across the whole viewport (like a
 * real eye following you around a room) instead of running the canned
 * CSS saccade drift used for the small non-interactive header mark.
 */
export default function RetinaEye({ className = '', interactive = false }) {
  const svgRef = useRef(null)
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!interactive || reducedMotion) return

    const maxOffset = 3.4 // svg user-units the iris is allowed to travel
    const falloff = 260 // px of pointer distance over which gaze reaches max

    const handleMove = (e) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy) || 1
      const reach = Math.min(dist, falloff) / falloff
      setGaze({ x: (dx / dist) * maxOffset * reach, y: (dy / dist) * maxOffset * reach })
    }

    window.addEventListener('pointermove', handleMove)
    return () => window.removeEventListener('pointermove', handleMove)
  }, [interactive, reducedMotion])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`eye-motif overflow-visible ${className}`}
      aria-hidden="true"
    >
      <g className="eye-blink-group">
        <path
          d="M2 32C2 32 14 12 32 12C50 12 62 32 62 32C62 32 50 52 32 52C14 52 2 32 2 32Z"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <g
          className={interactive ? '' : 'eye-iris-group'}
          style={interactive ? { transform: `translate(${gaze.x}px, ${gaze.y}px)`, transition: 'transform 0.2s ease-out' } : undefined}
        >
          <circle cx="32" cy="32" r="10" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="32" cy="32" r="3.5" fill="currentColor" />
          <circle className="eye-glint" cx="28.5" cy="28.5" r="1.4" fill="currentColor" />
        </g>
      </g>
    </svg>
  )
}
