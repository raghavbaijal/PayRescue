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

export async function fetchRecentActivityFeed(limit = 10): Promise<AuditLog[]> {
  if (!isSupabaseConfigured()) {
    return [
      {
        id: 101,
        transaction_id: '11111111-1111-4111-a111-111111111108',
        actor: 'system_rule',
        event_type: 'retry_executed',
        root_cause: 'gateway_technical_error',
        ai_confidence: 0.98,
        action_taken: 'recovered',
        decision_reason: 'Automated retry executed successfully. ₹18,000 recovered.',
        reasoning: 'Transient gateway error cleared.',
        message_draft: null,
        attempt_number: 2,
        created_at: new Date(Date.now() - 5 * 60000).toISOString()
      },
      {
        id: 102,
        transaction_id: '11111111-1111-4111-a111-111111111102',
        actor: 'system_rule',
        event_type: 'retry_executed',
        root_cause: 'bank_technical_error',
        ai_confidence: 0.92,
        action_taken: 'retry_scheduled',
        decision_reason: 'Bank technical error detected; retry scheduled for attempt 2/3.',
        reasoning: 'Bank uptime metrics indicate transient recovery.',
        message_draft: null,
        attempt_number: 2,
        created_at: new Date(Date.now() - 15 * 60000).toISOString()
      },
      {
        id: 103,
        transaction_id: '11111111-1111-4111-a111-111111111107',
        actor: 'human',
        event_type: 'promise_logged',
        root_cause: 'insufficient_funds',
        ai_confidence: null,
        action_taken: 'promise_to_pay',
        decision_reason: 'Promise-to-Pay deferred window created for 48h.',
        reasoning: 'Customer agreed to complete payment on payday.',
        message_draft: 'Deferred payment link sent.',
        attempt_number: 1,
        created_at: new Date(Date.now() - 45 * 60000).toISOString()
      },
      {
        id: 104,
        transaction_id: '11111111-1111-4111-a111-111111111106',
        actor: 'system_rule',
        event_type: 'escalated',
        root_cause: 'payment_risk_check_failed',
        ai_confidence: null,
        action_taken: 'escalated',
        decision_reason: 'Risk check failure detected. Automated retry blocked; escalated to ops.',
        reasoning: 'High-value transaction risk trigger.',
        message_draft: null,
        attempt_number: 1,
        created_at: new Date(Date.now() - 2 * 3600000).toISOString()
      }
    ];
  }

  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Recent Activity Fetch Error]:', error.message);
      return [];
    }

    return (data as AuditLog[]) || [];
  } catch (err) {
    console.error('[Recent Activity Exception]:', err);
    return [];
  }
}
