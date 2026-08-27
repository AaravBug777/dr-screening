import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ScopeViewport from './components/ScopeViewport'
import UploadPanel from './components/UploadPanel'
import ProbabilityBar from './components/ProbabilityBar'
import InfoAccordion from './components/InfoAccordion'
import ResultExplanation from './components/ResultExplanation'
import LoginScreen from './components/LoginScreen'
import HistoryPanel from './components/HistoryPanel'
import StatsPanel from './components/StatsPanel'
// SegmentationSummary is no longer used here -- its content (optic disc/
// fovea status, lesion candidate counts) was folded into ResultExplanation's
// stat strip so the explainability surface is one panel, not two.
import PipelineSequence from './components/PipelineSequence'
import RetinaEye from './components/RetinaEye'
import VesselField from './components/VesselField'
import AmbientField from './components/AmbientField'
import { GRADE_MEANINGS, URGENCY_NOTES } from './content'
import { fetchHealth, fetchMe, fetchHistoryDetail, fetchReportPdf, logout, predictImage, recordReviewComplete } from './api'
import useOnlineStatus from './hooks/useOnlineStatus'

const SEVERITY_TONE = {
  'No DR': 'trust',
  'Mild': 'trust',
  'Moderate': 'accent',
  'Severe': 'accent',
  'Proliferative DR': 'accent',
}

const EASE = [0.16, 1, 0.3, 1]

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

const heroStagger = {
  animate: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

export default function App() {
  // --- Auth gate ---
  const [authStatus, setAuthStatus] = useState('checking') // checking | out | in
  const [operator, setOperator] = useState(null)

  useEffect(() => {
    fetchMe().then((op) => {
      if (op) { setOperator(op); setAuthStatus('in') } else { setAuthStatus('out') }
    })
  }, [])

  // Polled, not just checked once: the MATLAB engine can die mid-session
  // (backend/matlab_bridge.py's crash-recovery docstring -- this happened
  // for real once already, from a concurrent Simulink run). Without
  // polling, an operator would only discover this by noticing the
  // Structures/Enhanced views quietly stopped appearing -- easy to miss.
  // 'dead' self-heals on the NEXT /predict call (one restart+retry,
  // handled server-side), so this banner is accurate as "right now, until
  // your next upload", not a permanent failure state.
  const [matlabStatus, setMatlabStatus] = useState(null) // null | 'not_started' | 'alive' | 'dead'
  useEffect(() => {
    if (authStatus !== 'in') return
    const check = () => fetchHealth().then((h) => setMatlabStatus(h.matlab_engine_status)).catch(() => {})
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [authStatus])

  const online = useOnlineStatus()
  const [view, setView] = useState('screen') // screen | history | stats

  const [status, setStatus] = useState('idle') // idle | analyzing | done | needs_recapture | error
  const [result, setResult] = useState(null)
  const [quality, setQuality] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [sourceFilename, setSourceFilename] = useState(null)
  // Bumped once per successful prediction. Used as a React `key` on the
  // result explanation panel and the image toggle so their entrance/attention
  // animations replay for each new upload, rather than firing once and going
  // stale on later re-renders.
  const [resultVersion, setResultVersion] = useState(0)
  const [reportStatus, setReportStatus] = useState('idle') // idle | generating | error

  // Real, measured operator review time (see api.js's recordReviewComplete
  // and backend/main.py's /history/{id}/review-complete docstring for what
  // this does and doesn't prove). reviewTimer holds {predictionId,
  // shownAt} for the result CURRENTLY on screen, from a fresh /predict
  // call only -- re-opening an old History record isn't a live review
  // event, so handleSelectHistory deliberately never sets this.
  const [reviewTimer, setReviewTimer] = useState(null)

  const finalizeReview = () => {
    if (!reviewTimer) return
    const elapsed = (Date.now() - reviewTimer.shownAt) / 1000
    recordReviewComplete(reviewTimer.predictionId, elapsed)
    setReviewTimer(null)
  }

  // Batch upload queue -- a PHC operator photographs many patients per
  // session, not one at a time. Processed strictly sequentially: each
  // /predict call awaits the previous one, which naturally matches
  // backend/matlab_bridge.py's single-engine lock (concurrent requests
  // would just queue behind it anyway) rather than firing a burst of
  // parallel requests that mostly wait regardless.
  const [batchQueue, setBatchQueue] = useState([]) // [{id, name, file, status, result, quality}]

  // fresh=true means this is a just-computed /predict result the operator
  // is seeing for the first time -- starts the review-time clock.
  // Re-opening an old History record calls this with fresh=false/omitted.
  const applyResult = (data, fresh = false) => {
    if (fresh) {
      finalizeReview() // close out whatever was previously on screen before starting the new clock
      setReviewTimer({ predictionId: data.prediction_id, shownAt: Date.now() })
    }
    setQuality(data.quality || null)
    if (!data.gradable) {
      setStatus('needs_recapture')
      return
    }
    setResult(data)
    setResultVersion((v) => v + 1)
    setStatus('done')
  }

  const handleFileSelected = async (file) => {
    setStatus('analyzing')
    setErrorMsg('')
    setResult(null)
    setQuality(null)
    setSourceFilename(file.name)
    try {
      const data = await predictImage(file)
      applyResult(data, true)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong analyzing this image.')
      setStatus('error')
    }
  }

  const handleFilesSelected = async (files) => {
    if (files.length === 1) {
      await handleFileSelected(files[0])
      return
    }
    finalizeReview() // starting a batch ends whatever single result was being reviewed
    const queue = files.map((file, i) => ({
      id: `${Date.now()}-${i}`, name: file.name, file, status: 'queued', result: null, quality: null,
    }))
    setBatchQueue(queue)
    // Clear whatever single result was previously showing -- otherwise the
    // main panel keeps displaying a now-unrelated old result while the
    // batch processes, which reads as if that stale grade belongs to the
    // new upload. The queue list below is the source of truth during/after
    // a batch; the operator clicks an item to view its detail.
    setResult(null)
    setStatus('idle')
    setErrorMsg('')

    for (const item of queue) {
      setBatchQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'analyzing' } : x)))
      try {
        const data = await predictImage(item.file)
        setBatchQueue((q) => q.map((x) => (x.id === item.id
          ? { ...x, status: data.gradable ? 'done' : 'rejected', result: data.gradable ? data : null, quality: data.quality, predictionId: data.prediction_id }
          : x)))
      } catch (err) {
        setBatchQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'error', errorMsg: err.message } : x)))
      }
    }
  }

  const handleSelectBatchItem = (item) => {
    if (item.status === 'done' && item.result) {
      setSourceFilename(item.name)
      applyResult(item.result, true) // finalizes the previous item's clock and starts this one's
    } else if (item.status === 'rejected') {
      finalizeReview() // switching between batch items ends the previous item's review clock
      setSourceFilename(item.name)
      setQuality(item.quality)
      setStatus('needs_recapture')
      setReviewTimer({ predictionId: item.predictionId, shownAt: Date.now() })
    }
  }

  const handleSelectHistory = async (id) => {
    finalizeReview() // navigating to an old record ends whatever live review was in progress; re-opening history itself is never timed (not a fresh result)
    try {
      const row = await fetchHistoryDetail(id)
      setSourceFilename(row.source_filename)
      setView('screen')
      applyResult(row.response)
    } catch (err) {
      setErrorMsg(err.message || 'Could not load that record.')
      setStatus('error')
    }
  }

  // Automated annotated PDF report (SIH26038's Explainability Module: "automated
  // annotated reports -- enabling ophthalmologist validation in under 30
  // seconds"). Re-renders the ALREADY-COMPUTED result already sitting in
  // state -- no re-inference, no MATLAB re-run -- so the PDF can never
  // disagree with what's on screen.
  const handleDownloadReport = async () => {
    if (!result) return
    setReportStatus('generating')
    try {
      const blob = await fetchReportPdf(result, sourceFilename)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'netra-dr-screening-report.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setReportStatus('idle')
    } catch (err) {
      console.error(err)
      setReportStatus('error')
    }
  }

  // Clears whatever's currently showing (a single result, a rejected
  // "needs recapture" state, an error, or a finished/in-progress batch) so
  // the operator can start a clean new screening without a page reload.
  // Deliberately does NOT touch matlabStatus/auth/view -- only the
  // in-progress-analysis state that "start a new one" actually refers to.
  const handleReset = () => {
    finalizeReview() // an explicit "Reset & start new" is the clearest possible "I'm done reviewing this" signal
    setStatus('idle')
    setResult(null)
    setQuality(null)
    setErrorMsg('')
    setSourceFilename(null)
    setBatchQueue([])
  }

  const hasActiveAnalysis = status === 'done' || status === 'needs_recapture' || status === 'error' || batchQueue.length > 0

  const handleLogout = async () => {
    finalizeReview()
    await logout()
    setOperator(null)
    setAuthStatus('out')
  }

  const topLabel = result?.predicted_label
  const tone = SEVERITY_TONE[topLabel] || 'trust'

  if (authStatus === 'checking') {
    return <div className="min-h-screen bg-scope-bg" />
  }
  if (authStatus === 'out') {
    return <LoginScreen onLoggedIn={(op) => { setOperator(op); setAuthStatus('in') }} />
  }

  return (
    <div className="min-h-screen flex flex-col">
      {!online && (
        <div className="bg-scope-accent text-white text-center py-1.5 font-mono text-[11px] uppercase tracking-wide">
          You're offline — uploads will retry automatically once connection returns
        </div>
      )}
      {matlabStatus === 'dead' && (
        <div className="bg-scope-accent text-white text-center py-1.5 font-mono text-[11px] uppercase tracking-wide">
          MATLAB engine unavailable — quality gate, enhancement, and structural analysis are temporarily off (will retry automatically on the next upload)
        </div>
      )}

      {/* Header */}
      <header className="relative bg-scope-bg text-scope-textInverse overflow-hidden">
        <VesselField className="text-scope-textInverse/[0.08]" />
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="relative max-w-5xl mx-auto px-6 py-6 flex items-baseline justify-between"
        >
          <div className="flex items-baseline gap-3">
            <RetinaEye className="w-7 h-7 self-center opacity-90 hidden sm:block" />
            <div>
              <h1 className="font-display text-2xl tracking-tight">Netra</h1>
              <p className="font-body text-xs text-scope-textInverse/50 mt-0.5">
                Diabetic retinopathy screening, explained
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest">
              <button
                type="button"
                onClick={() => setView('screen')}
                className={view === 'screen' ? 'text-scope-textInverse' : 'text-scope-textInverse/40 hover:text-scope-textInverse/70'}
              >
                Screen
              </button>
              <button
                type="button"
                onClick={() => setView('history')}
                className={view === 'history' ? 'text-scope-textInverse' : 'text-scope-textInverse/40 hover:text-scope-textInverse/70'}
              >
                History
              </button>
              <button
                type="button"
                onClick={() => setView('stats')}
                className={view === 'stats' ? 'text-scope-textInverse' : 'text-scope-textInverse/40 hover:text-scope-textInverse/70'}
              >
                Stats
              </button>
            </nav>
            <div
              className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-scope-textInverse/40"
              title={
                matlabStatus === 'dead' ? 'MATLAB engine unavailable (will retry on next upload)'
                : matlabStatus === 'alive' ? 'MATLAB engine running'
                : matlabStatus === 'not_started' ? 'MATLAB engine not started yet (starts on first upload)'
                : 'Checking MATLAB engine status…'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${matlabStatus === 'dead' ? 'bg-scope-accent' : 'bg-scope-trust status-dot'}`}
                aria-hidden="true"
              />
              {operator?.username}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="font-mono text-[11px] uppercase tracking-widest text-scope-textInverse/40 hover:text-scope-textInverse/70"
            >
              Sign out
            </button>
          </div>
        </motion.div>
      </header>

      {view === 'history' ? (
        <main className="flex-1 bg-scope-bgLight">
          <HistoryPanel onSelect={handleSelectHistory} />
        </main>
      ) : view === 'stats' ? (
        <main className="flex-1 bg-scope-bgLight">
          <StatsPanel />
        </main>
      ) : (
      <>
      {/* Hero / working area */}
      <main className="relative flex-1 bg-scope-bgLight overflow-hidden">
        <AmbientField className="opacity-90" />
        <div className="relative max-w-5xl mx-auto px-6 py-14 grid md:grid-cols-2 gap-12 items-start">
          {/* Left: intro + upload + recommendation */}
          <motion.div variants={heroStagger} initial="initial" animate="animate">
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.55, ease: EASE }}
              className="font-display text-3xl sm:text-4xl leading-tight text-scope-text"
            >
              A second look at every retina, in seconds.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.55, ease: EASE }}
              className="font-body text-scope-text/70 mt-4 leading-relaxed"
            >
              Upload a fundus photograph and this model grades diabetic retinopathy
              severity on the standard five-point scale — then shows you exactly
              which regions of the retina it based that grade on, so the result
              can be checked, not just trusted.
            </motion.p>

            <motion.div variants={fadeUp} transition={{ duration: 0.55, ease: EASE }} className="mt-8">
              <UploadPanel onFilesSelected={handleFilesSelected} disabled={status === 'analyzing'} />
            </motion.div>

            {batchQueue.length > 0 && (
              <div className="mt-4 rounded-xl border border-scope-line bg-white/80 backdrop-blur-sm divide-y divide-scope-line overflow-hidden">
                {batchQueue.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectBatchItem(item)}
                    disabled={item.status === 'queued' || item.status === 'analyzing'}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-scope-bgLight transition-colors disabled:cursor-default"
                  >
                    <span className="font-body text-xs text-scope-text/80 truncate">{item.name}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-wide shrink-0 ${
                      item.status === 'done' ? 'text-scope-trust' :
                      item.status === 'error' ? 'text-scope-accent' :
                      item.status === 'rejected' ? 'text-scope-accent/70' :
                      item.status === 'analyzing' ? 'text-scope-text/60' : 'text-scope-text/30'
                    }`}>
                      {item.status}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {status === 'error' && (
                <motion.div
                  key="error"
                  {...fadeUp}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="mt-6 rounded-xl border border-scope-accent/30 bg-scope-accent/5 px-4 py-3"
                >
                  <p className="font-body text-sm text-scope-accent">{errorMsg}</p>
                </motion.div>
              )}

              {status === 'needs_recapture' && quality && (
                <motion.div
                  key="recapture"
                  {...fadeUp}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="mt-6 rounded-xl border border-scope-accent/30 bg-scope-accent/5 px-4 py-3"
                >
                  <p className="font-mono text-[11px] uppercase tracking-widest text-scope-accent/70 mb-1">
                    Image not usable — recapture needed
                  </p>
                  <p className="font-body text-sm text-scope-text/80">{quality.feedback}</p>
                  {quality.reasons?.length > 0 && (
                    <p className="font-mono text-[11px] text-scope-text/40 mt-2">
                      {quality.reasons.join(', ')}
                    </p>
                  )}
                </motion.div>
              )}

              {status === 'analyzing' && (
                <motion.div key="analyzing" {...fadeUp} transition={{ duration: 0.35, ease: EASE }} className="mt-2">
                  <PipelineSequence active />
                </motion.div>
              )}

              {status === 'done' && result && (
                <motion.div key="done" {...fadeUp} transition={{ duration: 0.4, ease: EASE }} className="mt-8 space-y-5">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40">Grade</p>
                    <p className={`font-display text-3xl mt-1 ${tone === 'accent' ? 'text-scope-accent' : 'text-scope-trust'}`}>
                      {result.predicted_label}
                    </p>
                    {quality?.enhanced_image_used && (
                      <p className="font-body text-xs text-scope-text/40 mt-1">
                        Image quality was borderline — automatic enhancement was applied before grading.
                        See the <span className="font-medium text-scope-text/60">Enhanced</span> view in the toggle above to compare it against the original.
                      </p>
                    )}
                  </div>

                  {/* Highlighted immediately under the grade, before anything
                      else -- the whole point is that "why" isn't buried below
                      the fold in the general accordion. */}
                  <ResultExplanation key={resultVersion} result={result} tone={tone} />

                  <div>
                    <button
                      type="button"
                      onClick={handleDownloadReport}
                      disabled={reportStatus === 'generating'}
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-scope-text/60 hover:text-scope-accent transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                      <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                        <path d="M8 1.5v8.5m0 0L4.8 6.8M8 10l3.2-3.2M2.5 12v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V12"
                          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {reportStatus === 'generating' ? 'Generating report…' : 'Download annotated report (PDF)'}
                    </button>
                    {reportStatus === 'error' && (
                      <p className="font-body text-xs text-scope-accent mt-1">
                        Couldn't generate the report — try again.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {result.probabilities.map((p, i) => (
                      <ProbabilityBar
                        key={p.label}
                        label={p.label}
                        probability={p.probability}
                        isTop={p.label === topLabel}
                        delay={0.05 * i}
                      />
                    ))}
                  </div>

                  <motion.div
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2 }}
                    className={`rounded-xl px-4 py-3 border ${tone === 'accent' ? 'border-scope-accent/30 bg-scope-accent/5' : 'border-scope-trust/30 bg-scope-trust/5'}`}
                  >
                    <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Recommendation</p>
                    <p className="font-body text-sm text-scope-text/80">{result.recommendation}</p>
                    {URGENCY_NOTES[topLabel] && (
                      <p className="font-body text-xs text-scope-text/50 mt-2 pt-2 border-t border-scope-text/10">
                        {URGENCY_NOTES[topLabel]}
                      </p>
                    )}
                  </motion.div>

                  {/* The most-likely grade (argmax) and the referral decision
                      are calibrated separately (see config.py's
                      TTA_REFERABLE_THRESHOLD) -- a borderline case can be
                      flagged referable even when the single most-likely grade
                      is No DR/Mild, because the referral threshold is tuned
                      against combined probability mass, not just the top
                      class. Surface that explicitly rather than let the grade
                      and this note silently disagree. */}
                  {result.referable && result.predicted_class < 2 && (
                    <motion.div
                      whileHover={{ y: -2 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-xl px-4 py-3 border border-scope-accent/30 bg-scope-accent/5"
                    >
                      <p className="font-mono text-[11px] uppercase tracking-widest text-scope-accent/70 mb-1">
                        Flagged for review as a precaution
                      </p>
                      <p className="font-body text-sm text-scope-text/80">
                        The most likely grade is {topLabel}, but this image had enough
                        probability of more significant disease (
                        {Math.round(result.referable_probability * 100)}%) that it's
                        still flagged for ophthalmologist review rather than cleared automatically.
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Right: scope viewport */}
          <div className="flex flex-col items-center gap-4 md:pt-8">
            <ScopeViewport
              key={resultVersion}
              status={status === 'error' || status === 'needs_recapture' ? 'idle' : status}
              preprocessedImage={result?.preprocessed_image_base64}
              enhancedImage={result?.enhanced_image_base64}
              heatmapImage={result?.gradcam_overlay_base64}
              structuresImage={result?.structures_overlay_base64}
              pulseToggle={status === 'done'}
            />
            {hasActiveAnalysis && (
              <motion.button
                type="button"
                onClick={handleReset}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-scope-text/50 hover:text-scope-accent transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                  <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.5H10"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Reset &amp; start new
              </motion.button>
            )}
          </div>
        </div>
      </main>

      {/* Explanatory section — how the model works, what grades mean, and its limits */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="bg-scope-bgLight border-t border-scope-line"
      >
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">
            Understanding your result
          </p>
          <div>
            <InfoAccordion title="How the screening pipeline works" defaultOpen>
              <p>
                Before grading, the image passes through an automated quality check —
                focus, illumination, framing, and source resolution — built in MATLAB.
                Images that are too blurry, dark, bright, poorly framed, or too low
                resolution to grade reliably (including downloaded/screenshotted
                copies, not just camera captures) are rejected with feedback for a
                recapture, rather than graded on unreliable input.
              </p>
              <p className="mt-3">
                Images that pass are then graded on the same five-point scale
                ophthalmologists use, using several augmented views of the same image
                averaged together for a more stable result. Rather than treating that
                grade as a black box, the model also generates a heatmap — using a
                technique called Grad-CAM — that highlights which regions of the retina
                most influenced the prediction, and a separate structural analysis
                (also MATLAB) that locates the optic disc and fovea and flags candidate
                regions worth a closer look.
              </p>
              <p className="mt-3">
                Use the <span className="font-medium text-scope-text">Original / AI focus / Structures</span> toggle
                above to compare the raw image against the heatmap and the structural
                overlay — and, when an image needed correction (uneven lighting,
                low contrast), an additional <span className="font-medium text-scope-text">Enhanced</span> view
                shows exactly what MATLAB changed before grading. If the highlighted
                regions land on actual retinal features — vessels, hemorrhages, the
                optic disc — rather than image borders or artifacts, that's a good
                sign the model is reasoning about the right things.
              </p>
            </InfoAccordion>

            <InfoAccordion title="What each severity grade means">
              <dl className="space-y-3">
                {GRADE_MEANINGS.map((g) => (
                  <div key={g.label}>
                    <dt className="font-body text-sm font-medium text-scope-text">{g.label}</dt>
                    <dd className="font-body text-sm text-scope-text/60 mt-0.5">{g.meaning}</dd>
                  </div>
                ))}
              </dl>
            </InfoAccordion>

            <InfoAccordion title="About this model and its limits">
              <p>
                Trained on the APTOS 2019 and EyePACS datasets — roughly 38,000 labeled
                retinal photographs combined, collected across multiple clinics and
                camera types.
              </p>
              <p className="mt-3">
                This is a screening aid intended to flag cases for ophthalmologist
                review — not a diagnostic replacement. Grad-CAM shows where the model
                looked when making its prediction, which is useful for sanity-checking
                results, but it isn't a formal guarantee that the underlying reasoning
                is clinically correct. The structural analysis's candidate regions are
                similarly unconfirmed — a starting point for review, not a diagnosis.
                Any result here should be confirmed by a qualified eye care professional.
              </p>
            </InfoAccordion>
          </div>
        </div>
      </motion.section>

      <footer className="relative bg-scope-bg text-scope-textInverse/40 overflow-hidden">
        <VesselField className="text-scope-textInverse/[0.05]" />
        <div className="relative max-w-5xl mx-auto px-6 py-5">
          <p className="font-mono text-[11px]">
            Trained on APTOS 2019 &amp; EyePACS · Not a substitute for clinical diagnosis
          </p>
        </div>
      </footer>
      </>
      )}
    </div>
  )
}
