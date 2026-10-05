// Vite (used to build the web UI) cannot build a project whose path contains "#".
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (root.includes('#')) {
  console.error(`\n✗ The project folder path contains "#":\n    ${root}\n\n  Vite cannot build the web UI from such a path (it treats "#" as a URL fragment).\n  Move or rename the folder so the path has no "#", e.g.:\n    mv "<folder with #>" ~/projects/ci_for_sdlc\n  then run "npm install" and "npm start" again.\n`);
  process.exit(1);
}
