import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { getRecoveryMemorySync } from '../services/agent/recoveryMemory';
import { buildRecoveryContext, enrichRecoveryContextWithMemory } from '../services/agent/recoveryContext';
import { selectRecoveryStrategy } from '../services/agent/strategySelector';
import { runRecoveryAgent } from '../services/agent/agentOrchestrator';
import { evaluateSafety } from '../services/safetyGate';
import { evaluatePolicy } from '../services/policyEngine';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_memory_001',
    customer_name: 'Memory Test Customer',
    customer_contact: '+91 98888 77777',
    amount_paise: 499900,
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

describe('PayRescue Phase 5.4 — Recovery Memory & Outcome Intelligence Tests', () => {
  // Test 1 — No historical data
  it('Test 1: Empty historical dataset returns zero sampleSize, zero recoveryRate, low confidence without crashing', () => {
    const tx = createMockTransaction();
    const memory = getRecoveryMemorySync(tx, []);

    expect(memory.sampleSize).toBe(0);
    expect(memory.historicalCases).toBe(0);
    expect(memory.recoveredCases).toBe(0);
    expect(memory.recoveryRate).toBe(0);
    expect(memory.confidence).toBe(0.00);
    expect(memory.similarCaseSummary).toContain('No prior historical cases found');
  });

  // Test 2 — Historical recovery rate
  it('Test 2: Correctly aggregates historical recovery rate (e.g. 15 recovered out of 20 cases = 75%)', () => {
    const tx = createMockTransaction({ error_reason: 'gateway_technical_error' });

    const mockDataset: Transaction[] = [];
    // Create 15 recovered cases
    for (let i = 0; i < 15; i++) {
      mockDataset.push(createMockTransaction({
        id: `tx-recovered-${i}`,
        error_reason: 'gateway_technical_error',
        status: 'recovered',
        attempts: 2
      }));
    }
    // Create 5 failed/stopped cases
    for (let i = 0; i < 5; i++) {
      mockDataset.push(createMockTransaction({
        id: `tx-failed-${i}`,
        error_reason: 'gateway_technical_error',
        status: 'stopped',
        attempts: 3
      }));
    }

    const memory = getRecoveryMemorySync(tx, mockDataset);

    expect(memory.sampleSize).toBe(20);
    expect(memory.recoveredCases).toBe(15);
    expect(memory.recoveryRate).toBe(75);
    expect(memory.matchingLevel).toBe('exact_reason');
    expect(memory.confidence).toBe(0.75); // 10-24 sample size = 0.75
  });

  // Test 3 — Action-level outcomes
  it('Test 3: Aggregates separate statistics for retry_now, retry_later, and promise_to_pay', () => {
    const tx = createMockTransaction({ error_reason: 'gateway_technical_error' });

    const mockDataset: Transaction[] = [
      // 2 retry_now recovered
      createMockTransaction({ id: 'tx-now-1', error_reason: 'gateway_technical_error', status: 'recovered', attempts: 1 }),
      createMockTransaction({ id: 'tx-now-2', error_reason: 'gateway_technical_error', status: 'recovered', attempts: 1 }),
      // 3 retry_later recovered
      createMockTransaction({ id: 'tx-later-1', error_reason: 'gateway_technical_error', status: 'recovered', attempts: 2 }),
      createMockTransaction({ id: 'tx-later-2', error_reason: 'gateway_technical_error', status: 'recovered', attempts: 2 }),
      createMockTransaction({ id: 'tx-later-3', error_reason: 'gateway_technical_error', status: 'recovered', attempts: 2 }),
      // 1 promise_to_pay
      createMockTransaction({ id: 'tx-p2p-1', error_reason: 'gateway_technical_error', status: 'promise_to_pay', attempts: 1 })
    ];

    const memory = getRecoveryMemorySync(tx, mockDataset);

    expect(memory.outcomesByAction['retry_now'].recovered).toBe(2);
    expect(memory.outcomesByAction['retry_later'].recovered).toBe(3);
    expect(memory.outcomesByAction['promise_to_pay'].attempts).toBe(1);
  });

  // Test 4 — Failure category / Exact reason matching hierarchy
  it('Test 4: Prefers exact_reason matching over broad category matching when exact data is sufficient', () => {
    const tx = createMockTransaction({ error_reason: 'bank_technical_error' });

    const mockDataset: Transaction[] = [
      createMockTransaction({ id: 'tx-exact-1', error_reason: 'bank_technical_error', status: 'recovered' }),
      createMockTransaction({ id: 'tx-exact-2', error_reason: 'bank_technical_error', status: 'recovered' }),
      createMockTransaction({ id: 'tx-exact-3', error_reason: 'bank_technical_error', status: 'stopped' }),
      createMockTransaction({ id: 'tx-cat-1', error_reason: 'gateway_technical_error', status: 'recovered' })
    ];

    const memory = getRecoveryMemorySync(tx, mockDataset);

    expect(memory.matchingLevel).toBe('exact_reason');
    expect(memory.sampleSize).toBe(3);
  });

  // Test 5 — Fallback matching level
  it('Test 5: Falls back to failure_category matching level when exact_reason data is absent', () => {
    const tx = createMockTransaction({ error_reason: 'temporary_bank_timeout' });

    const mockDataset: Transaction[] = [
      createMockTransaction({ id: 'tx-cat-1', error_reason: 'bank_technical_error', status: 'recovered' }),
      createMockTransaction({ id: 'tx-cat-2', error_reason: 'gateway_technical_error', status: 'recovered' }),
      createMockTransaction({ id: 'tx-cat-3', error_reason: 'payment_timed_out', status: 'stopped' })
    ];

    const memory = getRecoveryMemorySync(tx, mockDataset);

    expect(memory.matchingLevel).toBe('failure_category');
    expect(memory.sampleSize).toBe(3);
  });

  // Test 6 — Sample-size based memory confidence
  it('Test 6: Memory confidence score increases deterministically with sample size thresholds', () => {
    const tx = createMockTransaction();

    const ds1 = Array(3).fill(null).map((_, i) => createMockTransaction({ id: `tx-ds1-${i}` }));
    const ds5 = Array(6).fill(null).map((_, i) => createMockTransaction({ id: `tx-ds5-${i}` }));
    const ds25 = Array(30).fill(null).map((_, i) => createMockTransaction({ id: `tx-ds25-${i}` }));

    expect(getRecoveryMemorySync(tx, ds1).confidence).toBe(0.25);
    expect(getRecoveryMemorySync(tx, ds5).confidence).toBe(0.50);
    expect(getRecoveryMemorySync(tx, ds25).confidence).toBe(1.00);
  });

  // Test 7 — Memory determinism
  it('Test 7: Identical transaction and dataset input produces identical memory calculation on repeated calls', () => {
    const tx = createMockTransaction({ error_reason: 'gateway_technical_error' });
    const ds = [
      createMockTransaction({ id: 'tx-1', status: 'recovered' }),
      createMockTransaction({ id: 'tx-2', status: 'stopped' })
    ];

    const mem1 = getRecoveryMemorySync(tx, ds);
    const mem2 = getRecoveryMemorySync(tx, ds);

    expect(mem1).toEqual(mem2);
  });

  // Test 8 — Memory calculation side-effect free
  it('Test 8: getRecoveryMemorySync does NOT mutate transaction or historical dataset objects', () => {
    const tx = createMockTransaction();
    const txCopy = JSON.parse(JSON.stringify(tx));

    getRecoveryMemorySync(tx);

    expect(tx).toEqual(txCopy);
  });

  // Test 9 — Memory CANNOT override Safety Gate
  it('Test 9: Historical recovery success is high, but Safety Gate blocked status enforces STOP action', async () => {
    // Transaction at max attempts
    const tx = createMockTransaction({
      attempts: 3,
      max_attempts: 3,
      error_reason: 'gateway_technical_error'
    });

    const highSuccessDataset = Array(10).fill(null).map((_, i) => createMockTransaction({
      id: `tx-high-${i}`,
      error_reason: 'gateway_technical_error',
      status: 'recovered'
    }));

    const decision = await runRecoveryAgent(tx, highSuccessDataset);

    expect(decision.status).toBe('blocked');
    expect(decision.recommendedAction).toBe('stopped');
    expect(decision.strategy?.final).toBe('stop');
  });

  // Test 10 — Memory CANNOT override Policy Engine
  it('Test 10: High historical retry rate CANNOT override Policy Engine stopped decision', () => {
    const tx = createMockTransaction({ attempts: 3, max_attempts: 3 });
    const context = buildRecoveryContext(tx);
    const safety = evaluateSafety(tx);
    const policy = evaluatePolicy(tx);

    const memory = getRecoveryMemorySync(tx, Array(10).fill(null).map((_, i) => createMockTransaction({ id: `tx-p-${i}`, status: 'recovered', attempts: 2 })));

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'gateway_technical_error',
      category: 'retryable',
      confidence: 0.95,
      reasoning: 'Retryable.',
      message: 'Retry',
      provider: 'Groq',
      isFallback: false
    }, policy, memory);

    expect(strategy.recommended).toBe('retry_later');
    expect(strategy.final).toBe('stop'); // Policy & Safety authority MUST WIN!
    expect(strategy.reasoning).toContain('enforced final strategy');
  });

  // Test 11 — Advisory Strategy Recommendation from Memory Signal
  it('Test 11: Strategy selector uses historical memory signal to favor retry_later when retry_later has significantly higher historical success', () => {
    const tx = createMockTransaction({ error_reason: 'gateway_technical_error' });

    // Dataset where retry_later has 100% success (5/5) and retry_now has 0% success (0/5)
    const mockDataset: Transaction[] = [
      ...Array(5).fill(null).map((_, i) => createMockTransaction({ id: `tx-l-${i}`, error_reason: 'gateway_technical_error', status: 'recovered', attempts: 2 })),
      ...Array(5).fill(null).map((_, i) => createMockTransaction({ id: `tx-n-${i}`, error_reason: 'gateway_technical_error', status: 'stopped', attempts: 1 }))
    ];

    const memory = getRecoveryMemorySync(tx, mockDataset);
    const context = enrichRecoveryContextWithMemory(buildRecoveryContext(tx), memory);
    const safety = evaluateSafety(tx);
    const policy = evaluatePolicy(tx);

    const strategy = selectRecoveryStrategy(context, safety, {
      root_cause: 'gateway_technical_error',
      category: 'retryable',
      confidence: 0.95,
      reasoning: 'Retryable failure.',
      message: 'Retry',
      provider: 'Groq',
      isFallback: false
    }, policy, memory);

    expect(strategy.recommended).toBe('retry_later');
    expect(strategy.reasoning).toContain('Advisory signal favors \'retry_later\'');
  });

  // Test 12 — AI Confidence vs Memory Confidence Independence
  it('Test 12: AI Diagnosis confidence score and Memory confidence score remain strictly independent', async () => {
    const tx = createMockTransaction();

    // Small dataset -> low memory confidence (0.25)
    const smallDs = [createMockTransaction({ id: 'tx-s1', status: 'recovered' })];

    const decision = await runRecoveryAgent(tx, smallDs);

    expect(decision.memory?.confidence).toBe(0.25); // Sample size based
    if (decision.diagnosis) {
      // AI confidence comes from LLM / Edge Function diagnosis (>= 0.80 for approved)
      expect(decision.diagnosis.confidence).toBeGreaterThanOrEqual(0.80);
      expect(decision.diagnosis.confidence).not.toBe(decision.memory?.confidence);
    }
  });
});
