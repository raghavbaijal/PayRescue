import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import type { AIProvider, AIDiagnosisInput, AIDiagnosisResult } from '../aiTypes';
import { validateAIDiagnosisOutput } from '../aiValidator';
import { fallbackProvider } from './fallbackProvider';

export class GroqProvider implements AIProvider {
  name = 'Groq (GPT-OSS 120B)';

  async diagnose(input: AIDiagnosisInput): Promise<AIDiagnosisResult> {
    try {
      // Invoke server-side Supabase Edge Function 'diagnose-payment'
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.functions.invoke('diagnose-payment', {
          body: input
        });

        if (!error && data) {
          const validation = validateAIDiagnosisOutput(data, this.name);
          if (validation.isValid && validation.data) {
            return validation.data;
          }
          console.warn('[GroqProvider Schema Validation Error]:', validation.error, '- Triggering deterministic fallback.');
        } else if (error) {
          console.warn('[GroqProvider Edge Function Notice]:', error.message, '- Triggering deterministic fallback.');
        }
      } else {
        console.log('[GroqProvider Notice]: Supabase client not live. Triggering deterministic rule fallback.');
      }

      // Fallback to deterministic rule engine if Edge Function is offline, unconfigured, or returns error
      return await fallbackProvider.diagnose(input);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GroqProvider Exception]:', msg, '- Triggering deterministic fallback.');
      return await fallbackProvider.diagnose(input);
    }
  }
}

export const groqProvider = new GroqProvider();
