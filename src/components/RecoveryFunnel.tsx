import React from 'react';
import type { RecoveryFunnelMetrics } from '../types/recovery';
import { Filter, CheckCircle2, Bot, ShieldCheck, Zap, ShieldAlert, Ban } from 'lucide-react';

interface RecoveryFunnelProps {
  funnel: RecoveryFunnelMetrics;
}

export const RecoveryFunnel: React.FC<RecoveryFunnelProps> = ({ funnel }) => {
  const failed = funnel.failed || 1;
  const diagnosedPct = Math.min(100, Math.round((funnel.diagnosed / failed) * 100));
  const eligiblePct = Math.min(100, Math.round((funnel.eligible / failed) * 100));
  const interventionPct = Math.min(100, Math.round((funnel.intervention / failed) * 100));
  const recoveredPct = Math.min(100, Math.round((funnel.recovered / failed) * 100));

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-orange-500" />
          <h3 className="text-xs font-bold text-slate-100 font-mono uppercase tracking-wider">
            Recovery Funnel Conversion
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          5-Stage Pipeline
        </span>
      </div>

      <div className="space-y-3">
        {/* Stage 1: Failed Payments */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-bold">1. Failed Checkout Payments</span>
            <span className="text-slate-200 font-bold">{funnel.failed} (100%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-slate-600 h-full rounded-full transition-all duration-500" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Stage 2: AI Diagnosed */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-orange-400 flex items-center space-x-1.5 font-semibold">
              <Bot className="w-3.5 h-3.5" />
              <span>2. AI Diagnosed (GPT-OSS 120B)</span>
            </span>
            <span className="text-orange-400 font-bold">{funnel.diagnosed} ({diagnosedPct}%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${diagnosedPct}%` }} />
          </div>
        </div>

        {/* Stage 3: Recovery Eligible */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 flex items-center space-x-1.5 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>3. Safety Gate Cleared</span>
            </span>
            <span className="text-blue-400 font-bold">{funnel.eligible} ({eligiblePct}%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${eligiblePct}%` }} />
          </div>
        </div>

        {/* Stage 4: Intervention Attempted */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-amber-300 flex items-center space-x-1.5 font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>4. Intervention (Retry / P2P)</span>
            </span>
            <span className="text-amber-300 font-bold">{funnel.intervention} ({interventionPct}%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${interventionPct}%` }} />
          </div>
        </div>

        {/* Stage 5: Recovered */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-emerald-400 flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>5. Revenue Recovered</span>
            </span>
            <span className="text-emerald-400 font-bold">{funnel.recovered} ({recoveredPct}%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-emerald-900/60">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${recoveredPct}%` }} />
          </div>
        </div>
      </div>

      {/* Side Terminal Off-ramp Badges */}
      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
          <span className="text-rose-400 flex items-center space-x-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Escalated to Ops</span>
          </span>
          <span className="font-bold text-slate-200">{funnel.escalated}</span>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center space-x-1">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            <span>Stopped (Max Bounds)</span>
          </span>
          <span className="font-bold text-slate-200">{funnel.stopped}</span>
        </div>
      </div>
    </div>
  );
};
