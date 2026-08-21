import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const url = envConfig.VITE_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY;

console.log('Connecting to Supabase at:', url);

const supabase = createClient(url, key);

async function checkDatabase() {
  try {
    const { data, error, count } = await supabase.from('transactions').select('*', { count: 'exact' });
    if (error) {
      console.error('Query Error:', error.message, error.code, error.details);
      return;
    }
    console.log(`Successfully connected! Found ${count} records in 'transactions' table.`);
    console.log('Sample Data:', data?.slice(0, 3));
  } catch (err) {
    console.error('Connection Exception:', err);
  }
}

checkDatabase();
