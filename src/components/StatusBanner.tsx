import React from 'react';
import { Layers, Database, ShieldCheck } from 'lucide-react';

interface StatusBannerProps {
  isLive: boolean;
  totalCount: number;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({ isLive, totalCount }) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 mb-8 relative overflow-hidden shadow-xl">
      {/* Background ambient subtle grid accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#F97316_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Foundation Online</span>
            </span>
            <span className="text-xs text-slate-500 font-mono">| PostgreSQL Schema v1.0</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono uppercase">
            PAYRESCUE
          </h1>
          <p className="text-sm font-semibold tracking-wider text-orange-500 uppercase mt-0.5">
            AI-POWERED CHECKOUT REVENUE RECOVERY
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-2xl">
            Phase 1 Foundation operational. Payment failure transactions ingested into PostgreSQL schema with append-only audit policies and promise-to-pay tracking.
          </p>
        </div>

        {/* System Architecture Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Database className="w-3.5 h-3.5 text-orange-500" />
              <span>PostgreSQL</span>
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {isLive ? 'Supabase Live' : '4 Core Tables'}
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Layers className="w-3.5 h-3.5 text-orange-500" />
              <span>Dataset</span>
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {totalCount.toLocaleString()} Records
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg col-span-2 sm:col-span-1">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Audit Policy</span>
            </div>
            <p className="text-sm font-semibold text-slate-200">Append-Only</p>
          </div>
        </div>
      </div>
    </div>
  );
};
