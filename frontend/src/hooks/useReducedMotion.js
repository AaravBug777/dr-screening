import { useEffect, useState } from 'react'

// Some of the eye/vessel animations use SVG SMIL (<animateMotion>), which
// isn't covered by the CSS `prefers-reduced-motion` rule in index.css --
// that rule only collapses CSS animations/transitions. Components that use
// SMIL check this hook directly and skip rendering the animated elements.
export default function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}
