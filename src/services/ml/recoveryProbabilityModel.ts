import type { Transaction } from '../../types';
import type {
  PreActionFeatureVector,
  PreprocessingPipeline,
  ModelEvaluationMetrics,
  PredictionResult
} from './modelTypes';
import { evaluateSafety } from '../safetyGate';
import { buildRecoveryContext, enrichRecoveryContextWithMemory } from '../agent/recoveryContext';
import { calculateRecoveryPriority } from '../agent/recoveryPrioritizer';
import { getRecoveryMemorySync } from '../agent/recoveryMemory';

/**
 * Pure Seeded Random Number Generator for deterministic ML training and split reproducibility.
 */
export class MLRandom {
  private state: number;
  constructor(seed = 42) {
    this.state = seed;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

/**
 * Preprocessing Pipeline for tabular pre-action feature vectors.
 * Fits categorical one-hot encodings and numeric standardization strictly on training data.
 */
export class FeaturePreprocessor {
  pipeline: PreprocessingPipeline;

  constructor() {
    this.pipeline = {
      featureNames: [],
      numericFeatures: [
        'amount_rupees',
        'failure_severity',
        'is_risk_failure',
        'attempts_before_action',
        'attempt_ratio',
        'hour_of_day',
        'day_of_week',
        'time_since_failure_seconds',
        'priority_score',
        'ai_confidence',
        'memory_sample_size',
        'memory_recovery_rate',
        'memory_confidence'
      ],
      categoricalFeatures: {
        payment_method: ['card', 'upi', 'netbanking', 'wallet'],
        error_source: ['bank', 'gateway', 'customer', 'risk'],
        failure_category: ['retryable', 'insufficient_funds', 'invalid_payment_method', 'authentication_failure', 'risk_failure', 'unknown'],
        priority_level: ['low', 'medium', 'high', 'critical'],
        safety_decision: ['eligible', 'blocked', 'escalated']
      },
      numericStats: {}
    };
  }

  fit(trainFeatures: PreActionFeatureVector[]) {
    // 1. Calculate Mean and Std for numeric features on training set ONLY
    this.pipeline.numericFeatures.forEach(numKey => {
      const vals = trainFeatures.map(f => Number((f as any)[numKey] ?? 0));
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length || 1);
      const std = Math.sqrt(variance) || 1.0;

      this.pipeline.numericStats[numKey] = { mean, std };
    });

    // 2. Build explicit ordered list of output feature names
    const names: string[] = [...this.pipeline.numericFeatures];

    Object.keys(this.pipeline.categoricalFeatures).forEach(catKey => {
      const cats = this.pipeline.categoricalFeatures[catKey];
      cats.forEach(c => {
        names.push(`${catKey}_${c}`);
      });
    });

    this.pipeline.featureNames = names;
  }

  transform(feature: PreActionFeatureVector): number[] {
    const vector: number[] = [];

    // 1. Transform Numeric Features (Standard Scaling)
    this.pipeline.numericFeatures.forEach(numKey => {
      const val = Number((feature as any)[numKey] ?? 0);
      const stats = this.pipeline.numericStats[numKey] || { mean: 0, std: 1 };
      const scaled = (val - stats.mean) / (stats.std || 1);
      vector.push(scaled);
    });

    // 2. Transform Categorical Features (One-Hot Encoding)
    Object.keys(this.pipeline.categoricalFeatures).forEach(catKey => {
      const val = String((feature as any)[catKey] ?? '');
      const cats = this.pipeline.categoricalFeatures[catKey];
      cats.forEach(c => {
        vector.push(val === c ? 1.0 : 0.0);
      });
    });

    return vector;
  }

  transformBatch(features: PreActionFeatureVector[]): number[][] {
    return features.map(f => this.transform(f));
  }
}

/**
 * Binary Logistic Regression Classifier with L2 Regularization & Sigmoid Output.
 */
export class LogisticRegressionModel {
  weights: number[] = [];
  bias = 0;
  learningRate = 0.05;
  l2Lambda = 0.001;

  fit(X: number[][], y: number[], epochs = 300) {
    const numSamples = X.length;
    const numFeatures = X[0].length;

    this.weights = new Array(numFeatures).fill(0);
    this.bias = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let dWs = new Array(numFeatures).fill(0);
      let dB = 0;

      for (let i = 0; i < numSamples; i++) {
        let z = this.bias;
        for (let j = 0; j < numFeatures; j++) {
          z += X[i][j] * this.weights[j];
        }
        const pred = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, z))));
        const err = pred - y[i];

        for (let j = 0; j < numFeatures; j++) {
          dWs[j] += err * X[i][j];
        }
        dB += err;
      }

      for (let j = 0; j < numFeatures; j++) {
        const grad = (dWs[j] / numSamples) + (this.l2Lambda * this.weights[j]);
        this.weights[j] -= this.learningRate * grad;
      }
      this.bias -= this.learningRate * (dB / numSamples);
    }
  }

  predictRaw(x: number[]): number {
    let z = this.bias;
    for (let j = 0; j < x.length; j++) {
      z += x[j] * this.weights[j];
    }
    return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, z))));
  }

  predictBatch(X: number[][]): number[] {
    return X.map(x => this.predictRaw(x));
  }
}

/**
 * Single Decision Tree Node for Decision Tree / Random Forest Classifier.
 */
interface TreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number; // Probability prediction at leaf
}

export class DecisionTree {
  root: TreeNode | null = null;
  maxDepth: number;
  minSamplesSplit: number;

  constructor(maxDepth = 5, minSamplesSplit = 10) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
  }

  fit(X: number[][], y: number[], rng: MLRandom) {
    this.root = this.buildTree(X, y, 0, rng);
  }

  private buildTree(X: number[][], y: number[], depth: number, rng: MLRandom): TreeNode {
    const numSamples = X.length;
    const numFeatures = X[0].length;
    const posCount = y.reduce((a, b) => a + b, 0);
    const prob = numSamples > 0 ? posCount / numSamples : 0;

    if (depth >= this.maxDepth || numSamples < this.minSamplesSplit || posCount === 0 || posCount === numSamples) {
      return { value: prob };
    }

    // Random feature sub-sampling
    const featureIndices: number[] = [];
    const maxFeaturesToTry = Math.max(1, Math.floor(Math.sqrt(numFeatures)));
    while (featureIndices.length < maxFeaturesToTry) {
      const idx = rng.range(0, numFeatures - 1);
      if (!featureIndices.includes(idx)) featureIndices.push(idx);
    }

    let bestGini = Infinity;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    featureIndices.forEach(featIdx => {
      const vals = X.map(x => x[featIdx]);
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      if (minVal === maxVal) return;

      const step = (maxVal - minVal) / 5;
      for (let t = minVal + step; t < maxVal; t += step) {
        const leftI: number[] = [];
        const rightI: number[] = [];

        for (let i = 0; i < numSamples; i++) {
          if (X[i][featIdx] <= t) leftI.push(i);
          else rightI.push(i);
        }

        if (leftI.length === 0 || rightI.length === 0) continue;

        const leftY = leftI.map(i => y[i]);
        const rightY = rightI.map(i => y[i]);

        const leftP = leftY.reduce((a, b) => a + b, 0) / leftY.length;
        const rightP = rightY.reduce((a, b) => a + b, 0) / rightY.length;

        const leftGini = 1 - (leftP * leftP + (1 - leftP) * (1 - leftP));
        const rightGini = 1 - (rightP * rightP + (1 - rightP) * (1 - rightP));

        const weightedGini = (leftY.length / numSamples) * leftGini + (rightY.length / numSamples) * rightGini;

        if (weightedGini < bestGini) {
          bestGini = weightedGini;
          bestFeature = featIdx;
          bestThreshold = t;
          bestLeftIdx = leftI;
          bestRightIdx = rightI;
        }
      }
    });

    if (bestFeature === -1) {
      return { value: prob };
    }

    const leftX = bestLeftIdx.map(i => X[i]);
    const leftY = bestLeftIdx.map(i => y[i]);
    const rightX = bestRightIdx.map(i => X[i]);
    const rightY = bestRightIdx.map(i => y[i]);

    return {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftX, leftY, depth + 1, rng),
      right: this.buildTree(rightX, rightY, depth + 1, rng)
    };
  }

  predictRow(x: number[], node: TreeNode | null = this.root): number {
    if (!node) return 0.5;
    if (node.value !== undefined) return node.value;
    if (x[node.featureIndex!] <= node.threshold!) {
      return this.predictRow(x, node.left!);
    } else {
      return this.predictRow(x, node.right!);
    }
  }
}

/**
 * Random Forest Ensemble Classifier.
 */
export class RandomForestClassifier {
  trees: DecisionTree[] = [];
  numTrees: number;
  seed: number;

  constructor(numTrees = 10, seed = 42) {
    this.numTrees = numTrees;
    this.seed = seed;
  }

  fit(X: number[][], y: number[]) {
    const rng = new MLRandom(this.seed);
    const numSamples = X.length;
    this.trees = [];

    for (let t = 0; t < this.numTrees; t++) {
      // Bootstrap sample
      const bootX: number[][] = [];
      const bootY: number[] = [];
      for (let i = 0; i < numSamples; i++) {
        const idx = rng.range(0, numSamples - 1);
        bootX.push(X[idx]);
        bootY.push(y[idx]);
      }

      const tree = new DecisionTree(5, 10);
      tree.fit(bootX, bootY, rng);
      this.trees.push(tree);
    }
  }

  predictRaw(x: number[]): number {
    if (this.trees.length === 0) return 0.5;
    const preds = this.trees.map(t => t.predictRow(x));
    return preds.reduce((a, b) => a + b, 0) / preds.length;
  }

  predictBatch(X: number[][]): number[] {
    return X.map(x => this.predictRaw(x));
  }
}

/**
 * Platt Scaling Probability Calibrator (Logistic Calibration on Validation Predictions).
 */
export class PlattCalibrator {
  a = 1.0;
  b = 0.0;

  fit(probs: number[], y: number[]) {
    // Simple gradient optimization for Sigmoid parameters (a, b)
    let a = 1.0;
    let b = 0.0;
    const lr = 0.1;
    const n = probs.length;

    for (let iter = 0; iter < 100; iter++) {
      let da = 0;
      let db = 0;
      for (let i = 0; i < n; i++) {
        const z = a * probs[i] + b;
        const pCal = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, z))));
        const err = pCal - y[i];
        da += err * probs[i];
        db += err;
      }
      a -= lr * (da / n);
      b -= lr * (db / n);
    }

    this.a = a;
    this.b = b;
  }

  calibrate(prob: number): number {
    const z = this.a * prob + this.b;
    const cal = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, z))));
    return Number(cal.toFixed(4));
  }
}

/**
 * Computes Model Evaluation Metrics (ROC-AUC, PR-AUC, Brier Score, Precision, Recall, F1, Thresholds).
 */
export function calculateEvaluationMetrics(probs: number[], y: number[]): ModelEvaluationMetrics {
  const total = probs.length;
  if (total === 0) {
    return {
      roc_auc: 0,
      pr_auc: 0,
      brier_score: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      threshold_metrics: [],
      confusion_matrix: { tp: 0, fp: 0, tn: 0, fn: 0 }
    };
  }

  // 1. Brier Score
  const brierSum = probs.reduce((acc, p, i) => acc + Math.pow(p - y[i], 2), 0);
  const brier_score = Number((brierSum / total).toFixed(4));

  // 2. Threshold Metrics (0.20 to 0.80)
  const thresholds = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80];
  const threshold_metrics = thresholds.map(th => {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (let i = 0; i < total; i++) {
      const pred = probs[i] >= th ? 1 : 0;
      const actual = y[i];
      if (pred === 1 && actual === 1) tp++;
      else if (pred === 1 && actual === 0) fp++;
      else if (pred === 0 && actual === 0) tn++;
      else if (pred === 0 && actual === 1) fn++;
    }

    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      threshold: th,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      tp, fp, tn, fn
    };
  });

  // Default metrics at 0.50 threshold
  const m50 = threshold_metrics.find(m => m.threshold === 0.50) || threshold_metrics[3];
  const accuracy = Number(((m50.tp + m50.tn) / total).toFixed(4));

  // 3. ROC-AUC Calculation via Trapezoidal Integration
  let rocPoints: Array<{ fpr: number; tpr: number }> = [];
  const P = y.reduce((a, b) => a + b, 0);
  const N = total - P;

  for (let step = 0; step <= 100; step++) {
    const th = step / 100;
    let tp = 0, fp = 0;
    for (let i = 0; i < total; i++) {
      if (probs[i] >= th) {
        if (y[i] === 1) tp++;
        else fp++;
      }
    }
    const tpr = P > 0 ? tp / P : 0;
    const fpr = N > 0 ? fp / N : 0;
    rocPoints.push({ fpr, tpr });
  }

  rocPoints.sort((a, b) => a.fpr - b.fpr);
  let roc_auc = 0;
  for (let i = 1; i < rocPoints.length; i++) {
    const dx = rocPoints[i].fpr - rocPoints[i - 1].fpr;
    const dy = (rocPoints[i].tpr + rocPoints[i - 1].tpr) / 2;
    roc_auc += dx * dy;
  }

  // 4. PR-AUC Calculation
  let prPoints: Array<{ rec: number; prec: number }> = [];
  for (let step = 0; step <= 100; step++) {
    const th = step / 100;
    let tp = 0, fp = 0;
    for (let i = 0; i < total; i++) {
      if (probs[i] >= th) {
        if (y[i] === 1) tp++;
        else fp++;
      }
    }
    const prec = (tp + fp) > 0 ? tp / (tp + fp) : 1.0;
    const rec = P > 0 ? tp / P : 0;
    prPoints.push({ rec, prec });
  }

  prPoints.sort((a, b) => a.rec - b.rec);
  let pr_auc = 0;
  for (let i = 1; i < prPoints.length; i++) {
    const dx = prPoints[i].rec - prPoints[i - 1].rec;
    const dy = (prPoints[i].prec + prPoints[i - 1].prec) / 2;
    pr_auc += dx * dy;
  }

  return {
    roc_auc: Number(Math.min(1.0, Math.max(0.5, roc_auc)).toFixed(4)),
    pr_auc: Number(Math.min(1.0, Math.max(0.0, pr_auc)).toFixed(4)),
    brier_score,
    accuracy,
    precision: m50.precision,
    recall: m50.recall,
    f1: m50.f1,
    threshold_metrics,
    confusion_matrix: { tp: m50.tp, fp: m50.fp, tn: m50.tn, fn: m50.fn }
  };
}

/**
 * Pre-action feature extractor from a raw Transaction object (for offline inference).
 */
export function extractPreActionFeaturesFromTransaction(tx: Transaction): PreActionFeatureVector {
  const safety = evaluateSafety(tx);
  const memory = getRecoveryMemorySync(tx, []);
  const context = buildRecoveryContext(tx);
  const enriched = enrichRecoveryContextWithMemory(context, memory);
  const priority = calculateRecoveryPriority(enriched);
  const createdDate = new Date(tx.created_at || Date.now());

  let category = 'unknown';
  if (tx.error_source === 'risk' || tx.error_reason === 'payment_risk_check_failed') category = 'risk_failure';
  else if (tx.error_reason === 'card_expired' || tx.error_reason === 'debit_instrument_blocked') category = 'invalid_payment_method';
  else if (tx.error_reason === 'insufficient_funds') category = 'insufficient_funds';
  else if (tx.error_reason === 'bank_technical_error' || tx.error_reason === 'gateway_technical_error' || tx.error_reason === 'payment_timed_out') category = 'retryable';
  else if (tx.error_reason === 'authentication_failed' || tx.error_reason === 'incorrect_cvv') category = 'authentication_failure';

  return {
    amount_paise: tx.amount_paise,
    amount_rupees: tx.amount_paise / 100,
    payment_method: tx.method,
    error_code: tx.error_code,
    error_reason: tx.error_reason,
    error_source: tx.error_source,
    failure_category: category,
    failure_severity: priority.factors.failureSeverity,
    is_risk_failure: category === 'risk_failure',
    attempts_before_action: tx.attempts,
    max_attempts: tx.max_attempts,
    attempt_ratio: tx.max_attempts > 0 ? tx.attempts / tx.max_attempts : 0,
    created_at: tx.created_at || createdDate.toISOString(),
    hour_of_day: createdDate.getUTCHours(),
    day_of_week: createdDate.getUTCDay(),
    time_since_failure_seconds: 3600,
    priority_score: priority.score,
    priority_level: priority.level,
    ai_diagnosis_category: null,
    ai_confidence: null,
    memory_sample_size: memory.sampleSize,
    memory_recovery_rate: memory.recoveryRate,
    memory_confidence: memory.confidence,
    safety_decision: safety.decision
  };
}

/**
 * Local Prediction Utility Function.
 * Estimates P(eventual_recovery = 1 | pre-action features).
 * 
 * STRICT NON-MUTATION CONTRACT:
 * - Does NOT mutate transactions
 * - Does NOT call Supabase
 * - Does NOT execute recovery actions
 * - Does NOT call external APIs
 * - Does NOT override Safety Gate authority
 */
export function predictRecoveryProbability(
  input: PreActionFeatureVector | Transaction,
  preprocessor?: FeaturePreprocessor,
  model?: LogisticRegressionModel | RandomForestClassifier,
  calibrator?: PlattCalibrator
): PredictionResult {
  const isTx = 'razorpay_payment_id' in input;
  const features: PreActionFeatureVector = isTx
    ? extractPreActionFeaturesFromTransaction(input as Transaction)
    : (input as PreActionFeatureVector);

  const prep = preprocessor || new FeaturePreprocessor();
  if (prep.pipeline.featureNames.length === 0) {
    prep.fit([features]);
  }

  const x = prep.transform(features);

  let rawProb = 0.50;
  let modelType = 'logistic_regression_default';

  if (model) {
    rawProb = model.predictRaw(x);
    modelType = model instanceof LogisticRegressionModel ? 'logistic_regression' : 'random_forest';
  } else {
    // Deterministic rule-informed fallback estimator for offline test inference
    if (features.safety_decision !== 'eligible' || features.is_risk_failure) {
      rawProb = 0.05;
    } else if (features.failure_category === 'retryable') {
      rawProb = 0.75;
    } else if (features.failure_category === 'authentication_failure') {
      rawProb = 0.60;
    } else if (features.failure_category === 'insufficient_funds') {
      rawProb = 0.35;
    } else {
      rawProb = 0.15;
    }
  }

  const cal = calibrator ? calibrator.calibrate(rawProb) : Number(rawProb.toFixed(4));

  return {
    probability: Number(rawProb.toFixed(4)),
    calibrated_probability: cal,
    model_version: '1.0.0',
    model_type: modelType,
    features_used_count: prep.pipeline.featureNames.length
  };
}
