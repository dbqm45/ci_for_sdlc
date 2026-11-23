import type { Decision, DecisionEffect, ItemAnalysis, RequirementItem } from './model.js';

/**
 * pdi integration (F4 of the pdi one-flow plan): a pdi change (CHG-n) is the set of stories labelled `change:CHG-n`;
 * its readiness goes to pdi as `readiness.changed`, and `gate.decided` from pdi approves its stories. Envelopes follow
 * the pdi contract 0.4.0 (`contract/event.schema.json`).
 */

export const CHANGE_LABEL_PREFIX = 'change:';
export const PDI_CONTRACT_VERSION = '0.4.0';
/** Contract version of a readiness.changed event that carries targets_status (Z7b-1b). */
export const PDI_CONTRACT_VERSION_TARGETS = '0.12.0';
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
 * (its approved baseline moved), `not_ready` when a story has a blocking finding, else `ready`. A story that only
 * needs attention (warnings) does not hold the change back, as it does not hold back its own approval (PRB-17); its
 * open questions still go to pdi in `open_questions`. A blocking security scan finding of the change itself (SEC-n on
 * its epic, Z8c) makes it `not_ready` as well. Ordered by change key.
 */
export function changeReadiness(items: ItemAnalysis[], requirements: RequirementItem[], prefix = CHANGE_LABEL_PREFIX): ChangeReadiness[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const groups = new Map<string, ItemAnalysis[]>();
  const insecure = new Set<string>();
  for (const r of requirements) {
    const change = changeKeyOf(r.labels, prefix);
    const a = byKey.get(r.key);
    if (!change || !a) continue;
    if (!LEAF.has(a.type)) {
      // A security scan result no slice owns is the change's own finding (Z8c): it holds the change back too.
      if (a.findings.some((f) => f.ruleId?.startsWith('SEC-') && f.blocks && f.status === 'open')) {
        insecure.add(change);
        if (!groups.has(change)) groups.set(change, []);
      }
      continue;
    }
    groups.set(change, [...(groups.get(change) ?? []), a]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([change, stories]) => ({
      change,
      readiness: stories.some((s) => s.findings.some((f) => f.origin === 'drift' && f.status === 'open'))
        ? 'drift'
        : insecure.has(change) || stories.some((s) => s.readiness === 'not_ready')
          ? 'not_ready'
          : 'ready',
      openQuestions: stories.reduce((n, s) => n + s.challenges.filter((c) => !c.answered).length, 0),
      items: stories.map((s) => s.key),
    }));
}

const isoSeconds = (at: string) => `${at.slice(0, 19)}Z`;

/** The workspace of an installation that has only one (F5, docs/WORKSPACES-F5-PLAN.md); its links and refs keep their old form. */
export const DEFAULT_WORKSPACE = 'default';
const inWorkspace = (ws: string | undefined) => !!ws && ws !== DEFAULT_WORKSPACE;
/** The UI route prefix of a workspace: `/w/<id>` (empty for `default`). */
export const workspacePath = (ws?: string) => (inWorkspace(ws) ? `/w/${encodeURIComponent(ws!)}` : '');

/**
 * One readiness per change from the changes of several workspaces (F5): a change spans the stories of all of them,
 * `drift` if any part drifted, `ready` only if every part is ready, open questions added up. Ordered by change key.
 */
export function mergeChangeReadiness(parts: ChangeReadiness[][]): ChangeReadiness[] {
  const byChange = new Map<string, ChangeReadiness[]>();
  for (const c of parts.flat()) byChange.set(c.change, [...(byChange.get(c.change) ?? []), c]);
  return [...byChange.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([change, cs]) => ({
      change,
      readiness: cs.some((c) => c.readiness === 'drift') ? 'drift' : cs.every((c) => c.readiness === 'ready') ? 'ready' : 'not_ready',
      openQuestions: cs.reduce((n, c) => n + c.openQuestions, 0),
      items: cs.flatMap((c) => c.items),
    }));
}

/**
 * `readiness.changed` for each change whose state differs from the last one sent; `sent` is the new last-sent map.
 * `targetsStatusByChange` attaches the targets_status payload (Z7b-1b, pdi contract 0.12.0) when a change has one;
 * such events bump `contract_version` to 0.12.0 so pdi knows to read the field.
 */
export function readinessEvents(
  current: ChangeReadiness[],
  lastSent: Record<string, string>,
  at: string,
  targetsStatusByChange?: Map<string, Record<string, unknown>>,
): { events: PdiEvent[]; sent: Record<string, string> } {
  const sent = { ...lastSent };
  const events: PdiEvent[] = [];
  const stamp = isoSeconds(at).replace(/[-:]/g, '');
  for (const c of current) {
    if (sent[c.change] === c.readiness) continue;
    sent[c.change] = c.readiness;
    const targetsStatus = targetsStatusByChange?.get(c.change);
    events.push({
      id: `ci-${c.change}-${c.readiness}-${stamp}`,
      type: 'readiness.changed',
      occurred_at: isoSeconds(at),
      source: 'ci_for_sdlc',
      contract_version: targetsStatus ? PDI_CONTRACT_VERSION_TARGETS : PDI_CONTRACT_VERSION,
      payload: {
        change: c.change,
        readiness: c.readiness,
        open_questions: c.openQuestions,
        ...(targetsStatus && { targets_status: targetsStatus }),
      },
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

/**
 * `decision.recorded` came with pdi contract 0.7.0 and carries its origin since 0.16.0 (D5: 0.17.0, the version pdi pins);
 * `gate.requested` and `readiness.changed` keep the versions they were written for.
 */
export const PDI_DECISION_CONTRACT_VERSION = '0.17.0';
/** `gate.requested` came with pdi contract 0.7.0. */
export const PDI_GATE_CONTRACT_VERSION = '0.7.0';
/** What pdi records when the `apply` policy decided: the sender, not a person. */
export const PDI_AUTOMAT = 'ci_for_sdlc';
const MAX_REF = 200;

/** The origin of a decision made here (pdi contract 0.16.0, D1): one key per finding, so its decisions are versions of one. */
export interface PdiOrigin {
  app: 'ci_for_sdlc';
  scope: string;
  local_id: string;
  url?: string;
}

/** The link to a finding in the app (CI_PUBLIC_URL), or undefined without a public URL. */
function findingUrl(publicUrl: string | undefined, workspace: string | undefined, itemKey: string, findingId: string): string | undefined {
  const base = publicUrl?.replace(/\/+$/, '');
  return base ? `${base}/#${workspacePath(workspace)}/item/${encodeURIComponent(itemKey)}/${encodeURIComponent(findingId)}` : undefined;
}

/**
 * D5: where a decision of DI Definition lives — the workspace (`default` too) and the finding; the link only when it is
 * https (the contract asks for it).
 */
export function pdiOrigin(i: { itemKey: string; findingId: string; workspace?: string; url?: string }): PdiOrigin {
  return {
    app: 'ci_for_sdlc',
    scope: (i.workspace || DEFAULT_WORKSPACE).slice(0, MAX_REF),
    local_id: `${i.itemKey}/${i.findingId}`.slice(0, MAX_REF),
    ...(i.url?.startsWith('https://') && { url: i.url }),
  };
}

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
  /** F5: the workspace of the item; another than `default` prefixes the ref, the link and the event id. */
  workspace?: string;
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
  const url = findingUrl(i.publicUrl, i.workspace, i.itemKey, i.findingId);
  const ws = inWorkspace(i.workspace) ? `${i.workspace}/` : '';
  return {
    id: `ci-ac-${ws.replace('/', '-')}${i.proposalId.replace(/^ans:/, '').replace(/[^A-Za-z0-9._-]/g, '-')}-${i.outcome}-${isoSeconds(at).replace(/[-:]/g, '')}`,
    type: 'decision.recorded',
    occurred_at: isoSeconds(at),
    source: 'ci_for_sdlc',
    contract_version: PDI_DECISION_CONTRACT_VERSION,
    payload: {
      decision_type: 'finding.auto_close',
      ref: `${ws}${i.itemKey}/${i.findingId}`.slice(0, MAX_REF),
      origin: pdiOrigin({ ...i, url }),
      ...(url && { url }),
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

// ---------------------------------------------------------------------------- D5: every decision to the suite index

const HUMAN_DECISION: Record<DecisionEffect, { type: string; kind: 'product' | 'triage'; says: (q: string, a: string) => string }> = {
  resolve: { type: 'finding.resolve', kind: 'product', says: (q, a) => `Answered "${q}": ${a}` },
  accept_risk: { type: 'finding.accept_risk', kind: 'triage', says: (q, a) => `Accepted the risk in "${q}": ${a}` },
  dismiss: { type: 'finding.dismiss', kind: 'triage', says: (q, a) => `Dismissed "${q}": ${a}` },
  confirm: { type: 'finding.confirm', kind: 'triage', says: (q, a) => `Confirmed the finding "${q}": ${a}` },
};

export interface HumanDecisionOptions {
  /** The DEC pdi gave the version this one replaces (a new answer) or withdraws. */
  supersedes?: string;
  /** The CHG of the item's `change:` label. */
  change?: string;
  /** CI_PUBLIC_URL, for the link to the finding. */
  publicUrl?: string;
  /** The workspace of the item; another than `default` prefixes the ref and the event id. */
  workspace?: string;
}

/**
 * D5 (docs/PDI-D5-PLAN.md): a person's decision on a finding (`POST /decisions`) as `decision.recorded`, or — for a
 * withdrawn decision — its withdrawal. Every decision on one finding has the same origin, so pdi keeps them as versions.
 */
export function humanDecisionEvent(d: Decision, o: HumanDecisionOptions = {}): PdiEvent {
  const withdrawn = d.status === 'withdrawn';
  const at = isoSeconds(withdrawn ? d.withdrawnAt : d.decidedAt);
  const question = d.question.trim() || d.findingId;
  const kind = withdrawn ? { type: 'finding.withdraw', kind: 'triage' as const } : HUMAN_DECISION[d.effect];
  const statement = withdrawn ? `Withdrew the decision on "${question}" (was: ${d.answer})` : HUMAN_DECISION[d.effect].says(question, d.answer);
  const why = (withdrawn ? d.withdrawReason : d.changeReason?.trim() || d.note)?.trim();
  const url = findingUrl(o.publicUrl, o.workspace, d.itemKey, d.findingId);
  const ws = inWorkspace(o.workspace) ? `${o.workspace}/` : '';
  const evidence = (d.evidence ?? []).filter((e) => e.excerpt?.trim()).map((e) => ({ text: e.excerpt!.trim(), ...(e.url && { source_url: e.url }) }));
  const ai = !withdrawn && d.draftedBy === 'ai';
  return {
    id: `ci-dec-${ws.replace('/', '-')}${d.id.replace(/[^A-Za-z0-9._-]/g, '-')}-${withdrawn ? 'withdrawn' : d.effect}-${at.replace(/[-:]/g, '')}`.slice(0, 128),
    type: 'decision.recorded',
    occurred_at: at,
    source: 'ci_for_sdlc',
    contract_version: PDI_DECISION_CONTRACT_VERSION,
    payload: {
      decision_type: kind.type,
      ref: `${ws}${d.itemKey}/${d.findingId}`.slice(0, MAX_REF),
      origin: pdiOrigin({ itemKey: d.itemKey, findingId: d.findingId, workspace: o.workspace, url }),
      ...(url && { url }),
      statement,
      ...(why && { why }),
      kind: kind.kind,
      decided_by: withdrawn ? d.withdrawnBy : d.decidedBy,
      drafted_by: ai ? 'ai' : 'human',
      ...(ai && d.draftEdited !== undefined && { draft_edited: d.draftEdited }),
      ...(evidence.length && !withdrawn && { evidence }),
      ...(o.supersedes && { supersedes: o.supersedes }),
      ...(o.change && { change: o.change }),
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
  /** F5: the workspace of the first story. */
  workspace?: string;
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
    contract_version: PDI_GATE_CONTRACT_VERSION,
    payload: {
      change: i.change.change,
      gate: APPROVE_GATE,
      summary: `${i.change.change}: ${i.requestedBy} asks to approve it for implementation although ${state}${note ? ` — ${note.slice(0, 500)}` : ''}`,
      artifact: `stories ${i.change.items.join(', ')}`.slice(0, 500),
      ...(i.publicUrl && first && { url: `${i.publicUrl.replace(/\/$/, '')}/#${workspacePath(i.workspace)}/item/${encodeURIComponent(first)}` }),
      ...(questions.length && { questions }),
    },
  };
}
