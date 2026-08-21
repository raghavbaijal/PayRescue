import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Transaction } from '../types';
import { writeAuditLog } from './auditService';

export async function createPromiseToPay(transaction: Transaction, daysUntilPromised = 2): Promise<boolean> {
  const promisedDate = new Date();
  promisedDate.setDate(promisedDate.getDate() + daysUntilPromised);
  const promisedDateStr = promisedDate.toISOString().split('T')[0];

  const p2pRecord = {
    transaction_id: transaction.id,
    promised_date: promisedDateStr,
    status: 'active',
    reminder_sent_at: null,
    created_at: new Date().toISOString()
  };

  let success = true;

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('promises_to_pay').insert([p2pRecord]);
      if (error) {
        console.error('[P2P Service Error]', error.message);
        success = false;
      }
    } catch (err) {
      console.error('[P2P Service Exception]', err);
      success = false;
    }
  } else {
    console.log('[P2P Local Seed Log]', p2pRecord);
  }

  // Record audit log event
  await writeAuditLog({
    transaction_id: transaction.id,
    actor: 'system_rule',
    event_type: 'promise_logged',
    root_cause: transaction.error_reason,
    action_taken: 'promise_to_pay',
    decision_reason: `Promise to Pay commitment logged. Deferred payment promised on ${promisedDateStr}.`,
    reasoning: `Customer payment failed due to ${transaction.error_reason}. Deferred P2P window created for ${daysUntilPromised} days.`,
    attempt_number: transaction.attempts
  });

  return success;
}
