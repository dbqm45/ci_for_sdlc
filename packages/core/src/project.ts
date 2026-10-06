import type { SemanticAnalyzer, SemanticInput, SemanticOutput } from './ai/types.js';
import { analyzeItem, applyDecisions, blendEpicScores, crossItemPass, findingFromDraft, scoreItem } from './analysis/analyze.js';
import { formatClaimValue } from './analysis/claims.js';
import { createEnv, evJira, questionOptions, type ItemCtx } from './analysis/context.js';
import { buildContextGraph, issueId, type ContextGraph } from './graph.js';
import type {
  AnalysisResult,
  Approval,
  Challenge,
  Decision,
  DriftEvent,
  Evidence,
  Finding,
  ItemAnalysis,
  ProjectContext,
  ProjectMetrics,
  Severity,
  SourceSystem,
} from './model.js';
import { DEFAULT_POLICY, driftReactionOf, type AnalysisPolicy } from './policy.js';
import { hash } from './text.js';

export interface Snapshot {
  analyzedAt: string;
  entities: Record<string, { hash: string; meaning?: string; title: string; source?: SourceSystem }>;
  claims: Record<string, { value: string; title: string; entityId: string; text: string }>;
  items: Record<string, { readiness: string; health: number; title: string }>;
}

export interface AiAuditRecord {
  at: string;
  itemKey: string;
  provider: string;
  model: string;
  sources: { ref: string; entityId: string; title: string; chars: number }[];
  inputHash: string;
  cached: boolean;
  findings: number;
  discarded: number;
  challenges: number;
  error?: string;
}

export interface AiRunOptions {
  analyzer: SemanticAnalyzer;
  /** Cache by input hash — unchanged items are not re-sent to the model. */
  cache: Map<string, SemanticOutput>;
  /** Data minimization. */
  maxCharsPerSource: number;
  redactPersonalData: boolean;
  /** Restrict which items are sent (default: stories + bugs). */
  maxItems?: number;
  concurrency?: number;
  /**
   * On-demand mode: only items in `onlyKeys` are sent to the model; other
   * items reuse cached AI output when their input is unchanged.
   */
  cacheOnly?: boolean;
  onlyKeys?: Set<string>;
  onAudit?: (rec: AiAuditRecord) => void;
}

export interface AnalyzeOptions {
  decisions?: Decision[];
  approvals?: Approval[];
  previous?: Snapshot;
  policy?: AnalysisPolicy;
  ai?: AiRunOptions;
  now?: Date;
}

export interface ProjectAnalysis {
  result: AnalysisResult;
  snapshot: Snapshot;
  graph: ContextGraph;
}

export async function analyzeProject(ctx: ProjectContext, opts: AnalyzeOptions = {}): Promise<ProjectAnalysis> {
  const started = Date.now();
  const now = (opts.now ?? new Date()).toISOString();
  const decisions = opts.decisions ?? [];
  const policy = opts.policy ?? DEFAULT_POLICY;
  const built = buildContextGraph(ctx, decisions);
  const env = createEnv(ctx, built, decisions, policy);

  const items = new Map<string, ItemAnalysis>();
  const ctxs = new Map<string, ItemCtx>();
  for (const r of ctx.requirements) {
    if (r.type === 'subtask') continue;
    const { analysis, ctx: c } = analyzeItem(env, r);
    items.set(r.key, analysis);
    ctxs.set(r.key, c);
  }

  // ---------------- semantic AI layer (optional) ----------------
  const aiErrors: string[] = [];
  if (opts.ai) {
    const targets = [...items.values()].filter((a) => a.type === 'story' || a.type === 'bug').slice(0, opts.ai.maxItems ?? 200);
    await runPool(targets, opts.ai.concurrency ?? 3, async (a) => {
      try {
        await semanticPass(a, ctxs.get(a.key)!, env.decisionsByQuestion, opts.ai!, now);
      } catch (e) {
        aiErrors.push(`${a.key}: ${(e as Error).message}`);
      }
    });
  }

  // ---------------- drift against approved baselines ----------------
  const approvals = new Map((opts.approvals ?? []).map((a) => [a.itemKey, a]));
  const reaction = driftReactionOf(policy);
  const invalidated: string[] = [];
  for (const [key, ap] of approvals) {
    const a = items.get(key);
    if (!a) continue;
    const changed = changedSinceApproval(built.graph, a, ap);
    if (!changed.length) continue;
    if (reaction === 'invalidate') invalidated.push(key);
    const question =
      reaction === 'invalidate'
        ? undefined
        : { text: 'Is the approved specification still valid after these changes?', options: ['Still valid — re-approve', 'Re-open — specification must be updated'], topic: 'drift' };
    a.findings.push(
      findingFromDraft(
        'DRIFT-001',
        key,
        {
          disc: hash(changed.map((c) => c.entityId + (built.graph.entities.get(c.entityId)?.meaningHash ?? built.graph.entities.get(c.entityId)?.contentHash)).join('|')),
          category: 'DRIFT',
          severity: 'warning',
          dimension: changed.some((c) => c.source === 'figma') ? 'design' : changed.some((c) => c.source === 'confluence') ? 'documentation' : 'requirements',
          title:
            reaction === 'invalidate'
              ? `Approval revoked: ${changed.length} related artifact${changed.length > 1 ? 's' : ''} changed in meaning`
              : `Impact detected: ${changed.length} related artifact${changed.length > 1 ? 's' : ''} changed since approval`,
          explanation: `${key} was approved as ready on ${ap.approvedAt.slice(0, 10)} by ${ap.approvedBy}. Since then these artifacts changed: ${changed.map((c) => c.title).join('; ')}. The approved specification may no longer be consistent.${reaction === 'invalidate' ? ' The approval was revoked; approve the item again once reviewed.' : ''}`,
          evidence: changed.slice(0, 6),
          ...(question && { question }),
        },
        'drift',
      ),
    );
  }

  for (const a of items.values()) {
    applyDecisions(env, a);
    scoreItem(env, a, ctxs.get(a.key));
  }
  crossItemPass(env, items, ctxs);
  for (const a of items.values()) {
    applyDecisions(env, a);
    scoreItem(env, a, ctxs.get(a.key));
  }
  blendEpicScores(items, env);

  // ---------------- snapshot + drift events ----------------
  const snapshot = makeSnapshot(now, built.graph, ctxs, items);
  const drift = opts.previous ? diffSnapshots(opts.previous, snapshot, items, approvals) : [];

  const list = [...items.values()];
  const result: AnalysisResult = {
    id: hash(now + ctx.project.key),
    project: ctx.project,
    analyzedAt: now,
    durationMs: Date.now() - started,
    items: list,
    counts: counts(list),
    metrics: metrics(list, drift),
    topRisks: topRisks(list),
    domains: domains(list),
    drift,
    ...(invalidated.length && { invalidatedApprovals: invalidated }),
    ai: { enabled: !!opts.ai, provider: opts.ai?.analyzer.provider, model: opts.ai?.analyzer.model, errors: aiErrors },
  };
  return { result, snapshot, graph: built.graph };
}

const baselineIds = (item: ItemAnalysis) => [
  issueId(item.key),
  ...[...item.context.documents, ...item.context.frames, ...item.context.requirements].filter((r) => r.confidence >= 0.45 && r.source !== 'decision').map((r) => r.entityId),
];

/** Snapshot an item's context for an approval baseline: content hashes (history) and meaning hashes (drift reaction). */
export function approvalBaseline(graph: ContextGraph, item: ItemAnalysis): Pick<Approval, 'contextHashes' | 'meaningHashes'> {
  const contextHashes: Record<string, string> = {};
  const meaningHashes: Record<string, string> = {};
  for (const id of baselineIds(item)) {
    const e = graph.entities.get(id);
    if (!e) continue;
    contextHashes[id] = e.contentHash;
    meaningHashes[id] = e.meaningHash ?? e.contentHash;
  }
  return { contextHashes, meaningHashes };
}

/**
 * Artifacts whose meaning changed since approval (P5): changed claims,
 * acceptance criteria or states, and artifacts added to or removed from the
 * item's context. Approvals without meaning hashes compare content hashes.
 */
function changedSinceApproval(graph: ContextGraph, a: ItemAnalysis, ap: Approval): Evidence[] {
  const base = ap.meaningHashes ?? ap.contextHashes;
  const now = (e: { meaningHash?: string; contentHash: string }) => (ap.meaningHashes ? (e.meaningHash ?? e.contentHash) : e.contentHash);
  const changed: Evidence[] = [];
  for (const [entityId, h] of Object.entries(base)) {
    const e = graph.entities.get(entityId);
    if (!e) changed.push({ source: 'jira', entityId, title: `${entityId} (removed)` });
    else if (now(e) !== h) changed.push({ source: e.source ?? 'jira', entityId, title: e.title, url: e.url });
  }
  if (ap.meaningHashes) {
    for (const id of baselineIds(a)) {
      const e = graph.entities.get(id);
      if (e && !(id in base)) changed.push({ source: e.source ?? 'jira', entityId: id, title: `${e.title} (newly linked)`, url: e.url });
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------

const REDACT = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, sub: '[email]' },
  { re: /\b(?:sk|pk|rk|ghp|xox[abp])[-_][A-Za-z0-9_-]{12,}\b/g, sub: '[secret]' },
  { re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, sub: '[card-number]' },
];

async function semanticPass(a: ItemAnalysis, c: ItemCtx, decided: Map<string, Decision>, ai: AiRunOptions, now: string) {
  const sources: SemanticInput['sources'] = [];
  const clean = (t: string) => {
    let out = t;
    if (ai.redactPersonalData) for (const { re, sub } of REDACT) out = out.replace(re, sub);
    return out.length > ai.maxCharsPerSource ? `${out.slice(0, ai.maxCharsPerSource)}\n[… truncated by data-minimization policy]` : out;
  };
  const r = c.r;
  sources.push({ ref: 'S1', entityId: issueId(r.key), source: 'jira', title: `${r.key} ${r.title}`, content: clean([`Type: ${r.type}`, `Description:\n${r.description}`, `Acceptance criteria:\n${r.acceptanceCriteria.map((x) => `- ${x}`).join('\n')}`, r.businessRules.length ? `Business rules:\n${r.businessRules.map((x) => `- ${x}`).join('\n')}` : ''].join('\n')) });
  for (const d of c.docs) sources.push({ ref: `S${sources.length + 1}`, entityId: `confluence:${d.id}`, source: 'confluence', title: d.title, content: clean(d.body) });
  for (const f of c.frames) sources.push({ ref: `S${sources.length + 1}`, entityId: `figma:${f.fileKey}:${f.id}`, source: 'figma', title: `${f.fileName} / ${f.page} / ${f.name}`, content: clean(`Frame: ${f.name}\nText layers: ${f.texts.join(' | ')}`) });
  for (const d of c.decisions) sources.push({ ref: `S${sources.length + 1}`, entityId: `decision:${d.id}`, source: 'decision', title: `Decision on ${d.topic}`, content: clean(`Q: ${d.question}\nA: ${d.answer}${d.note ? `\nNote: ${d.note}` : ''}`) });

  const input: SemanticInput = {
    itemKey: r.key,
    itemType: r.type,
    title: r.title,
    sources,
    knownFindings: a.findings.map((f) => `${f.category}: ${f.title}`),
    knownQuestions: a.challenges.map((x) => x.question.text),
  };
  const inputHash = hash(JSON.stringify(input) + ai.analyzer.model);
  const cached = ai.cache.get(inputHash);
  if (!cached && ai.cacheOnly && !ai.onlyKeys?.has(r.key)) return;
  let out: SemanticOutput;
  try {
    out = cached ?? (await ai.analyzer.analyze(input));
  } catch (e) {
    ai.onAudit?.({ at: now, itemKey: r.key, provider: ai.analyzer.provider, model: ai.analyzer.model, sources: sources.map((s) => ({ ref: s.ref, entityId: s.entityId, title: s.title, chars: s.content.length })), inputHash, cached: false, findings: 0, discarded: 0, challenges: 0, error: (e as Error).message });
    throw e;
  }
  if (!cached) ai.cache.set(inputHash, out);

  const byRef = new Map(sources.map((s) => [s.ref, s]));
  let discarded = 0;
  for (const f of out.findings) {
    // Evidence over intuition: drop findings that do not cite a provided source.
    const evidence: Evidence[] = f.evidence
      .filter((e) => byRef.has(e.ref))
      .map((e) => {
        const s = byRef.get(e.ref)!;
        return { source: s.source, entityId: s.entityId, title: s.title, excerpt: e.quote };
      });
    if (!evidence.length) {
      discarded++;
      continue;
    }
    const duplicate = a.findings.some((x) => similar(x.title, f.title));
    if (duplicate) continue;
    a.findings.push(
      findingFromDraft(
        'AI-001',
        r.key,
        {
          disc: hash(f.title.toLowerCase()),
          category: f.category,
          severity: f.severity,
          dimension: f.dimension,
          title: f.title,
          explanation: f.explanation,
          evidence,
          question: f.question?.text ? { text: f.question.text, options: f.question.options.filter((o) => !/^other$/i.test(o)), topic: f.question.topic || 'ai review' } : undefined,
        },
        'ai',
      ),
    );
  }
  for (const ch of out.challenges) {
    if (a.challenges.some((x) => similar(x.question.text, ch.question))) continue;
    const id = `ch:${r.key}:ai-${hash(ch.question.toLowerCase())}`;
    const dec = decided.get(id);
    const challenge: Challenge = {
      id,
      question: { id, text: ch.question, options: questionOptions(ch.options.filter((o) => !/^other$/i.test(o))), topic: ch.topic || 'ai review' },
      rationale: ch.rationale,
      answered: !!dec,
      decision: dec?.answer,
      origin: 'ai',
    };
    a.challenges.push(challenge);
  }
  ai.onAudit?.({
    at: now,
    itemKey: r.key,
    provider: ai.analyzer.provider,
    model: ai.analyzer.model,
    sources: sources.map((s) => ({ ref: s.ref, entityId: s.entityId, title: s.title, chars: s.content.length })),
    inputHash,
    cached: !!cached,
    findings: out.findings.length - discarded,
    discarded,
    challenges: out.challenges.length,
  });
}

function similar(a: string, b: string): boolean {
  const ta = new Set(a.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const tb = new Set(b.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.7;
}

async function runPool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) await fn(xs[i++]);
    }),
  );
}

// ---------------------------------------------------------------------------

function makeSnapshot(now: string, g: ContextGraph, ctxs: Map<string, ItemCtx>, items: Map<string, ItemAnalysis>): Snapshot {
  const entities: Snapshot['entities'] = {};
  for (const e of g.entities.values()) if (e.kind !== 'domain' && e.kind !== 'decision') entities[e.id] = { hash: e.contentHash, meaning: e.meaningHash, title: e.title, source: e.source };
  const claims: Snapshot['claims'] = {};
  for (const c of ctxs.values()) {
    for (const cl of [...c.claims.spec, ...c.claims.docs, ...c.claims.design]) {
      claims[`${cl.evidence.entityId}|${cl.subject}|${cl.attribute}`] = { value: formatClaimValue(cl), title: cl.evidence.title, entityId: cl.evidence.entityId, text: cl.text };
    }
  }
  const its: Snapshot['items'] = {};
  for (const a of items.values()) its[a.key] = { readiness: a.readiness, health: a.health, title: a.title };
  return { analyzedAt: now, entities, claims, items: its };
}

function diffSnapshots(prev: Snapshot, cur: Snapshot, items: Map<string, ItemAnalysis>, approvals: Map<string, Approval>): DriftEvent[] {
  const at = cur.analyzedAt;
  const impactIndex = new Map<string, Set<string>>();
  for (const a of items.values()) {
    const ids = [issueId(a.key), ...[...a.context.documents, ...a.context.frames, ...a.context.requirements].filter((r) => r.confidence >= 0.45).map((r) => r.entityId)];
    for (const id of ids) (impactIndex.get(id) ?? impactIndex.set(id, new Set()).get(id)!).add(a.key);
  }
  const impacted = (id: string) => [...(impactIndex.get(id) ?? [])].filter((k) => items.get(k)?.type !== 'task');
  const wasSafe = (keys: string[]) => keys.some((k) => prev.items[k]?.readiness === 'ready' || approvals.has(k));
  const events: DriftEvent[] = [];
  const ev = (e: Omit<DriftEvent, 'id' | 'at'>) => events.push({ id: hash(`${at}|${e.kind}|${e.entityId}|${e.summary}`), at, ...e });

  for (const [id, e] of Object.entries(cur.entities)) {
    const p = prev.entities[id];
    if (!p) ev({ kind: 'added', entityId: id, entityTitle: e.title, source: e.source, summary: `New ${e.source ?? ''} artifact: ${e.title}`, impactedItems: impacted(id), severity: 'info' });
    else if (p.hash !== e.hash) {
      const imp = impacted(id);
      // P5: an edit that does not change the meaning is kept in history only.
      const cosmetic = !!p.meaning && p.meaning === e.meaning;
      ev({ kind: 'changed', entityId: id, entityTitle: e.title, source: e.source, summary: `${sourceLabel(e.source)} changed${cosmetic ? ' (wording only)' : ''}: ${e.title}`, impactedItems: imp, severity: !cosmetic && wasSafe(imp) ? 'warning' : 'info' });
    }
  }
  for (const [id, p] of Object.entries(prev.entities)) {
    if (!cur.entities[id]) ev({ kind: 'removed', entityId: id, entityTitle: p.title, source: p.source, summary: `${sourceLabel(p.source)} removed: ${p.title}`, impactedItems: [], severity: 'warning' });
  }
  for (const [k, c] of Object.entries(cur.claims)) {
    const p = prev.claims[k];
    if (p && p.value !== c.value) {
      const imp = impacted(c.entityId);
      const [, subject, attribute] = k.split('|');
      ev({ kind: 'claim_changed', entityId: c.entityId, entityTitle: c.title, summary: `${subject} ${attribute.replace('_', ' ')} changed from ${p.value} to ${c.value} in "${c.title}"`, impactedItems: imp, severity: wasSafe(imp) ? 'critical' : 'warning' });
    }
  }
  for (const [key, it] of Object.entries(cur.items)) {
    const p = prev.items[key];
    if (p && p.readiness !== it.readiness) {
      const worse = rank(it.readiness) > rank(p.readiness);
      ev({
        kind: 'status_change',
        entityId: issueId(key),
        entityTitle: `${key} — ${it.title}`,
        source: 'jira',
        summary: `${key} ${worse ? 'regressed' : 'improved'}: ${label(p.readiness)} → ${label(it.readiness)}`,
        impactedItems: [key],
        severity: worse ? (p.readiness === 'ready' ? 'critical' : 'warning') : 'info',
      });
    }
  }
  return events;
}

const rank = (r: string) => ({ ready: 0, needs_attention: 1, not_ready: 2 })[r] ?? 0;
const label = (r: string) => r.replace('_', ' ').toUpperCase();
const sourceLabel = (s?: SourceSystem) => ({ jira: 'Jira', confluence: 'Confluence', figma: 'Figma', decision: 'Decision' })[s ?? 'jira'];

function counts(list: ItemAnalysis[]): AnalysisResult['counts'] {
  const work = list.filter((a) => a.type === 'story' || a.type === 'bug');
  const open = list.flatMap((a) => a.findings.filter((f) => f.status === 'open'));
  return {
    epics: list.filter((a) => a.type === 'epic').length,
    features: list.filter((a) => a.type === 'feature').length,
    stories: list.filter((a) => a.type === 'story').length,
    bugs: list.filter((a) => a.type === 'bug').length,
    tasks: list.filter((a) => a.type === 'task').length,
    healthy: work.filter((a) => a.healthStatus === 'healthy').length,
    needsAttention: work.filter((a) => a.healthStatus === 'needs_attention').length,
    critical: work.filter((a) => a.healthStatus === 'critical').length,
    warnings: open.filter((f) => f.severity === 'warning').length,
    criticalFindings: open.filter((f) => f.severity === 'critical').length,
  };
}

function metrics(list: ItemAnalysis[], drift: DriftEvent[]): ProjectMetrics {
  const stories = list.filter((a) => a.type === 'story');
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 100);
  const ui = stories.filter((s) => s.states);
  const designCoverage = avg(ui.map((s) => (s.states!.inDesign.length ? Math.round(((s.states!.required.length - s.states!.missingInDesign.length) / s.states!.required.length) * 100) : 0)));
  const docIssues = list.filter((a) => a.findings.some((f) => f.status === 'open' && (f.category === 'CONFLICT' || f.category === 'OUTDATED'))).length;
  const debt = { critical: 0, important: 0, minor: 0, topics: new Map<string, number>() };
  for (const a of list) {
    for (const f of a.findings.filter((x) => x.status === 'open' && x.question)) {
      if (f.severity === 'critical') debt.critical++;
      else if (f.severity === 'warning') debt.important++;
      else debt.minor++;
      debt.topics.set(f.question!.topic, (debt.topics.get(f.question!.topic) ?? 0) + 1);
    }
    for (const c of a.challenges.filter((x) => !x.answered)) {
      debt.minor++;
      debt.topics.set(c.question.topic, (debt.topics.get(c.question.topic) ?? 0) + 1);
    }
  }
  return {
    specificationHealth: avg(stories.map((s) => s.health)),
    designCoverage,
    journeyCoverage: avg(stories.filter((s) => s.journeys).map((s) => s.journeys!.percent)),
    documentationConsistency: list.length ? Math.round(100 - (docIssues / list.length) * 100) : 100,
    readiness: stories.length ? Math.round((stories.filter((s) => s.readiness === 'ready').length / stories.length) * 100) : 0,
    drift: drift.filter((d) => d.kind !== 'added').length + list.reduce((n, a) => n + a.findings.filter((f) => f.status === 'open' && f.category === 'DRIFT').length, 0),
    decisionDebt: {
      critical: debt.critical,
      important: debt.important,
      minor: debt.minor,
      topics: [...debt.topics].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
    },
  };
}

function topRisks(list: ItemAnalysis[]): AnalysisResult['topRisks'] {
  const sev = (a: ItemAnalysis): Severity => (a.healthStatus === 'critical' ? 'critical' : a.healthStatus === 'needs_attention' ? 'warning' : 'info');
  return list
    .filter((a) => a.type !== 'task' && a.healthStatus !== 'healthy')
    .sort((a, b) => (a.healthStatus === 'critical' ? 0 : 1) - (b.healthStatus === 'critical' ? 0 : 1) || a.health - b.health)
    .slice(0, 6)
    .map((a) => ({ key: a.key, title: a.title, reason: a.blockingIssues[0] ?? a.findings.find((f: Finding) => f.status === 'open')?.title ?? '', severity: sev(a) }));
}

function domains(list: ItemAnalysis[]): AnalysisResult['domains'] {
  const m = new Map<string, { name: string; items: number; critical: number; needsAttention: number }>();
  for (const a of list) {
    if (!a.domain || a.type === 'task') continue;
    const d = m.get(a.domain.name) ?? { name: a.domain.name, items: 0, critical: 0, needsAttention: 0 };
    d.items++;
    if (a.healthStatus === 'critical') d.critical++;
    if (a.healthStatus === 'needs_attention') d.needsAttention++;
    m.set(a.domain.name, d);
  }
  return [...m.values()].sort((a, b) => b.critical - a.critical || b.needsAttention - a.needsAttention);
}

export { evJira };
