import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MAX_RECONSTRUCTION_BYTES,
  ReconstructionError,
  analyzeProject,
  demoProject,
  isClaimable,
  parseReconstruction,
  readReconstruction,
  reconstructionToDocuments,
} from '../src/index.js';

// tf's reconstruction from code (pdi plan "one SDLC flow", F2) as the "current state" source. The fixture was written by
// tf's own recon_export.py (test/fixtures/tf-reconstruction/README.md): payments code with a 45 s timeout, at most 2
// retries and 5 saved cards, plus one rule whose evidence tf could not confirm (verified: false).
const FIXTURES = new URL('./fixtures/tf-reconstruction/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as Record<string, any>;
const fixture = read('reconstruction.json');
const schema = read('reconstruction-export.schema.json');

const tmp = mkdtempSync(join(tmpdir(), 'ci-recon-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('reconstruction.json (tf-reconstruction v1)', () => {
  it('REC-01: the fixture has the fields of tf schema, and the connector reads every item of it', () => {
    for (const key of schema.required as string[]) expect(fixture).toHaveProperty(key);
    const itemSchema = schema.$defs.item;
    for (const kind of ['rules', 'requirements', 'domain']) {
      for (const it of fixture[kind]) {
        for (const key of itemSchema.required as string[]) expect(it).toHaveProperty(key);
        expect(Object.keys(it).every((k) => k in itemSchema.properties)).toBe(true);
        expect(itemSchema.properties.status.enum).toContain(it.status);
      }
    }
    const r = parseReconstruction(fixture);
    expect([r.commit, r.items.length, r.modules]).toEqual(['3f2a9c1', 8, [{ module: 'payments', purpose: 'Charges cards and stores saved cards.' }]]);
    expect(r.items.map((i) => i.id)).toEqual([...fixture.rules, ...fixture.requirements, ...fixture.domain].map((i: { id: string }) => i.id));
  });

  it.each([
    ['another format', { ...fixture, format: 'other' }, /format/],
    ['a newer format version', { ...fixture, format_version: 2 }, /format_version/],
    ['an item without text', { ...fixture, rules: [{ ...fixture.rules[0], text: ' ' }] }, /rules\[0\]: "id" and "text"/],
    ['an unknown status', { ...fixture, rules: [{ ...fixture.rules[0], status: 'proven' }] }, /rules\[0\]: unknown "status"/],
    ['evidence without a line', { ...fixture, requirements: [{ ...fixture.requirements[0], evidence: [{ path: 'a.ts', line: 0, line_end: 1 }] }] }, /requirements\[0\]\.evidence\[0\]/],
    ['a missing list', { ...fixture, domain: undefined }, /"domain" must be a list/],
  ])('REC-02: refuses %s, naming the field and not the content', (_, json, message) => {
    expect(() => parseReconstruction(json)).toThrow(ReconstructionError);
    expect(() => parseReconstruction(json)).toThrow(message);
  });

  it('REC-03: each item becomes a code document; the link points at the commit and lines when the repository is known', () => {
    const docs = reconstructionToDocuments(parseReconstruction(fixture), { repoUrl: 'https://github.com/acme/shop/' });
    const timeout = docs.find((d) => d.body.startsWith('The payment timeout'))!;
    expect(timeout).toMatchObject({
      id: 'rules-48c91a76d4',
      source: 'code',
      title: 'Rule: The payment timeout is 45 seconds.',
      labels: ['payments'],
      url: 'https://github.com/acme/shop/blob/3f2a9c1/src/payments/gateway.ts#L1',
      code: { kind: 'rules', status: 'evidence', quote: 'PAYMENT_TIMEOUT_MS = 45_000', confidence: 'kod', commit: '3f2a9c1' },
    });
    expect(timeout.body).toBe('The payment timeout is 45 seconds.\nCode: "PAYMENT_TIMEOUT_MS = 45_000"\nEvidence: src/payments/gateway.ts:1');
    expect(docs.find((d) => d.code!.kind === 'requirements' && d.code!.status === 'evidence')!.url).toBe('https://github.com/acme/shop/blob/3f2a9c1/tests/cards.test.ts#L1-L2');
    expect(reconstructionToDocuments(parseReconstruction(fixture)).every((d) => d.url === undefined)).toBe(true);
  });

  it('REC-04: only evidence that tf did not refute states facts', () => {
    const byText = new Map(reconstructionToDocuments(parseReconstruction(fixture)).map((d) => [d.body.split('\n')[0], d.code!]));
    expect(isClaimable(byText.get('The payment timeout is 45 seconds.')!)).toBe(true);
    expect(isClaimable(byText.get('The payment session lasts 10 minutes.')!)).toBe(false); // verified: false
    expect(isClaimable(byText.get('Card data is stored by the payment provider')!)).toBe(false); // assumption
  });

  it('REC-05: the code contradicting the specification is a CON-001 conflict with the code as evidence', async () => {
    const ctx = demoProject();
    ctx.documents.push(...reconstructionToDocuments(parseReconstruction(fixture)));
    const { result } = await analyzeProject(ctx, { now: new Date('2026-10-26T00:00:00Z') });
    // PAY-123 says the payment service times out after 30 seconds; the code waits 45 seconds.
    const pay123 = result.items.find((i) => i.key === 'PAY-123')!;
    const conflict = pay123.findings.find((f) => f.ruleId === 'CON-001' && f.evidence.some((e) => e.source === 'code'))!;
    expect(conflict.title).toMatch(/timeout: .*45 s/);
    expect(conflict.evidence.find((e) => e.source === 'code')).toMatchObject({ title: 'Code src/payments/gateway.ts:1', excerpt: 'The payment timeout is 45 seconds.' });
    // The code agrees with the 5-card limit, and the unconfirmed session rule states nothing.
    const codeFindings = result.items.flatMap((i) => i.findings).filter((f) => f.evidence.some((e) => e.source === 'code'));
    expect(codeFindings.some((f) => /card|session/i.test(f.title))).toBe(false);
  });

  it('REC-06: code items are not documentation: a story with only code in its context still lacks documentation', async () => {
    const ctx = demoProject();
    const before = (await analyzeProject(demoProject(), { now: new Date('2026-10-26T00:00:00Z') })).result.items.filter((i) => i.findings.some((f) => f.ruleId === 'DOC-001')).map((i) => i.key);
    ctx.documents.push(...reconstructionToDocuments(parseReconstruction(fixture)));
    const after = (await analyzeProject(ctx, { now: new Date('2026-10-26T00:00:00Z') })).result.items.filter((i) => i.findings.some((f) => f.ruleId === 'DOC-001')).map((i) => i.key);
    expect(after).toEqual(before);
  });

  it('REC-07: reads the file from disk, refusing other files, oversized files and invalid JSON without echoing them', async () => {
    const good = join(tmp, 'reconstruction.json');
    writeFileSync(good, JSON.stringify(fixture));
    expect(await readReconstruction(good)).toHaveLength(8);
    await expect(readReconstruction(join(tmp, 'rules.md'))).rejects.toThrow(/\.json/);
    const big = join(tmp, 'big.json');
    writeFileSync(big, ' '.repeat(MAX_RECONSTRUCTION_BYTES + 1));
    await expect(readReconstruction(big)).rejects.toThrow(/larger than/);
    const bad = join(tmp, 'bad.json');
    writeFileSync(bad, '{"secret": "dummy-not-json');
    await expect(readReconstruction(bad)).rejects.toThrow(/^reconstruction file is not valid JSON$/);
  });
});
