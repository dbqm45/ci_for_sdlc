// Pure helpers of `npm run contract:sync` / `contract:check` (scripts/pdi-contract.mjs): the pin file and the list of
// copies it describes. No I/O here, so it is tested without network (scripts/lib/pdi-contract.test.mjs).
//
// The pdi contract has one source: dbqm45/pdi, directory contract/. Copies here are pinned to a version: the tag
// contract-v<version> (from 0.8.0), or a full commit SHA for versions released before tags existed. They are generated
// from that source and never edited by hand; CI checks them byte for byte.

const PIN_KEYS = new Set(['repo', 'sets']);
const SET_KEYS = new Set(['version', 'ref', 'files']);
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;

/** Validates the pin file; throws an Error whose message names the problem in Polish (shown to the developer). */
export function parsePin(pin) {
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) throw new Error('przypięcie: oczekiwano obiektu JSON');
  const extra = Object.keys(pin).filter((k) => !PIN_KEYS.has(k));
  if (extra.length) throw new Error(`przypięcie: nieznane klucze ${extra.join(', ')} (dozwolone: repo, sets)`);
  if (typeof pin.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(pin.repo)) throw new Error('przypięcie: repo w formacie owner/name');
  if (!Array.isArray(pin.sets) || !pin.sets.length) throw new Error('przypięcie: sets to niepusta lista');
  const seen = new Set();
  for (const set of pin.sets) {
    const bad = Object.keys(set).filter((k) => !SET_KEYS.has(k));
    if (bad.length) throw new Error(`przypięcie: nieznane klucze zestawu ${bad.join(', ')}`);
    if (!VERSION.test(set.version ?? '')) throw new Error(`przypięcie: wersja kontraktu X.Y.Z, jest ${set.version}`);
    if (set.ref !== undefined && !SHA.test(set.ref)) throw new Error(`przypięcie ${set.version}: ref to pełny SHA commita (40 znaków)`);
    if (!set.files || typeof set.files !== 'object' || !Object.keys(set.files).length) throw new Error(`przypięcie ${set.version}: files to mapa plik kontraktu → kopia`);
    for (const dest of Object.values(set.files)) {
      if (typeof dest !== 'string' || !dest || dest.startsWith('/') || dest.includes('..')) throw new Error(`przypięcie ${set.version}: ścieżka kopii względna, bez ..: ${dest}`);
      if (seen.has(dest)) throw new Error(`przypięcie: kopia ${dest} występuje dwa razy`);
      seen.add(dest);
    }
  }
  return pin;
}

/** Every copy as { version, ref, name, dest }; ref is the tag contract-v<version> unless the set pins a commit. */
export function planCopies(pin) {
  return pin.sets.flatMap((set) => Object.entries(set.files).map(([name, dest]) => ({ version: set.version, ref: set.ref ?? `contract-v${set.version}`, name, dest })));
}

export const sourceUrl = (repo, ref, name) => `https://raw.githubusercontent.com/${repo}/${ref}/contract/${name}`;
