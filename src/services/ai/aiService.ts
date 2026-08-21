import type { Transaction } from '../../types';
import type { AIDiagnosisInput, AIDiagnosisResult } from './aiTypes';
import { groqProvider } from './providers/groqProvider';
import { fallbackProvider } from './providers/fallbackProvider';

export const AI_CONFIDENCE_THRESHOLD = 0.80;

export function isConfidenceAboveThreshold(confidence: number): boolean {
  return typeof confidence === 'number' && confidence >= AI_CONFIDENCE_THRESHOLD;
}

export class AIService {
  private provider = groqProvider;

  /**
   * Diagnoses a failed payment transaction using Groq GPT-OSS 120B (or fallback rule engine).
   */
  async diagnoseTransaction(transaction: Transaction): Promise<AIDiagnosisResult> {
    if (!transaction) {
      return fallbackProvider.diagnose({
        amount_paise: 0,
        method: 'card',
        error_code: 'UNKNOWN',
        error_reason: 'unknown',
        error_source: 'system',
        attempts: 1,
        max_attempts: 3
      });
    }

    const input: AIDiagnosisInput = {
      amount_paise: transaction.amount_paise,
      method: transaction.method,
      error_code: transaction.error_code,
      error_reason: transaction.error_reason,
      error_source: transaction.error_source,
      attempts: transaction.attempts,
      max_attempts: transaction.max_attempts,
      customer_name: transaction.customer_name,
      customer_contact: transaction.customer_contact
    };

    try {
      const result = await this.provider.diagnose(input);

      // Extra safety check: Re-verify category allowlist & confidence bounds
      if (!result || typeof result.confidence !== 'number' || Number.isNaN(result.confidence)) {
        console.warn('[AIService Safety Warning]: Malformed result received. Forcing deterministic fallback.');
        return await fallbackProvider.diagnose(input);
      }

      return result;
    } catch (err) {
      console.warn('[AIService Exception]: Exception occurred during AI diagnosis. Forcing deterministic fallback.', err);
      return await fallbackProvider.diagnose(input);
    }
  }
}

export const aiService = new AIService();
