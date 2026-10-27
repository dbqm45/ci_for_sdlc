import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DesignFormatError, parseChange, parseDesignMd, readRepoChanges, type RequirementItem } from '../src/index.js';

// The frame table of a change's design.md (pdi contract 0.9.0, conventions.design; flow step 07 Design, F6):
// requirement → journey → state → Figma frame. The contract's example pair (design.md → design-links.json) is the
// reference for every parser (pdi, tf, here). Linked frames become explicit Figma links of the change and of the slices
// that name the requirement, so the analysis takes them as `designed_by` instead of guessing from text.

const FIX = new URL('./fixtures/pdi-contract/0.9.0/', import.meta.url);
const example = (name: string) => readFileSync(new URL(name, FIX), 'utf8');
const HEADER = '| Wymaganie | Ścieżka | Stan | Ramka | Uwagi |\n|---|---|---|---|---|\n';
const LINK = 'https://www.figma.com/design/AbC123xyz/Taryfy?node-id=12-34';

describe('DES: the frame table of design.md', () => {
  it('DES-01: the contract example parses to exactly the contract result', () => {
    expect(parseDesignMd(example('design.md'))).toEqual(JSON.parse(example('design-links.json')));
  });
  it('DES-02: English header and a %3A node id', () => {
    const md = '| Requirement | Journey | State | Frame | Notes |\n|---|---|---|---|---|\n| US-3/AC-2 | bulk | success | https://figma.com/file/K9/x?node-id=1%3A2 | |\n';
    expect(parseDesignMd(md).rows[0]).toEqual({ requirement: 'US-3/AC-2', journey: 'bulk', state: 'success', status: 'linked', frame: { file_key: 'K9', node_id: '1:2', url: 'https://figma.com/file/K9/x?node-id=1%3A2' } });
  });
  for (const [label, row, word] of [
    ['unknown state', `| US-3 | j | busy | ${LINK} | |`, 'stan'],
    ['link outside Figma', '| US-3 | j | idle | https://example.com/x | |', 'link'],
    ['link without node-id', '| US-3 | j | idle | https://www.figma.com/design/K/x | |', 'node-id'],
    ['missing without a note', '| US-3 | j | idle | brak | |', 'uwag'],
    ['bad requirement key', `| us3 | j | idle | ${LINK} | |`, 'wymagani'],
  ] as const) {
    it(`DES-03: refuses ${label}, naming the row`, () => {
      expect(() => parseDesignMd(`${HEADER}${row}\n`)).toThrow(DesignFormatError);
      expect(() => parseDesignMd(`${HEADER}${row}\n`)).toThrow(new RegExp(`^wiersz 1:.*${word}`));
    });
  }
  it('DES-04: a file without the frame table is an error', () => {
    expect(() => parseDesignMd('# Projekt\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')).toThrow(/tabel/);
  });
});

const head = (artifact: string, extra = '') => `---\nartifact: ${artifact}\nphase: plan\nstatus: accepted\nversion: 1\ncreated: 2026-10-20\nchange: CHG-12\n${extra}---\n\n`;
const INTENT = `${head('intent')}# Bulk tariff change\n`;
const PLAN = `${head('plan', 'tasks: [TSK-57, TSK-58]\n')}# Plan

| Cięcie | Rodzaj | Wydanie | Flaga | Wartość | Wymagania | Odblokowuje | Weryfikacja | Status |
|---|---|---|---|---|---|---|---|---|
| TSK-57 | S-01 | R1 | — | Operator changes the tariff of many chargers | US-3 | — | test passes | planned |
| TSK-58 | S-02 | R1 | — | Operator sees the report | US-4 | — | test passes | planned |
`;

describe('DES: design.md in a change from a repository', () => {
  it('DES-05: linked frames become Figma links of the change and of the slices naming the requirement', () => {
    const [epic, tsk57, tsk58] = parseChange('CHG-12', { intent: INTENT, plan: PLAN, design: example('design.md') }) as [RequirementItem, RequirementItem, RequirementItem];
    const linked = JSON.parse(example('design-links.json')).rows.filter((r: { status: string }) => r.status === 'linked').map((r: { frame: { url: string } }) => r.frame.url);
    expect(epic.remoteLinks).toEqual(linked);
    expect(tsk57.remoteLinks).toEqual(linked);
    expect(tsk58.remoteLinks).toEqual([]);
    expect(epic.repo?.design?.rows).toHaveLength(6);
    expect(epic.repo?.design?.path).toBe('docs/project/changes/CHG-12/design.md');
  });

  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  it('DES-06: a broken design.md is a problem naming the file; the change is still read without its frames', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-design-'));
    dirs.push(root);
    const dir = join(root, 'docs/project/changes/CHG-12');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'intent.md'), INTENT);
    writeFileSync(join(dir, 'plan.md'), PLAN);
    writeFileSync(join(dir, 'design.md'), `${HEADER}| US-3 | j | busy | ${LINK} | |\n`);
    const { requirements, problems } = await readRepoChanges(root);
    expect(requirements.map((r) => r.key)).toEqual(['CHG-12', 'TSK-57', 'TSK-58']);
    expect(requirements[0]?.remoteLinks).toEqual([]);
    expect(problems).toEqual([{ path: 'docs/project/changes/CHG-12/design.md', message: expect.stringMatching(/^wiersz 1: nieznany stan/) }]);
  });
});
