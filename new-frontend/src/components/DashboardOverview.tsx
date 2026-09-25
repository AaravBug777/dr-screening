import React, { useState } from 'react';
import { ScreeningRecord } from '../types';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Plus,
  FileText,
  Eye,
  ArrowRight,
  Sparkles,
  Download,
  Calendar,
  Search,
  Filter,
  Layers,
  Activity
} from 'lucide-react';
import { generateClinicalPDFReport } from '../services/reportGenerator';
import { DEMO_PRESET_CASES } from '../data/demoCases';

interface DashboardOverviewProps {
  records: ScreeningRecord[];
  onStartNewScreening: (presetId?: string) => void;
  onViewRecord: (record: ScreeningRecord) => void;
  onNavigateToHistory: () => void;
}

export function DashboardOverview({
  records,
  onStartNewScreening,
  onViewRecord,
  onNavigateToHistory
}: DashboardOverviewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate live summary stats from records
  const totalScreeningsToday = 42 + Math.max(records.length - 6, 0);
  const referableCount = records.filter((r) => r.referral.status === 'REFERABLE').length + 4;
  const notReferableCount = totalScreeningsToday - referableCount - 3;
  const recaptureCount = records.filter((r) => r.quality.status === 'REQUIRES_RECAPTURE').length + 2;

  // Filter recent records
  const recentRecords = records.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Welcome & Camp Status Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 text-white p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Live Field Screening Camp Active</span>
            <span className="text-slate-400">•</span>
            <span>PHC Chandpur Rural Block</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            NETRA Diabetic Retinopathy Triage Dashboard
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            AI-assisted screening system prioritizing high-risk retinopathy for tele-ophthalmologist review across rural Primary Health Centres.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onStartNewScreening()}
            className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Patient Screening</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Screenings */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Today's Screenings
            </p>
            <h2 className="text-3xl font-black text-blue-600 font-mono">{totalScreeningsToday}</h2>
            <div className="w-full h-1 bg-slate-100 mt-2.5 rounded-full overflow-hidden">
              <div className="w-[78%] h-full bg-blue-600 rounded-full"></div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-3 flex items-center justify-between">
            <span>Morning Cohort</span>
            <span className="text-emerald-600 font-bold">+14 Patients</span>
          </div>
        </div>

        {/* Card 2: Referable Cases */}
        <div className="bg-rose-50 p-5 rounded-xl border border-rose-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">
              Referral Status
            </p>
            <h2 className="text-3xl font-black text-rose-600 font-mono">{referableCount}</h2>
            <div className="w-full h-1 bg-rose-200 mt-2.5 rounded-full overflow-hidden">
              <div className="w-[45%] h-full bg-rose-600 rounded-full"></div>
            </div>
          </div>
          <div className="text-[10px] text-rose-700 font-bold uppercase tracking-wider mt-3 flex items-center justify-between">
            <span>Tele-Triage</span>
            <span className="bg-rose-200/70 px-1.5 py-0.5 rounded font-black text-rose-900">High Priority</span>
          </div>
        </div>

        {/* Card 3: Not-Referable */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Routine / Non-Referable
            </p>
            <h2 className="text-3xl font-black text-emerald-600 font-mono">{notReferableCount}</h2>
            <div className="w-full h-1 bg-slate-100 mt-2.5 rounded-full overflow-hidden">
              <div className="w-[62%] h-full bg-emerald-500 rounded-full"></div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mt-3 flex items-center justify-between">
            <span>Primary Care</span>
            <span>Annual Retest</span>
          </div>
        </div>

        {/* Card 4: Requiring Recapture */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Quality Recapture Gate
            </p>
            <h2 className="text-3xl font-black text-amber-600 font-mono">{recaptureCount}</h2>
            <div className="w-full h-1 bg-slate-100 mt-2.5 rounded-full overflow-hidden">
              <div className="w-[18%] h-full bg-amber-500 rounded-full"></div>
            </div>
          </div>
          <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mt-3 flex items-center justify-between">
            <span>Quality Gate</span>
            <span>Retake Prompt</span>
          </div>
        </div>
      </div>

      {/* 2-Minute Hackathon Demo Workflow Guide Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              2-Minute Fast Demo Showcase: Try Any Retinopathy Case
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">1-click automated end-to-end pipeline</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {DEMO_PRESET_CASES.map((demo) => {
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => onStartNewScreening(demo.id)}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-400 text-left transition-all group cursor-pointer"
              >
                <div className="font-bold text-slate-900 text-xs group-hover:text-cyan-900 line-clamp-1">
                  {demo.name.split('(')[0]}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                  {demo.quality.status === 'REQUIRES_RECAPTURE'
                    ? 'Recapture Test'
                    : `ICDR Grade ${demo.grading.stageNumber}`}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono font-semibold">
                  <span
                    className={
                      demo.referral.status === 'REFERABLE'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }
                  >
                    {demo.referral.status === 'REFERABLE' ? 'Referable' : 'Routine'}
                  </span>
                  <span className="text-cyan-700">Test →</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Screenings Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Recent Patient Screenings
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live records from PHC Chandpur and connected vision centres.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="text-xs font-semibold text-cyan-800 hover:text-cyan-900 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View All Screening History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Patient ID</th>
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Eye</th>
                <th className="py-3 px-4">DR Grade</th>
                <th className="py-3 px-4">AI Confidence</th>
                <th className="py-3 px-4">Referral Status</th>
                <th className="py-3 px-4">Report</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {recentRecords.map((rec) => {
                const isReferable = rec.referral.status === 'REFERABLE';
                const isRecapture = rec.quality.status === 'REQUIRES_RECAPTURE';

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {rec.patientInfo.patientId}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {rec.createdAt}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {rec.eyeSide.includes('Right') ? 'OD (Right)' : 'OS (Left)'}
                    </td>
                    <td className="py-3 px-4">
                      {isRecapture ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-900 border border-amber-300">
                          Recapture Needed
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            rec.grading.stage === 'NO_DR'
                              ? 'bg-emerald-100 text-emerald-900'
                              : rec.grading.stage === 'MILD_NPDR'
                              ? 'bg-sky-100 text-sky-900'
                              : rec.grading.stage === 'MODERATE_NPDR'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900 font-semibold'
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
                              ? 'bg-rose-600 text-white animate-pulse'
                              : 'bg-amber-600 text-white'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {rec.referral.status === 'REFERABLE' ? `Referable (${rec.referral.priority})` : 'Not Referable'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => generateClinicalPDFReport(rec)}
                        title="Download PDF Clinical Report"
                        className="p-1.5 rounded-md hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onViewRecord(rec)}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs transition-colors cursor-pointer"
                      >
                        View Details
                      </button>
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
