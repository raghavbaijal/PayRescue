import type { Transaction } from '../../types';
import type { ActionExecutionResult, RecoveryOutcome, OutcomeState, RecoveryStrategy } from './agentTypes';

/**
 * Outcome Evaluator (Phase 5.3 Controlled Agent Observation).
 * 
 * Deterministically converts an ActionExecutionResult into a structured RecoveryOutcome.
 * Side-effect free & read-only observation component.
 */
export function evaluateRecoveryOutcome(
  transaction: Transaction,
  executionResult: ActionExecutionResult
): RecoveryOutcome {
  const evaluatedAt = new Date().toISOString();
  const attemptNumber = executionResult.attempts ?? transaction.attempts;

  // Handle Blocked or Persistence Failure Execution
  if (executionResult.status === 'blocked') {
    return {
      transactionId: transaction.id,
      action: executionResult.action,
      result: 'blocked',
      recoveredAmountPaise: 0,
      attemptNumber,
      nextAction: 'none',
      reason: executionResult.reason,
      evaluatedAt
    };
  }

  if (executionResult.status === 'failed' || executionResult.persistenceError) {
    return {
      transactionId: transaction.id,
      action: executionResult.action,
      result: 'failed',
      recoveredAmountPaise: 0,
      attemptNumber,
      nextAction: 'none',
      reason: executionResult.reason,
      evaluatedAt
    };
  }

  // Handle Executed Action Outcomes
  let resultState: OutcomeState = 'stopped';
  let nextAction: RecoveryStrategy | 'none' = 'none';
  let recoveredAmountPaise = 0;

  switch (executionResult.outcome) {
    case 'recovered':
      resultState = 'recovered';
      recoveredAmountPaise = executionResult.recoveredAmountPaise || transaction.amount_paise;
      nextAction = 'none';
      break;

    case 'retry_scheduled':
      resultState = 'scheduled';
      nextAction = 'retry_later';
      break;

    case 'promise_created':
      resultState = 'promise_created';
      nextAction = 'none';
      break;

    case 'escalated':
      resultState = 'escalated';
      nextAction = 'none';
      break;

    case 'stopped':
    case 'alternate_payment_requested':
    default:
      resultState = 'stopped';
      nextAction = 'none';
      break;
  }

  return {
    transactionId: transaction.id,
    action: executionResult.action,
    result: resultState,
    recoveredAmountPaise,
    attemptNumber,
    nextAction,
    reason: executionResult.reason,
    evaluatedAt
  };
}
