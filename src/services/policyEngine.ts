import type { Transaction } from '../types';
import type { PolicyResult, RecoveryCategory } from '../types/recovery';

/**
 * Classifies transaction failure reason into a deterministic RecoveryCategory
 */
export function classifyFailure(errorReason: string): RecoveryCategory {
  switch (errorReason) {
    case 'bank_technical_error':
    case 'gateway_technical_error':
    case 'payment_timed_out':
    case 'network_error':
      return 'retryable';

    case 'insufficient_funds':
      return 'insufficient_funds';

    case 'card_expired':
    case 'debit_instrument_blocked':
      return 'invalid_payment_method';

    case 'authentication_failed':
    case 'incorrect_cvv':
      return 'authentication_failure';

    case 'payment_risk_check_failed':
      return 'risk_failure';

    default:
      return 'unknown';
  }
}

/**
 * Deterministic Policy Engine
 * Answers: "If allowed, which recovery action is permitted?"
 */
export function evaluatePolicy(transaction: Transaction): PolicyResult {
  const category = classifyFailure(transaction.error_reason);

  // Maximum attempts precedence rule
  if (transaction.attempts >= transaction.max_attempts) {
    return {
      category,
      action: 'stopped',
      reason: `Maximum attempts reached (${transaction.attempts}/${transaction.max_attempts}). Policy engine enforces stopped state.`
    };
  }

  switch (category) {
    case 'retryable':
      return {
        category,
        action: 'retry_scheduled',
        reason: `Transient ${transaction.error_reason.replace(/_/g, ' ')} detected. Transaction is on attempt ${transaction.attempts} of ${transaction.max_attempts}; retry scheduled.`
      };

    case 'insufficient_funds':
      return {
        category,
        action: 'promise_to_pay',
        reason: 'Insufficient funds detected. Automated immediate retries prohibited; routing to Promise-to-Pay deferred flow.'
      };

    case 'invalid_payment_method':
      return {
        category,
        action: 'alternate_payment',
        reason: `Payment instrument failure (${transaction.error_reason.replace(/_/g, ' ')}). Direct retries prohibited; alternate payment method required.`
      };

    case 'authentication_failure':
      return {
        category,
        action: 'retry_scheduled',
        reason: `Customer authentication failed (${transaction.error_reason.replace(/_/g, ' ')}). Re-authentication attempt allowed (${transaction.attempts}/${transaction.max_attempts}).`
      };

    case 'risk_failure':
      return {
        category,
        action: 'escalated',
        reason: 'Payment risk check failed. Automated recovery halted; transaction escalated for manual ops inspection.'
      };

    case 'unknown':
    default:
      return {
        category: 'unknown',
        action: 'escalated',
        reason: `Unrecognized failure reason '${transaction.error_reason}'. Policy engine escalates unclassified failures to ops.`
      };
  }
}
