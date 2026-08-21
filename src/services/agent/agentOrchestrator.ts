import type { Transaction, TransactionStatus } from '../../types';
import type { AgentDecision, AgentExecutionResult, ActionExecutionResult } from './agentTypes';
import { buildRecoveryContext, enrichRecoveryContextWithMemory } from './recoveryContext';
import { calculateRecoveryPriority } from './recoveryPrioritizer';
import { selectRecoveryStrategy } from './strategySelector';
import { getRecoveryMemorySync } from './recoveryMemory';
import { executeRecoveryAction } from './actionExecutor';
import { evaluateRecoveryOutcome } from './outcomeEvaluator';
import { evaluateSafety } from '../safetyGate';
import { evaluatePolicy } from '../policyEngine';
import { writeAuditLog } from '../auditService';
import { aiService, isConfidenceAboveThreshold } from '../ai/aiService';
import type { AIDiagnosisResult } from '../ai/aiTypes';

/**
 * Closed-Loop Recovery Agent Decision Orchestrator (Phase 5.1, 5.2 & 5.4 Memory Intelligence).
 * 
 * Side-Effect Free Decision Layer:
 * Context ➔ Memory ➔ Priority ➔ Safety Gate ➔ AI Diagnosis ➔ AI Confidence Gate ➔ Strategy Selection ➔ Policy Engine ➔ Agent Decision
 * 
 * Does NOT execute payment retries or mutate database records.
 */
export async function runRecoveryAgent(
  transaction: Transaction,
  historicalDataset?: Transaction[]
): Promise<AgentDecision> {
  const createdAt = new Date().toISOString();

  // 1. Build Initial Recovery Context
  let context = buildRecoveryContext(transaction);

  // 2. Load Historical Recovery Memory (Pure, deterministic, read-only aggregation)
  const memory = getRecoveryMemorySync(transaction, historicalDataset);
  context = enrichRecoveryContextWithMemory(context, memory);

  // 3. Calculate Recovery Priority Score & Factors
  const priority = calculateRecoveryPriority(context);

  const memorySummary = {
    sampleSize: memory.sampleSize,
    recoveryRate: memory.recoveryRate,
    confidence: memory.confidence,
    summary: memory.similarCaseSummary,
    matchingLevel: memory.matchingLevel
  };

  // 4. Evaluate Safety Gate prior to AI diagnosis
  const safety = evaluateSafety(transaction);
  if (safety.decision !== 'eligible') {
    const isEscalated = safety.decision === 'escalated' || safety.actionIfBlocked === 'escalated';
    const status = isEscalated ? 'escalated' : 'blocked';
    const action = safety.actionIfBlocked || (isEscalated ? 'escalated' : 'stopped');
    const strategy = selectRecoveryStrategy(context, safety, null, null, memory);

    return {
      transactionId: transaction.id,
      razorpayPaymentId: transaction.razorpay_payment_id,
      status,
      context,
      priority,
      safety,
      strategy,
      recommendedAction: action,
      memory: memorySummary,
      reasoning: `[Safety Boundary Enforced]: Priority Score ${priority.score} (${priority.level.toUpperCase()}). Safety Gate ${safety.decision.toUpperCase()}: ${safety.reason}`,
      createdAt
    };
  }

  // 5. Request AI Diagnosis Layer (Groq GPT-OSS 120B / Fallback)
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

  // 6. Evaluate AI Confidence Gate (Threshold = 0.80)
  if (!isConfidenceAboveThreshold(aiDiagnosis.confidence)) {
    const confidencePct = (aiDiagnosis.confidence * 100).toFixed(0);
    const reasoning = `AI confidence score below 80% threshold (${confidencePct}% < 80%). Automated recovery blocked; escalated to operations.`;
    const strategy = selectRecoveryStrategy(context, safety, aiDiagnosis, null, memory);

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
      memory: memorySummary,
      reasoning,
      createdAt
    };
  }

  // 7. Evaluate Deterministic Policy Engine for Permitted Action Authority
  const policy = evaluatePolicy(transaction);

  // 8. Select Recovery Strategy & Enforce Policy Authority (incorporates Memory Intelligence)
  const strategy = selectRecoveryStrategy(context, safety, aiDiagnosis, policy, memory);

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
    memory: memorySummary,
    reasoning: `[Agent Orchestrator]: Priority ${priority.level.toUpperCase()} (${priority.score}/100). AI diagnosed '${aiDiagnosis.category}' (${(aiDiagnosis.confidence * 100).toFixed(0)}% confidence). Policy Engine authorized '${policy.action}'. ${strategy.reasoning}`,
    createdAt
  };
}

/**
 * Closed-Loop Recovery Agent Execution Orchestrator (Phase 5.3 Controlled Execution).
 * 
 * Performs controlled execution of an AgentDecision against current transaction state:
 * Current Transaction ➔ Stale Decision Execution Gate ➔ Action Executor ➔ Outcome Evaluator ➔ Persistence ➔ Audit Trail
 */
export async function executeAgentDecision(
  currentTransaction: Transaction,
  decision: AgentDecision
): Promise<AgentExecutionResult> {
  const completedAt = new Date().toISOString();

  // 1. Execution Gate & Stale Decision Protection: Re-evaluate Safety & Policy against current transaction state
  const currentSafety = evaluateSafety(currentTransaction);

  // Check if current safety gate blocks execution (e.g. max attempts reached or state changed since decision)
  if (currentSafety.decision === 'blocked') {
    const blockedExecution: ActionExecutionResult = {
      action: decision.strategy?.final || 'stop',
      status: 'blocked',
      outcome: 'blocked',
      attempts: currentTransaction.attempts,
      reason: `Execution Gate Blocked: Current transaction state (${currentTransaction.status}, attempts: ${currentTransaction.attempts}/${currentTransaction.max_attempts}) fails safety rules: ${currentSafety.reason}`,
      executedAt: completedAt
    };

    const outcome = evaluateRecoveryOutcome(currentTransaction, blockedExecution);

    await writeAuditLog({
      transaction_id: currentTransaction.id,
      actor: 'system_rule',
      event_type: 'execution_blocked',
      root_cause: currentTransaction.error_reason,
      ai_confidence: decision.diagnosis?.confidence ?? null,
      action_taken: 'blocked',
      decision_reason: blockedExecution.reason,
      attempt_number: currentTransaction.attempts
    });

    return {
      decision,
      execution: blockedExecution,
      outcome,
      newTransactionStatus: currentTransaction.status,
      completedAt
    };
  }

  // 2. Select Strategy to Execute (Policy Engine & Safety Gate authority MUST win over recommended strategy!)
  let strategyToExecute = decision.strategy?.final || 'stop';
  if (currentSafety.decision === 'escalated') {
    strategyToExecute = 'escalate';
  }

  // 3. Execute Recovery Strategy
  const execution = await executeRecoveryAction(currentTransaction, strategyToExecute);

  // 4. Evaluate Structured Recovery Outcome
  const outcome = evaluateRecoveryOutcome(currentTransaction, execution);

  // Derive new transaction status after execution
  let newStatus: TransactionStatus = currentTransaction.status;
  if (execution.status === 'executed' && !execution.persistenceError) {
    if (execution.outcome === 'recovered') newStatus = 'recovered';
    else if (execution.outcome === 'retry_scheduled') newStatus = 'retry_scheduled';
    else if (execution.outcome === 'promise_created') newStatus = 'promise_to_pay';
    else if (execution.outcome === 'escalated') newStatus = 'escalated';
    else if (execution.outcome === 'stopped' || execution.outcome === 'alternate_payment_requested') newStatus = 'stopped';
  }

  // 5. Append Audit Event for Controlled Agent Execution
  const actor = decision.diagnosis?.isFallback ? 'system_rule' : 'ai_agent';
  await writeAuditLog({
    transaction_id: currentTransaction.id,
    actor,
    event_type: 'agent_executed',
    root_cause: decision.diagnosis?.rootCause || currentTransaction.error_reason,
    ai_confidence: decision.diagnosis?.confidence ?? null,
    action_taken: execution.outcome || strategyToExecute,
    decision_reason: `[Agent Execution]: Action '${strategyToExecute}' executed with outcome '${outcome.result}'. ${execution.reason}`,
    reasoning: decision.reasoning,
    attempt_number: execution.attempts ?? currentTransaction.attempts
  });

  return {
    decision,
    execution,
    outcome,
    newTransactionStatus: newStatus,
    completedAt
  };
}
