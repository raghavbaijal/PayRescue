-- ============================================================================
-- PayRescue Phase 1 Database Schema Migration
-- ============================================================================

-- 1. Transactions Table
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  razorpay_payment_id text not null,
  customer_name text not null,
  customer_contact text,
  amount_paise bigint not null,
  method text not null check (
    method in ('card', 'upi', 'netbanking', 'wallet')
  ),
  error_code text not null,
  error_reason text not null,
  error_source text not null,
  attempts int not null default 1,
  max_attempts int not null default 3,
  status text not null default 'pending' check (
    status in (
      'pending',
      'processing',
      'retry_scheduled',
      'promise_to_pay',
      'recovered',
      'escalated',
      'stopped'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Audit Log Table (Append-only)
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  transaction_id uuid not null
    references transactions(id)
    on delete cascade,
  actor text not null check (
    actor in ('ai_agent', 'system_rule', 'human')
  ),
  event_type text not null,
  root_cause text,
  ai_confidence numeric(5,4),
  action_taken text,
  decision_reason text,
  reasoning text,
  message_draft text,
  attempt_number int,
  created_at timestamptz not null default now()
);

-- 3. Promises to Pay Table
create table if not exists promises_to_pay (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references transactions(id)
    on delete cascade,
  promised_date date not null,
  status text not null default 'active'
    check (status in ('active', 'kept', 'broken')),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. Recovery Runs Table
create table if not exists recovery_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_at_risk_paise bigint,
  total_recovered_paise bigint,
  transactions_processed int default 0
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_transactions_status
  on transactions(status);

create index if not exists idx_audit_transaction
  on audit_log(transaction_id, created_at);

create index if not exists idx_p2p_status
  on promises_to_pay(status);

-- ============================================================================
-- Row Level Security (RLS) & Policies
-- ============================================================================

alter table transactions enable row level security;
alter table audit_log enable row level security;
alter table promises_to_pay enable row level security;
alter table recovery_runs enable row level security;

-- Transactions Policies
create policy "Allow read access for transactions" on transactions
  for select using (true);
create policy "Allow insert access for transactions" on transactions
  for insert with check (true);
create policy "Allow update access for transactions" on transactions
  for update using (true);

-- Audit Log Policies (APPEND-ONLY: ONLY SELECT & INSERT allowed, NO UPDATE/DELETE)
create policy "Allow read access for audit_log" on audit_log
  for select using (true);
create policy "Allow insert access for audit_log" on audit_log
  for insert with check (true);

-- Promises to Pay Policies
create policy "Allow read access for promises_to_pay" on promises_to_pay
  for select using (true);
create policy "Allow insert access for promises_to_pay" on promises_to_pay
  for insert with check (true);
create policy "Allow update access for promises_to_pay" on promises_to_pay
  for update using (true);

-- Recovery Runs Policies
create policy "Allow read access for recovery_runs" on recovery_runs
  for select using (true);
create policy "Allow insert access for recovery_runs" on recovery_runs
  for insert with check (true);
create policy "Allow update access for recovery_runs" on recovery_runs
  for update using (true);
