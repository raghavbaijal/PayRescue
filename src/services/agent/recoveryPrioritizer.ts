import type { Transaction } from '../../types';
import type { RecoveryContext, RecoveryPriority, PriorityLevel, PriorityFactors } from './agentTypes';
import { buildRecoveryContext } from './recoveryContext';

/**
 * Deterministically calculates recovery priority score (0 - 100) and priority level for a transaction context.
 * Bounded, side-effect-free, and read-only.
 */
export function calculateRecoveryPriority(context: RecoveryContext): RecoveryPriority {
  const tx = context.transaction;

  // 1. Amount at Risk Score (0 - 25 points)
  // Normalizes exposure: ₹10,000 (1,000,000 paise) = 25 points maximum
  const amountRupees = tx.amount_paise / 100;
  const amountRisk = Math.min(25, Math.round((amountRupees / 10000) * 25));

  // 2. Failure Severity Score (0 - 25 points)
  let failureSeverity = 10;
  if (tx.error_source === 'risk' || tx.error_reason === 'payment_risk_check_failed') {
    failureSeverity = 25; // Risk check triggers require immediate triage
  } else if (tx.error_reason === 'unknown' || tx.error_reason.includes('unknown')) {
    failureSeverity = 20; // High uncertainty requires prompt ops review
  } else if (tx.error_reason === 'card_expired' || tx.error_reason === 'debit_instrument_blocked') {
    failureSeverity = 15;
  } else if (tx.error_reason === 'insufficient_funds') {
    failureSeverity = 15;
  } else if (tx.error_reason === 'payment_timed_out' || tx.error_reason === 'bank_technical_error') {
    failureSeverity = 12;
  }

  // 3. Attempt Pressure Score (0 - 25 points)
  // Higher attempt utilization increases pressure
  const attemptRatio = tx.max_attempts > 0 ? tx.attempts / tx.max_attempts : 0;
  const attemptPressure = Math.min(25, Math.round(attemptRatio * 25));

  // 4. Urgency Score (0 - 25 points)
  let urgency = 10;
  if (tx.next_retry_at) {
    const isDue = new Date(tx.next_retry_at).getTime() <= Date.now();
    urgency = isDue ? 25 : 15;
  } else {
    const ageMinutes = (Date.now() - new Date(tx.created_at).getTime()) / 60000;
    if (ageMinutes > 60) urgency = 25;
    else if (ageMinutes > 30) urgency = 20;
    else if (ageMinutes > 15) urgency = 15;
    else urgency = 10;
  }

  // 5. Recoverability Signal Score (0 - 25 points)
  let recoverability = 10;
  if (tx.error_reason === 'payment_timed_out' || tx.error_reason === 'bank_technical_error' || tx.error_reason === 'gateway_technical_error') {
    recoverability = 25; // Technical transient failure = high recoverability signal
  } else if (tx.error_reason === 'insufficient_funds') {
    recoverability = 15; // Recoverable via Promise-to-Pay window
  } else if (tx.error_reason === 'card_expired') {
    recoverability = 10; // Alternate instrument required
  } else if (tx.error_source === 'risk') {
    recoverability = 0;  // Automated recovery prohibited
  }

  const rawScore = amountRisk + failureSeverity + attemptPressure + urgency + recoverability;
  const score = Math.min(100, Math.max(0, rawScore));

  let level: PriorityLevel = 'low';
  if (score >= 75) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 25) level = 'medium';

  const factors: PriorityFactors = {
    amountRisk,
    failureSeverity,
    attemptPressure,
    urgency,
    recoverability
  };

  const reasoning = `Priority Score ${score}/100 (${level.toUpperCase()}). ₹${amountRupees.toLocaleString('en-IN')} exposure at risk, attempt pressure ${tx.attempts}/${tx.max_attempts}, failure severity factor ${failureSeverity}/25, and recoverability signal ${recoverability}/25.`;

  return {
    score,
    level,
    factors,
    reasoning
  };
}

export interface PrioritizedCase {
  transaction: Transaction;
  context: RecoveryContext;
  priority: RecoveryPriority;
}

/**
 * Deterministically prioritizes an array of transactions by priority score descending.
 * Uses deterministic tie-breakers: score desc ➔ amount desc ➔ created_at asc ➔ ID asc.
 */
export function prioritizeRecoveryCases(transactions: Transaction[]): PrioritizedCase[] {
  if (!transactions) return [];

  const cases: PrioritizedCase[] = transactions.map(tx => {
    const context = buildRecoveryContext(tx);
    const priority = calculateRecoveryPriority(context);
    return { transaction: tx, context, priority };
  });

  return cases.sort((a, b) => {
    // Primary: Priority score descending
    if (b.priority.score !== a.priority.score) {
      return b.priority.score - a.priority.score;
    }
    // Tie-breaker 1: Transaction amount descending
    if (b.transaction.amount_paise !== a.transaction.amount_paise) {
      return b.transaction.amount_paise - a.transaction.amount_paise;
    }
    // Tie-breaker 2: Created at timestamp ascending (older cases first)
    const timeA = new Date(a.transaction.created_at).getTime();
    const timeB = new Date(b.transaction.created_at).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    // Tie-breaker 3: Deterministic string comparison on transaction ID
    return a.transaction.id.localeCompare(b.transaction.id);
  });
}
