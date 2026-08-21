import type { Transaction } from '../types';
import type { RecoveryMetrics } from '../types/recovery';

export function calculateRecoveryMetrics(transactions: Transaction[]): RecoveryMetrics {
  if (!transactions || transactions.length === 0) {
    return {
      totalTransactions: 0,
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

  let totalAtRiskPaise = 0;
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
    totalAtRiskPaise += t.amount_paise;

    if (t.error_reason) {
      diagnosedCount++;
    }

    // Check if safety gate would deem eligible (not initial risk / hard failure)
    if (t.error_source !== 'risk' && t.error_reason !== 'payment_risk_check_failed' && t.error_reason !== 'card_expired') {
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
        break;

      case 'promise_to_pay':
        activeP2PCount++;
        interventionCount++;
        break;

      case 'escalated':
        escalatedCount++;
        break;

      case 'stopped':
        stoppedCount++;
        break;

      case 'pending':
        pendingCount++;
        break;

      default:
        break;
    }
  }

  const remainingAtRiskPaise = Math.max(0, totalAtRiskPaise - totalRecoveredPaise);
  const recoveryRate =
    totalAtRiskPaise > 0
      ? Number(((totalRecoveredPaise / totalAtRiskPaise) * 100).toFixed(1))
      : 0;

  return {
    totalTransactions: transactions.length,
    totalAtRiskPaise,
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
