import type { PaymentMethod, ErrorSource } from '../../types';
import type { RecoveryCategory, SafetyDecisionStatus } from '../../types/recovery';
import type { PriorityLevel } from '../agent/agentTypes';

/**
 * Pre-Action Feature Vector interface for inference and training.
 * Contains ONLY variables available strictly before the recovery action is executed.
 */
export interface PreActionFeatureVector {
  amount_paise: number;
  amount_rupees: number;
  payment_method: PaymentMethod | string;
  error_code: string;
  error_reason: string;
  error_source: ErrorSource | string;
  failure_category: RecoveryCategory | string;
  failure_severity: number;
  is_risk_failure: boolean;
  attempts_before_action: number;
  max_attempts: number;
  attempt_ratio: number;
  created_at: string;
  hour_of_day: number;
  day_of_week: number;
  time_since_failure_seconds: number;
  priority_score: number;
  priority_level: PriorityLevel | string;
  ai_diagnosis_category?: string | null;
  ai_confidence?: number | null;
  memory_sample_size: number;
  memory_recovery_rate: number;
  memory_confidence: number;
  safety_decision: SafetyDecisionStatus | string;
}

export interface ProcessingStats {
  mean: number;
  std: number;
}

export interface PreprocessingPipeline {
  featureNames: string[];
  numericFeatures: string[];
  categoricalFeatures: Record<string, string[]>; // Map feature name -> unique category list
  numericStats: Record<string, ProcessingStats>; // Map numeric feature -> mean, std
}

export interface ThresholdMetrics {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ModelEvaluationMetrics {
  roc_auc: number;
  pr_auc: number;
  brier_score: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  threshold_metrics: ThresholdMetrics[];
  confusion_matrix: {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
}

export interface CalibrationReport {
  brier_before: number;
  brier_after: number;
  method: string;
  platt_a: number; // Slope in Sigmoid calibration
  platt_b: number; // Intercept in Sigmoid calibration
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  coefficient?: number;
}

export interface ErrorAnalysisGroup {
  category: string;
  total_cases: number;
  false_positives: number;
  false_negatives: number;
  fp_rate: number;
  fn_rate: number;
}

export interface ModelMetadata {
  model_version: string;
  dataset_version: string;
  feature_schema_version: string;
  model_type: 'logistic_regression' | 'random_forest';
  training_seed: number;
  training_rows: number;
  validation_rows: number;
  test_rows: number;
  feature_count: number;
  target: string;

  train_date_range: { start: string; end: string };
  validation_date_range: { start: string; end: string };
  test_date_range: { start: string; end: string };

  logistic_regression_metrics: ModelEvaluationMetrics;
  random_forest_metrics: ModelEvaluationMetrics;

  selected_best_model: string;
  selected_model_test_metrics: ModelEvaluationMetrics;

  calibration: CalibrationReport;
  top_predictive_features: FeatureImportance[];

  error_analysis: {
    by_failure_category: ErrorAnalysisGroup[];
    by_payment_method: ErrorAnalysisGroup[];
    by_attempts_before_action: ErrorAnalysisGroup[];
    by_priority_level: ErrorAnalysisGroup[];
  };

  created_at: string;
}

export interface FeatureSchema {
  version: string;
  target: string;
  pre_action_features: string[];
  excluded_action_fields: string[];
  excluded_post_action_labels: string[];
  numeric_features: string[];
  categorical_features: string[];
}

export interface PredictionResult {
  probability: number; // P(eventual_recovery = 1 | pre-action features)
  calibrated_probability: number;
  model_version: string;
  model_type: string;
  features_used_count: number;
}
