import React from 'react';
import { DEMO_PRESET_CASES } from '../data/demoCases';
import { Sparkles, X, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DemoModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCase: (presetId: string) => void;
}

export function DemoModeModal({ isOpen, onClose, onSelectCase }: DemoModeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Hackathon Jury Fast-Track Demo</span>
            </div>
            <h2 className="text-xl font-bold">Select a Clinical Case to Demonstrate</h2>
            <p className="text-xs text-slate-300 mt-1">
              Test all 5 ICDR stages and the automated quality gate in the end-to-end Explainable AI pipeline.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Case Cards List */}
        <div className="p-6 space-y-3 overflow-y-auto">
          {DEMO_PRESET_CASES.map((preset) => {
            const isRecapture = preset.quality.status === 'REQUIRES_RECAPTURE';
            const isRef = preset.referral.status === 'REFERABLE';

            return (
              <div
                key={preset.id}
                onClick={() => {
                  onSelectCase(preset.id);
                  onClose();
                }}
                className="p-4 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm group-hover:text-cyan-900">
                      {preset.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                        isRecapture
                          ? 'bg-amber-100 text-amber-900'
                          : preset.expectedStage === 'NO_DR'
                          ? 'bg-emerald-100 text-emerald-900'
                          : preset.expectedStage === 'MILD_NPDR'
                          ? 'bg-sky-100 text-sky-900'
                          : preset.expectedStage === 'MODERATE_NPDR'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-rose-100 text-rose-900'
                      }`}
                    >
                      {isRecapture ? 'Quality Recapture' : preset.expectedStage.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {preset.shortDescription}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold ${
                      isRef ? 'text-amber-800' : 'text-emerald-800'
                    }`}
                  >
                    {isRef ? 'Referable' : 'Routine'}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-cyan-700 group-hover:text-white text-slate-600 flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>All cases render procedural fundus photographs with live Grad-CAM heatmaps.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
