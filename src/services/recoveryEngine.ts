import type { Transaction, TransactionStatus } from '../types';
import type { RecoveryEngineResult } from '../types/recovery';
import { evaluateSafety } from './safetyGate';
import { evaluatePolicy } from './policyEngine';
import { simulatePaymentExecution } from './paymentSimulator';
import { writeAuditLog } from './auditService';
import { createPromiseToPay } from './p2pService';
import { aiService, isConfidenceAboveThreshold } from './ai/aiService';
import type { AIDiagnosisResult } from './ai/aiTypes';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEMO_TRANSACTIONS } from '../data/demoData';

/**
 * Persists transaction status, attempt counters, and retry timestamps to Supabase (or in-memory seed fallback).
 */
export async function updateTransactionInDb(
  transactionId: string,
  newStatus: TransactionStatus,
  newAttempts?: number,
  nextRetryAt?: string | null
): Promise<boolean> {
  const updatePayload: Record<string, any> = {
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
    if (nextRetryAt !== undefined) {
      DEMO_TRANSACTIONS[localIndex].next_retry_at = nextRetryAt;
    }
    DEMO_TRANSACTIONS[localIndex].updated_at = updatePayload.updated_at;
  }

  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', transactionId)
      .select('id');

    if (error || !data || data.length === 0) {
      console.error(`[Recovery Engine DB Update Error ${transactionId}]:`, error ? error.message : 'No matching record found in Supabase.');
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Recovery Engine Exception ${transactionId}]:`, err);
    return false;
  }
}

/**
 * Orchestrates Phase 3 AI-Assisted Recovery Lifecycle for a single payment failure:
 * Initial Safety Gate ➔ AI Diagnosis ➔ AI Confidence Gate ➔ Policy Engine ➔ Payment Simulator ➔ Database Updates ➔ Audit Trail
 */
export async function processSingleTransaction(
  transaction: Transaction
): Promise<RecoveryEngineResult> {
  const initialStatus = transaction.status;

  // 1. Initial Safety Gate Evaluation
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

    if (initialStatus === 'pending' || initialStatus === 'retry_scheduled') {
      const dbSuccess = await updateTransactionInDb(transaction.id, targetStatus);
      if (!dbSuccess) {
        await writeAuditLog({
          transaction_id: transaction.id,
          actor: 'system_rule',
          event_type: 'persistence_failed',
          root_cause: transaction.error_reason,
          action_taken: safety.actionIfBlocked || targetStatus,
          decision_reason: `Database update failed while persisting safety gate decision '${targetStatus}'.`,
          attempt_number: transaction.attempts
        });

        return {
          transactionId: transaction.id,
          razorpayPaymentId: transaction.razorpay_payment_id,
          previousStatus: initialStatus,
          newStatus: initialStatus,
          category: 'unknown',
          actionTaken: safety.actionIfBlocked || (targetStatus as any),
          safetyResult: safety,
          decisionReason: `Database persistence failed while applying safety decision '${targetStatus}'.`,
          error: 'PERSISTENCE_FAILED: Failed to commit status update to database.',
          persistenceError: true
        };
      }

      await writeAuditLog({
        transaction_id: transaction.id,
        actor: 'system_rule',
        event_type: auditEvent,
        root_cause: transaction.error_reason,
        action_taken: safety.actionIfBlocked || targetStatus,
        decision_reason: safety.reason,
        reasoning: `Safety gate blocked execution prior to AI diagnosis. Decision: ${safety.decision}`,
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

  // 2. AI Diagnosis Layer (Groq GPT-OSS 120B / Fallback)
  let aiDiagnosis: AIDiagnosisResult;
  try {
    aiDiagnosis = await aiService.diagnoseTransaction(transaction);
  } catch (err) {
    console.warn(`[Recovery Engine AI Exception ${transaction.id}]:`, err);
    aiDiagnosis = {
      root_cause: transaction.error_reason,
      category: 'unknown',
      confidence: 0.50,
      reasoning: 'AI diagnosis service encountered an unexpected error. Triggering safety fallback.',
      message: 'Your payment could not be completed. Please contact customer support.',
      provider: 'Deterministic Rule Fallback',
      isFallback: true
    };
  }

  const actor = aiDiagnosis.isFallback ? 'system_rule' : 'ai_agent';

  // 3. AI Confidence Gate Evaluation (Threshold = 0.80)
  if (!isConfidenceAboveThreshold(aiDiagnosis.confidence)) {
    const escalatedStatus: TransactionStatus = 'escalated';
    const dbSuccess = await updateTransactionInDb(transaction.id, escalatedStatus);

    if (!dbSuccess) {
      await writeAuditLog({
        transaction_id: transaction.id,
        actor,
        event_type: 'persistence_failed',
        root_cause: aiDiagnosis.root_cause,
        ai_confidence: aiDiagnosis.confidence,
        action_taken: 'escalated',
        decision_reason: `Database persistence failed while escalating low-confidence transaction.`,
        attempt_number: transaction.attempts
      });

      return {
        transactionId: transaction.id,
        razorpayPaymentId: transaction.razorpay_payment_id,
        previousStatus: initialStatus,
        newStatus: initialStatus,
        category: aiDiagnosis.category,
        actionTaken: 'escalated',
        safetyResult: safety,
        decisionReason: `Database persistence failure during confidence gate escalation.`,
        error: 'PERSISTENCE_FAILED: Failed to commit status update to database.',
        persistenceError: true
      };
    }

    const confidencePct = (aiDiagnosis.confidence * 100).toFixed(0);
    const decisionReason = `AI confidence score below 80% threshold (${confidencePct}% < 80%). Automatic recovery blocked; transaction escalated for manual ops review.`;

    await writeAuditLog({
      transaction_id: transaction.id,
      actor,
      event_type: 'escalated',
      root_cause: aiDiagnosis.root_cause,
      ai_confidence: aiDiagnosis.confidence,
      action_taken: 'escalated',
      decision_reason: decisionReason,
      reasoning: aiDiagnosis.reasoning,
      message_draft: aiDiagnosis.message,
      attempt_number: transaction.attempts
    });

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      previousStatus: initialStatus,
      newStatus: escalatedStatus,
      category: aiDiagnosis.category,
      actionTaken: 'escalated',
      safetyResult: safety,
      decisionReason
    };
  }

  // 4. Deterministic Policy Engine Evaluation
  const policy = evaluatePolicy(transaction);

  // 5. Action Execution Branching & Persistence Commitment
  let finalStatus: TransactionStatus = 'pending';
  let simulationResult = undefined;

  switch (policy.action) {
    case 'promise_to_pay': {
      finalStatus = 'promise_to_pay';
      const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus);
      if (!dbSuccess) {
        return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis);
      }
      await createPromiseToPay(transaction);

      await writeAuditLog({
        transaction_id: transaction.id,
        actor,
        event_type: 'promise_logged',
        root_cause: aiDiagnosis.root_cause,
        ai_confidence: aiDiagnosis.confidence,
        action_taken: 'promise_to_pay',
        decision_reason: `AI classified as ${aiDiagnosis.category} (${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence). ${policy.reason}`,
        reasoning: aiDiagnosis.reasoning,
        message_draft: aiDiagnosis.message,
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'alternate_payment': {
      finalStatus = 'stopped';
      const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus);
      if (!dbSuccess) {
        return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis);
      }
      await writeAuditLog({
        transaction_id: transaction.id,
        actor,
        event_type: 'stopped',
        root_cause: aiDiagnosis.root_cause,
        ai_confidence: aiDiagnosis.confidence,
        action_taken: 'alternate_payment',
        decision_reason: policy.reason,
        reasoning: aiDiagnosis.reasoning,
        message_draft: aiDiagnosis.message,
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'escalated': {
      finalStatus = 'escalated';
      const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus);
      if (!dbSuccess) {
        return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis);
      }
      await writeAuditLog({
        transaction_id: transaction.id,
        actor,
        event_type: 'escalated',
        root_cause: aiDiagnosis.root_cause,
        ai_confidence: aiDiagnosis.confidence,
        action_taken: 'escalated',
        decision_reason: policy.reason,
        reasoning: aiDiagnosis.reasoning,
        message_draft: aiDiagnosis.message,
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'stopped': {
      finalStatus = 'stopped';
      const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus);
      if (!dbSuccess) {
        return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis);
      }
      await writeAuditLog({
        transaction_id: transaction.id,
        actor,
        event_type: 'stopped',
        root_cause: aiDiagnosis.root_cause,
        ai_confidence: aiDiagnosis.confidence,
        action_taken: 'stopped',
        decision_reason: policy.reason,
        reasoning: aiDiagnosis.reasoning,
        message_draft: aiDiagnosis.message,
        attempt_number: transaction.attempts
      });
      break;
    }

    case 'retry_scheduled':
    default: {
      simulationResult = simulatePaymentExecution(transaction, 'retry_scheduled');
      const nextAttempt = transaction.attempts + 1;

      if (simulationResult.outcome === 'recovered') {
        finalStatus = 'recovered';

        // ISSUE 1: Verify DB Persistence before claiming recovered!
        const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus, nextAttempt, null);
        if (!dbSuccess) {
          return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis, simulationResult);
        }

        await writeAuditLog({
          transaction_id: transaction.id,
          actor,
          event_type: 'retry_executed',
          root_cause: aiDiagnosis.root_cause,
          ai_confidence: aiDiagnosis.confidence,
          action_taken: 'recovered',
          decision_reason: `AI Diagnosis: ${aiDiagnosis.root_cause} (${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence). ${simulationResult.reason}`,
          reasoning: aiDiagnosis.reasoning,
          message_draft: aiDiagnosis.message,
          attempt_number: nextAttempt
        });
      } else {
        // Retry execution simulation failed
        if (nextAttempt >= transaction.max_attempts) {
          finalStatus = 'stopped';
          const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus, nextAttempt, null);
          if (!dbSuccess) {
            return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis, simulationResult);
          }

          await writeAuditLog({
            transaction_id: transaction.id,
            actor,
            event_type: 'stopped',
            root_cause: aiDiagnosis.root_cause,
            ai_confidence: aiDiagnosis.confidence,
            action_taken: 'stopped',
            decision_reason: `Simulated retry failed on attempt ${nextAttempt}/${transaction.max_attempts}. Attempt threshold exhausted.`,
            reasoning: aiDiagnosis.reasoning,
            message_draft: aiDiagnosis.message,
            attempt_number: nextAttempt
          });
        } else {
          // ISSUE 2: Schedule retry with next_retry_at timestamp (15 minutes in future)
          finalStatus = 'retry_scheduled';
          const futureRetryTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();

          const dbSuccess = await updateTransactionInDb(transaction.id, finalStatus, nextAttempt, futureRetryTime);
          if (!dbSuccess) {
            return handlePersistenceError(transaction, initialStatus, safety, policy, aiDiagnosis, simulationResult);
          }

          await writeAuditLog({
            transaction_id: transaction.id,
            actor,
            event_type: 'retry_executed',
            root_cause: aiDiagnosis.root_cause,
            ai_confidence: aiDiagnosis.confidence,
            action_taken: 'retry_scheduled',
            decision_reason: `Simulated retry failed on attempt ${nextAttempt}/${transaction.max_attempts}. Scheduled next retry window for ${new Date(futureRetryTime).toLocaleTimeString()}.`,
            reasoning: aiDiagnosis.reasoning,
            message_draft: aiDiagnosis.message,
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
    category: aiDiagnosis.category,
    actionTaken: policy.action,
    safetyResult: safety,
    policyResult: policy,
    simulationResult,
    decisionReason: `[${aiDiagnosis.provider}] Category: ${aiDiagnosis.category} (${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence). ${policy.reason}`
  };
}

/**
 * Handles database persistence failure cleanly to ensure Recovery Engine never claims uncommitted recovery states.
 */
async function handlePersistenceError(
  transaction: Transaction,
  initialStatus: TransactionStatus,
  safety: any,
  policy: any,
  aiDiagnosis: AIDiagnosisResult,
  simulationResult?: any
): Promise<RecoveryEngineResult> {
  const actor = aiDiagnosis.isFallback ? 'system_rule' : 'ai_agent';

  await writeAuditLog({
    transaction_id: transaction.id,
    actor,
    event_type: 'persistence_failed',
    root_cause: aiDiagnosis.root_cause,
    ai_confidence: aiDiagnosis.confidence,
    action_taken: policy.action,
    decision_reason: `Database persistence failed while committing action '${policy.action}'. Status reverted to '${initialStatus}'.`,
    reasoning: aiDiagnosis.reasoning,
    attempt_number: transaction.attempts
  });

  return {
    transactionId: transaction.id,
    razorpayPaymentId: transaction.razorpay_payment_id,
    previousStatus: initialStatus,
    newStatus: initialStatus, // Preserve previous status
    category: aiDiagnosis.category,
    actionTaken: policy.action,
    safetyResult: safety,
    policyResult: policy,
    simulationResult,
    decisionReason: `Database persistence failed while committing action '${policy.action}'. Recovery state remains uncommitted.`,
    error: 'PERSISTENCE_FAILED: Failed to commit status update to database.',
    persistenceError: true
  };
}
