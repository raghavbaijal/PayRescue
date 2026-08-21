import React from 'react';
import type { RecoveryMetrics } from '../types/recovery';
import { formatPaiseToRupees } from '../utils/formatters';
import { TrendingUp, CheckCircle, ArrowRight, Wallet, AlertTriangle } from 'lucide-react';

interface HeroMetricsBannerProps {
  metrics: RecoveryMetrics;
}

export const HeroMetricsBanner: React.FC<HeroMetricsBannerProps> = ({ metrics }) => {
  return (
    <div className="space-y-6 mb-8">
      {/* 4 Money-First Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Revenue At Risk */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
            <span>Revenue At Risk</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
            {formatPaiseToRupees(metrics.totalAtRiskPaise)}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-1 flex items-center justify-between">
            <span>{metrics.totalTransactions} Total Failures</span>
            <span className="text-amber-400/80 font-medium">{metrics.pendingCount} Pending</span>
          </div>
        </div>

        {/* Card 2: Recovered Revenue */}
        <div className="bg-slate-900/90 border border-emerald-900/60 p-5 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
            <span>Recovered Revenue</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
            {formatPaiseToRupees(metrics.totalRecoveredPaise)}
          </div>
          <div className="text-xs text-emerald-500/90 font-mono mt-1 flex items-center justify-between">
            <span>{metrics.recoveredCount} Transactions</span>
            <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded text-[10px]">
              +Captured
            </span>
          </div>
        </div>

        {/* Card 3: Recovery Rate % */}
        <div className="bg-slate-900/90 border border-orange-950/80 p-5 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
            <span>Recovery Rate</span>
            <TrendingUp className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-orange-400 font-mono tracking-tight">
            {metrics.recoveryRate}%
          </div>
          <div className="text-xs text-slate-400 font-mono mt-1">
            Conversion ratio across all risk cases
          </div>
        </div>

        {/* Card 4: Remaining At Risk */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
            <span>Remaining Risk</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-200 font-mono tracking-tight">
            {formatPaiseToRupees(metrics.remainingAtRiskPaise)}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-1 flex items-center justify-between">
            <span>{metrics.activeP2PCount} P2P</span>
            <span className="text-rose-400">{metrics.escalatedCount} Escalated</span>
          </div>
        </div>
      </div>

      {/* BEFORE / AFTER RECOVERY COMPARISON VISUAL */}
      <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex items-center space-x-2 mb-3">
          <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-widest">
            Revenue Impact Transformation
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          {/* Before */}
          <div className="text-center md:text-left flex-1">
            <div className="text-[11px] font-mono uppercase text-slate-400 mb-1">
              Before PayRescue
            </div>
            <div className="text-xl font-bold text-slate-300 font-mono line-through decoration-rose-500/60 decoration-2">
              {formatPaiseToRupees(metrics.totalAtRiskPaise)}
            </div>
            <div className="text-[10px] text-rose-400 font-mono mt-0.5">
              100% Unrecovered Revenue Leakage
            </div>
          </div>

          {/* Engine Processing Arrow */}
          <div className="flex flex-col items-center justify-center px-4 py-2 bg-slate-950 rounded-lg border border-slate-800 text-slate-400">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-orange-400 uppercase">
              <span>PayRescue Engine</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              AI + Policy + Safety + Simulator
            </div>
            <ArrowRight className="w-4 h-4 text-orange-500 mt-1 hidden md:block" />
          </div>

          {/* After */}
          <div className="text-center md:text-right flex-1">
            <div className="text-[11px] font-mono uppercase text-emerald-400 mb-1 font-semibold">
              After Recovery Operation
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">
              {formatPaiseToRupees(metrics.totalRecoveredPaise)}
            </div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 mt-1">
              <span>{metrics.recoveryRate}% Revenue Recovered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
