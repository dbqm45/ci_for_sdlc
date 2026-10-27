import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_TEST_FILE_BYTES, TestResultsError, parseJUnit, readTestResults, testRefs } from '../src/index.js';

/** G4 (docs/PDI-G4-PLAN.md): JUnit XML from any runner, and the criteria a test names. */

describe('testRefs', () => {
  it('reads KEY/AC-n, KEY AC-n and KEY › AC-n from the name or the class', () => {
    expect(testRefs('PAY-124/AC-2 the card disappears')).toEqual([{ itemKey: 'PAY-124', ac: 'AC-2' }]);
    expect(testRefs('TSK-57 AC-1 retries once')).toEqual([{ itemKey: 'TSK-57', ac: 'AC-1' }]);
    expect(testRefs('AC-3 shows a spinner', 'PAY-125 › retry')).toEqual([{ itemKey: 'PAY-125', ac: 'AC-3' }]);
    expect(testRefs('US-02/AC-3 i US-02/AC-4 razem')).toEqual([{ itemKey: 'US-02', ac: 'AC-3' }, { itemKey: 'US-02', ac: 'AC-4' }]);
  });
  it('needs both a key and a criterion', () => {
    expect(testRefs('lists saved cards')).toEqual([]);
    expect(testRefs('AC-1 without an item', 'test/cards.test.ts')).toEqual([]);
    expect(testRefs('PAY-124 without a criterion')).toEqual([]);
  });
});

describe('parseJUnit', () => {
  it('reads every test case with its outcome, file and the first line of the failure', () => {
    const cases = parseJUnit(`<testsuites><testsuite name="s" file="test/a.test.ts">
      <testcase classname="a" name="PAY-1/AC-1 ok"/>
      <testcase classname="a" name="PAY-1/AC-2 &lt;fails&gt; &amp; more"><failure message="boom &quot;x&quot;">stack</failure></testcase>
      <testcase classname="a" name="errors"><error message="crash"/></testcase>
      <testcase classname="a" name="later"><skipped/></testcase>
      <testcase classname="a" name="cdata"><failure><![CDATA[expected <1>
second line]]></failure></testcase>
    </testsuite></testsuites>`, 'report.xml');
    expect(cases.map((c) => [c.name, c.status, c.message ?? null])).toEqual([
      ['PAY-1/AC-1 ok', 'passed', null],
      ['PAY-1/AC-2 <fails> & more', 'failed', 'boom "x"'],
      ['errors', 'failed', 'crash'],
      ['later', 'skipped', null],
      ['cdata', 'failed', 'expected <1>'],
    ]);
    expect(cases[0]).toMatchObject({ file: 'test/a.test.ts', report: 'report.xml', refs: [{ itemKey: 'PAY-1', ac: 'AC-1' }] });
  });
  it('a file that is not JUnit is an error with the reason, never zero tests', () => {
    expect(() => parseJUnit('{"tests": []}', 'r.json')).toThrow(TestResultsError);
    expect(() => parseJUnit('<html><body>oops</body></html>', 'r.xml')).toThrow(/no <testsuite> or <testsuites>/);
    expect(() => parseJUnit('<testsuite><testcase name="x"></testsuite>', 'r.xml')).toThrow(/not closed/);
  });
});

describe('readTestResults', () => {
  const dirs: string[] = [];
  afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
  it('reads files and the *.xml files of a directory; an unreadable one is a problem with its path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ci-junit-'));
    dirs.push(dir);
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'a.xml'), '<testsuite><testcase name="PAY-1/AC-1 a"/></testsuite>');
    await writeFile(join(dir, 'nested', 'b.xml'), '<testsuite><testcase name="PAY-1/AC-2 b"/></testsuite>');
    await writeFile(join(dir, 'notes.txt'), 'not a report');
    await writeFile(join(dir, 'bad.xml'), 'garbage');
    await writeFile(join(dir, 'big.xml'), `<testsuite>${' '.repeat(MAX_TEST_FILE_BYTES)}</testsuite>`);
    const { tests, problems } = await readTestResults([dir, join(dir, 'missing.xml')]);
    expect(tests.map((t) => t.name).sort()).toEqual(['PAY-1/AC-1 a', 'PAY-1/AC-2 b']);
    expect(problems.map((p) => [p.path.replace(dir, '<dir>'), p.message.split(':')[0]])).toEqual([
      ['<dir>/bad.xml', 'Not a JUnit XML report'],
      ['<dir>/big.xml', 'Larger than 5 MB'],
      ['<dir>/missing.xml', 'Cannot read the file'],
    ]);
  });
});
