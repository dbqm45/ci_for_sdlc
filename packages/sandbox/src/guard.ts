import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject, DEMO_SCENARIOS, RULES, type IssueType, type ItemAnalysis, type ProjectContext } from '@ci/core';
import { KITS, type KitInfo } from './kits/registry.js';
import { checkoutWorld, worldAfter } from './world/checkout.js';
import { DERIVED_EXPECTATIONS, EXPECTATIONS, type Case, type RuleExpectation } from './world/expectations.js';
import { SCENARIOS, type Scenario } from './world/scenarios.js';

/**
 * Coverage guard (docs/TEST-DATA-GENERATOR.md, 5.3), run by Vitest. Every check returns the list of problems, each
 * saying what to add or fix; an empty list means the world still covers the application.
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

/** Repository root and a reader of repo-relative files (undefined when the file is missing). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const readRepoFile = (path: string): string | undefined => {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
};

/** Check 2: every kit has objects in the world, an API mock, a contract test against that mock and a seeder. */
export function checkKits(
  kits: KitInfo[] = KITS,
  world: ProjectContext = checkoutWorld(),
  scenarios: Pick<Scenario, 'id' | 'source'>[] = SCENARIOS,
  read: (path: string) => string | undefined = readRepoFile,
): string[] {
  const problems: string[] = [];
  for (const k of kits) {
    if (!k.objects(world).length) problems.push(`${k.id}: no objects in the world — add them to world/checkout.ts`);
    if (read(k.mock) === undefined) problems.push(`${k.id}: the API mock ${k.mock} is missing`);
    const contract = read(k.contract);
    if (contract === undefined) problems.push(`${k.id}: the contract test ${k.contract} is missing`);
    else if (!contract.includes(`/${basename(k.mock).replace(/\.ts$/, '.js')}`)) problems.push(`${k.id}: the contract test ${k.contract} does not use the mock ${k.mock}`);
    if (read(k.seeder) === undefined) problems.push(`${k.id}: the seeder ${k.seeder} is missing`);
  }
  for (const s of scenarios) if (!kits.some((k) => k.id === s.source)) problems.push(`${s.id}: source "${s.source}" has no kit — add it to kits/registry.ts`);
  return problems;
}

export interface EndpointCall {
  method: string;
  path: string;
}

const CALL_PATTERNS: [RegExp, (m: RegExpMatchArray) => EndpointCall][] = [
  // json('GET', '/api/…'), call('POST', …), inject({ method: 'DELETE', url: `/api/…` })
  [/'(GET|POST|PUT|DELETE|PATCH)'\s*,\s*(?:url:\s*)?[`'"](\/api\/[^`'"?]*)/g, (m) => ({ method: m[1]!, path: m[2]! })],
  // request.post('/api/…'), page.request.get(`/api/…`)
  [/\.(get|post|put|delete|patch)\(\s*[`'"](\/api\/[^`'"?]*)/g, (m) => ({ method: m[1]!.toUpperCase(), path: m[2]! })],
  // new EventSource('/api/events')
  [/new EventSource\(\s*[`'"](\/api\/[^`'"?]*)/g, (m) => ({ method: 'GET', path: m[1]! })],
];

/** The API calls in a test source, in source order; the query string is dropped. */
export function endpointCalls(source: string): EndpointCall[] {
  return CALL_PATTERNS.flatMap(([re, call]) => [...source.matchAll(re)].map((m) => ({ at: m.index!, call: call(m) })))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.call);
}

/** Test sources of the API and e2e tests (*.ts and *.mts, recursively), by repo-relative path. */
function testSources(dirs = ['packages/server/test', 'e2e']): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(path);
      else if (/\.m?ts$/.test(e.name)) out[path] = readFileSync(join(ROOT, path), 'utf8');
    }
  };
  for (const d of dirs) if (existsSync(join(ROOT, d))) walk(d);
  return out;
}

const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** Check 3: every endpoint of the OpenAPI contract is called by at least one API or e2e test. */
export function checkEndpointCoverage(
  contract: { paths: Record<string, Record<string, unknown>> } = JSON.parse(readRepoFile('packages/server/contracts/openapi.json')!),
  sources: Record<string, string> = testSources(),
): string[] {
  const calls = Object.values(sources).flatMap(endpointCalls);
  const problems: string[] = [];
  for (const [path, ops] of Object.entries(contract.paths)) {
    const re = new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+')}$`);
    for (const method of Object.keys(ops).filter((m) => METHODS.includes(m))) {
      if (!calls.some((c) => c.method === method.toUpperCase() && re.test(c.path))) {
        problems.push(`${method.toUpperCase()} ${path}: no API or e2e test calls it — add one to packages/server/test or e2e`);
      }
    }
  }
  return problems;
}
