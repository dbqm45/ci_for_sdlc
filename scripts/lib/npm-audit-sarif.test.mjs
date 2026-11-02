import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AuditError, auditToSarif } from './npm-audit-sarif.mjs';

// Expected behaviour (docs/SECURITY-SCAN-PLAN.md, "Konwerter"): `npm audit --json` (report version 2, npm 10) as SARIF
// 2.1.0 for `analyze --sarif`: one result per advisory and package, critical/high an error, moderate a warning, low/info
// a note, the rule npm-audit/<GHSA>, CWE in the rule's tags, the place the package's entry in the lockfile. Input that
// is not such a report is an error and writes nothing: an audit that did not run is not a clean audit.

const CLI = fileURLToPath(new URL('../npm-audit-sarif.mjs', import.meta.url));
const advisory = (over = {}) => ({
  source: 1096410,
  name: 'braces',
  dependency: 'braces',
  title: 'Uncontrolled resource consumption in braces',
  url: 'https://github.com/advisories/GHSA-grv7-fg5c-xmjg',
  severity: 'high',
  cwe: ['CWE-400', 'CWE-1050'],
  range: '<3.0.3',
  ...over,
});
const AUDIT = {
  auditReportVersion: 2,
  vulnerabilities: {
    braces: { name: 'braces', severity: 'high', via: [advisory()], range: '<3.0.3', nodes: ['node_modules/braces'] },
    micromatch: { name: 'micromatch', severity: 'moderate', via: ['braces', advisory({ source: 1098681, name: 'micromatch', title: 'ReDoS in micromatch', url: 'https://github.com/advisories/GHSA-952p-6rrq-rcjv', severity: 'moderate', cwe: ['CWE-1333'] })], nodes: ['node_modules/micromatch'] },
    tmp: { name: 'tmp', severity: 'low', via: [advisory({ source: 1, name: 'tmp', title: 'tmp writes outside its folder', url: 'https://github.com/advisories/GHSA-52f5-9888-hmc6', severity: 'low', cwe: [] })], nodes: ['node_modules/a/node_modules/tmp'] },
  },
  metadata: { vulnerabilities: { total: 3 } },
};
const LOCK = ['{', '  "packages": {', '    "": {},', '    "node_modules/braces": {', '      "version": "3.0.2"', '    },', '    "node_modules/micromatch": {}', '  }', '}'].join('\n');

describe('NPM-AUDIT-SARIF: npm audit --json as SARIF', () => {
  it('NPM-AUDIT-SARIF-1: one result per advisory and package, with level, rule, CWE and the lockfile line', () => {
    const sarif = auditToSarif(AUDIT, { lockfile: { path: 'package-lock.json', text: LOCK } });
    assert.equal(sarif.version, '2.1.0');
    const run = sarif.runs[0];
    assert.equal(run.tool.driver.name, 'npm audit');
    assert.deepEqual(
      run.results.map((r) => [r.ruleId, r.level, r.locations[0]?.physicalLocation.artifactLocation.uri, r.locations[0]?.physicalLocation.region?.startLine]),
      [
        ['npm-audit/GHSA-grv7-fg5c-xmjg', 'error', 'package-lock.json', 4],
        ['npm-audit/GHSA-952p-6rrq-rcjv', 'warning', 'package-lock.json', 7],
        ['npm-audit/GHSA-52f5-9888-hmc6', 'note', 'package-lock.json', undefined],
      ],
    );
    assert.match(run.results[0].message.text, /^braces <3\.0\.3: Uncontrolled resource consumption in braces/);
    const rule = run.tool.driver.rules.find((r) => r.id === 'npm-audit/GHSA-grv7-fg5c-xmjg');
    assert.deepEqual(rule.properties.tags, ['security', 'CWE-400', 'CWE-1050']);
    assert.equal(rule.helpUri, 'https://github.com/advisories/GHSA-grv7-fg5c-xmjg');
    assert.equal(run.results[0].ruleIndex, run.tool.driver.rules.indexOf(rule));
  });

  it('NPM-AUDIT-SARIF-2: critical is an error, info a note; a clean audit is a log with no results', () => {
    const one = (severity) => auditToSarif({ auditReportVersion: 2, vulnerabilities: { x: { name: 'x', via: [advisory({ name: 'x', severity })], nodes: [] } } }).runs[0].results[0].level;
    assert.deepEqual(['critical', 'high', 'moderate', 'low', 'info'].map(one), ['error', 'error', 'warning', 'note', 'note']);
    assert.deepEqual(auditToSarif({ auditReportVersion: 2, vulnerabilities: {} }).runs[0].results, []);
  });

  it('NPM-AUDIT-SARIF-3: rejects what is not an audit report', () => {
    assert.throws(() => auditToSarif({ auditReportVersion: 1, advisories: {} }), new AuditError('Not an npm audit report (auditReportVersion 2): auditReportVersion is 1'));
    assert.throws(() => auditToSarif({ error: { code: 'ENOLOCK', summary: 'This command requires an existing lockfile.' } }), new AuditError('npm audit failed: ENOLOCK This command requires an existing lockfile.'));
    assert.throws(() => auditToSarif([]), AuditError);
  });

  it('NPM-AUDIT-SARIF-4: the command writes the SARIF file; bad input exits 1 and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    writeFileSync(join(dir, 'audit.json'), JSON.stringify(AUDIT));
    writeFileSync(join(dir, 'package-lock.json'), LOCK);
    const ok = spawnSync(process.execPath, [CLI, 'audit.json', 'out/audit.sarif', '--lockfile', 'package-lock.json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /3 result\(s\)/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'out/audit.sarif'), 'utf8')).runs[0].results[0].locations[0].physicalLocation.region.startLine, 4);
    writeFileSync(join(dir, 'bad.json'), 'npm ERR! network');
    const bad = spawnSync(process.execPath, [CLI, 'bad.json', 'bad.sarif'], { cwd: dir, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Not JSON/);
    assert.equal(existsSync(join(dir, 'bad.sarif')), false);
  });
});
