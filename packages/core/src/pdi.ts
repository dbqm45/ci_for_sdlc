import type { ItemAnalysis, RequirementItem } from './model.js';

/**
 * pdi integration (F4 of the pdi one-flow plan): a pdi change (CHG-n) is the set of stories labelled `change:CHG-n`;
 * its readiness goes to pdi as `readiness.changed`, and `gate.decided` from pdi approves its stories. Envelopes follow
 * the pdi contract 0.4.0 (`contract/event.schema.json`).
 */

export const CHANGE_LABEL_PREFIX = 'change:';
export const PDI_CONTRACT_VERSION = '0.4.0';
const KEY = /^[A-Z][A-Z0-9]+-[0-9]+$/;
const EVENT_ID = /^[A-Za-z0-9._-]{1,128}$/;
/** Leaf work items, the ones that are approved; epic and feature readiness is derived. */
const LEAF = new Set(['story', 'bug']);
export const GATE_OUTCOMES = ['approved', 'changes_requested', 'rejected'] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];
/** The pdi gate that sets the approval baseline here ("Approve for implementation"). */
export const APPROVE_GATE = 'approve-for-implementation';

export type ChangeReadinessStatus = 'ready' | 'not_ready' | 'drift';

export interface ChangeReadiness {
  change: string;
  readiness: ChangeReadinessStatus;
  /** Open questions (unanswered challenges) across the change's stories. */
  openQuestions: number;
  /** Keys of the change's stories, in source order. */
  items: string[];
}

export interface PdiEvent {
  id: string;
  type: string;
  occurred_at: string;
  source: string;
  contract_version: string;
  payload: Record<string, unknown>;
}

export interface GateDecided {
  id: string;
  change: string;
  gate: string;
  outcome: GateOutcome;
  decision: string;
}

/** The change key of an issue: the first label `<prefix>CHG-n` whose rest is a key. */
export function changeKeyOf(labels: string[], prefix = CHANGE_LABEL_PREFIX): string | undefined {
  for (const l of labels) {
    if (!l.startsWith(prefix)) continue;
    const key = l.slice(prefix.length);
    if (KEY.test(key)) return key;
  }
  return undefined;
}

/**
 * Readiness of every change that has at least one analysed story: `drift` when a story has an open drift finding
 * (its approved baseline moved), `ready` when every story is ready, else `not_ready`. Ordered by change key.
 */
export function changeReadiness(items: ItemAnalysis[], requirements: RequirementItem[], prefix = CHANGE_LABEL_PREFIX): ChangeReadiness[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const groups = new Map<string, ItemAnalysis[]>();
  for (const r of requirements) {
    const change = changeKeyOf(r.labels, prefix);
    const a = byKey.get(r.key);
    if (!change || !a || !LEAF.has(a.type)) continue;
    groups.set(change, [...(groups.get(change) ?? []), a]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([change, stories]) => ({
      change,
      readiness: stories.some((s) => s.findings.some((f) => f.origin === 'drift' && f.status === 'open'))
        ? 'drift'
        : stories.every((s) => s.readiness === 'ready')
          ? 'ready'
          : 'not_ready',
      openQuestions: stories.reduce((n, s) => n + s.challenges.filter((c) => !c.answered).length, 0),
      items: stories.map((s) => s.key),
    }));
}

const isoSeconds = (at: string) => `${at.slice(0, 19)}Z`;

/** `readiness.changed` for each change whose state differs from the last one sent; `sent` is the new last-sent map. */
export function readinessEvents(current: ChangeReadiness[], lastSent: Record<string, string>, at: string): { events: PdiEvent[]; sent: Record<string, string> } {
  const sent = { ...lastSent };
  const events: PdiEvent[] = [];
  const stamp = isoSeconds(at).replace(/[-:]/g, '');
  for (const c of current) {
    if (sent[c.change] === c.readiness) continue;
    sent[c.change] = c.readiness;
    events.push({
      id: `ci-${c.change}-${c.readiness}-${stamp}`,
      type: 'readiness.changed',
      occurred_at: isoSeconds(at),
      source: 'ci_for_sdlc',
      contract_version: PDI_CONTRACT_VERSION,
      payload: { change: c.change, readiness: c.readiness, open_questions: c.openQuestions },
    });
  }
  return { events, sent };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The fields of a `gate.decided` from pdi that this side reads, checked before use; an error message otherwise. */
export function parseGateDecided(v: unknown): GateDecided | string {
  if (!isRecord(v)) return 'The event is not a JSON object';
  if (v.type !== 'gate.decided') return 'type must be gate.decided';
  if (v.source !== 'pdi') return 'source must be pdi';
  if (typeof v.id !== 'string' || !EVENT_ID.test(v.id)) return 'id is missing or not a safe identifier';
  const p = v.payload;
  if (!isRecord(p)) return 'payload is missing';
  if (typeof p.change !== 'string' || !KEY.test(p.change)) return 'payload.change must be a key like CHG-12';
  if (typeof p.gate !== 'string' || !p.gate || p.gate.length > 100) return 'payload.gate is missing';
  if (typeof p.outcome !== 'string' || !(GATE_OUTCOMES as readonly string[]).includes(p.outcome)) return `payload.outcome must be one of ${GATE_OUTCOMES.join(', ')}`;
  if (typeof p.decision !== 'string' || !KEY.test(p.decision)) return 'payload.decision must be a key like DEC-41';
  return { id: v.id, change: p.change, gate: p.gate, outcome: p.outcome as GateOutcome, decision: p.decision };
}

// ---------------------------------------------------------------------------- A2b: decisions to pdi's registry

/** `decision.recorded` came with pdi contract 0.7.0; `readiness.changed` keeps the version it was written for. */
export const PDI_DECISION_CONTRACT_VERSION = '0.7.0';
/** What pdi records when the `apply` policy decided: the sender, not a person. */
export const PDI_AUTOMAT = 'ci_for_sdlc';
const MAX_REF = 200;

/** One step of A2a (docs/AUTO-CLOSE-A2A-PLAN.md) with what pdi needs to record it (docs/PDI-F4-PLAN.md, "A2b"). */
export interface DecisionRecordedInput {
  outcome: 'accepted' | 'edited' | 'rejected' | 'reopened' | 'applied';
  proposalId: string;
  itemKey: string;
  findingId: string;
  question: string;
  /** The verbatim quote of the source. */
  quote: string;
  source: { title: string; url?: string };
  /** The answer recorded (accepted, edited, applied). */
  answer?: string;
  /** The person; for `applied` the automat. */
  decidedBy: string;
  /** The rule that fired, for `applied`. */
  rule?: string;
  /** The CHG of the item's `change:` label. */
  change?: string;
  /** For `reopened`: the DEC pdi gave the decision it reopens. */
  supersedes?: string;
  why?: string;
  /** CI_PUBLIC_URL, for a link to the finding. */
  publicUrl?: string;
}

/** The `decision.recorded` event of one A2a step: a person's decision on an AI draft, or the automat's (`applied`). */
export function decisionRecordedEvent(i: DecisionRecordedInput, at: string): PdiEvent {
  const from = `the answer from ${i.source.title}`;
  const statement = {
    accepted: `Closed "${i.question}" with ${from}: ${i.answer ?? i.quote}`,
    edited: `Closed "${i.question}" with ${from}: ${i.answer ?? i.quote}`,
    applied: `Closed "${i.question}" automatically (${i.rule ?? 'auto-close'}) with ${from}: ${i.answer ?? i.quote}`,
    rejected: `Rejected ${from} to "${i.question}": «${i.quote}»`,
    reopened: `Reopened "${i.question}": ${from} did not answer it`,
  }[i.outcome];
  const automatic = i.outcome === 'applied';
  const base = i.publicUrl?.replace(/\/+$/, '');
  return {
    id: `ci-ac-${i.proposalId.replace(/^ans:/, '').replace(/[^A-Za-z0-9._-]/g, '-')}-${i.outcome}-${isoSeconds(at).replace(/[-:]/g, '')}`,
    type: 'decision.recorded',
    occurred_at: isoSeconds(at),
    source: 'ci_for_sdlc',
    contract_version: PDI_DECISION_CONTRACT_VERSION,
    payload: {
      decision_type: 'finding.auto_close',
      ref: `${i.itemKey}/${i.findingId}`.slice(0, MAX_REF),
      ...(base && { url: `${base}/#/item/${encodeURIComponent(i.itemKey)}/${encodeURIComponent(i.findingId)}` }),
      statement,
      ...(i.why?.trim() && { why: i.why.trim() }),
      decided_by: automatic ? PDI_AUTOMAT : i.decidedBy,
      drafted_by: 'ai',
      // A person who edits, rejects or reopens changed the AI draft; the automat's decision has no human edit at all.
      ...(automatic ? { automation: { level: 1, ...(i.rule && { rule: i.rule }) } } : { draft_edited: i.outcome !== 'accepted' }),
      evidence: [{ text: i.quote, ...(i.source.url && { source_url: i.source.url }) }],
      ...(i.supersedes && { supersedes: i.supersedes }),
      ...(i.change && { change: i.change }),
    },
  };
}

// ---------------------------------------------------------------------------- gate.requested (F4)

const MAX_QUESTIONS = 20;
const MAX_QUESTION = 300;

/** What a person sends with a request for approval of a change that is not ready. */
export interface GateRequestInput {
  change: ChangeReadiness;
  /** The change's stories, as analysed. */
  stories: ItemAnalysis[];
  requestedBy: string;
  note?: string;
  /** CI_PUBLIC_URL, for the link to the first story. */
  publicUrl?: string;
}

/**
 * What stands between the change and readiness, per story not ready: blocking issues, the questions of open findings
 * and unanswered challenges, as `KEY: text`, without repeats, at most 20.
 */
export function approvalQuestions(stories: ItemAnalysis[]): string[] {
  const out: string[] = [];
  for (const s of stories) {
    if (s.readiness === 'ready') continue;
    const texts = [
      ...s.blockingIssues,
      ...s.findings.filter((f) => f.status === 'open' && f.question).map((f) => f.question!.text),
      ...s.challenges.filter((c) => !c.answered).map((c) => c.question.text),
    ];
    for (const t of texts) {
      const line = `${s.key}: ${t}`.slice(0, MAX_QUESTION);
      if (!out.includes(line)) out.push(line);
    }
  }
  return out.slice(0, MAX_QUESTIONS);
}

/** `gate.requested` for "Approve for implementation" of a change a person wants decided although it is not ready. */
export function gateRequestedEvent(i: GateRequestInput, at: string): PdiEvent {
  const notReady = i.stories.filter((s) => s.readiness !== 'ready').length;
  const state = i.change.readiness === 'drift' ? 'its approved baseline drifted' : `${notReady} of ${i.stories.length} stories not ready`;
  const note = i.note?.trim();
  const questions = approvalQuestions(i.stories);
  const first = i.change.items[0];
  return {
    id: `ci-gate-${i.change.change}-${isoSeconds(at).replace(/[-:]/g, '')}`,
    type: 'gate.requested',
    occurred_at: isoSeconds(at),
    source: 'ci_for_sdlc',
    contract_version: PDI_DECISION_CONTRACT_VERSION,
    payload: {
      change: i.change.change,
      gate: APPROVE_GATE,
      summary: `${i.change.change}: ${i.requestedBy} asks to approve it for implementation although ${state}${note ? ` — ${note.slice(0, 500)}` : ''}`,
      artifact: `stories ${i.change.items.join(', ')}`.slice(0, 500),
      ...(i.publicUrl && first && { url: `${i.publicUrl.replace(/\/$/, '')}/#/item/${encodeURIComponent(first)}` }),
      ...(questions.length && { questions }),
    },
  };
}
