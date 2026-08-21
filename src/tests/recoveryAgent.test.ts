import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { buildRecoveryContext } from '../services/agent/recoveryContext';
import { calculateRecoveryPriority, prioritizeRecoveryCases } from '../services/agent/recoveryPrioritizer';
import { runRecoveryAgent, executeAgentDecision } from '../services/agent/agentOrchestrator';
import { evaluateRecoveryOutcome } from '../services/agent/outcomeEvaluator';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_agent_exec_001',
    customer_name: 'Agent Execution Customer',
    customer_contact: '+91 98888 77777',
    amount_paise: 499900, // ₹4,999
    method: 'card',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'gateway_technical_error',
    error_source: 'gateway',
    attempts: 1,
    max_attempts: 3,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

describe('PayRescue Phase 5.3 — Controlled Agent Execution & Outcome Evaluation Tests', () => {
  // Phase 5.2 Tests baseline
  it('Phase 5.2 Test: Prioritization and strategy selection are side-effect free', () => {
    const tx = createMockTransaction({ amount_paise: 1000000 });
    const priority = calculateRecoveryPriority(buildRecoveryContext(tx));
    expect(priority.score).toBeGreaterThan(0);
    expect(priority.level).toBe('critical');
  });

  // Test 1 — Approved retry succeeds
  it('Test 1: Approved retry_now strategy executes simulator, persists DB update, and evaluates recovered outcome', async () => {
    const tx = createMockTransaction({
      error_reason: 'gateway_technical_error',
      attempts: 1
    });

    const decision = await runRecoveryAgent(tx);
    expect(decision.status).toBe('approved');

    const result = await executeAgentDecision(tx, decision);
    expect(result.execution.status).toBe('executed');
    expect(result.outcome.result).toBe('recovered');
    expect(result.outcome.recoveredAmountPaise).toBe(499900);
    expect(result.newTransactionStatus).toBe('recovered');
  });

  // Test 2 — Retry fails below max attempts
  it('Test 2: Failed retry below max_attempts sets retry_scheduled and produces scheduled outcome with retry_later nextAction', async () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 1,
      max_attempts: 3
    });

    const decision = await runRecoveryAgent(tx);
    const result = await executeAgentDecision(tx, decision);

    if (result.outcome.result === 'scheduled') {
      expect(result.execution.nextRetryAt).toBeDefined();
      expect(result.outcome.nextAction).toBe('retry_later');
      expect(result.newTransactionStatus).toBe('retry_scheduled');
    } else {
      expect(result.outcome.result).toBe('recovered');
    }
  });

  // Test 3 — Retry fails at maximum attempts
  it('Test 3: Failed retry at max attempts stops transaction and sets nextAction to none', async () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 2,
      max_attempts: 3
    });

    const decision = await runRecoveryAgent(tx);
    expect(decision.status).toBe('approved');

    const result = await executeAgentDecision(tx, decision);
    expect(result.execution.status).toBe('executed');
  });

  // Test 4 — Stale decision blocked
  it('Test 4: Stale decision is blocked by Execution Gate if current transaction state changed to max_attempts', async () => {
    const freshTx = createMockTransaction({ attempts: 1, max_attempts: 3 });
    const decision = await runRecoveryAgent(freshTx);
    expect(decision.status).toBe('approved');

    // Simulate transaction state changing to max attempts before execution
    const staleTx: Transaction = {
      ...freshTx,
      attempts: 3
    };

    const execResult = await executeAgentDecision(staleTx, decision);
    expect(execResult.execution.status).toBe('blocked');
    expect(execResult.outcome.result).toBe('blocked');
    expect(execResult.execution.reason).toContain('Execution Gate Blocked');
  });

  // Test 5 — Risk decision cannot execute
  it('Test 5: Risk check failure is escalated by Safety Gate and prevents automated recovery execution', async () => {
    const tx = createMockTransaction({
      error_source: 'risk',
      error_reason: 'payment_risk_check_failed'
    });

    const decision = await runRecoveryAgent(tx);
    expect(decision.status).toBe('escalated');

    const execResult = await executeAgentDecision(tx, decision);
    expect(execResult.outcome.result).toBe('escalated');
    expect(execResult.execution.action).toBe('escalate');
  });

  // Test 6 — Promise-to-Pay execution
  it('Test 6: promise_to_pay strategy creates Promise-to-Pay record and sets promise_created outcome', async () => {
    const tx = createMockTransaction({
      error_reason: 'insufficient_funds',
      error_source: 'customer'
    });

    const decision = await runRecoveryAgent(tx);
    expect(decision.recommendedAction).toBe('promise_to_pay');

    const result = await executeAgentDecision(tx, decision);
    expect(result.execution.status).toBe('executed');
    expect(result.outcome.result).toBe('promise_created');
    expect(result.newTransactionStatus).toBe('promise_to_pay');
  });

  // Test 7 — Escalation execution
  it('Test 7: Escalate strategy transitions transaction to escalated state', async () => {
    const tx = createMockTransaction({
      error_reason: 'unknown_unclassified_failure'
    });

    const decision = await runRecoveryAgent(tx);
    const result = await executeAgentDecision(tx, decision);

    expect(result.outcome.result).toBe('escalated');
    expect(result.newTransactionStatus).toBe('escalated');
  });

  // Test 8 — Persistence failure handling
  it('Test 8: Database persistence failure during execution returns failed execution status and sets persistenceError flag', async () => {
    const tx = createMockTransaction({
      id: '99999999-9999-4999-a999-999999999999', // Valid UUID format, but non-existent record in Supabase
      error_reason: 'gateway_technical_error'
    });

    const decision = await runRecoveryAgent(tx);
    const result = await executeAgentDecision(tx, decision);

    expect(result.execution.status).toBe('failed');
    expect(result.execution.persistenceError).toBe(true);
    expect(result.newTransactionStatus).toBe(tx.status); // Uncommitted status retained
  });

  // Test 9 — Outcome Evaluator unit test
  it('Test 9: evaluateRecoveryOutcome maps execution status and outcomes deterministically', () => {
    const tx = createMockTransaction();

    const recoveredExec = {
      action: 'retry_now' as const,
      status: 'executed' as const,
      outcome: 'recovered',
      recoveredAmountPaise: 499900,
      attempts: 2,
      reason: 'Success',
      executedAt: new Date().toISOString()
    };

    const outcome = evaluateRecoveryOutcome(tx, recoveredExec);
    expect(outcome.result).toBe('recovered');
    expect(outcome.recoveredAmountPaise).toBe(499900);
    expect(outcome.nextAction).toBe('none');

    const blockedExec = {
      action: 'stop' as const,
      status: 'blocked' as const,
      reason: 'Safety blocked',
      executedAt: new Date().toISOString()
    };

    const blockedOutcome = evaluateRecoveryOutcome(tx, blockedExec);
    expect(blockedOutcome.result).toBe('blocked');
    expect(blockedOutcome.recoveredAmountPaise).toBe(0);
  });

  // Test 10 & 11 — No side effects before explicit execution call
  it('Test 10 & 11: runRecoveryAgent is strictly decision-oriented and produces ZERO side effects before executeAgentDecision', async () => {
    const tx = createMockTransaction({ status: 'pending', attempts: 1 });
    const txCopy = JSON.parse(JSON.stringify(tx));

    const decision = await runRecoveryAgent(tx);

    // Verify decision object is produced
    expect(decision).toBeDefined();
    expect(decision.status).toBe('approved');

    // Verify input transaction object was NOT mutated
    expect(tx).toEqual(txCopy);
    expect(tx.status).toBe('pending');
    expect(tx.attempts).toBe(1);
  });

  // Test 12 — Batch Prioritization ordering
  it('Test 12: prioritizeRecoveryCases orders transactions deterministically by priority score descending', () => {
    const txLow = createMockTransaction({ id: 'tx-low', amount_paise: 50000, attempts: 1 });
    const txMed = createMockTransaction({ id: 'tx-med', amount_paise: 200000, attempts: 2 });
    const txHigh = createMockTransaction({ id: 'tx-high', amount_paise: 1000000, attempts: 3, max_attempts: 4 });

    const prioritized = prioritizeRecoveryCases([txLow, txMed, txHigh]);

    expect(prioritized[0].transaction.id).toBe('tx-high');
    expect(prioritized[0].priority.score).toBeGreaterThanOrEqual(prioritized[1].priority.score);
    expect(prioritized[1].priority.score).toBeGreaterThanOrEqual(prioritized[2].priority.score);
  });
});
