import { describe, it, expect } from 'vitest';
import { validateAIDiagnosisOutput } from '../services/ai/aiValidator';
import { isConfidenceAboveThreshold } from '../services/ai/aiService';
import { processSingleTransaction } from '../services/recoveryEngine';
import type { Transaction } from '../types';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_ai_001',
    customer_name: 'AI Test Customer',
    customer_contact: '+91 98888 88888',
    amount_paise: 420000,
    method: 'upi',
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

describe('PayRescue Phase 3 — AI Diagnosis Layer & Confidence Gate Tests', () => {
  // Test 1: Valid AI response (retryable + confidence 0.96) -> accepted
  it('Test 1: Valid AI JSON output with confidence >= 0.80 is accepted', () => {
    const rawJson = {
      root_cause: 'temporary_bank_timeout',
      category: 'retryable',
      confidence: 0.96,
      reasoning: 'Temporary network timeout at gateway.',
      message: 'Your payment timed out. Please try again shortly.'
    };

    const validation = validateAIDiagnosisOutput(rawJson);
    expect(validation.isValid).toBe(true);
    expect(validation.data?.category).toBe('retryable');
    expect(validation.data?.confidence).toBe(0.96);
    expect(isConfidenceAboveThreshold(validation.data!.confidence)).toBe(true);
  });

  // Test 2: Low confidence (retryable + confidence 0.62) -> escalated
  it('Test 2: Low confidence score (< 0.80) fails confidence threshold check', () => {
    const rawJson = {
      root_cause: 'ambiguous_network_issue',
      category: 'retryable',
      confidence: 0.62,
      reasoning: 'Insufficient signal to confidently classify failure.',
      message: 'Please contact support.'
    };

    const validation = validateAIDiagnosisOutput(rawJson);
    expect(validation.isValid).toBe(true);
    expect(isConfidenceAboveThreshold(validation.data!.confidence)).toBe(false);
  });

  // Test 3: Invalid category -> rejected -> triggers fallback
  it('Test 3: Invalid category is rejected by schema validator', () => {
    const rawJson = {
      root_cause: 'custom_issue',
      category: 'do_something_invalid',
      confidence: 0.95,
      reasoning: 'Invalid category label.',
      message: 'Error'
    };

    const validation = validateAIDiagnosisOutput(rawJson);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Invalid category');
  });

  // Test 4: Invalid confidence (> 1.0) -> rejected by schema validator
  it('Test 4: Invalid confidence score (> 1.0) is rejected by schema validator', () => {
    const rawJson = {
      root_cause: 'bank_error',
      category: 'retryable',
      confidence: 1.7,
      reasoning: 'Out of bounds confidence.',
      message: 'Error'
    };

    const validation = validateAIDiagnosisOutput(rawJson);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Invalid confidence');
  });

  // Test 5: Malformed JSON -> rejected by validator
  it('Test 5: Malformed non-object JSON is rejected', () => {
    const validation = validateAIDiagnosisOutput('Not a JSON object');
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('not an object');
  });

  // Test 6: Risk Failure Precedence Rule — AI cannot override Safety Gate risk escalation
  it('Test 6: Risk failure is escalated even if AI returns category=retryable and confidence=0.99', async () => {
    const tx = createMockTransaction({
      error_code: 'RISK_CHECK_FAILED',
      error_reason: 'payment_risk_check_failed',
      error_source: 'risk',
      attempts: 1
    });

    const result = await processSingleTransaction(tx);
    expect(result.newStatus).toBe('escalated');
    expect(result.actionTaken).toBe('escalated');
    expect(result.safetyResult.decision).toBe('escalated');
  });

  // Test 7: Max Attempts Precedence Rule — AI cannot override Max Attempts bound
  it('Test 7: Transaction at max attempts is stopped even if AI returns category=retryable and confidence=0.99', async () => {
    const tx = createMockTransaction({
      error_reason: 'payment_timed_out',
      attempts: 3,
      max_attempts: 3
    });

    const result = await processSingleTransaction(tx);
    expect(result.newStatus).toBe('stopped');
    expect(result.actionTaken).toBe('stopped');
    expect(result.safetyResult.decision).toBe('blocked');
  });
});
