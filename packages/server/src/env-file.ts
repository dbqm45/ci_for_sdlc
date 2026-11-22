import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository's `.env` (next to the root package.json): `npm start` and `npm run dev` read it when it exists. */
export const DEFAULT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');

/**
 * Loads a `.env` file into process.env when it exists; a variable already set in the environment wins over the
 * file (Node's own rule). Returns whether a file was read. Never prints values.
 */
export function loadEnvFile(path: string = DEFAULT_ENV_FILE, load: (p: string) => void = process.loadEnvFile): boolean {
  if (!existsSync(path)) return false;
  load(path);
  return true;
}
