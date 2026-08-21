import { useTransactions } from './hooks/useTransactions';
import { Header } from './components/Header';
import { StatusBanner } from './components/StatusBanner';
import { TransactionTable } from './components/TransactionTable';
import { SchemaOverview } from './components/SchemaOverview';

export function App() {
  const { transactions, totalCount, loading, isLive, error, refetch } = useTransactions(50, 0);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 selection:bg-orange-500/30 selection:text-orange-200">
      {/* Header */}
      <Header isLive={isLive} totalCount={totalCount} />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Banner */}
        <StatusBanner isLive={isLive} totalCount={totalCount} />

        {/* Transaction Table */}
        <TransactionTable
          transactions={transactions}
          totalCount={totalCount}
          loading={loading}
          isLive={isLive}
          error={error}
          onRefresh={refetch}
        />

        {/* Architecture & Schema Overview */}
        <SchemaOverview />
      </main>

      {/* Control Room Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-slate-400 font-bold">PAYRESCUE</span> — AI-Powered Checkout Revenue Recovery
          </div>
          <div>
            Phase 1 Foundation • PostgreSQL Schema v1.0 • Supabase Integrated
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
