import type { TransactionStatus } from './index';

export type RecoveryCategory =
  | 'retryable'
  | 'insufficient_funds'
  | 'invalid_payment_method'
  | 'authentication_failure'
  | 'risk_failure'
  | 'unknown';

export type RecoveryAction =
  | 'retry_scheduled'
  | 'promise_to_pay'
  | 'alternate_payment'
  | 'escalated'
  | 'stopped';

export type RecoveryOutcome =
  | 'recovered'
  | 'failed'
  | 'pending'
  | 'escalated'
  | 'stopped';

export type SafetyDecisionStatus = 'eligible' | 'blocked' | 'escalated';

export interface SafetyResult {
  decision: SafetyDecisionStatus;
  reason: string;
  actionIfBlocked?: RecoveryAction;
}

export interface PolicyResult {
  action: RecoveryAction;
  category: RecoveryCategory;
  reason: string;
}

export interface SimulationResult {
  action: RecoveryAction;
  outcome: 'recovered' | 'failed';
  simulatedSuccess: boolean;
  reason: string;
}

export interface RecoveryEngineResult {
  transactionId: string;
  razorpayPaymentId: string;
  previousStatus: TransactionStatus;
  newStatus: TransactionStatus;
  category: RecoveryCategory;
  actionTaken: RecoveryAction;
  safetyResult: SafetyResult;
  policyResult?: PolicyResult;
  simulationResult?: SimulationResult;
  decisionReason: string;
  error?: string;
  persistenceError?: boolean;
}

export interface BatchRecoverySummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  transactionsProcessed: number;
  totalAtRiskPaise: number;
  totalRecoveredPaise: number;
  results: RecoveryEngineResult[];
}

export interface RecoveryFunnelMetrics {
  failed: number;
  diagnosed: number;
  eligible: number;
  intervention: number;
  recovered: number;
  escalated: number;
  stopped: number;
}

export interface RecoveryMetrics {
  totalTransactions: number;
  totalFailedExposurePaise: number; // Historical sum of all failed transaction amounts
  currentlyAtRiskPaise: number;     // Currently unresolved financial exposure (pending, retry_scheduled, promise_to_pay)
  totalAtRiskPaise: number;         // Backward compatibility alias for totalFailedExposurePaise
  totalRecoveredPaise: number;      // Sum of recovered amounts
  remainingAtRiskPaise: number;     // Alias for currentlyAtRiskPaise
  recoveryRate: number;             // percentage (0 - 100)
  recoveredCount: number;
  escalatedCount: number;
  stoppedCount: number;
  activeP2PCount: number;
  pendingCount: number;
  funnel: RecoveryFunnelMetrics;
}
