# PayRescue

**AI-Powered Checkout Revenue Recovery**

PayRescue is an intelligent payment recovery and retry system designed to recover revenue lost from failed checkout/payment transactions through bounded, explainable recovery workflows.

---

## 1. Problem Statement

Failed checkout payments cause significant, unrecovered revenue leakage for e-commerce and subscription merchants. Payments fail due to transient bank outages, customer balance issues, network timeouts, or expired payment instruments. Existing retry mechanisms are rigid and uncoordinated.

---

## 2. Planned Revenue Recovery Workflow

```text
Detect ──► Diagnose ──► Safety Gate ──► Decide ──► Act ──► Measure ──► Audit
```

1. **Detect**: Ingest failed payment webhooks and payloads.
2. **Diagnose**: AI layer analyzes error codes, history, and patterns.
3. **Safety Gate**: Deterministic policy engine enforces bounds and retry safety rules.
4. **Decide**: Choose optimal recovery action (automated retry, Promise-to-Pay, or escalation).
5. **Act**: Execute bounded recovery action.
6. **Measure**: Track recovered revenue and success rates.
7. **Audit**: Maintain an immutable, append-only audit trail for every action.

---

## 3. Current Phase — Phase 1: Foundation

Phase 1 establishes the core database architecture, data schema, realistic synthetic payment-failure dataset, and Supabase integration layer.

### Implemented in Phase 1:
- [x] Vite + React + TypeScript application setup
- [x] Tailwind CSS dark operations control room theme
- [x] Supabase project integration & client initialization
- [x] PostgreSQL database schema with 4 core tables:
  - `transactions` (Primary payment failure ledger; amounts in paise)
  - `audit_log` (Append-only audit trail; strictly no UPDATE/DELETE policies)
  - `promises_to_pay` (Customer payment commitment tracking)
  - `recovery_runs` (Batch recovery run metrics log)
- [x] Core database indexes (`idx_transactions_status`, `idx_audit_transaction`, `idx_p2p_status`)
- [x] 25 curated representative demo transactions (`supabase/seed/seed_demo.sql`)
- [x] 10,000 synthetic payment failure transactions generator (`supabase/seed/generate_seed.js` -> `seed_10k.sql`)
- [x] React frontend transaction read service reading live from Supabase
- [x] PayRescue application shell & control room UI

---

## 4. Tech Stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS, Lucide React, Recharts
- **Database**: Supabase, PostgreSQL
- **Backend / Serverless**: Supabase Edge Functions (Planned)

---

## 5. Database Setup Instructions

To deploy the schema to your Supabase project:

1. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Run the PostgreSQL migration in your Supabase SQL Editor:
   - File: `supabase/migrations/20260821000000_create_payrescue_schema.sql`

3. Seed the demo transactions:
   - File: `supabase/seed/seed_demo.sql`

4. (Optional) Seed 10,000 synthetic transactions:
   - Generate: `node supabase/seed/generate_seed.js`
   - Run generated `supabase/seed/seed_10k.sql` in Supabase SQL Editor.

---

## 6. Future Architecture (Planned for Later Phases)

- **Phase 2 & Beyond**: AI diagnosis layer, deterministic Policy Engine, automated retry orchestrator, Promise-to-Pay workflow engine, payment simulator, and Recharts metrics dashboard.
- *Note*: AI diagnosis and recovery engines are deliberately omitted in Phase 1 according to project roadmap specifications.

---

## 7. Running Locally

```bash
npm install
npm run dev
```
