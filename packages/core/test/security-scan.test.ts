import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  OWASP_TOP10_CWES,
  SECURITY_RULES,
  analyzeProject,
  parseSarif,
  readRepoChanges,
  securityByItem,
  securityRuleOf,
  type ProjectContext,
  type ScanResult,
  type SecurityScan,
} from '../src/index.js';

// Z8c (docs/SECURITY-SCAN-PLAN.md): security scan results become findings of the slice that touched the file, else of the change.

const NOW = new Date('2026-11-02T10:00:00Z');
const fixture = (p: string) => fileURLToPath(new URL(`fixtures/${p}`, import.meta.url));
const results = parseSarif(readFileSync(fixture('sarif/scan.sarif'), 'utf8'), 'scan.sarif');
const repo = await readRepoChanges(fixture('repo-changes'));
const ctxWith = (scan: Partial<SecurityScan> = {}): ProjectContext => ({
  project: { key: 'PAY', name: 'Payments' },
  requirements: repo.requirements,
  documents: [],
  frames: [],
  fetchedAt: NOW.toISOString(),
  securityScan: { results, sliceFiles: { 'TSK-2': ['src/retry.ts'] }, ...scan },
});
const short = (m: Map<string, ScanResult[]> | undefined) =>
  Object.fromEntries([...(m ?? new Map<string, ScanResult[]>())].map(([k, rs]) => [k, rs.map((r) => `${r.path}:${r.line}`)]));

describe('OWASP_TOP10_CWES', () => {
  it('holds the CWEs of the OWASP Top 10 2021 and 2025 categories', () => {
    for (const cwe of [22, 78, 79, 89, 94, 287, 319, 327, 352, 502, 611, 798, 862, 918, 1104, 1275]) expect(OWASP_TOP10_CWES.has(cwe), `CWE-${cwe}`).toBe(true);
  });
  it('leaves out CWEs no category maps, such as ReDoS', () => {
    for (const cwe of [1333, 400, 1]) expect(OWASP_TOP10_CWES.has(cwe), `CWE-${cwe}`).toBe(false);
  });
});

describe('securityByItem', () => {
  it('is absent without a scan', () => {
    expect(securityByItem({ ...ctxWith(), securityScan: undefined })).toBeUndefined();
  });

  it('gives a result to the slice whose commits touched the file, the others to every change when nothing narrows them', () => {
    expect(short(securityByItem(ctxWith()))).toEqual({
      'TSK-2': ['src/retry.ts:12', 'src/retry.ts:30'],
      'CHG-1': ['src/vault.ts:8', 'src/vault.ts:20'],
      'CHG-2': ['src/vault.ts:8', 'src/vault.ts:20'],
    });
  });

  it('gives the other results to the changes of the pull request: its slices and the change folders it touches', () => {
    expect(short(securityByItem(ctxWith({ pr: { files: ['src/vault.ts'], slices: ['TSK-11'] } })))).toMatchObject({ 'CHG-2': ['src/vault.ts:8', 'src/vault.ts:20'] });
    expect(securityByItem(ctxWith({ pr: { files: ['docs/project/changes/CHG-1/plan.md'], slices: [] } }))?.has('CHG-2')).toBe(false);
  });

  it('gives a result on a change file to its change, and ignores slices the repository does not have', () => {
    const onPlan: ScanResult = { ...results[0]!, path: 'docs/project/changes/CHG-2/plan.md', line: 3 };
    expect(short(securityByItem(ctxWith({ results: [onPlan], sliceFiles: { 'TSK-99': ['docs/project/changes/CHG-2/plan.md'] } })))).toEqual({
      'CHG-2': ['docs/project/changes/CHG-2/plan.md:3'],
    });
  });
});

describe('SEC rules', () => {
  const findings = async (ctx: ProjectContext, policy = DEFAULT_POLICY) => {
    const { result } = await analyzeProject(ctx, { now: NOW, policy });
    return result.items.flatMap((i) => i.findings.filter((f) => f.ruleId.startsWith('SEC-')).map((f) => ({ item: i.key, ...f })));
  };

  it('are SEC-001 critical, SEC-002 warning and SEC-003 info, for changes and slices', () => {
    expect(SECURITY_RULES.map((r) => [r.id, r.appliesTo])).toEqual([
      ['SEC-001', ['epic', 'story']],
      ['SEC-002', ['epic', 'story']],
      ['SEC-003', ['epic', 'story']],
    ]);
  });

  it('securityRuleOf: the rule of each level, and of a warning with or without an OWASP CWE', () => {
    expect(results.map(securityRuleOf)).toEqual(['SEC-001', 'SEC-002', 'SEC-001', 'SEC-003']);
  });

  it('SEC-001: an error, or a warning with an OWASP Top 10 CWE, blocks; SEC-002: another warning; SEC-003: a note', async () => {
    const all = await findings(ctxWith());
    expect(all.filter((f) => f.item === 'TSK-2' || f.item === 'CHG-1').map((f) => [f.item, f.ruleId, f.severity, !!f.blocks, f.evidence[0]?.path, f.evidence[0]?.line])).toEqual([
      ['CHG-1', 'SEC-001', 'critical', true, 'src/vault.ts', 8],
      ['CHG-1', 'SEC-003', 'info', false, 'src/vault.ts', 20],
      ['TSK-2', 'SEC-001', 'critical', true, 'src/retry.ts', 12],
      ['TSK-2', 'SEC-002', 'warning', false, 'src/retry.ts', 30],
    ]);
    const exec = all.find((f) => f.item === 'TSK-2' && f.ruleId === 'SEC-001')!;
    expect(exec.title).toContain('detect-child-process');
    expect(exec.explanation).toContain('exec() runs a command built from request input.');
    expect(exec.explanation).toContain('CWE-78');
    expect(exec.evidence[0]).toMatchObject({ source: 'security', url: 'https://semgrep.dev/r/javascript.lang.security.detect-child-process' });
    expect(exec.question).toBeUndefined();
  });

  it('keep two results of one rule on one line apart', async () => {
    const twice = await findings(ctxWith({ results: [results[0]!, results[0]!] }));
    expect(new Set(twice.filter((f) => f.item === 'TSK-2').map((f) => f.id)).size).toBe(2);
  });

  it('follow the policy: a disabled rule is silent, an action other than block does not block', async () => {
    expect((await findings(ctxWith(), { ...DEFAULT_POLICY, disabledRules: ['SEC-001'] })).some((f) => f.ruleId === 'SEC-001')).toBe(false);
    const notify = await findings(ctxWith(), { ...DEFAULT_POLICY, actions: { ...DEFAULT_POLICY.actions, critical: 'notify' } });
    expect(notify.some((f) => f.blocks)).toBe(false);
  });

  it('are silent without a scan', async () => {
    expect(await findings({ ...ctxWith(), securityScan: undefined })).toEqual([]);
  });
});
