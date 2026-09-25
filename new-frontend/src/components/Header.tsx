import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserSession } from '../types';
import { logout } from '../services/backendApi';
import { LanguageSwitcher } from './LanguageSwitcher';
import {
  Eye,
  ShieldCheck,
  LogOut,
  MapPin,
  ChevronDown,
  Lock,
  Plus,
  WifiOff
} from 'lucide-react';

interface HeaderProps {
  session: UserSession;
  onStartNewScreening: () => void;
  onSignedOut?: () => void;
  isOnline: boolean;
  queuedCount: number;
  onOpenSyncModal: () => void;
}

export function Header({
  session,
  onStartNewScreening,
  onSignedOut,
  isOnline,
  queuedCount,
  onOpenSyncModal
}: HeaderProps) {
  const { t } = useTranslation();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  return (
    <header
      id="netra-app-header"
      className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-black">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl font-black tracking-tighter text-blue-400">NETRA</span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-tight hidden sm:block">
              {t('header.tagline')}
            </p>
          </div>
        </div>

        {/* Right: Quick Actions & User Profile */}
        <div className="flex items-center gap-2.5">
          <LanguageSwitcher />

          {/* Field Cache & Sync Hub trigger */}
          <button
            type="button"
            onClick={onOpenSyncModal}
            title="Open Field Cache & Sync Hub"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-wider border ${
              isOnline
                ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border-amber-500/40'
            }`}
          >
            {isOnline ? (
              <>
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                </span>
                <span className="hidden sm:inline">Cache Active</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Field Offline</span>
                {queuedCount > 0 && (
                  <span className="bg-amber-500 text-amber-950 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none">
                    {queuedCount}
                  </span>
                )}
              </>
            )}
          </button>

          {/* Quick New Screening */}
          <button
            type="button"
            onClick={onStartNewScreening}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('header.newScreening')}</span>
          </button>

          {/* User Account Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-2 pl-2.5 pr-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer text-left"
            >
              <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center font-black text-xs">
                {session.role === 'OPHTHALMOLOGIST' ? 'DR' : session.role === 'ADMIN' ? 'AD' : 'OP'}
              </div>
              <div className="hidden md:block">
                <div className="font-bold text-white text-xs leading-none line-clamp-1">{session.name}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{session.roleTitle}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-slate-800 text-xs">
                  <div className="font-bold text-white">{session.name}</div>
                  <div className="text-slate-400 flex items-center gap-1 mt-0.5 text-[11px]">
                    <MapPin className="w-3 h-3 text-cyan-400" />
                    <span>{session.center}</span>
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    District: {session.district}, {session.state}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Secure ABHA PHC Session Active</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      setShowRoleMenu(false);
                      onSignedOut?.();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-rose-300 hover:bg-rose-950/60 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('header.signOut')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
