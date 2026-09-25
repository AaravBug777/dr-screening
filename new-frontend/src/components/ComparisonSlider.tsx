import React, { useEffect, useRef, useState } from 'react';
import { ScreeningRecord } from '../types';
import { drawFundusOnCanvas } from '../services/fundusRenderer';

interface ComparisonSliderProps {
  before: ScreeningRecord;
  after: ScreeningRecord;
  beforeLabel: string;
  afterLabel: string;
}

// Shows the real captured fundus photo (record.imageUrl is a base64 data
// URI for any record that went through the live /predict pipeline) --
// only demo/seed records, whose imageUrl is a symbolic seed string rather
// than real image data, fall back to the same procedural canvas renderer
// the rest of this app already uses for them (FundusCanvasViewer). This
// keeps the comparison honest: a real patient's own two photos side by
// side, not a synthetic stand-in pretending to be one.
function ComparisonPanel({ record }: { record: ScreeningRecord }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRealImage = record.imageUrl.startsWith('data:');

  useEffect(() => {
    if (isRealImage || !canvasRef.current) return;
    drawFundusOnCanvas(canvasRef.current, {
      seed: record.imageUrl,
      stage: record.grading.stage,
      width: 600,
      height: 600,
      enhanced: true,
      qualityStatus: record.quality.status,
      structureFindings: record.structureFindings,
      gradCamData: record.gradCam
    });
  }, [record, isRealImage]);

  if (isRealImage) {
    return <img src={record.imageUrl} alt="Fundus" className="absolute inset-0 w-full h-full object-cover" draggable={false} />;
  }
  return <canvas ref={canvasRef} width={600} height={600} className="absolute inset-0 w-full h-full object-cover" />;
}

export function ComparisonSlider({ before, after, beforeLabel, afterLabel }: ComparisonSliderProps) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-slate-300 bg-slate-900 select-none">
      {/* After -- full, bottom layer */}
      <ComparisonPanel record={after} />

      {/* Before -- top layer, clipped to the slider position */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <ComparisonPanel record={before} />
      </div>

      {/* Divider handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)] pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 text-[10px] font-black">
          ↔
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider pointer-events-none">
        {afterLabel}
      </div>

      {/* Drag control */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        aria-label="Comparison slider position"
      />
    </div>
  );
}
