import React from 'react';
import { ScreeningRecord } from '../types';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Users,
  AlertCircle,
  Building,
  ShieldCheck,
  Award,
  Activity,
  HeartHandshake
} from 'lucide-react';

interface AnalyticsDashboardProps {
  records: ScreeningRecord[];
}

export function AnalyticsDashboard({ records }: AnalyticsDashboardProps) {
  // Epidemiological cohort metrics
  const totalInCohort = 1480;
  const noDRCount = 1157; // 78.2%
  const mildCount = 142;  // 9.6%
  const moderateCount = 104; // 7.0%
  const severeCount = 52;   // 3.5%
  const pdrCount = 25;      // 1.7%

  const referablePct = (((moderateCount + severeCount + pdrCount) / totalInCohort) * 100).toFixed(1);
  const overallDRPct = (((mildCount + moderateCount + severeCount + pdrCount) / totalInCohort) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>District Health Informatics</span>
          <span className="text-slate-300">•</span>
          <span>Epidemiology & Program Performance</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">
          Rural Diabetic Retinopathy Epidemiological Analytics
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Population health telemetry aggregated across district primary health centres and mobile vision screening vans.
        </p>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Patients Screened
          </span>
          <div className="text-3xl font-black text-slate-900 mt-1 font-mono">{totalInCohort.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">Across 12 Rural PHCs & CHCs</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Overall DR Prevalence
          </span>
          <div className="text-3xl font-black text-cyan-700 mt-1 font-mono">{overallDRPct}%</div>
          <div className="text-[11px] text-cyan-800 mt-1">323 diagnosed diabetic patients</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Referable Retinopathy Rate
          </span>
          <div className="text-3xl font-black text-amber-600 mt-1 font-mono">{referablePct}%</div>
          <div className="text-[11px] text-amber-700 mt-1">181 cases routed to Tele-Ophthalmology</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Avg Tele-Triage Latency
          </span>
          <div className="text-3xl font-black text-emerald-600 mt-1 font-mono">18.4 min</div>
          <div className="text-[11px] text-emerald-700 mt-1">From retinal capture to specialist sign-off</div>
        </div>
      </div>

      {/* Severity Breakdown & Distribution Chart */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: 5-Stage Disease Distribution */}
        <div className="md:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-700" />
              ICDR 5-Stage Severity Breakdown in Cohort
            </h3>
            <span className="text-xs text-slate-400 font-mono">n = {totalInCohort}</span>
          </div>

          <div className="space-y-4 pt-2">
            {/* Grade 0 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Grade 0: No Apparent DR (Safe)</span>
                <span className="font-mono text-slate-600 font-bold">1,157 patients (78.2%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div style={{ width: '78.2%' }} className="h-full bg-emerald-500 rounded-full" />
              </div>
            </div>

            {/* Grade 1 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Grade 1: Mild NPDR (Microaneurysms only)</span>
                <span className="font-mono text-slate-600 font-bold">142 patients (9.6%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div style={{ width: '9.6%' }} className="h-full bg-sky-500 rounded-full" />
              </div>
            </div>

            {/* Grade 2 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Grade 2: Moderate NPDR (Referable)</span>
                <span className="font-mono text-slate-600 font-bold">104 patients (7.0%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div style={{ width: '7.0%' }} className="h-full bg-amber-500 rounded-full" />
              </div>
            </div>

            {/* Grade 3 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Grade 3: Severe NPDR (High Urgency)</span>
                <span className="font-mono text-slate-600 font-bold">52 patients (3.5%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div style={{ width: '3.5%' }} className="h-full bg-orange-600 rounded-full" />
              </div>
            </div>

            {/* Grade 4 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Grade 4: Proliferative DR (Emergency)</span>
                <span className="font-mono text-slate-600 font-bold">25 patients (1.7%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div style={{ width: '1.7%' }} className="h-full bg-rose-600 rounded-full" />
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200 mt-4">
            <strong>Key Insight:</strong> 12.2% of rural diabetics screened exhibited vision-threatening referable retinopathy (Moderate NPDR to PDR) previously undiagnosed.
          </div>
        </div>

        {/* Right: PHC Center Screening Performance */}
        <div className="md:col-span-5 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-cyan-700" />
              PHC Field Performance
            </h3>
            <span className="text-xs text-slate-400">Bijnor District</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">PHC Chandpur</div>
                <div className="text-[11px] text-slate-500">Vision Tech: Sunita Devi</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-slate-900">412 Screened</div>
                <div className="text-[10px] text-emerald-700">96.8% Image Quality</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">CHC Noorpur</div>
                <div className="text-[11px] text-slate-500">Vision Tech: Rajesh Verma</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-slate-900">388 Screened</div>
                <div className="text-[10px] text-emerald-700">95.4% Image Quality</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">PHC Dhampur</div>
                <div className="text-[11px] text-slate-500">Vision Tech: Meena Kumari</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-slate-900">345 Screened</div>
                <div className="text-[10px] text-emerald-700">94.9% Image Quality</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Mobile Retinal Van #02</div>
                <div className="text-[11px] text-slate-500">Vision Tech: Anil Kumar</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-slate-900">335 Screened</div>
                <div className="text-[10px] text-emerald-700">93.2% Image Quality</div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Overall Model Accuracy vs Gold Standard:</span>
            <span className="font-bold text-slate-900 font-mono">94.2% AUC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
