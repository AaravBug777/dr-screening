import React, { useState } from 'react';
import { ScreeningRecord } from '../types';
import { FundusCanvasViewer } from './NewScreening/FundusCanvasViewer';
import { generateClinicalPDFReport } from '../services/reportGenerator';
import { PatientHandoutModal } from './PatientHandoutModal';
import { RetinalProgressionCompare } from './RetinalProgressionCompare';
import {
  X,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  Eye,
  MapPin,
  ShieldCheck,
  Languages
} from 'lucide-react';

interface RecordDetailModalProps {
  record: ScreeningRecord | null;
  onClose: () => void;
  allRecords?: ScreeningRecord[];
}

export function RecordDetailModal({ record, onClose, allRecords = [] }: RecordDetailModalProps) {
  const [showHandout, setShowHandout] = useState(false);

  if (!record) return null;

  const p = record.patientInfo;
  const g = record.grading;
  const r = record.referral;
  const q = record.quality;
  const s = record.structureFindings;
  const isReferable = r.status === 'REFERABLE';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">{p.patientId}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {record.id}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Screened: {record.createdAt} • {p.screeningCenter}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHandout(true)}
              title="Vernacular patient take-home advisory"
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Handout</span>
            </button>
            <button
              type="button"
              onClick={() => generateClinicalPDFReport(record)}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Patient Details & Status Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Age / Sex:</span>
              <span className="font-bold text-slate-900">{p.age}y / {p.sex}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Diabetes Duration:</span>
              <span className="font-bold text-slate-900">{p.diabetesDurationYears} Years</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Eye Examined:</span>
              <span className="font-bold text-slate-900">{record.eyeSide}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Image Quality:</span>
              <span className="font-bold text-emerald-700">{q.status} ({q.overallScore}/100)</span>
            </div>
          </div>

          {/* Classification and Referral Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                AI DR Grade
              </span>
              <h4 className="text-lg font-black text-slate-900 mt-1">{g.stageName}</h4>
              <div className="text-xs text-slate-600 mt-1">
                Confidence: <strong className="font-mono text-cyan-800">{g.confidence.toFixed(1)}%</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Tele-Triage Urgency
              </span>
              <h4 className={`text-lg font-black mt-1 ${isReferable ? 'text-amber-800' : 'text-emerald-800'}`}>
                {r.status === 'REFERABLE' ? `Referable (${r.priority})` : 'Routine Follow-up'}
              </h4>
              <div className="text-xs text-slate-600 mt-1">
                Timeframe: <strong className="text-slate-900">{r.recommendedTimeframe}</strong>
              </div>
            </div>
          </div>

          {/* Canvas Snapshots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                Retinal Photography with Lesion Segmentation:
              </span>
              <FundusCanvasViewer
                seed={record.imageUrl}
                stage={g.stage}
                enhanced={true}
                structureFindings={s}
                initialShowDisc={true}
                initialShowFovea={true}
                initialShowLesions={true}
                interactiveControls={false}
                title="Retinal Anatomy"
              />
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                Grad-CAM Activation Map:
              </span>
              <FundusCanvasViewer
                seed={record.imageUrl}
                stage={g.stage}
                enhanced={true}
                structureFindings={s}
                gradCamData={record.gradCam}
                initialShowGradCam={true}
                initialGradCamOpacity={0.7}
                interactiveControls={false}
                title="Grad-CAM Saliency"
              />
            </div>
          </div>

          {/* Doctor Review Notes if any */}
          {record.reviewedByDoctor && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Ophthalmologist Specialist Sign-Off:</span>
              </div>
              <p className="text-slate-800">{record.doctorNotes || 'Case reviewed and approved.'}</p>
            </div>
          )}

          {/* Longitudinal Retinal Progression & Temporal Comparison */}
          <RetinalProgressionCompare currentRecord={record} allRecords={allRecords} />
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">AI-assisted screening record • Stored locally</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold"
          >
            Close Details
          </button>
        </div>
      </div>

      {showHandout && (
        <PatientHandoutModal record={record} onClose={() => setShowHandout(false)} />
      )}
    </div>
  );
}
