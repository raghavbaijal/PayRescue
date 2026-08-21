import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { buildRecoveryContext } from '../services/agent/recoveryContext';
import { calculateRecoveryPriority, prioritizeRecoveryCases } from '../services/agent/recoveryPrioritizer';
import { selectRecoveryStrategy } from '../services/agent/strategySelector';
import { runRecoveryAgent } from '../services/agent/agentOrchestrator';
import { evaluateSafety } from '../services/safetyGate';
import { evaluatePolicy } from '../services/policyEngine';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_agent_001',
    customer_name: 'Agent Test Customer',
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

describe('PayRescue Phase 5.2 — Recovery Prioritization & Strategy Selection Tests', () => {
  // Test 1 — High value transaction priority
  it('Test 1: High value transaction receives higher priority score than low value transaction', () => {
    const lowVal = createMockTransaction({ amount_paise: 50000 }); // ₹500
    const highVal = createMockTransaction({ amount_paise: 1000000 }); // ₹10,000

    const lowPriority = calculateRecoveryPriority(buildRecoveryContext(lowVal));
    const highPriority = calculateRecoveryPriority(buildRecoveryContext(highVal));

    expect(highPriority.score).toBeGreaterThan(lowPriority.score);
    expect(highPriority.factors.amountRisk).toBeGreaterThan(lowPriority.factors.amountRisk);
  });

  // Test 2 — Attempt pressure priority
  it('Test 2: Higher attempt utilization increases attempt pressure priority factor', () => {
    const lowPressure = createMockTransaction({ attempts: 1, max_attempts: 5 });
    const highPressure = createMockTransaction({ attempts: 4, max_attempts: 5 });

    const pLow = calculateRecoveryPriority(buildRecoveryContext(lowPressure));
    const pHigh = calculateRecoveryPriority(buildRecoveryContext(highPressure));

    expect(pHigh.score).toBeGreaterThan(pLow.score);
    expect(pHigh.factors.attemptPressure).toBeGreaterThan(pLow.factors.attemptPressure);
  });

  // Test 3 — Failure severity priority
  it('Test 3: Risk and unknown failure categories produce higher severity factors', () => {
    const normalTx = createMockTransaction({ error_reason: 'bank_technical_error' });
    const riskTx = createMockTransaction({ error_source: 'risk', error_reason: 'payment_risk_check_failed' });

    const pNormal = calculateRecoveryPriority(buildRecoveryContext(normalTx));
    const pRisk = calculateRecoveryPriority(buildRecoveryContext(riskTx));

    expect(pRisk.factors.failureSeverity).toBe(25);
    expect(pRisk.factors.failureSeverity).toBeGreaterThan(pNormal.factors.failureSeverity);
  });

  // Test 4 — Retryable strategy
  it('Test 4: Retryable technical failure recommends retry_now or retry_later', () => {
    const tx = createMockTransaction({ error_reason: 'payment_timed_out' });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx);
    const policy = evaluatePolicy(tx);

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'payment_timed_out',
      category: 'retryable',
      confidence: 0.95,
      reasoning: 'Bank timeout.',
      message: 'Retry',
      provider: 'Groq',
      isFallback: false
    }, policy);

    expect(['retry_now', 'retry_later']).toContain(strategy.recommended);
    expect(['retry_now', 'retry_later']).toContain(strategy.final);
  });

  // Test 5 — Insufficient funds strategy
  it('Test 5: Insufficient funds failure recommends promise_to_pay strategy', () => {
    const tx = createMockTransaction({ error_reason: 'insufficient_funds', error_source: 'customer' });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx);
    const policy = evaluatePolicy(tx);

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'insufficient_funds',
      category: 'insufficient_funds',
      confidence: 0.92,
      reasoning: 'Customer balance low.',
      message: 'Promise',
      provider: 'Groq',
      isFallback: false
    }, policy);

    expect(strategy.recommended).toBe('promise_to_pay');
    expect(strategy.final).toBe('promise_to_pay');
  });

  // Test 6 — Invalid payment method strategy
  it('Test 6: Invalid payment method recommends alternate_payment strategy', () => {
    const tx = createMockTransaction({ error_reason: 'card_expired' });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx);
    const policy = evaluatePolicy(tx);

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'card_expired',
      category: 'invalid_payment_method',
      confidence: 0.98,
      reasoning: 'Card expired.',
      message: 'Alternate',
      provider: 'Groq',
      isFallback: false
    }, policy);

    expect(strategy.recommended).toBe('alternate_payment');
    expect(strategy.final).toBe('alternate_payment');
  });

  // Test 7 — Risk failure strategy
  it('Test 7: Risk failure recommends escalate strategy', () => {
    const tx = createMockTransaction({ error_source: 'risk', error_reason: 'payment_risk_check_failed' });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx);

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'risk_trigger',
      category: 'risk_failure',
      confidence: 0.99,
      reasoning: 'Risk check failure.',
      message: 'Escalate',
      provider: 'Groq',
      isFallback: false
    }, null);

    expect(strategy.recommended).toBe('escalate');
    expect(strategy.final).toBe('escalate');
  });

  // Test 8 — Policy override authority
  it('Test 8: Final strategy matches Policy Engine authority when recommendation differs from policy', () => {
    const tx = createMockTransaction({ error_reason: 'payment_timed_out', attempts: 3, max_attempts: 3 });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx); // Safety is blocked
    const policy = evaluatePolicy(tx); // Policy is stopped

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'payment_timed_out',
      category: 'retryable', // AI suggests retryable
      confidence: 0.95,
      reasoning: 'Retryable.',
      message: 'Retry',
      provider: 'Groq',
      isFallback: false
    }, policy);

    expect(strategy.recommended).toBe('retry_now');
    expect(strategy.final).toBe('stop'); // Policy & Safety authority overrides to 'stop'!
    expect(strategy.reasoning).toContain('enforced final strategy');
  });

  // Test 9 — Safety override authority
  it('Test 9: Safety Gate blocked/escalated status overrides AI strategy recommendations', async () => {
    const tx = createMockTransaction({
      attempts: 3,
      max_attempts: 3
    });

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('blocked');
    expect(decision.strategy?.final).toBe('stop');
    expect(decision.recommendedAction).toBe('stopped');
  });

  // Test 10 — Determinism across repeated calls
  it('Test 10: Repeated calls produce identical priority score, level, strategy, and reasoning', () => {
    const tx = createMockTransaction({ amount_paise: 500000, attempts: 2 });
    const context = buildRecoveryContext(tx);

    const p1 = calculateRecoveryPriority(context);
    const p2 = calculateRecoveryPriority(context);

    expect(p1.score).toBe(p2.score);
    expect(p1.level).toBe(p2.level);
    expect(p1.reasoning).toBe(p2.reasoning);
  });

  // Test 11 — Batch ordering
  it('Test 11: prioritizeRecoveryCases orders transactions deterministically by priority score descending', () => {
    const txLow = createMockTransaction({ id: 'tx-low', amount_paise: 50000, attempts: 1 });
    const txMed = createMockTransaction({ id: 'tx-med', amount_paise: 200000, attempts: 2 });
    const txHigh = createMockTransaction({ id: 'tx-high', amount_paise: 1000000, attempts: 3, max_attempts: 4 });

    const prioritized = prioritizeRecoveryCases([txLow, txMed, txHigh]);

    expect(prioritized[0].transaction.id).toBe('tx-high');
    expect(prioritized[0].priority.score).toBeGreaterThanOrEqual(prioritized[1].priority.score);
    expect(prioritized[1].priority.score).toBeGreaterThanOrEqual(prioritized[2].priority.score);
  });

  // Test 12 — No side effects
  it('Test 12: Prioritization and strategy selection do not mutate transaction objects or execute side effects', async () => {
    const tx = createMockTransaction({ status: 'pending', attempts: 1 });
    const txCopy = JSON.parse(JSON.stringify(tx));

    const decision = await runRecoveryAgent(tx);

    // Verify decision object is produced
    expect(decision).toBeDefined();
    expect(decision.priority).toBeDefined();
    expect(decision.strategy).toBeDefined();

    // Verify input transaction was not mutated in any way
    expect(tx).toEqual(txCopy);
    expect(tx.status).toBe('pending');
    expect(tx.attempts).toBe(1);
  });
});
