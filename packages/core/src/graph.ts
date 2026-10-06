import type {
  ContextBundle,
  ContextRef,
  Decision,
  DesignFrame,
  DocumentItem,
  Entity,
  EntityKind,
  ProjectContext,
  Relation,
  RelationType,
  RequirementItem,
} from './model.js';
import { TfIdf, cosine, hash, sharedTerms, type Vector } from './text.js';
import { documentMeaning, frameMeaning, requirementMeaning } from './analysis/fingerprint.js';

export const issueId = (key: string) => `jira:${key}`;
export const docId = (id: string) => `confluence:${id}`;
export const frameId = (f: { fileKey: string; id: string }) => `figma:${f.fileKey}:${f.id}`;
export const domainId = (name: string) => `domain:${name}`;

export function requirementText(r: RequirementItem): string {
  return [r.title, r.description, ...r.acceptanceCriteria, ...r.businessRules, r.labels.join(' '), r.components.join(' ')].join('\n');
}
export function documentText(d: DocumentItem): string {
  return `${d.title}\n${d.body}`;
}
export function frameText(f: DesignFrame): string {
  return [f.fileName, f.page, f.name, ...f.texts].join('\n');
}

/**
 * Context Graph — entities from all sources plus explicit and discovered
 * relations. Not a search index: every edge carries a type, a confidence and
 * a human-readable reason (provenance).
 */
export class ContextGraph {
  readonly entities = new Map<string, Entity>();
  readonly relations: Relation[] = [];
  private outIdx = new Map<string, Relation[]>();
  private inIdx = new Map<string, Relation[]>();

  addEntity(e: Entity) {
    this.entities.set(e.id, e);
  }

  addRelation(r: Relation) {
    if (r.from === r.to || !this.entities.has(r.from) || !this.entities.has(r.to)) return;
    const existing = (this.outIdx.get(r.from) ?? []).find((x) => x.to === r.to && x.type === r.type);
    if (existing) {
      // Keep the strongest evidence for an edge.
      if (r.confidence > existing.confidence) Object.assign(existing, r);
      return;
    }
    this.relations.push(r);
    (this.outIdx.get(r.from) ?? this.outIdx.set(r.from, []).get(r.from)!).push(r);
    (this.inIdx.get(r.to) ?? this.inIdx.set(r.to, []).get(r.to)!).push(r);
  }

  out(id: string): Relation[] {
    return this.outIdx.get(id) ?? [];
  }
  in(id: string): Relation[] {
    return this.inIdx.get(id) ?? [];
  }

  /** Undirected neighbourhood up to `depth` hops. */
  neighbourhood(id: string, depth = 2): Map<string, number> {
    const seen = new Map<string, number>([[id, 0]]);
    let frontier = [id];
    for (let d = 1; d <= depth; d++) {
      const next: string[] = [];
      for (const n of frontier) {
        for (const r of [...this.out(n), ...this.in(n)]) {
          const other = r.from === n ? r.to : r.from;
          if (!seen.has(other)) {
            seen.set(other, d);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    return seen;
  }

  toJSON() {
    return { entities: [...this.entities.values()], relations: this.relations };
  }
}

export interface BuiltGraph {
  graph: ContextGraph;
  /** Context per requirement key. */
  bundles: Map<string, ContextBundle>;
  domains: Map<string, { name: string; confidence: number; alternatives: { name: string; confidence: number }[] }>;
}

const DOC_THRESHOLD = 0.16;
const FRAME_THRESHOLD = 0.17;

export function buildContextGraph(ctx: ProjectContext, decisions: Decision[] = []): BuiltGraph {
  const g = new ContextGraph();
  const reqByKey = new Map(ctx.requirements.map((r) => [r.key, r]));

  for (const r of ctx.requirements) {
    const text = requirementText(r);
    g.addEntity({
      id: issueId(r.key),
      kind: r.type as EntityKind,
      source: 'jira',
      title: `${r.key} — ${r.title}`,
      url: r.url,
      updatedAt: r.updatedAt,
      text,
      contentHash: hash(text + r.status),
      meaningHash: requirementMeaning(r, issueId(r.key)),
    });
  }
  for (const d of ctx.documents) {
    const text = documentText(d);
    g.addEntity({ id: docId(d.id), kind: 'document', source: 'confluence', title: d.title, url: d.url, updatedAt: d.updatedAt, text, contentHash: hash(text), meaningHash: documentMeaning(d, docId(d.id)) });
  }
  for (const f of ctx.frames) {
    const text = frameText(f);
    g.addEntity({
      id: frameId(f),
      kind: 'figma_frame',
      source: 'figma',
      title: `${f.fileName} / ${f.name}`,
      url: f.url,
      updatedAt: f.updatedAt,
      text,
      contentHash: hash(text + f.transitions.join(',')),
      meaningHash: frameMeaning(f, frameId(f)),
    });
  }
  for (const dec of decisions) {
    g.addEntity({
      id: `decision:${dec.id}`,
      kind: 'decision',
      source: 'decision',
      title: `Decision: ${dec.topic}`,
      updatedAt: dec.decidedAt,
      text: `${dec.question}\n${dec.answer}\n${dec.note ?? ''}`,
      contentHash: hash(dec.answer + (dec.note ?? '')),
    });
  }

  // ---------------- explicit relations ----------------
  for (const r of ctx.requirements) {
    const id = issueId(r.key);
    if (r.epicKey && reqByKey.has(r.epicKey)) {
      g.addRelation({ from: id, to: issueId(r.epicKey), type: 'belongs_to', confidence: 1, via: 'explicit', reason: 'Jira epic link' });
    }
    if (r.parentKey && reqByKey.has(r.parentKey)) {
      const type: RelationType = r.type === 'task' || r.type === 'subtask' ? 'implements' : 'belongs_to';
      g.addRelation({ from: id, to: issueId(r.parentKey), type, confidence: 1, via: 'explicit', reason: 'Jira parent' });
    }
    for (const l of r.links) {
      if (!reqByKey.has(l.key)) continue;
      const lt = l.type.toLowerCase();
      const type: RelationType = /block|depend/.test(lt) ? 'depends_on' : /caused|affect/.test(lt) ? 'affects' : /supersed|replace/.test(lt) ? 'supersedes' : 'related_to';
      g.addRelation({ from: id, to: issueId(l.key), type, confidence: 1, via: 'explicit', reason: `Jira issue link "${l.type}"` });
    }
    for (const url of r.remoteLinks) {
      const doc = ctx.documents.find((d) => (d.url && url.startsWith(d.url)) || url.includes(`/pages/${d.id}`));
      if (doc) g.addRelation({ from: id, to: docId(doc.id), type: 'documented_by', confidence: 1, via: 'explicit', reason: 'Linked from Jira issue' });
      const node = /node-id=([\w%:-]+)/.exec(url)?.[1]?.replace('%3A', ':').replace('-', ':');
      const frame = node ? ctx.frames.find((f) => url.includes(f.fileKey) && f.id === node) : undefined;
      if (frame) g.addRelation({ from: id, to: frameId(frame), type: 'designed_by', confidence: 1, via: 'explicit', reason: 'Figma link on Jira issue' });
    }
  }

  const keyRegex = new RegExp(`\\b(${[...reqByKey.keys()].map(escapeRe).join('|') || '$^'})\\b`, 'g');
  for (const d of ctx.documents) {
    for (const m of new Set(d.body.match(keyRegex) ?? [])) {
      g.addRelation({ from: issueId(m), to: docId(d.id), type: 'documented_by', confidence: 0.95, via: 'explicit', reason: `Page mentions ${m}` });
    }
    for (const other of ctx.documents) {
      if (other.id !== d.id && other.title.length > 6 && d.body.toLowerCase().includes(other.title.toLowerCase())) {
        g.addRelation({ from: docId(d.id), to: docId(other.id), type: 'references', confidence: 0.9, via: 'explicit', reason: `"${d.title}" links to "${other.title}"` });
      }
    }
    const sup = /superseded by[:\s]+["“]?([^"”\n.]+)/i.exec(d.body);
    if (sup) {
      const target = ctx.documents.find((x) => x.id !== d.id && x.title.toLowerCase().includes(sup[1].trim().toLowerCase()));
      if (target) g.addRelation({ from: docId(target.id), to: docId(d.id), type: 'supersedes', confidence: 0.95, via: 'explicit', reason: `"${d.title}" says it is superseded` });
    }
  }
  for (const f of ctx.frames) {
    for (const m of new Set(frameText(f).match(keyRegex) ?? [])) {
      g.addRelation({ from: issueId(m), to: frameId(f), type: 'designed_by', confidence: 0.95, via: 'explicit', reason: `Frame annotated with ${m}` });
    }
    for (const t of f.transitions) {
      const target = ctx.frames.find((x) => x.id === t && x.fileKey === f.fileKey);
      if (target) g.addRelation({ from: frameId(f), to: frameId(target), type: 'related_to', confidence: 1, via: 'explicit', reason: 'Prototype transition' });
    }
  }
  for (const dec of decisions) {
    if (reqByKey.has(dec.itemKey)) {
      g.addRelation({ from: issueId(dec.itemKey), to: `decision:${dec.id}`, type: 'decided_by', confidence: 1, via: 'explicit', reason: 'Human decision recorded' });
    }
  }

  // ---------------- semantic discovery ----------------
  const tfidf = new TfIdf([...g.entities.values()].map((e) => e.text));
  const vectors = new Map<string, Vector>();
  for (const e of g.entities.values()) vectors.set(e.id, tfidf.vector(e.text));

  // Frames are short; score each frame by its own text plus its page/flow siblings
  const flowVectors = new Map<string, Vector>();
  const flows = groupBy(ctx.frames, (f) => `${f.fileKey}/${f.page}`);
  for (const [flow, frames] of flows) flowVectors.set(flow, tfidf.vector(frames.map(frameText).join('\n')));

  for (const r of ctx.requirements) {
    if (r.type === 'task' || r.type === 'subtask') continue;
    const id = issueId(r.key);
    const v = vectors.get(id)!;
    const titleV = tfidf.vector(`${r.title} ${r.title} ${r.acceptanceCriteria.join(' ')}`);

    const docScores = ctx.documents
      .map((d) => ({ d, s: cosine(v, vectors.get(docId(d.id))!) }))
      .filter((x) => x.s >= DOC_THRESHOLD)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);
    for (const { d, s } of docScores) {
      const terms = sharedTerms(v, vectors.get(docId(d.id))!);
      g.addRelation({ from: id, to: docId(d.id), type: 'documented_by', confidence: round(Math.min(0.9, 0.35 + s)), via: 'semantic', reason: `Semantic match (${terms.join(', ')})` });
    }

    // A linked frame defines the flow ("Add card / …"): its siblings belong to the story,
    // and semantic discovery stays inside the linked flows instead of the whole file.
    const linkedFlows = new Set(
      g
        .out(id)
        .filter((rel) => rel.type === 'designed_by')
        .map((rel) => ctx.frames.find((f) => frameId(f) === rel.to))
        .filter((f): f is DesignFrame => !!f)
        .map(flowOf),
    );
    for (const f of ctx.frames) {
      if (linkedFlows.has(flowOf(f))) g.addRelation({ from: id, to: frameId(f), type: 'designed_by', confidence: 0.85, via: 'semantic', reason: `Same flow as linked frame ("${flowOf(f).split('|')[1]}")` });
    }
    const frameScores = ctx.frames
      .filter((f) => !linkedFlows.size || linkedFlows.has(flowOf(f)))
      .map((f) => {
        const own = cosine(titleV, vectors.get(frameId(f))!);
        const flow = cosine(titleV, flowVectors.get(`${f.fileKey}/${f.page}`)!);
        return { f, s: 0.6 * own + 0.4 * flow };
      })
      .filter((x) => x.s >= FRAME_THRESHOLD)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    for (const { f, s } of frameScores) {
      const terms = sharedTerms(titleV, vectors.get(frameId(f))!);
      g.addRelation({ from: id, to: frameId(f), type: 'designed_by', confidence: round(Math.min(0.9, 0.3 + s)), via: 'semantic', reason: `Semantic match (${terms.join(', ') || 'flow'})` });
    }
  }

  // ---------------- domain detection ----------------
  const domains = detectDomains(ctx, g, tfidf, vectors);

  // ---------------- bundles ----------------
  const bundles = new Map<string, ContextBundle>();
  for (const r of ctx.requirements) bundles.set(r.key, bundleFor(g, r, reqByKey));

  return { graph: g, bundles, domains };
}

function bundleFor(g: ContextGraph, r: RequirementItem, reqByKey: Map<string, RequirementItem>): ContextBundle {
  const id = issueId(r.key);
  const refs = new Map<string, ContextRef>();
  const push = (rel: Relation, otherId: string, factor = 1, reasonPrefix = '') => {
    const e = g.entities.get(otherId);
    if (!e || otherId === id) return;
    const conf = round(rel.confidence * factor);
    const prev = refs.get(otherId);
    if (prev && prev.confidence >= conf) return;
    refs.set(otherId, {
      entityId: otherId,
      kind: e.kind,
      source: e.source,
      title: e.title,
      url: e.url,
      relation: rel.type,
      via: rel.via,
      confidence: conf,
      reason: reasonPrefix + rel.reason,
    });
  };
  for (const rel of g.out(id)) push(rel, rel.to);
  for (const rel of g.in(id)) push(rel, rel.from);

  // Follow page links from directly linked documentation (one hop).
  for (const rel of g.out(id).filter((x) => x.type === 'documented_by' && x.via === 'explicit')) {
    for (const ref of g.out(rel.to).filter((x) => x.type === 'references')) push(ref, ref.to, 0.85, 'Linked from related page: ');
  }

  // Inherit design/docs from the epic (stories) or parent story (tasks/bugs).
  const parents = [r.epicKey, r.parentKey, ...r.links.filter((l) => /caused|relates|affect/i.test(l.type)).map((l) => l.key)].filter(
    (k): k is string => !!k && reqByKey.has(k),
  );
  for (const p of parents) {
    for (const rel of g.out(issueId(p))) {
      if (rel.type === 'documented_by' || (rel.type === 'designed_by' && rel.via === 'explicit')) push(rel, rel.to, 0.6, `Via ${p}: `);
    }
  }

  const all = [...refs.values()].sort((a, b) => b.confidence - a.confidence);
  return {
    requirements: all.filter((x) => x.source === 'jira' || x.source === 'decision'),
    documents: all.filter((x) => x.source === 'confluence'),
    frames: all.filter((x) => x.source === 'figma'),
  };
}

function detectDomains(ctx: ProjectContext, g: ContextGraph, tfidf: TfIdf, vectors: Map<string, Vector>): BuiltGraph['domains'] {
  const names = new Set<string>();
  for (const r of ctx.requirements) r.components.forEach((c) => names.add(c));
  const result: BuiltGraph['domains'] = new Map();
  if (names.size === 0) return result;

  const profiles = new Map<string, Vector>();
  for (const name of names) {
    const lname = name.toLowerCase();
    const members = [
      ...ctx.requirements.filter((r) => r.components.includes(name)).map(requirementText),
      ...ctx.documents.filter((d) => d.labels.map((l) => l.toLowerCase()).includes(lname) || d.space.toLowerCase() === lname).map(documentText),
    ];
    profiles.set(name, tfidf.vector(`${name} ${name} ${name}\n${members.join('\n')}`));
    g.addEntity({ id: domainId(name), kind: 'domain', title: name, text: name, contentHash: hash(name) });
  }

  for (const r of ctx.requirements) {
    const v = vectors.get(issueId(r.key))!;
    const raw = [...profiles].map(([name, pv]) => ({ name, s: cosine(v, pv) + (r.components.includes(name) ? 0.35 : 0) }));
    const total = raw.reduce((a, b) => a + b.s, 0) || 1;
    const scored = raw
      .map((x) => ({ name: x.name, confidence: round(Math.min(0.99, (x.s / total) * 0.6 + x.s * 0.6)) }))
      .sort((a, b) => b.confidence - a.confidence);
    if (!scored.length || scored[0].confidence < 0.15) continue;
    result.set(r.key, { name: scored[0].name, confidence: scored[0].confidence, alternatives: scored.slice(1, 3).filter((x) => x.confidence >= 0.1) });
    g.addRelation({ from: issueId(r.key), to: domainId(scored[0].name), type: 'in_domain', confidence: scored[0].confidence, via: r.components.includes(scored[0].name) ? 'explicit' : 'semantic', reason: 'Domain detection' });
  }
  return result;
}

/** Flow = file + frame-name prefix before " / " (falls back to the page). */
function flowOf(f: DesignFrame): string {
  const i = f.name.indexOf(' / ');
  return `${f.fileKey}|${i > 0 ? f.name.slice(0, i).trim() : f.page}`;
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
  return m;
}
const round = (n: number) => Math.round(n * 100) / 100;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
