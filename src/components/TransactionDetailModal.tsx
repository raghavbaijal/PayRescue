import React, { useEffect, useState } from 'react';
import type { Transaction, AuditLog } from '../types';
import { formatPaiseToRupees, formatDate, getStatusBadgeStyle, getMethodBadge } from '../utils/formatters';
import { fetchAuditLogsForTransaction } from '../services/auditService';
import { aiService } from '../services/ai/aiService';
import type { AIDiagnosisResult } from '../services/ai/aiTypes';
import { X, Bot, Shield, RefreshCw, MessageSquare, Terminal } from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose
}) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!transaction) return;

    let isMounted = true;
    setLoading(true);

    async function loadDetails() {
      const [logs, diagnosis] = await Promise.all([
        fetchAuditLogsForTransaction(transaction!.id),
        aiService.diagnoseTransaction(transaction!)
      ]);

      if (isMounted) {
        setAuditLogs(logs);
        setAiDiagnosis(diagnosis);
        setLoading(false);
      }
    }

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [transaction]);

  if (!transaction) return null;

  const badge = getStatusBadgeStyle(transaction.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-500">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  {transaction.razorpay_payment_id}
                </h3>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Ingested {formatDate(transaction.created_at)} • Attempt {transaction.attempts} of {transaction.max_attempts}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono">
            <div>
              <div className="text-slate-500 uppercase text-[10px]">Customer</div>
              <div className="font-semibold text-slate-200 mt-0.5">{transaction.customer_name}</div>
              <div className="text-[11px] text-slate-400">{transaction.customer_contact || '-'}</div>
            </div>

            <div>
              <div className="text-slate-500 uppercase text-[10px]">Amount</div>
              <div className="font-bold text-slate-100 mt-0.5">{formatPaiseToRupees(transaction.amount_paise)}</div>
              <div className="text-[10px] text-slate-500">{transaction.amount_paise.toLocaleString()} paise</div>
            </div>

            <div>
              <div className="text-slate-500 uppercase text-[10px]">Method</div>
              <div className="font-semibold text-slate-300 mt-0.5">{getMethodBadge(transaction.method)}</div>
            </div>

            <div>
              <div className="text-slate-500 uppercase text-[10px]">Failure Reason</div>
              <div className="font-semibold text-orange-400 mt-0.5">{transaction.error_reason}</div>
              <div className="text-[10px] text-slate-500 uppercase">{transaction.error_source} • {transaction.error_code}</div>
            </div>
          </div>

          {/* AI DIAGNOSIS SECTION */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
              <div className="flex items-center space-x-2">
                <Bot className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-bold text-slate-100 font-mono uppercase tracking-wider">
                  AI Diagnosis Engine
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/80 text-orange-400 border border-orange-800/60 font-semibold">
                Groq · GPT-OSS 120B
              </span>
            </div>

            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-500 text-xs font-mono">
                <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
                <span>Generating AI Root-Cause Diagnosis...</span>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-4 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Root Cause</div>
                    <div className="text-slate-200 font-bold mt-0.5">{aiDiagnosis.root_cause}</div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Category</div>
                    <div className="text-orange-400 font-bold uppercase mt-0.5">{aiDiagnosis.category}</div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Confidence Score</div>
                    <div className="text-emerald-400 font-bold mt-0.5 font-mono">
                      {(aiDiagnosis.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* Reasoning Narrative */}
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Diagnosis Reasoning Narrative</div>
                  <p className="text-slate-300 leading-relaxed font-sans text-xs">{aiDiagnosis.reasoning}</p>
                </div>

                {/* Draft Customer Recovery Message */}
                <div className="bg-slate-900/80 p-3 rounded-lg border border-orange-500/20">
                  <div className="flex items-center space-x-1.5 text-orange-400 text-[10px] uppercase font-bold mb-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Customer Recovery Message Draft</span>
                  </div>
                  <p className="text-slate-200 italic font-sans text-xs bg-slate-950 p-2.5 rounded border border-slate-800">
                    "{aiDiagnosis.message}"
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* AUDIT LOG TIMELINE */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-100 font-mono uppercase tracking-wider">
                  PostgreSQL Audit Log Trail (Append-Only)
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {auditLogs.length} events recorded
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs max-h-48 overflow-y-auto pr-1">
              {auditLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-4">No audit events recorded for this transaction yet.</div>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                      <div className="flex items-center space-x-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${log.actor === 'ai_agent' ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'bg-slate-800 text-slate-300'}`}>
                          {log.actor}
                        </span>
                        <span className="font-bold text-slate-100">{log.event_type}</span>
                      </div>
                      <span className="text-slate-500 text-[10px]">{formatDate(log.created_at)}</span>
                    </div>
                    <p className="text-slate-400 font-sans text-xs">{log.decision_reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
