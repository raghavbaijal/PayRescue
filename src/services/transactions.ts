import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Transaction } from '../types';
import { DEMO_TRANSACTIONS } from '../data/demoData';

export interface FetchTransactionsResult {
  data: Transaction[];
  count: number;
  isLive: boolean;
  error?: string;
}

export async function fetchTransactions(limit = 25, offset = 0): Promise<FetchTransactionsResult> {
  if (!isSupabaseConfigured()) {
    return {
      data: DEMO_TRANSACTIONS.slice(offset, offset + limit),
      count: DEMO_TRANSACTIONS.length,
      isLive: false
    };
  }

  try {
    const { data, count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[PayRescue] Supabase transaction query error:', error.message);
      return {
        data: DEMO_TRANSACTIONS.slice(offset, offset + limit),
        count: DEMO_TRANSACTIONS.length,
        isLive: false,
        error: error.message
      };
    }

    return {
      data: (data as Transaction[]) || [],
      count: count || 0,
      isLive: true
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return {
      data: DEMO_TRANSACTIONS.slice(offset, offset + limit),
      count: DEMO_TRANSACTIONS.length,
      isLive: false,
      error: message
    };
  }
}
