/**
 * PayRescue 10,000 Synthetic Payment Failure Dataset Generator
 * Generates realistic synthetic payment failure records for benchmarking & analytics.
 * Output: supabase/seed/seed_10k.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIRST_NAMES = [
  'Aarav', 'Rhea', 'Priya', 'Vikram', 'Ananya', 'Rohan', 'Sneha', 'Kavya', 'Devendra', 'Ishaan',
  'Meera', 'Siddharth', 'Tanvi', 'Aditya', 'Rahul', 'Neha', 'Kabir', 'Pooja', 'Sanjana', 'Amit',
  'Varun', 'Divya', 'Arjun', 'Tara', 'Karan', 'Shreya', 'Manish', 'Deepika', 'Rajesh', 'Sunita',
  'Nikhil', 'Poonam', 'Gaurav', 'Swati', 'Harsh', 'Bhavna', 'Suresh', 'Komal', 'Alok', 'Ritu'
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Nair', 'Malhotra', 'Gupta', 'Mehta', 'Reddy', 'Joshi', 'Singh', 'Verma',
  'Bannerjee', 'Rao', 'Agarwal', 'Kapoor', 'Saxena', 'Deshmukh', 'Das', 'Choudhury', 'Roy', 'Trivedi',
  'Iyer', 'Menon', 'Kumar', 'Jain', 'Shah', 'Bhat', 'Dube', 'Kulkarni', 'Chawla', 'Hegde'
];

// Generate pool of ~1,500 unique customers for realistic repeat customer histories
const CUSTOMER_POOL = Array.from({ length: 1500 }, (_, i) => {
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  const phone = `+91 ${9800000000 + (i * 12345) % 199999999}`;
  return {
    name: `${firstName} ${lastName}`,
    contact: phone
  };
});

const REASON_SPECS = [
  // Retryable Bank/Gateway Errors (~40%)
  { reason: 'bank_technical_error', source: 'bank', code: 'GATEWAY_ERROR', weight: 20 },
  { reason: 'gateway_technical_error', source: 'gateway', code: 'GATEWAY_ERROR', weight: 10 },
  { reason: 'payment_timed_out', source: 'gateway', code: 'GATEWAY_ERROR', weight: 6 },
  { reason: 'network_error', source: 'bank', code: 'GATEWAY_ERROR', weight: 4 },

  // Customer/Payment Method Errors (~40%)
  { reason: 'insufficient_funds', source: 'customer', code: 'BAD_REQUEST_ERROR', weight: 25 },
  { reason: 'payment_cancelled', source: 'customer', code: 'BAD_REQUEST_ERROR', weight: 8 },
  { reason: 'card_expired', source: 'customer', code: 'BAD_REQUEST_ERROR', weight: 5 },
  { reason: 'debit_instrument_blocked', source: 'customer', code: 'GATEWAY_ERROR', weight: 2 },

  // Authentication Errors (~15%)
  { reason: 'authentication_failed', source: 'customer', code: 'BAD_REQUEST_ERROR', weight: 10 },
  { reason: 'incorrect_cvv', source: 'customer', code: 'BAD_REQUEST_ERROR', weight: 5 },

  // Risk Errors (~5%)
  { reason: 'payment_risk_check_failed', source: 'gateway', code: 'RISK_CHECK_FAILED', weight: 5 }
];

const METHOD_SPECS = [
  { method: 'upi', weight: 50 },
  { method: 'card', weight: 30 },
  { method: 'netbanking', weight: 15 },
  { method: 'wallet', weight: 5 }
];

const STATUS_SPECS = [
  { status: 'pending', weight: 35 },
  { status: 'retry_scheduled', weight: 20 },
  { status: 'recovered', weight: 20 },
  { status: 'stopped', weight: 15 },
  { status: 'promise_to_pay', weight: 5 },
  { status: 'escalated', weight: 3 },
  { status: 'processing', weight: 2 }
];

function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    if (random < item.weight) return item;
    random -= item.weight;
  }
  return items[0];
}

function getRandomAmountPaise() {
  const tiers = [
    { min: 19900, max: 99900, weight: 40 },       // ₹199 - ₹999
    { min: 100000, max: 499900, weight: 35 },     // ₹1,000 - ₹4,999
    { min: 500000, max: 2499900, weight: 15 },    // ₹5,000 - ₹24,999
    { min: 2500000, max: 15000000, weight: 10 }   // ₹25,000 - ₹1,50,000
  ];
  const tier = weightedRandom(tiers);
  const raw = Math.floor(Math.random() * (tier.max - tier.min + 1)) + tier.min;
  return Math.round(raw / 100) * 100; // round to nearest rupee in paise
}

export function generateSyntheticTransactions(count = 10000) {
  const rows = [];
  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (let i = 1; i <= count; i++) {
    const customer = CUSTOMER_POOL[Math.floor(Math.random() * CUSTOMER_POOL.length)];
    const reasonSpec = weightedRandom(REASON_SPECS);
    const methodSpec = weightedRandom(METHOD_SPECS);
    const statusSpec = weightedRandom(STATUS_SPECS);
    const amountPaise = getRandomAmountPaise();

    const createdTime = new Date(nowMs - Math.floor(Math.random() * thirtyDaysMs));
    const updatedTime = new Date(createdTime.getTime() + Math.floor(Math.random() * (24 * 60 * 60 * 1000)));

    const attempts = statusSpec.status === 'recovered' || statusSpec.status === 'stopped' 
      ? Math.floor(Math.random() * 3) + 1 
      : Math.floor(Math.random() * 2) + 1;

    rows.push({
      razorpay_payment_id: `pay_synth_${String(i).padStart(6, '0')}`,
      customer_name: customer.name,
      customer_contact: customer.contact,
      amount_paise: amountPaise,
      method: methodSpec.method,
      error_code: reasonSpec.code,
      error_reason: reasonSpec.reason,
      error_source: reasonSpec.source,
      attempts: attempts,
      max_attempts: 3,
      status: statusSpec.status,
      created_at: createdTime.toISOString(),
      updated_at: updatedTime.toISOString()
    });
  }

  return rows;
}

function buildSqlInsertScript(transactions) {
  let sql = `-- ============================================================================\n`;
  sql += `-- PayRescue Synthetic Dataset (${transactions.length} Transactions)\n`;
  sql += `-- Auto-generated on ${new Date().toISOString()}\n`;
  sql += `-- ============================================================================\n\n`;

  const BATCH_SIZE = 500;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    sql += `insert into transactions (razorpay_payment_id, customer_name, customer_contact, amount_paise, method, error_code, error_reason, error_source, attempts, max_attempts, status, created_at, updated_at) values\n`;
    
    const valueTuples = batch.map(t => {
      const nameEsc = t.customer_name.replace(/'/g, "''");
      const contactEsc = t.customer_contact ? `'${t.customer_contact.replace(/'/g, "''")}'` : 'null';
      return `  ('${t.razorpay_payment_id}', '${nameEsc}', ${contactEsc}, ${t.amount_paise}, '${t.method}', '${t.error_code}', '${t.error_reason}', '${t.error_source}', ${t.attempts}, ${t.max_attempts}, '${t.status}', '${t.created_at}', '${t.updated_at}')`;
    });

    sql += valueTuples.join(',\n') + ';\n\n';
  }

  return sql;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Generating 10,000 synthetic payment failure transactions...');
  const txs = generateSyntheticTransactions(10000);
  const sql = buildSqlInsertScript(txs);
  const outputPath = path.join(__dirname, 'seed_10k.sql');
  fs.writeFileSync(outputPath, sql, 'utf8');
  console.log(`Successfully generated 10,000 transactions seed SQL file at: ${outputPath}`);
}
