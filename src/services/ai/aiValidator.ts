import type { RecoveryCategory } from '../../types/recovery';
import type { AIDiagnosisResult } from './aiTypes';

const ALLOWED_CATEGORIES: RecoveryCategory[] = [
  'retryable',
  'insufficient_funds',
  'invalid_payment_method',
  'authentication_failure',
  'risk_failure',
  'unknown'
];

export interface ValidationResult {
  isValid: boolean;
  data?: AIDiagnosisResult;
  error?: string;
}

export function validateAIDiagnosisOutput(rawJson: unknown, providerName = 'Groq (GPT-OSS 120B)'): ValidationResult {
  if (!rawJson || typeof rawJson !== 'object') {
    return { isValid: false, error: 'AI output is null or not an object.' };
  }

  const obj = rawJson as Record<string, unknown>;

  // Check root_cause
  if (typeof obj.root_cause !== 'string' || !obj.root_cause.trim()) {
    return { isValid: false, error: 'Missing or invalid root_cause string.' };
  }

  // Check category allowlist
  if (typeof obj.category !== 'string' || !ALLOWED_CATEGORIES.includes(obj.category as RecoveryCategory)) {
    return { isValid: false, error: `Invalid category '${String(obj.category)}'. Must be one of allowed categories.` };
  }

  // Check confidence range (0.0 to 1.0)
  const conf = Number(obj.confidence);
  if (typeof obj.confidence !== 'number' || Number.isNaN(conf) || conf < 0.0 || conf > 1.0) {
    return { isValid: false, error: `Invalid confidence score '${obj.confidence}'. Must be a number between 0.0 and 1.0.` };
  }

  // Check reasoning
  if (typeof obj.reasoning !== 'string' || !obj.reasoning.trim()) {
    return { isValid: false, error: 'Missing or empty reasoning narrative.' };
  }

  // Check customer recovery message
  if (typeof obj.message !== 'string' || !obj.message.trim()) {
    return { isValid: false, error: 'Missing or empty customer recovery draft message.' };
  }

  return {
    isValid: true,
    data: {
      root_cause: obj.root_cause.trim(),
      category: obj.category as RecoveryCategory,
      confidence: conf,
      reasoning: obj.reasoning.trim(),
      message: obj.message.trim(),
      provider: providerName,
      isFallback: false
    }
  };
}
