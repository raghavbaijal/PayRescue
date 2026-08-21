import type { Transaction } from '../../types';
import type { RecoveryContext } from './agentTypes';

/**
 * Deterministic, pure, side-effect-free builder for RecoveryContext.
 * Extracts payment failure metadata, attempt counters, and recovery status
 * without mutating the transaction object or interacting with the database.
 */
export function buildRecoveryContext(transaction: Transaction): RecoveryContext {
  if (!transaction) {
    throw new Error('[buildRecoveryContext]: Valid transaction object required.');
  }

  return {
    transaction,

    transactionHistory: {
      previousAttempts: transaction.attempts > 1 ? transaction.attempts - 1 : 0,
      previousStatus: transaction.attempts > 1 ? 'pending' : undefined,
      previousActions: transaction.attempts > 1 ? ['retry_attempted'] : []
    },

    recovery: {
      amountAtRiskPaise: transaction.amount_paise,
      currentStatus: transaction.status,
      attempts: transaction.attempts,
      maxAttempts: transaction.max_attempts
    },

    failure: {
      reason: transaction.error_reason,
      source: transaction.error_source,
      code: transaction.error_code
    }
  };
}
