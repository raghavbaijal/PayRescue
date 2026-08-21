import React, { useState } from 'react';
import type { Transaction } from '../types';
import { formatPaiseToRupees, getStatusBadgeStyle, getMethodBadge } from '../utils/formatters';
import { TransactionDetailModal } from './TransactionDetailModal';
import { RefreshCw, Search, Filter, AlertTriangle, ExternalLink } from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  totalCount: number;
  loading: boolean;
  isLive: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  totalCount,
  loading,
  isLive,
  error,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch =
      t.razorpay_payment_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.error_reason.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Control Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide uppercase">
                Failed Transaction Ledger
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {filteredTransactions.length} of {totalCount}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any transaction row to view <span className="text-orange-400 font-semibold font-mono">AI Diagnosis & Audit Trail</span>
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search Payment ID, Customer..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/50"
              />
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500/50 appearance-none pr-8 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="retry_scheduled">Retry Scheduled</option>
                <option value="promise_to_pay">Promise to Pay</option>
                <option value="processing">Processing</option>
                <option value="recovered">Recovered</option>
                <option value="escalated">Escalated</option>
                <option value="stopped">Stopped</option>
              </select>
              <Filter className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh database records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Notice: {error}. Rendering seed fallback dataset.</span>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Failure Reason</th>
                <th className="py-3 px-4 text-center">Attempts</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
                      <span>Querying Supabase database...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    No payment failure transactions match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const badge = getStatusBadgeStyle(tx.status);
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      {/* Payment ID */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-200 group-hover:text-orange-400 transition-colors">
                        {tx.razorpay_payment_id}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{tx.customer_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{tx.customer_contact || '-'}</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-100">
                          {formatPaiseToRupees(tx.amount_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {tx.amount_paise.toLocaleString()} paise
                        </div>
                      </td>

                      {/* Method */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700/60">
                          {getMethodBadge(tx.method)}
                        </span>
                      </td>

                      {/* Error Code & Reason */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-200 font-mono text-[11px] font-semibold">
                          {tx.error_reason}
                        </div>
                        <div className="flex items-center space-x-1 text-[10px] text-slate-400">
                          <span className="uppercase text-slate-500">{tx.error_source}</span>
                          <span>•</span>
                          <span className="font-mono">{tx.error_code}</span>
                        </div>
                      </td>

                      {/* Attempts */}
                      <td className="py-3 px-4 text-center font-mono text-xs">
                        <span className="text-slate-200 font-semibold">{tx.attempts}</span>
                        <span className="text-slate-500">/{tx.max_attempts}</span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Inspect Action Link */}
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center space-x-1 text-[11px] font-mono text-slate-400 group-hover:text-orange-400 transition-colors">
                          <span>AI Diagnosis</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div>
            Data source: {isLive ? 'Supabase PostgreSQL' : 'Local Seed Data'}
          </div>
          <div>
            Showing top {filteredTransactions.length} records
          </div>
        </div>
      </div>

      {/* Transaction AI Detail Modal */}
      <TransactionDetailModal transaction={selectedTx} onClose={() => setSelectedTx(null)} />
    </>
  );
};
