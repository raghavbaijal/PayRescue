import type { Transaction, TransactionStatus, ErrorSource } from '../../types';
import type { SafetyResult, PolicyResult, RecoveryCategory, RecoveryAction } from '../../types/recovery';

export type AgentDecisionStatus =
  | 'proposed'
  | 'approved'
  | 'blocked'
  | 'executed'
  | 'completed'
  | 'escalated';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityFactors {
  amountRisk: number;        // Normalized score (0 - 25)
  failureSeverity: number;   // Severity score (0 - 25)
  attemptPressure: number;   // Utilization pressure score (0 - 25)
  urgency: number;           // Timing urgency score (0 - 25)
  recoverability: number;    // Recoverability signal score (0 - 25)
}

export interface RecoveryPriority {
  score: number;             // Bounded score 0 - 100
  level: PriorityLevel;
  factors: PriorityFactors;
  reasoning: string;
}

export type RecoveryStrategy =
  | 'retry_now'
  | 'retry_later'
  | 'promise_to_pay'
  | 'alternate_payment'
  | 'escalate'
  | 'stop';

export interface AgentStrategySummary {
  recommended: RecoveryStrategy;
  final: RecoveryStrategy;
  reasoning: string;
}

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
  priority: RecoveryPriority;
  diagnosis?: AgentDiagnosisSummary;
  safety: SafetyResult;
  strategy?: AgentStrategySummary;
  policy?: PolicyResult;
  recommendedAction?: RecoveryAction;
  reasoning: string;
  createdAt: string;
}
