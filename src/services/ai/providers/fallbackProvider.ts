import type { AIProvider, AIDiagnosisInput, AIDiagnosisResult } from '../aiTypes';
import { classifyFailure } from '../../policyEngine';

export class FallbackProvider implements AIProvider {
  name = 'Deterministic Rule Fallback';

  async diagnose(input: AIDiagnosisInput): Promise<AIDiagnosisResult> {
    const category = classifyFailure(input.error_reason);
    let message = 'Your payment could not be completed. Please try again shortly or use another payment method.';

    switch (category) {
      case 'retryable':
        message = 'Your payment could not be completed due to a temporary bank or network issue. Please try again shortly.';
        break;
      case 'insufficient_funds':
        message = 'Your payment was declined due to insufficient available funds. You can retry after updating your balance or payment method.';
        break;
      case 'invalid_payment_method':
        message = 'Your payment instrument appears to be expired or blocked. Please update your payment method to complete the purchase.';
        break;
      case 'authentication_failure':
        message = 'Payment authentication failed. Please re-enter your CVV or 3D Secure credentials.';
        break;
      case 'risk_failure':
        message = 'Payment could not be processed due to a security verification check. Please contact support.';
        break;
      case 'unknown':
      default:
        message = 'Your payment could not be completed. Please try again or contact customer support.';
        break;
    }

    return {
      root_cause: input.error_reason,
      category,
      confidence: 0.90, // Deterministic rule-based confidence
      reasoning: `Deterministic rule-based classification applied for ${input.error_reason}. AI provider fallback active.`,
      message,
      provider: this.name,
      isFallback: true
    };
  }
}

export const fallbackProvider = new FallbackProvider();
