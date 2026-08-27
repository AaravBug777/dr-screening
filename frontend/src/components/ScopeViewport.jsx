import { lazy, Suspense, useState } from 'react'
import { motion } from 'framer-motion'
import RetinaEye from './RetinaEye'
import useReducedMotion from '../hooks/useReducedMotion'

// three.js + @react-three/fiber is ~300KB gzipped on its own -- split it
// into its own chunk so the rest of the page (fonts, upload panel, copy)
// paints immediately instead of waiting on WebGL to download. RetinaEye
// (flat SVG, already loaded) is the Suspense fallback so there's an eye
// on screen instantly either way, not a blank circle.
const EyeOrb3D = lazy(() => import('./EyeOrb3D'))

const ECG_PATH = 'M0 12 H16 L21 3 L27 21 L32 12 H48 L53 3 L59 21 L64 12 H120'

/**
 * Circular "ophthalmoscope" viewport -- the signature visual element.
 * Idle and analyzing show a real WebGL glass/chrome orb (EyeOrb3D) that
 * tracks the pointer and, while analyzing, spins up an emissive scan ring
 * plus a traveling ECG pulse underneath (health-monitor motif, not a
 * generic spinner). Once a real result exists, this switches to the
 * actual fundus image with a crossfade+focus-pull toggle between the
 * original, (when the quality gate enhanced it) the MATLAB-enhanced
 * version, the Grad-CAM heatmap, and (when available) the MATLAB
 * segmentation overlay (vessels/optic disc/fovea/lesion candidates) --
 * the 3D orb never stands in for the real image.
 */
export default function ScopeViewport({ status, preprocessedImage, enhancedImage, heatmapImage, structuresImage, pulseToggle }) {
  const [activeView, setActiveView] = useState('original') // 'original' | 'enhanced' | 'heatmap' | 'structures'
  const reducedMotion = useReducedMotion()

  const views = [
    { key: 'original', label: 'Original', image: preprocessedImage },
  ]
  if (enhancedImage) {
    // Only present when the MATLAB quality gate actually ran CLAHE +
    // illumination-normalization + denoising on this image (a borderline-
    // quality capture, not every upload) -- see backend/main.py's
    // enhanced_image_base64. Placed right after Original, before the
    // grading-explanation views: this is "what changed before grading",
    // not "why this grade".
    views.push({ key: 'enhanced', label: 'Enhanced', image: enhancedImage })
  }
  views.push({ key: 'heatmap', label: 'AI focus', image: heatmapImage })
  if (structuresImage) {
    views.push({ key: 'structures', label: 'Structures', image: structuresImage })
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        className="relative w-72 h-72 sm:w-80 sm:h-80"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative w-full h-full rounded-full border-[6px] border-scope-bg shadow-[0_0_0_3px_#F7F4EE,0_20px_50px_-15px_rgba(15,27,45,0.4)] overflow-hidden bg-scope-bg">
          {status === 'idle' && (
            <div className="relative w-full h-full">
              <Suspense fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <RetinaEye className="w-14 h-14 opacity-60 text-scope-textInverse" />
                </div>
              }>
                <EyeOrb3D mode="idle" tone="trust" className="absolute inset-0 w-full h-full" />
              </Suspense>
            </div>
          )}

          {status === 'analyzing' && (
            <div className="relative w-full h-full">
              <Suspense fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <RetinaEye className="w-16 h-16 opacity-25 text-scope-textInverse" />
                </div>
              }>
                <EyeOrb3D mode="analyzing" tone="accent" className="absolute inset-0 w-full h-full" />
              </Suspense>
              <div className="absolute inset-x-0 bottom-14 flex justify-center pointer-events-none">
                <svg viewBox="0 0 120 24" className="w-28 h-6 text-scope-textInverse/40" aria-hidden="true">
                  <path d={ECG_PATH} stroke="currentColor" strokeWidth="1.5" fill="none" />
                  {!reducedMotion && (
                    <circle r="2.4" fill="#E85D3D">
                      <animateMotion dur="2.6s" repeatCount="indefinite" path={ECG_PATH} />
                    </circle>
                  )}
                </svg>
              </div>
              <p className="absolute bottom-6 inset-x-0 text-center font-mono text-xs tracking-wide uppercase text-scope-textInverse pointer-events-none">
                Analyzing retina…
              </p>
            </div>
          )}

          {status === 'done' && views.map((v) => (
            <img
              key={v.key}
              src={`data:image/png;base64,${v.image}`}
              alt={
                v.key === 'original' ? 'Preprocessed fundus photograph'
                : v.key === 'enhanced' ? 'MATLAB-enhanced fundus photograph (illumination-normalized, contrast-boosted, denoised)'
                : v.key === 'heatmap' ? 'Grad-CAM heatmap highlighting regions driving the prediction'
                : 'Vessel, optic disc, fovea, and candidate lesion overlay'
              }
              className={`scope-image absolute inset-0 w-full h-full object-cover ${activeView === v.key ? 'is-active' : ''}`}
            />
          ))}
        </div>
      </motion.div>

      {status === 'done' && (
        <div className="flex rounded-full border border-scope-line bg-white/80 backdrop-blur-sm p-1 font-mono text-xs uppercase tracking-wide">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`relative px-4 py-1.5 rounded-full ${pulseToggle && v.key === 'heatmap' ? 'pill-attention' : ''}`}
            >
              {activeView === v.key && (
                <motion.span
                  layoutId="scope-toggle-pill"
                  className={`absolute inset-0 rounded-full ${v.key === 'original' ? 'bg-scope-bg' : 'bg-scope-accent'}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                />
              )}
              <span className={`relative z-10 transition-colors ${activeView === v.key ? 'text-scope-textInverse' : 'text-scope-text/60'}`}>
                {v.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
