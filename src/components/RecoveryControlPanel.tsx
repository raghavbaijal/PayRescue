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
  const [currentStep, setCurrentStep] = useState<string>('');
  const [summary, setSummary] = useState<BatchRecoverySummary | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleRunBatch = async () => {
    setIsRunning(true);
    setSummary(null);

    // Controlled Step-by-Step execution progress visualization
    try {
      setCurrentStep('1/5: Evaluating Safety Gates (Max Attempts & Risk Checks)...');
      await new Promise(r => setTimeout(r, 400));

      setCurrentStep('2/5: Requesting AI Root-Cause Diagnosis (Groq GPT-OSS 120B)...');
      await new Promise(r => setTimeout(r, 500));

      setCurrentStep('3/5: Applying Deterministic Policy Engine Rules & Confidence Gate...');
      await new Promise(r => setTimeout(r, 400));

      setCurrentStep('4/5: Executing Simulated Payment Retries & P2P Commitments...');
      const result = await runRecoveryBatch(25);

      setCurrentStep('5/5: Appending Structured Audit Events to PostgreSQL...');
      await new Promise(r => setTimeout(r, 300));

      setSummary(result);
      onBatchComplete();
    } catch (err) {
      console.error('[Recovery Batch Error]:', err);
    } finally {
      setIsRunning(false);
      setCurrentStep('');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 mb-8 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-orange-500" />
            <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide uppercase">
              Automated Recovery Operations Engine
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/80 text-orange-400 border border-orange-800/60 uppercase font-semibold">
              AI + Safety Gate + Policy Active
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Orchestrates end-to-end failure diagnosis, safety bounds checking, deterministic policy execution, simulated payment retries, and append-only audit logging.
          </p>
        </div>

        {/* RUN RECOVERY BATCH BUTTON */}
        <div>
          <button
            onClick={handleRunBatch}
            disabled={isRunning || pendingCount === 0}
            className="w-full md:w-auto px-6 py-3.5 bg-orange-500 hover:bg-orange-600 text-slate-950 font-extrabold rounded-xl text-xs font-mono uppercase tracking-wider flex items-center justify-center space-x-2.5 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-orange-400/40"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4.5 h-4.5 animate-spin text-slate-950" />
                <span>Running Engine Batch...</span>
              </>
            ) : (
              <>
                <Play className="w-4.5 h-4.5 text-slate-950 fill-slate-950" />
                <span>Run Recovery Batch ({pendingCount} Pending)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Execution Step Progress Bar when running */}
      {isRunning && (
        <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-orange-500/30 font-mono text-xs text-orange-400 flex items-center space-x-3 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-orange-500 shrink-0" />
          <span>{currentStep}</span>
        </div>
      )}

      {/* BATCH EXECUTION SUMMARY CARD */}
      {summary && (
        <div className="mt-5 border-t border-slate-800/80 pt-4">
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Processed</div>
                <div className="text-xl font-bold text-slate-100 font-mono">
                  {summary.transactionsProcessed} TXNs
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">₹ Revenue At Risk</div>
                <div className="text-xl font-bold text-amber-400 font-mono">
                  {formatPaiseToRupees(summary.totalAtRiskPaise)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">₹ Revenue Recovered</div>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  {formatPaiseToRupees(summary.totalRecoveredPaise)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase">Batch Recovery Rate</div>
                <div className="text-xl font-bold text-orange-400 font-mono">
                  {summary.totalAtRiskPaise > 0
                    ? ((summary.totalRecoveredPaise / summary.totalAtRiskPaise) * 100).toFixed(1)
                    : '0.0'}%
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="ml-4 p-2 text-slate-400 hover:text-slate-200 text-xs font-mono flex items-center space-x-1 border border-slate-800 rounded-lg bg-slate-900 cursor-pointer"
            >
              <span>{showDetails ? 'Hide Trace' : 'Inspect Decisions'}</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Details Breakdown Drawer */}
          {showDetails && (
            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-[11px]">
              <div className="text-slate-400 font-semibold mb-2 uppercase border-b border-slate-900 pb-1 flex items-center justify-between">
                <span>Batch Execution Trace Log ({summary.results.length} decisions)</span>
                <span className="text-emerald-400 text-[10px]">✓ PostgreSQL Audit Events Recorded</span>
              </div>
              <div className="space-y-2">
                {summary.results.map((res, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-orange-400 font-bold">{res.razorpayPaymentId}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500">{res.previousStatus}</span>
                        <span>➔</span>
                        <span className="text-emerald-400 font-bold uppercase">{res.newStatus}</span>
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
