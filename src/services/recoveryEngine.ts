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
 * Orchestrates Phase 3 AI-Assisted Recovery Lifecycle for a single payment failure:
 * Initial Safety Gate ➔ AI Diagnosis ➔ AI Confidence Gate ➔ Policy Engine ➔ Payment Simulator ➔ Database Updates ➔ Audit Trail
 */
export async function processSingleTransaction(
  transaction: Transaction
): Promise<RecoveryEngineResult> {
  const initialStatus = transaction.status;

  // 1. Initial Safety Gate Evaluation (Optimization: skip AI call if already resolved / max attempts reached)
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

  // 2. AI Diagnosis Layer (Groq GPT-OSS 120B / Deterministic Fallback)
  let aiDiagnosis: AIDiagnosisResult;
  try {
    aiDiagnosis = await aiService.diagnoseTransaction(transaction);
  } catch (err) {
    console.warn(`[Recovery Engine AI Exception ${transaction.id}]:`, err);
    // Safety fallback
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
    await updateTransactionInDb(transaction.id, escalatedStatus);

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

  // 5. Action Execution Branching
  let finalStatus: TransactionStatus = 'pending';
  let simulationResult = undefined;

  switch (policy.action) {
    case 'promise_to_pay': {
      finalStatus = 'promise_to_pay';
      await updateTransactionInDb(transaction.id, finalStatus);
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
      await updateTransactionInDb(transaction.id, finalStatus);
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
      await updateTransactionInDb(transaction.id, finalStatus);
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
      await updateTransactionInDb(transaction.id, finalStatus);
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
      // Execute simulated payment retry
      simulationResult = simulatePaymentExecution(transaction, 'retry_scheduled');
      const nextAttempt = transaction.attempts + 1;

      if (simulationResult.outcome === 'recovered') {
        finalStatus = 'recovered';
        await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
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
        // Simulation failed
        if (nextAttempt >= transaction.max_attempts) {
          finalStatus = 'stopped';
          await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
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
          finalStatus = 'retry_scheduled';
          await updateTransactionInDb(transaction.id, finalStatus, nextAttempt);
          await writeAuditLog({
            transaction_id: transaction.id,
            actor,
            event_type: 'retry_executed',
            root_cause: aiDiagnosis.root_cause,
            ai_confidence: aiDiagnosis.confidence,
            action_taken: 'retry_scheduled',
            decision_reason: `Simulated retry failed on attempt ${nextAttempt}/${transaction.max_attempts}. Scheduled for next retry window.`,
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
