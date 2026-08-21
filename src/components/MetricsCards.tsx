import React from 'react';
import type { RecoveryMetrics } from '../types/recovery';
import { formatPaiseToRupees } from '../utils/formatters';
import { TrendingUp, AlertTriangle, CheckCircle, Clock, ShieldAlert, Ban } from 'lucide-react';

interface MetricsCardsProps {
  metrics: RecoveryMetrics;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* Total At Risk */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Revenue At Risk</span>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <div className="text-base font-bold text-slate-100 font-mono">
          {formatPaiseToRupees(metrics.totalAtRiskPaise)}
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          {metrics.totalTransactions} transactions
        </div>
      </div>

      {/* Total Recovered */}
      <div className="bg-slate-900/80 border border-emerald-900/50 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Recovered Revenue</span>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="text-base font-bold text-emerald-400 font-mono">
          {formatPaiseToRupees(metrics.totalRecoveredPaise)}
        </div>
        <div className="text-[10px] text-emerald-500/80 font-mono mt-0.5">
          {metrics.recoveredCount} recovered
        </div>
      </div>

      {/* Recovery Rate */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Recovery Rate</span>
          <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
        </div>
        <div className="text-base font-bold text-orange-400 font-mono">
          {metrics.recoveryRate}%
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          paise ratio
        </div>
      </div>

      {/* Active P2P */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Promise-to-Pay</span>
          <Clock className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="text-base font-bold text-amber-300 font-mono">
          {metrics.activeP2PCount}
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          deferred window
        </div>
      </div>

      {/* Escalated */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Escalated</span>
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <div className="text-base font-bold text-rose-400 font-mono">
          {metrics.escalatedCount}
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          ops inspection
        </div>
      </div>

      {/* Stopped */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Stopped</span>
          <Ban className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="text-base font-bold text-slate-300 font-mono">
          {metrics.stoppedCount}
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          max bounds
        </div>
      </div>
    </div>
  );
};
