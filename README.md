# PayRescue

**AI-Powered Checkout Revenue Recovery Operations Control Room**

PayRescue is an intelligent payment recovery and retry system designed to recover revenue lost from failed checkout/payment transactions through bounded, explainable recovery workflows.

---

## 1. Problem Statement

Failed checkout payments cause significant, unrecovered revenue leakage for e-commerce and subscription merchants. Payments fail due to transient bank outages, customer balance issues, network timeouts, or expired payment instruments. Existing retry mechanisms are rigid and uncoordinated.

---

## 2. Revenue Recovery Architecture

```text
               PAYRESCUE CONTROL ROOM
                         │
                         ▼
                Initial Safety Gate
                         │
                         ▼
           AI Diagnosis (Groq GPT-OSS 120B)
                         │
                   ┌─────┴─────┐
                   │           │
               confidence   confidence
                  >= .80       < .80
                   │              │
                   ▼              ▼
             Policy Engine      Escalate
                   │
                   ▼
            Recovery Action
                   │
                   ▼
            Payment Simulator
                   │
                   ▼
               Audit Log
                   │
                   ▼
                Metrics
```

---

## 3. Implemented Phases Summary

### Phase 1 — Foundation
- [x] Vite + React + TypeScript setup with Tailwind CSS dark fintech theme
- [x] PostgreSQL database schema with 4 core tables: `transactions`, `audit_log` (append-only), `promises_to_pay`, `recovery_runs`
- [x] Core database indexes (`idx_transactions_status`, `idx_audit_transaction`, `idx_p2p_status`)
- [x] 25 curated representative demo transactions (`supabase/seed/seed_demo.sql`)
- [x] 10,000 synthetic payment failure dataset generator (`supabase/seed/generate_seed.js` ➔ `seed_10k.sql`)

### Phase 2 — Deterministic Recovery Engine
- [x] Pure Safety Gate (`evaluateSafety`) enforcing max attempt bounds, risk check blocks, and non-eligible state blocks
- [x] Pure Policy Engine (`evaluatePolicy`) mapping failure categories to bounded recovery actions (`retry_scheduled`, `promise_to_pay`, `alternate_payment`, `escalated`, `stopped`)
- [x] Deterministic Payment Simulator (`simulatePaymentExecution`) evaluating error-reason probability thresholds
- [x] Promise-to-Pay lifecycle service and batch recovery run orchestrator (`runRecoveryBatch`)
- [x] 10 unit test cases passing via Vitest (`npm test`)

### Phase 3 — AI Diagnosis Layer (Groq + GPT-OSS 120B)
- [x] Supabase Edge Function (`supabase/functions/diagnose-payment/index.ts`) calling Groq GPT-OSS 120B securely server-side
- [x] 0.80 Confidence Gate (`isConfidenceAboveThreshold`) escalating low-confidence cases
- [x] AI Output Validator (`validateAIDiagnosisOutput`) ensuring strict JSON schema compliance
- [x] Deterministic Rule Fallback Provider (`FallbackProvider`) ensuring 100% system uptime if AI provider is offline
- [x] Security cleanup: `GROQ_API_KEY` stored exclusively as a server-side Edge Function secret
- [x] 17 unit test cases passing via Vitest (`npm test`)

### Phase 4 — Recovery Operations Control Room
- [x] **Hero Financial Metrics Banner (Money First)**: Displays `₹ AT RISK`, `₹ RECOVERED`, `RECOVERY RATE (%)`, and `₹ REMAINING RISK`
- [x] **Revenue Impact Transformation**: Before vs After recovery comparison visualization
- [x] **5-Stage Recovery Funnel**: Visual conversion pipeline tracking Failed ➔ Diagnosed ➔ Eligible ➔ Intervention ➔ Recovered
- [x] **Live Recovery Activity Feed**: Real-time event log powered by PostgreSQL audit trail
- [x] **Automated Recovery Control Panel**: Prominent `RUN RECOVERY BATCH` button with 5-step execution progress visualization
- [x] **Upgraded Operations Ledger**: Advanced multi-filtering (Search, Status, AI Category, Payment Method) and sorting (Highest/Lowest Amount, Newest, Oldest, Attempts)
- [x] **Operations Inspection Drawer (`TransactionDetailModal`)**: Full visibility into Metadata, AI Diagnosis, Safety Gate vs Policy Decision, P2P Lifecycle, and Append-Only PostgreSQL Audit Trail

---

## 4. Tech Stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS, Lucide React, Recharts
- **Database**: Supabase, PostgreSQL
- **Serverless Edge**: Supabase Edge Functions (`diagnose-payment`)
- **AI Model**: Groq API (GPT-OSS 120B)

---

## 5. Running Locally & Testing

```bash
# Install dependencies
npm install

# Run Vitest test suite
npm test

# Type check
npx tsc --noEmit

# Production build
npm run build

# Start local dev server
npm run dev
```
