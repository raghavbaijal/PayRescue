import React, { useState } from 'react';
import type { BatchRecoverySummary } from '../types/recovery';
import { runRecoveryBatch } from '../services/recoveryRunService';
import { formatPaiseToRupees } from '../utils/formatters';
import { Play, RefreshCw, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface RecoveryControlPanelProps {
  onBatchComplete: () => void;
  pendingCount: number;
}

export const RecoveryControlPanel: React.FC<RecoveryControlPanelProps> = ({
  onBatchComplete,
  pendingCount
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<BatchRecoverySummary | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleRunBatch = async () => {
    setIsRunning(true);
    try {
      const result = await runRecoveryBatch(25);
      setSummary(result);
      onBatchComplete();
    } catch (err) {
      console.error('[Recovery Batch Error]:', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 mb-8 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <h2 className="text-sm font-bold text-slate-100 font-mono tracking-wide uppercase">
              Phase 2 Deterministic Recovery Engine
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/80 text-orange-400 border border-orange-800/60 uppercase">
              Active Rules Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Executes safety gate checks and policy decision rules across pending payment failure records. Updates database states, creates Promise-to-Pay commitments, and writes append-only audit events.
          </p>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={handleRunBatch}
            disabled={isRunning || pendingCount === 0}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold rounded-lg text-xs font-mono uppercase tracking-wider flex items-center space-x-2 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Running Engine Batch...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-slate-950 fill-slate-950" />
                <span>Run Recovery Batch ({pendingCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Batch Summary Execution Output Card */}
      {summary && (
        <div className="mt-5 border-t border-slate-800/80 pt-4">
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Processed</div>
                <div className="text-lg font-bold text-slate-100 font-mono">
                  {summary.transactionsProcessed}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">₹ At Risk</div>
                <div className="text-lg font-bold text-amber-400 font-mono">
                  {formatPaiseToRupees(summary.totalAtRiskPaise)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">₹ Recovered</div>
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  {formatPaiseToRupees(summary.totalRecoveredPaise)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Recovery Rate</div>
                <div className="text-lg font-bold text-orange-400 font-mono">
                  {summary.totalAtRiskPaise > 0
                    ? ((summary.totalRecoveredPaise / summary.totalAtRiskPaise) * 100).toFixed(1)
                    : '0.0'}%
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="ml-4 p-2 text-slate-400 hover:text-slate-200 text-xs font-mono flex items-center space-x-1 border border-slate-800 rounded bg-slate-900"
            >
              <span>{showDetails ? 'Hide Log' : 'View Decisions'}</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Details Breakdown Drawer */}
          {showDetails && (
            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-[11px]">
              <div className="text-slate-400 font-semibold mb-2 uppercase border-b border-slate-900 pb-1">
                Batch Execution Trace Log ({summary.results.length} decisions):
              </div>
              <div className="space-y-2">
                {summary.results.map((res, idx) => (
                  <div key={idx} className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-orange-400 font-bold">{res.razorpayPaymentId}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500">{res.previousStatus}</span>
                        <span>➔</span>
                        <span className="text-emerald-400 font-bold">{res.newStatus}</span>
                      </div>
                    </div>
                    <div className="text-slate-400 mt-1 text-[10px]">{res.decisionReason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
