-- ============================================================================
-- PayRescue Phase 1 - Representative Demo Dataset (25 Curated Transactions)
-- ============================================================================

-- Clear existing data (for clean re-seeding if needed)
truncate table promises_to_pay, audit_log, transactions, recovery_runs cascade;

-- Insert Demo Transactions
insert into transactions (
  id, razorpay_payment_id, customer_name, customer_contact, amount_paise,
  method, error_code, error_reason, error_source, attempts, max_attempts, status, created_at, updated_at
) values
-- 1. Pending - Insufficient Funds
(
  '11111111-1111-4111-a111-111111111101', 'pay_demo_001', 'Rhea Sharma', '+91 98123 45678', 420000,
  'upi', 'BAD_REQUEST_ERROR', 'insufficient_funds', 'customer', 1, 3, 'pending',
  now() - interval '2 hours', now() - interval '2 hours'
),
-- 2. Retry Scheduled - Bank Tech Error
(
  '11111111-1111-4111-a111-111111111102', 'pay_demo_002', 'Aarav Patel', '+91 98234 56789', 1250000,
  'card', 'GATEWAY_ERROR', 'bank_technical_error', 'bank', 2, 3, 'retry_scheduled',
  now() - interval '5 hours', now() - interval '1 hour'
),
-- 3. Stopped - Card Expired
(
  '11111111-1111-4111-a111-111111111103', 'pay_demo_003', 'Priya Nair', '+91 98345 67890', 899000,
  'card', 'BAD_REQUEST_ERROR', 'card_expired', 'customer', 3, 3, 'stopped',
  now() - interval '1 day', now() - interval '12 hours'
),
-- 4. Processing - Payment Timed Out
(
  '11111111-1111-4111-a111-111111111104', 'pay_demo_004', 'Vikram Malhotra', '+91 98456 78901', 2499900,
  'netbanking', 'GATEWAY_ERROR', 'payment_timed_out', 'gateway', 1, 3, 'processing',
  now() - interval '30 minutes', now() - interval '10 minutes'
),
-- 5. Pending - Auth Failed
(
  '11111111-1111-4111-a111-111111111105', 'pay_demo_005', 'Ananya Gupta', '+91 98567 89012', 150000,
  'upi', 'BAD_REQUEST_ERROR', 'authentication_failed', 'customer', 2, 3, 'pending',
  now() - interval '4 hours', now() - interval '3 hours'
),
-- 6. Escalated - High Value Risk Failure
(
  '11111111-1111-4111-a111-111111111106', 'pay_demo_006', 'Rohan Mehta', '+91 98678 90123', 4999900,
  'card', 'RISK_CHECK_FAILED', 'payment_risk_check_failed', 'gateway', 1, 3, 'escalated',
  now() - interval '6 hours', now() - interval '5 hours'
),
-- 7. Promise to Pay (Active) - Insufficient Funds
(
  '11111111-1111-4111-a111-111111111107', 'pay_demo_007', 'Sneha Reddy', '+91 98789 01234', 349900,
  'wallet', 'BAD_REQUEST_ERROR', 'insufficient_funds', 'customer', 1, 3, 'promise_to_pay',
  now() - interval '1 day', now() - interval '6 hours'
),
-- 8. Recovered - Gateway Tech Error via Automated Retry
(
  '11111111-1111-4111-a111-111111111108', 'pay_demo_008', 'Kavya Joshi', '+91 98890 12345', 1800000,
  'upi', 'GATEWAY_ERROR', 'gateway_technical_error', 'gateway', 2, 3, 'recovered',
  now() - interval '2 days', now() - interval '1 day'
),
-- 9. Pending - Incorrect CVV
(
  '11111111-1111-4111-a111-111111111109', 'pay_demo_009', 'Devendra Singh', '+91 98901 23456', 625000,
  'card', 'BAD_REQUEST_ERROR', 'incorrect_cvv', 'customer', 2, 3, 'pending',
  now() - interval '8 hours', now() - interval '7 hours'
),
-- 10. Stopped - Network Error (Max Attempts Reached)
(
  '11111111-1111-4111-a111-111111111110', 'pay_demo_010', 'Ishaan Verma', '+91 99012 34567', 1540000,
  'netbanking', 'GATEWAY_ERROR', 'network_error', 'bank', 3, 3, 'stopped',
  now() - interval '3 days', now() - interval '2 days'
),
-- 11. Promise to Pay (Broken) - Insufficient Funds
(
  '11111111-1111-4111-a111-111111111111', 'pay_demo_011', 'Meera Bannerjee', '+91 99123 45678', 299900,
  'upi', 'BAD_REQUEST_ERROR', 'insufficient_funds', 'customer', 1, 3, 'promise_to_pay',
  now() - interval '4 days', now() - interval '1 day'
),
-- 12. Escalated - Debit Instrument Blocked
(
  '11111111-1111-4111-a111-111111111112', 'pay_demo_012', 'Siddharth Rao', '+91 99234 56789', 8500000,
  'card', 'GATEWAY_ERROR', 'debit_instrument_blocked', 'customer', 1, 3, 'escalated',
  now() - interval '12 hours', now() - interval '10 hours'
),
-- 13. Retry Scheduled - Bank Technical Error
(
  '11111111-1111-4111-a111-111111111113', 'pay_demo_013', 'Tanvi Agarwal', '+91 99345 67890', 520000,
  'upi', 'GATEWAY_ERROR', 'bank_technical_error', 'bank', 1, 3, 'retry_scheduled',
  now() - interval '45 minutes', now() - interval '15 minutes'
),
-- 14. Stopped - Payment Cancelled by User
(
  '11111111-1111-4111-a111-111111111114', 'pay_demo_014', 'Aditya Kapoor', '+91 99456 78901', 1199900,
  'card', 'BAD_REQUEST_ERROR', 'payment_cancelled', 'customer', 1, 3, 'stopped',
  now() - interval '5 hours', now() - interval '5 hours'
),
-- 15. Recovered - Repeat Customer Rhea Sharma
(
  '11111111-1111-4111-a111-111111111115', 'pay_demo_015', 'Rhea Sharma', '+91 98123 45678', 950000,
  'card', 'GATEWAY_ERROR', 'payment_timed_out', 'gateway', 1, 3, 'recovered',
  now() - interval '1 hour', now() - interval '20 minutes'
),
-- 16. Pending - Ambiguous / Low Confidence Case
(
  '11111111-1111-4111-a111-111111111116', 'pay_demo_016', 'Rahul Saxena', '+91 99567 89012', 320000,
  'wallet', 'GATEWAY_ERROR', 'bank_technical_error', 'bank', 1, 3, 'pending',
  now() - interval '3 hours', now() - interval '3 hours'
),
-- 17. Escalated - High Value Risk Trigger
(
  '11111111-1111-4111-a111-111111111117', 'pay_demo_017', 'Neha Deshmukh', '+91 99678 90123', 6500000,
  'netbanking', 'RISK_CHECK_FAILED', 'payment_risk_check_failed', 'gateway', 2, 3, 'escalated',
  now() - interval '1 day', now() - interval '18 hours'
),
-- 18. Recovered - Promise to Pay Kept
(
  '11111111-1111-4111-a111-111111111118', 'pay_demo_018', 'Kabir Das', '+91 99789 01234', 189900,
  'upi', 'BAD_REQUEST_ERROR', 'insufficient_funds', 'customer', 2, 3, 'recovered',
  now() - interval '3 days', now() - interval '6 hours'
),
-- 19. Retry Scheduled - Auth Failure Retry Allowed
(
  '11111111-1111-4111-a111-111111111119', 'pay_demo_019', 'Pooja Choudhury', '+91 99890 12345', 1420000,
  'card', 'BAD_REQUEST_ERROR', 'authentication_failed', 'customer', 1, 3, 'retry_scheduled',
  now() - interval '2 hours', now() - interval '30 minutes'
),
-- 20. Pending - Repeat Customer Aarav Patel
(
  '11111111-1111-4111-a111-111111111120', 'pay_demo_020', 'Aarav Patel', '+91 98234 56789', 499900,
  'upi', 'GATEWAY_ERROR', 'network_error', 'bank', 1, 3, 'pending',
  now() - interval '15 minutes', now() - interval '15 minutes'
),
-- 21. Stopped - Gateway Tech Error Max Attempt Reached
(
  '11111111-1111-4111-a111-111111111121', 'pay_demo_021', 'Sanjana Roy', '+91 99901 23456', 2200000,
  'netbanking', 'GATEWAY_ERROR', 'gateway_technical_error', 'gateway', 3, 3, 'stopped',
  now() - interval '5 days', now() - interval '4 days'
),
-- 22. Stopped - Expired Card No Retry
(
  '11111111-1111-4111-a111-111111111122', 'pay_demo_022', 'Amit Trivedi', '+91 98012 34567', 745000,
  'card', 'BAD_REQUEST_ERROR', 'card_expired', 'customer', 1, 3, 'stopped',
  now() - interval '2 days', now() - interval '2 days'
),
-- 23. Recovered - Repeat Customer Priya Nair
(
  '11111111-1111-4111-a111-111111111123', 'pay_demo_023', 'Priya Nair', '+91 98345 67890', 310000,
  'upi', 'GATEWAY_ERROR', 'bank_technical_error', 'bank', 1, 3, 'recovered',
  now() - interval '6 hours', now() - interval '1 hour'
),
-- 24. Escalated - High Value Enterprise Enterprise Risk
(
  '11111111-1111-4111-a111-111111111124', 'pay_demo_024', 'Varun Iyer', '+91 98111 22233', 12500000,
  'card', 'RISK_CHECK_FAILED', 'payment_risk_check_failed', 'gateway', 1, 3, 'escalated',
  now() - interval '3 hours', now() - interval '2 hours'
),
-- 25. Promise to Pay (Active) - Insufficient Funds
(
  '11111111-1111-4111-a111-111111111125', 'pay_demo_025', 'Divya Menon', '+91 98222 33344', 249900,
  'upi', 'BAD_REQUEST_ERROR', 'insufficient_funds', 'customer', 1, 3, 'promise_to_pay',
  now() - interval '10 hours', now() - interval '4 hours'
);

-- Insert Demo Promises to Pay
insert into promises_to_pay (
  transaction_id, promised_date, status, reminder_sent_at, created_at
) values
-- Active promise for Sneha Reddy (pay_demo_007)
(
  '11111111-1111-4111-a111-111111111107', current_date + interval '2 days', 'active', null, now() - interval '6 hours'
),
-- Broken promise for Meera Bannerjee (pay_demo_011)
(
  '11111111-1111-4111-a111-111111111111', current_date - interval '1 day', 'broken', now() - interval '2 days', now() - interval '4 days'
),
-- Kept promise for Kabir Das (pay_demo_018)
(
  '11111111-1111-4111-a111-111111111118', current_date - interval '1 day', 'kept', now() - interval '1 day', now() - interval '3 days'
),
-- Active promise for Divya Menon (pay_demo_025)
(
  '11111111-1111-4111-a111-111111111125', current_date + interval '1 day', 'active', null, now() - interval '4 hours'
);

-- Insert Demo Initial Audit Trail Logs
insert into audit_log (
  transaction_id, actor, event_type, root_cause, ai_confidence, action_taken, decision_reason, reasoning, message_draft, attempt_number, created_at
) values
(
  '11111111-1111-4111-a111-111111111101', 'system_rule', 'PAYMENT_FAILURE_INGESTED', 'insufficient_funds', null,
  'INITIALIZED', 'Ingested failed transaction from Razorpay webhook', 'Transaction failed due to insufficient funds at customer end.', null, 1, now() - interval '2 hours'
),
(
  '11111111-1111-4111-a111-111111111102', 'system_rule', 'RETRY_SCHEDULED', 'bank_technical_error', 0.9200,
  'SCHEDULE_RETRY', 'Bank technical error detected; transient issue expected to resolve within 2 hours', 'Historical bank uptime metrics indicate 94% recovery success within 2 hours.', null, 2, now() - interval '1 hour'
),
(
  '11111111-1111-4111-a111-111111111103', 'system_rule', 'RECOVERY_STOPPED', 'card_expired', null,
  'STOP_RECOVERY', 'Hard failure: Card expired. Retries prohibited by policy engine.', 'Expired cards cannot be auto-retried without updated customer payment credentials.', null, 3, now() - interval '12 hours'
),
(
  '11111111-1111-4111-a111-111111111107', 'human', 'PROMISE_TO_PAY_RECORDED', 'insufficient_funds', null,
  'RECORD_P2P', 'Customer agreed to complete payment on payday via WhatsApp link', 'Customer requested 48h extension via interactive WhatsApp recovery prompt.', 'Hi Sneha, your payment link for ₹3,499 has been deferred as agreed.', 1, now() - interval '6 hours'
),
(
  '11111111-1111-4111-a111-111111111108', 'system_rule', 'RECOVERY_SUCCESSFUL', 'gateway_technical_error', 0.9800,
  'EXECUTE_RETRY', 'Automated retry succeeded on attempt 2', 'Transient gateway error cleared; payment auto-captured.', null, 2, now() - interval '1 day'
);

-- Initial Recovery Run summary log
insert into recovery_runs (
  started_at, completed_at, total_at_risk_paise, total_recovered_paise, transactions_processed
) values (
  now() - interval '1 day', now() - interval '23 hours', 45000000, 12849000, 25
);
