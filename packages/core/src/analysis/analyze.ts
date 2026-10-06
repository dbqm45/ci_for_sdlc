import type {
  Challenge,
  ChecklistGroup,
  Dimension,
  DimensionScore,
  Finding,
  HealthStatus,
  ItemAnalysis,
  ReadinessStatus,
  RequirementItem,
  Severity,
} from '../model.js';
import { DIMENSIONS } from '../model.js';
import { hash } from '../text.js';
import { aiFindingsAction, driftReactionOf, type SeverityAction } from '../policy.js';
import { evJira, itemContext, questionOptions, type AnalysisEnv, type ItemCtx } from './context.js';
import { RULES, taskCoverage, type FindingDraft } from './rules.js';
import { challenges, journeyCoverage, stateCoverage } from './states.js';
import { STATE_LABELS, TRAIT_LABELS } from './vocabulary.js';

const SEVERITY_PENALTY: Record<Severity, number> = { critical: 45, warning: 18, info: 4 };
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function findingFromDraft(ruleId: string, itemKey: string, d: FindingDraft, origin: Finding['origin'] = 'rule'): Finding {
  const id = `${ruleId}:${itemKey}${d.disc ? `:${d.disc}` : ''}`;
  return {
    id,
    ruleId,
    itemKey,
    category: d.category,
    severity: d.severity,
    dimension: d.dimension,
    title: d.title,
    explanation: d.explanation,
    evidence: d.evidence,
    question: d.question ? { id: `q:${id}`, text: d.question.text, options: questionOptions(d.question.options), topic: d.question.topic } : undefined,
    status: 'open',
    origin,
  };
}

/** Run deterministic rules for one item (stories, bugs, epics, tasks). */
export function analyzeItem(env: AnalysisEnv, r: RequirementItem): { analysis: ItemAnalysis; ctx: ItemCtx } {
  const c = itemContext(env, r);
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (!rule.appliesTo.includes(r.type) || env.policy.disabledRules.includes(rule.id)) continue;
    for (const draft of rule.run(c)) findings.push(findingFromDraft(rule.id, r.key, draft));
  }

  const isStory = r.type === 'story';
  const states = isStory && c.ui ? stateCoverage(c) : undefined;
  const journeys = isStory ? journeyCoverage(c) : undefined;
  const tasksOf = (env.childrenOf.get(r.key) ?? []).filter((t) => t.type === 'task' || t.type === 'subtask');
  const tasks = isStory && tasksOf.length ? taskCoverage(r.acceptanceCriteria, tasksOf.map((t) => ({ key: t.key, text: `${t.title} ${t.description}` }))) : undefined;
  const ch: Challenge[] = isStory ? challenges(c) : [];

  const analysis: ItemAnalysis = {
    key: r.key,
    type: r.type,
    title: r.title,
    url: r.url,
    epicKey: r.epicKey,
    domain: env.built.domains.get(r.key),
    health: 100,
    healthStatus: 'healthy',
    readiness: 'ready',
    blockingIssues: [],
    dimensions: [],
    findings,
    context: c.bundle,
    claims: c.claims.all,
    states,
    journeys,
    tasks,
    traits: [...c.traits].map((t) => TRAIT_LABELS[t]),
    challenges: ch,
    checklist: [],
  };
  return { analysis, ctx: c };
}

/** Apply human decisions: a decided question resolves (or accepts / dismisses) its finding. */
export function applyDecisions(env: AnalysisEnv, a: ItemAnalysis) {
  for (const f of a.findings) {
    const dec = f.question ? env.decisionsByQuestion.get(f.question.id) : undefined;
    if (!dec) continue;
    if (dec.effect === 'confirm') {
      f.confirmation = { decisionId: dec.id, by: dec.decidedBy, at: dec.decidedAt };
      continue;
    }
    f.status = dec.effect === 'resolve' ? 'resolved' : dec.effect === 'accept_risk' ? 'accepted_risk' : 'dismissed';
    f.resolution = { decisionId: dec.id, summary: `${dec.answer}${dec.note ? ` — ${dec.note}` : ''}` };
  }
}

/**
 * Effective policy action for a finding: AI findings that would block follow
 * `policy.aiFindings` (P2); drift after approval follows `policy.driftReaction` (P4).
 */
function actionFor(env: AnalysisEnv, f: Finding): SeverityAction {
  const base = env.policy.actions[f.severity];
  f.needsConfirmation = undefined;
  if (f.origin === 'drift') return driftReactionOf(env.policy) === 'review_required' ? 'block' : base === 'record' ? 'record' : 'notify';
  if (f.origin !== 'ai' || base !== 'block') return base;
  const mode = aiFindingsAction(env.policy);
  if (mode === 'block') return 'block';
  if (mode === 'notify') return 'notify';
  if (f.confirmation) return 'block';
  if (f.status === 'open') f.needsConfirmation = true;
  return 'notify';
}

/** Compute dimension scores, health, readiness and the checklist. */
export function scoreItem(env: AnalysisEnv, a: ItemAnalysis, ctx?: ItemCtx) {
  a.findings.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] || (x.status === 'open' ? -1 : 1));
  const action = new Map(a.findings.map((f) => [f, actionFor(env, f)]));
  const open = a.findings.filter((f) => f.status === 'open');
  const counted = open.filter((f) => action.get(f) !== 'record');

  a.dimensions = DIMENSIONS.map((dimension): DimensionScore => {
    const fs = counted.filter((f) => f.dimension === dimension);
    let score = 100 - fs.reduce((s, f) => s + SEVERITY_PENALTY[f.severity], 0);
    const notes = fs.map((f) => f.title);
    if (dimension === 'userJourneys' && a.journeys) {
      score = Math.min(score, a.journeys.percent);
      const missing = a.journeys.journeys.filter((j) => !j.covered).length;
      if (missing) notes.push(`${missing} expected journey(s) not defined`);
    }
    if (dimension === 'design' && a.states && a.states.inDesign.length) {
      const req = a.states.required.length;
      const designed = req - a.states.missingInDesign.length;
      score = Math.min(score, Math.round((designed / req) * 100) + 10);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const blocking = fs.some((f) => action.get(f) === 'block');
    return { dimension, score, status: blocking || score < 60 ? 'fail' : score < 85 ? 'warn' : 'ok', notes };
  });

  const blocking = open.filter((f) => action.get(f) === 'block');
  for (const f of a.findings) f.blocks = blocking.includes(f) || undefined;
  const notify = open.filter((f) => action.get(f) === 'notify');
  const weights: Record<Dimension, number> = { requirements: 1.3, design: 1, documentation: 0.8, architecture: 1.2, userJourneys: 1, errorHandling: 1.1, dependencies: 0.6 };
  const total = a.dimensions.reduce((s, d) => s + weights[d.dimension], 0);
  let health = Math.round(a.dimensions.reduce((s, d) => s + d.score * weights[d.dimension], 0) / total);
  let status: HealthStatus = 'healthy';
  let readiness: ReadinessStatus = 'ready';
  if (blocking.length) {
    // A critical finding changes the status regardless of the average.
    health = Math.min(health, 49);
    status = 'critical';
    readiness = 'not_ready';
  } else if (notify.length) {
    health = Math.min(health, 84);
    status = 'needs_attention';
    readiness = 'needs_attention';
  } else {
    health = Math.max(health, 85);
  }
  a.health = health;
  a.healthStatus = status;
  a.readiness = readiness;
  a.blockingIssues = blocking.map((f) => f.title);
  a.checklist = buildChecklist(a, ctx);
}

function buildChecklist(a: ItemAnalysis, c?: ItemCtx): ChecklistGroup[] {
  if (!c) return [];
  const r = c.r;
  const open = a.findings.filter((f) => f.status === 'open');
  const st = (dimension: Dimension, predicate: (f: Finding) => boolean = () => true) => {
    const fs = open.filter((f) => f.dimension === dimension && predicate(f));
    return fs.some((f) => f.severity === 'critical') ? 'fail' : fs.some((f) => f.severity === 'warning') ? 'warn' : 'ok';
  };
  const groups: ChecklistGroup[] = [];

  if (r.type === 'bug') {
    const b = r.bug ?? {};
    groups.push({
      group: 'Bug report',
      items: [
        { label: 'Reproduction steps', status: b.stepsToReproduce ? 'ok' : 'warn' },
        { label: 'Expected behavior', status: b.expected ? 'ok' : 'warn' },
        { label: 'Actual behavior', status: b.actual ? 'ok' : 'warn' },
        { label: 'Environment', status: b.environment ? 'ok' : 'warn' },
        { label: 'Related story', status: open.some((f) => f.ruleId === 'BUG-002') ? 'warn' : 'ok' },
        { label: 'Regression test', status: open.some((f) => f.ruleId === 'BUG-003') ? 'warn' : 'ok' },
      ],
    });
    return groups;
  }

  groups.push({
    group: 'Requirements',
    items: [
      { label: r.type === 'epic' ? 'Business goal' : 'User story', status: open.some((f) => f.ruleId === 'REQ-002' || f.ruleId === 'EPIC-001') ? 'warn' : 'ok' },
      ...(r.type === 'story'
        ? [
            { label: `Acceptance criteria (${r.acceptanceCriteria.length})`, status: r.acceptanceCriteria.length ? (open.some((f) => f.ruleId === 'REQ-003') ? 'warn' : 'ok') : 'fail' } as const,
            { label: 'Business rules', status: r.businessRules.length ? 'ok' : open.some((f) => f.dimension === 'requirements' && f.category === 'AMBIGUITY') ? 'warn' : 'ok' } as const,
          ]
        : []),
    ],
  });

  if (c.ui && r.type === 'story') {
    const items: ChecklistGroup['items'] = [{ label: c.frames.length ? `Figma linked (${c.frames.length} frames)` : 'Figma linked', status: c.frames.length ? 'ok' : 'warn' }];
    for (const f of open.filter((x) => x.ruleId === 'DES-002')) items.push({ label: f.title.replace('Figma missing ', '').replace(/^./, (x) => x.toUpperCase()) + ' missing', status: f.severity === 'critical' ? 'fail' : 'warn' });
    groups.push({ group: 'Design', items });
  }

  const docItems: ChecklistGroup['items'] = c.docs.slice(0, 4).map((d) => ({ label: d.title, status: open.some((f) => f.evidence.some((e) => e.entityId === `confluence:${d.id}`) && f.dimension === 'documentation') ? 'warn' : 'ok' }));
  if (!docItems.length) docItems.push({ label: 'No documentation found', status: 'warn' });
  groups.push({ group: 'Documentation', items: docItems });

  if (r.type === 'story') {
    const arch: ChecklistGroup['items'] = [];
    const mode = c.claims.all.find((x) => x.attribute === 'processing_mode');
    if (mode) arch.push({ label: `Processing mode: ${mode.value}`, status: st('architecture', (f) => f.ruleId === 'ARCH-002' || f.ruleId === 'ARCH-003') });
    if (c.traits.has('payment')) arch.push({ label: 'Idempotency strategy', status: open.some((f) => f.ruleId === 'ARCH-001') ? 'fail' : 'ok' });
    for (const f of open.filter((x) => x.dimension === 'architecture' && x.ruleId !== 'ARCH-001')) arch.push({ label: f.title, status: f.severity === 'critical' ? 'fail' : 'warn' });
    if (arch.length) groups.push({ group: 'Architecture', items: arch });

    const err = open.filter((f) => f.dimension === 'errorHandling').map((f) => ({ label: f.title, status: (f.severity === 'critical' ? 'fail' : 'warn') as 'fail' | 'warn' }));
    groups.push({ group: 'Error handling', items: err.length ? err : [{ label: 'Error scenarios defined', status: 'ok' }] });

    if (a.states) {
      groups.push({
        group: 'UI states',
        items: a.states.required.map((s) => ({
          label: STATE_LABELS[s.state],
          status: a.states!.inDesign.includes(s.state) ? 'ok' : a.states!.inRequirements.includes(s.state) ? 'warn' : s.state === 'idle' ? 'ok' : 'fail',
        })),
      });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Cross-item passes (need results of other items)
// ---------------------------------------------------------------------------

export function crossItemPass(env: AnalysisEnv, items: Map<string, ItemAnalysis>, ctxs: Map<string, ItemCtx>) {
  for (const a of items.values()) {
    const r = env.reqByKey.get(a.key)!;
    // Dependencies: depends on an item that is not ready
    for (const l of r.links) {
      if (!/is blocked by|depends on/i.test(l.type)) continue;
      const dep = items.get(l.key);
      if (!dep || dep.readiness === 'ready' || /done|closed|resolved/i.test(env.reqByKey.get(l.key)?.status ?? '')) continue;
      a.findings.push(
        findingFromDraft('DEP-001', a.key, {
          disc: l.key,
          category: 'GAP',
          severity: dep.readiness === 'not_ready' ? 'warning' : 'info',
          dimension: 'dependencies',
          title: `Depends on ${l.key}, which is not ready`,
          explanation: `${a.key} ${l.type} ${l.key} ("${dep.title}"), which is currently ${dep.readiness.replace('_', ' ').toUpperCase()} (${dep.blockingIssues[0] ?? 'open findings'}).`,
          evidence: [evJira(r), evJira(env.reqByKey.get(l.key)!)],
        }),
      );
    }

    // Bug intelligence: link the bug to open findings of related stories
    if (r.type === 'bug') {
      const related = [...r.links.map((l) => l.key), r.parentKey].filter((k): k is string => !!k && env.reqByKey.get(k)?.type === 'story');
      const bugText = `${r.title} ${r.description}`.toLowerCase();
      for (const k of related) {
        const story = items.get(k);
        if (!story) continue;
        const candidates = story.findings.filter((x) => x.status === 'open' && x.severity !== 'info' && x.category !== 'OUTDATED');
        // Use the most specific symptom signal only (e.g. "duplicate" beats "retry").
        const signal = BUG_SIGNALS.find((s) => s.bug.test(bugText) && candidates.some((f) => s.finding.test(f.title)));
        if (!signal) continue;
        for (const f of candidates.filter((x) => signal.finding.test(x.title)).slice(0, 2)) {
          a.findings.push(
            findingFromDraft('BUG-004', a.key, {
              disc: f.id,
              category: 'GAP',
              severity: 'warning',
              dimension: 'architecture',
              title: `Potential root cause: ${f.title.toLowerCase()} (${k})`,
              explanation: `This bug ("${r.title}") matches an open ${f.category} finding on ${k} "${story.title}": ${f.explanation} Fixing the bug alone may not remove the underlying specification gap.`,
              evidence: [evJira(r), ...f.evidence.slice(0, 3)],
              question: f.question ? { text: f.question.text, options: f.question.options.filter((o) => o.label !== 'Other').map((o) => o.label), topic: f.question.topic } : undefined,
            }),
          );
        }
      }
    }
  }

  // Epic analysis: rollup + cross-story checks
  for (const a of items.values()) {
    if (a.type !== 'epic') continue;
    const r = env.reqByKey.get(a.key)!;
    const stories = (env.childrenOf.get(a.key) ?? []).filter((s) => s.type === 'story').map((s) => items.get(s.key)!).filter(Boolean);
    if (!stories.length) continue;
    const withDesign = stories.filter((s) => s.context.frames.some((f) => f.confidence >= 0.45));
    const withDocs = stories.filter((s) => s.context.documents.some((f) => f.confidence >= 0.45));
    const withAc = stories.filter((s) => (env.reqByKey.get(s.key)?.acceptanceCriteria.length ?? 0) > 0);
    const pct = (n: number) => Math.round((n / stories.length) * 100);
    const highlights: string[] = [];

    const noDesign = stories.filter((s) => !withDesign.includes(s) && ctxs.get(s.key)?.ui);
    if (noDesign.length) {
      highlights.push(`${noDesign.length} stor${noDesign.length > 1 ? 'ies have' : 'y has'} no Figma coverage`);
      a.findings.push(
        findingFromDraft('EPIC-003', a.key, {
          category: 'MISSING_COVERAGE',
          severity: 'warning',
          dimension: 'design',
          title: `${noDesign.length} stor${noDesign.length > 1 ? 'ies have' : 'y has'} no Figma coverage`,
          explanation: `No design was found for: ${noDesign.map((s) => `${s.key} "${s.title}"`).join(', ')}.`,
          evidence: noDesign.map((s) => evJira(env.reqByKey.get(s.key)!)),
        }),
      );
    }

    // Inconsistent behaviour across stories (e.g. retry limit 3 in one, unlimited in another)
    const storyClaims = stories.flatMap((s) => (ctxs.get(s.key)?.claims.spec ?? []).concat(ctxs.get(s.key)?.claims.decisions ?? []));
    const bySig = new Map<string, Set<string>>();
    for (const cl of storyClaims) {
      const k = `${cl.subject}|${cl.attribute}`;
      (bySig.get(k) ?? bySig.set(k, new Set()).get(k)!).add(`${cl.value}`);
    }
    for (const [k, vals] of bySig) {
      if (vals.size < 2) continue;
      const [subject, attribute] = k.split('|');
      const cs = storyClaims.filter((x) => x.subject === subject && x.attribute === attribute);
      const label = attribute.replace('_', ' ');
      highlights.push(`${subject} ${label} is inconsistent across stories`);
      a.findings.push(
        findingFromDraft('EPIC-004', a.key, {
          disc: k,
          category: 'CONFLICT',
          severity: 'warning',
          dimension: 'requirements',
          title: `${cap(subject)} ${label} is inconsistent across stories`,
          explanation: `Stories in this epic define different values: ${cs.map((x) => `${x.evidence.title}: ${x.value}`).join('; ')}.`,
          evidence: cs.map((x) => x.evidence),
          question: { text: `What is the single ${label} policy for ${subject} in "${r.title}"?`, options: [...vals].map((v) => `${v}`), topic: `${subject} ${label}` },
        }),
      );
    }

    for (const s of stories) {
      for (const f of s.findings.filter((x) => x.status === 'open' && x.severity === 'critical').slice(0, 1)) highlights.push(`${s.key}: ${f.title}`);
    }

    a.rollup = {
      stories: stories.length,
      healthy: stories.filter((s) => s.healthStatus === 'healthy').length,
      needsAttention: stories.filter((s) => s.healthStatus === 'needs_attention').length,
      critical: stories.filter((s) => s.healthStatus === 'critical').length,
      requirementsCoverage: pct(withAc.length),
      designCoverage: pct(withDesign.length),
      documentationCoverage: pct(withDocs.length),
      highlights: [...new Set(highlights)].slice(0, 8),
    };
  }
}

/** Epic dimensions blend the epic's own findings with the average of its stories. */
export function blendEpicScores(items: Map<string, ItemAnalysis>, env: AnalysisEnv) {
  for (const a of items.values()) {
    if (a.type !== 'epic' || !a.rollup) continue;
    const stories = (env.childrenOf.get(a.key) ?? []).filter((s) => s.type === 'story').map((s) => items.get(s.key)!).filter(Boolean);
    for (const d of a.dimensions) {
      const avg = stories.reduce((s, x) => s + (x.dimensions.find((y) => y.dimension === d.dimension)?.score ?? 100), 0) / stories.length;
      d.score = Math.round(Math.min(d.score, (d.score + avg) / 2));
      d.status = d.status === 'fail' ? 'fail' : d.score < 60 ? 'fail' : d.score < 85 ? 'warn' : 'ok';
    }
    const childAvg = stories.reduce((s, x) => s + x.health, 0) / stories.length;
    a.health = Math.round(Math.min(a.health, (a.health + childAvg) / 2));
    // An epic is only as ready as its stories.
    const notReady = stories.filter((s) => s.readiness !== 'ready');
    if (notReady.length && a.readiness === 'ready') {
      a.readiness = 'needs_attention';
      a.healthStatus = 'needs_attention';
      a.health = Math.min(a.health, 84);
    }
    if (notReady.length) a.blockingIssues.push(`${notReady.length} of ${stories.length} stories not ready (${notReady.map((s) => s.key).join(', ')})`);
    // P7: drift on an approved story is visible on the epic.
    const review = stories.filter((s) => s.findings.some((f) => f.origin === 'drift' && f.status === 'open'));
    if (review.length) a.blockingIssues.push(`Changed since approval, review needed: ${review.map((s) => s.key).join(', ')}`);
  }
}

const BUG_SIGNALS: { bug: RegExp; finding: RegExp }[] = [
  { bug: /duplicate|double|twice|charged two/, finding: /idempot|duplicate/i },
  { bug: /timeout|time out|hang|stuck|spinner/, finding: /timeout|processing|loading/i },
  { bug: /error|crash|500|blank screen/, finding: /error|failure/i },
  { bug: /session|logged out|login/, finding: /session/i },
  { bug: /retry/, finding: /retry/i },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const stableId = (s: string) => hash(s);
