/**
 * Core domain model of Continuous Intelligence.
 *
 * Scope (MVP): product definition only — Jira (requirements), Confluence
 * (knowledge / business rules / decisions) and Figma (design). Source code is
 * intentionally out of scope: the product answers "do we know what we are
 * building?", not "is the code correct?".
 */

export type SourceSystem = 'jira' | 'confluence' | 'figma' | 'decision';

// ---------------------------------------------------------------------------
// Normalized source contexts (output of connectors + normalizer)
// ---------------------------------------------------------------------------

export const ISSUE_TYPES = ['epic', 'feature', 'story', 'task', 'subtask', 'bug'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export interface IssueLink {
  /** e.g. "blocks", "relates to", "is caused by", "duplicates" */
  type: string;
  key: string;
}

/** Format of an acceptance-criteria unit (pdi contract 0.4.0, story.schema.json `scenario.format`). */
export type AcFormat = 'gwt' | 'ears' | 'free';

/**
 * One acceptance-criteria unit: a GWT scenario, an EARS sentence or a free-text point (analysis/acceptance.ts).
 * `id`, `format`, `given`, `when`, `then` and `text` follow the pdi contract (story.schema.json `scenario`);
 * `mainAction` and `extraActions` are derived here and are not part of the contract.
 */
export interface AcScenario {
  /** AC-1…AC-n in the order of the criteria. */
  id: string;
  format: AcFormat;
  /** GWT: conditions; EARS: state (While/Where). */
  given?: string[];
  /** GWT: the first action (When/Gdy); EARS: the trigger (When/If). */
  when?: string;
  /** Observable result (GWT Then, EARS shall). */
  then?: string[];
  /** The original text of the unit. */
  text: string;
  /** GWT: the action of `when` as verb + object, without actor and data variants. */
  mainAction?: string;
  /** GWT: further actions in the same scenario (second When, or And directly after When). */
  extraActions?: string[];
}

/** RequirementContext — one Jira issue. */
export interface RequirementItem {
  key: string;
  type: IssueType;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  /** The acceptance criteria grouped into units with AC-n ids; absent when the source does not group them. */
  acScenarios?: AcScenario[];
  /** Estimate from the configured story points field. */
  storyPoints?: number;
  businessRules: string[];
  status: string;
  epicKey?: string;
  parentKey?: string;
  labels: string[];
  components: string[];
  links: IssueLink[];
  /** URLs to Confluence pages / Figma frames attached to the issue. */
  remoteLinks: string[];
  /** Bug-only structured fields (parsed from description sections). */
  bug?: {
    stepsToReproduce?: string;
    expected?: string;
    actual?: string;
    environment?: string;
  };
  updatedAt: string;
  url?: string;
}

/** DocumentationContext — one Confluence page. */
export interface DocumentItem {
  id: string;
  title: string;
  space: string;
  body: string;
  labels: string[];
  updatedAt: string;
  url?: string;
}

/** DesignContext — one Figma frame / screen / component set. */
export interface DesignFrame {
  id: string;
  fileKey: string;
  fileName: string;
  page: string;
  name: string;
  /** Text layers + variant names found inside the frame. */
  texts: string[];
  /** Prototype transitions: ids of frames this frame navigates to. */
  transitions: string[];
  updatedAt: string;
  url?: string;
}

export interface ProjectContext {
  project: { key: string; name: string };
  requirements: RequirementItem[];
  documents: DocumentItem[];
  frames: DesignFrame[];
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Context graph
// ---------------------------------------------------------------------------

export type EntityKind =
  | 'product'
  | 'epic'
  | 'story'
  | 'task'
  | 'subtask'
  | 'bug'
  | 'document'
  | 'figma_frame'
  | 'domain'
  | 'decision';

export interface Entity {
  id: string;
  kind: EntityKind;
  source?: SourceSystem;
  title: string;
  url?: string;
  updatedAt?: string;
  /** Plain text used for semantic matching. */
  text: string;
  /** Hash of the normalized content — any edit changes it (history). */
  contentHash: string;
  /** Hash of what the artifact says (claims, acceptance criteria, states) — drives the drift reaction (P5). */
  meaningHash?: string;
}

export type RelationType =
  | 'belongs_to'
  | 'implements'
  | 'documented_by'
  | 'designed_by'
  | 'depends_on'
  | 'related_to'
  | 'supersedes'
  | 'contradicts'
  | 'affects'
  | 'references'
  | 'in_domain'
  | 'decided_by';

export interface Relation {
  from: string;
  to: string;
  type: RelationType;
  confidence: number;
  /** explicit = link that exists in a source system; semantic = discovered. */
  via: 'explicit' | 'semantic';
  reason: string;
}

// ---------------------------------------------------------------------------
// Evidence, claims, findings, questions, decisions
// ---------------------------------------------------------------------------

export interface Evidence {
  source: SourceSystem;
  entityId: string;
  title: string;
  url?: string;
  /** Short excerpt that supports the statement. */
  excerpt?: string;
}

/**
 * A normalized, comparable statement extracted from a source.
 * e.g. { subject: 'payment', attribute: 'timeout', value: 30, unit: 's' }
 */
export interface Claim {
  id: string;
  subject: string;
  attribute: ClaimAttribute;
  value: string | number | boolean;
  unit?: string;
  text: string;
  evidence: Evidence;
  updatedAt?: string;
  confidence: 'high' | 'medium' | 'low';
}

export type ClaimAttribute =
  | 'timeout'
  | 'retry_limit'
  | 'idempotent'
  | 'processing_mode'
  | 'session_lifetime'
  | 'max_items'
  | 'max_file_size'
  | 'min_length'
  | 'max_length';

export type FindingCategory =
  | 'GAP'
  | 'CONFLICT'
  | 'AMBIGUITY'
  | 'OUTDATED'
  | 'MISSING_COVERAGE'
  | 'DRIFT';

export type Severity = 'critical' | 'warning' | 'info';

export type Dimension =
  | 'requirements'
  | 'design'
  | 'documentation'
  | 'architecture'
  | 'userJourneys'
  | 'errorHandling'
  | 'dependencies';

export const DIMENSIONS: Dimension[] = [
  'requirements',
  'design',
  'documentation',
  'architecture',
  'userJourneys',
  'errorHandling',
  'dependencies',
];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  requirements: 'Requirements',
  design: 'Design',
  documentation: 'Documentation',
  architecture: 'Architecture',
  userJourneys: 'User Journeys',
  errorHandling: 'Error Handling',
  dependencies: 'Dependencies',
};

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  /** Stable id: same gap on the same item ⇒ same question id across runs. */
  id: string;
  text: string;
  options: QuestionOption[];
  /** Decision topic, used for Decision Debt grouping (e.g. "retry behavior"). */
  topic: string;
}

export type FindingStatus = 'open' | 'resolved' | 'accepted_risk' | 'dismissed';

export interface Finding {
  /** Stable id (rule + item + discriminator). */
  id: string;
  ruleId: string;
  itemKey: string;
  category: FindingCategory;
  severity: Severity;
  dimension: Dimension;
  title: string;
  explanation: string;
  evidence: Evidence[];
  question?: Question;
  status: FindingStatus;
  /** Where the finding came from. */
  origin: 'rule' | 'ai' | 'drift';
  /** Set when a human decision resolved the finding. */
  resolution?: { decisionId: string; summary: string };
  /** AI finding that would block but waits for a human to confirm it (policy `require_confirmation`). */
  needsConfirmation?: boolean;
  /** Set by scoring: the open finding makes the item NOT READY under the current policy. */
  blocks?: boolean;
  /** Set when a human confirmed an AI finding; it stays open and counts at full severity. */
  confirmation?: { decisionId: string; by: string; at: string };
}

interface DecisionBase {
  readonly id: string;
  readonly questionId: string;
  readonly findingId: string;
  readonly itemKey: string;
  readonly topic: string;
  readonly question: string;
  readonly answer: string;
  readonly note?: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  /** What the decision does to the finding. `confirm` keeps it open and confirms an AI finding. */
  readonly effect: DecisionEffect;
  /**
   * Decisions are immutable. A change creates a new version that supersedes
   * the previous one; removal is a withdrawal.
   */
  readonly version: number;
  /** Id of the version this one replaced. */
  readonly supersedes?: string;
  /** Why the previous version was changed (required when superseding an active decision). */
  readonly changeReason?: string;
}

export interface ActiveDecision extends DecisionBase {
  readonly status: 'active';
}

export interface SupersededDecision extends DecisionBase {
  readonly status: 'superseded';
  readonly supersededBy: string;
  readonly supersededAt: string;
}

export interface WithdrawnDecision extends DecisionBase {
  readonly status: 'withdrawn';
  readonly withdrawnBy: string;
  readonly withdrawnAt: string;
  readonly withdrawReason?: string;
}

export type Decision = ActiveDecision | SupersededDecision | WithdrawnDecision;

/**
 * A decision as found in decisions.json. Versions written before versioning
 * lack `version` and `status`; normalizeDecision is the only way to a Decision.
 */
export type StoredDecision = Omit<DecisionBase, 'version'> & {
  version?: number;
  status?: DecisionStatus;
  supersededBy?: string;
  supersededAt?: string;
  withdrawnBy?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
};

export const DECISION_EFFECTS = ['resolve', 'accept_risk', 'dismiss', 'confirm'] as const;
export type DecisionEffect = (typeof DECISION_EFFECTS)[number];

export type DecisionStatus = 'active' | 'superseded' | 'withdrawn';

// ---------------------------------------------------------------------------
// State machine / journeys / coverage
// ---------------------------------------------------------------------------

export type UiState =
  | 'idle'
  | 'loading'
  | 'processing'
  | 'success'
  | 'validation_error'
  | 'server_error'
  | 'timeout'
  | 'retry'
  | 'empty'
  | 'confirmation'
  | 'session_expired'
  | 'network_failure'
  | 'permission_denied';

export interface StateCoverage {
  required: { state: UiState; because: string }[];
  inRequirements: UiState[];
  inDesign: UiState[];
  missingInDesign: UiState[];
  missingInRequirements: UiState[];
}

export type Journey =
  | 'happy_path'
  | 'validation_error'
  | 'server_error'
  | 'timeout'
  | 'retry'
  | 'session_expired'
  | 'network_failure'
  | 'permission_denied'
  | 'empty_state'
  | 'cancel';

export interface JourneyCoverage {
  journeys: { journey: Journey; covered: boolean; where: SourceSystem[] }[];
  percent: number;
}

export interface TaskCoverage {
  requirements: { criterion: string; coveredBy: string[] }[];
  percent: number;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'needs_attention' | 'critical';
export type ReadinessStatus = 'ready' | 'not_ready' | 'needs_attention';

export interface DimensionScore {
  dimension: Dimension;
  score: number;
  status: 'ok' | 'warn' | 'fail';
  notes: string[];
}

export interface ItemAnalysis {
  key: string;
  type: IssueType;
  title: string;
  url?: string;
  /** The epic, also when the item belongs to it through a feature. */
  epicKey?: string;
  /** Set for stories under a feature (P1). */
  featureKey?: string;
  domain?: { name: string; confidence: number; alternatives: { name: string; confidence: number }[] };
  health: number;
  healthStatus: HealthStatus;
  readiness: ReadinessStatus;
  blockingIssues: string[];
  dimensions: DimensionScore[];
  findings: Finding[];
  context: ContextBundle;
  claims: Claim[];
  states?: StateCoverage;
  journeys?: JourneyCoverage;
  tasks?: TaskCoverage;
  traits: string[];
  /** Adversarial review: scenarios the specification may not answer yet. */
  challenges: Challenge[];
  /** For epics: aggregated child stats. */
  rollup?: EpicRollup;
  checklist: ChecklistGroup[];
}

export interface Challenge {
  id: string;
  question: Question;
  rationale: string;
  answered: boolean;
  answeredBy?: Evidence;
  /** Answer text when a human decision closed the challenge. */
  decision?: string;
  origin: 'rule' | 'ai';
}

export interface Approval {
  itemKey: string;
  approvedAt: string;
  approvedBy: string;
  /** Content hashes of the item and every entity in its context at approval time. */
  contextHashes: Record<string, string>;
  /** Set when the item was approved despite blocking issues. */
  forced?: true;
  /** Required justification of a forced approval. */
  reason?: string;
  /**
   * Meaning fingerprints at approval time (P5). Approvals stored before this
   * existed fall back to `contextHashes`, so any edit counts as drift.
   */
  meaningHashes?: Record<string, string>;
}

export interface ChecklistGroup {
  group: string;
  items: { label: string; status: 'ok' | 'warn' | 'fail' }[];
}

export interface EpicRollup {
  stories: number;
  healthy: number;
  needsAttention: number;
  critical: number;
  designCoverage: number;
  documentationCoverage: number;
  requirementsCoverage: number;
  highlights: string[];
}

export interface ContextRef {
  entityId: string;
  kind: EntityKind;
  source?: SourceSystem;
  title: string;
  url?: string;
  relation: RelationType;
  via: 'explicit' | 'semantic';
  confidence: number;
  reason: string;
}

export interface ContextBundle {
  requirements: ContextRef[];
  documents: ContextRef[];
  frames: ContextRef[];
}

// ---------------------------------------------------------------------------
// Project-level results
// ---------------------------------------------------------------------------

export interface DriftEvent {
  id: string;
  at: string;
  kind: 'changed' | 'added' | 'removed' | 'claim_changed' | 'new_finding' | 'status_change';
  entityId: string;
  entityTitle: string;
  source?: SourceSystem;
  summary: string;
  /** Items (stories / epics) whose context includes the changed entity. */
  impactedItems: string[];
  severity: Severity;
}

export interface ProjectMetrics {
  specificationHealth: number;
  designCoverage: number;
  journeyCoverage: number;
  documentationConsistency: number;
  readiness: number;
  drift: number;
  decisionDebt: { critical: number; important: number; minor: number; topics: { topic: string; count: number }[] };
}

export interface AnalysisResult {
  id: string;
  project: { key: string; name: string };
  analyzedAt: string;
  durationMs: number;
  items: ItemAnalysis[];
  counts: {
    epics: number;
    features: number;
    stories: number;
    bugs: number;
    tasks: number;
    healthy: number;
    needsAttention: number;
    critical: number;
    warnings: number;
    criticalFindings: number;
  };
  metrics: ProjectMetrics;
  topRisks: { key: string; title: string; reason: string; severity: Severity }[];
  domains: { name: string; items: number; critical: number; needsAttention: number }[];
  drift: DriftEvent[];
  /** Approvals the drift reaction `invalidate` revoked in this run; the server removes them. */
  invalidatedApprovals?: string[];
  ai: { enabled: boolean; provider?: string; model?: string; errors: string[] };
}
