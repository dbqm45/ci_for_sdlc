import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CoverageError,
  MAX_COVERAGE_FILE_BYTES,
  MAX_COVERAGE_LINES,
  coveragePercentOfChanged,
  parseCobertura,
  parseLcov,
  readCoverage,
} from '../src/index.js';

// Z7b-1b (docs/TARGETS-PLAN.md): coverage reports in lcov or Cobertura XML.

const LCOV = `TN:tests
SF:src/retry.ts
DA:1,1
DA:2,1
DA:3,0
DA:4,2
end_of_record
SF:src/queue.ts
DA:10,5
DA:11,0
end_of_record
`;

const COBERTURA = `<?xml version="1.0"?>
<coverage line-rate="0.6">
  <packages>
    <package name="app">
      <classes>
        <class filename="src/retry.ts" line-rate="0.75">
          <lines>
            <line number="1" hits="1"/>
            <line number="2" hits="1"/>
            <line number="3" hits="0"/>
            <line number="4" hits="2"/>
          </lines>
        </class>
        <class filename="src/queue.ts" line-rate="0.5">
          <lines>
            <line number="10" hits="5"/>
            <line number="11" hits="0"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
`;

describe('parseLcov', () => {
  it('reads line hits per file and ignores unrelated records', () => {
    const entries = parseLcov(LCOV, 'coverage.info');
    expect(entries.map((e) => [e.path, [...e.lines]])).toEqual([
      ['src/retry.ts', [[1, 1], [2, 1], [3, 0], [4, 2]]],
      ['src/queue.ts', [[10, 5], [11, 0]]],
    ]);
  });

  it('refuses a DA before SF', () => {
    expect(() => parseLcov('DA:1,1\n', 'bad.info')).toThrow(CoverageError);
  });

  it('refuses an SF without end_of_record', () => {
    expect(() => parseLcov('SF:x.ts\nDA:1,1\n', 'bad.info')).toThrow(CoverageError);
  });

  it('refuses a malformed DA', () => {
    expect(() => parseLcov('SF:x.ts\nDA:zero,one\nend_of_record\n', 'bad.info')).toThrow(CoverageError);
  });
});

describe('parseCobertura', () => {
  it('reads per-class line hits and skips branch-only entries', () => {
    const entries = parseCobertura(COBERTURA, 'cobertura.xml');
    expect(entries.map((e) => [e.path, [...e.lines]])).toEqual([
      ['src/retry.ts', [[1, 1], [2, 1], [3, 0], [4, 2]]],
      ['src/queue.ts', [[10, 5], [11, 0]]],
    ]);
  });

  it('refuses a file without <coverage>', () => {
    expect(() => parseCobertura('<notcoverage/>', 'bad.xml')).toThrow(CoverageError);
  });
});

describe('readCoverage', () => {
  async function tmp(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'cov-'));
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    return dir;
  }

  it('reads a directory with both lcov and Cobertura and sums hits for the same path', async () => {
    const dir = await tmp({
      'a.info': `SF:src/retry.ts\nDA:1,1\nDA:2,0\nend_of_record\n`,
      'b.xml': COBERTURA,
    });
    const { files, problems } = await readCoverage([dir]);
    expect(problems).toEqual([]);
    expect(files.get('src/retry.ts')?.lines.get(1)).toBe(2);
    expect(files.get('src/queue.ts')?.lines.get(10)).toBe(5);
    expect(files.get('src/retry.ts')?.reports).toHaveLength(2);
  });

  it('records a problem for a malformed report and keeps reading the rest', async () => {
    const dir = await tmp({
      'good.info': LCOV,
      'bad.info': 'DA:1,1\n',
    });
    const { files, problems } = await readCoverage([dir]);
    expect(problems.map((p) => p.path.split('/').pop())).toEqual(['bad.info']);
    expect(files.size).toBe(2);
  });

  it('records a problem for a file that is neither lcov nor Cobertura', async () => {
    const dir = await tmp({ 'x.info': 'hello\n' });
    const { problems } = await readCoverage([dir]);
    expect(problems[0]?.message).toMatch(/Not a coverage report/);
  });

  it('records a problem when a file exceeds the size limit', async () => {
    const dir = await tmp({ 'big.info': 'SF:x\n'.repeat(MAX_COVERAGE_FILE_BYTES / 5 + 1) + 'end_of_record\n' });
    const { problems } = await readCoverage([dir]);
    expect(problems[0]?.message).toMatch(/Larger than/);
  });

  it('records a problem when a path cannot be read', async () => {
    const { problems } = await readCoverage(['/no/such/path']);
    expect(problems).toEqual([{ path: '/no/such/path', message: 'Cannot read the file' }]);
  });

  it('respects the MAX_COVERAGE_LINES cap', () => {
    // Build an lcov with MAX_COVERAGE_LINES + 1 DA lines inside one record.
    const body = Array.from({ length: MAX_COVERAGE_LINES + 1 }, (_, i) => `DA:${i + 1},1`).join('\n');
    expect(() => parseLcov(`SF:x.ts\n${body}\nend_of_record\n`, 'big.info')).toThrow(CoverageError);
  });
});

describe('coveragePercentOfChanged', () => {
  it('returns 100 for an empty changed-lines set', () => {
    expect(coveragePercentOfChanged(undefined, [])).toBe(100);
  });

  it('returns 0 when the file is absent from coverage', () => {
    expect(coveragePercentOfChanged(undefined, [1, 2])).toBe(0);
  });

  it('rounds to one decimal and counts hits > 0 as covered', () => {
    const file = { path: 'src/retry.ts', lines: new Map([[1, 1], [2, 0], [3, 5], [4, 0], [5, 0]]), reports: [] };
    // 2 of 5 lines covered = 40%
    expect(coveragePercentOfChanged(file, [1, 2, 3, 4, 5])).toBe(40);
    // 2 of 3 covered = 66.7%
    expect(coveragePercentOfChanged(file, [1, 3, 4])).toBe(66.7);
  });
});
