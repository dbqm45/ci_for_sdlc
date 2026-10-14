import { createRequire } from 'node:module';

/**
 * Application version (SemVer) — the one source of truth is package.json, bumped on main by the Release workflow (scripts/release.mjs).
 * Every workspace package carries the same number; the git tag `v<version>` marks the release.
 */
export const APP_VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
