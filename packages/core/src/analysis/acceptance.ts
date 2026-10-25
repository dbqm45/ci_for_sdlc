import type { AcScenario } from '../model.js';

/**
 * Acceptance-criteria parser (plan G1/G2 §4.4, step G2.1). Groups the AC lines the connector produces into units:
 * GWT scenarios (EN and PL keywords), EARS sentences and free-text points, numbers them AC-1…AC-n, and extracts the
 * main action of each scenario from When/Gdy. Keywords follow the pdi contract 0.4.0 vocabulary
 * (contract/fixtures/story-shape/vocabulary.json, Gherkin languages EN and PL); the expected grouping is pinned by the
 * same contract's story-shape set (test/acceptance.test.ts).
 */

type Kw = 'given' | 'when' | 'then' | 'and' | 'but';

/** Longer variants first, so "Zakładając, że" wins over "Zakładając". "I" (PL "and") is handled separately. */
const KEYWORDS: Record<Kw, string[]> = {
  given: ['Zakładając, że', 'Zakładając', 'Mając', 'Given'],
  when: ['Jeżeli', 'Jeśli', 'Gdy', 'Kiedy', 'When'],
  then: ['Wtedy', 'Then'],
  and: ['Oraz', 'And'],
  but: ['Ale', 'But'],
};
const EN_KEYWORD = /^(given|when|then|and|but)\b/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (words: string[]) => words.map(esc).join('|');
/** A keyword at the start of a line, followed by optional punctuation; captures the rest. */
const LEADING: [Kw, RegExp][] = (Object.keys(KEYWORDS) as Kw[]).map((k) => [k, new RegExp(`^(?:${alt(KEYWORDS[k])})(?![\\p{L}\\p{N}])[\\s,:]*`, 'iu')]);
/** Inside a one-line scenario: ", when …", " i gdy …", " and then …" — When/Then words preceded by a comma or a conjunction. */
const INLINE = new RegExp(`(?<!(?:^|\\s)(?:i|oraz|and))(?:\\s*,\\s*|\\s+)(?=(?:(?:i|oraz|and)\\s+)?(?:${alt([...KEYWORDS.when, ...KEYWORDS.then])})(?![\\p{L}\\p{N}]))`, 'giu');
/** EARS: the response "shall" (contract vocabulary, English only). */
const EARS = /\bshall\b/i;

interface Line {
  kw?: Kw;
  /** Text without the keyword. */
  body: string;
  raw: string;
  /** "And when" / "Oraz gdy" / "i gdy": a conjunction directly followed by When. */
  andWhen?: boolean;
}

function classify(raw: string, pl: boolean): Line {
  const text = raw.trim();
  for (const [kw, re] of LEADING) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length);
    if (kw === 'and' || kw === 'but') {
      const inner = classify(rest, pl);
      if (inner.kw === 'when') return { kw: 'when', body: inner.body, raw: text, andWhen: true };
    }
    return { kw, body: rest.trim(), raw: text };
  }
  // PL "I" (and) — only in Polish AC, where it cannot be the English pronoun.
  const i = pl ? /^i\s+/i.exec(text) : null;
  if (i) {
    const inner = classify(text.slice(i[0].length), pl);
    if (inner.kw === 'when') return { kw: 'when', body: inner.body, raw: text, andWhen: true };
    return { kw: 'and', body: text.slice(i[0].length).trim(), raw: text };
  }
  return { body: text, raw: text };
}

/** A GWT line that carries further keywords ("Gdy … i gdy …, wtedy …") becomes one line per keyword. */
function splitInline(line: string): string[] {
  if (EARS.test(line) || !LEADING.some(([, re]) => re.test(line.trim()))) return [line];
  return line.split(INLINE).map((s) => s.trim()).filter(Boolean);
}

const clean = (s: string) => s.trim().replace(/[.;]+$/, '').trim();

// ---------------------------------------------------------------------------- main action

/** Leading words that name who acts, not what is done. */
const SUBJECT = new Set(
  'the a an they i we he she you it customer customers user users seller buyer visitor admin administrator system klient klientka użytkownik użytkowniczka sprzedawca sprzedawczyni kupujący gość administrator administratorka'.split(' '),
);
/** Words that start a qualifier (data variant, place, condition): the action ends before them. */
const STOP = new Set(
  'with for from to in on at by into using without until after before when if and or which that z ze w we na do dla od po przez bez przy o i oraz lub albo który która które że gdy jeśli jeżeli kiedy'.split(' '),
);
const ARTICLE = new Set(['a', 'an', 'the']);

/**
 * The action of a When clause: verb and object, without the actor and without data variants, so "doda kartę
 * z poprawnymi danymi" and "doda kartę z nieważną datą" are the same action ("doda kartę").
 */
export function normalizeAction(when: string): string {
  const words = clean(when)
    .toLowerCase()
    .replace(/[„“”"«»'‘’][^„“”"«»'‘’]*[„“”"«»'‘’]?/gu, ' ')
    .split(/[\s,;:()]+/u)
    .filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && SUBJECT.has(words[i]!)) i++;
  const out: string[] = [];
  for (const w of words.slice(i)) {
    if (STOP.has(w) || /\d/.test(w)) break;
    if (!ARTICLE.has(w)) out.push(w);
    if (out.length === 4) break;
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------- units

function ears(text: string): AcScenario {
  const clauses = clean(text).split(/\s*,\s*/);
  const given: string[] = [];
  let when: string | undefined;
  const then: string[] = [];
  for (const c of clauses) {
    if (then.length || EARS.test(c)) then.push(c);
    else if (/^(while|where)\b/i.test(c)) given.push(c.replace(/^(while|where)\s+/i, ''));
    else if (/^(when|if)\b/i.test(c)) when = c.replace(/^(when|if)\s+/i, '');
    else given.push(c);
  }
  return { id: '', format: 'ears', given, ...(when && { when }), then: [then.join(', ')], text: text.trim() };
}

interface Draft {
  lines: Line[];
  given: string[];
  whens: string[];
  then: string[];
  last?: 'given' | 'when' | 'then';
}

function gwt(d: Draft): AcScenario {
  const [when, ...extra] = d.whens;
  return {
    id: '',
    format: 'gwt',
    given: d.given,
    ...(when !== undefined && { when }),
    then: d.then,
    text: d.lines.map((l) => l.raw).join('\n'),
    ...(when !== undefined && { mainAction: normalizeAction(when) }),
    extraActions: extra.map(normalizeAction),
  };
}

/**
 * Units of the acceptance criteria, in order, numbered AC-1…AC-n. Input: the connector's AC lines (bullet markers
 * already removed). An empty entry closes the open scenario; a new Given, or a When after a Then, opens the next one,
 * so scenarios are found also when blank lines were lost on the way.
 */
export function parseAcceptanceCriteria(lines: string[]): AcScenario[] {
  const pl = !lines.some((l) => EN_KEYWORD.test(l.trim()));
  const units: AcScenario[] = [];
  let open: Draft | undefined;
  const close = () => {
    if (open) units.push(gwt(open));
    open = undefined;
  };
  const start = () => (open = { lines: [], given: [], whens: [], then: [] });

  for (const entry of lines) {
    if (!entry.trim()) {
      close();
      continue;
    }
    for (const part of splitInline(entry)) {
      const l = classify(part, pl);
      if (!l.kw) {
        close();
        units.push(EARS.test(l.body) ? ears(l.body) : { id: '', format: 'free', text: clean(l.body) || l.body });
        continue;
      }
      if (l.kw === 'given') {
        if (!open || open.whens.length || open.then.length) {
          close();
          start();
        }
        open!.given.push(clean(l.body));
        open!.last = 'given';
      } else if (l.kw === 'when') {
        if (!open || open.then.length) {
          close();
          start();
        }
        open!.whens.push(clean(l.body));
        open!.last = 'when';
      } else if (l.kw === 'then') {
        if (!open) start();
        open!.then.push(clean(l.body));
        open!.last = 'then';
      } else {
        // And / But: continue the section before; directly after When it is a second action.
        if (!open?.last) {
          close();
          units.push({ id: '', format: 'free', text: clean(l.raw) });
          continue;
        }
        if (open.last === 'given') open.given.push(clean(l.body));
        else if (open.last === 'when') open.whens.push(clean(l.body));
        else open.then.push(clean(l.body));
      }
      open!.lines.push(l);
    }
  }
  close();
  return units.map((u, i) => ({ ...u, id: `AC-${i + 1}` }));
}
