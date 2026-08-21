import type { Transaction, TransactionStatus } from '../../types';
import type { RecoveryStrategy, ActionExecutionResult } from './agentTypes';
import { simulatePaymentExecution } from '../paymentSimulator';
import { updateTransactionInDb } from '../recoveryEngine';
import { createPromiseToPay } from '../p2pService';

/**
 * Action Executor (Phase 5.3 Controlled Agent Execution).
 * 
 * Executes an authorized recovery strategy against current transaction state.
 * Reuses existing payment simulation, retry scheduling, Promise-to-Pay, and
 * PostgreSQL database persistence commitment verification logic.
 */
export async function executeRecoveryAction(
  transaction: Transaction,
  strategy: RecoveryStrategy
): Promise<ActionExecutionResult> {
  const executedAt = new Date().toISOString();

  switch (strategy) {
    case 'retry_now': {
      // Execute payment simulation using existing simulator
      const simulation = simulatePaymentExecution(transaction, 'retry_scheduled');
      const nextAttempt = transaction.attempts + 1;

      if (simulation.outcome === 'recovered') {
        const targetStatus: TransactionStatus = 'recovered';
        const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus, nextAttempt, null);

        if (!dbSuccess) {
          return {
            action: strategy,
            status: 'failed',
            outcome: 'persistence_error',
            attempts: transaction.attempts,
            reason: `Database persistence failed while committing state transition to 'recovered'. Status remains '${transaction.status}'.`,
            executedAt,
            persistenceError: true
          };
        }

        return {
          action: strategy,
          status: 'executed',
          outcome: 'recovered',
          recoveredAmountPaise: transaction.amount_paise,
          attempts: nextAttempt,
          reason: `Simulated payment retry succeeded. ₹${(transaction.amount_paise / 100).toLocaleString('en-IN')} recovered.`,
          executedAt
        };
      } else {
        // Retry failed
        if (nextAttempt >= transaction.max_attempts) {
          const targetStatus: TransactionStatus = 'stopped';
          const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus, nextAttempt, null);

          if (!dbSuccess) {
            return {
              action: strategy,
              status: 'failed',
              outcome: 'persistence_error',
              attempts: transaction.attempts,
              reason: `Database persistence failed while committing state transition to 'stopped'.`,
              executedAt,
              persistenceError: true
            };
          }

          return {
            action: strategy,
            status: 'executed',
            outcome: 'stopped',
            attempts: nextAttempt,
            reason: `Simulated payment retry failed on attempt ${nextAttempt}/${transaction.max_attempts}. Attempt threshold exhausted; transaction stopped.`,
            executedAt
          };
        } else {
          // Schedule for next window (+15 mins)
          const targetStatus: TransactionStatus = 'retry_scheduled';
          const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus, nextAttempt, nextRetryAt);

          if (!dbSuccess) {
            return {
              action: strategy,
              status: 'failed',
              outcome: 'persistence_error',
              attempts: transaction.attempts,
              reason: `Database persistence failed while scheduling retry.`,
              executedAt,
              persistenceError: true
            };
          }

          return {
            action: strategy,
            status: 'executed',
            outcome: 'retry_scheduled',
            attempts: nextAttempt,
            nextRetryAt,
            reason: `Simulated payment retry failed on attempt ${nextAttempt}/${transaction.max_attempts}. Scheduled next retry for ${new Date(nextRetryAt).toLocaleTimeString()}.`,
            executedAt
          };
        }
      }
    }

    case 'retry_later': {
      const nextAttempt = transaction.attempts + 1;
      const targetStatus: TransactionStatus = 'retry_scheduled';
      const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus, nextAttempt, nextRetryAt);

      if (!dbSuccess) {
        return {
          action: strategy,
          status: 'failed',
          outcome: 'persistence_error',
          attempts: transaction.attempts,
          reason: `Database persistence failed while scheduling retry_later.`,
          executedAt,
          persistenceError: true
        };
      }

      return {
        action: strategy,
        status: 'executed',
        outcome: 'retry_scheduled',
        attempts: nextAttempt,
        nextRetryAt,
        reason: `Retry scheduled for next execution window (${new Date(nextRetryAt).toLocaleTimeString()}). Attempt count incremented to ${nextAttempt}/${transaction.max_attempts}.`,
        executedAt
      };
    }

    case 'promise_to_pay': {
      const targetStatus: TransactionStatus = 'promise_to_pay';
      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus);

      if (!dbSuccess) {
        return {
          action: strategy,
          status: 'failed',
          outcome: 'persistence_error',
          attempts: transaction.attempts,
          reason: `Database persistence failed while setting status to promise_to_pay.`,
          executedAt,
          persistenceError: true
        };
      }

      await createPromiseToPay(transaction);

      return {
        action: strategy,
        status: 'executed',
        outcome: 'promise_created',
        attempts: transaction.attempts,
        reason: `Promise-to-Pay deferred payment window created. Customer committed to complete payment.`,
        executedAt
      };
    }

    case 'alternate_payment': {
      const targetStatus: TransactionStatus = 'stopped';
      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus);

      if (!dbSuccess) {
        return {
          action: strategy,
          status: 'failed',
          outcome: 'persistence_error',
          attempts: transaction.attempts,
          reason: `Database persistence failed while updating status for alternate_payment.`,
          executedAt,
          persistenceError: true
        };
      }

      return {
        action: strategy,
        status: 'executed',
        outcome: 'alternate_payment_requested',
        attempts: transaction.attempts,
        reason: `Payment instrument invalid or expired. Automated retries stopped; alternate payment method requested.`,
        executedAt
      };
    }

    case 'escalate': {
      const targetStatus: TransactionStatus = 'escalated';
      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus);

      if (!dbSuccess) {
        return {
          action: strategy,
          status: 'failed',
          outcome: 'persistence_error',
          attempts: transaction.attempts,
          reason: `Database persistence failed while escalating transaction.`,
          executedAt,
          persistenceError: true
        };
      }

      return {
        action: strategy,
        status: 'executed',
        outcome: 'escalated',
        attempts: transaction.attempts,
        reason: `Transaction escalated to operations for manual review.`,
        executedAt
      };
    }

    case 'stop':
    default: {
      const targetStatus: TransactionStatus = 'stopped';
      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus);

      if (!dbSuccess) {
        return {
          action: strategy,
          status: 'failed',
          outcome: 'persistence_error',
          attempts: transaction.attempts,
          reason: `Database persistence failed while stopping transaction.`,
          executedAt,
          persistenceError: true
        };
      }

      return {
        action: strategy,
        status: 'executed',
        outcome: 'stopped',
        attempts: transaction.attempts,
        reason: `Recovery operations safely stopped for transaction.`,
        executedAt
      };
    }
  }
}
