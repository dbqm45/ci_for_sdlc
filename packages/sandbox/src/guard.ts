import { readFileSync } from 'node:fs';
import { analyzeProject, DEMO_SCENARIOS, RULES, type IssueType, type ItemAnalysis, type ProjectContext } from '@ci/core';
import { checkoutWorld, worldAfter } from './world/checkout.js';
import { DERIVED_EXPECTATIONS, EXPECTATIONS, type Case, type RuleExpectation } from './world/expectations.js';
import { SCENARIOS, type Scenario } from './world/scenarios.js';

/**
 * Coverage guard (docs/TEST-DATA-GENERATOR.md, 5.3), run by Vitest. Every check returns the list of problems, each
 * saying what to add or fix; an empty list means the world still covers the application. Checks 2 (kits) and 3
 * (OpenAPI endpoints) come with the kits in stage E3.
 */

export interface RuleInfo {
  id: string;
  appliesTo: readonly IssueType[];
}

/** Path of the analysis module that raises the rules outside RULES. */
const ANALYZE_SOURCE = new URL('../../core/src/analysis/analyze.ts', import.meta.url);

/** Rule ids raised by the cross-item pass: findingFromDraft('<id>', …) calls in the analysis. */
export function derivedRuleIds(source = readFileSync(ANALYZE_SOURCE, 'utf8')): string[] {
  return [...new Set([...source.matchAll(/findingFromDraft\(\s*'([A-Z]+-\d+)'/g)].map((m) => m[1]!))];
}

const label = (c: Case) => (typeof c === 'string' ? c : `${c.item} after "${c.after}"`);

/** Check 1: every rule — from RULES and from the cross-item pass — has a `fires` and a `silent` case, and no more. */
export function checkRuleCoverage(
  rules: RuleInfo[] = RULES,
  derived: string[] = derivedRuleIds(),
  expectations: RuleExpectation[] = EXPECTATIONS,
  derivedExpectations: RuleExpectation[] = DERIVED_EXPECTATIONS,
): string[] {
  const problems: string[] = [];
  const check = (ids: string[], list: RuleExpectation[], where: string) => {
    for (const id of ids) {
      const e = list.find((x) => x.rule === id);
      if (!e) problems.push(`${id}: no entry in ${where} — add the item it fires on and one it stays silent on`);
      else {
        if (!e.fires.length && !e.gap) problems.push(`${id}: no "fires" case in ${where}`);
        if (e.fires.length && e.gap) problems.push(`${id}: has "fires" cases and a gap in ${where} — remove the gap`);
        if (!e.silent.length) problems.push(`${id}: no "silent" case in ${where}`);
      }
    }
    for (const e of list) if (!ids.includes(e.rule)) problems.push(`${e.rule}: in ${where}, but no such rule — remove it or rename it`);
  };
  check(rules.map((r) => r.id), expectations, 'EXPECTATIONS');
  check(derived, derivedExpectations, 'DERIVED_EXPECTATIONS');
  return problems;
}

/** Runs the analysis on every world the cases need: the base world and the world after each scenario used. */
async function analyzedWorlds(cases: Case[]): Promise<Map<string, Map<string, ItemAnalysis>>> {
  const worlds = new Map<string, Map<string, ItemAnalysis>>();
  for (const after of new Set(cases.map((c) => (typeof c === 'string' ? '' : c.after)))) {
    const world = after ? worldAfter(after) : checkoutWorld();
    const { result } = await analyzeProject(world, { now: new Date('2026-10-01T00:00:00.000Z') });
    worlds.set(after, new Map(result.items.map((i) => [i.key, i])));
  }
  return worlds;
}

/** The cases of check 1 hold: the analysis of the world raises the rule on every `fires` item and on no `silent` one. */
export async function verifyExpectations(
  rules: RuleInfo[] = [...RULES, ...DERIVED_EXPECTATIONS.map((e) => ({ id: e.rule, appliesTo: e.appliesTo }))],
  expectations: RuleExpectation[] = [...EXPECTATIONS, ...DERIVED_EXPECTATIONS],
): Promise<string[]> {
  const problems: string[] = [];
  const worlds = await analyzedWorlds(expectations.flatMap((e) => [...e.fires, ...e.silent]));
  // A known gap stays a gap only while no world fires the rule; the worlds after every scenario are checked too.
  const gaps = expectations.filter((e) => e.gap);
  if (gaps.length) {
    for (const s of [{ id: '' }, ...DEMO_SCENARIOS]) if (!worlds.has(s.id)) for (const [k, v] of await analyzedWorlds([s.id ? { item: '', after: s.id } : ''])) worlds.set(k, v);
    for (const e of gaps) {
      for (const [after, items] of worlds) {
        for (const item of items.values()) {
          if (item.findings.some((f) => f.ruleId === e.rule)) problems.push(`${e.rule}: fires on ${label(after ? { item: item.key, after } : item.key)} — add it as a "fires" case and remove the gap`);
        }
      }
    }
  }
  const itemOf = (c: Case) => worlds.get(typeof c === 'string' ? '' : c.after)!.get(typeof c === 'string' ? c : c.item);
  for (const e of expectations) {
    const appliesTo = rules.find((r) => r.id === e.rule)?.appliesTo ?? [];
    for (const [kind, cases] of [['fires', e.fires], ['silent', e.silent]] as const) {
      for (const c of cases) {
        const item = itemOf(c);
        if (!item) {
          problems.push(`${e.rule}: ${label(c)} is not in the world`);
          continue;
        }
        if (!appliesTo.includes(item.type)) problems.push(`${e.rule}: ${label(c)} is a ${item.type}, the rule applies to ${appliesTo.join('/')}`);
        const fired = item.findings.some((f) => f.ruleId === e.rule);
        if (kind === 'fires' && !fired) problems.push(`${e.rule}: expected to fire on ${label(c)}, but it does not`);
        if (kind === 'silent' && fired) problems.push(`${e.rule}: expected to stay silent on ${label(c)}, but it fires`);
      }
    }
  }
  return problems;
}

/** Check 4: DEMO_SCENARIOS and SCENARIOS describe the same scenarios, one to one. */
export function checkScenarioParity(scenarios: Pick<Scenario, 'id'>[] = SCENARIOS, demo: { id: string }[] = DEMO_SCENARIOS): string[] {
  const problems: string[] = [];
  for (const d of demo) if (!scenarios.some((s) => s.id === d.id)) problems.push(`${d.id}: in DEMO_SCENARIOS, but not in scenarios.ts — describe its source and the objects it touches`);
  for (const s of scenarios) if (!demo.some((d) => d.id === s.id)) problems.push(`${s.id}: in scenarios.ts, but not in DEMO_SCENARIOS — add the change or remove the entry`);
  return problems;
}

/** Keys of the objects that differ between two worlds (changed, added or removed). */
function changed<T>(before: T[], after: T[], key: (x: T) => string): string[] {
  const keys = new Set([...before, ...after].map(key));
  const json = (list: T[], k: string) => JSON.stringify(list.find((x) => key(x) === k));
  return [...keys].filter((k) => json(before, k) !== json(after, k)).sort();
}

/** Every scenario names the source of its title ("Confluence: …") and touches exactly the objects it declares. */
export function checkScenarioEffects(scenarios: Scenario[] = SCENARIOS): string[] {
  const problems: string[] = [];
  for (const s of scenarios) {
    const demo = DEMO_SCENARIOS.find((d) => d.id === s.id);
    if (!demo) continue; // reported by checkScenarioParity
    const titled = /^(Jira|Confluence|Figma):/.exec(demo.title)?.[1]?.toLowerCase();
    if (titled !== s.source) problems.push(`${s.id}: source is "${s.source}", but the title says "${demo.title}"`);
    const before: ProjectContext = checkoutWorld();
    const after = worldAfter(s.id);
    const actual = {
      requirements: changed(before.requirements, after.requirements, (r) => r.key),
      documents: changed(before.documents, after.documents, (d) => d.id),
      frames: changed(before.frames, after.frames, (f) => f.id),
    };
    for (const kind of ['requirements', 'documents', 'frames'] as const) {
      const declared = [...(s.touches[kind] ?? [])].sort();
      if (JSON.stringify(declared) !== JSON.stringify(actual[kind])) {
        problems.push(`${s.id}: touches ${kind} [${declared.join(', ')}], but the change touches [${actual[kind].join(', ')}]`);
      }
    }
  }
  return problems;
}
