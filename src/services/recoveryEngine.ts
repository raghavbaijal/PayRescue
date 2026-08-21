import type { Transaction, TransactionStatus } from '../types';
import type { RecoveryEngineResult } from '../types/recovery';
import { evaluateSafety } from './safetyGate';
import { evaluatePolicy } from './policyEngine';
import { simulatePaymentExecution } from './paymentSimulator';
import { writeAuditLog } from './auditService';
import { createPromiseToPay } from './p2pService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEMO_TRANSACTIONS } from '../data/demoData';

/**
 * Persists transaction status and attempt updates to Supabase (or in-memory seed dataset fallback).
 */
async function updateTransactionInDb(
  transactionId: string,
  newStatus: TransactionStatus,
  newAttempts?: number
): Promise<boolean> {
  const updatePayload: Partial<Transaction> = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (newAttempts !== undefined) {
    updatePayload.attempts = newAttempts;
  }

  // Update in-memory fallback array for local demo state consistency
  const localIndex = DEMO_TRANSACTIONS.findIndex(t => t.id === transactionId);
  if (localIndex !== -1) {
    DEMO_TRANSACTIONS[localIndex].status = newStatus;
    if (newAttempts !== undefined) {
      DEMO_TRANSACTIONS[localIndex].attempts = newAttempts;
    }
    DEMO_TRANSACTIONS[localIndex].updated_at = updatePayload.updated_at!;
  }

  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const { error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', transactionId);

    if (error) {
      console.error(`[Recovery Engine DB Update Error ${transactionId}]:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Recovery Engine Exception ${transactionId}]:`, err);
    return false;
  }
}

/**
 * Orchestrates recovery lifecycle for a single payment failure transaction.
 */
export async function processSingleTransaction(
  transaction: Transaction
): Promise<RecoveryEngineResult> {
  const initialStatus = transaction.status;

  // 1. Safety Gate Evaluation
  const safety = evaluateSafety(transaction);
  if (safety.decision !== 'eligible') {
    let targetStatus: TransactionStatus = 'stopped';
    let auditEvent = 'stopped';

    if (safety.decision === 'escalated' || safety.actionIfBlocked === 'escalated') {
      targetStatus = 'escalated';
      auditEvent = 'escalated';
    } else if (safety.actionIfBlocked === 'alternate_payment') {
      targetStatus = 'stopped';
      auditEvent = 'stopped';
    }

    if (initialStatus === 'pending') {
      await updateTransactionInDb(transaction.id, targetStatus);
      await writeAuditLog({
        transaction_id: transaction.id,
        actor: 'system_rule',
        event_type: auditEvent,
        root_cause: transaction.error_reason,
        action_taken: safety.actionIfBlocked || targetStatus,
        decision_reason: safety.reason,
        reasoning: `Safety gate blocked execution. Decision: ${safety.decision}`,
        attempt_number: transaction.attempts
      });
    }

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      previousStatus: initialStatus,
      newStatus: targetStatus,
      category: 'unknown',
      actionTaken: safety.actionIfBlocked || (targetStatus as any),
      safetyResult: safety,
      decisionReason: safety.reason
    };
  }

  // 2. Deterministic Policy Engine Evaluation
  const policy = evaluatePolicy(transaction);

  // 3. Action Execution Branching
  let finalStatus: TransactionStatus = 'pending';
  let simulationResult = undefined;

  switch (policy.action) {
    case 'promise_to_pay': {
      finalStatus = 'promise_to_pay';
      await updateTransactionInDb(transaction.id, finalStatus);
      await createPromiseToPay(transaction);
      break;
    }

    case 'alternate_payment': {
      finalStatus = 'stopped';
      await updateTransactionInDb(transaction.id, finalStatus);
      await writeAuditLog({
        transaction_id: transaction.id,
        actor: 'system_rule',
        event_type: 'stopped',
        root_cause: transaction.error_reason,
        action_taken: 'alternate_payment',
        decision_reason: policy.reason,
        reasoning: 'Card expired or debit instrument blocked. Customer requires alternate payment setup.',
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'escalated': {
      finalStatus = 'escalated';
      await updateTransactionInDb(transaction.id, finalStatus);
      await writeAuditLog({
        transaction_id: transaction.id,
        actor: 'system_rule',
        event_type: 'escalated',
        root_cause: transaction.error_reason,
        action_taken: 'escalated',
        decision_reason: policy.reason,
        reasoning: 'Failure classified as unrecoverable by automated rule or risk trigger.',
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'stopped': {
      finalStatus = 'stopped';
      await updateTransactionInDb(transaction.id, finalStatus);
      await writeAuditLog({
        transaction_id: transaction.id,
        actor: 'system_rule',
        event_type: 'stopped',
        root_cause: transaction.error_reason,
        action_taken: 'stopped',
        decision_reason: policy.reason,
        reasoning: 'Maximum retry attempt bound reached.',
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'retry_scheduled':
    default: {
      // Execute simulated retry payment
      simulationResult = simulatePaymentExecution(transaction, 'retry_scheduled');
      const nextAttempt = transaction.attempts + 1;

      if (simulationResult.outcome === 'recovered') {
        finalStatus = 'recovered';
        await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
        await writeAuditLog({
          transaction_id: transaction.id,
          actor: 'system_rule',
          event_type: 'retry_executed',
          root_cause: transaction.error_reason,
          action_taken: 'recovered',
          decision_reason: `${policy.reason} ${simulationResult.reason}`,
          reasoning: 'Automated retry executed successfully. Payment captured.',
          attempt_number: nextAttempt
        });
      } else {
        // Simulation failed
        if (nextAttempt >= transaction.max_attempts) {
          finalStatus = 'stopped';
          await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
          await writeAuditLog({
            transaction_id: transaction.id,
            actor: 'system_rule',
            event_type: 'stopped',
            root_cause: transaction.error_reason,
            action_taken: 'stopped',
            decision_reason: `Simulated retry failed on attempt ${nextAttempt} of ${transaction.max_attempts}. Threshold exhausted.`,
            reasoning: simulationResult.reason,
            attempt_number: nextAttempt
          });
        } else {
          finalStatus = 'retry_scheduled';
          await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
          await writeAuditLog({
            transaction_id: transaction.id,
            actor: 'system_rule',
            event_type: 'retry_executed',
            root_cause: transaction.error_reason,
            action_taken: 'retry_scheduled',
            decision_reason: `Simulated retry failed on attempt ${nextAttempt} of ${transaction.max_attempts}. Scheduled for next retry window.`,
            reasoning: simulationResult.reason,
            attempt_number: nextAttempt
          });
        }
      }
      break;
    }
  }

  return {
    transactionId: transaction.id,
    razorpayPaymentId: transaction.razorpay_payment_id,
    previousStatus: initialStatus,
    newStatus: finalStatus,
    category: policy.category,
    actionTaken: policy.action,
    safetyResult: safety,
    policyResult: policy,
    simulationResult,
    decisionReason: `${policy.reason} Status updated from '${initialStatus}' to '${finalStatus}'.`
  };
}
