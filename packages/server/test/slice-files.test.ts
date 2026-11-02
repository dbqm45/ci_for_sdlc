import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readSliceFiles } from '../src/slice-files.js';

// Z8c (docs/SECURITY-SCAN-PLAN.md): the files of each slice, from commits with a `Change: TSK-n` trailer.

const tmp = mkdtempSync(join(tmpdir(), 'ci-slices-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function gitRepo(name: string) {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  const git = (...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' } });
  git('init', '-q', '-b', 'main');
  const commit = (files: Record<string, string>, message: string) => {
    for (const [p, t] of Object.entries(files)) {
      mkdirSync(join(root, p, '..'), { recursive: true });
      writeFileSync(join(root, p), t);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  return { root, git, commit };
}

describe('readSliceFiles', () => {
  it('gives each slice the files of its commits: one trailer, several keys, several trailers; commits without one are nobody\'s', async () => {
    const { root, commit } = gitRepo('history');
    commit({ 'README.md': 'x' }, 'docs: start');
    commit({ 'src/a.ts': '1' }, 'feat: a\n\nChange: TSK-1');
    commit({ 'src/b.ts': '1', 'src/a.ts': '2' }, 'feat: b\n\nChange: TSK-2, TSK-3');
    commit({ 'src/c.ts': '1' }, 'feat: c\n\nChange: TSK-4\nChange: TSK-1');
    const r = await readSliceFiles(root);
    expect(r.problem).toBeUndefined();
    expect(r.pr).toBeUndefined();
    expect(r.sliceFiles).toEqual({ 'TSK-1': ['src/a.ts', 'src/c.ts'], 'TSK-2': ['src/a.ts', 'src/b.ts'], 'TSK-3': ['src/a.ts', 'src/b.ts'], 'TSK-4': ['src/c.ts'] });
  });

  it('with a base: only the commits of the pull request, and the files it changes', async () => {
    const { root, git, commit } = gitRepo('pr');
    commit({ 'src/old.ts': '1' }, 'feat: old\n\nChange: TSK-1');
    git('checkout', '-q', '-b', 'topic');
    commit({ 'src/new.ts': '1' }, 'feat: new\n\nChange: TSK-2');
    commit({ 'docs/project/changes/CHG-1/plan.md': 'x' }, 'docs: plan');
    const r = await readSliceFiles(root, { base: 'main' });
    expect(r.sliceFiles).toEqual({ 'TSK-2': ['src/new.ts'] });
    expect(r.pr).toEqual({ files: ['docs/project/changes/CHG-1/plan.md', 'src/new.ts'], slices: ['TSK-2'] });
  });

  it('without git: no slice files, but with a base a problem (the scan cannot be placed)', async () => {
    const root = join(tmp, 'plain');
    mkdirSync(root);
    expect(await readSliceFiles(root)).toEqual({ sliceFiles: {} });
    const { root: repo } = gitRepo('nobase');
    const r = await readSliceFiles(repo, { base: 'origin/missing' });
    expect(r.problem).toMatch(/origin\/missing/);
  });
});
