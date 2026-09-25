import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import mr from './locales/mr.json';
import kn from './locales/kn.json';
import gu from './locales/gu.json';

// Supported languages, each labeled in its OWN script (not English) so a
// community health worker who doesn't read English can still recognize
// their language by sight in the switcher -- the whole point of this
// feature. Machine/AI-translated, not reviewed by a native speaker yet --
// see the note in new-frontend's section of the project README.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', nativeName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'bn', nativeName: 'বাংলা' },
  { code: 'ta', nativeName: 'தமிழ்' },
  { code: 'te', nativeName: 'తెలుగు' },
  { code: 'mr', nativeName: 'मराठी' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ' },
  { code: 'gu', nativeName: 'ગુજરાતી' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
      ta: { translation: ta },
      te: { translation: te },
      mr: { translation: mr },
      kn: { translation: kn },
      gu: { translation: gu },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // localStorage first (an explicit choice made in this app persists
      // across visits), then the browser's own language list, then <html lang>.
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'netra_language',
      caches: ['localStorage'],
    },
  });

export default i18n;
