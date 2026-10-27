import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestCase, TestRef } from '../model.js';

/**
 * Test results as JUnit XML (G4, docs/PDI-G4-PLAN.md): the report nearly every runner writes (Vitest, Jest, pytest,
 * JUnit, Playwright). Only <testsuite>, <testcase> and their <failure>/<error>/<skipped> are read; anything else in the
 * file is ignored. A file that is not such a report is an error with the reason, never zero tests.
 */

export const MAX_TEST_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEST_CASES = 20_000;

export class TestResultsError extends Error {}

export interface TestResultsProblem {
  path: string;
  message: string;
}

const KEY = '[A-Z][A-Z0-9]+-\\d+';
/** `PAY-124/AC-2`, `TSK-57 AC-1`, `PAY-125 › AC-3`: an item key, then a criterion. */
const REF = new RegExp(`\\b(${KEY})\\s*(?:/|:|›|>|\\s)\\s*(AC-\\d+)\\b`, 'g');
const AC = /\b(AC-\d+)\b/g;
const KEY_ONLY = new RegExp(`\\b(${KEY})\\b`);

/**
 * The criteria a test names. A criterion in the name with the key in the class (`describe('PAY-125 › retry')` around
 * `it('AC-3 …')`) counts too.
 *
 * @param name the test case's name
 * @param classname its class (or describe path), if any
 */
export function testRefs(name: string, classname?: string): TestRef[] {
  const out: TestRef[] = [];
  const seen = new Set<string>();
  const add = (itemKey: string, ac: string) => {
    const k = `${itemKey}/${ac}`;
    if (!/^AC-/.test(itemKey) && !seen.has(k)) {
      seen.add(k);
      out.push({ itemKey, ac });
    }
  };
  for (const text of [name, classname ?? '']) for (const m of text.matchAll(REF)) add(m[1]!, m[2]!);
  if (!out.length && classname) {
    const key = KEY_ONLY.exec(classname)?.[1];
    if (key && !/^AC-/.test(key)) for (const m of name.matchAll(AC)) add(key, m[1]!);
  }
  return out;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()]!,
  );

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]!] = decode(m[3] ?? m[4] ?? '');
  return out;
};

const firstLine = (s: string) => s.replace(/^\s+/, '').split(/\r?\n/)[0]!.trim().slice(0, 300);
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Element text: CDATA kept as written, other markup dropped. */
const textOf = (body: string) => decode(body.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => escapeText(t)).replace(/<[^>]+>/g, ''));
/** Runners such as Vitest name the suite after its file instead of giving a `file` attribute. */
const looksLikeFile = (s?: string) => (s && /^[\w./@-]+\.[a-z]{1,5}$/i.test(s) && s.includes('/') ? s : undefined);

/**
 * The test cases of one JUnit XML report.
 *
 * @param xml the report's content
 * @param report its path, kept on every test case
 * @throws {TestResultsError} not a JUnit report, or an element left open
 */
export function parseJUnit(xml: string, report: string): TestCase[] {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  if (!/<testsuites?[\s>]/.test(body)) throw new TestResultsError('Not a JUnit XML report: no <testsuite> or <testsuites>');
  const cases: TestCase[] = [];
  // Suites give a default file; test cases inside them are read in order.
  const suiteRe = /<testsuite\b([^>]*?)(\/>|>([\s\S]*?)<\/testsuite>)/g;
  let suites = 0;
  for (const s of body.matchAll(suiteRe)) {
    suites++;
    const suite = attrs(s[1]!);
    const inner = s[3] ?? '';
    const caseRe = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
    let consumed = 0;
    for (const c of inner.matchAll(caseRe)) {
      consumed++;
      const a = attrs(c[1]!);
      const content = c[3] ?? '';
      const fail = /<(failure|error)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/.exec(content);
      const skipped = /<skipped\b/.test(content);
      const message = fail ? firstLine(attrs(fail[2]!).message ?? textOf(fail[4] ?? '')) : undefined;
      const name = a.name ?? '';
      cases.push({
        name,
        ...(a.classname && { classname: a.classname }),
        ...((a.file ?? suite.file ?? looksLikeFile(suite.name)) && { file: a.file ?? suite.file ?? looksLikeFile(suite.name) }),
        report,
        status: fail ? 'failed' : skipped ? 'skipped' : 'passed',
        ...(message && { message }),
        refs: testRefs(name, a.classname),
      });
      if (cases.length > MAX_TEST_CASES) throw new TestResultsError(`More than ${MAX_TEST_CASES} test cases`);
    }
    if ((inner.match(/<testcase\b/g) ?? []).length !== consumed) throw new TestResultsError('A <testcase> element is not closed');
  }
  if (!suites || (body.match(/<testsuite\b/g) ?? []).length !== suites) throw new TestResultsError('A <testsuite> element is not closed');
  return cases;
}

async function xmlFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const out: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) out.push(...(await xmlFiles(p)));
    else if (e.name.endsWith('.xml')) out.push(p);
  }
  return out.sort();
}

/**
 * The test cases of report files and of the `*.xml` files under directories. A file that cannot be read is a problem
 * with its path and the reason; the others are still read.
 *
 * @param paths files or directories
 */
export async function readTestResults(paths: string[]): Promise<{ tests: TestCase[]; problems: TestResultsProblem[] }> {
  const tests: TestCase[] = [];
  const problems: TestResultsProblem[] = [];
  for (const root of paths) {
    let files: string[];
    try {
      files = await xmlFiles(root);
    } catch {
      problems.push({ path: root, message: 'Cannot read the file' });
      continue;
    }
    for (const file of files) {
      try {
        if ((await stat(file)).size > MAX_TEST_FILE_BYTES) throw new TestResultsError(`Larger than ${MAX_TEST_FILE_BYTES / 1024 / 1024} MB`);
        tests.push(...parseJUnit(await readFile(file, 'utf8'), file));
      } catch (e) {
        problems.push({ path: file, message: e instanceof TestResultsError ? e.message : 'Cannot read the file' });
      }
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { tests, problems };
}
