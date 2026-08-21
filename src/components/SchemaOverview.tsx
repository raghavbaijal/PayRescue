import React from 'react';
import { Database } from 'lucide-react';

export const SchemaOverview: React.FC = () => {
  return (
    <div className="mt-8 bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl">
      <div className="flex items-center space-x-2 mb-4">
        <Database className="w-5 h-5 text-orange-500" />
        <h3 className="text-sm font-bold text-slate-100 font-mono tracking-wider uppercase">
          Phase 1 PostgreSQL Architecture & Schema Verification
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Table 1 */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-orange-400">transactions</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">Primary Ledger</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Core transaction table holding Razorpay failure payloads, amounts in paise, attempt counters, and recovery status.
          </p>
          <div className="text-[11px] font-mono text-slate-500 space-y-1 border-t border-slate-900 pt-2">
            <div>• <span className="text-slate-300">amount_paise</span> (bigint)</div>
            <div>• <span className="text-slate-300">status</span> (7 bounded states)</div>
            <div>• Index: <span className="text-slate-400">idx_transactions_status</span></div>
          </div>
        </div>

        {/* Table 2 */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-orange-400">audit_log</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">Append-Only</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Immutable audit record tracking actors (AI agent, system rules, humans), reasoning, and recovery decisions.
          </p>
          <div className="text-[11px] font-mono text-slate-500 space-y-1 border-t border-slate-900 pt-2">
            <div>• <span className="text-slate-300">actor</span> (ai / rule / human)</div>
            <div>• RLS Policy: <span className="text-emerald-400">No UPDATE / DELETE</span></div>
            <div>• Index: <span className="text-slate-400">idx_audit_transaction</span></div>
          </div>
        </div>

        {/* Table 3 */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-orange-400">promises_to_pay</span>
            <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-mono">P2P State</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Tracks customer payment commitment dates, reminder timestamps, and commitment statuses (active/kept/broken).
          </p>
          <div className="text-[11px] font-mono text-slate-500 space-y-1 border-t border-slate-900 pt-2">
            <div>• <span className="text-slate-300">promised_date</span> (date)</div>
            <div>• <span className="text-slate-300">status</span> (active/kept/broken)</div>
            <div>• Index: <span className="text-slate-400">idx_p2p_status</span></div>
          </div>
        </div>

        {/* Table 4 */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-orange-400">recovery_runs</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">Metrics Log</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Batch recovery run executions, recording processing counts and total at-risk vs recovered revenue in paise.
          </p>
          <div className="text-[11px] font-mono text-slate-500 space-y-1 border-t border-slate-900 pt-2">
            <div>• <span className="text-slate-300">total_at_risk_paise</span> (bigint)</div>
            <div>• <span className="text-slate-300">total_recovered_paise</span> (bigint)</div>
            <div>• Timestamps: <span className="text-slate-400">started/completed</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
