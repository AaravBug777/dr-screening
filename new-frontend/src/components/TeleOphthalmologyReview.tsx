import React, { useState } from 'react';
import { ScreeningRecord, DRStage, ReferralPriority } from '../types';
import { FundusCanvasViewer } from './NewScreening/FundusCanvasViewer';
import {
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Flame,
  FileCheck,
  Download,
  User,
  Calendar,
  Eye,
  ShieldCheck,
  Send
} from 'lucide-react';
import { updateScreeningRecord } from '../services/storage';
import { generateClinicalPDFReport } from '../services/reportGenerator';

interface TeleOphthalmologyReviewProps {
  records: ScreeningRecord[];
  onRecordUpdated: () => void;
  onViewRecord: (record: ScreeningRecord) => void;
}

export function TeleOphthalmologyReview({
  records,
  onRecordUpdated,
  onViewRecord
}: TeleOphthalmologyReviewProps) {
  // Pending review cases or referable cases
  const reviewQueue = records.filter(
    (r) => r.referral.status === 'REFERABLE' || !r.reviewedByDoctor
  );

  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    reviewQueue[0]?.id || records[0]?.id || ''
  );

  const currentRecord = records.find((r) => r.id === selectedRecordId) || records[0];

  const [doctorNotes, setDoctorNotes] = useState<string>(
    currentRecord?.doctorNotes || 'Confirming moderate NPDR. Macular center appears dry without clinically significant macular edema (CSME). Schedule fluorescein angiography & tele-followup at district hospital in 3 weeks.'
  );
  const [agreedWithAI, setAgreedWithAI] = useState<boolean>(true);
  const [overrideStage, setOverrideStage] = useState<DRStage>(currentRecord?.grading.stage || 'MODERATE_NPDR');
  const [overridePriority, setOverridePriority] = useState<ReferralPriority>(currentRecord?.referral.priority || 'HIGH');
  const [signedSuccess, setSignedSuccess] = useState<boolean>(false);

  if (!currentRecord) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500">
        <Stethoscope className="w-10 h-10 mx-auto text-slate-300 mb-2" />
        <p className="font-semibold text-sm">No cases currently awaiting tele-ophthalmologist review.</p>
      </div>
    );
  }

  const p = currentRecord.patientInfo;
  const g = currentRecord.grading;
  const r = currentRecord.referral;

  const handleSignOff = () => {
    const updated: ScreeningRecord = {
      ...currentRecord,
      reviewedByDoctor: true,
      doctorNotes,
      status: 'REVIEWED'
    };
    updateScreeningRecord(updated);
    onRecordUpdated();
    setSignedSuccess(true);
    setTimeout(() => setSignedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
            <span>Tele-Ophthalmology Reading Room</span>
            <span className="text-slate-300">•</span>
            <span>Consultant Specialist Sign-Off Mode</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Specialist Tele-Triage & Sign-Off</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Remote ophthalmologist review queue for rural PHC cases flagged as referable or ambiguous.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-900 border border-cyan-200 font-bold font-mono">
            {reviewQueue.length} Cases in Reading Queue
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Reading Queue List */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            Incoming Referral Cases:
          </div>

          <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {records.map((rec) => {
              const isSelected = rec.id === selectedRecordId;
              const isRef = rec.referral.status === 'REFERABLE';

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => {
                    setSelectedRecordId(rec.id);
                    setSignedSuccess(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-50 border-cyan-500 ring-2 ring-cyan-500/20 shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{rec.patientInfo.patientId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isRef ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {isRef ? rec.referral.priority : 'Routine'}
                    </span>
                  </div>

                  <div className="text-slate-600 mt-1 font-medium">{rec.grading.stageName}</div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
                    <span>{rec.patientInfo.screeningCenter}</span>
                    <span>{rec.reviewedByDoctor ? '✓ Signed' : 'Pending Review'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Case Deep-Dive & Clinical Decision Form */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            {/* Case Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 font-mono">
                    {p.patientId}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {p.age}y / {p.sex} • {currentRecord.eyeSide}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Captured at: {p.screeningCenter} ({p.district}) • Operator: {p.operatorName}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generateClinicalPDFReport(currentRecord)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Report</span>
                </button>
              </div>
            </div>

            {/* Fundus + Grad-CAM Visualizer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Retinal Morphology & Lesion Overlay
                </div>
                <FundusCanvasViewer
                  seed={currentRecord.imageUrl}
                  stage={g.stage}
                  enhanced={true}
                  structureFindings={currentRecord.structureFindings}
                  initialShowDisc={true}
                  initialShowFovea={true}
                  initialShowLesions={true}
                  interactiveControls={false}
                  title="Anatomy & Lesions"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Grad-CAM Spatial Explainability Heatmap
                </div>
                <FundusCanvasViewer
                  seed={currentRecord.imageUrl}
                  stage={g.stage}
                  enhanced={true}
                  structureFindings={currentRecord.structureFindings}
                  gradCamData={currentRecord.gradCam}
                  initialShowGradCam={true}
                  initialGradCamOpacity={0.7}
                  interactiveControls={false}
                  title="Grad-CAM Saliency"
                />
              </div>
            </div>

            {/* AI Diagnosis vs Doctor Confirmation Section */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    AI Inferred Classification
                  </span>
                  <div className="text-base font-bold text-slate-900">
                    {g.stageName} (Grade {g.stageNumber}) • {g.confidence.toFixed(1)}% Confidence
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAgreedWithAI(true)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      agreedWithAI
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    ✓ Confirm AI Assessment
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgreedWithAI(false)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      !agreedWithAI
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Modify / Overrule
                  </button>
                </div>
              </div>

              {!agreedWithAI && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Specialist Final Staging:
                    </label>
                    <select
                      value={overrideStage}
                      onChange={(e) => setOverrideStage(e.target.value as DRStage)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="NO_DR">Grade 0: No Apparent DR</option>
                      <option value="MILD_NPDR">Grade 1: Mild NPDR</option>
                      <option value="MODERATE_NPDR">Grade 2: Moderate NPDR</option>
                      <option value="SEVERE_NPDR">Grade 3: Severe NPDR</option>
                      <option value="PDR">Grade 4: Proliferative DR</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Referral Urgency Priority:
                    </label>
                    <select
                      value={overridePriority}
                      onChange={(e) => setOverridePriority(e.target.value as ReferralPriority)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="EMERGENCY">Emergency (&lt; 1 week)</option>
                      <option value="HIGH">High Priority (2-3 weeks)</option>
                      <option value="MEDIUM">Medium Priority (1-2 months)</option>
                      <option value="ROUTINE">Routine Follow-up (12 months)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Doctor Clinical Notes */}
              <div>
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block mb-1">
                  Ophthalmologist Clinical Advice & Tele-Prescription Notes:
                </label>
                <textarea
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Enter clinical examination notes, suggested investigations (OCT / FFA), and follow-up timeline..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>

              {/* Sign-off button */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Digital Tele-Consultation Signature will be stamped onto patient report.</span>
                </div>

                <button
                  type="button"
                  onClick={handleSignOff}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Sign & Authorize Tele-Consultation</span>
                </button>
              </div>

              {signedSuccess && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-xs text-emerald-900 font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Tele-consultation signed and archived successfully! Stamped PDF ready for download.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
