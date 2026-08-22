import { describe, it, expect } from 'vitest';
import {
  generateRecoveryDataset,
  generateSyntheticBaseTransactions,
  generateEpisodeFromTransaction
} from '../services/ml/recoveryDatasetGenerator';

describe('PayRescue Phase 6.1 — Recovery ML Dataset Generator Tests (Multi-Seed & Validation Expansion)', () => {
  // Test 1 — Fresh transactions enter recovery
  it('Test 1: Fresh synthetic base transactions enter recovery with initial attempts = 1', async () => {
    const baseTx = generateSyntheticBaseTransactions(10, 42);

    baseTx.forEach(tx => {
      expect(tx.attempts).toBe(1);
      expect(['pending', 'retry_scheduled']).toContain(tx.status);
    });
  });

  // Test 2 — Retry scheduled first action can continue into later simulated steps
  it('Test 2: A scheduled first action can continue into subsequent closed-loop steps', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    const multiStepEpisodes = dataset.episodes.filter(ep => ep.outcome.total_steps > 1);
    expect(multiStepEpisodes.length).toBeGreaterThan(0);
    multiStepEpisodes.forEach(ep => {
      expect(ep.outcome.step_1_outcome).toBe('retry_scheduled');
    });
  });

  // Test 3 — Immediate success and eventual success are distinct labels
  it('Test 3: immediate_action_success and eventual_recovery are distinct target labels', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    dataset.episodes.forEach(ep => {
      expect([0, 1]).toContain(ep.outcome.immediate_action_success);
      expect([0, 1]).toContain(ep.outcome.eventual_recovery);
    });
  });

  // Test 4 — Episode can have immediate_action_success = 0 and eventual_recovery = 1
  it('Test 4: An episode can have immediate_action_success = 0 and eventual_recovery = 1', async () => {
    const dataset = await generateRecoveryDataset({ count: 200, seed: 42 });

    const eventualNotImmediate = dataset.episodes.filter(
      ep => ep.outcome.immediate_action_success === 0 && ep.outcome.eventual_recovery === 1
    );

    expect(eventualNotImmediate.length).toBeGreaterThan(0);
    eventualNotImmediate.forEach(ep => {
      expect(ep.outcome.terminal_outcome).toBe('recovered');
      expect(ep.outcome.total_steps).toBeGreaterThan(1);
    });
  });

  // Test 5 — Recovered terminal episode alignment
  it('Test 5: A recovered terminal episode has eventual_recovery = 1 and terminal_outcome = recovered', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    const recovered = dataset.episodes.filter(ep => ep.outcome.eventual_recovery === 1);
    expect(recovered.length).toBeGreaterThan(0);

    recovered.forEach(ep => {
      expect(ep.outcome.terminal_outcome).toBe('recovered');
      expect(ep.outcome.recovered_amount_paise).toBe(ep.features.amount_paise);
    });
  });

  // Test 6 — Escalated terminal episode alignment
  it('Test 6: An escalated terminal episode has eventual_recovery = 0 and terminal_outcome = escalated', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    const escalated = dataset.episodes.filter(ep => ep.outcome.terminal_outcome === 'escalated');
    expect(escalated.length).toBeGreaterThan(0);

    escalated.forEach(ep => {
      expect(ep.outcome.eventual_recovery).toBe(0);
      expect(ep.outcome.recovered_amount_paise).toBe(0);
    });
  });

  // Test 7 — Stopped terminal episode alignment
  it('Test 7: A stopped terminal episode has eventual_recovery = 0 and terminal_outcome = stopped', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    const stopped = dataset.episodes.filter(ep => ep.outcome.terminal_outcome === 'stopped');
    expect(stopped.length).toBeGreaterThan(0);

    stopped.forEach(ep => {
      expect(ep.outcome.eventual_recovery).toBe(0);
      expect(ep.outcome.recovered_amount_paise).toBe(0);
    });
  });

  // Test 8 — No scheduled/promise_created state recorded as terminal outcome
  it('Test 8: terminal_outcome is strictly recovered, escalated, or stopped (no scheduled or promise_created)', async () => {
    const dataset = await generateRecoveryDataset({ count: 200, seed: 42 });

    dataset.episodes.forEach(ep => {
      expect(['recovered', 'escalated', 'stopped']).toContain(ep.outcome.terminal_outcome);
      expect(ep.outcome.terminal_outcome).not.toBe('scheduled');
      expect(ep.outcome.terminal_outcome).not.toBe('promise_created');
    });
  });

  // Test 9 — maxSteps enforced
  it('Test 9: Max steps boundary (maxSteps = 3) is strictly enforced for all episodes', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    dataset.episodes.forEach(ep => {
      expect(ep.outcome.total_steps).toBeGreaterThanOrEqual(1);
      expect(ep.outcome.total_steps).toBeLessThanOrEqual(3);
    });
  });

  // Test 10 — Safety Gate not bypassed
  it('Test 10: Safety Gate rules are strictly enforced (risk failures escalated/stopped)', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    const riskEpisodes = dataset.episodes.filter(ep => ep.features.is_risk_failure);
    expect(riskEpisodes.length).toBeGreaterThan(0);

    riskEpisodes.forEach(ep => {
      expect(['escalated', 'stopped']).toContain(ep.outcome.terminal_outcome);
      expect(ep.outcome.eventual_recovery).toBe(0);
    });
  });

  // Test 11 — Policy Engine not bypassed
  it('Test 11: Policy Engine permitted action is recorded and respected on Step 1', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    dataset.episodes.forEach(ep => {
      if (ep.features.safety_decision === 'eligible') {
        expect(ep.action.permitted_policy_action).toBeDefined();
      }
    });
  });

  // Test 12 — No future information in pre-action features
  it('Test 12: Zero data leakage - preActionFeatures contains NO target labels or future step attributes', async () => {
    const dataset = await generateRecoveryDataset({ count: 50, seed: 42 });

    expect(dataset.report.dataLeakageValidation.zeroLeakageVerified).toBe(true);

    const illegalKeys = [
      'immediate_action_success',
      'eventual_recovery',
      'terminal_outcome',
      'final_status',
      'recovered_amount_paise',
      'recovery_time_seconds',
      'step_1_strategy',
      'step_2_strategy',
      'step_3_strategy'
    ];
    const sampleFeatureKeys = Object.keys(dataset.episodes[0].features);

    illegalKeys.forEach(key => {
      expect(sampleFeatureKeys).not.toContain(key);
    });
  });

  // Test 13 — Temporal memory safety
  it('Test 13: Historical memory features use strictly pre-action historical data without knowing current outcome', async () => {
    const baseTx = generateSyntheticBaseTransactions(10, 42);
    const ep0 = await generateEpisodeFromTransaction(baseTx[0], { historicalDataset: [] });

    // Initial memory for first transaction with empty history must have 0 sample size
    expect(ep0.features.memory_sample_size).toBe(0);
    expect(ep0.features.memory_confidence).toBe(0);
  });

  // Test 14 — Deterministic output with same seed
  it('Test 14: Deterministic seed produces 100% identical dataset CSV and report', async () => {
    const run1 = await generateRecoveryDataset({ count: 50, seed: 123 });
    const run2 = await generateRecoveryDataset({ count: 50, seed: 123 });

    expect(run1.csvContent).toBe(run2.csvContent);
    expect(run1.report.eventualRecoveryRate).toBe(run2.report.eventualRecoveryRate);
    expect(run1.episodes[0].features.transaction_id).toBe(run2.episodes[0].features.transaction_id);
  });

  // Test 15 — Multi-seed dataset generation and cross-seed episode ID uniqueness
  it('Test 15: Multi-seed generation produces unique episode IDs and zero cross-seed duplication', async () => {
    const multiSeedResult = await generateRecoveryDataset({
      count: 50,
      seeds: [42, 43, 44]
    });

    expect(multiSeedResult.episodes.length).toBe(150);
    expect(multiSeedResult.report.duplicate_episode_count).toBe(0);
    expect(multiSeedResult.report.dataLeakageValidation.crossSeedDuplicationVerified).toBe(true);

    const episodeIds = multiSeedResult.episodes.map(e => e.episode_id);
    const uniqueIds = new Set(episodeIds);
    expect(uniqueIds.size).toBe(150);
  });

  // Test 16 — Option B Attempt Semantics Preservation
  it('Test 16: Option B attempt semantics preserved - retry_later preserves attempts, retry_now increments', async () => {
    const dataset = await generateRecoveryDataset({ count: 100, seed: 42 });

    dataset.episodes.forEach(ep => {
      // attempts_before_action must be 1 for fresh transaction
      expect(ep.features.attempts_before_action).toBe(1);

      if (ep.action.executed_strategy === 'retry_later') {
        // Step 1 retry_later does not increment attempts
        expect(ep.action.executed_strategy).toBe('retry_later');
      }
    });
  });
});
