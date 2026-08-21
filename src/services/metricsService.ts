import type { Transaction } from '../types';
import type { RecoveryMetrics } from '../types/recovery';

export function calculateRecoveryMetrics(transactions: Transaction[]): RecoveryMetrics {
  if (!transactions || transactions.length === 0) {
    return {
      totalTransactions: 0,
      totalAtRiskPaise: 0,
      totalRecoveredPaise: 0,
      recoveryRate: 0,
      recoveredCount: 0,
      escalatedCount: 0,
      stoppedCount: 0,
      activeP2PCount: 0,
      pendingCount: 0
    };
  }

  let totalAtRiskPaise = 0;
  let totalRecoveredPaise = 0;

  let recoveredCount = 0;
  let escalatedCount = 0;
  let stoppedCount = 0;
  let activeP2PCount = 0;
  let pendingCount = 0;

  for (const t of transactions) {
    totalAtRiskPaise += t.amount_paise;

    switch (t.status) {
      case 'recovered':
        recoveredCount++;
        totalRecoveredPaise += t.amount_paise;
        break;
      case 'escalated':
        escalatedCount++;
        break;
      case 'stopped':
        stoppedCount++;
        break;
      case 'promise_to_pay':
        activeP2PCount++;
        break;
      case 'pending':
        pendingCount++;
        break;
      default:
        break;
    }
  }

  const recoveryRate =
    totalAtRiskPaise > 0
      ? Number(((totalRecoveredPaise / totalAtRiskPaise) * 100).toFixed(2))
      : 0;

  return {
    totalTransactions: transactions.length,
    totalAtRiskPaise,
    totalRecoveredPaise,
    recoveryRate,
    recoveredCount,
    escalatedCount,
    stoppedCount,
    activeP2PCount,
    pendingCount
  };
}
