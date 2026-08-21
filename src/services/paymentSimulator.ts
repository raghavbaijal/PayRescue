import type { Transaction } from '../types';
import type { RecoveryAction, SimulationResult } from '../types/recovery';

/**
 * Simple deterministic hash function (0 - 99) based on string seed.
 * Ensures consistent, deterministic simulation outcomes across test runs.
 */
function deterministicHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 100;
}

/**
 * Simulated Payment Execution Engine
 * Evaluates simulated retry success deterministically based on error reason probabilities.
 */
export function simulatePaymentExecution(
  transaction: Transaction,
  action: RecoveryAction
): SimulationResult {
  // Only retry_scheduled action executes automated payment retry
  if (action !== 'retry_scheduled') {
    return {
      action,
      outcome: 'failed',
      simulatedSuccess: false,
      reason: `Action '${action}' does not attempt direct automated payment retry.`
    };
  }

  // Non-retryable error reasons should never recover via automated retry
  const nonRetryableReasons = [
    'insufficient_funds',
    'card_expired',
    'debit_instrument_blocked',
    'payment_risk_check_failed'
  ];

  if (nonRetryableReasons.includes(transaction.error_reason)) {
    return {
      action,
      outcome: 'failed',
      simulatedSuccess: false,
      reason: `Error reason '${transaction.error_reason}' cannot be auto-recovered via retry.`
    };
  }

  // Define success probability threshold (0 - 100) per failure reason
  let probability = 50;
  switch (transaction.error_reason) {
    case 'bank_technical_error':
    case 'gateway_technical_error':
    case 'payment_timed_out':
      probability = 85;
      break;

    case 'network_error':
      probability = 80;
      break;

    case 'authentication_failed':
    case 'incorrect_cvv':
      probability = 60;
      break;

    default:
      probability = 50;
      break;
  }

  // Use deterministic hash based on payment ID and attempt number
  const seed = `${transaction.id}_attempt_${transaction.attempts}`;
  const score = deterministicHash(seed);
  const isSuccess = score < probability;

  if (isSuccess) {
    return {
      action,
      outcome: 'recovered',
      simulatedSuccess: true,
      reason: `Simulated retry succeeded (${score} < ${probability}% threshold). Payment captured.`
    };
  }

  return {
    action,
    outcome: 'failed',
    simulatedSuccess: false,
    reason: `Simulated retry failed (${score} >= ${probability}% threshold). Transient bank/network issue persisted.`
  };
}
