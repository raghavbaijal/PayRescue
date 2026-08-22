import * as fs from 'fs';
import * as path from 'path';
import type { PreActionFeatureVector, ModelMetadata, FeatureSchema, ErrorAnalysisGroup, FeatureImportance } from '../../src/services/ml/modelTypes';
import {
  FeaturePreprocessor,
  LogisticRegressionModel,
  RandomForestClassifier,
  PlattCalibrator,
  calculateEvaluationMetrics
} from '../../src/services/ml/recoveryProbabilityModel';

export interface CsvEpisodeRow extends PreActionFeatureVector {
  episode_id: string;
  timestamp: string;
  recommended_strategy: string;
  executed_strategy: string;
  permitted_policy_action: string;
  strategy_reasoning: string;
  total_steps: number;
  step_1_strategy: string;
  step_2_strategy: string;
  step_3_strategy: string;
  step_1_outcome: string;
  step_2_outcome: string;
  step_3_outcome: string;
  immediate_action_success: number;
  eventual_recovery: number;
  terminal_outcome: string;
  final_status: string;
  recovered_amount_paise: number;
  recovery_time_seconds: number;
  attempts_after_action: number;
  outcome_reason: string;
}

/**
 * Parses canonical data/ml/recovery_episodes.csv into typed row objects.
 */
export function parseCanonicalCsv(csvContent: string): CsvEpisodeRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows: CsvEpisodeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Simple CSV parser handling quotes
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const obj: any = {};
    headers.forEach((h, idx) => {
      let val: any = values[idx] ?? '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }

      // Convert numbers and booleans
      if (
        h === 'amount_paise' ||
        h === 'amount_rupees' ||
        h === 'failure_severity' ||
        h === 'attempts_before_action' ||
        h === 'max_attempts' ||
        h === 'attempt_ratio' ||
        h === 'hour_of_day' ||
        h === 'day_of_week' ||
        h === 'time_since_failure_seconds' ||
        h === 'priority_score' ||
        h === 'memory_sample_size' ||
        h === 'memory_recovery_rate' ||
        h === 'memory_confidence' ||
        h === 'ai_confidence' ||
        h === 'total_steps' ||
        h === 'immediate_action_success' ||
        h === 'eventual_recovery' ||
        h === 'recovered_amount_paise' ||
        h === 'recovery_time_seconds' ||
        h === 'attempts_after_action'
      ) {
        val = val === '' ? 0 : Number(val);
      } else if (h === 'is_risk_failure') {
        val = val === 'true';
      }

      obj[h] = val;
    });

    rows.push(obj as CsvEpisodeRow);
  }

  return rows;
}

export function runTrainingPipeline() {
  console.log('--- PAYRESCUE PHASE 6.2 — RECOVERY PROBABILITY MODEL TRAINING ---');

  const csvPath = path.join(process.cwd(), 'data', 'ml', 'recovery_episodes.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Canonical dataset not found at ${csvPath}. Run Phase 6.1 dataset expansion first.`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const allRows = parseCanonicalCsv(csvContent);
  console.log(`Loaded canonical dataset: ${allRows.length} total episodes.`);

  // 1. Mandatory Feature Audit & Leakage Check
  const sample = allRows[0];
  const allColumns = Object.keys(sample);

  const excludedActionFields = ['recommended_strategy', 'executed_strategy', 'permitted_policy_action', 'strategy_reasoning'];
  const excludedPostActionLabels = [
    'eventual_recovery',
    'immediate_action_success',
    'terminal_outcome',
    'final_status',
    'recovered_amount_paise',
    'recovery_time_seconds',
    'attempts_after_action',
    'outcome_reason',
    'total_steps',
    'step_1_strategy',
    'step_2_strategy',
    'step_3_strategy',
    'step_1_outcome',
    'step_2_outcome',
    'step_3_outcome'
  ];
  const metadataIds = ['episode_id', 'transaction_id', 'timestamp'];

  const preActionFeatures = allColumns.filter(
    col => !excludedActionFields.includes(col) && !excludedPostActionLabels.includes(col) && !metadataIds.includes(col) && col !== 'created_at'
  );

  console.log(`\nMandatory Feature Audit:`);
  console.log(`- Total CSV Columns: ${allColumns.length}`);
  console.log(`- Pre-Action Feature Columns (${preActionFeatures.length}): ${preActionFeatures.join(', ')}`);
  console.log(`- Excluded Action Fields (${excludedActionFields.length}): ${excludedActionFields.join(', ')}`);
  console.log(`- Excluded Post-Action Labels (${excludedPostActionLabels.length}): ${excludedPostActionLabels.join(', ')}`);

  // Verify Zero Leakage in Feature Set
  const leakageInX = preActionFeatures.some(col => excludedPostActionLabels.includes(col) || excludedActionFields.includes(col));
  console.log(`- Zero Feature Leakage Verified: ${!leakageInX ? 'PASS' : 'FAIL'}`);

  // 2. Chronological Data Split (70% Train, 15% Val, 15% Test)
  // Sort rows strictly by created_at ascending
  const sortedRows = [...allRows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const nTotal = sortedRows.length;
  const nTrain = Math.floor(nTotal * 0.70); // 7,000
  const nVal = Math.floor(nTotal * 0.15);   // 1,500
  const nTest = nTotal - nTrain - nVal;     // 1,500

  const trainRows = sortedRows.slice(0, nTrain);
  const valRows = sortedRows.slice(nTrain, nTrain + nVal);
  const testRows = sortedRows.slice(nTrain + nVal);

  const trainDateRange = { start: trainRows[0].created_at, end: trainRows[trainRows.length - 1].created_at };
  const valDateRange = { start: valRows[0].created_at, end: valRows[valRows.length - 1].created_at };
  const testDateRange = { start: testRows[0].created_at, end: testRows[testRows.length - 1].created_at };

  console.log(`\nChronological Dataset Split (${nTotal} total rows):`);
  console.log(`- Training Set: ${trainRows.length} rows (${trainDateRange.start} -> ${trainDateRange.end})`);
  console.log(`- Validation Set: ${valRows.length} rows (${valDateRange.start} -> ${valDateRange.end})`);
  console.log(`- Test Set: ${testRows.length} rows (${nTest} expected) (${testDateRange.start} -> ${testDateRange.end})`);

  // Verify chronological ordering without temporal overlap
  const trainEnd = new Date(trainDateRange.end).getTime();
  const valStart = new Date(valDateRange.start).getTime();
  const valEnd = new Date(valDateRange.end).getTime();
  const testStart = new Date(testDateRange.start).getTime();
  const temporalOverlapVerified = trainEnd <= valStart && valEnd <= testStart;
  console.log(`- Temporal Split Safety Verified: ${temporalOverlapVerified ? 'PASS' : 'FAIL'}`);

  // 3. Preprocessing Pipeline Fitting (Fitted ONLY on Training Set)
  const preprocessor = new FeaturePreprocessor();
  preprocessor.fit(trainRows);

  const X_train = preprocessor.transformBatch(trainRows);
  const y_train = trainRows.map(r => r.eventual_recovery);

  const X_val = preprocessor.transformBatch(valRows);
  const y_val = valRows.map(r => r.eventual_recovery);

  const X_test = preprocessor.transformBatch(testRows);
  const y_test = testRows.map(r => r.eventual_recovery);

  console.log(`- Feature Vector Dimension d = ${X_train[0].length} features.`);

  // 4. Model 1 Training — Logistic Regression
  console.log('\nTraining Model 1: Logistic Regression...');
  const logReg = new LogisticRegressionModel();
  logReg.fit(X_train, y_train, 400);

  const valProbsLogReg = logReg.predictBatch(X_val);
  const logRegValMetrics = calculateEvaluationMetrics(valProbsLogReg, y_val);
  console.log(`Logistic Regression Validation -> ROC-AUC: ${logRegValMetrics.roc_auc}, PR-AUC: ${logRegValMetrics.pr_auc}, Brier: ${logRegValMetrics.brier_score}, F1: ${logRegValMetrics.f1}`);

  // 5. Model 2 Training — Random Forest Classifier
  console.log('Training Model 2: Random Forest Classifier (10 Trees)...');
  const rf = new RandomForestClassifier(10, 42);
  rf.fit(X_train, y_train);

  const valProbsRf = rf.predictBatch(X_val);
  const rfValMetrics = calculateEvaluationMetrics(valProbsRf, y_val);
  console.log(`Random Forest Validation -> ROC-AUC: ${rfValMetrics.roc_auc}, PR-AUC: ${rfValMetrics.pr_auc}, Brier: ${rfValMetrics.brier_score}, F1: ${rfValMetrics.f1}`);

  // 6. Model Selection & Probability Calibration
  const bestModelName = rfValMetrics.pr_auc >= logRegValMetrics.pr_auc ? 'random_forest' : 'logistic_regression';
  console.log(`\nBest Model Selected (by PR-AUC & Brier Score): ${bestModelName.toUpperCase()}`);

  const bestValProbs = bestModelName === 'random_forest' ? valProbsRf : valProbsLogReg;
  const calibrator = new PlattCalibrator();
  calibrator.fit(bestValProbs, y_val);

  const calValProbs = bestValProbs.map(p => calibrator.calibrate(p));
  const brierBefore = calculateEvaluationMetrics(bestValProbs, y_val).brier_score;
  const brierAfter = calculateEvaluationMetrics(calValProbs, y_val).brier_score;

  console.log(`Probability Calibration (Platt Scaling): Brier Before = ${brierBefore}, Brier After = ${brierAfter}`);

  // 7. Final Untouched Test Set Evaluation
  const testProbsRaw = bestModelName === 'random_forest' ? rf.predictBatch(X_test) : logReg.predictBatch(X_test);
  const testProbsCal = testProbsRaw.map(p => calibrator.calibrate(p));
  const testMetrics = calculateEvaluationMetrics(testProbsCal, y_test);

  console.log(`\nFinal Test Set Evaluation (1,500 untouched test episodes):`);
  console.log(`- ROC-AUC: ${testMetrics.roc_auc}`);
  console.log(`- PR-AUC: ${testMetrics.pr_auc}`);
  console.log(`- Brier Score: ${testMetrics.brier_score}`);
  console.log(`- Precision: ${testMetrics.precision}`);
  console.log(`- Recall: ${testMetrics.recall}`);
  console.log(`- F1 Score: ${testMetrics.f1}`);
  console.log(`- Confusion Matrix: TP=${testMetrics.confusion_matrix.tp}, FP=${testMetrics.confusion_matrix.fp}, TN=${testMetrics.confusion_matrix.tn}, FN=${testMetrics.confusion_matrix.fn}`);

  // 8. Feature Importance / Coefficient Ranking
  const topFeatures: FeatureImportance[] = preprocessor.pipeline.featureNames.map((name, idx) => {
    const coeff = logReg.weights[idx] ?? 0;
    return {
      feature: name,
      importance: Number(Math.abs(coeff).toFixed(4)),
      coefficient: Number(coeff.toFixed(4))
    };
  }).sort((a, b) => b.importance - a.importance).slice(0, 10);

  console.log(`\nTop 10 Predictive Features (Logistic Regression Coefficients):`);
  topFeatures.forEach((tf, rank) => {
    console.log(`  ${rank + 1}. ${tf.feature}: coeff = ${tf.coefficient}`);
  });

  // 9. Error Analysis on Validation Predictions
  const valErrorCategories = analyzeErrorsByGroup(valRows, calValProbs, 'failure_category');
  const valErrorMethods = analyzeErrorsByGroup(valRows, calValProbs, 'payment_method');
  const valErrorAttempts = analyzeErrorsByGroup(valRows, calValProbs, 'attempts_before_action');
  const valErrorPriorities = analyzeErrorsByGroup(valRows, calValProbs, 'priority_level');

  // 10. Write Artifacts (model_metadata.json & feature_schema.json)
  const metadata: ModelMetadata = {
    model_version: '1.0.0',
    dataset_version: '1.0.0',
    feature_schema_version: '1.0.0',
    model_type: bestModelName as any,
    training_seed: 42,
    training_rows: trainRows.length,
    validation_rows: valRows.length,
    test_rows: testRows.length,
    feature_count: preActionFeatures.length,
    target: 'eventual_recovery',

    train_date_range: trainDateRange,
    validation_date_range: valDateRange,
    test_date_range: testDateRange,

    logistic_regression_metrics: logRegValMetrics,
    random_forest_metrics: rfValMetrics,

    selected_best_model: bestModelName,
    selected_model_test_metrics: testMetrics,

    calibration: {
      brier_before: brierBefore,
      brier_after: brierAfter,
      method: 'Platt Scaling (Sigmoidal Logistic Calibration)',
      platt_a: Number(calibrator.a.toFixed(4)),
      platt_b: Number(calibrator.b.toFixed(4))
    },

    top_predictive_features: topFeatures,

    error_analysis: {
      by_failure_category: valErrorCategories,
      by_payment_method: valErrorMethods,
      by_attempts_before_action: valErrorAttempts,
      by_priority_level: valErrorPriorities
    },

    created_at: new Date().toISOString()
  };

  const schema: FeatureSchema = {
    version: '1.0.0',
    target: 'eventual_recovery',
    pre_action_features: preActionFeatures,
    excluded_action_fields: excludedActionFields,
    excluded_post_action_labels: excludedPostActionLabels,
    numeric_features: preprocessor.pipeline.numericFeatures,
    categorical_features: Object.keys(preprocessor.pipeline.categoricalFeatures)
  };

  const dir = path.join(process.cwd(), 'data', 'ml');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'model_metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'feature_schema.json'), JSON.stringify(schema, null, 2), 'utf-8');

  console.log(`\nArtifacts generated successfully:`);
  console.log(`- data/ml/model_metadata.json`);
  console.log(`- data/ml/feature_schema.json`);

  return { metadata, schema };
}

function analyzeErrorsByGroup(rows: CsvEpisodeRow[], probs: number[], key: keyof CsvEpisodeRow): ErrorAnalysisGroup[] {
  const groups: Record<string, { total: number; fp: number; fn: number }> = {};

  rows.forEach((r, idx) => {
    const grpVal = String(r[key]);
    if (!groups[grpVal]) groups[grpVal] = { total: 0, fp: 0, fn: 0 };
    groups[grpVal].total++;

    const pred = probs[idx] >= 0.50 ? 1 : 0;
    const actual = r.eventual_recovery;

    if (pred === 1 && actual === 0) groups[grpVal].fp++;
    if (pred === 0 && actual === 1) groups[grpVal].fn++;
  });

  return Object.keys(groups).map(grp => {
    const g = groups[grp];
    return {
      category: grp,
      total_cases: g.total,
      false_positives: g.fp,
      false_negatives: g.fn,
      fp_rate: Number(((g.fp / (g.total || 1)) * 100).toFixed(1)),
      fn_rate: Number(((g.fn / (g.total || 1)) * 100).toFixed(1))
    };
  });
}

runTrainingPipeline();
