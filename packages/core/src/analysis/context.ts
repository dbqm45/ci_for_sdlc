import { docId, frameId, issueId, type BuiltGraph } from '../graph.js';
import type { AnalysisPolicy } from '../policy.js';
import type {
  Claim,
  ContextBundle,
  Decision,
  DesignFrame,
  DocumentItem,
  Evidence,
  ProjectContext,
  QuestionOption,
  RequirementItem,
  TestCase,
} from '../model.js';
import { excerpt } from '../text.js';
import { isClaimable } from '../connectors/reconstruction.js';
import { claimPackOf } from './claim-packs.js';
import { extractClaims, normalizeSubject } from './claims.js';
import { TRAIT_PATTERNS, type Trait } from './vocabulary.js';
import { testsByItem } from './test-trace.js';

/** Minimum confidence for a discovered artifact to be used as evidence by rules. */
export const EVIDENCE_CONFIDENCE = 0.45;

export interface AnalysisEnv {
  ctx: ProjectContext;
  built: BuiltGraph;
  reqByKey: Map<string, RequirementItem>;
  docsByEntity: Map<string, DocumentItem>;
  framesByEntity: Map<string, DesignFrame>;
  claimsByEntity: Map<string, Claim[]>;
  decisionsByItem: Map<string, Decision[]>;
  decisionsByQuestion: Map<string, Decision>;
  childrenOf: Map<string, RequirementItem[]>;
  policy: AnalysisPolicy;
  /** Tests per item and criterion (G4); absent when the analysis got no test results. */
  testsByItem?: Map<string, { ac: string; test: TestCase }[]>;
}

export function createEnv(ctx: ProjectContext, built: BuiltGraph, decisions: Decision[], policy: AnalysisPolicy): AnalysisEnv {
  const reqByKey = new Map(ctx.requirements.map((r) => [r.key, r]));
  const docsByEntity = new Map(ctx.documents.map((d) => [docId(d), d]));
  const framesByEntity = new Map(ctx.frames.map((f) => [frameId(f), f]));
  const childrenOf = new Map<string, RequirementItem[]>();
  for (const r of ctx.requirements) {
    for (const p of new Set([r.parentKey, r.epicKey].filter(Boolean) as string[])) {
      (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(r);
    }
  }

  const pack = claimPackOf(ctx.project.claimPack);
  const claimsByEntity = new Map<string, Claim[]>();
  for (const r of ctx.requirements) {
    const domain = normalizeSubject(built.domains.get(r.key)?.name ?? 'general', pack);
    const text = [r.title, r.description, ...r.acceptanceCriteria, ...r.businessRules].join('\n');
    claimsByEntity.set(issueId(r.key), extractClaims(text, { source: 'jira', entityId: issueId(r.key), title: r.key, url: r.url }, { defaultSubject: domain, updatedAt: r.updatedAt, pack }));
  }
  for (const d of ctx.documents) {
    // Code items state facts only when tf backed them with evidence it could confirm; their title repeats the body.
    if (d.code && !isClaimable(d.code)) continue;
    const text = d.code ? d.body : `${d.title}\n${d.body}`;
    claimsByEntity.set(docId(d), extractClaims(text, evDoc(d), { defaultSubject: normalizeSubject(d.labels[0] ?? d.space ?? 'general', pack), updatedAt: d.updatedAt, pack }));
  }
  for (const f of ctx.frames) {
    claimsByEntity.set(frameId(f), extractClaims([f.name, ...f.texts].join('\n'), { source: 'figma', entityId: frameId(f), title: `${f.fileName} / ${f.name}`, url: f.url }, { defaultSubject: 'general', updatedAt: f.updatedAt, confidence: 'medium', pack }));
  }
  const decisionsByItem = new Map<string, Decision[]>();
  const decisionsByQuestion = new Map<string, Decision>();
  for (const dec of decisions) {
    (decisionsByItem.get(dec.itemKey) ?? decisionsByItem.set(dec.itemKey, []).get(dec.itemKey)!).push(dec);
    decisionsByQuestion.set(dec.questionId, dec);
    const domain = normalizeSubject(built.domains.get(dec.itemKey)?.name ?? 'general', pack);
    // The answer carries the claim; the question only supplies context ("How many times…" + "Up to 3 times").
    const answer = `${dec.answer}${dec.note ? `. ${dec.note}` : ''}`;
    const text = /\d|idempot|unlimited|async|synchron|dedup/i.test(answer) ? `${dec.question.replace(/\?/g, '').replace(/\d+\s*(?:seconds?|s|minutes?)/gi, '')} — ${answer}` : answer;
    claimsByEntity.set(
      `decision:${dec.id}`,
      extractClaims(text, { source: 'decision', entityId: `decision:${dec.id}`, title: `Decision on ${dec.topic} (${dec.decidedBy})` }, { defaultSubject: domain, updatedAt: dec.decidedAt, pack }),
    );
  }
  return { ctx, built, reqByKey, docsByEntity, framesByEntity, claimsByEntity, decisionsByItem, decisionsByQuestion, childrenOf, policy, testsByItem: testsByItem(ctx.requirements, ctx.tests) };
}

/** Everything the rules need to know about one item. */
export interface ItemCtx {
  r: RequirementItem;
  bundle: ContextBundle;
  /** Confluence pages of the item's context. */
  docs: DocumentItem[];
  /** Items of tf's reconstruction from code in the item's context (current state of the code). */
  code: DocumentItem[];
  /** Operations of an OpenAPI contract in the item's context (also in `docs`, whose claims they feed). */
  api: DocumentItem[];
  frames: DesignFrame[];
  decisions: Decision[];
  /**
   * Requirement text only. Human decisions are applied afterwards and resolve
   * the findings they answer (so the finding stays visible as "resolved").
   */
  specText: string;
  decisionText: string;
  docText: string;
  designText: string;
  traits: Set<Trait>;
  /**
   * `sources` = Jira + Confluence + Figma; `all` additionally includes decisions. `code` (tf's reconstruction) is kept
   * apart: it can contradict the specification (CON-001) but never answers a question the specification leaves open.
   */
  claims: { spec: Claim[]; docs: Claim[]; design: Claim[]; code: Claim[]; decisions: Claim[]; sources: Claim[]; all: Claim[] };
  ui: boolean;
  env: AnalysisEnv;
}

export function itemContext(env: AnalysisEnv, r: RequirementItem): ItemCtx {
  const bundle = env.built.bundles.get(r.key)!;
  const linked = bundle.documents.filter((x) => x.confidence >= EVIDENCE_CONFIDENCE).map((x) => env.docsByEntity.get(x.entityId)!).filter(Boolean);
  const docs = linked.filter((d) => d.source !== 'code');
  const frames = bundle.frames.filter((x) => x.confidence >= EVIDENCE_CONFIDENCE).map((x) => env.framesByEntity.get(x.entityId)!).filter(Boolean);
  const decisions = env.decisionsByItem.get(r.key) ?? [];
  const reqText = [r.title, r.description, ...r.acceptanceCriteria, ...r.businessRules].join('\n');
  const specText = reqText;
  const decisionText = decisions.map((d) => `${d.answer}. ${d.note ?? ''}`).join('\n');
  const docText = docs.map((d) => d.body).join('\n');
  const designText = frames.map((f) => [f.name, ...f.texts].join('\n')).join('\n');

  const traits = new Set<Trait>();
  for (const [t, re] of Object.entries(TRAIT_PATTERNS) as [Trait, RegExp][]) if (re.test(reqText)) traits.add(t);
  const docClaims = docs.flatMap((d) => env.claimsByEntity.get(docId(d)) ?? []);
  if (docClaims.some((c) => c.attribute === 'processing_mode' && c.value === 'async')) traits.add('async');

  const spec = env.claimsByEntity.get(issueId(r.key)) ?? [];
  const design = frames.flatMap((f) => env.claimsByEntity.get(frameId(f)) ?? []);
  const decs = decisions.flatMap((d) => env.claimsByEntity.get(`decision:${d.id}`) ?? []);
  // Code joins the item's context when it is linked to it, or when it states a fact the item's sources also state
  // (same subject and attribute): a short rule like "the payment timeout is 45 seconds" rarely matches by text.
  const stated = new Set([...spec, ...docClaims, ...design].map(factKey));
  const code = env.ctx.documents.filter((d) => d.source === 'code' && (linked.includes(d) || (env.claimsByEntity.get(docId(d)) ?? []).some((x) => stated.has(factKey(x)))));
  const codeClaims = code.flatMap((d) => env.claimsByEntity.get(docId(d)) ?? []);

  const ui = hasUi(r);
  return {
    r,
    bundle,
    docs,
    code,
    api: docs.filter((d) => d.source === 'api'),
    frames,
    decisions,
    specText,
    decisionText,
    docText,
    designText,
    traits,
    claims: { spec, docs: docClaims, design, code: codeClaims, decisions: decs, sources: [...spec, ...docClaims, ...design], all: [...spec, ...docClaims, ...design, ...decs] },
    ui,
    env,
  };
}

/** False for issues labelled as having no user interface (backend, api, infra, tech debt, no-ui). */
export const hasUi = (r: Pick<RequirementItem, 'labels'>) => !r.labels.some((l) => /^(backend|api|infra|tech[- ]?debt|no[- ]?ui)$/i.test(l));

const factKey = (c: Claim) => `${c.subject}.${c.attribute}`;

// ---------------- evidence helpers ----------------

export function evJira(r: RequirementItem, re?: RegExp): Evidence {
  const text = [r.title, r.description, ...r.acceptanceCriteria, ...r.businessRules].join('\n');
  return { source: 'jira', entityId: issueId(r.key), title: `${r.key} — ${r.title}`, url: r.url, excerpt: re ? excerpt(text, re) : undefined };
}
export function evDoc(d: DocumentItem, re?: RegExp): Evidence {
  if (d.code) {
    // Cited as the code itself: path:line of the first evidence, the quoted code as excerpt.
    const e = d.code.evidence[0];
    const at = e ? `${e.path}:${e.line}${e.lineEnd > e.line ? `-${e.lineEnd}` : ''}` : d.title;
    return { source: 'code', entityId: docId(d), title: `Code ${at}`, url: d.url, excerpt: d.code.quote ?? (re ? excerpt(d.body, re) : undefined) };
  }
  if (d.api) return { source: 'api', entityId: docId(d), title: `API ${d.api.method} ${d.api.path}`, url: d.url, excerpt: re ? excerpt(d.body, re) : undefined };
  return { source: 'confluence', entityId: docId(d), title: d.title, url: d.url, excerpt: re ? excerpt(d.body, re) : undefined };
}
export function evFrame(f: DesignFrame): Evidence {
  return { source: 'figma', entityId: frameId(f), title: `${f.fileName} / ${f.name}`, url: f.url };
}
export function evDecision(d: Decision): Evidence {
  return { source: 'decision', entityId: `decision:${d.id}`, title: `Decision by ${d.decidedBy} (${d.decidedAt.slice(0, 10)})`, excerpt: d.answer };
}

export const questionOptions = (labels: string[]): QuestionOption[] => [...labels, 'Other'].map((label, i) => ({ id: `o${i + 1}`, label }));
