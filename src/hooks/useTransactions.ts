import { useState, useEffect, useCallback } from 'react';
import { fetchTransactions } from '../services/transactions';
import type { FetchTransactionsResult } from '../services/transactions';
import type { Transaction } from '../types';

export function useTransactions(limit = 25, offset = 0) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result: FetchTransactionsResult = await fetchTransactions(limit, offset);
    setTransactions(result.data);
    setTotalCount(result.count);
    setIsLive(result.isLive);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  }, [limit, offset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    transactions,
    totalCount,
    loading,
    isLive,
    error,
    refetch: loadData
  };
}
