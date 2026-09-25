import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';

// Each language is shown in its OWN script (not English), specifically so
// a health worker who doesn't read English can still find their language
// by sight -- an English-only dropdown listing "Hindi / Tamil / ..." would
// defeat the point of this feature.
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 rounded-lg border border-slate-700 text-xs text-white transition-colors cursor-pointer"
      >
        <Languages className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-semibold">{current.nativeName}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isActive = lang.code === i18n.language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-sm transition-colors ${
                    isActive ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{lang.nativeName}</span>
                  {isActive && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
