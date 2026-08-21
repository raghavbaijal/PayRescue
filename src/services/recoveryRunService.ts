import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { BatchRecoverySummary, RecoveryEngineResult } from '../types/recovery';
import { processSingleTransaction } from './recoveryEngine';
import { fetchTransactions } from './transactions';

export async function runRecoveryBatch(batchSize = 25): Promise<BatchRecoverySummary> {
  const runId = crypto.randomUUID ? crypto.randomUUID() : `run_${Date.now()}`;
  const startedAt = new Date().toISOString();

  // 1. Log recovery run start in recovery_runs table
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('recovery_runs').insert([
        {
          id: runId,
          started_at: startedAt,
          transactions_processed: 0,
          total_at_risk_paise: 0,
          total_recovered_paise: 0
        }
      ]);
    } catch (err) {
      console.error('[Recovery Run Start Error]:', err);
    }
  }

  // 2. Fetch pending transactions eligible for recovery
  const fetchResult = await fetchTransactions(100, 0);
  const eligibleTransactions = fetchResult.data.filter(t => t.status === 'pending').slice(0, batchSize);

  let totalAtRiskPaise = 0;
  let totalRecoveredPaise = 0;
  const results: RecoveryEngineResult[] = [];

  // 3. Process each transaction through the Recovery Engine
  for (const tx of eligibleTransactions) {
    totalAtRiskPaise += tx.amount_paise;
    const result = await processSingleTransaction(tx);
    results.push(result);

    if (result.newStatus === 'recovered') {
      totalRecoveredPaise += tx.amount_paise;
    }
  }

  const completedAt = new Date().toISOString();

  // 4. Update recovery_runs record on completion
  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('recovery_runs')
        .update({
          completed_at: completedAt,
          total_at_risk_paise: totalAtRiskPaise,
          total_recovered_paise: totalRecoveredPaise,
          transactions_processed: results.length
        })
        .eq('id', runId);
    } catch (err) {
      console.error('[Recovery Run Completion Error]:', err);
    }
  }

  return {
    runId,
    startedAt,
    completedAt,
    transactionsProcessed: results.length,
    totalAtRiskPaise,
    totalRecoveredPaise,
    results
  };
}
