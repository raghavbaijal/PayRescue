import React from 'react';
import { ShieldAlert, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface HeaderProps {
  isLive: boolean;
  totalCount: number;
}

export const Header: React.FC<HeaderProps> = ({ isLive, totalCount }) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-500 shadow-sm shadow-orange-500/10">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-wider text-slate-100 text-lg uppercase font-mono">
                PAYRESCUE
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-950/60 text-orange-400 border border-orange-800/50 uppercase tracking-widest">
                Phase 1
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-400 tracking-wide uppercase">
              AI-Powered Checkout Revenue Recovery
            </p>
          </div>
        </div>

        {/* Database Uptime & Status Indicator */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Database:</span>
            {isLive ? (
              <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Supabase Live ({totalCount.toLocaleString()})</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Local Seed Dataset ({totalCount.toLocaleString()})</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
