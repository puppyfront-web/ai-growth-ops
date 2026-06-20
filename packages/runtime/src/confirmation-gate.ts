import type { ConfirmationGate, GateDecision, GateInput } from './types.js';

const LOW_RISK_CONFIDENCE_FLOOR = 0.7;

export class DefaultConfirmationGate implements ConfirmationGate {
  check(input: GateInput): GateDecision {
    if (input.dryRun) {
      return {
        allowed: false,
        escalated: false,
        reason: 'dry-run mode: write simulated, not executed',
        simulatedOutput: { dryRun: true, toolName: input.toolName, input: input.input }
      };
    }
    if (input.mutate === 'Read') {
      return { allowed: true, escalated: false, reason: 'read-only tool' };
    }
    // mutate === 'Write'
    switch (input.autonomyLevel) {
      case 'L1_COPILOT':
        return { allowed: false, escalated: true, reason: 'L1 copilot: all writes require human approval' };
      case 'L3_FULL_AUTOPILOT':
        return { allowed: true, escalated: false, reason: 'L3 full autopilot: write auto-executed' };
      case 'L2_AUTOPILOT_LIGHT':
      default: {
        const autoApprove = input.risk === 'low' && input.confidence >= LOW_RISK_CONFIDENCE_FLOOR;
        return autoApprove
          ? { allowed: true, escalated: false, reason: `L2 auto-approve (risk=${input.risk}, confidence=${input.confidence})` }
          : { allowed: false, escalated: true, reason: `L2 escalate (risk=${input.risk}, confidence=${input.confidence})` };
      }
    }
  }
}

export function createConfirmationGate(): ConfirmationGate {
  return new DefaultConfirmationGate();
}
