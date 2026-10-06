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

export type IssueType = 'epic' | 'story' | 'task' | 'subtask' | 'bug';

export interface IssueLink {
  /** e.g. "blocks", "relates to", "is caused by", "duplicates" */
  type: string;
  key: string;
}

/** RequirementContext — one Jira issue. */
export interface RequirementItem {
  key: string;
  type: IssueType;
  title: string;
  description: string;
  acceptanceCriteria: string[];
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
  /** Hash of the normalized content — used for drift detection. */
  contentHash: string;
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
}

export interface Decision {
  id: string;
  questionId: string;
  findingId: string;
  itemKey: string;
  topic: string;
  question: string;
  answer: string;
  note?: string;
  decidedBy: string;
  decidedAt: string;
  /** What the decision does to the finding. */
  effect: 'resolve' | 'accept_risk' | 'dismiss';
  /**
   * Decisions are immutable. A change creates a new version that supersedes
   * the previous one; removal is a withdrawal. Decisions stored before
   * versioning are read as active version 1.
   */
  version: number;
  status: DecisionStatus;
  /** Id of the version this one replaced. */
  supersedes?: string;
  /** Why the previous version was changed (required when superseding an active decision). */
  changeReason?: string;
  supersededBy?: string;
  supersededAt?: string;
  withdrawnBy?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
}

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
  epicKey?: string;
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
  ai: { enabled: boolean; provider?: string; model?: string; errors: string[] };
}
