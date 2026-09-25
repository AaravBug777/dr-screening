import React from 'react';
import { useTranslation } from 'react-i18next';
import { PatientInfo } from '../../types';
import { User, Calendar, MapPin, Stethoscope, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';
import { DEMO_PRESET_CASES } from '../../data/demoCases';

interface PatientInfoStepProps {
  patientInfo: PatientInfo;
  onChange: (info: PatientInfo) => void;
  onContinue: () => void;
  eyeSide: 'Left (OS)' | 'Right (OD)';
  onEyeSideChange: (side: 'Left (OS)' | 'Right (OD)') => void;
  onQuickLoadDemo: (presetId: string) => void;
}

export function PatientInfoStep({
  patientInfo,
  onChange,
  onContinue,
  eyeSide,
  onEyeSideChange,
  onQuickLoadDemo
}: PatientInfoStepProps) {
  const { t } = useTranslation();
  const handleChange = (field: keyof PatientInfo, value: any) => {
    onChange({
      ...patientInfo,
      [field]: value
    });
  };

  const handleAutofillDemo = (index: number) => {
    const demo = DEMO_PRESET_CASES[index];
    if (demo) {
      onChange(demo.patientInfo);
      onEyeSideChange(demo.eyeSide);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Step Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
              <span>{t('patientInfo.stepLabel')}</span>
              <span className="text-slate-300">•</span>
              <span>{t('patientInfo.stepSubLabel')}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{t('patientInfo.title')}</h2>
            <p className="text-sm text-slate-600 mt-1">{t('patientInfo.subtitle')}</p>
          </div>

          {/* Quick Demo Fill Buttons */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
              {t('patientInfo.quickDemoFill')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleAutofillDemo(0)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors"
              >
                {t('patientInfo.presetNormal')}
              </button>
              <button
                type="button"
                onClick={() => handleAutofillDemo(1)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors"
              >
                {t('patientInfo.presetMild')}
              </button>
              <button
                type="button"
                onClick={() => handleAutofillDemo(2)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors"
              >
                {t('patientInfo.presetModerate')}
              </button>
              <button
                type="button"
                onClick={() => handleAutofillDemo(3)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors"
              >
                {t('patientInfo.presetSevere')}
              </button>
              <button
                type="button"
                onClick={() => handleAutofillDemo(4)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors"
              >
                {t('patientInfo.presetPDR')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Patient ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.patientId')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={patientInfo.patientId}
                onChange={(e) => handleChange('patientId', e.target.value)}
                placeholder={t('patientInfo.patientIdPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none font-mono"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{t('patientInfo.patientIdHint')}</p>
          </div>

          {/* Eye Side Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.eyeUnderExam')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onEyeSideChange('Right (OD)')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  eyeSide === 'Right (OD)'
                    ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span>{t('patientInfo.rightEye')}</span>
              </button>
              <button
                type="button"
                onClick={() => onEyeSideChange('Left (OS)')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  eyeSide === 'Left (OS)'
                    ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span>{t('patientInfo.leftEye')}</span>
              </button>
            </div>
          </div>

          {/* Age */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.age')} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="10"
              max="110"
              value={patientInfo.age}
              onChange={(e) => handleChange('age', e.target.value)}
              placeholder={t('patientInfo.agePlaceholder')}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Biological Sex */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.sex')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Female', 'Male', 'Other'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleChange('sex', s)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                    patientInfo.sex === s
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {t(`patientInfo.sex${s}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Diabetes Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.diabetesDuration')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="60"
                value={patientInfo.diabetesDurationYears}
                onChange={(e) => handleChange('diabetesDurationYears', e.target.value)}
                placeholder={t('patientInfo.diabetesDurationPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{t('patientInfo.diabetesDurationHint')}</p>
          </div>

          {/* Recent HbA1c (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.hba1c')}
            </label>
            <input
              type="text"
              value={patientInfo.lastHbA1c || ''}
              onChange={(e) => handleChange('lastHbA1c', e.target.value)}
              placeholder={t('patientInfo.hba1cPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* PHC / Screening Camp Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.screeningCenter')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={patientInfo.screeningCenter}
                onChange={(e) => handleChange('screeningCenter', e.target.value)}
                placeholder={t('patientInfo.screeningCenterPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* District / State */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.district')}
            </label>
            <input
              type="text"
              value={patientInfo.district}
              onChange={(e) => handleChange('district', e.target.value)}
              placeholder={t('patientInfo.districtPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Operator Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.operatorName')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={patientInfo.operatorName}
                onChange={(e) => handleChange('operatorName', e.target.value)}
                placeholder={t('patientInfo.operatorNamePlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
              />
              <Stethoscope className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Clinical Notes / Symptoms */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('patientInfo.notes')}
            </label>
            <input
              type="text"
              value={patientInfo.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t('patientInfo.notesPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>{t('patientInfo.encryptedNote')}</span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg font-semibold text-sm shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span>{t('patientInfo.continue')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
