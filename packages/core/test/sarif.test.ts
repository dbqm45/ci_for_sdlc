import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_SARIF_FILE_BYTES, MAX_SARIF_RESULTS, SarifError, parseSarif, readSarif } from '../src/index.js';

// Z8c (docs/SECURITY-SCAN-PLAN.md): security scan results in SARIF 2.1.0, read as `analyze --sarif` reads them.

const fixture = (name: string) => fileURLToPath(new URL(`fixtures/sarif/${name}`, import.meta.url));
const log = (results: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'Scanner' } }, results, ...extra }] });

describe('parseSarif', () => {
  it('reads a Semgrep log: the level from the rule, CWE from its tags, the path relative to the source root', async () => {
    const { results, problems } = await readSarif([fixture('scan.sarif')]);
    expect(problems).toEqual([]);
    expect(results.map((r) => [r.ruleId.split('.').pop(), r.level, r.path, r.line, r.cwes])).toEqual([
      ['detect-child-process', 'error', 'src/retry.ts', 12, [78]],
      ['regex-dos', 'warning', 'src/retry.ts', 30, [1333]],
      ['ssrf', 'warning', 'src/vault.ts', 8, [918]],
      ['leftover-debug', 'note', 'src/vault.ts', 20, []],
    ]);
    expect(results[0]).toMatchObject({
      tool: 'Semgrep OSS',
      message: 'exec() runs a command built from request input.',
      helpUri: 'https://semgrep.dev/r/javascript.lang.security.detect-child-process',
      report: fixture('scan.sarif'),
    });
  });

  it('reads a CodeQL log: the level of the result, CodeQL CWE tags, properties.cwe and absolute file URIs; skips pass, none and suppressed', () => {
    const results = parseSarif(readFileSync(fixture('codeql.sarif'), 'utf8'), 'codeql.sarif', { root: '/work/repo' });
    expect(results.map((r) => [r.ruleId, r.level, r.path, r.line, r.cwes])).toEqual([
      ['js/xss', 'error', 'web/page.ts', 4, [79, 116]],
      ['js/abs', 'warning', 'lib/a b.ts', 2, [22]],
      ['js/nowhere', 'warning', undefined, undefined, []],
    ]);
  });

  it('keeps a result whose suppression is still under review or rejected', () => {
    const results = parseSarif(
      log([
        { ruleId: 'a', message: { text: 'x' }, suppressions: [{ kind: 'external', status: 'underReview' }] },
        { ruleId: 'b', message: { text: 'x' }, suppressions: [{ kind: 'external', status: 'accepted' }] },
      ]),
      'x.sarif',
    );
    expect(results.map((r) => r.ruleId)).toEqual(['a']);
  });

  it.each([
    ['not JSON', '{"version":', 'Not JSON'],
    ['another version', JSON.stringify({ version: '2.0.0', runs: [] }), 'Not SARIF 2.1.0: version is 2.0.0'],
    ['no runs', JSON.stringify({ version: '2.1.0' }), 'Not SARIF 2.1.0: no runs'],
    ['a failed run', log([], { invocations: [{ executionSuccessful: false, toolExecutionNotifications: [{ message: { text: 'Cannot download p/owasp-top-ten' } }] }] }), 'The scan did not run (Scanner): Cannot download p/owasp-top-ten'],
    ['a result without a rule', log([{ message: { text: 'x' } }]), 'A result has no ruleId'],
  ])('rejects %s', (_, text, message) => {
    expect(() => parseSarif(text, 'x.sarif')).toThrow(new SarifError(message));
  });

  it('rejects a log with more results than the limit', () => {
    const many = Array.from({ length: MAX_SARIF_RESULTS + 1 }, () => ({ ruleId: 'r', message: { text: 'x' } }));
    expect(() => parseSarif(log(many), 'x.sarif')).toThrow(`More than ${MAX_SARIF_RESULTS} results`);
  });
});

describe('readSarif', () => {
  it('reads *.sarif and *.sarif.json under a directory, and reports files it cannot read with the reason', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sarif-'));
    await mkdir(join(dir, 'deps'));
    await writeFile(join(dir, 'code.sarif'), log([{ ruleId: 'r1', level: 'error', message: { text: 'one' } }]));
    await writeFile(join(dir, 'deps', 'audit.sarif.json'), log([{ ruleId: 'r2', level: 'note', message: { text: 'two' } }]));
    await writeFile(join(dir, 'broken.sarif'), 'nope');
    await writeFile(join(dir, 'big.sarif'), Buffer.alloc(MAX_SARIF_FILE_BYTES + 1, ' '));
    await writeFile(join(dir, 'notes.txt'), 'ignored');
    const { results, problems, reports } = await readSarif([dir, join(dir, 'missing.sarif')]);
    expect(results.map((r) => r.ruleId)).toEqual(['r1', 'r2']);
    expect(reports).toBe(2);
    expect(problems).toEqual([
      { path: join(dir, 'big.sarif'), message: `Larger than ${MAX_SARIF_FILE_BYTES / 1024 / 1024} MB` },
      { path: join(dir, 'broken.sarif'), message: 'Not JSON' },
      { path: join(dir, 'missing.sarif'), message: 'Cannot read the file' },
    ]);
  });

  it('reports an empty directory: a scan that wrote nothing is not a clean scan', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sarif-'));
    expect((await readSarif([dir])).problems).toEqual([{ path: dir, message: 'No *.sarif file' }]);
  });

  it('makes absolute paths inside the repository relative to it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sarif-'));
    await writeFile(join(dir, 'a.sarif'), log([{ ruleId: 'r', message: { text: 'x' }, locations: [{ physicalLocation: { artifactLocation: { uri: `file://${dir}/src/x.ts` } } }] }]));
    expect((await readSarif([join(dir, 'a.sarif')], { root: dir })).results[0]?.path).toBe('src/x.ts');
  });
});
