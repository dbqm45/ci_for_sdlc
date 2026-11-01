import { DECISION_EFFECTS, type ActiveDecision, type DecisionEffect } from '../model.js';

/** A problem with a file of a change, as the repository connector reports it. */
interface Problem {
  path: string;
  message: string;
}

/**
 * Decisions on findings of a change from a repository (PRB-16, docs/REPO-DECISIONS-PLAN.md): entries of the change's
 * `decisions.md`, as tf's `decision_record.py decision add` writes them, with one more field `ustalenie: <finding>`
 * (e.g. `DES-001:TSK-1`). Such an entry answers the finding's question the way a decision in the UI does, and it is
 * reviewed in the pull request with the rest of the change. Entries without `ustalenie` are the change's other
 * decisions and are not read here.
 *
 *   ## Payment errors show the support contact          ← the answer
 *   - ref: CHG-12/D3
 *   - id: DEC-41                                        ← optional: pdi's number
 *   - wyslano: tak
 *   - kiedy: 2026-10-30
 *   - kto: Ann
 *   - rodzaj: product
 *   - dlaczego: Agreed with support in the refinement.  ← the note
 *   - zrodlo: claude-cli
 *   - szkic: human
 *   - ustalenie: DES-001:TSK-1
 *   - skutek: resolve                                   ← optional: resolve (default) | accept_risk | dismiss | confirm
 */

/** `<rule>:<item>[:<detail>]`, the id of a finding; the item is its second part. */
const FINDING = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3}):([A-Z][A-Z0-9]+-[0-9]+)(?::[^\s]{1,80})?$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const PDI_KEY = /^[A-Z][A-Z0-9]+-[0-9]+$/;
const MAX_TEXT = 2000;

interface Entry {
  heading: string;
  line: number;
  fields: Map<string, { value: string; line: number }>;
}

function entriesOf(text: string): Entry[] {
  const out: Entry[] = [];
  let current: Entry | undefined;
  let inComment = false;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    // tf's template keeps its sample entry in an HTML comment: it is not a decision.
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      return;
    }
    if (line.trimStart().startsWith('<!--')) {
      inComment = !line.includes('-->');
      return;
    }
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = { heading: h[1]!, line: i + 1, fields: new Map() };
      out.push(current);
      return;
    }
    const f = /^\s*-\s+([a-z_]+):\s*(.*?)\s*$/.exec(line);
    if (f && current && !current.fields.has(f[1]!)) current.fields.set(f[1]!, { value: f[2]!, line: i + 1 });
  });
  return out;
}

/**
 * The decisions on findings in one change's `decisions.md`. `items`: the keys of the change and its slices; an entry
 * about another item, a malformed field or a repeated finding is a problem with its line, and the entry is skipped.
 * A later entry for the same finding replaces an earlier one (a changed answer is a new entry, as in tf).
 */
export function parseRepoDecisions(text: string, opts: { change: string; path: string; items: ReadonlySet<string> }): { decisions: ActiveDecision[]; problems: Problem[] } {
  const problems: Problem[] = [];
  const byFinding = new Map<string, ActiveDecision>();
  for (const e of entriesOf(text)) {
    const finding = e.fields.get('ustalenie');
    if (!finding) continue;
    const problem = (message: string, line = e.line) => problems.push({ path: opts.path, message: `line ${line}, "${e.heading.slice(0, 80)}": ${message}` });
    const m = FINDING.exec(finding.value);
    if (!m) {
      problem(`ustalenie "${finding.value.slice(0, 80)}" is not a finding id like DES-001:TSK-1`, finding.line);
      continue;
    }
    const itemKey = m[2]!;
    if (!opts.items.has(itemKey)) {
      problem(`ustalenie ${finding.value} is about ${itemKey}, which is not ${opts.change} or one of its slices`, finding.line);
      continue;
    }
    const by = e.fields.get('kto')?.value ?? '';
    const when = e.fields.get('kiedy');
    if (!by) {
      problem('kto is missing: who decided');
      continue;
    }
    if (!when || !DATE.test(when.value)) {
      problem('kiedy must be a date like 2026-10-30', when?.line ?? e.line);
      continue;
    }
    const effectField = e.fields.get('skutek');
    const effect = (effectField?.value || 'resolve') as DecisionEffect;
    if (!(DECISION_EFFECTS as readonly string[]).includes(effect)) {
      problem(`skutek must be one of ${DECISION_EFFECTS.join(', ')}`, effectField?.line);
      continue;
    }
    const ref = e.fields.get('ref')?.value || `${opts.change}/L${e.line}`;
    const dec = e.fields.get('id')?.value ?? '';
    const note = e.fields.get('dlaczego')?.value;
    const drafted = e.fields.get('szkic')?.value;
    byFinding.set(finding.value, {
      id: `repo:${ref}`,
      questionId: `q:${finding.value}`,
      findingId: finding.value,
      itemKey,
      topic: 'decision in the repository',
      question: `Finding ${finding.value}`,
      answer: e.heading.slice(0, MAX_TEXT),
      ...(note && { note: note.slice(0, MAX_TEXT) }),
      decidedBy: by.slice(0, 200),
      decidedAt: `${when.value}T00:00:00.000Z`,
      effect,
      version: 1,
      status: 'active',
      evidence: [{ source: 'decision', entityId: `repo:${ref}`, title: `${opts.path}:${e.line}`, excerpt: e.heading.slice(0, 300), path: opts.path, line: e.line }],
      ...((drafted === 'ai' || drafted === 'human') && { draftedBy: drafted }),
      ...(PDI_KEY.test(dec) && { pdiDecision: dec }),
    });
  }
  return { decisions: [...byFinding.values()], problems };
}
