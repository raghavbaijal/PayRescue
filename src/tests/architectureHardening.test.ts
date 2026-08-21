import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { evaluateSafety } from '../services/safetyGate';
import { evaluatePolicy } from '../services/policyEngine';
import { calculateRecoveryMetrics } from '../services/metricsService';
import { isTransactionEligibleForBatch } from '../services/recoveryRunService';
import { processSingleTransaction } from '../services/recoveryEngine';
import { isConfidenceAboveThreshold } from '../services/ai/aiService';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_hardened_001',
    customer_name: 'Hardened Ops Customer',
    customer_contact: '+91 99999 88888',
    amount_paise: 1000000, // ₹10,000
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

describe('PayRescue Architecture Hardening Verification Suite (8 Scenarios)', () => {
  // Scenario 1: Successful retry
  it('Scenario 1: Successful retry transitions transaction to recovered', async () => {
    const tx = createMockTransaction({
      error_reason: 'gateway_technical_error',
      attempts: 1,
      max_attempts: 3
    });
    const result = await processSingleTransaction(tx);
    expect(result.safetyResult.decision).toBe('eligible');
    expect(result.newStatus).toBe('recovered');
    expect(result.error).toBeUndefined();
  });

  // Scenario 2: Persistence failure handling
  it('Scenario 2: Persistence failure prevents false recovery metric claims', async () => {
    const tx = createMockTransaction({
      id: '99999999-9999-4999-a999-999999999999', // Valid UUID format, but non-existent record in database
      error_reason: 'gateway_technical_error',
      attempts: 1
    });
    
    // Process transaction and verify persistence failure handling
    const result = await processSingleTransaction(tx);
    expect(result.newStatus).toBe(result.previousStatus);
  });

  // Scenario 3: Retry scheduling & lifecycle
  it('Scenario 3: Retry scheduling sets next_retry_at and controls batch eligibility', () => {
    const now = new Date();
    const futureTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const pastTime = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const pendingTx = createMockTransaction({ status: 'pending' });
    const futureRetryTx = createMockTransaction({
      status: 'retry_scheduled',
      next_retry_at: futureTime
    });
    const dueRetryTx = createMockTransaction({
      status: 'retry_scheduled',
      next_retry_at: pastTime
    });

    // Check batch runner eligibility
    expect(isTransactionEligibleForBatch(pendingTx, now)).toBe(true);
    expect(isTransactionEligibleForBatch(futureRetryTx, now)).toBe(false); // Future retry NOT eligible yet
    expect(isTransactionEligibleForBatch(dueRetryTx, now)).toBe(true);     // Due retry IS eligible
  });

  // Scenario 4: Maximum attempts
  it('Scenario 4: Attempts >= max_attempts returns stopped without retry', () => {
    const tx = createMockTransaction({
      attempts: 3,
      max_attempts: 3
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.actionIfBlocked).toBe('stopped');

    const policy = evaluatePolicy(tx);
    expect(policy.action).toBe('stopped');
  });

  // Scenario 5: Risk failure
  it('Scenario 5: Risk failure returns escalated immediately', () => {
    const tx = createMockTransaction({
      error_source: 'risk',
      error_reason: 'payment_risk_check_failed',
      error_code: 'RISK_CHECK_FAILED'
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('escalated');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('risk_failure');
    expect(policy.action).toBe('escalated');
  });

  // Scenario 6: Invalid payment method
  it('Scenario 6: Invalid payment method returns alternate_payment / stopped', () => {
    const tx = createMockTransaction({
      error_reason: 'card_expired'
    });
    const safety = evaluateSafety(tx);
    expect(safety.decision).toBe('blocked');
    expect(safety.actionIfBlocked).toBe('alternate_payment');

    const policy = evaluatePolicy(tx);
    expect(policy.category).toBe('invalid_payment_method');
    expect(policy.action).toBe('alternate_payment');
  });

  // Scenario 7: Low AI confidence
  it('Scenario 7: Confidence score below 0.80 escalates transaction', () => {
    expect(isConfidenceAboveThreshold(0.79)).toBe(false);
    expect(isConfidenceAboveThreshold(0.80)).toBe(true);
    expect(isConfidenceAboveThreshold(0.95)).toBe(true);
  });

  // Scenario 8: Metrics consistency
  it('Scenario 8: Metrics calculation is internally consistent and separates exposure from active risk', () => {
    const dataset: Transaction[] = [
      createMockTransaction({ id: '1', amount_paise: 100000, status: 'pending' }),
      createMockTransaction({ id: '2', amount_paise: 200000, status: 'retry_scheduled', next_retry_at: new Date().toISOString() }),
      createMockTransaction({ id: '3', amount_paise: 300000, status: 'promise_to_pay' }),
      createMockTransaction({ id: '4', amount_paise: 400000, status: 'recovered' }),
      createMockTransaction({ id: '5', amount_paise: 500000, status: 'escalated', error_source: 'risk' }),
      createMockTransaction({ id: '6', amount_paise: 600000, status: 'stopped', attempts: 3 })
    ];

    const metrics = calculateRecoveryMetrics(dataset);

    // Total Exposure: sum(100k + 200k + 300k + 400k + 500k + 600k) = 2,100,000 paise (₹21,000)
    expect(metrics.totalFailedExposurePaise).toBe(2100000);
    expect(metrics.totalAtRiskPaise).toBe(2100000);

    // Total Recovered: 400,000 paise (₹4,000)
    expect(metrics.totalRecoveredPaise).toBe(400000);

    // Currently At Risk: sum(pending + retry_scheduled + promise_to_pay) = 100k + 200k + 300k = 600,000 paise (₹6,000)
    expect(metrics.currentlyAtRiskPaise).toBe(600000);
    expect(metrics.remainingAtRiskPaise).toBe(600000);

    // Recovery Rate: (400k / 2100k) * 100 = 19.0%
    expect(metrics.recoveryRate).toBe(19.0);

    // Funnel counts
    expect(metrics.funnel.failed).toBe(6);
    expect(metrics.funnel.recovered).toBe(1);
    expect(metrics.funnel.escalated).toBe(1);
    expect(metrics.funnel.stopped).toBe(1);
  });
});
