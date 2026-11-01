#!/usr/bin/env node
// One command for a local app: `npm run local` (options: `npm run local -- --help`). It checks Node and the folder
// path, installs dependencies when the lockfile changed, takes the keys from the environment, from 1Password
// (`op run`, references file) or from the terminal, starts the server (or `npm run dev` with --dev), waits until it
// answers and prints the address to open. Keys stay in memory: nothing is written to a file. Ctrl+C stops the app.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ENV_FILE, accountsOf, UNDER_OP, USAGE, missingRequired, modeOf, needsInstall, nodeOk, optionalStatus, parseArgs, plan, shouldUseOp } from './lib/local.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WIN = process.platform === 'win32';
const NPM = WIN ? 'npm.cmd' : 'npm';
const bold = (s) => (process.stdout.isTTY ? `\u001b[1m${s}\u001b[0m` : s);
const step = (s) => console.log(`\n▸ ${s}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.error) {
  console.error(`${args.error}\n\n${USAGE}`);
  process.exit(2);
}

// --- 1Password: re-run this script under `op run`, which puts the referenced secrets into its environment only.
const envFile = (args.envFile ?? DEFAULT_ENV_FILE).replace(/^~(?=$|[/\\])/, homedir());
const opAvailable = spawnSync(WIN ? 'where' : 'which', ['op'], { stdio: 'ignore' }).status === 0;
if (shouldUseOp({ underOp: !!process.env[UNDER_OP], opAvailable, envFileExists: existsSync(envFile) })) {
  console.log(`▸ Klucze z 1Password (${envFile})`);
  const r = spawnSync('op', ['run', '--env-file', envFile, '--', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, [UNDER_OP]: '1' } });
  process.exit(r.status ?? 1);
}
if (args.envFile && !existsSync(envFile)) fail(`Nie ma pliku ${envFile}.`);
if (args.envFile && !opAvailable) fail('--env-file wymaga 1Password CLI (op): https://developer.1password.com/docs/cli/get-started/');

// --- Checks
step('Sprawdzam Node i folder');
if (!nodeOk(process.version)) fail(`Potrzebny Node 22 lub nowszy, a jest ${process.version}. Zainstaluj go z https://nodejs.org/.`);
const pathCheck = spawnSync(process.execPath, ['scripts/check-path.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (pathCheck.status !== 0) process.exit(1);

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : undefined);
if (needsInstall({ lockMtimeMs: mtime(`${ROOT}/package-lock.json`), installedMtimeMs: mtime(`${ROOT}/node_modules/.package-lock.json`) })) {
  step('Instaluję zależności (npm ci, za pierwszym razem kilka minut)');
  if (spawnSync(NPM, ['ci', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: WIN }).status !== 0) fail('npm ci się nie udało (komunikat wyżej).');
}

// --- Keys
const mode = modeOf(args, process.env);
const accounts = accountsOf(args, process.env);
const p = plan({ mode, dev: args.dev, port: args.port, accounts }, process.env);
const env = { ...process.env, ...p.vars };
delete env[UNDER_OP];

const label = accounts ? `${mode} + accounts` : mode;
const missing = missingRequired(mode, env, accounts);
if (missing.length) {
  if (!args.prompt || !process.stdin.isTTY) fail(`Brakuje zmiennych dla trybu ${label}: ${missing.map((m) => m.name).join(', ')}. Ustaw je (np. z menedżera haseł) i uruchom ponownie.`);
  step(`Tryb ${label}: brakuje ${missing.length} klucz(y). Wklej je z menedżera haseł (nie będą widoczne ani zapisane)`);
  for (const m of missing) {
    const value = (await askHidden(`  ${m.name} (${m.hint}): `)).trim();
    if (!value) fail(`Bez ${m.name} tryb ${label} nie wystartuje.`);
    env[m.name] = value;
  }
}

if (!(await portFree(p.port))) fail(`Port ${p.port} jest zajęty. Może aplikacja już działa (np. docker compose)? Zatrzymaj ją albo użyj --port.`);

// --- Start
step(args.dev ? 'Uruchamiam serwer i Vite (npm run dev)' : 'Uruchamiam aplikację (npm start; za pierwszym razem buduje interfejs)');
const child = spawn(NPM, ['run', p.npmScript], { cwd: ROOT, env, stdio: 'inherit', shell: WIN });
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => ((stopping = true), child.kill(sig)));
child.on('exit', (code) => {
  if (!stopping && code) console.error(`\n✗ Aplikacja zakończyła się z kodem ${code} (komunikat wyżej).`);
  process.exit(stopping ? 0 : (code ?? 1));
});

if (await waitForHealth(p.healthUrl, 180_000)) {
  const opt = optionalStatus(mode, env, accounts);
  console.log(`\n${bold('Gotowe:')} ${bold(p.appUrl)}`);
  console.log(`  Tryb połączenia z Atlassianem: ${mode}${mode === 'oauth' ? ` (Settings → Integrations → Connect Atlassian)` : ''}`);
  if (accounts) console.log('  Logowanie: kontem Atlassian (CI_AUTH_MODE=accounts). Pierwszy Owner: CI_BOOTSTRAP_EMAIL albo link z logu serwera wyżej');
  if (mode === 'oauth' || accounts) console.log(`  Callback URL w aplikacji Atlassiana: ${p.callbackUrl}`);
  console.log(`  Klucze: ${opt.map((o) => `${o.name} ${o.set ? '✓' : '—'}`).join(', ')}`);
  console.log('  Zatrzymanie: Ctrl+C\n');
} else if (!stopping) {
  console.error(`\n✗ Serwer nie odpowiedział na ${p.healthUrl} w 3 minuty. Sprawdź komunikaty wyżej.`);
}

/** Reads a line without echoing it, so a pasted key does not stay on the screen or in the scrollback. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => s.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function waitForHealth(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && !stopping) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
