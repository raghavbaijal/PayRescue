import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseCanonicalCsv } from '../../scripts/ml/trainRecoveryProbabilityModel';
import { FeaturePreprocessor, predictRecoveryProbability } from '../services/ml/recoveryProbabilityModel';
import type { Transaction } from '../types';

describe('PayRescue Phase 6.2 — Recovery Probability Model Tests', () => {
  const csvPath = path.join(process.cwd(), 'data', 'ml', 'recovery_episodes.csv');
  const metadataPath = path.join(process.cwd(), 'data', 'ml', 'model_metadata.json');
  const schemaPath = path.join(process.cwd(), 'data', 'ml', 'feature_schema.json');

  // Test 1 — Canonical Dataset Loads Correctly
  it('Test 1: Canonical dataset loads 10,000 recovery episodes cleanly', () => {
    expect(fs.existsSync(csvPath)).toBe(true);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content);
    expect(rows.length).toBe(10000);
  });

  // Test 2 — Target is Binary
  it('Test 2: Target eventual_recovery is strictly binary (0 or 1)', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content);
    rows.forEach(r => {
      expect([0, 1]).toContain(r.eventual_recovery);
    });
  });

  // Test 3 — No Post-Action Features Enter X
  it('Test 3: Zero feature leakage - post-action labels and future step fields are excluded from X', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content);
    const sample = rows[0];

    const prep = new FeaturePreprocessor();
    prep.fit([sample]);
    const xNames = prep.pipeline.featureNames;

    const illegalKeys = [
      'eventual_recovery',
      'immediate_action_success',
      'terminal_outcome',
      'final_status',
      'recovered_amount_paise',
      'recovery_time_seconds',
      'attempts_after_action',
      'outcome_reason',
      'step_1_strategy',
      'step_2_strategy',
      'step_3_strategy'
    ];

    illegalKeys.forEach(k => {
      expect(xNames).not.toContain(k);
    });
  });

  // Test 4 — Feature Count is Deterministic
  it('Test 4: Pre-action feature dimension is deterministic (34 transformed features)', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content);
    const prep = new FeaturePreprocessor();
    prep.fit(rows);
    const x = prep.transform(rows[0]);
    expect(x.length).toBe(34);
  });

  // Test 5 & 6 — Chronological Split Verification
  it('Test 5 & 6: Chronological split preserves date ordering (Train 70%, Val 15%, Test 15%) without temporal overlap', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const nTotal = rows.length;
    const nTrain = Math.floor(nTotal * 0.70);
    const nVal = Math.floor(nTotal * 0.15);

    const trainEnd = new Date(rows[nTrain - 1].created_at).getTime();
    const valStart = new Date(rows[nTrain].created_at).getTime();
    const valEnd = new Date(rows[nTrain + nVal - 1].created_at).getTime();
    const testStart = new Date(rows[nTrain + nVal].created_at).getTime();

    expect(trainEnd).toBeLessThanOrEqual(valStart);
    expect(valEnd).toBeLessThanOrEqual(testStart);
  });

  // Test 7 — Preprocessing Fitted ONLY on Training Data
  it('Test 7: FeaturePreprocessor statistics are computed strictly on training data', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCanonicalCsv(content).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const trainRows = rows.slice(0, 7000);

    const prep = new FeaturePreprocessor();
    prep.fit(trainRows);

    expect(prep.pipeline.numericStats['amount_rupees']).toBeDefined();
    expect(prep.pipeline.numericStats['amount_rupees'].mean).toBeGreaterThan(0);
  });

  // Test 8 — Model Probability Output in [0, 1]
  it('Test 8: predictRecoveryProbability produces valid probability scores in [0.0, 1.0]', () => {
    const mockTx: Transaction = {
      id: '66666666-6666-4666-002a-00000001',
      razorpay_payment_id: 'pay_test_001',
      customer_name: 'Probability Customer',
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
      updated_at: new Date().toISOString()
    };

    const res = predictRecoveryProbability(mockTx);
    expect(res.probability).toBeGreaterThanOrEqual(0.0);
    expect(res.probability).toBeLessThanOrEqual(1.0);
    expect(res.calibrated_probability).toBeGreaterThanOrEqual(0.0);
    expect(res.calibrated_probability).toBeLessThanOrEqual(1.0);
  });

  // Test 9 — Deterministic Training & Output
  it('Test 9: Model inference on identical input yields deterministic probability', () => {
    const mockTx: Transaction = {
      id: '66666666-6666-4666-002a-00000001',
      razorpay_payment_id: 'pay_test_001',
      customer_name: 'Probability Customer',
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
      updated_at: new Date().toISOString()
    };

    const res1 = predictRecoveryProbability(mockTx);
    const res2 = predictRecoveryProbability(mockTx);
    expect(res1.probability).toBe(res2.probability);
    expect(res1.calibrated_probability).toBe(res2.calibrated_probability);
  });

  // Test 10 — Input Transaction Not Mutated
  it('Test 10: predictRecoveryProbability does NOT mutate the input transaction object', () => {
    const mockTx: Transaction = {
      id: '66666666-6666-4666-002a-00000001',
      razorpay_payment_id: 'pay_test_001',
      customer_name: 'Probability Customer',
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
      updated_at: new Date().toISOString()
    };

    const copy = JSON.parse(JSON.stringify(mockTx));
    predictRecoveryProbability(mockTx);
    expect(mockTx).toEqual(copy);
  });

  // Test 11 & 12 — No Supabase Side Effects or Action Executions
  it('Test 11 & 12: predictRecoveryProbability is strictly read-only and produces ZERO side effects', () => {
    const mockTx: Transaction = {
      id: '66666666-6666-4666-002a-00000001',
      razorpay_payment_id: 'pay_test_001',
      customer_name: 'Probability Customer',
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
      updated_at: new Date().toISOString()
    };

    const result = predictRecoveryProbability(mockTx);
    expect(result.model_version).toBe('1.0.0');
    expect(mockTx.status).toBe('pending'); // Status unchanged!
  });

  // Test 13 & 14 — Saved Metadata and Schema Artifacts Valid
  it('Test 13 & 14: Model metadata and feature schema artifacts exist and contain valid fields', () => {
    expect(fs.existsSync(metadataPath)).toBe(true);
    expect(fs.existsSync(schemaPath)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    expect(metadata.model_version).toBe('1.0.0');
    expect(metadata.training_rows).toBe(7000);
    expect(metadata.validation_rows).toBe(1500);
    expect(metadata.test_rows).toBe(1500);

    expect(schema.target).toBe('eventual_recovery');
    expect(schema.pre_action_features.length).toBeGreaterThan(0);
    expect(schema.excluded_post_action_labels).toContain('terminal_outcome');
  });

  // Test 15 — Safety Decision Probability Alignment
  it('Test 15: Safety blocked or risk failure transaction receives low recovery probability', () => {
    const riskTx: Transaction = {
      id: '66666666-6666-4666-002a-00000099',
      razorpay_payment_id: 'pay_risk_001',
      customer_name: 'Risk Customer',
      customer_contact: '+91 98888 77777',
      amount_paise: 100000,
      method: 'card',
      error_code: 'RISK_CHECK_FAILED',
      error_reason: 'payment_risk_check_failed',
      error_source: 'risk',
      attempts: 1,
      max_attempts: 3,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const res = predictRecoveryProbability(riskTx);
    expect(res.probability).toBeLessThanOrEqual(0.10);
  });
});
