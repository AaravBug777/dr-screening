import React, { useState } from 'react';
import { ScreeningRecord } from '../types';
import { DEMO_PRESET_CASES } from '../data/demoCases';
import {
  Layers,
  Upload,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Eye
} from 'lucide-react';
import { exportRecordsToCSV } from '../services/storage';
import { generateClinicalPDFReport } from '../services/reportGenerator';

interface BatchScreeningProps {
  onViewRecord: (record: ScreeningRecord) => void;
  onSaveBatchToHistory: (records: ScreeningRecord[]) => void;
}

interface BatchQueueItem {
  id: string;
  preset: typeof DEMO_PRESET_CASES[0];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
  progress: number;
}

export function BatchScreening({ onViewRecord, onSaveBatchToHistory }: BatchScreeningProps) {
  const [queue, setQueue] = useState<BatchQueueItem[]>(() =>
    DEMO_PRESET_CASES.map((preset, index) => ({
      id: `queue-${index}`,
      preset,
      status: 'PENDING',
      progress: 0
    }))
  );

  const [isProcessing, setIsProcessing] = useState(false);

  const handleStartBatchInference = async () => {
    setIsProcessing(true);

    for (let i = 0; i < queue.length; i++) {
      // Set to processing
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'PROCESSING', progress: 45 } : item
        )
      );

      // Simulate step delay
      await new Promise((res) => setTimeout(res, 600));

      // Complete item
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'COMPLETED', progress: 100 } : item
        )
      );
    }

    setIsProcessing(false);
  };

  const completedRecords: ScreeningRecord[] = queue
    .filter((q) => q.status === 'COMPLETED')
    .map((q) => {
      const p = q.preset;
      return {
        id: `NETRA-BATCH-${p.id}`,
        patientInfo: p.patientInfo,
        createdAt: new Date().toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        imageUrl: p.canvasSeed,
        eyeSide: p.eyeSide,
        quality: p.quality,
        structureFindings: p.structureFindings,
        grading: p.grading,
        gradCam: p.gradCam,
        referral: p.referral,
        reviewedByDoctor: false,
        status: p.quality.status === 'REQUIRES_RECAPTURE' ? 'RECAPTURE_NEEDED' : 'PENDING_REVIEW'
      };
    });

  const handleSaveAllToHistory = () => {
    if (completedRecords.length > 0) {
      onSaveBatchToHistory(completedRecords);
      alert(`Successfully saved ${completedRecords.length} batch records to history!`);
    }
  };

  const allCompleted = queue.every((item) => item.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
            <span>High-Throughput Mode</span>
            <span className="text-slate-300">•</span>
            <span>Offline Field Camp Batch Processor</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Batch Retinal Screening Queue</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Process bulk fundus captures from rural outreach screening camps with automated quality gates and AI triage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isProcessing || allCompleted}
            onClick={handleStartBatchInference}
            className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer ${
              allCompleted
                ? 'bg-emerald-600 text-white cursor-default'
                : 'bg-cyan-700 hover:bg-cyan-800 text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Batch AI ({queue.filter((q) => q.status === 'COMPLETED').length}/{queue.length})...</span>
              </>
            ) : allCompleted ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>All Batch Inferences Complete</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run Batch Inference on Queue</span>
              </>
            )}
          </button>

          {allCompleted && (
            <button
              type="button"
              onClick={handleSaveAllToHistory}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Save All to History</span>
            </button>
          )}
        </div>
      </div>

      {/* Batch Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-900 uppercase tracking-wider">
            Queued Camp Fundus Photographs ({queue.length} Cases)
          </div>
          <span className="text-slate-500 font-mono">
            Status: {queue.filter((q) => q.status === 'COMPLETED').length} / {queue.length} Done
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Queue #</th>
                <th className="py-3 px-4">Patient ID & Name</th>
                <th className="py-3 px-4">Age/Sex</th>
                <th className="py-3 px-4">Eye</th>
                <th className="py-3 px-4">Image Quality</th>
                <th className="py-3 px-4">AI DR Staging</th>
                <th className="py-3 px-4">Referral Priority</th>
                <th className="py-3 px-4">Inference Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {queue.map((item, idx) => {
                const p = item.preset;
                const isCompleted = item.status === 'COMPLETED';
                const isProcessing = item.status === 'PROCESSING';

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-400">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold font-mono text-slate-900">{p.patientInfo.patientId}</div>
                      <div className="text-[11px] text-slate-500">{p.patientInfo.name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.patientInfo.age}y / {p.patientInfo.sex}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {p.eyeSide.includes('Right') ? 'OD' : 'OS'}
                    </td>
                    <td className="py-3 px-4">
                      {isCompleted ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.quality.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {p.quality.status === 'ACCEPTED' ? `Score: ${p.quality.overallScore}` : 'Recapture'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Queued</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isCompleted ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.grading.stage === 'NO_DR'
                              ? 'bg-emerald-100 text-emerald-900'
                              : p.grading.stage === 'MILD_NPDR'
                              ? 'bg-sky-100 text-sky-900'
                              : p.grading.stage === 'MODERATE_NPDR'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {p.grading.stageName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isCompleted ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            p.referral.status === 'REFERABLE'
                              ? p.referral.priority === 'EMERGENCY'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-600 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.referral.status === 'REFERABLE' ? p.referral.priority : 'Routine'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isProcessing ? (
                        <div className="flex items-center gap-1.5 text-cyan-700 font-semibold text-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Inferencing...</span>
                        </div>
                      ) : isCompleted ? (
                        <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Done</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Ready</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => {
                            const rec: ScreeningRecord = {
                              id: `NETRA-BATCH-${p.id}`,
                              patientInfo: p.patientInfo,
                              createdAt: new Date().toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              }),
                              imageUrl: p.canvasSeed,
                              eyeSide: p.eyeSide,
                              quality: p.quality,
                              structureFindings: p.structureFindings,
                              grading: p.grading,
                              gradCam: p.gradCam,
                              referral: p.referral,
                              reviewedByDoctor: false,
                              status: 'PENDING_REVIEW'
                            };
                            onViewRecord(rec);
                          }}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium cursor-pointer"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
