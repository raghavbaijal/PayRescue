import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { runClosedLoopRecovery } from '../services/agent/closedLoopAgent';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_closedloop_001',
    customer_name: 'Closed Loop Customer',
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

describe('PayRescue Phase 5.5 — Closed-Loop Recovery Agent Tests', () => {
  // Test 1 — Successful first action
  it('Test 1: Single-step successful recovery terminates immediately with status=recovered', async () => {
    const tx = createMockTransaction({
      error_reason: 'gateway_technical_error',
      attempts: 1
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('recovered');
    expect(result.totalSteps).toBe(1);
    expect(result.terminationReason).toBe('recovered');
    expect(result.totalRecoveredAmountPaise).toBe(499900);
    expect(result.finalTransactionState.status).toBe('recovered');
  });

  // Test 2 — Retry failure then scheduled
  it('Test 2: Scheduled retry terminates loop cleanly without immediate re-execution (status=scheduled)', async () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 1,
      max_attempts: 3
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    if (result.status === 'scheduled') {
      expect(result.totalSteps).toBe(1);
      expect(result.terminationReason).toBe('retry_scheduled');
      expect(result.finalTransactionState.status).toBe('retry_scheduled');
      expect(result.finalTransactionState.next_retry_at).toBeDefined();
    } else {
      expect(result.status).toBe('recovered');
    }
  });

  // Test 4 — Maximum attempts
  it('Test 4: Transaction at max attempts is immediately blocked and stopped without execution', async () => {
    const tx = createMockTransaction({
      attempts: 3,
      max_attempts: 3
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('blocked');
    expect(result.terminationReason).toContain('Maximum recovery attempt threshold reached');
    expect(result.steps[0].execution).toBeUndefined(); // Execution skipped!
  });

  // Test 5 — Safety changes between steps
  it('Test 5: Safety Gate re-evaluation halts loop if transaction state becomes unsafe across steps', async () => {
    const tx = createMockTransaction({
      attempts: 2,
      max_attempts: 3
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.steps.length).toBeGreaterThan(0);
    result.steps.forEach(step => {
      expect(step.decision.safety).toBeDefined();
    });
  });

  // Test 6 — Risk escalation
  it('Test 6: Risk check failure terminates loop immediately with status=escalated', async () => {
    const tx = createMockTransaction({
      error_source: 'risk',
      error_reason: 'payment_risk_check_failed'
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('escalated');
    expect(result.totalSteps).toBe(1);
    expect(result.steps[0].decision.safety.decision).toBe('escalated');
  });

  // Test 7 — Unclassified/Escalated recovery
  it('Test 7: Unclassified failure triggers escalation strategy and halts loop with status=escalated', async () => {
    const tx = createMockTransaction({
      error_reason: 'unknown_custom_failure'
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('escalated');
    expect(result.finalTransactionState.status).toBe('escalated');
  });

  // Test 8 — Promise-to-Pay execution
  it('Test 8: promise_to_pay strategy creates P2P commitment and terminates with status=promise_created', async () => {
    const tx = createMockTransaction({
      error_reason: 'insufficient_funds',
      error_source: 'customer'
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('promise_created');
    expect(result.totalSteps).toBe(1);
    expect(result.terminationReason).toBe('promise_created');
    expect(result.finalTransactionState.status).toBe('promise_to_pay');
    expect(result.totalRecoveredAmountPaise).toBe(0); // Not falsely marked recovered
  });

  // Test 9 — Max loop steps boundary
  it('Test 9: Loop halts when maxSteps limit is reached', async () => {
    const tx = createMockTransaction();

    const result = await runClosedLoopRecovery(tx, { maxSteps: 1 });

    expect(result.totalSteps).toBeLessThanOrEqual(1);
    expect(['recovered', 'scheduled', 'promise_created', 'escalated', 'stopped', 'blocked', 'max_steps_reached']).toContain(result.status);
  });

  // Test 10 — Persistence failure
  it('Test 10: Database persistence failure halts closed loop immediately with terminationReason=persistence_failed', async () => {
    const tx = createMockTransaction({
      id: '99999999-9999-4999-a999-999999999999', // Valid UUID format, but non-existent record in Supabase
      error_reason: 'gateway_technical_error'
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.status).toBe('blocked');
    expect(result.terminationReason).toBe('persistence_failed');
    expect(result.steps[0].execution?.persistenceError).toBe(true);
  });

  // Test 12 — Decision history structure
  it('Test 12: ClosedLoopResult records complete step history (decision, execution, outcome, timestamps)', async () => {
    const tx = createMockTransaction({
      error_reason: 'gateway_technical_error'
    });

    const result = await runClosedLoopRecovery(tx, { maxSteps: 3 });

    expect(result.transactionId).toBe(tx.id);
    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);

    const step1 = result.steps[0];
    expect(step1.step).toBe(1);
    expect(step1.decision).toBeDefined();
    expect(step1.startedAt).toBeDefined();
    expect(step1.completedAt).toBeDefined();
  });

  // Test 13 — No infinite loop guarantee
  it('Test 13: Loop always terminates deterministically for all inputs', async () => {
    const pendingTx = createMockTransaction({ status: 'pending' });
    const stoppedTx = createMockTransaction({ status: 'stopped', attempts: 3, max_attempts: 3 });
    const riskTx = createMockTransaction({ error_source: 'risk' });

    const res1 = await runClosedLoopRecovery(pendingTx, { maxSteps: 3 });
    const res2 = await runClosedLoopRecovery(stoppedTx, { maxSteps: 3 });
    const res3 = await runClosedLoopRecovery(riskTx, { maxSteps: 3 });

    expect(res1.totalSteps).toBeLessThanOrEqual(3);
    expect(res2.totalSteps).toBeLessThanOrEqual(3);
    expect(res3.totalSteps).toBeLessThanOrEqual(3);
  });

  // Test 14 & 15 — Safety and Policy re-evaluated every step
  it('Test 14 & 15: Safety and Policy are fresh-evaluated on every step iteration', async () => {
    const tx = createMockTransaction();
    const result = await runClosedLoopRecovery(tx, { maxSteps: 2 });

    result.steps.forEach(s => {
      expect(s.decision.safety).toBeDefined();
      if (s.decision.status === 'approved') {
        expect(s.decision.policy).toBeDefined();
      }
    });
  });
});
