// Pure helpers of scripts/ensure-web.mjs: whether the web UI must be built before `npm start`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A build is needed when there is none, or when a source of the UI changed after it (a `git pull` brings new screens
 * that an old build would not show, e.g. the login of the accounts mode).
 * @param {{ builtMtimeMs?: number, newestSourceMtimeMs?: number }} s
 */
export const needsBuild = (s) => s.builtMtimeMs === undefined || (s.newestSourceMtimeMs !== undefined && s.newestSourceMtimeMs > s.builtMtimeMs);

/**
 * The newest modification time among the UI's sources: `packages/web/src`, `index.html`, `vite.config.ts`,
 * `package.json`, and the shared `packages/core/src` the UI imports types and helpers from.
 * @param {string} root the repository root
 * @returns {number | undefined}
 */
export function newestSourceMtime(root) {
  let newest;
  const visit = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) if (name !== 'node_modules' && name !== 'dist') visit(join(p, name));
    } else if (newest === undefined || st.mtimeMs > newest) newest = st.mtimeMs;
  };
  for (const rel of ['packages/web/src', 'packages/web/index.html', 'packages/web/vite.config.ts', 'packages/web/package.json', 'packages/core/src']) visit(join(root, rel));
  return newest;
}
