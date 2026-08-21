/**
 * PayRescue Centralized TypeScript Definitions
 */

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'retry_scheduled'
  | 'promise_to_pay'
  | 'recovered'
  | 'escalated'
  | 'stopped';

export type PaymentMethod = 'card' | 'upi' | 'netbanking' | 'wallet';

export type ErrorSource = 'bank' | 'gateway' | 'customer' | 'risk';

export type AuditActor = 'ai_agent' | 'system_rule' | 'human';

export type PromiseToPayStatus = 'active' | 'kept' | 'broken';

export interface Transaction {
  id: string;
  razorpay_payment_id: string;
  customer_name: string;
  customer_contact: string | null;
  amount_paise: number;
  method: PaymentMethod;
  error_code: string;
  error_reason: string;
  error_source: ErrorSource;
  attempts: number;
  max_attempts: number;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  transaction_id: string;
  actor: AuditActor;
  event_type: string;
  root_cause: string | null;
  ai_confidence: number | null;
  action_taken: string | null;
  decision_reason: string | null;
  reasoning: string | null;
  message_draft: string | null;
  attempt_number: number | null;
  created_at: string;
}

export interface PromiseToPay {
  id: string;
  transaction_id: string;
  promised_date: string;
  status: PromiseToPayStatus;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface RecoveryRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  total_at_risk_paise: number | null;
  total_recovered_paise: number | null;
  transactions_processed: number;
}
