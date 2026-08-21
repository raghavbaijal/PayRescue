import type { Transaction } from '../../types';
import type { AgentDecision } from './agentTypes';
import { buildRecoveryContext } from './recoveryContext';
import { calculateRecoveryPriority } from './recoveryPrioritizer';
import { selectRecoveryStrategy } from './strategySelector';
import { evaluateSafety } from '../safetyGate';
import { evaluatePolicy } from '../policyEngine';
import { aiService, isConfidenceAboveThreshold } from '../ai/aiService';
import type { AIDiagnosisResult } from '../ai/aiTypes';

/**
 * Closed-Loop Recovery Agent Orchestrator (Phase 5.2 Prioritization & Strategy).
 * 
 * Orchestrates recovery reasoning around verified Phase 1-4 bounds:
 * Context ➔ Priority ➔ Safety Gate ➔ AI Diagnosis ➔ AI Confidence Gate ➔ Strategy Selection ➔ Policy Engine ➔ Agent Decision
 * 
 * Enforces:
 * 1. Safety Precedence: If Safety Gate blocks/escalates, AI and Policy execution are skipped.
 * 2. Deterministic Prioritization: Calculates priority score (0-100) and factors.
 * 3. AI Intelligence: AI provides diagnosis, category, confidence & reasoning.
 * 4. Policy Authority: Recommended strategy is overridden by Policy Engine final authority.
 * 5. Side-effect free: Pure decision orchestration without status mutation or automatic payment execution.
 */
export async function runRecoveryAgent(transaction: Transaction): Promise<AgentDecision> {
  const createdAt = new Date().toISOString();

  // 1. Build Recovery Context (Pure, side-effect free)
  const context = buildRecoveryContext(transaction);

  // 2. Calculate Recovery Priority Score & Factors
  const priority = calculateRecoveryPriority(context);

  // 3. Evaluate Safety Gate prior to AI diagnosis
  const safety = evaluateSafety(transaction);
  if (safety.decision !== 'eligible') {
    const isEscalated = safety.decision === 'escalated' || safety.actionIfBlocked === 'escalated';
    const status = isEscalated ? 'escalated' : 'blocked';
    const action = safety.actionIfBlocked || (isEscalated ? 'escalated' : 'stopped');
    const strategy = selectRecoveryStrategy(context, safety, null, null);

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      status,
      context,
      priority,
      safety,
      strategy,
      recommendedAction: action,
      reasoning: `[Safety Boundary Enforced]: Priority Score ${priority.score} (${priority.level.toUpperCase()}). Safety Gate ${safety.decision.toUpperCase()}: ${safety.reason}`,
      createdAt
    };
  }

  // 4. Request AI Diagnosis Layer (Groq GPT-OSS 120B / Fallback)
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

  // 5. Evaluate AI Confidence Gate (Threshold = 0.80)
  if (!isConfidenceAboveThreshold(aiDiagnosis.confidence)) {
    const confidencePct = (aiDiagnosis.confidence * 100).toFixed(0);
    const reasoning = `AI confidence score below 80% threshold (${confidencePct}% < 80%). Automated recovery blocked; escalated to operations.`;
    const strategy = selectRecoveryStrategy(context, safety, aiDiagnosis, null);

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      status: 'escalated',
      context,
      priority,
      diagnosis: diagnosisSummary,
      safety,
      strategy,
      recommendedAction: 'escalated',
      reasoning,
      createdAt
    };
  }

  // 6. Evaluate Deterministic Policy Engine for Permitted Action Authority
  const policy = evaluatePolicy(transaction);

  // 7. Select Recovery Strategy & Enforce Policy Authority
  const strategy = selectRecoveryStrategy(context, safety, aiDiagnosis, policy);

  return {
    transactionId: transaction.id,
    razorpayPaymentId: transaction.razorpay_payment_id,
    status: 'approved',
    context,
    priority,
    diagnosis: diagnosisSummary,
    safety,
    policy,
    strategy,
    recommendedAction: policy.action,
    reasoning: `[Agent Orchestrator]: Priority ${priority.level.toUpperCase()} (${priority.score}/100). AI diagnosed '${aiDiagnosis.category}' (${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence). Policy Engine authorized '${policy.action}'. ${strategy.reasoning}`,
    createdAt
  };
}
