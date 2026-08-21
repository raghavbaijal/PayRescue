import { describe, it, expect } from 'vitest';
import { evaluateSafety } from '../services/safetyGate';
import { evaluatePolicy } from '../services/policyEngine';
import type { Transaction } from '../types';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'test-uuid-001',
    razorpay_payment_id: 'pay_test_001',
    customer_name: 'Test Customer',
    customer_contact: '+91 99999 99999',
    amount_paise: 500000,
    method: 'card',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'payment_timed_out',
    error_source: 'gateway',
    attempts: 1,
    max_attempts: 3,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

describe('PayRescue Phase 2 — Pure Safety Gate & Policy Engine Tests', () => {
  // Test 1: payment_timed_out (attempts = 1) -> retry_scheduled
  it('Test 1: payment_timed_out under max attempts returns retry_scheduled', () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 1,
      max_attempts: 3
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('eligible');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('retryable');
    expect(policy.action).toBe('retry_scheduled');
  });

  // Test 2: payment_timed_out (attempts = 3) -> stopped
  it('Test 2: payment_timed_out at max attempts returns stopped', () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 3,
      max_attempts: 3
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.actionIfBlocked).toBe('stopped');

    const policy = evaluatePolicy(tx);
    expect(policy.action).toBe('stopped');
  });

  // Test 3: insufficient_funds -> promise_to_pay
  it('Test 3: insufficient_funds routes to promise_to_pay', () => {
    const tx = createMockTransaction({
      error_code: 'BAD_REQUEST_ERROR',
      error_reason: 'insufficient_funds',
      error_source: 'customer',
      attempts: 1
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('eligible');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('insufficient_funds');
    expect(policy.action).toBe('promise_to_pay');
  });

  // Test 4: card_expired -> alternate_payment
  it('Test 4: card_expired routes to alternate_payment', () => {
    const tx = createMockTransaction({
      error_code: 'BAD_REQUEST_ERROR',
      error_reason: 'card_expired',
      error_source: 'customer',
      attempts: 1
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.actionIfBlocked).toBe('alternate_payment');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('invalid_payment_method');
    expect(policy.action).toBe('alternate_payment');
  });

  // Test 5: payment_risk_check_failed -> escalated
  it('Test 5: payment_risk_check_failed escalates immediately', () => {
    const tx = createMockTransaction({
      error_code: 'RISK_CHECK_FAILED',
      error_reason: 'payment_risk_check_failed',
      error_source: 'risk',
      attempts: 1
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('escalated');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('risk_failure');
    expect(policy.action).toBe('escalated');
  });

  // Test 6: unknown failure -> escalated
  it('Test 6: unknown failure reason escalates to ops', () => {
    const tx = createMockTransaction({
      error_reason: 'unknown_custom_bank_error',
      attempts: 1
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('eligible');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('unknown');
    expect(policy.action).toBe('escalated');
  });

  // Test 7: Already recovered transaction -> must not be processed again
  it('Test 7: already recovered transaction is blocked by safety gate', () => {
    const tx = createMockTransaction({
      status: 'recovered'
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.reason).toContain('already recovered');
  });

  // Test 8: Already escalated transaction -> must not be processed again
  it('Test 8: already escalated transaction is blocked by safety gate', () => {
    const tx = createMockTransaction({
      status: 'escalated'
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('escalated');
    expect(safety.reason).toContain('already escalated');
  });

  // Test 9: authentication_failed (attempts = 1) -> retry_scheduled
  it('Test 9: authentication_failed under max attempts returns retry_scheduled', () => {
    const tx = createMockTransaction({
      error_code: 'BAD_REQUEST_ERROR',
      error_reason: 'authentication_failed',
      attempts: 1,
      max_attempts: 3
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('eligible');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('authentication_failure');
    expect(policy.action).toBe('retry_scheduled');
  });

  // Test 10: authentication_failed (attempts = 3) -> stopped
  it('Test 10: authentication_failed at max attempts returns stopped', () => {
    const tx = createMockTransaction({
      error_code: 'BAD_REQUEST_ERROR',
      error_reason: 'authentication_failed',
      attempts: 3,
      max_attempts: 3
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.actionIfBlocked).toBe('stopped');

    const policy = evaluatePolicy(tx);
    expect(policy.action).toBe('stopped');
  });
});
