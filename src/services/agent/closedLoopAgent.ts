import type { Transaction } from '../../types';
import type { ClosedLoopOptions, ClosedLoopResult, ClosedLoopStatus, AgentStep } from './agentTypes';
import { runRecoveryAgent, executeAgentDecision } from './agentOrchestrator';

/**
 * Closed-Loop Recovery Agent Orchestrator (Phase 5.5 Final Architecture).
 * 
 * Coordinates the full agent execution lifecycle:
 * UNDERSTAND ➔ PRIORITIZE ➔ DECIDE ➔ CHECK AUTHORITY ➔ ACT ➔ OBSERVE ➔ RE-EVALUATE ➔ CONTINUE OR TERMINATE
 * 
 * Architectural Controls:
 * 1. Bounded Execution: Enforces maxSteps limit (default = 3) to prevent infinite loops.
 * 2. Terminal State Short-Circuit: Immediately halts upon reaching 'recovered', 'escalated', or 'stopped'.
 * 3. Scheduled Retry Exit: Halts immediately when retry is scheduled for a future window without sleeping.
 * 4. Per-Step Authority Verification: Safety Gate and Policy Engine are re-evaluated for every step.
 * 5. Persistence Safety: Halts loop immediately if database persistence fails.
 */
export async function runClosedLoopRecovery(
  transaction: Transaction,
  options?: ClosedLoopOptions
): Promise<ClosedLoopResult> {
  const startedAt = new Date().toISOString();
  const maxSteps = options?.maxSteps ?? 3;
  let currentTx: Transaction = { ...transaction };
  const steps: AgentStep[] = [];
  let totalRecoveredAmountPaise = 0;
  let finalStatus: ClosedLoopStatus = 'blocked';
  let terminationReason = 'unknown';

  let stepCounter = 0;

  try {
    while (stepCounter < maxSteps) {
      stepCounter++;
      const stepStart = new Date().toISOString();

      // 1. Decision Step (Pure, side-effect-free reasoning + memory loading + priority + safety + policy)
      const decision = await runRecoveryAgent(currentTx, options?.historicalDataset);

      // 2. Check if decision is blocked or escalated before execution
      if (decision.status === 'blocked' || decision.status === 'escalated' || decision.safety.decision !== 'eligible') {
        const stepCompletedAt = new Date().toISOString();
        steps.push({
          step: stepCounter,
          decision,
          startedAt: stepStart,
          completedAt: stepCompletedAt
        });

        finalStatus = decision.status === 'escalated' ? 'escalated' : 'blocked';
        terminationReason = decision.reasoning;
        break;
      }

      // 3. Controlled Execution (Execution Gate re-verifies Safety & Policy against currentTx)
      const execResult = await executeAgentDecision(currentTx, decision);
      const { execution, outcome } = execResult;

      // 4. Update local transaction state for next step / final state
      currentTx = {
        ...currentTx,
        status: execResult.newTransactionStatus,
        attempts: execution.attempts ?? currentTx.attempts,
        next_retry_at: execution.nextRetryAt ?? currentTx.next_retry_at,
        updated_at: execResult.completedAt
      };

      if (outcome.recoveredAmountPaise > 0) {
        totalRecoveredAmountPaise += outcome.recoveredAmountPaise;
      }

      // 5. Record Step History
      steps.push({
        step: stepCounter,
        decision,
        execution,
        outcome,
        startedAt: stepStart,
        completedAt: execResult.completedAt
      });

      // 6. Check Persistence & Execution Failures
      if (execution.persistenceError) {
        finalStatus = 'blocked';
        terminationReason = 'persistence_failed';
        break;
      }

      if (execution.status === 'failed' || execution.status === 'blocked') {
        finalStatus = 'blocked';
        terminationReason = execution.reason;
        break;
      }

      // 7. Evaluate Terminal vs Continuation Outcomes
      if (outcome.result === 'recovered') {
        finalStatus = 'recovered';
        terminationReason = 'recovered';
        break;
      }

      if (outcome.result === 'escalated') {
        finalStatus = 'escalated';
        terminationReason = 'escalated';
        break;
      }

      if (outcome.result === 'stopped') {
        finalStatus = 'stopped';
        terminationReason = outcome.reason || 'stopped';
        break;
      }

      if (outcome.result === 'scheduled') {
        finalStatus = 'scheduled';
        terminationReason = 'retry_scheduled';
        break;
      }

      if (outcome.result === 'promise_created') {
        finalStatus = 'promise_created';
        terminationReason = 'promise_created';
        break;
      }

      // 8. Max Steps Limit Boundary
      if (stepCounter >= maxSteps) {
        finalStatus = 'max_steps_reached';
        terminationReason = 'max_steps_reached';
        break;
      }
    }
  } catch (err) {
    console.error(`[ClosedLoopAgent Exception ${transaction.id}]:`, err);
    finalStatus = 'blocked';
    terminationReason = err instanceof Error ? err.message : 'execution_error';
  }

  const completedAt = new Date().toISOString();

  return {
    transactionId: transaction.id,
    status: finalStatus,
    steps,
    totalSteps: steps.length,
    totalRecoveredAmountPaise,
    startedAt,
    completedAt,
    terminationReason,
    finalTransactionState: currentTx
  };
}
