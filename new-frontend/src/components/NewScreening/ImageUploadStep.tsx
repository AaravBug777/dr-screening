import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Sparkles, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { RealFundusImage } from './RealFundusImage';

// Real IDRiD expert-labeled sample images shipped in the repo
// (sample_test_images/, copied into public/samples/ for this app), spanning
// No DR through Proliferative DR -- same images the top-level README points
// people at for a quick real demo. Served as static files by Vite.
const SAMPLE_IMAGES = [
  { file: 'IDRiD_005.jpg', label: 'Sample: IDRiD_005' },
  { file: 'IDRiD_016.jpg', label: 'Sample: IDRiD_016' },
  { file: 'IDRiD_023.jpg', label: 'Sample: IDRiD_023' },
  { file: 'IDRiD_092.jpg', label: 'Sample: IDRiD_092' },
];

interface ImageUploadStepProps {
  imageFile: File | null;
  imagePreviewUrl: string | null;
  onImageSelected: (file: File) => void;
  onProceedToQuality: () => void;
  onBack: () => void;
}

export function ImageUploadStep({
  imageFile,
  imagePreviewUrl,
  onImageSelected,
  onProceedToQuality,
  onBack
}: ImageUploadStepProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageSelected(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onImageSelected(file);
  };

  const handleSampleClick = async (sample: (typeof SAMPLE_IMAGES)[number]) => {
    setSampleLoading(sample.file);
    try {
      // Fetches the REAL sample JPEG and turns it into a real File object,
      // so it goes through the exact same upload path (and real backend
      // inference) as a user-picked file -- not a shortcut with fake data.
      const res = await fetch(`/samples/${sample.file}`);
      const blob = await res.blob();
      const file = new File([blob], sample.file, { type: blob.type || 'image/jpeg' });
      onImageSelected(file);
    } finally {
      setSampleLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('upload.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('upload.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('upload.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('upload.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: Drag & Drop Zone and Sample Picker */}
        <div className="md:col-span-6 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all bg-white cursor-pointer ${
              dragOver ? 'border-cyan-500 bg-cyan-50/50' : 'border-slate-300 hover:border-slate-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              onChange={handleFileSelected}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-cyan-50 text-cyan-700 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">{t('upload.dragDrop')}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {t('upload.formats')} <span className="font-semibold text-slate-700">JPG, JPEG, PNG</span>
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-xs shadow-sm transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {t('upload.uploadButton')}
              </button>
            </div>
          </div>

          {/* Real Sample Cases (from sample_test_images/) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {t('upload.sampleHeading')}
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SAMPLE_IMAGES.map((sample) => (
                <button
                  key={sample.file}
                  type="button"
                  disabled={sampleLoading !== null}
                  onClick={() => handleSampleClick(sample)}
                  className="text-left p-2.5 rounded-lg border text-xs transition-all bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <span className="font-semibold block">{sample.label}</span>
                  <span className="text-[11px] text-slate-500">
                    {sampleLoading === sample.file ? t('upload.sampleLoading') : t('upload.sampleHint')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Real Preview */}
        <div className="md:col-span-6 space-y-4">
          {imagePreviewUrl ? (
            <RealFundusImage src={imagePreviewUrl} title={t('upload.selectedImage')} badge={t('upload.realUploadBadge')} />
          ) : (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center text-slate-400 text-sm aspect-square">
              {t('upload.noImage')}
            </div>
          )}

          <div className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
            <span>{t('upload.hint')}</span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <button
          type="button"
          disabled={!imageFile}
          onClick={onProceedToQuality}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>{t('upload.runPipeline')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
