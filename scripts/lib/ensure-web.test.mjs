import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { needsBuild, newestSourceMtime } from './ensure-web.mjs';

describe('ensure-web: when npm start builds the UI', () => {
  it('EW-01: a build is needed when there is none or a source is newer than it', () => {
    assert.equal(needsBuild({}), true);
    assert.equal(needsBuild({ builtMtimeMs: 100, newestSourceMtimeMs: 200 }), true);
    assert.equal(needsBuild({ builtMtimeMs: 200, newestSourceMtimeMs: 100 }), false);
    assert.equal(needsBuild({ builtMtimeMs: 200 }), false);
  });

  it('EW-02: the newest source counts the UI and the shared core, never node_modules or dist', () => {
    const root = mkdtempSync(join(tmpdir(), 'ensure-web-'));
    try {
      const file = (rel, seconds) => {
        const p = join(root, rel);
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, 'x');
        utimesSync(p, seconds, seconds);
      };
      file('packages/web/src/App.tsx', 1000);
      file('packages/core/src/model.ts', 2000);
      file('packages/web/node_modules/x/index.js', 9000);
      file('packages/web/dist/index.html', 8000);
      assert.equal(newestSourceMtime(root), 2000 * 1000);
      file('packages/web/src/pages/New.tsx', 3000);
      assert.equal(newestSourceMtime(root), 3000 * 1000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
