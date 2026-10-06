import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoProject, type Decision } from '@ci/core';
import { DEFAULT_SETTINGS, Store, StoreReadError, deepMerge, removedPaths } from '../src/store.js';

let dir: string;
let store: Store;
const savedKey = process.env.CI_ENCRYPTION_KEY;

const decision = (id: string): Decision => ({
  id,
  questionId: `q-${id}`,
  findingId: `f-${id}`,
  itemKey: 'PAY-1',
  topic: 'general',
  question: 'Q?',
  answer: 'A',
  decidedBy: 'test',
  decidedAt: new Date().toISOString(),
  effect: 'resolve',
  version: 1,
  status: 'active',
});

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ci-store-'));
  store = new Store(dir);
  await store.init();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedKey === undefined) delete process.env.CI_ENCRYPTION_KEY;
  else process.env.CI_ENCRYPTION_KEY = savedKey;
});

const encryptOn = async () => {
  process.env.CI_ENCRYPTION_KEY = 'test-key';
  await store.saveSettings({ ...structuredClone(DEFAULT_SETTINGS), security: { ...DEFAULT_SETTINGS.security, encryptStoredContext: true } });
};

describe('Store (fail-closed)', () => {
  it('returns the default when a file does not exist', async () => {
    expect(await store.decisions()).toEqual([]);
    expect(await store.snapshot()).toBeNull();
  });

  it('throws on a corrupt file instead of treating it as empty, and does not overwrite it', async () => {
    writeFileSync(join(dir, 'decisions.json'), '{not json');
    await expect(store.decisions()).rejects.toBeInstanceOf(StoreReadError);
    await expect(store.updateDecisions((all) => [...all, decision('x')])).rejects.toBeInstanceOf(StoreReadError);
    expect(readFileSync(join(dir, 'decisions.json'), 'utf8')).toBe('{not json');
  });

  it('throws when an encrypted file cannot be decrypted (missing or wrong key) and keeps it intact', async () => {
    await encryptOn();
    await store.updateDecisions(() => [decision('a')]);
    const onDisk = readFileSync(join(dir, 'decisions.json'), 'utf8');
    expect(onDisk).toContain('"__enc"');

    delete process.env.CI_ENCRYPTION_KEY;
    await expect(store.decisions()).rejects.toThrow(/CI_ENCRYPTION_KEY is not set/);
    await expect(store.updateDecisions((all) => [...all, decision('b')])).rejects.toBeInstanceOf(StoreReadError);

    process.env.CI_ENCRYPTION_KEY = 'other-key';
    await expect(store.decisions()).rejects.toBeInstanceOf(StoreReadError);
    expect(readFileSync(join(dir, 'decisions.json'), 'utf8')).toBe(onDisk);

    process.env.CI_ENCRYPTION_KEY = 'test-key';
    expect((await store.decisions()).map((d) => d.id)).toEqual(['a']);
  });

  it('refuses to write plaintext when encryption is on but the key is missing', async () => {
    await encryptOn();
    delete process.env.CI_ENCRYPTION_KEY;
    await expect(store.updateApprovals(() => [])).rejects.toThrow(/Refusing to write approvals.json unencrypted/);
  });

  it('rebuilds a corrupt AI cache instead of failing', async () => {
    writeFileSync(join(dir, 'ai-cache.json'), 'garbage');
    expect((await store.aiCache()).size).toBe(0);
  });
});

describe('Store (serialized writes)', () => {
  it('does not lose concurrent read-modify-write updates', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.updateDecisions((all) => [...all, decision(String(i))])));
    expect((await store.decisions()).length).toBe(25);
  });

  it('keeps the queue working after a failed update', async () => {
    await expect(
      store.updateDecisions(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await store.updateDecisions((all) => [...all, decision('ok')]);
    expect((await store.decisions()).map((d) => d.id)).toEqual(['ok']);
  });

  it('stores null when an update returns null instead of keeping the old value', async () => {
    await store.saveDemoContext(demoProject());
    await store.updateDemoContext(() => null);
    expect(await store.demoContext()).toBeNull();
  });
});

describe('deepMerge', () => {
  it('ignores prototype keys from untrusted JSON', () => {
    deepMerge({ a: {} } as Record<string, any>, JSON.parse('{"__proto__":{"polluted":true},"a":{"constructor":{"x":1}}}'));
    expect(({} as any).polluted).toBeUndefined();
    expect((Object as any).x).toBeUndefined();
  });
});

describe('removedPaths', () => {
  it('does not treat inherited keys as present in the result', () => {
    expect(removedPaths(JSON.parse('{"__proto__":{},"a":1}'), { a: 1 })).toEqual(['__proto__']);
  });
});

describe('Store (untrusted file contents)', () => {
  it('skips a corrupt audit line instead of failing the whole log', async () => {
    await store.audit({ at: '2026-01-01T00:00:00Z', kind: 'analysis', actor: 'system', summary: 'first' });
    writeFileSync(join(dir, 'audit.jsonl'), readFileSync(join(dir, 'audit.jsonl'), 'utf8') + '{broken\n"just a string"\n', 'utf8');
    await store.audit({ at: '2026-01-01T00:00:01Z', kind: 'analysis', actor: 'system', summary: 'second' });
    expect((await store.auditLog()).map((a) => a.summary)).toEqual(['second', 'first']);
  });

  it('rejects an encrypted envelope with missing fields as unreadable', async () => {
    process.env.CI_ENCRYPTION_KEY = 'test-key';
    writeFileSync(join(dir, 'decisions.json'), JSON.stringify({ __enc: 1, iv: 'AAAA' }));
    await expect(store.decisions()).rejects.toThrow(/not a valid encrypted file/);
  });

  it('rejects a file whose top-level shape is wrong', async () => {
    writeFileSync(join(dir, 'decisions.json'), JSON.stringify({ not: 'a list' }));
    await expect(store.decisions()).rejects.toBeInstanceOf(StoreReadError);
  });
});
