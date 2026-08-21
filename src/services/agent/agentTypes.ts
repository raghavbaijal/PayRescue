import type { Transaction, TransactionStatus, ErrorSource } from '../../types';
import type { SafetyResult, PolicyResult, RecoveryCategory, RecoveryAction } from '../../types/recovery';

export type AgentDecisionStatus =
  | 'proposed'
  | 'approved'
  | 'blocked'
  | 'executed'
  | 'completed'
  | 'escalated';

export interface RecoveryContext {
  transaction: Transaction;

  transactionHistory?: {
    previousAttempts: number;
    previousStatus?: TransactionStatus;
    previousActions?: string[];
  };

  recovery: {
    amountAtRiskPaise: number;
    currentStatus: TransactionStatus;
    attempts: number;
    maxAttempts: number;
  };

  failure: {
    reason: string;
    source?: ErrorSource | string;
    code?: string;
  };
}

export interface AgentDiagnosisSummary {
  category: RecoveryCategory;
  rootCause: string;
  confidence: number;
  reasoning: string;
  provider?: string;
  isFallback?: boolean;
}

export interface AgentDecision {
  transactionId: string;
  razorpayPaymentId: string;
  status: AgentDecisionStatus;
  context: RecoveryContext;
  diagnosis?: AgentDiagnosisSummary;
  safety: SafetyResult;
  policy?: PolicyResult;
  recommendedAction?: RecoveryAction;
  reasoning: string;
  createdAt: string;
}
