import { useState } from 'react';
import { useTransactions } from './hooks/useTransactions';
import { Header } from './components/Header';
import { StatusBanner } from './components/StatusBanner';
import { HeroMetricsBanner } from './components/HeroMetricsBanner';
import { RecoveryFunnel } from './components/RecoveryFunnel';
import { ActivityFeed } from './components/ActivityFeed';
import { RecoveryControlPanel } from './components/RecoveryControlPanel';
import { TransactionTable } from './components/TransactionTable';
import { SchemaOverview } from './components/SchemaOverview';
import { calculateRecoveryMetrics } from './services/metricsService';

export function App() {
  const { transactions, totalCount, loading, isLive, error, refetch } = useTransactions(100, 0);
  const [feedRefreshCounter, setFeedRefreshCounter] = useState(0);

  const metrics = calculateRecoveryMetrics(transactions);

  const handleBatchComplete = () => {
    refetch();
    setFeedRefreshCounter(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 selection:bg-orange-500/30 selection:text-orange-200">
      {/* Header Navigation */}
      <Header isLive={isLive} totalCount={totalCount} />

      {/* Main Operations Control Room Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* System Online Status Banner */}
        <StatusBanner isLive={isLive} totalCount={totalCount} />

        {/* Hero Money-First Financial Metrics Banner & Before/After Transformation */}
        <HeroMetricsBanner metrics={metrics} />

        {/* 2-Column Grid: Recovery Funnel & Live Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecoveryFunnel funnel={metrics.funnel} />
          <ActivityFeed refreshTrigger={feedRefreshCounter} />
        </div>

        {/* Recovery Operations Control Engine Panel */}
        <RecoveryControlPanel
          onBatchComplete={handleBatchComplete}
          pendingCount={metrics.pendingCount}
        />

        {/* Upgraded Transaction Recovery Operations Ledger */}
        <TransactionTable
          transactions={transactions}
          totalCount={totalCount}
          loading={loading}
          isLive={isLive}
          error={error}
          onRefresh={handleBatchComplete}
        />

        {/* PostgreSQL Schema Architecture Verification */}
        <SchemaOverview />
      </main>

      {/* Control Room Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-slate-400 font-bold">PAYRESCUE</span> — Payment Recovery Operations Control Room
          </div>
          <div>
            Groq GPT-OSS 120B AI Diagnosis • Deterministic Policy Engine • Append-Only PostgreSQL Audit
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
