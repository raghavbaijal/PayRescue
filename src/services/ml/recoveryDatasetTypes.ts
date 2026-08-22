import type { PaymentMethod, ErrorSource, TransactionStatus, Transaction } from '../../types';
import type { RecoveryCategory, RecoveryAction, SafetyDecisionStatus } from '../../types/recovery';
import type { PriorityLevel, RecoveryStrategy } from '../agent/agentTypes';

/**
 * Pre-Action Feature Vector.
 * Contains ALL metadata, contextual variables, attempt stats, and signals
 * available strictly BEFORE the recovery action is executed.
 * 
 * DATA LEAKAGE PROTECTION: Post-action labels (eventual_recovery, terminal_outcome, etc.)
 * MUST NOT exist in this interface.
 */
export interface RecoveryEpisodeFeatures {
  // Transaction Identification & Parameters
  transaction_id: string;
  amount_paise: number;
  amount_rupees: number;
  payment_method: PaymentMethod;
  error_code: string;
  error_reason: string;
  error_source: ErrorSource;

  // Failure & Risk Classification (Pre-action)
  failure_category: RecoveryCategory;
  failure_severity: number; // 0 - 25
  is_risk_failure: boolean;

  // Attempt Pressure & Bounds (Pre-action)
  attempts_before_action: number;
  max_attempts: number;
  attempt_ratio: number; // (attempts_before_action / max_attempts)

  // Temporal Features (Pre-action)
  created_at: string;
  hour_of_day: number; // 0 - 23
  day_of_week: number; // 0 (Sun) - 6 (Sat)
  time_since_failure_seconds: number;

  // Agent Context & Prioritization (Pre-action)
  priority_score: number; // 0 - 100
  priority_level: PriorityLevel;
  
  // Pre-Action AI Intelligence (available before action execution)
  ai_diagnosis_category: RecoveryCategory | null;
  ai_confidence: number | null; // 0.0 - 1.0

  // Historical Recovery Memory (Temporal-Safe: available before action execution)
  memory_sample_size: number;
  memory_recovery_rate: number; // 0 - 100 %
  memory_confidence: number; // 0.0 - 1.0

  // Pre-action Safety Gate Decision
  safety_decision: SafetyDecisionStatus;
  safety_reason: string;
}

/**
 * Action executed by the agent / policy engine on Step 1 of the episode.
 */
export interface RecoveryEpisodeAction {
  recommended_strategy: RecoveryStrategy;
  executed_strategy: RecoveryStrategy;
  permitted_policy_action: RecoveryAction | null;
  strategy_reasoning: string;
}

/**
 * Post-Action Outcome Labels & Episode Trajectory Summary.
 * Target variables generated strictly AFTER closed-loop execution simulation.
 * 
 * WARNING: None of these fields may be used as feature inputs during model training!
 */
export interface RecoveryEpisodeOutcome {
  // Target Labels
  immediate_action_success: 0 | 1;
  eventual_recovery: 0 | 1;
  terminal_outcome: 'recovered' | 'escalated' | 'stopped';
  
  // Trajectory Summary
  total_steps: number;
  step_1_strategy: RecoveryStrategy;
  step_2_strategy: RecoveryStrategy | null;
  step_3_strategy: RecoveryStrategy | null;
  step_1_outcome: string;
  step_2_outcome: string | null;
  step_3_outcome: string | null;

  // Post-Execution Metadata
  final_status: TransactionStatus;
  recovered_amount_paise: number;
  recovery_time_seconds: number | null; // Null if not recovered
  attempts_after_action: number;
  outcome_reason: string;
}

/**
 * Full Recovery Episode Record.
 * One row = ONE complete bounded recovery lifecycle episode.
 */
export interface RecoveryEpisode {
  episode_id: string;
  features: RecoveryEpisodeFeatures;
  action: RecoveryEpisodeAction;
  outcome: RecoveryEpisodeOutcome;
  timestamp: string;
}

/**
 * Configuration options for generating synthetic recovery ML datasets.
 */
export interface DatasetGeneratorOptions {
  count?: number; // Number of episodes per seed (default: 1000)
  seed?: number; // Primary seed (default: 42)
  seeds?: number[]; // Array of deterministic seeds for multi-seed dataset expansion
  includeAiFeatures?: boolean; // Whether to include AI diagnosis features (default: false)
  historicalDataset?: Transaction[]; // Optional pre-existing historical dataset for memory initialization
  outputPath?: string; // Target CSV output path (e.g., 'data/ml/recovery_episodes.csv')
  reportPath?: string; // Target JSON quality report output path (e.g., 'data/ml/recovery_dataset_quality.json')
}

/**
 * Quality & Distribution Summary Report for generated ML dataset.
 */
export interface DatasetQualityReport {
  dataset_version: string;
  generator_version: string;
  seeds: number[];
  totalEpisodes: number;
  generatedAt: string;

  positive_count: number;
  negative_count: number;
  eventualRecoveryRate: number; // percentage (0 - 100)

  immediate_success_count: number;
  immediateActionSuccessRate: number; // percentage (0 - 100)

  terminalOutcomeDistribution: {
    recovered: number;
    escalated: number;
    stopped: number;
  };

  firstStrategyDistribution: Record<string, number>;
  failureCategoryDistribution: Record<string, number>;
  errorReasonDistribution: Record<string, number>;
  paymentMethodDistribution: Record<string, number>;
  attempts_before_action_distribution: Record<string, number>;
  total_steps_distribution: Record<string, number>;

  totalSteps: number;
  averageStepsPerEpisode: number;
  maxStepsObserved: number;

  totalAttemptedAmountRupees: number;
  totalRecoveredAmountRupees: number;
  amount_statistics: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };

  simulator_execution_count: number;
  simulator_success_count: number;
  simulator_success_rate: number;

  missing_value_counts: number;
  duplicate_episode_count: number;

  dataLeakageValidation: {
    preActionFeatureCount: number;
    postActionLabelCount: number;
    zeroLeakageVerified: boolean;
    temporalLeakageVerified: boolean;
    crossSeedDuplicationVerified: boolean;
  };
}
