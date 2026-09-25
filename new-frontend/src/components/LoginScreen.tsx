import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import { login, BackendOperator } from '../services/backendApi';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LoginScreenProps {
  onLoggedIn: (operator: BackendOperator) => void;
}

// Real sign-in against backend/auth.py's session system (PBKDF2-hashed
// passwords, signed HttpOnly cookies) -- /predict and /report require an
// operator session, so the app can't reach the real backend without this.
export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const operator = await login(username, password);
      onLoggedIn(operator);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Eye className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-display text-2xl font-black tracking-tighter text-slate-900">NETRA</div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest">{t('login.title')}</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {t('login.subtitle')} <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">manage_operators.py</code>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5" />
                {t('login.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5" />
                {t('login.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{isSubmitting ? t('login.signingIn') : t('login.signIn')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
