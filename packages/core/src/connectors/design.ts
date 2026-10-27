/**
 * The frame table of a change's `design.md` (pdi contract 0.9.0, `conventions.design`; flow step 07 Design, F6):
 * `Wymaganie | Ścieżka | Stan | Ramka | Uwagi` (or `Requirement | Journey | State | Frame | Notes`). The result has the
 * shape of the contract's `design-links.schema.json`; the contract example pair (test/fixtures/pdi-contract/0.9.0) is
 * the reference shared with pdi and tf. Messages are in Polish like the contract's reference parser, so all three
 * tools say the same thing about the same file.
 */
import type { UiState } from '../model.js';

/** contract.json → conventions.design.states (the same list as UiState). */
export const DESIGN_STATES: readonly UiState[] = ['idle', 'loading', 'processing', 'success', 'validation_error', 'server_error', 'timeout', 'retry', 'empty', 'confirmation', 'session_expired', 'network_failure', 'permission_denied'];
const COLUMNS = [
  ['wymaganie', 'ścieżka', 'stan', 'ramka', 'uwagi'],
  ['requirement', 'journey', 'state', 'frame', 'notes'],
];
const MISSING = ['brak', 'missing'];
const NOT_APPLICABLE = ['nie dotyczy', 'n/a'];
const REQUIREMENT = /^[A-Z][A-Z0-9]*-[0-9]+(\/AC-[0-9]+)?$/;
const FIGMA_PATH = /^\/(design|file|proto)\/([A-Za-z0-9]+)(\/|$)/;
const NODE = /^([0-9]+)[-:]([0-9]+)$/;

export interface DesignFrameLink {
  file_key: string;
  node_id: string;
  url: string;
}

export interface DesignRow {
  requirement: string;
  journey: string;
  state: UiState;
  status: 'linked' | 'missing' | 'not_applicable';
  frame?: DesignFrameLink;
  note?: string;
}

/** The table does not follow the contract; the message starts with the table row number (from 1). */
export class DesignFormatError extends Error {}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

function frameLink(url: string, row: number): DesignFrameLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DesignFormatError(`wiersz ${row}: link do ramki musi prowadzić do pliku w figma.com`);
  }
  const path = FIGMA_PATH.exec(parsed.pathname);
  if (parsed.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(parsed.host.toLowerCase()) || !path) {
    throw new DesignFormatError(`wiersz ${row}: link do ramki musi prowadzić do pliku w figma.com`);
  }
  const node = NODE.exec(parsed.searchParams.get('node-id') ?? '');
  if (!node) throw new DesignFormatError(`wiersz ${row}: link do ramki bez node-id (ramka, nie cały plik)`);
  return { file_key: path[2] ?? '', node_id: `${node[1]}:${node[2]}`, url };
}

/** First table with the contract header → `{ rows }`; a format error throws DesignFormatError. */
export function parseDesignMd(text: string): { rows: DesignRow[] } {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((ln) => ln.trim().startsWith('|') && COLUMNS.some((h) => h.join('|') === cells(ln).map((c) => c.toLowerCase()).join('|')));
  if (start < 0) throw new DesignFormatError('brak tabeli ramek (nagłówek: Wymaganie | Ścieżka | Stan | Ramka | Uwagi)');
  const rows: DesignRow[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const n = rows.length + 1;
    const c = cells(line);
    if (c.length !== 5) throw new DesignFormatError(`wiersz ${n}: oczekiwano 5 kolumn, jest ${c.length}`);
    const [requirement = '', journey = '', state = '', frame = '', note = ''] = c;
    if (!REQUIREMENT.test(requirement)) throw new DesignFormatError(`wiersz ${n}: identyfikator wymagania '${requirement}' (np. US-3 albo US-3/AC-2)`);
    if (!journey) throw new DesignFormatError(`wiersz ${n}: pusta ścieżka`);
    if (!(DESIGN_STATES as readonly string[]).includes(state)) throw new DesignFormatError(`wiersz ${n}: nieznany stan '${state}' (lista w conventions.design.states)`);
    const lower = frame.toLowerCase();
    const row: DesignRow = { requirement, journey, state: state as UiState, status: 'linked' };
    if (MISSING.includes(lower) || NOT_APPLICABLE.includes(lower)) {
      row.status = MISSING.includes(lower) ? 'missing' : 'not_applicable';
      if (!note) throw new DesignFormatError(`wiersz ${n}: '${frame}' wymaga uwagi z powodem albo pytaniem`);
    } else {
      row.frame = frameLink(frame, n);
    }
    if (note) row.note = note;
    rows.push(row);
  }
  return { rows };
}
