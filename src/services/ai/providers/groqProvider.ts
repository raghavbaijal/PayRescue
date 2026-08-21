import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import type { AIProvider, AIDiagnosisInput, AIDiagnosisResult } from '../aiTypes';
import { validateAIDiagnosisOutput } from '../aiValidator';
import { fallbackProvider } from './fallbackProvider';

export class GroqProvider implements AIProvider {
  name = 'Groq (GPT-OSS 120B)';

  async diagnose(input: AIDiagnosisInput): Promise<AIDiagnosisResult> {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY || '';

    try {
      let rawJson: unknown = null;

      // 1. Primary Path: Call Supabase Edge Function 'diagnose-payment' if Supabase is live
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.functions.invoke('diagnose-payment', {
          body: input
        });

        if (!error && data) {
          rawJson = data;
        } else if (error) {
          console.warn('[GroqProvider Edge Function Notice]:', error.message, '- attempting direct fallback endpoint.');
        }
      }

      // 2. Direct Groq API Client Call (if VITE_GROQ_API_KEY is available locally or Edge Function bypassed)
      if (!rawJson && apiKey && !apiKey.includes('placeholder')) {
        const systemPrompt = `You are the PayRescue AI Payment Failure Diagnosis Assistant.
Output strictly valid JSON matching schema:
{
  "root_cause": "string",
  "category": "retryable | insufficient_funds | invalid_payment_method | authentication_failure | risk_failure | unknown",
  "confidence": 0.95,
  "reasoning": "string",
  "message": "string"
}`;

        const userPrompt = `Analyze failed transaction: Method=${input.method}, Amount=₹${(input.amount_paise / 100).toFixed(2)}, ErrorCode=${input.error_code}, ErrorReason=${input.error_reason}, Source=${input.error_source}, Attempt=${input.attempts}/${input.max_attempts}.`;

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          })
        });

        if (res.ok) {
          const jsonRes = await res.json();
          const content = jsonRes.choices?.[0]?.message?.content;
          if (content) {
            rawJson = JSON.parse(content);
          }
        }
      }

      // 3. Validate AI JSON response
      if (rawJson) {
        const validation = validateAIDiagnosisOutput(rawJson, this.name);
        if (validation.isValid && validation.data) {
          return validation.data;
        }
        console.warn('[GroqProvider Schema Validation Error]:', validation.error, '- Triggering deterministic fallback.');
      }

      // 4. Fallback to deterministic rule engine if API call failed, timed out, or returned invalid JSON
      return await fallbackProvider.diagnose(input);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GroqProvider Exception]:', msg, '- Triggering deterministic fallback.');
      return await fallbackProvider.diagnose(input);
    }
  }
}

export const groqProvider = new GroqProvider();
