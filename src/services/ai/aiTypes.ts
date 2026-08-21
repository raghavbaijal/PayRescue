import type { RecoveryCategory } from '../../types/recovery';

export interface AIDiagnosisInput {
  amount_paise: number;
  method: string;
  error_code: string;
  error_reason: string;
  error_source: string;
  attempts: number;
  max_attempts: number;
  customer_name?: string;
  customer_contact?: string | null;
}

export interface AIDiagnosisResult {
  root_cause: string;
  category: RecoveryCategory;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  message: string;
  provider: string; // e.g. 'Groq (GPT-OSS 120B)' or 'Deterministic Rule Fallback'
  isFallback: boolean;
}

export interface AIProvider {
  name: string;
  diagnose(input: AIDiagnosisInput): Promise<AIDiagnosisResult>;
}
