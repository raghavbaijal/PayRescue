import type { SafetyResult, PolicyResult } from '../../types/recovery';
import type { AIDiagnosisResult } from '../ai/aiTypes';
import type { RecoveryContext, RecoveryStrategy, AgentStrategySummary, RecoveryMemory } from './agentTypes';

/**
 * Selects recommended recovery strategy based on AI diagnosis, failure context, and historical memory.
 * Enforces authoritative Safety Gate and Policy Engine override rules.
 * 
 * Safety & Policy Engine Authority Rule:
 * Historical memory is ADVISORY INTELLIGENCE ONLY.
 * The Strategy Selector recommends a strategy informed by diagnosis and memory,
 * but deterministic Policy Engine and Safety Gate results ALWAYS retain final execution authority.
 */
export function selectRecoveryStrategy(
  context: RecoveryContext,
  safetyResult: SafetyResult,
  aiDiagnosis?: AIDiagnosisResult | null,
  policyResult?: PolicyResult | null,
  memory?: RecoveryMemory
): AgentStrategySummary {
  const category = aiDiagnosis?.category || 'unknown';
  const isDue = !context.transaction.next_retry_at || new Date(context.transaction.next_retry_at).getTime() <= Date.now();

  // 1. Initial Strategy Recommendation based on AI Diagnosis & Failure Category
  let recommended: RecoveryStrategy = 'escalate';

  switch (category) {
    case 'retryable':
    case 'authentication_failure':
      recommended = isDue ? 'retry_now' : 'retry_later';
      break;

    case 'insufficient_funds':
      recommended = 'promise_to_pay';
      break;

    case 'invalid_payment_method':
      recommended = 'alternate_payment';
      break;

    case 'risk_failure':
    case 'unknown':
    default:
      recommended = 'escalate';
      break;
  }

  // 2. Advisory Historical Memory Signal Integration (Advisory Only!)
  let memoryReasoningHint = '';
  if (memory && memory.confidence >= 0.50 && memory.sampleSize >= 5) {
    const retryLaterStats = memory.outcomesByAction['retry_later'];
    const retryNowStats = memory.outcomesByAction['retry_now'];

    if ((category === 'retryable' || category === 'authentication_failure') && retryLaterStats && retryNowStats) {
      if (retryLaterStats.attempts >= 2 && retryLaterStats.recoveryRate > retryNowStats.recoveryRate + 10) {
        recommended = 'retry_later';
        memoryReasoningHint = ` [Memory Intelligence]: Advisory signal favors 'retry_later' (${retryLaterStats.recoveryRate}% historical success vs ${retryNowStats.recoveryRate}% for retry_now across ${memory.sampleSize} similar cases).`;
      }
    }
  }

  // 3. Enforce Deterministic Safety Gate & Policy Engine Authority (POLICY & SAFETY MUST WIN!)
  let finalStrategy: RecoveryStrategy = recommended;
  let authoritySource = 'AI Diagnosis Recommendation';

  if (safetyResult.decision !== 'eligible') {
    authoritySource = 'Safety Gate Boundary';
    if (safetyResult.decision === 'escalated' || safetyResult.actionIfBlocked === 'escalated') {
      finalStrategy = 'escalate';
    } else if (safetyResult.actionIfBlocked === 'alternate_payment') {
      finalStrategy = 'alternate_payment';
    } else {
      finalStrategy = 'stop';
    }
  } else if (policyResult) {
    authoritySource = 'Deterministic Policy Engine';
    switch (policyResult.action) {
      case 'retry_scheduled':
        finalStrategy = (recommended === 'retry_later' || !isDue) ? 'retry_later' : 'retry_now';
        break;

      case 'promise_to_pay':
        finalStrategy = 'promise_to_pay';
        break;

      case 'alternate_payment':
        finalStrategy = 'alternate_payment';
        break;

      case 'escalated':
        finalStrategy = 'escalate';
        break;

      case 'stopped':
        finalStrategy = 'stop';
        break;
    }
  }

  // 4. Construct Reasoning Narrative
  let reasoning = `Strategy selector recommended '${recommended}'${memoryReasoningHint}, aligned with ${authoritySource} final strategy '${finalStrategy}'.`;

  if (recommended !== finalStrategy) {
    reasoning = `Strategy selector recommended '${recommended}' based on diagnosis/memory intelligence, but ${authoritySource} enforced final strategy '${finalStrategy}' (${safetyResult.decision !== 'eligible' ? safetyResult.reason : policyResult?.reason || 'Policy boundary enforced'}).`;
  }

  return {
    recommended,
    final: finalStrategy,
    reasoning
  };
}
