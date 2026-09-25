import React, { useEffect, useState } from 'react';

interface LandingIntroProps {
  onFinish: () => void;
}

const AUTO_ADVANCE_MS = 4200;

// One-time cinematic intro shown before the app proper -- an animated
// retinal-scan eye (the app's own visual language, not a stock graphic)
// plus a minimal field vignette of a health worker screening a seated
// villager. Purely presentational: no data, no network. Auto-advances,
// but always skippable (click anywhere or the Skip button) since forcing
// every visit through a multi-second animation would get old fast.
export function LandingIntro({ onFinish }: LandingIntroProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(handleFinish, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinish = () => {
    setExiting(true);
    setTimeout(onFinish, 450);
  };

  return (
    <div
      onClick={handleFinish}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 overflow-hidden cursor-pointer transition-opacity duration-450 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <style>{`
        @keyframes netra-scan { 0%, 100% { transform: translateY(-70px); } 50% { transform: translateY(70px); } }
        @keyframes netra-pulse-ring { 0% { transform: scale(0.72); opacity: 0.5; } 100% { transform: scale(1.7); opacity: 0; } }
        @keyframes netra-draw { to { stroke-dashoffset: 0; } }
        @keyframes netra-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes netra-iris-spin { to { transform: rotate(360deg); } }
        @keyframes netra-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .netra-scanline { animation: netra-scan 3.2s ease-in-out infinite; }
        .netra-pulse-ring { animation: netra-pulse-ring 2.6s cubic-bezier(0.2,0.6,0.4,1) infinite; }
        .netra-vessel { stroke-dasharray: 1; stroke-dashoffset: 1; animation: netra-draw 1.4s ease-out forwards; }
        .netra-iris-spin { animation: netra-iris-spin 20s linear infinite; transform-origin: 100px 100px; }
        .netra-fade-up { opacity: 0; animation: netra-fade-up 0.8s ease-out forwards; }
        .netra-progress { animation: netra-progress ${AUTO_ADVANCE_MS}ms linear forwards; transform-origin: left; }
      `}</style>

      {/* Ambient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-blue-950/50 to-slate-950" />
      <div className="absolute w-[560px] h-[560px] rounded-full bg-cyan-500/10 blur-3xl" />

      {/* The Eye */}
      <div className="relative flex items-center justify-center">
        <span className="absolute w-56 h-56 rounded-full border border-cyan-400/40 netra-pulse-ring" />
        <span className="absolute w-56 h-56 rounded-full border border-cyan-400/40 netra-pulse-ring" style={{ animationDelay: '0.9s' }} />
        <span className="absolute w-56 h-56 rounded-full border border-cyan-400/40 netra-pulse-ring" style={{ animationDelay: '1.8s' }} />

        <svg width="220" height="220" viewBox="0 0 200 200" className="relative drop-shadow-[0_0_35px_rgba(34,211,238,0.35)]">
          <defs>
            <clipPath id="netra-eye-clip">
              <path d="M6,100 C6,60 55,28 100,28 C145,28 194,60 194,100 C194,140 145,172 100,172 C55,172 6,140 6,100 Z" />
            </clipPath>
            <radialGradient id="netra-iris-grad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="55%" stopColor="#0891b2" />
              <stop offset="100%" stopColor="#0e3a52" />
            </radialGradient>
            <linearGradient id="netra-scan-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="50%" stopColor="#a5f3fc" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d="M6,100 C6,60 55,28 100,28 C145,28 194,60 194,100 C194,140 145,172 100,172 C55,172 6,140 6,100 Z"
            fill="#0b1320"
            stroke="#1e3a52"
            strokeWidth="2"
          />

          <g clipPath="url(#netra-eye-clip)">
            <rect x="0" y="0" width="200" height="200" fill="#0b1c2e" />

            <g className="netra-iris-spin">
              <circle cx="100" cy="100" r="46" fill="url(#netra-iris-grad)" />
              <circle cx="100" cy="100" r="46" fill="none" stroke="#a5f3fc" strokeOpacity="0.25" />
              <circle cx="100" cy="100" r="34" fill="none" stroke="#a5f3fc" strokeOpacity="0.2" />
              {Array.from({ length: 16 }).map((_, i) => {
                const angle = (i / 16) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={100 + Math.cos(angle) * 20}
                    y1={100 + Math.sin(angle) * 20}
                    x2={100 + Math.cos(angle) * 45}
                    y2={100 + Math.sin(angle) * 45}
                    stroke="#083344"
                    strokeOpacity="0.4"
                  />
                );
              })}
            </g>

            <circle cx="100" cy="100" r="17" fill="#020617" />
            <circle cx="93" cy="93" r="4" fill="#ffffff" fillOpacity="0.85" />

            {/* Retinal vessel tracing -- suggests the AI mapping the fundus */}
            <path pathLength="1" className="netra-vessel" d="M100,117 C90,130 70,132 55,150" fill="none" stroke="#f472b6" strokeOpacity="0.7" strokeWidth="1.5" style={{ animationDelay: '0.4s' }} />
            <path pathLength="1" className="netra-vessel" d="M117,100 C132,92 140,72 158,60" fill="none" stroke="#f472b6" strokeOpacity="0.7" strokeWidth="1.5" style={{ animationDelay: '0.7s' }} />
            <path pathLength="1" className="netra-vessel" d="M100,83 C95,65 108,50 100,32" fill="none" stroke="#f472b6" strokeOpacity="0.7" strokeWidth="1.5" style={{ animationDelay: '1s' }} />
            <path pathLength="1" className="netra-vessel" d="M83,100 C65,105 55,95 38,102" fill="none" stroke="#f472b6" strokeOpacity="0.7" strokeWidth="1.5" style={{ animationDelay: '1.3s' }} />

            <rect x="0" y="0" width="200" height="40" fill="url(#netra-scan-grad)" className="netra-scanline" />
          </g>

          <path d="M6,100 C6,60 55,28 100,28 C145,28 194,60 194,100" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <path d="M6,100 C6,140 55,172 100,172 C145,172 194,140 194,100" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Wordmark */}
      <div className="relative mt-10 text-center px-6">
        <h1 className="netra-fade-up font-display text-5xl sm:text-6xl font-black tracking-tight text-white" style={{ animationDelay: '1.6s' }}>
          NETRA
        </h1>
        <p className="netra-fade-up text-cyan-300/90 text-xs sm:text-sm font-semibold uppercase tracking-[0.3em] mt-2" style={{ animationDelay: '2s' }}>
          Seeing Diabetic Retinopathy Before It Steals Sight
        </p>
        <div className="netra-fade-up flex items-center justify-center gap-2 mt-5 text-[11px] text-slate-400 font-mono" style={{ animationDelay: '2.4s' }}>
          <span>Fundus Capture</span>
          <span className="text-cyan-500">&rarr;</span>
          <span>AI Grading</span>
          <span className="text-cyan-500">&rarr;</span>
          <span>Referral Triage</span>
        </div>
      </div>

      {/* Field vignette: a health worker screening a seated villager */}
      <div className="netra-fade-up absolute bottom-16 left-0 right-0 flex justify-center px-6" style={{ animationDelay: '2.6s' }}>
        <svg width="260" height="70" viewBox="0 0 260 70" className="opacity-70">
          <line x1="0" y1="62" x2="260" y2="62" stroke="#1e293b" strokeWidth="1" />
          <g fill="#1e293b">
            <path d="M18,62 L18,46 L30,38 L42,46 L42,62 Z" />
            <path d="M225,62 L225,50 L235,43 L245,50 L245,62 Z" />
          </g>
          <line x1="60" y1="62" x2="60" y2="48" stroke="#1e293b" strokeWidth="2" />
          <circle cx="60" cy="42" r="9" fill="#164e63" />

          {/* seated villager */}
          <g fill="#38bdf8">
            <circle cx="150" cy="34" r="7" />
            <path d="M143,44 C143,56 157,56 157,44 Z" />
          </g>
          {/* health worker with handheld screening device */}
          <g fill="#67e8f9">
            <circle cx="180" cy="24" r="7" />
            <path d="M172,34 C172,54 188,54 188,34 Z" />
          </g>
          <line x1="172" y1="38" x2="155" y2="34" stroke="#a5f3fc" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="155" cy="34" r="2.5" fill="#a5f3fc" />
        </svg>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleFinish();
        }}
        className="netra-fade-up absolute bottom-6 right-6 text-[11px] font-semibold text-slate-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
        style={{ animationDelay: '1s' }}
      >
        <span>Skip</span>
        <span aria-hidden="true">&rarr;</span>
      </button>

      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-cyan-400 netra-progress" />
    </div>
  );
}
