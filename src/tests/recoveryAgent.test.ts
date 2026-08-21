import { describe, it, expect, vi } from 'vitest';
import type { Transaction } from '../types';
import { buildRecoveryContext } from '../services/agent/recoveryContext';
import { runRecoveryAgent } from '../services/agent/agentOrchestrator';
import { aiService } from '../services/ai/aiService';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_agent_001',
    customer_name: 'Agent Test Customer',
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

describe('PayRescue Phase 5.1 — Recovery Agent Foundation Tests', () => {
  // Test 1: Valid transaction processing
  it('Test 1: Valid eligible transaction produces approved AgentDecision with diagnosis and policy action', async () => {
    const tx = createMockTransaction({
      error_reason: 'gateway_technical_error',
      attempts: 1
    });

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('approved');
    expect(decision.safety.decision).toBe('eligible');
    expect(decision.diagnosis).toBeDefined();
    expect(decision.diagnosis?.confidence).toBeGreaterThanOrEqual(0.80);
    expect(decision.policy?.action).toBe('retry_scheduled');
    expect(decision.recommendedAction).toBe('retry_scheduled');
  });

  // Test 2: Safety blocked -> AI & Policy NOT called
  it('Test 2: Safety blocked transaction skips AI diagnosis and Policy Engine', async () => {
    const tx = createMockTransaction({
      attempts: 3,
      max_attempts: 3
    });

    const aiSpy = vi.spyOn(aiService, 'diagnoseTransaction');

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('blocked');
    expect(decision.safety.decision).toBe('blocked');
    expect(decision.diagnosis).toBeUndefined();
    expect(decision.policy).toBeUndefined();
    expect(decision.recommendedAction).toBe('stopped');
    expect(aiSpy).not.toHaveBeenCalled();

    aiSpy.mockRestore();
  });

  // Test 3: Risk failure -> Safety escalated immediately
  it('Test 3: Risk failure causes Safety Gate escalation prior to recovery action', async () => {
    const tx = createMockTransaction({
      error_source: 'risk',
      error_reason: 'payment_risk_check_failed',
      error_code: 'RISK_CHECK_FAILED'
    });

    const aiSpy = vi.spyOn(aiService, 'diagnoseTransaction');

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('escalated');
    expect(decision.safety.decision).toBe('escalated');
    expect(decision.diagnosis).toBeUndefined();
    expect(decision.policy).toBeUndefined();
    expect(decision.recommendedAction).toBe('escalated');
    expect(aiSpy).not.toHaveBeenCalled();

    aiSpy.mockRestore();
  });

  // Test 4: Low AI confidence -> Agent escalates
  it('Test 4: AI confidence < 0.80 results in agent escalation and prevents automated action', async () => {
    const tx = createMockTransaction({
      error_reason: 'unknown_custom_failure'
    });

    const aiSpy = vi.spyOn(aiService, 'diagnoseTransaction').mockResolvedValueOnce({
      root_cause: 'unknown_failure',
      category: 'unknown',
      confidence: 0.65, // Below 0.80 threshold
      reasoning: 'Low confidence in error classification.',
      message: 'Payment failure requires review.',
      provider: 'Test Groq',
      isFallback: false
    });

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('escalated');
    expect(decision.diagnosis?.confidence).toBe(0.65);
    expect(decision.policy).toBeUndefined();
    expect(decision.recommendedAction).toBe('escalated');
    expect(decision.reasoning).toContain('AI confidence score below 80% threshold');

    aiSpy.mockRestore();
  });

  // Test 5: Recommended action comes from Policy Engine
  it('Test 5: Recommended action is derived strictly from Policy Engine authority', async () => {
    const tx = createMockTransaction({
      error_reason: 'insufficient_funds',
      error_source: 'customer'
    });

    const decision = await runRecoveryAgent(tx);

    expect(decision.status).toBe('approved');
    expect(decision.policy?.action).toBe('promise_to_pay');
    expect(decision.recommendedAction).toBe('promise_to_pay');
  });

  // Test 6: Context Builder purity and accuracy
  it('Test 6: buildRecoveryContext creates accurate context without mutating transaction', () => {
    const tx = createMockTransaction({
      amount_paise: 750000,
      attempts: 2,
      max_attempts: 3,
      status: 'pending',
      error_reason: 'bank_technical_error'
    });

    const txCopy = { ...tx };
    const context = buildRecoveryContext(tx);

    expect(context.transaction).toBe(tx);
    expect(context.recovery.amountAtRiskPaise).toBe(750000);
    expect(context.recovery.attempts).toBe(2);
    expect(context.recovery.maxAttempts).toBe(3);
    expect(context.recovery.currentStatus).toBe('pending');
    expect(context.failure.reason).toBe('bank_technical_error');

    // Confirm no mutations
    expect(tx).toEqual(txCopy);
  });
});
