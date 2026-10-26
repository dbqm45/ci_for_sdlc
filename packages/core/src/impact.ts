import { ATTRIBUTE_LABELS } from './analysis/claims.js';
import type { ContextGraph } from './graph.js';
import type { AnalysisResult, ClaimAttribute, EntityKind, SourceSystem } from './model.js';
import { TfIdf, cosine, sharedTerms } from './text.js';

export interface ImpactHit {
  entityId: string;
  kind: EntityKind;
  source?: SourceSystem;
  title: string;
  url?: string;
  score: number;
  reason: string;
}

export interface ImpactReport {
  query: string;
  bySource: Record<'jira' | 'confluence' | 'figma', ImpactHit[]>;
  affectedItems: { key: string; title: string; readiness: string; via: string[] }[];
  claims: { attribute: string; value: string; title: string; entityId: string }[];
}

const ATTRIBUTE_HINTS: [ClaimAttribute, RegExp][] = [
  ['timeout', /time[- ]?out/i],
  ['retry_limit', /retr/i],
  ['idempotent', /idempot|duplicate/i],
  ['processing_mode', /async|sync|processing/i],
  ['session_lifetime', /session/i],
  ['max_items', /limit|max/i],
  ['max_file_size', /upload|file size/i],
  ['power', /\bk?W\b|power|moc/i],
  ['energy', /kWh|energy|energi/i],
  ['ocpp_version', /ocpp/i],
  ['uptime_target', /uptime|availability|dostępnoś/i],
  ['uptime_definition', /uptime|maintenance/i],
  ['connector_status', /connector|status|złącz/i],
];

/**
 * UC-11 — Impact analysis: "what else is affected if we change X?"
 * Accepts either an entity id (e.g. "jira:PAY-125") or free text
 * ("change payment timeout from 30s to 60s").
 */
export function impactAnalysis(graph: ContextGraph, result: AnalysisResult, query: string): ImpactReport {
  const hits = new Map<string, ImpactHit>();
  const add = (h: ImpactHit) => {
    const p = hits.get(h.entityId);
    if (!p || p.score < h.score) hits.set(h.entityId, h);
  };
  const entities = [...graph.entities.values()].filter((e) => e.kind !== 'domain' && e.kind !== 'decision');

  const seed = graph.entities.get(query.trim());
  if (seed) {
    for (const [id, depth] of graph.neighbourhood(seed.id, 2)) {
      const e = graph.entities.get(id);
      if (!e || id === seed.id || e.kind === 'domain' || e.kind === 'decision') continue;
      add({ entityId: id, kind: e.kind, source: e.source, title: e.title, url: e.url, score: depth === 1 ? 0.9 : 0.5, reason: depth === 1 ? 'Directly related in the context graph' : 'Two hops away in the context graph' });
    }
  } else {
    const tfidf = new TfIdf(entities.map((e) => e.text));
    const qv = tfidf.vector(query);
    for (const e of entities) {
      const s = cosine(qv, tfidf.vector(e.text));
      if (s >= 0.12) add({ entityId: e.id, kind: e.kind, source: e.source, title: e.title, url: e.url, score: Math.round(s * 100) / 100, reason: `Mentions ${sharedTerms(qv, tfidf.vector(e.text)).join(', ')}` });
    }
  }

  // Claim-level matches: every source stating a value for the same fact is impacted.
  const attrs = ATTRIBUTE_HINTS.filter(([, re]) => re.test(query)).map(([a]) => a);
  const claims: ImpactReport['claims'] = [];
  const seenClaims = new Set<string>();
  for (const item of result.items) {
    for (const c of item.claims) {
      if (!attrs.includes(c.attribute)) continue;
      const k = `${c.evidence.entityId}|${c.attribute}|${c.value}`;
      if (seenClaims.has(k)) continue;
      seenClaims.add(k);
      claims.push({ attribute: ATTRIBUTE_LABELS[c.attribute], value: `${c.value}${c.unit ? ` ${c.unit}` : ''}`, title: c.evidence.title, entityId: c.evidence.entityId });
      const e = graph.entities.get(c.evidence.entityId);
      if (e) add({ entityId: e.id, kind: e.kind, source: e.source, title: e.title, url: e.url, score: 0.95, reason: `States ${ATTRIBUTE_LABELS[c.attribute]} = ${c.value}${c.unit ? ` ${c.unit}` : ''}` });
    }
  }

  const all = [...hits.values()].sort((a, b) => b.score - a.score);
  const bySource: ImpactReport['bySource'] = { jira: [], confluence: [], figma: [] };
  for (const h of all) if (h.source === 'jira' || h.source === 'confluence' || h.source === 'figma') bySource[h.source].push(h);

  const hitIds = new Set(all.map((h) => h.entityId));
  if (seed) hitIds.add(seed.id);
  const affectedItems: ImpactReport['affectedItems'] = [];
  for (const a of result.items) {
    if (a.type === 'task') continue;
    const via = [`jira:${a.key}`, ...[...a.context.documents, ...a.context.frames].filter((r) => r.confidence >= 0.45).map((r) => r.entityId)].filter((id) => hitIds.has(id));
    if (via.length) affectedItems.push({ key: a.key, title: a.title, readiness: a.readiness, via: via.map((id) => graph.entities.get(id)?.title ?? id) });
  }
  return { query, bySource, affectedItems, claims };
}
