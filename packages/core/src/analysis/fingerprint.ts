import type { DesignFrame, DocumentItem, RequirementItem, UiState } from '../model.js';
import { hash } from '../text.js';
import { GENERAL_CLAIM_PACK, extractClaims, formatClaimValue, type ClaimPack } from './claims.js';
import { DESIGN_STATE_PATTERNS } from './vocabulary.js';

/**
 * Meaning fingerprints (P5): a hash of what an artifact *says*, not how it is
 * written. Drift reacts only when this changes — claims, acceptance criteria,
 * business rules, Figma states and transitions. Wording, casing, whitespace,
 * titles and workflow status are cosmetic and go to history only.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const set = (xs: string[]) => [...new Set(xs.map(norm).filter(Boolean))].sort();

function claimsOf(text: string, entityId: string, pack: ClaimPack): string[] {
  return extractClaims(text, { source: 'jira', entityId, title: '' }, { defaultSubject: '', pack })
    .map((c) => `${c.subject}|${c.attribute}|${formatClaimValue(c)}`)
    .sort();
}

/** UI states a single Figma frame represents. */
export function frameStates(f: DesignFrame): UiState[] {
  const labels = [f.name, ...f.texts];
  // Frame names are authoritative; text layers only count for short labels (variants / headings).
  return (Object.keys(DESIGN_STATE_PATTERNS) as UiState[]).filter((s) => DESIGN_STATE_PATTERNS[s].test(f.name) || labels.some((t) => t.length <= 40 && DESIGN_STATE_PATTERNS[s].test(t)));
}

export function requirementMeaning(r: RequirementItem, entityId: string, pack: ClaimPack = GENERAL_CLAIM_PACK): string {
  return hash(JSON.stringify({ ac: set(r.acceptanceCriteria), rules: set(r.businessRules), claims: claimsOf([r.description, ...r.acceptanceCriteria, ...r.businessRules].join('\n'), entityId, pack) }));
}

export function documentMeaning(d: DocumentItem, entityId: string, pack: ClaimPack = GENERAL_CLAIM_PACK): string {
  return hash(JSON.stringify({ claims: claimsOf(d.body, entityId, pack) }));
}

export function frameMeaning(f: DesignFrame, entityId: string, pack: ClaimPack = GENERAL_CLAIM_PACK): string {
  return hash(JSON.stringify({ states: frameStates(f).sort(), transitions: [...f.transitions].sort(), claims: claimsOf(f.texts.join('\n'), entityId, pack) }));
}
