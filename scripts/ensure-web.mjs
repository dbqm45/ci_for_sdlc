// Builds the web UI before `npm start` when packages/web/dist is missing.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (!existsSync(new URL('../packages/web/dist/index.html', import.meta.url))) {
  console.log('Web UI not built yet — running "npm run build" (one time)…');
  execSync('npm run build', { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
}
