import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bump, bumpKind, changelogEntry, compareVersions, lintMessage, nextVersion } from './conventional.mjs';

// Expected values come from Conventional Commits 1.0.0 and SemVer 2.0.0 (docs/RELEASING.md).

describe('CC: lintMessage', () => {
  for (const ok of [
    'feat(web): zoom the context graph',
    'fix: reject an empty answer',
    'feat(server)!: drop the legacy settings format',
    'build(deps-dev): Bump vitest from 5.0.3 to 5.1.0',
    'ci(deps): bump the actions group with 6 updates (#13)',
    'chore(release): 0.2.0',
    'fix(server): handle IAM roles\n\nThe SDK resolves them lazily.\n\nRefs: #20',
    'refactor(core): rename blockade state\n\nBREAKING CHANGE: ResourceDto.isReserved removed; read blockade.state',
    'Merge branch \'main\' into feature',
    'fixup! feat(web): zoom',
    '# Please enter the commit message\nfeat(web): zoom the graph\n# Lines starting with # are ignored',
  ]) it(`CC-OK: ${JSON.stringify(ok.split('\n')[0])}`, () => assert.deepEqual(lintMessage(ok), []));

  for (const [bad, why] of [
    ['Czytelniejszy graf kontekstu', /not "<type>/],
    ['feature(web): zoom', /unknown type "feature"/],
    ['Feat(web): zoom', /not "<type>/],
    ['feat(Web): zoom', /scope "Web"/],
    ['feat(web):zoom', /not "<type>/],
    ['feat(web): ', /empty/],
    ['fix: add the thing.', /period/],
    [`feat: ${'x'.repeat(73)}`, /73 characters/],
    ['fix: a\nbody without a blank line', /empty line/],
    ['fix: a\n\nbreaking change: lowercase footer', /uppercase/],
    ['', /empty/],
  ]) it(`CC-BAD: ${JSON.stringify(bad)}`, () => assert.match(lintMessage(bad).join('\n'), why));

  it('CC-LEN: 72 characters is the limit and the "(#NN)" GitHub adds does not count', () => {
    assert.deepEqual(lintMessage(`feat: ${'x'.repeat(72)} (#123)`), []);
  });
});

describe('SV: bump and next version', () => {
  it('SV-01: bumpKind takes the most serious change', () => {
    assert.equal(bumpKind(['docs: readme', 'test: more']), null);
    assert.equal(bumpKind(['fix: a', 'perf: b']), 'patch');
    assert.equal(bumpKind(['fix: a', 'feat: b', 'chore: c']), 'minor');
    assert.equal(bumpKind(['feat: b', 'fix(x)!: a']), 'major');
    assert.equal(bumpKind(['refactor: a\n\nBREAKING CHANGE: gone']), 'major');
    assert.equal(bumpKind(['refactor: a\n\nBREAKING-CHANGE: gone']), 'major');
  });

  it('SV-02: plain bumps reset the lower parts (rules 7, 8)', () => {
    assert.equal(bump('1.4.2', 'major'), '2.0.0');
    assert.equal(bump('1.4.2', 'minor'), '1.5.0');
    assert.equal(bump('1.4.2', 'patch'), '1.4.3');
    assert.equal(bump('0.9.3', 'major'), '1.0.0');
    assert.throws(() => bump('1.0.0-rc.1', 'patch'));
  });

  it('SV-03: from 1.0.0 the commits map straight onto the version', () => {
    assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
    assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
    assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
  });

  it('SV-04: in 0.y.z a breaking change bumps the minor, everything else the patch (rule 4)', () => {
    assert.equal(nextVersion('0.1.0', 'major'), '0.2.0');
    assert.equal(nextVersion('0.1.0', 'minor'), '0.1.1');
    assert.equal(nextVersion('0.1.0', 'patch'), '0.1.1');
  });

  it('SV-05: versions compare numerically, not as text', () => {
    assert.ok(compareVersions('0.10.0', '0.9.0') > 0);
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  });
});

describe('CL: changelogEntry', () => {
  it('CL-01: groups user-visible commits under Polish sections and skips the rest', () => {
    const entry = changelogEntry('0.2.0', '2026-10-06', [
      'feat(web): zoom the context graph (#21)',
      'fix(server): recognise IAM roles (#20)',
      'feat(server)!: drop the legacy settings format',
      'docs: readme',
      'Czytelniejszy graf',
    ]);
    assert.equal(entry, [
      '## [0.2.0] - 2026-10-06', '',
      '### Niezgodne', '', '- **server:** drop the legacy settings format', '',
      '### Nowe', '', '- **web:** zoom the context graph (#21)', '',
      '### Poprawione', '', '- **server:** recognise IAM roles (#20)', '',
    ].join('\n'));
  });

  it('CL-02: an entry without user-visible changes says so', () => {
    assert.match(changelogEntry('0.1.1', '2026-10-06', ['ci: x']), /Bez zmian widocznych/);
  });
});
