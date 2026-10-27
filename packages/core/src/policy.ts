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

/** Accepted format of acceptance criteria (pdi contract 0.4.0): any unit outside it fires AC-001; any/off never do. */
export const AC_FORMATS = ['gwt', 'ears', 'any', 'off'] as const;
export type AcFormatPolicy = (typeof AC_FORMATS)[number];

/**
 * A2a: what an answer found in a source does to a finding's question.
 *  off     — nothing is proposed
 *  suggest — the finding offers the answer; a person accepts, edits or rejects it
 *  apply   — the server records the decision itself (autonomy level 1); set only by an admin, never by default
 */
export const AUTO_CLOSE_MODES = ['off', 'suggest', 'apply'] as const;
export type AutoCloseMode = (typeof AUTO_CLOSE_MODES)[number];

export const REQUIRE_FLAG = ['user_facing', 'all', 'off'] as const;
export type RequireFlagPolicy = (typeof REQUIRE_FLAG)[number];

/** Thresholds of the release-plan rules (REL-001…006). */
export interface ReleasePolicy {
  /** REL-003: R1 holds more than this share of the epic's stories, in percent. */
  maxMvpPercent: number;
  /** REL-006: which stories in a release line need a feature flag. */
  requireFlag: RequireFlagPolicy;
}

export const DEFAULT_RELEASE: ReleasePolicy = { maxMvpPercent: 60, requireFlag: 'user_facing' };

/** Thresholds of the story-shape rules (STORY-001…003, AC-001…004). */
export interface StoryShapePolicy {
  acFormat: AcFormatPolicy;
  /** STORY-002: more scenarios than this. */
  maxScenarios: number;
  /** STORY-002: more distinct main actions than this. */
  maxActions: number;
  /** STORY-002: an estimate at or above this many story points. */
  maxStoryPoints: number;
}

/** The pdi contract 0.4.0 default (story-shape expected.json `policy`). */
export const DEFAULT_STORY_SHAPE: StoryShapePolicy = { acFormat: 'gwt', maxScenarios: 6, maxActions: 3, maxStoryPoints: 13 };

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
  /** Optional in stored settings written before it existed; read through `storyShapeOf`. */
  storyShape?: Partial<StoryShapePolicy>;
  /** Optional in stored settings written before it existed; read through `releaseOf`. */
  release?: Partial<ReleasePolicy>;
  /** Optional in stored settings written before it existed; read through `autoCloseOf` (A2a). */
  autoClose?: AutoCloseMode;
}

export const DEFAULT_POLICY: AnalysisPolicy = {
  actions: { critical: 'block', warning: 'notify', info: 'record' },
  disabledRules: [],
  aiFindings: 'require_confirmation',
  driftReaction: 'review_required',
  storyShape: { ...DEFAULT_STORY_SHAPE },
  release: { ...DEFAULT_RELEASE },
  autoClose: 'suggest',
};

export const aiFindingsAction = (p: AnalysisPolicy): AiFindingsAction => p.aiFindings ?? 'require_confirmation';

export const driftReactionOf = (p: AnalysisPolicy): DriftReaction => p.driftReaction ?? 'review_required';

export const storyShapeOf = (p: AnalysisPolicy): StoryShapePolicy => ({ ...DEFAULT_STORY_SHAPE, ...p.storyShape });

export const releaseOf = (p: AnalysisPolicy): ReleasePolicy => ({ ...DEFAULT_RELEASE, ...p.release });

export const autoCloseOf = (p: AnalysisPolicy): AutoCloseMode => p.autoClose ?? 'suggest';
