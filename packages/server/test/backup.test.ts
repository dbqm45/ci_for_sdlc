import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupObjects, exportStorage, openBackup, retentionFrom, sealBackup, summarize } from '../src/backup.js';
import { latestBackupKey, runBackup, runRestoreCheck } from '../src/backup-run.js';
import { regionFromEndpoint, s3ConfigFrom, signV4, type S3Config } from '../src/s3.js';
import { FileStorage } from '../src/workspaces.js';

/** T5 (docs/BACKUPS.md): a daily backup outside the hosting provider, and a restore that is checked. */
const SECRET = 'dummy-backup-key-0123456789abcdef0123456789';
const S3: S3Config = { endpoint: 'https://s3.eu-central-003.backblazeb2.com', region: 'eu-central-003', bucket: 'quorum-backups', accessKeyId: 'dummy-key-id', secretAccessKey: 'dummy-application-key' };

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'ci-backup-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** `default` with a workspace list, the platform space, a second workspace with a log, and an encrypted envelope. */
async function seeded() {
  const storage = new FileStorage(tmp());
  const def = storage.backend('default');
  await def.init();
  await def.write('workspaces.json', [{ id: 'mobile', name: 'Mobile', createdAt: '2026-11-01T00:00:00.000Z' }]);
  await def.write('decisions.json', { __enc: 1, iv: 'x', data: 'sealed-with-CI_ENCRYPTION_KEY' });
  await def.append('audit', { summary: 'one' });
  await def.append('audit', { summary: 'two' });
  const platform = storage.backend('_platform');
  await platform.init();
  await platform.write('beta-enrollments.json', [{ id: 'e1', status: 'active' }]);
  const mobile = storage.backend('mobile');
  await mobile.init();
  await mobile.write('settings.json', { project: { key: 'MOB', name: 'Mobile' } });
  await mobile.append('audit', { summary: 'mobile' });
  return storage;
}

describe('the backup', () => {
  it('BK-01: every space goes in, as stored (encrypted documents stay encrypted), and a restore gives back the same', async () => {
    const backup = await exportStorage(await seeded(), new Date('2026-11-09T03:17:00Z'));
    expect(backup.spaces.map((s) => s.id)).toEqual(['default', '_platform', 'mobile']);
    expect(summarize(backup)).toEqual({ spaces: 3, documents: 4, entries: 3 });
    expect(backup.spaces[0]!.documents['decisions.json']).toEqual({ __enc: 1, iv: 'x', data: 'sealed-with-CI_ENCRYPTION_KEY' });

    const sealed = sealBackup(backup, SECRET);
    expect(sealed.subarray(0, 4).toString()).toBe('QBK1');
    expect(sealed.toString('latin1')).not.toMatch(/Mobile|beta-enrollments|audit/);

    const target = new FileStorage(tmp());
    expect(await runRestoreCheck({ storage: target, sealed, secret: SECRET })).toEqual({ createdAt: '2026-11-09T03:17:00.000Z', summary: { spaces: 3, documents: 4, entries: 3 } });
    expect(await target.backend('mobile').tail('audit', 10)).toEqual([{ summary: 'mobile' }]);
  });

  it('BK-02: a wrong key, a changed byte, another file or a short key is an error, never partial data', async () => {
    const sealed = sealBackup(await exportStorage(await seeded(), new Date()), SECRET);
    expect(() => openBackup(sealed, `${SECRET}-other`)).toThrow(/wrong BACKUP_ENCRYPTION_KEY or the file was changed/);
    const changed = Buffer.from(sealed);
    changed[40] = changed[40]! ^ 1;
    expect(() => openBackup(changed, SECRET)).toThrow(/wrong BACKUP_ENCRYPTION_KEY or the file was changed/);
    expect(() => openBackup(Buffer.from('PK\u0003\u0004 not a backup at all'), SECRET)).toThrow(/Not a Quorum backup/);
    expect(() => sealBackup({ format: 'quorum-backup', version: 1, createdAt: '', spaces: [] }, 'short')).toThrow(/at least 32 characters/);
  });

  it('BK-03: a restore into storage that already has data is refused before anything is written', async () => {
    const sealed = sealBackup(await exportStorage(await seeded(), new Date()), SECRET);
    const target = new FileStorage(tmp());
    await target.backend('mobile').init();
    await target.backend('mobile').write('settings.json', { live: true });
    await expect(runRestoreCheck({ storage: target, sealed, secret: SECRET })).rejects.toThrow(/Space mobile already has data/);
    expect((await target.backend('default').names()).documents).toEqual([]);
  });

  it.each([
    ['2026-11-09T03:17:00Z', ['daily/2026-11-09.qbk'], ['2026-12-14']],
    ['2026-12-01T03:17:00Z', ['daily/2026-12-01.qbk', 'monthly/2026-12.qbk'], ['2027-01-05', '2027-03-11']],
  ])('BK-04: a run on %s writes %j, locked until %j (35 and 100 days)', (at, keys, until) => {
    const objects = backupObjects(new Date(at));
    expect(objects.map((o) => o.key)).toEqual(keys);
    expect(objects.map((o) => o.retainUntil.toISOString().slice(0, 10))).toEqual(until);
  });

  it('BK-05: retention from the environment: whole days from 1 to 3650', () => {
    expect(retentionFrom({})).toEqual({ dailyDays: 35, monthlyDays: 100 });
    expect(retentionFrom({ BACKUP_DAILY_DAYS: '14', BACKUP_MONTHLY_DAYS: '365' })).toEqual({ dailyDays: 14, monthlyDays: 365 });
    for (const bad of ['0', '1.5', 'ten', '4000']) expect(() => retentionFrom({ BACKUP_DAILY_DAYS: bad })).toThrow(/BACKUP_DAILY_DAYS/);
  });
});

describe('Backblaze B2 (S3 API)', () => {
  it("BK-06: the signature matches AWS's published Signature Version 4 example", () => {
    // docs.aws.amazon.com, "Signature Calculations for the Authorization Header", example GET Object.
    const h = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: createHash('sha256').update('').digest('hex'),
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      at: new Date('2013-05-24T00:00:00Z'),
    });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('BK-07: configuration from the environment names what is missing and reads the region from the endpoint', () => {
    expect(() => s3ConfigFrom({ B2_BUCKET: 'b' })).toThrow('Set B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY');
    expect(regionFromEndpoint('https://s3.eu-central-003.backblazeb2.com')).toBe('eu-central-003');
    expect(s3ConfigFrom({ B2_ENDPOINT: 's3.eu-central-003.backblazeb2.com', B2_BUCKET: 'b', B2_KEY_ID: 'k', B2_APPLICATION_KEY: 's' })).toMatchObject({ endpoint: 'https://s3.eu-central-003.backblazeb2.com', region: 'eu-central-003' });
    expect(() => s3ConfigFrom({ B2_ENDPOINT: 'http://s3.eu-central-003.backblazeb2.com', B2_BUCKET: 'b', B2_KEY_ID: 'k', B2_APPLICATION_KEY: 's' })).toThrow('B2_ENDPOINT must be https.');
    expect(() => s3ConfigFrom({ B2_ENDPOINT: 'https://storage.example.com', B2_BUCKET: 'b', B2_KEY_ID: 'k', B2_APPLICATION_KEY: 's' })).toThrow(/B2_REGION/);
  });

  it('BK-08: a run uploads the sealed backup locked in compliance mode, signed, without the key in any header', async () => {
    const calls: { url: string; method?: string; headers: Record<string, string>; body: Buffer }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, headers: init?.headers as Record<string, string>, body: Buffer.from(init?.body as Buffer) });
      return new Response('', { status: 200 });
    });
    const r = await runBackup({ storage: await seeded(), s3: S3, secret: SECRET, retention: { dailyDays: 35, monthlyDays: 100 }, at: new Date('2026-12-01T03:17:00Z'), fetchImpl });
    expect(r.keys).toEqual(['daily/2026-12-01.qbk', 'monthly/2026-12.qbk']);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PUT https://s3.eu-central-003.backblazeb2.com/quorum-backups/daily/2026-12-01.qbk',
      'PUT https://s3.eu-central-003.backblazeb2.com/quorum-backups/monthly/2026-12.qbk',
    ]);
    const [daily] = calls;
    expect(daily!.headers).toMatchObject({
      'x-amz-object-lock-mode': 'COMPLIANCE',
      'x-amz-object-lock-retain-until-date': '2027-01-05T03:17:00Z',
      'content-md5': createHash('md5').update(daily!.body).digest('base64'),
    });
    expect(daily!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=dummy-key-id\/20261201\/eu-central-003\/s3\/aws4_request, SignedHeaders=content-md5;content-type;host;/);
    expect(daily!.headers).not.toHaveProperty('host');
    expect(JSON.stringify(calls.map((c) => c.headers))).not.toContain('dummy-application-key');
    expect(summarize(openBackup(daily!.body, SECRET))).toEqual(r.summary);
  });

  it('BK-09: a refused upload fails the run with the S3 error code only', async () => {
    const fetchImpl = vi.fn(async () => new Response('<Error><Code>AccessDenied</Code><Message>key dummy-key-id is not allowed</Message></Error>', { status: 403 }));
    await expect(runBackup({ storage: await seeded(), s3: S3, secret: SECRET, retention: { dailyDays: 35, monthlyDays: 100 }, fetchImpl })).rejects.toThrow(/^PUT \/quorum-backups\/daily\/\d{4}-\d{2}-\d{2}\.qbk failed: HTTP 403 \(AccessDenied\)$/);
  });

  it('BK-10: the restore check takes the newest daily backup by default', async () => {
    const xml = '<ListBucketResult><Contents><Key>daily/2026-11-08.qbk</Key></Contents><Contents><Key>daily/2026-11-10.qbk</Key></Contents><Contents><Key>daily/notes.txt</Key></Contents><Contents><Key>daily/2026-11-09.qbk</Key></Contents></ListBucketResult>';
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => new Response(xml, { status: 200 }));
    expect(await latestBackupKey(S3, fetchImpl)).toBe('daily/2026-11-10.qbk');
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://s3.eu-central-003.backblazeb2.com/quorum-backups?list-type=2&prefix=daily%2F');
    await expect(latestBackupKey(S3, vi.fn(async () => new Response('<ListBucketResult/>', { status: 200 })))).rejects.toThrow(/No backup/);
  });
});
