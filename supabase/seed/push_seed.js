import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateSyntheticTransactions } from './generate_seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const url = envConfig.VITE_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY;

if (!url || !key || url.includes('placeholder')) {
  console.error('Error: Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(url, key);

const DEMO_TRANSACTIONS = [
  {
    id: '11111111-1111-4111-a111-111111111101',
    razorpay_payment_id: 'pay_demo_001',
    customer_name: 'Rhea Sharma',
    customer_contact: '+91 98123 45678',
    amount_paise: 420000,
    method: 'upi',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'insufficient_funds',
    error_source: 'customer',
    attempts: 1,
    max_attempts: 3,
    status: 'pending'
  },
  {
    id: '11111111-1111-4111-a111-111111111102',
    razorpay_payment_id: 'pay_demo_002',
    customer_name: 'Aarav Patel',
    customer_contact: '+91 98234 56789',
    amount_paise: 1250000,
    method: 'card',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'bank_technical_error',
    error_source: 'bank',
    attempts: 2,
    max_attempts: 3,
    status: 'retry_scheduled'
  },
  {
    id: '11111111-1111-4111-a111-111111111103',
    razorpay_payment_id: 'pay_demo_003',
    customer_name: 'Priya Nair',
    customer_contact: '+91 98345 67890',
    amount_paise: 899000,
    method: 'card',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'card_expired',
    error_source: 'customer',
    attempts: 3,
    max_attempts: 3,
    status: 'stopped'
  },
  {
    id: '11111111-1111-4111-a111-111111111104',
    razorpay_payment_id: 'pay_demo_004',
    customer_name: 'Vikram Malhotra',
    customer_contact: '+91 98456 78901',
    amount_paise: 2499900,
    method: 'netbanking',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'payment_timed_out',
    error_source: 'gateway',
    attempts: 1,
    max_attempts: 3,
    status: 'processing'
  },
  {
    id: '11111111-1111-4111-a111-111111111105',
    razorpay_payment_id: 'pay_demo_005',
    customer_name: 'Ananya Gupta',
    customer_contact: '+91 98567 89012',
    amount_paise: 150000,
    method: 'upi',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'authentication_failed',
    error_source: 'customer',
    attempts: 2,
    max_attempts: 3,
    status: 'pending'
  },
  {
    id: '11111111-1111-4111-a111-111111111106',
    razorpay_payment_id: 'pay_demo_006',
    customer_name: 'Rohan Mehta',
    customer_contact: '+91 98678 90123',
    amount_paise: 4999900,
    method: 'card',
    error_code: 'RISK_CHECK_FAILED',
    error_reason: 'payment_risk_check_failed',
    error_source: 'gateway',
    attempts: 1,
    max_attempts: 3,
    status: 'escalated'
  },
  {
    id: '11111111-1111-4111-a111-111111111107',
    razorpay_payment_id: 'pay_demo_007',
    customer_name: 'Sneha Reddy',
    customer_contact: '+91 98789 01234',
    amount_paise: 349900,
    method: 'wallet',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'insufficient_funds',
    error_source: 'customer',
    attempts: 1,
    max_attempts: 3,
    status: 'promise_to_pay'
  },
  {
    id: '11111111-1111-4111-a111-111111111108',
    razorpay_payment_id: 'pay_demo_008',
    customer_name: 'Kavya Joshi',
    customer_contact: '+91 98890 12345',
    amount_paise: 1800000,
    method: 'upi',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'gateway_technical_error',
    error_source: 'gateway',
    attempts: 2,
    max_attempts: 3,
    status: 'recovered'
  },
  {
    id: '11111111-1111-4111-a111-111111111109',
    razorpay_payment_id: 'pay_demo_009',
    customer_name: 'Devendra Singh',
    customer_contact: '+91 98901 23456',
    amount_paise: 625000,
    method: 'card',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'incorrect_cvv',
    error_source: 'customer',
    attempts: 2,
    max_attempts: 3,
    status: 'pending'
  },
  {
    id: '11111111-1111-4111-a111-111111111110',
    razorpay_payment_id: 'pay_demo_010',
    customer_name: 'Ishaan Verma',
    customer_contact: '+91 99012 34567',
    amount_paise: 1540000,
    method: 'netbanking',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'network_error',
    error_source: 'bank',
    attempts: 3,
    max_attempts: 3,
    status: 'stopped'
  }
];

async function pushSeedData() {
  console.log('Inserting seed records into Supabase transactions table...');
  const { data, error } = await supabase.from('transactions').upsert(DEMO_TRANSACTIONS);
  
  if (error) {
    console.error('Failed to insert seed data:', error.message);
    if (error.code === 'PGRST205') {
      console.log('\n--> NOTICE: Please run the migration SQL file in your Supabase SQL Editor first!');
      console.log('Migration file location: supabase/migrations/20260821000000_create_payrescue_schema.sql\n');
    }
    return;
  }

  console.log('Successfully seeded demo transactions into Supabase!');
}

pushSeedData();
