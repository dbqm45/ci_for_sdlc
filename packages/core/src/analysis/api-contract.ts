import type { DocumentItem, UiState } from '../model.js';
import { evDoc, evJira, type ItemCtx } from './context.js';
import type { Rule } from './rules.js';
import { designStates, statesIn } from './states.js';
import { STATE_LABELS } from './vocabulary.js';

/**
 * Rules on the API contract (OpenAPI, docs/OPENAPI-PLAN.md). The contract's async responses, idempotency header and
 * item limits feed the existing ARCH and CON rules as claims; these rules add what only a contract can say.
 */

/**
 * Error codes with a screen state of their own. 5xx, 408 and 504 are left to ERR-002 and ERR-003, which ask about them
 * for every network operation; codes without a state (404, 409) are not asked about.
 */
const CODE_STATES: Record<string, UiState> = { '400': 'validation_error', '422': 'validation_error', '401': 'session_expired', '403': 'permission_denied', '429': 'retry' };

interface Uncovered {
  op: DocumentItem;
  code: string;
  description: string;
  state: UiState;
}

const said = (u: Uncovered) => `${u.code}${u.description ? ` ${u.description}` : ''}`;

export const API_RULES: Rule[] = [
  {
    id: 'API-001',
    name: 'API error without a screen state',
    description: 'An operation of the item returns an error the user must see, and neither the story nor its design defines that state.',
    appliesTo: ['story'],
    run: (c: ItemCtx) => {
      if (!c.ui || !c.api.length) return [];
      const covered = new Set([...statesIn(c.specText), ...statesIn(c.decisionText), ...designStates(c.frames)]);
      const missing: Uncovered[] = [];
      for (const op of c.api) {
        for (const e of op.api?.errorCodes ?? []) {
          const state = CODE_STATES[e.code];
          if (state && !covered.has(state) && !missing.some((m) => m.code === e.code)) missing.push({ op, code: e.code, description: e.description, state });
        }
      }
      const [first] = missing;
      if (!first) return [];
      const codes = missing.map((m) => m.code);
      const ops = [...new Set(missing.map((m) => m.op))];
      return [
        {
          disc: codes.join(','),
          category: 'MISSING_COVERAGE',
          severity: 'warning',
          dimension: 'errorHandling',
          title: `API error${codes.length > 1 ? 's' : ''} ${codes.join(', ')} ha${codes.length > 1 ? 've' : 's'} no state in the story or design`,
          explanation: `${missing.map((m) => `${m.op.api!.method} ${m.op.api!.path} returns ${said(m)} (${STATE_LABELS[m.state].toLowerCase()})`).join('; ')}, but neither the story nor its design says what the user sees then.`,
          evidence: [...ops.slice(0, 3).map((op) => evDoc(op, /Errors:/)), evJira(c.r)],
          question: {
            text: `What does the user see when the API returns ${said(first)}?`,
            options: ['A dedicated message with a way to fix it', 'A generic error with a retry', 'Nothing: the app handles it without the user'],
            topic: 'api errors',
          },
        },
      ];
    },
  },
];
