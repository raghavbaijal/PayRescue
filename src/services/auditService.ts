import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { AuditLog, AuditActor } from '../types';

export interface AuditParams {
  transaction_id: string;
  actor?: AuditActor;
  event_type: string;
  root_cause?: string | null;
  ai_confidence?: number | null;
  action_taken?: string | null;
  decision_reason: string;
  reasoning?: string | null;
  message_draft?: string | null;
  attempt_number?: number | null;
}

export async function writeAuditLog(params: AuditParams): Promise<boolean> {
  const record = {
    transaction_id: params.transaction_id,
    actor: params.actor || 'system_rule',
    event_type: params.event_type,
    root_cause: params.root_cause || null,
    ai_confidence: params.ai_confidence ?? null,
    action_taken: params.action_taken || null,
    decision_reason: params.decision_reason,
    reasoning: params.reasoning || null,
    message_draft: params.message_draft || null,
    attempt_number: params.attempt_number ?? null,
    created_at: new Date().toISOString()
  };

  if (!isSupabaseConfigured()) {
    console.log('[Audit Log Local]', record);
    return true;
  }

  try {
    const { error } = await supabase.from('audit_log').insert([record]);
    if (error) {
      console.error('[Audit Log Error]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Audit Log Exception]', err);
    return false;
  }
}

export async function fetchAuditLogsForTransaction(transactionId: string): Promise<AuditLog[]> {
  if (!isSupabaseConfigured()) {
    return [
      {
        id: 1,
        transaction_id: transactionId,
        actor: 'ai_agent',
        event_type: 'classified',
        root_cause: 'temporary_bank_timeout',
        ai_confidence: 0.96,
        action_taken: 'retry_scheduled',
        decision_reason: 'AI classified failure as retryable with 96% confidence.',
        reasoning: 'The transaction appears to have failed because of a temporary bank-side timeout.',
        message_draft: 'Your payment could not be completed due to a temporary issue. Please try again shortly.',
        attempt_number: 1,
        created_at: new Date().toISOString()
      }
    ];
  }

  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Audit Fetch Error]:', error.message);
      return [];
    }

    return (data as AuditLog[]) || [];
  } catch (err) {
    console.error('[Audit Fetch Exception]:', err);
    return [];
  }
}
