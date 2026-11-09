// Builds the web UI before `npm start` when packages/web/dist is missing or older than the UI's sources, so a
// `git pull` never leaves an old UI in front of a newer server.
import { existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { needsBuild, newestSourceMtime } from './lib/ensure-web.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const built = new URL('../packages/web/dist/index.html', import.meta.url);
const builtMtimeMs = existsSync(built) ? statSync(built).mtimeMs : undefined;

if (needsBuild({ builtMtimeMs, newestSourceMtimeMs: newestSourceMtime(root) })) {
  console.log(builtMtimeMs === undefined ? 'Web UI not built yet — running "npm run build" (one time)…' : 'Web UI sources changed since the last build — running "npm run build"…');
  execSync('npm run build', { stdio: 'inherit', cwd: root });
}
