import type { Transaction } from '../../types';
import type { AgentDecision } from './agentTypes';
import { buildRecoveryContext } from './recoveryContext';
import { evaluateSafety } from '../safetyGate';
import { evaluatePolicy } from '../policyEngine';
import { aiService, isConfidenceAboveThreshold } from '../ai/aiService';
import type { AIDiagnosisResult } from '../ai/aiTypes';

/**
 * Closed-Loop Recovery Agent Orchestrator (Phase 5.1 Foundation).
 * 
 * Orchestrates recovery reasoning around verified Phase 1-4 bounds:
 * Agent Context ➔ Safety Gate ➔ AI Diagnosis ➔ AI Confidence Gate ➔ Policy Engine ➔ Agent Decision
 * 
 * Enforces:
 * 1. Safety Precedence: If Safety Gate blocks/escalates, AI and Policy are skipped.
 * 2. AI Intelligence: AI provides diagnosis, category, confidence & reasoning.
 * 3. Policy Authority: Permitted action is determined exclusively by Policy Engine.
 */
export async function runRecoveryAgent(transaction: Transaction): Promise<AgentDecision> {
  const createdAt = new Date().toISOString();

  // 1. Build Recovery Context (Pure, side-effect free)
  const context = buildRecoveryContext(transaction);

  // 2. Evaluate Safety Gate prior to AI diagnosis
  const safety = evaluateSafety(transaction);
  if (safety.decision !== 'eligible') {
    const isEscalated = safety.decision === 'escalated' || safety.actionIfBlocked === 'escalated';
    const status = isEscalated ? 'escalated' : 'blocked';
    const action = safety.actionIfBlocked || (isEscalated ? 'escalated' : 'stopped');

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      status,
      context,
      safety,
      recommendedAction: action,
      reasoning: `Safety Gate ${safety.decision.toUpperCase()}: ${safety.reason}`,
      createdAt
    };
  }

  // 3. Request AI Diagnosis Layer (Groq GPT-OSS 120B / Fallback)
  let aiDiagnosis: AIDiagnosisResult;
  try {
    aiDiagnosis = await aiService.diagnoseTransaction(transaction);
  } catch (err) {
    console.warn(`[Recovery Agent AI Exception ${transaction.id}]:`, err);
    aiDiagnosis = {
      root_cause: transaction.error_reason,
      category: 'unknown',
      confidence: 0.50,
      reasoning: 'AI diagnosis service encountered an error. Triggering rule fallback.',
      message: 'Your payment could not be completed.',
      provider: 'Deterministic Rule Fallback',
      isFallback: true
    };
  }

  const diagnosisSummary = {
    category: aiDiagnosis.category,
    rootCause: aiDiagnosis.root_cause,
    confidence: aiDiagnosis.confidence,
    reasoning: aiDiagnosis.reasoning,
    provider: aiDiagnosis.provider,
    isFallback: aiDiagnosis.isFallback
  };

  // 4. Evaluate AI Confidence Gate (Threshold = 0.80)
  if (!isConfidenceAboveThreshold(aiDiagnosis.confidence)) {
    const confidencePct = (aiDiagnosis.confidence * 100).toFixed(0);
    const reasoning = `AI confidence score below 80% threshold (${confidencePct}% < 80%). Automated recovery blocked; escalated to operations.`;

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      status: 'escalated',
      context,
      diagnosis: diagnosisSummary,
      safety,
      recommendedAction: 'escalated',
      reasoning,
      createdAt
    };
  }

  // 5. Evaluate Deterministic Policy Engine for Permitted Action Authority
  const policy = evaluatePolicy(transaction);

  return {
    transactionId: transaction.id,
    razorpayPaymentId: transaction.razorpay_payment_id,
    status: 'approved',
    context,
    diagnosis: diagnosisSummary,
    safety,
    policy,
    recommendedAction: policy.action,
    reasoning: `[Agent Orchestrator]: AI diagnosed category '${aiDiagnosis.category}' with ${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence. Policy Engine authorized action '${policy.action}'.`,
    createdAt
  };
}
