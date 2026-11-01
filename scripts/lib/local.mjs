// Pure helpers of `npm run local` (scripts/local.mjs): argument parsing, which variables a mode needs, and the plan
// of what to start. No I/O here, so it is tested without a terminal (scripts/lib/local.test.mjs).

export const DEFAULT_PORT = 4317;
export const VITE_PORT = 5173;
/** File with 1Password references (op://…), documented in docs/LOCAL-ENVIRONMENT.md, section 2. Holds no secrets. */
export const DEFAULT_ENV_FILE = '~/.config/ci-sdlc.env';
/** Set by the script itself when it re-runs under `op run`, so it does not loop. */
export const UNDER_OP = 'CI_LOCAL_UNDER_OP';

/** Variables a mode cannot start without. Asked for in the terminal when missing; never written to a file. */
export const REQUIRED = {
  token: [],
  oauth: [
    { name: 'ATLASSIAN_CLIENT_ID', hint: 'Client ID aplikacji z developer.atlassian.com/console/myapps → Settings' },
    { name: 'ATLASSIAN_CLIENT_SECRET', hint: 'Secret tej samej aplikacji' },
    { name: 'CI_ENCRYPTION_KEY', hint: 'ten sam klucz przy każdym uruchomieniu, inaczej zapisanego połączenia nie da się odczytać' },
  ],
};

/** Logging in with Atlassian (CI_AUTH_MODE=accounts): the same Atlassian app, scope read:me (docs/CONNECT-ATLASSIAN.md). */
export const REQUIRED_ACCOUNTS = REQUIRED.oauth.slice(0, 2);

/** Shown as set / not set (names only), so it is clear what the app will be able to read. */
export const OPTIONAL = {
  token: ['JIRA_API_TOKEN', 'CONFLUENCE_API_TOKEN', 'FIGMA_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CI_ENCRYPTION_KEY'],
  oauth: ['FIGMA_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
};

export const USAGE = `Użycie: npm run local -- [opcje]

  --oauth              przycisk "Connect Atlassian" zamiast JIRA_API_TOKEN (CI_CONNECT_MODE=oauth)
  --token              połączenie tokenem API (domyślnie, chyba że CI_CONNECT_MODE=oauth)
  --accounts           logowanie kontem Atlassian i role (CI_AUTH_MODE=accounts); łączy się z --oauth i --token
  --dev                tryb programisty: Vite z przeładowaniem na http://localhost:${VITE_PORT}
  --port <numer>       port serwera (domyślnie ${DEFAULT_PORT})
  --env-file <plik>    plik z odwołaniami 1Password (op://…), domyślnie ${DEFAULT_ENV_FILE}
  --no-prompt          nie pytaj o brakujące klucze, tylko je wypisz
  --help               ta pomoc

Klucze: ze zmiennych środowiskowych, z 1Password (op run) albo wpisane w terminalu.
Skrypt nigdy nie zapisuje ich do pliku.`;

/**
 * @param {string[]} argv
 * @returns {{ mode?: 'token' | 'oauth', accounts?: boolean, dev: boolean, port?: number, envFile?: string, prompt: boolean, help: boolean, error?: string }}
 */
export function parseArgs(argv) {
  const out = { dev: false, prompt: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--oauth' || a === '--token') {
      const mode = a.slice(2);
      if (out.mode && out.mode !== mode) return { ...out, error: 'Wybierz jedno: --oauth albo --token.' };
      out.mode = mode;
    } else if (a === '--accounts') out.accounts = true;
    else if (a === '--dev') out.dev = true;
    else if (a === '--no-prompt') out.prompt = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--port' || a === '--env-file') {
      const v = argv[++i];
      if (!v) return { ...out, error: `${a} wymaga wartości.` };
      if (a === '--env-file') out.envFile = v;
      else {
        const port = Number(v);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { ...out, error: `--port: "${v}" to nie jest numer portu.` };
        out.port = port;
      }
    } else return { ...out, error: `Nieznana opcja: ${a}` };
  }
  // Vite's proxy sends /api to port ${DEFAULT_PORT} (packages/web/vite.config.ts).
  if (out.dev && out.port !== undefined && out.port !== DEFAULT_PORT) return { ...out, error: `--dev działa tylko z portem ${DEFAULT_PORT}.` };
  return out;
}

/**
 * The mode: a flag wins over CI_CONNECT_MODE; anything else than "oauth" is the token mode.
 * @param {{ mode?: string }} args
 * @param {Record<string, string | undefined>} env
 * @returns {'token' | 'oauth'}
 */
export const modeOf = (args, env) => (args.mode ?? (env.CI_CONNECT_MODE?.trim() === 'oauth' ? 'oauth' : 'token'));

/**
 * Logging in with accounts: the flag, or CI_AUTH_MODE=accounts already in the environment.
 * @param {{ accounts?: boolean }} args
 * @param {Record<string, string | undefined>} env
 */
export const accountsOf = (args, env) => !!args.accounts || env.CI_AUTH_MODE?.trim() === 'accounts';

/**
 * Whether to re-run under `op run --env-file`: only with the 1Password CLI, a references file, and not already inside.
 * @param {{ underOp: boolean, opAvailable: boolean, envFileExists: boolean }} s
 */
export const shouldUseOp = (s) => !s.underOp && s.opAvailable && s.envFileExists;

/**
 * Dependencies need installing when node_modules has no record of the lockfile or is older than it.
 * @param {{ lockMtimeMs?: number, installedMtimeMs?: number }} s
 */
export const needsInstall = (s) => s.installedMtimeMs === undefined || (s.lockMtimeMs !== undefined && s.lockMtimeMs > s.installedMtimeMs);

/**
 * What to start and with which extra variables. Variables already set win over the defaults (e.g. CI_PUBLIC_URL).
 * @param {{ mode: 'token' | 'oauth', dev: boolean, port?: number, accounts?: boolean }} o
 * @param {Record<string, string | undefined>} env
 */
export function plan(o, env) {
  const port = o.port ?? (Number(env.PORT) || DEFAULT_PORT);
  const appUrl = o.dev ? `http://localhost:${VITE_PORT}` : `http://localhost:${port}`;
  const vars = {
    CI_CONNECT_MODE: o.mode,
    PORT: String(port),
    HOST: env.HOST || '127.0.0.1',
    CI_PUBLIC_URL: env.CI_PUBLIC_URL || appUrl,
    ...(o.accounts ? { CI_AUTH_MODE: 'accounts' } : {}),
  };
  return {
    npmScript: o.dev ? 'dev' : 'start',
    port,
    appUrl,
    healthUrl: `http://127.0.0.1:${port}/api/health`,
    callbackUrl: `${vars.CI_PUBLIC_URL.replace(/\/$/, '')}/api/connections/atlassian/callback`,
    vars,
  };
}

/**
 * @param {'token' | 'oauth'} mode
 * @param {Record<string, string | undefined>} env
 * @param {boolean} [accounts]
 */
export function missingRequired(mode, env, accounts = false) {
  const need = [...(accounts ? REQUIRED_ACCOUNTS : []), ...REQUIRED[mode]].filter((v, i, all) => all.findIndex((x) => x.name === v.name) === i);
  return need.filter((v) => !env[v.name]?.trim());
}

/**
 * Names of the optional variables with whether each is set. Never the values.
 * @param {'token' | 'oauth'} mode
 * @param {Record<string, string | undefined>} env
 * @param {boolean} [accounts] adds CI_BOOTSTRAP_EMAIL (without it the first Owner uses the link from the server log)
 */
export const optionalStatus = (mode, env, accounts = false) => [...(accounts ? ['CI_BOOTSTRAP_EMAIL'] : []), ...OPTIONAL[mode]].map((name) => ({ name, set: !!env[name]?.trim() }));

/**
 * Node 22 or newer (the runtime of CI and the Docker image).
 * @param {string} version e.g. "v22.12.0"
 */
export const nodeOk = (version) => Number(/^v?(\d+)/.exec(version)?.[1] ?? 0) >= 22;
