import React, { useState } from 'react';
import { ScreeningRecord, DRStage, ReferralStatus } from '../types';
import {
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar,
  Database,
  Clock
} from 'lucide-react';
import { exportRecordsToCSV, resetToDefaultRecords } from '../services/storage';
import { generateClinicalPDFReport } from '../services/reportGenerator';

interface ScreeningHistoryProps {
  records: ScreeningRecord[];
  onViewRecord: (record: ScreeningRecord) => void;
  onStartNewScreening: () => void;
  onReloadRecords: () => void;
  onViewPatient?: (patientId: string) => void;
}

export function ScreeningHistory({
  records,
  onViewRecord,
  onStartNewScreening,
  onReloadRecords,
  onViewPatient
}: ScreeningHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [selectedReferral, setSelectedReferral] = useState<string>('ALL');

  const filteredRecords = records.filter((r) => {
    const matchSearch =
      r.patientInfo.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patientInfo.screeningCenter.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patientInfo.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.patientInfo.operatorName && r.patientInfo.operatorName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchStage =
      selectedStage === 'ALL'
        ? true
        : selectedStage === 'RECAPTURE'
        ? r.quality.status === 'REQUIRES_RECAPTURE'
        : r.grading.stage === selectedStage;

    const matchReferral =
      selectedReferral === 'ALL'
        ? true
        : r.referral.status === selectedReferral;

    return matchSearch && matchStage && matchReferral;
  });

  const handleExportCSV = () => {
    exportRecordsToCSV(filteredRecords);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset screening history back to clean demonstration cohort?')) {
      resetToDefaultRecords();
      onReloadRecords();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Bar */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
            <span>Local Tele-Ophthalmology Database</span>
            <span className="text-slate-300">•</span>
            <span>{records.length} Total Patients Screened</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Screening Patient Registry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit trail of AI inferences, Grad-CAM heatmaps, and doctor review logs stored on this device.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Registry (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Cohort</span>
          </button>

          <button
            type="button"
            onClick={onStartNewScreening}
            className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Screening</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Patient ID, PHC Center, District, or Operator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Stage Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Stage:</span>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ALL">All DR Stages</option>
            <option value="NO_DR">Grade 0 (No DR)</option>
            <option value="MILD_NPDR">Grade 1 (Mild)</option>
            <option value="MODERATE_NPDR">Grade 2 (Moderate)</option>
            <option value="SEVERE_NPDR">Grade 3 (Severe)</option>
            <option value="PDR">Grade 4 (Proliferative)</option>
            <option value="RECAPTURE">Recapture Needed</option>
          </select>
        </div>

        {/* Referral Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Referral:</span>
          <select
            value={selectedReferral}
            onChange={(e) => setSelectedReferral(e.target.value)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ALL">All Referral Statuses</option>
            <option value="REFERABLE">Referable Cases Only</option>
            <option value="NOT_REFERABLE">Not Referable (Routine)</option>
          </select>
        </div>
      </div>

      {/* Table of Records */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Filter className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold">No patient records match the selected filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedStage('ALL');
                setSelectedReferral('ALL');
              }}
              className="text-xs text-cyan-700 font-semibold underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Age/Sex</th>
                  <th className="py-3 px-4">PHC Center</th>
                  <th className="py-3 px-4">Eye</th>
                  <th className="py-3 px-4">DR Grade</th>
                  <th className="py-3 px-4">AI Confidence</th>
                  <th className="py-3 px-4">Triage Status</th>
                  <th className="py-3 px-4">Tele-Review</th>
                  <th className="py-3 px-4">Sync Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRecords.map((rec) => {
                  const isReferable = rec.referral.status === 'REFERABLE';
                  const isRecapture = rec.quality.status === 'REQUIRES_RECAPTURE';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {onViewPatient ? (
                          <button
                            type="button"
                            onClick={() => onViewPatient(rec.patientInfo.patientId)}
                            title="View this patient's full history"
                            className="hover:text-cyan-700 hover:underline cursor-pointer"
                          >
                            {rec.patientInfo.patientId}
                          </button>
                        ) : (
                          rec.patientInfo.patientId
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {rec.createdAt}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rec.patientInfo.age}y / {rec.patientInfo.sex}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[140px] truncate" title={rec.patientInfo.screeningCenter}>
                        {rec.patientInfo.screeningCenter}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {rec.eyeSide.includes('Right') ? 'OD' : 'OS'}
                      </td>
                      <td className="py-3 px-4">
                        {isRecapture ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                            Recapture
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              rec.grading.stage === 'NO_DR'
                                ? 'bg-emerald-100 text-emerald-900'
                                : rec.grading.stage === 'MILD_NPDR'
                                ? 'bg-sky-100 text-sky-900'
                                : rec.grading.stage === 'MODERATE_NPDR'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {rec.grading.stageName}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {rec.grading.confidence.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isReferable
                              ? rec.referral.priority === 'EMERGENCY'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-600 text-white'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {rec.referral.status === 'REFERABLE' ? rec.referral.priority : 'Routine'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {rec.reviewedByDoctor ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Signed</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {rec.syncStatus === 'queued' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Queued Locally</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                            <Database className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Synced</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => generateClinicalPDFReport(rec)}
                            title="Download PDF"
                            className="p-1 rounded hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewRecord(rec)}
                            className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
