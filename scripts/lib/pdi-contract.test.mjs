import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parsePin, planCopies, sourceUrl } from './pdi-contract.mjs';

// Expected behaviour: copies of the pdi contract are pinned to a version (tag contract-v<version>, or a commit for
// versions released before tags existed), generated from that source and never edited by hand; `check` compares them
// byte for byte (scripts/pdi-contract.json, docs in that file's README section of packages/core/test/fixtures).

const CLI = fileURLToPath(new URL('../pdi-contract.mjs', import.meta.url));
const PIN = {
  repo: 'dbqm45/pdi',
  sets: [
    { version: '9.9.9', files: { 'a.schema.json': 'fix/9.9.9/a.schema.json', 'examples/a.json': 'fix/9.9.9/a.json' } },
    { version: '0.1.0', ref: '0123456789abcdef0123456789abcdef01234567', files: { 'old.json': 'fix/0.1.0/old.json' } },
  ],
};

describe('PDI-PIN: pin file', () => {
  it('PDI-PIN-1: a valid pin lists every copy with its source', () => {
    const plan = planCopies(parsePin(PIN));
    assert.deepEqual(plan.map((c) => [c.ref, c.name, c.dest]), [
      ['contract-v9.9.9', 'a.schema.json', 'fix/9.9.9/a.schema.json'],
      ['contract-v9.9.9', 'examples/a.json', 'fix/9.9.9/a.json'],
      ['0123456789abcdef0123456789abcdef01234567', 'old.json', 'fix/0.1.0/old.json'],
    ]);
  });
  it('PDI-PIN-2: the source is the tag (or pinned commit) in the pdi repository', () => {
    assert.equal(sourceUrl('dbqm45/pdi', 'contract-v9.9.9', 'examples/a.json'), 'https://raw.githubusercontent.com/dbqm45/pdi/contract-v9.9.9/contract/examples/a.json');
  });
  for (const [label, pin, error] of [
    ['unknown key', { ...PIN, extra: 1 }, /nieznane/],
    ['short commit', { ...PIN, sets: [{ ...PIN.sets[1], ref: 'abc123' }] }, /pełny SHA/],
    ['bad version', { ...PIN, sets: [{ ...PIN.sets[0], version: 'latest' }] }, /wersj/],
    ['same copy twice', { ...PIN, sets: [PIN.sets[0], { version: '9.9.8', files: { 'a.schema.json': 'fix/9.9.9/a.schema.json' } }] }, /dwa razy/],
  ]) {
    it(`PDI-PIN-3: refuses ${label}`, () => assert.throws(() => parsePin(pin), error));
  }
});

describe('PDI-SYNC: sync and check against a local source', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdi-contract-'));
    mkdirSync(join(dir, 'src', 'contract', 'examples'), { recursive: true });
    writeFileSync(join(dir, 'src', 'contract', 'a.schema.json'), '{"title": "A"}\n');
    writeFileSync(join(dir, 'src', 'contract', 'examples', 'a.json'), '{"x": 1}\n');
    writeFileSync(join(dir, 'src', 'contract', 'old.json'), '{"old": true}\n');
    writeFileSync(join(dir, 'pin.json'), JSON.stringify(PIN));
    const run = (cmd) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, [CLI, cmd, '--pin', join(dir, 'pin.json'), '--root', dir, '--source', join(dir, 'src', 'contract')], { encoding: 'utf8' }) };
      } catch (e) {
        return { code: e.status, out: `${e.stdout}${e.stderr}` };
      }
    };
    return { dir, run };
  };

  it('PDI-SYNC-1: sync writes every copy byte for byte, then check passes', () => {
    const { dir, run } = setup();
    assert.equal(run('sync').code, 0);
    assert.equal(readFileSync(join(dir, 'fix/9.9.9/a.json'), 'utf8'), '{"x": 1}\n');
    assert.equal(readFileSync(join(dir, 'fix/0.1.0/old.json'), 'utf8'), '{"old": true}\n');
    assert.equal(run('check').code, 0);
  });
  it('PDI-SYNC-2: a copy edited by hand fails the check and is named', () => {
    const { dir, run } = setup();
    run('sync');
    writeFileSync(join(dir, 'fix/9.9.9/a.schema.json'), '{"title": "edited"}\n');
    const r = run('check');
    assert.equal(r.code, 1);
    assert.match(r.out, /fix\/9\.9\.9\/a\.schema\.json/);
    assert.doesNotMatch(r.out, /fix\/9\.9\.9\/a\.json/);
  });
  it('PDI-SYNC-3: a file missing at the source fails with its name', () => {
    const { dir, run } = setup();
    writeFileSync(join(dir, 'pin.json'), JSON.stringify({ ...PIN, sets: [{ version: '9.9.9', files: { 'gone.json': 'fix/gone.json' } }] }));
    const r = run('check');
    assert.equal(r.code, 1);
    assert.match(r.out, /gone\.json/);
  });
});

describe('PDI-REAL: this repository pin', () => {
  it('PDI-REAL-1: pins the reconstruction schema from the contract and every listed copy exists', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const pin = parsePin(JSON.parse(readFileSync(join(root, 'scripts/pdi-contract.json'), 'utf8')));
    const plan = planCopies(pin);
    assert.ok(plan.some((c) => c.name === 'reconstruction.schema.json' && c.dest.endsWith('tf-reconstruction/reconstruction-export.schema.json')));
    for (const c of plan) assert.ok(readFileSync(join(root, c.dest)).length > 0, c.dest);
  });
});
