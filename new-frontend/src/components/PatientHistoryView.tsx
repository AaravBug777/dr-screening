import React, { useMemo, useState, useEffect } from 'react';
import { ScreeningRecord } from '../types';
import {
  Search,
  User,
  MapPin,
  Calendar,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Users
} from 'lucide-react';

interface PatientHistoryViewProps {
  records: ScreeningRecord[];
  onViewRecord: (record: ScreeningRecord) => void;
  initialPatientId?: string | null;
}

interface PatientSummary {
  patientId: string;
  latest: ScreeningRecord;
  visits: ScreeningRecord[];
  visitCount: number;
}

// Groups the shared clinic record (records is a flat, cross-patient list --
// see ScreeningHistory.tsx) by patientId so an operator or doctor can pull
// up ONE patient and see everything, instead of hunting through the shared
// table or the eye-scoped baseline/latest comparison on a single record
// (RetinalProgressionCompare.tsx, which only ever shows two visits at a
// time for one eye). Relies on the same "records is newest-first" array-
// order convention documented in services/progressionAnalysis.ts.
function groupByPatient(records: ScreeningRecord[]): PatientSummary[] {
  const map = new Map<string, ScreeningRecord[]>();
  for (const r of records) {
    const id = r.patientInfo.patientId;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(r);
  }
  return Array.from(map.entries()).map(([patientId, visits]) => ({
    patientId,
    latest: visits[0],
    visits,
    visitCount: visits.length
  }));
}

function stageBadgeClasses(stage: string) {
  if (stage === 'NO_DR') return 'bg-emerald-100 text-emerald-900';
  if (stage === 'MILD_NPDR') return 'bg-sky-100 text-sky-900';
  if (stage === 'MODERATE_NPDR') return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-900';
}

export function PatientHistoryView({ records, onViewRecord, initialPatientId }: PatientHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId ?? null);

  useEffect(() => {
    if (initialPatientId) setSelectedPatientId(initialPatientId);
  }, [initialPatientId]);

  const patients = useMemo(() => groupByPatient(records), [records]);

  const filteredPatients = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return patients;
    return patients.filter(
      (p) =>
        p.patientId.toLowerCase().includes(term) ||
        p.latest.patientInfo.district.toLowerCase().includes(term) ||
        p.latest.patientInfo.screeningCenter.toLowerCase().includes(term)
    );
  }, [patients, searchTerm]);

  const selected = patients.find((p) => p.patientId === selectedPatientId) ?? null;

  const rightEyeLatest = selected?.visits.find((v) => v.eyeSide === 'Right (OD)');
  const leftEyeLatest = selected?.visits.find((v) => v.eyeSide === 'Left (OS)');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      {/* Patient Picker */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col max-h-[calc(100vh-220px)] lg:sticky lg:top-4">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>{patients.length} Patients</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Patient ID, PHC, or district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100">
          {filteredPatients.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No patients match this search.</div>
          ) : (
            filteredPatients.map((p) => {
              const isActive = p.patientId === selectedPatientId;
              const isReferable = p.latest.referral.status === 'REFERABLE';
              return (
                <button
                  key={p.patientId}
                  type="button"
                  onClick={() => setSelectedPatientId(p.patientId)}
                  className={`w-full text-left p-3.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isActive ? 'bg-cyan-50 border-l-2 border-cyan-600' : 'hover:bg-slate-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-slate-900 text-xs truncate">{p.patientId}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{p.latest.patientInfo.district}</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {p.visitCount} visit{p.visitCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      isReferable ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isReferable ? 'Referable' : 'Routine'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Patient Profile */}
      {!selected ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center p-16 text-slate-400">
          <Users className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Select a patient to view their full history.</p>
          <p className="text-xs mt-1 max-w-sm">
            Every visit for that patient, both eyes, in one place -- not the shared clinic table or a single
            baseline-vs-latest comparison.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Patient Header */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-cyan-700" />
                  <h2 className="text-lg font-bold text-slate-900 font-mono">{selected.patientId}</h2>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {selected.latest.patientInfo.age}y / {selected.latest.patientInfo.sex} &middot;{' '}
                  Diabetes {selected.latest.patientInfo.diabetesDurationYears} yrs
                  {selected.latest.patientInfo.lastHbA1c ? ` · HbA1c ${selected.latest.patientInfo.lastHbA1c}` : ''}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1.5">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>
                    {selected.latest.patientInfo.screeningCenter}, {selected.latest.patientInfo.district}
                  </span>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 justify-end">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Last visit: {selected.latest.createdAt}</span>
                </div>
                <div className="mt-1">{selected.visitCount} total visits on record</div>
              </div>
            </div>
          </div>

          {/* Both Eyes -- current status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Right Eye (OD)', record: rightEyeLatest },
              { label: 'Left Eye (OS)', record: leftEyeLatest }
            ].map(({ label, record }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </div>
                {record ? (
                  <>
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${stageBadgeClasses(record.grading.stage)}`}>
                      {record.grading.stageName}
                    </span>
                    <div className="text-xs text-slate-600 mt-2">
                      {record.referral.status === 'REFERABLE' ? (
                        <span className="text-rose-700 font-semibold">Referable ({record.referral.priority})</span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">Not referable</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onViewRecord(record)}
                      className="mt-3 text-[11px] font-semibold text-cyan-700 hover:text-cyan-900 flex items-center gap-1 cursor-pointer"
                    >
                      <span>View latest visit</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Not yet screened.</p>
                )}
              </div>
            ))}
          </div>

          {/* Visit Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visit Timeline</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {selected.visits.map((v) => {
                const isReferable = v.referral.status === 'REFERABLE';
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onViewRecord(v)}
                    className="w-full text-left p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isReferable ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {isReferable ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{v.createdAt}</div>
                        <div className="text-[11px] text-slate-500">
                          {v.eyeSide} &middot; {v.grading.stageName}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v.reviewedByDoctor ? (
                        <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Signed
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Pending review</span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
