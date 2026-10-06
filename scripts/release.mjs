#!/usr/bin/env node
// Prepares a release on the current branch: computes the next SemVer version from Conventional Commits since
// the last tag vX.Y.Z, sets it in every package.json (and the lockfile), refreshes the API contract and adds a
// CHANGELOG.md entry. It does not commit, tag or push — the tag is created on main after the PR is merged.
//   npm run release                    # version from the commits
//   npm run release -- minor           # override: major | minor | patch | X.Y.Z (1.0.0 is always explicit)
//   npm run release -- --dry-run       # only print what would happen
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { bump, bumpKind, changelogEntry, compareVersions, isVersion, nextVersion } from './lib/conventional.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wanted = args.find((a) => !a.startsWith('--'));

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });
const git = (...a) => run('git', a).trim();
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!dryRun && git('status', '--porcelain')) fail('the working tree has uncommitted changes — commit or stash them first');

const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tags = git('tag', '--list', 'v*').split('\n').map((t) => t.slice(1)).filter(isVersion).sort(compareVersions);
const last = tags.at(-1);
if (!last) fail(`no tag vX.Y.Z yet — the first one (v${current}) is created on main by the Release workflow`);
if (last !== current) fail(`package.json has ${current}, the last tag is v${last} — release v${current} first (merge its PR)`);

const log = git('log', '--format=%B%x00', `v${last}..HEAD`);
const messages = log.split('\0').map((m) => m.trim()).filter(Boolean);
const kind = bumpKind(messages);

let version;
if (!wanted) {
  if (!kind) fail(`no feat/fix/perf or breaking change since v${last} — nothing to release (pass a version to force one)`);
  version = nextVersion(current, kind);
} else if (['major', 'minor', 'patch'].includes(wanted)) {
  version = bump(current, wanted); // explicit: `major` on 0.y.z gives 1.0.0
} else if (isVersion(wanted)) {
  version = wanted;
} else fail(`"${wanted}" is neither major/minor/patch nor X.Y.Z`);
if (compareVersions(version, current) <= 0) fail(`${version} is not newer than ${current}`);

const date = new Date().toISOString().slice(0, 10);
const entry = changelogEntry(version, date, messages);
console.log(`${messages.length} commit(s) since v${last}${kind ? ` call for a ${kind} change` : ''} → ${version}\n\n${entry}`);
if (dryRun) process.exit(0);

run('npm', ['version', version, '--workspaces', '--include-workspace-root', '--no-git-tag-version'], { stdio: 'inherit' });
run('npm', ['run', 'test:contract:update'], { stdio: 'inherit' });

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const firstEntry = changelog.indexOf('\n## [');
writeFileSync('CHANGELOG.md', firstEntry < 0 ? `${changelog.trimEnd()}\n\n${entry}` : `${changelog.slice(0, firstEntry + 1)}${entry}\n${changelog.slice(firstEntry + 1)}`);

console.log(`
✓ Version ${version} is set. Next:
  1. Review CHANGELOG.md (reword entries for users, add Zmienione/Wycofywane/Usunięte if needed).
  2. git switch -c release/v${version} && git commit -am "chore(release): ${version}"
  3. Push and open the PR "chore(release): ${version}". After the merge the Release workflow tags v${version}.`);
