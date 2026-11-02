import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * The files of each slice, for placing security scan results (Z8c, docs/SECURITY-SCAN-PLAN.md): a file changed by a
 * commit with a `Change: TSK-n` trailer (several keys after commas, or several trailers) belongs to those slices.
 * Merges are skipped. With `base` (in CI: the pull request's target branch) only the commits of the pull request
 * (`base..HEAD`) count, and `pr` lists the files it changes (`base...HEAD`) and its slices. Without `base` the whole
 * history (at most 10 000 commits) counts.
 */

const run = promisify(execFile);
const MAX_COMMITS = 10_000;
const SEP = '\u001e';

export interface SliceFiles {
  sliceFiles: Record<string, string[]>;
  pr?: { files: string[]; slices: string[] };
  /** Git could not answer for `base`: the scan cannot be placed on the pull request. */
  problem?: string;
}

const git = async (root: string, args: string[]) => (await run('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout;
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * @param root the repository checkout
 * @param opts `base`: the ref the pull request goes into
 * @returns no slice files when there is no git history; a `problem` only when `base` cannot be read
 */
export async function readSliceFiles(root: string, opts: { base?: string } = {}): Promise<SliceFiles> {
  const { base } = opts;
  let log: string;
  let changed: string[] | undefined;
  try {
    log = await git(root, ['log', '--no-merges', `--max-count=${MAX_COMMITS}`, '--name-only', `--format=${SEP}%(trailers:key=Change,valueonly,separator=%x2C)`, ...(base ? [`${base}..HEAD`] : ['HEAD']), '--']);
    if (base) changed = lines(await git(root, ['diff', '--name-only', `${base}...HEAD`, '--']));
  } catch (e) {
    if (!base) return { sliceFiles: {} };
    const why = String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split('\n')[0];
    return { sliceFiles: {}, problem: `Cannot read the pull request against ${base}${why ? `: ${why}` : ''}` };
  }
  const bySlice = new Map<string, Set<string>>();
  for (const commit of log.split(SEP).slice(1)) {
    const [head = '', ...files] = commit.split('\n');
    const keys = head.split(',').map((k) => k.trim()).filter(Boolean);
    for (const k of keys) {
      const set = bySlice.get(k) ?? bySlice.set(k, new Set()).get(k)!;
      for (const f of lines(files.join('\n'))) set.add(f);
    }
  }
  const sliceFiles = Object.fromEntries([...bySlice].sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => [k, [...s].sort()]));
  return { sliceFiles, ...(changed && { pr: { files: changed.sort(), slices: Object.keys(sliceFiles) } }) };
}
