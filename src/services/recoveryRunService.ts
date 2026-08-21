import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { BatchRecoverySummary, RecoveryEngineResult } from '../types/recovery';
import type { Transaction } from '../types';
import { processSingleTransaction } from './recoveryEngine';
import { fetchTransactions } from './transactions';

/**
 * Checks if a transaction is eligible for batch recovery processing.
 * Eligible: status === 'pending' OR (status === 'retry_scheduled' AND next_retry_at <= now)
 */
export function isTransactionEligibleForBatch(t: Transaction, now = new Date()): boolean {
  if (t.status === 'pending') return true;
  if (t.status === 'retry_scheduled') {
    if (!t.next_retry_at) return true;
    return new Date(t.next_retry_at).getTime() <= now.getTime();
  }
  return false;
}

export async function runRecoveryBatch(batchSize = 25): Promise<BatchRecoverySummary> {
  const runId = crypto.randomUUID ? crypto.randomUUID() : `run_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const now = new Date();

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

  // 2. Fetch transactions eligible for recovery (pending OR retry_scheduled whose next_retry_at has arrived)
  const fetchResult = await fetchTransactions(100, 0);
  const eligibleTransactions = fetchResult.data
    .filter(t => isTransactionEligibleForBatch(t, now))
    .slice(0, batchSize);

  let totalAtRiskPaise = 0;
  let totalRecoveredPaise = 0;
  const results: RecoveryEngineResult[] = [];

  // 3. Process each transaction through the Recovery Engine (safety gate, AI, policy engine)
  for (const tx of eligibleTransactions) {
    totalAtRiskPaise += tx.amount_paise;
    const result = await processSingleTransaction(tx);
    results.push(result);

    if (result.newStatus === 'recovered' && !result.persistenceError) {
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
