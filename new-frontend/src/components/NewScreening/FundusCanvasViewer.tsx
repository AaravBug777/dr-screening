import React, { useEffect, useRef, useState } from 'react';
import { drawFundusOnCanvas } from '../../services/fundusRenderer';
import { DRStage, RetinalStructureFinding, GradCAMAnalysis } from '../../types';
import { ZoomIn, ZoomOut, RotateCcw, Eye, Layers, Flame, Info } from 'lucide-react';

interface FundusCanvasViewerProps {
  seed: string;
  stage?: DRStage;
  enhanced?: boolean;
  isBlurry?: boolean;
  qualityStatus?: 'ACCEPTED' | 'REQUIRES_RECAPTURE';
  structureFindings?: RetinalStructureFinding;
  gradCamData?: GradCAMAnalysis;
  initialShowDisc?: boolean;
  initialShowFovea?: boolean;
  initialShowVessels?: boolean;
  initialShowLesions?: boolean;
  initialShowGradCam?: boolean;
  initialGradCamOpacity?: number;
  interactiveControls?: boolean;
  className?: string;
  title?: string;
}

export function FundusCanvasViewer({
  seed,
  stage = 'NO_DR',
  enhanced = false,
  isBlurry = false,
  qualityStatus = 'ACCEPTED',
  structureFindings,
  gradCamData,
  initialShowDisc = false,
  initialShowFovea = false,
  initialShowVessels = false,
  initialShowLesions = false,
  initialShowGradCam = false,
  initialGradCamOpacity = 0.65,
  interactiveControls = true,
  className = '',
  title
}: FundusCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showDisc, setShowDisc] = useState(initialShowDisc);
  const [showFovea, setShowFovea] = useState(initialShowFovea);
  const [showVessels, setShowVessels] = useState(initialShowVessels);
  const [showLesions, setShowLesions] = useState(initialShowLesions);
  const [showGradCam, setShowGradCam] = useState(initialShowGradCam);
  const [gradCamOpacity, setGradCamOpacity] = useState(initialGradCamOpacity);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredLesion, setHoveredLesion] = useState<{
    type: string;
    description: string;
    x: number;
    y: number;
  } | null>(null);

  // Sync props when initial flags change
  useEffect(() => {
    setShowDisc(initialShowDisc);
    setShowFovea(initialShowFovea);
    setShowVessels(initialShowVessels);
    setShowLesions(initialShowLesions);
    setShowGradCam(initialShowGradCam);
    setGradCamOpacity(initialGradCamOpacity);
  }, [initialShowDisc, initialShowFovea, initialShowVessels, initialShowLesions, initialShowGradCam, initialGradCamOpacity]);

  // Redraw canvas whenever props or toggles change
  useEffect(() => {
    if (!canvasRef.current) return;
    drawFundusOnCanvas(canvasRef.current, {
      seed,
      stage,
      width: 600,
      height: 600,
      enhanced,
      isBlurry,
      qualityStatus,
      showOpticDisc: showDisc,
      showFovea: showFovea,
      showVessels: showVessels,
      showLesions: showLesions,
      showGradCam: showGradCam,
      gradCamOpacity,
      structureFindings,
      gradCamData
    });
  }, [
    seed,
    stage,
    enhanced,
    isBlurry,
    qualityStatus,
    showDisc,
    showFovea,
    showVessels,
    showLesions,
    showGradCam,
    gradCamOpacity,
    structureFindings,
    gradCamData
  ]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showLesions || !structureFindings?.lesionMarkers || structureFindings.lesionMarkers.length === 0) {
      if (hoveredLesion) setHoveredLesion(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Find closest lesion within 20px
    const found = structureFindings.lesionMarkers.find((l) => {
      const lx = (l.x / 500) * canvas.width;
      const ly = (l.y / 500) * canvas.height;
      const dist = Math.hypot(clickX - lx, clickY - ly);
      return dist < 24;
    });

    if (found) {
      setHoveredLesion({
        type: found.type,
        description: found.description,
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top)
      });
    } else {
      setHoveredLesion(null);
    }
  };

  return (
    <div className={`relative flex flex-col bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-md ${className}`}>
      {/* Top Header / Badges */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200">{title || 'Macula-Centered Fundus Photograph (45°)'}</span>
          {enhanced && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-mono font-medium">
              CLAHE ENHANCED
            </span>
          )}
          {isBlurry && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 text-[10px] font-mono font-medium">
              RECAPTURE REQ.
            </span>
          )}
        </div>

        {interactiveControls && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(prev + 0.25, 2.0))}
              title="Zoom In"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.max(prev - 0.25, 1.0))}
              title="Zoom Out"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              title="Reset Zoom"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Canvas Viewport */}
      <div className="relative flex items-center justify-center p-2 min-h-[300px] overflow-hidden bg-black select-none">
        <div
          style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
          className="relative max-w-full aspect-square flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredLesion(null)}
            className="w-full max-w-[480px] h-auto aspect-square rounded-full shadow-2xl cursor-crosshair"
          />

          {/* Lesion Tooltip */}
          {hoveredLesion && (
            <div
              style={{ left: hoveredLesion.x + 10, top: hoveredLesion.y - 15 }}
              className="absolute pointer-events-none z-30 bg-slate-900/95 text-white border border-cyan-500/50 rounded-lg p-2 text-xs shadow-xl backdrop-blur-sm max-w-[220px]"
            >
              <div className="font-semibold text-cyan-300 uppercase tracking-wider text-[10px]">
                {hoveredLesion.type}
              </div>
              <div className="text-slate-200 text-[11px] mt-0.5">{hoveredLesion.description}</div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Layer Toggles Bar (if enabled) */}
      {interactiveControls && (
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Layers:
            </span>

            <button
              type="button"
              onClick={() => setShowDisc(!showDisc)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                showDisc
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Optic Disc (OD)
            </button>

            <button
              type="button"
              onClick={() => setShowFovea(!showFovea)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                showFovea
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Fovea / Macula
            </button>

            <button
              type="button"
              onClick={() => setShowVessels(!showVessels)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                showVessels
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Vessel Tree
            </button>

            <button
              type="button"
              onClick={() => setShowLesions(!showLesions)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                showLesions
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Lesions ({structureFindings?.lesionMarkers.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setShowGradCam(!showGradCam)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
                showGradCam
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-400" />
              Grad-CAM Heatmap
            </button>
          </div>

          {showGradCam && (
            <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              <span className="text-slate-400 text-[11px]">Heatmap Opacity:</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={gradCamOpacity}
                onChange={(e) => setGradCamOpacity(parseFloat(e.target.value))}
                className="w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-slate-200 font-mono text-[11px] w-7">
                {Math.round(gradCamOpacity * 100)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
