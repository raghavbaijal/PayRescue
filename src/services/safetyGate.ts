import type { Transaction } from '../types';
import type { SafetyResult } from '../types/recovery';

/**
 * Pure function evaluating safety rules prior to policy engine execution.
 * Answers: "Is automated recovery allowed?"
 */
export function evaluateSafety(transaction: Transaction): SafetyResult {
  if (!transaction) {
    return {
      decision: 'blocked',
      reason: 'Invalid or null transaction object provided.',
      actionIfBlocked: 'stopped'
    };
  }

  // Rule 4 — Valid transaction state check (Only 'pending' is eligible)
  if (transaction.status !== 'pending') {
    if (transaction.status === 'recovered') {
      return {
        decision: 'blocked',
        reason: 'Transaction is already recovered. Re-processing blocked to prevent duplicate recovery actions.',
        actionIfBlocked: 'stopped'
      };
    }
    if (transaction.status === 'escalated') {
      return {
        decision: 'escalated',
        reason: 'Transaction is already escalated. Re-processing blocked.',
        actionIfBlocked: 'escalated'
      };
    }
    if (transaction.status === 'stopped') {
      return {
        decision: 'blocked',
        reason: 'Transaction is in stopped state. Re-processing blocked.',
        actionIfBlocked: 'stopped'
      };
    }
    return {
      decision: 'blocked',
      reason: `Transaction is currently in active state '${transaction.status}' and cannot be processed again.`,
      actionIfBlocked: 'stopped'
    };
  }

  // Rule 1 — Maximum attempts check
  if (transaction.attempts >= transaction.max_attempts) {
    return {
      decision: 'blocked',
      reason: `Maximum recovery attempt threshold reached (${transaction.attempts}/${transaction.max_attempts}).`,
      actionIfBlocked: 'stopped'
    };
  }

  // Rule 2 — Risk failure check
  if (
    transaction.error_source === 'risk' ||
    transaction.error_reason === 'payment_risk_check_failed' ||
    transaction.error_code === 'RISK_CHECK_FAILED'
  ) {
    return {
      decision: 'escalated',
      reason: 'Risk check failure detected. Automated retry prohibited; transaction must be escalated to risk ops.',
      actionIfBlocked: 'escalated'
    };
  }

  // Rule 3 — Invalid payment method check
  if (
    transaction.error_reason === 'card_expired' ||
    transaction.error_reason === 'debit_instrument_blocked'
  ) {
    return {
      decision: 'blocked',
      reason: 'Payment instrument is invalid or blocked. Direct automated retries prohibited.',
      actionIfBlocked: 'alternate_payment'
    };
  }

  // Cleared all safety checks
  return {
    decision: 'eligible',
    reason: 'Transaction cleared all safety gates and is eligible for policy decision.'
  };
}
