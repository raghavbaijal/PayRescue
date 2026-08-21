import type { Transaction } from '../types';
import type { RecoveryMetrics } from '../types/recovery';
import { evaluateSafety } from './safetyGate';

export function calculateRecoveryMetrics(transactions: Transaction[]): RecoveryMetrics {
  if (!transactions || transactions.length === 0) {
    return {
      totalTransactions: 0,
      totalFailedExposurePaise: 0,
      currentlyAtRiskPaise: 0,
      totalAtRiskPaise: 0,
      totalRecoveredPaise: 0,
      remainingAtRiskPaise: 0,
      recoveryRate: 0,
      recoveredCount: 0,
      escalatedCount: 0,
      stoppedCount: 0,
      activeP2PCount: 0,
      pendingCount: 0,
      funnel: {
        failed: 0,
        diagnosed: 0,
        eligible: 0,
        intervention: 0,
        recovered: 0,
        escalated: 0,
        stopped: 0
      }
    };
  }

  let totalFailedExposurePaise = 0;
  let currentlyAtRiskPaise = 0;
  let totalRecoveredPaise = 0;

  let recoveredCount = 0;
  let escalatedCount = 0;
  let stoppedCount = 0;
  let activeP2PCount = 0;
  let pendingCount = 0;

  let diagnosedCount = 0;
  let eligibleCount = 0;
  let interventionCount = 0;

  for (const t of transactions) {
    totalFailedExposurePaise += t.amount_paise;

    if (t.error_reason) {
      diagnosedCount++;
    }

    // ISSUE 3: Single Source of Truth for Safety Eligibility using evaluateSafety()
    const tempTx: Transaction = { ...t, status: 'pending' };
    const safetyResult = evaluateSafety(tempTx);
    if (safetyResult.decision === 'eligible') {
      eligibleCount++;
    }

    switch (t.status) {
      case 'recovered':
        recoveredCount++;
        interventionCount++;
        totalRecoveredPaise += t.amount_paise;
        break;

      case 'retry_scheduled':
        interventionCount++;
        currentlyAtRiskPaise += t.amount_paise;
        break;

      case 'promise_to_pay':
        activeP2PCount++;
        interventionCount++;
        currentlyAtRiskPaise += t.amount_paise;
        break;

      case 'pending':
        pendingCount++;
        currentlyAtRiskPaise += t.amount_paise;
        break;

      case 'escalated':
        escalatedCount++;
        break;

      case 'stopped':
        stoppedCount++;
        break;

      default:
        break;
    }
  }

  const remainingAtRiskPaise = currentlyAtRiskPaise;
  const recoveryRate =
    totalFailedExposurePaise > 0
      ? Number(((totalRecoveredPaise / totalFailedExposurePaise) * 100).toFixed(1))
      : 0;

  return {
    totalTransactions: transactions.length,
    totalFailedExposurePaise,
    currentlyAtRiskPaise,
    totalAtRiskPaise: totalFailedExposurePaise, // Backward compatibility alias
    totalRecoveredPaise,
    remainingAtRiskPaise,
    recoveryRate,
    recoveredCount,
    escalatedCount,
    stoppedCount,
    activeP2PCount,
    pendingCount,
    funnel: {
      failed: transactions.length,
      diagnosed: diagnosedCount,
      eligible: eligibleCount,
      intervention: interventionCount,
      recovered: recoveredCount,
      escalated: escalatedCount,
      stopped: stoppedCount
    }
  };
}
