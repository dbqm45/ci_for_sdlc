import type { Severity } from './model.js';

export const SEVERITY_ACTIONS = ['block', 'notify', 'record'] as const;
export type SeverityAction = (typeof SEVERITY_ACTIONS)[number];

/**
 * What a meaningful change after approval does (P4).
 *  warn            — flags the item with a warning finding
 *  review_required — NOT READY until re-approved or confirmed "still valid"
 *  invalidate      — revokes the approval; the item has to be approved again
 */
export const DRIFT_REACTIONS = ['warn', 'review_required', 'invalidate'] as const;
export type DriftReaction = (typeof DRIFT_REACTIONS)[number];

/**
 * What a blocking-severity AI finding does to readiness.
 *  block                — blocks on its own, like a rule finding
 *  require_confirmation — needs attention until a human confirms it; then it blocks
 *  notify               — never blocks, only needs attention
 */
export const AI_FINDINGS_ACTIONS = ['block', 'require_confirmation', 'notify'] as const;
export type AiFindingsAction = (typeof AI_FINDINGS_ACTIONS)[number];

/**
 * Organization policy: what each severity does to readiness.
 *  block  — open finding makes the item NOT READY
 *  notify — item NEEDS ATTENTION, surfaced in notifications
 *  record — kept for audit only, does not change status
 */
export interface AnalysisPolicy {
  actions: Record<Severity, SeverityAction>;
  /** Rule ids switched off by the organization. */
  disabledRules: string[];
  /** Optional in stored settings written before it existed; read through `aiFindingsAction`. */
  aiFindings?: AiFindingsAction;
  /** Optional in stored settings written before it existed; read through `driftReactionOf`. */
  driftReaction?: DriftReaction;
}

export const DEFAULT_POLICY: AnalysisPolicy = {
  actions: { critical: 'block', warning: 'notify', info: 'record' },
  disabledRules: [],
  aiFindings: 'require_confirmation',
  driftReaction: 'review_required',
};

export const aiFindingsAction = (p: AnalysisPolicy): AiFindingsAction => p.aiFindings ?? 'require_confirmation';

export const driftReactionOf = (p: AnalysisPolicy): DriftReaction => p.driftReaction ?? 'review_required';
