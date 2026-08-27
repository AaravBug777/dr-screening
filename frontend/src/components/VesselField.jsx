/**
 * Faint branching vessel lines used as ambient texture behind dark panels
 * (header, footer). Purely decorative -- aria-hidden, pointer-events-none --
 * and drawn once on mount via stroke-dashoffset, then holds still as a
 * quiet reminder of what this app actually looks at. Deliberately hand-authored
 * as a handful of short paths rather than a dense capillary render, so it
 * reads as texture, not as a competing illustration.
 */
export default function VesselField({ className = '' }) {
  const paths = [
    'M40 78 C150 30, 230 130, 360 60 S 560 20, 700 85',
    'M40 78 C130 118, 210 55, 320 112 S 480 150, 660 100',
    'M40 78 C170 15, 270 28, 400 15 S 590 5, 760 42',
    'M40 78 C110 132, 260 155, 380 142 S 540 150, 700 128',
  ]

  return (
    <svg
      viewBox="0 0 800 160"
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full ${className}`}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1" fill="none">
        {paths.map((d, i) => (
          <path key={d} d={d} className="vessel-line" style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
      </g>
    </svg>
  )
}
