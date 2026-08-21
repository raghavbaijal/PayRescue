import type { Transaction } from '../../types';
import type { RecoveryMemory, ActionOutcomeStats, CategoryOutcomeStats } from './agentTypes';
import { DEMO_TRANSACTIONS } from '../../data/demoData';

/**
 * Maps transaction error reasons to failure categories deterministically.
 */
function deriveCategoryFromTransaction(tx: Transaction): string {
  if (tx.error_source === 'risk' || tx.error_reason === 'payment_risk_check_failed') {
    return 'risk_failure';
  }
  if (tx.error_reason === 'card_expired' || tx.error_reason === 'debit_instrument_blocked') {
    return 'invalid_payment_method';
  }
  if (tx.error_reason === 'insufficient_funds') {
    return 'insufficient_funds';
  }
  if (
    tx.error_reason === 'payment_timed_out' ||
    tx.error_reason === 'bank_technical_error' ||
    tx.error_reason === 'gateway_technical_error' ||
    tx.error_reason === 'temporary_bank_timeout'
  ) {
    return 'retryable';
  }
  if (tx.error_reason === 'authentication_failed' || tx.error_reason === 'invalid_otp') {
    return 'authentication_failure';
  }
  return 'unknown';
}

/**
 * Calculates sample-size based memory confidence score (0.00 - 1.00).
 * Completely separate from AI Diagnosis confidence.
 */
function calculateMemoryConfidence(sampleSize: number): number {
  if (sampleSize >= 25) return 1.00;
  if (sampleSize >= 10) return 0.75;
  if (sampleSize >= 5) return 0.50;
  if (sampleSize >= 1) return 0.25;
  return 0.00;
}

/**
 * Deterministically aggregates historical recovery outcomes for a transaction.
 * Pure, side-effect free, read-only memory component.
 */
export function getRecoveryMemorySync(
  transaction: Transaction,
  historicalDataset: Transaction[] = DEMO_TRANSACTIONS
): RecoveryMemory {
  if (!transaction) {
    throw new Error('[getRecoveryMemorySync]: Transaction is required.');
  }

  const dataset = historicalDataset || [];
  const targetCategory = deriveCategoryFromTransaction(transaction);

  // Filter 1: Exact Error Reason Matching
  const exactMatches = dataset.filter(t => t.error_reason === transaction.error_reason && t.id !== transaction.id);

  // Filter 2: Failure Category Matching
  const categoryMatches = dataset.filter(t => deriveCategoryFromTransaction(t) === targetCategory && t.id !== transaction.id);

  // Determine Matching Level Hierarchy
  let matchedCases: Transaction[] = [];
  let matchingLevel: 'exact_reason' | 'failure_category' | 'broad_history' = 'broad_history';

  if (exactMatches.length >= 3) {
    matchedCases = exactMatches;
    matchingLevel = 'exact_reason';
  } else if (categoryMatches.length >= 3) {
    matchedCases = categoryMatches;
    matchingLevel = 'failure_category';
  } else if (exactMatches.length > 0) {
    matchedCases = exactMatches;
    matchingLevel = 'exact_reason';
  } else if (categoryMatches.length > 0) {
    matchedCases = categoryMatches;
    matchingLevel = 'failure_category';
  } else {
    matchedCases = dataset.filter(t => t.id !== transaction.id);
    matchingLevel = 'broad_history';
  }

  const sampleSize = matchedCases.length;
  const confidence = calculateMemoryConfidence(sampleSize);

  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      historicalCases: 0,
      recoveredCases: 0,
      recoveryRate: 0,
      totalAttemptedAmountPaise: 0,
      totalRecoveredAmountPaise: 0,
      averageAttemptsToRecovery: null,
      outcomesByAction: {},
      outcomesByFailureCategory: {},
      matchingLevel,
      similarCaseSummary: `No prior historical cases found for matching level '${matchingLevel}'. Memory confidence: 0.00.`,
      confidence: 0.00
    };
  }

  // Aggregate stats
  let recoveredCount = 0;
  let totalAttemptedPaise = 0;
  let totalRecoveredPaise = 0;
  let totalAttemptsForRecovered = 0;

  const outcomesByAction: Record<string, ActionOutcomeStats> = {
    retry_now: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 },
    retry_later: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 },
    promise_to_pay: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 },
    alternate_payment: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 },
    escalate: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 },
    stop: { attempts: 0, recovered: 0, recoveryRate: 0, amountRecoveredPaise: 0 }
  };

  const outcomesByFailureCategory: Record<string, CategoryOutcomeStats> = {};

  matchedCases.forEach(item => {
    totalAttemptedPaise += item.amount_paise;
    const itemCat = deriveCategoryFromTransaction(item);

    if (!outcomesByFailureCategory[itemCat]) {
      outcomesByFailureCategory[itemCat] = { cases: 0, recovered: 0, recoveryRate: 0 };
    }
    outcomesByFailureCategory[itemCat].cases += 1;

    const isRecovered = item.status === 'recovered';
    const isPromise = item.status === 'promise_to_pay';
    const isEscalated = item.status === 'escalated';

    if (isRecovered) {
      recoveredCount += 1;
      totalRecoveredPaise += item.amount_paise;
      totalAttemptsForRecovered += item.attempts;
      outcomesByFailureCategory[itemCat].recovered += 1;
    }

    // Determine implied strategy action from outcome state
    let actionKey = 'retry_now';
    if (isRecovered) {
      actionKey = item.attempts > 1 ? 'retry_later' : 'retry_now';
    } else if (isPromise) {
      actionKey = 'promise_to_pay';
    } else if (isEscalated) {
      actionKey = 'escalate';
    } else if (item.status === 'stopped') {
      actionKey = item.error_reason === 'card_expired' ? 'alternate_payment' : 'stop';
    }

    if (outcomesByAction[actionKey]) {
      outcomesByAction[actionKey].attempts += 1;
      if (isRecovered) {
        outcomesByAction[actionKey].recovered += 1;
        outcomesByAction[actionKey].amountRecoveredPaise += item.amount_paise;
      }
    }
  });

  // Calculate percentage rates
  const recoveryRate = Math.round((recoveredCount / sampleSize) * 100);
  const averageAttemptsToRecovery = recoveredCount > 0
    ? Number((totalAttemptsForRecovered / recoveredCount).toFixed(1))
    : null;

  Object.keys(outcomesByAction).forEach(key => {
    const act = outcomesByAction[key];
    act.recoveryRate = act.attempts > 0 ? Math.round((act.recovered / act.attempts) * 100) : 0;
  });

  Object.keys(outcomesByFailureCategory).forEach(key => {
    const cat = outcomesByFailureCategory[key];
    cat.recoveryRate = cat.cases > 0 ? Math.round((cat.recovered / cat.cases) * 100) : 0;
  });

  // Determine best historical strategy hint
  let bestStrategy = 'retry_now';
  let highestRate = -1;
  Object.keys(outcomesByAction).forEach(key => {
    if (outcomesByAction[key].attempts >= 2 && outcomesByAction[key].recoveryRate > highestRate) {
      highestRate = outcomesByAction[key].recoveryRate;
      bestStrategy = key;
    }
  });

  const levelLabel = matchingLevel === 'exact_reason'
    ? `exact reason '${transaction.error_reason}'`
    : matchingLevel === 'failure_category'
    ? `failure category '${targetCategory}'`
    : 'broader historical dataset';

  const similarCaseSummary = `Historical memory analyzed ${sampleSize} similar cases for ${levelLabel}. ${recoveredCount} recovered successfully (${recoveryRate}% recovery rate). Best performing historical strategy: '${bestStrategy}' (${highestRate >= 0 ? highestRate : 0}% success). Memory confidence: ${confidence.toFixed(2)}.`;

  return {
    sampleSize,
    historicalCases: sampleSize,
    recoveredCases: recoveredCount,
    recoveryRate,
    totalAttemptedAmountPaise: totalAttemptedPaise,
    totalRecoveredAmountPaise: totalRecoveredPaise,
    averageAttemptsToRecovery,
    outcomesByAction,
    outcomesByFailureCategory,
    matchingLevel,
    similarCaseSummary,
    confidence
  };
}

/**
 * Async wrapper for getRecoveryMemorySync (supports future database expansion seamlessly).
 */
export async function getRecoveryMemory(
  transaction: Transaction,
  historicalDataset?: Transaction[]
): Promise<RecoveryMemory> {
  return getRecoveryMemorySync(transaction, historicalDataset);
}
