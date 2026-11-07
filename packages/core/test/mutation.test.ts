import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MutationError, mutationScoreOfChanged, parseMutmut, parseStryker, readMutation } from '../src/index.js';

// Z7b-1b (docs/TARGETS-PLAN.md): mutation reports in StrykerJS or mutmut JSON.

const STRYKER = {
  schemaVersion: '2',
  files: {
    'src/retry.ts': {
      mutants: [
        { status: 'Killed', location: { start: { line: 1 } }, mutatorName: 'ArithmeticOperator' },
        { status: 'Survived', location: { start: { line: 2 } } },
        { status: 'Timeout', location: { start: { line: 3 } } },
        { status: 'NoCoverage', location: { start: { line: 4 } } },
      ],
    },
    'src/queue.ts': {
      mutants: [{ status: 'Killed', location: { start: { line: 10 } } }],
    },
  },
};

const MUTMUT = {
  'src/retry.py': [
    { status: 'killed', line_number: 1 },
    { status: 'survived', line_number: 2, mutation: 'x_x' },
    { status: 'timeout', line_number: 3 },
    { status: 'no_tests', line_number: 4 },
  ],
};

describe('parseStryker', () => {
  it('reads mutants with line and status, maps to our enum', () => {
    const entries = parseStryker(STRYKER, 'stryker.json');
    const retry = entries.find((e) => e.path === 'src/retry.ts');
    expect(retry?.mutants.map((m) => [m.line, m.status])).toEqual([
      [1, 'killed'],
      [2, 'survived'],
      [3, 'timeout'],
      [4, 'no_coverage'],
    ]);
    expect(retry?.mutants[0]?.mutator).toBe('ArithmeticOperator');
  });

  it('refuses something that is not an object with files', () => {
    expect(() => parseStryker('nope', 'bad.json')).toThrow(MutationError);
    expect(() => parseStryker({}, 'bad.json')).toThrow(MutationError);
  });

  it('skips mutants without a recognised status or line', () => {
    const entries = parseStryker(
      {
        files: {
          'x.ts': {
            mutants: [{ status: 'Killed' }, { status: 'Unknown', location: { start: { line: 1 } } }],
          },
        },
      },
      'x.json',
    );
    expect(entries).toEqual([]);
  });
});

describe('parseMutmut', () => {
  it('reads lowercase statuses and treats suspicious as survived', () => {
    const entries = parseMutmut(
      { 'src/x.py': [{ status: 'killed', line_number: 1 }, { status: 'suspicious', line_number: 2 }] },
      'mutmut.json',
    );
    expect(entries[0]?.mutants).toEqual([
      { status: 'killed', line: 1 },
      { status: 'survived', line: 2 },
    ]);
  });

  it('refuses a report with no recognised mutants', () => {
    expect(() => parseMutmut({ 'x.py': [{ status: 'nope', line_number: 1 }] }, 'bad.json')).toThrow(MutationError);
  });

  it('refuses a non-object value', () => {
    expect(() => parseMutmut([1, 2, 3], 'bad.json')).toThrow(MutationError);
  });
});

describe('readMutation', () => {
  async function tmp(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mut-'));
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    return dir;
  }

  it('sniffs StrykerJS vs mutmut and merges mutants per file', async () => {
    const dir = await tmp({
      'stryker.json': JSON.stringify(STRYKER),
      'mutmut.json': JSON.stringify(MUTMUT),
      'extra.json': JSON.stringify({
        files: { 'src/retry.ts': { mutants: [{ status: 'Survived', location: { start: { line: 1 } } }] } },
      }),
    });
    const { files, problems } = await readMutation([dir]);
    expect(problems).toEqual([]);
    expect(files.get('src/retry.ts')?.mutants.length).toBe(5); // 4 from stryker.json + 1 from extra.json
    expect(files.get('src/retry.py')?.mutants.map((m) => m.status)).toEqual(['killed', 'survived', 'timeout', 'no_coverage']);
  });

  it('records a problem for invalid JSON and keeps reading', async () => {
    const dir = await tmp({ 'ok.json': JSON.stringify(STRYKER), 'bad.json': '{' });
    const { files, problems } = await readMutation([dir]);
    expect(problems[0]?.message).toMatch(/JSON/);
    expect(files.size).toBeGreaterThan(0);
  });
});

describe('mutationScoreOfChanged', () => {
  it('returns 100 for an empty changed-lines set', () => {
    expect(mutationScoreOfChanged(undefined, [])).toBe(100);
  });

  it('returns 0 when the file has no mutants', () => {
    expect(mutationScoreOfChanged(undefined, [1, 2])).toBe(0);
  });

  it('computes killed + timeout over killed + survived + timeout, ignoring no_coverage', () => {
    const file = {
      path: 'src/x.ts',
      reports: [],
      mutants: [
        { status: 'killed' as const, line: 1 },
        { status: 'survived' as const, line: 2 },
        { status: 'timeout' as const, line: 3 },
        { status: 'no_coverage' as const, line: 4 },
        { status: 'killed' as const, line: 5 },
      ],
    };
    // Changed lines 1..5: killed (1) + timeout (3) + killed (5) = 3 of 4 scored (survived counts to total) = 75%
    expect(mutationScoreOfChanged(file, [1, 2, 3, 4, 5])).toBe(75);
    // Only no_coverage in changed set → 100 (no scored mutants).
    expect(mutationScoreOfChanged(file, [4])).toBe(100);
  });
});
