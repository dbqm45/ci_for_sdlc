import type { Evidence, ProjectContext, ScanResult } from '../model.js';
import type { ItemCtx } from './context.js';
import type { FindingDraft, Rule } from './rules.js';

/**
 * Security scan results (SARIF, connectors/sarif.ts) as findings (Z8c, docs/SECURITY-SCAN-PLAN.md). A result on a file a
 * slice's commits touched is the slice's; any other result is the change's. The rules run only when the analysis got
 * a scan.
 */

/**
 * CWEs of the OWASP Top 10 categories, 2021 and 2025 (the union: a CWE either edition puts in the Top 10 counts).
 * Source, read 2026-11-02: "List of Mapped CWEs" of each category page in the OWASP/Top10 repository on GitHub (2021, 2025).
 */
const OWASP_2021: Record<string, number[]> = {
  A01: [22, 23, 35, 59, 200, 201, 219, 264, 275, 276, 284, 285, 352, 359, 377, 402, 425, 441, 497, 538, 540, 548, 552, 566, 601, 639, 651, 668, 706, 862, 863, 913, 922, 1275],
  A02: [259, 261, 296, 310, 319, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 335, 336, 337, 338, 340, 347, 523, 720, 757, 759, 760, 780, 818, 916],
  A03: [20, 74, 75, 77, 78, 79, 80, 83, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 100, 113, 116, 138, 184, 470, 471, 564, 610, 643, 644, 652, 917],
  A04: [73, 183, 209, 213, 235, 256, 257, 266, 269, 280, 311, 312, 313, 316, 419, 430, 434, 444, 451, 472, 501, 522, 525, 539, 579, 598, 602, 642, 646, 650, 653, 656, 657, 799, 807, 840, 841, 927, 1021, 1173],
  A05: [2, 11, 13, 15, 16, 260, 315, 520, 526, 537, 541, 547, 611, 614, 756, 776, 942, 1004, 1032, 1174],
  A06: [937, 1035, 1104],
  A07: [255, 259, 287, 288, 290, 294, 295, 297, 300, 302, 304, 306, 307, 346, 384, 521, 613, 620, 640, 798, 940, 1216],
  A08: [345, 353, 426, 494, 502, 565, 784, 829, 830, 915],
  A09: [117, 223, 532, 778],
  A10: [918],
};
const OWASP_2025: Record<string, number[]> = {
  A01: [22, 23, 36, 59, 61, 65, 200, 201, 219, 276, 281, 282, 283, 284, 285, 352, 359, 377, 379, 402, 424, 425, 441, 497, 538, 540, 548, 552, 566, 601, 615, 639, 668, 732, 749, 862, 863, 918, 922, 1275],
  A02: [5, 11, 13, 15, 16, 260, 315, 489, 526, 547, 611, 614, 776, 942, 1004, 1174],
  A03: [447, 1035, 1104, 1329, 1357, 1395],
  A04: [261, 296, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 334, 335, 336, 337, 338, 340, 342, 347, 523, 757, 759, 760, 780, 916, 1240, 1241],
  A05: [20, 74, 76, 77, 78, 79, 80, 83, 86, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 103, 104, 112, 113, 114, 115, 116, 129, 159, 470, 493, 500, 564, 610, 643, 644, 917],
  A06: [73, 183, 256, 266, 269, 286, 311, 312, 313, 316, 362, 382, 419, 434, 436, 444, 451, 454, 472, 501, 522, 525, 539, 598, 602, 628, 642, 646, 653, 656, 657, 676, 693, 799, 807, 841, 1021, 1022, 1125],
  A07: [258, 259, 287, 288, 289, 290, 291, 293, 294, 295, 297, 298, 299, 300, 302, 303, 304, 305, 306, 307, 308, 309, 346, 350, 384, 521, 613, 620, 640, 798, 940, 941, 1390, 1391, 1392, 1393],
  A08: [345, 353, 426, 427, 494, 502, 506, 509, 565, 784, 829, 830, 915, 926],
  A09: [117, 221, 223, 532, 778],
  A10: [209, 215, 234, 235, 248, 252, 274, 280, 369, 390, 391, 394, 396, 397, 460, 476, 478, 484, 550, 636, 703, 754, 755, 756],
};
export const OWASP_TOP10_CWES: ReadonlySet<number> = new Set([...Object.values(OWASP_2021), ...Object.values(OWASP_2025)].flat());

const CHANGE_FILE = /^docs\/project\/changes\/(CHG-[^/]+)\//;

/**
 * Scan results per item key: a result goes to the slices whose files list its path; else to the change whose folder
 * holds the file; else to the changes of the pull request (its slices' changes and the change folders it touches); else,
 * when nothing narrows it, to every change, so no result is lost. Absent when the analysis got no scan.
 */
export function securityByItem(ctx: ProjectContext): Map<string, ScanResult[]> | undefined {
  const scan = ctx.securityScan;
  if (!scan) return undefined;
  const byKey = new Map(ctx.requirements.map((r) => [r.key, r]));
  const epics = ctx.requirements.filter((r) => r.type === 'epic').map((r) => r.key);
  const changeOf = (key: string) => {
    const r = byKey.get(key);
    return r?.type === 'epic' ? r.key : (r?.epicKey ?? r?.parentKey);
  };
  const prChanges = new Set<string>();
  for (const s of scan.pr?.slices ?? []) {
    const c = changeOf(s);
    if (c && byKey.get(c)?.type === 'epic') prChanges.add(c);
  }
  for (const f of scan.pr?.files ?? []) {
    const c = CHANGE_FILE.exec(f)?.[1];
    if (c && byKey.get(c)?.type === 'epic') prChanges.add(c);
  }
  const slicesOf = new Map<string, string[]>();
  for (const [slice, files] of Object.entries(scan.sliceFiles)) {
    if (!byKey.has(slice)) continue;
    for (const f of new Set(files)) (slicesOf.get(f) ?? slicesOf.set(f, []).get(f)!).push(slice);
  }
  const out = new Map<string, ScanResult[]>();
  const give = (key: string, r: ScanResult) => (out.get(key) ?? out.set(key, []).get(key)!).push(r);
  for (const r of scan.results) {
    const slices = r.path ? slicesOf.get(r.path) : undefined;
    const folder = r.path ? CHANGE_FILE.exec(r.path)?.[1] : undefined;
    const keys = slices?.length
      ? slices
      : folder && byKey.get(folder)?.type === 'epic'
        ? [folder]
        : prChanges.size
          ? [...prChanges]
          : epics;
    for (const k of keys) give(k, r);
  }
  return out;
}

/** Where the result is, as `path:line`, or the report when it has no location. */
export const placeOfResult = (r: ScanResult) => (r.path ? `${r.path}${r.line ? `:${r.line}` : ''}` : r.report);

const evResult = (r: ScanResult): Evidence => ({
  source: 'security',
  entityId: `sarif:${r.tool}:${r.ruleId}:${placeOfResult(r)}`,
  title: `${r.tool}: ${r.ruleId}`,
  ...(r.path && { path: r.path }),
  ...(r.line && { line: r.line }),
  excerpt: r.message,
  ...(r.helpUri && { url: r.helpUri }),
});

const owasp = (r: ScanResult) => r.cwes.filter((c) => OWASP_TOP10_CWES.has(c));
const cweText = (r: ScanResult) => (r.cwes.length ? ` (${r.cwes.map((c) => `CWE-${c}`).join(', ')})` : '');

/** One finding per result, told apart by tool, rule and place (and a counter when that repeats). */
function findingsOf(c: ItemCtx, pick: (r: ScanResult) => boolean, draft: (r: ScanResult) => Omit<FindingDraft, 'disc' | 'evidence' | 'category' | 'dimension'>): FindingDraft[] {
  const seen = new Map<string, number>();
  return (c.env.securityByItem?.get(c.r.key) ?? []).filter(pick).map((r) => {
    const base = `${r.tool}:${r.ruleId}:${placeOfResult(r)}`.replace(/\s+/g, '-');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { disc: n > 1 ? `${base}#${n}` : base, category: 'CONFLICT', dimension: 'architecture', evidence: [evResult(r)], ...draft(r) };
  });
}

/** The SEC rule a result falls under: SEC-001 an error or a warning with an OWASP Top 10 CWE, SEC-002 another warning, SEC-003 a note. */
export const securityRuleOf = (r: ScanResult): 'SEC-001' | 'SEC-002' | 'SEC-003' =>
  r.level === 'error' || (r.level === 'warning' && owasp(r).length > 0) ? 'SEC-001' : r.level === 'warning' ? 'SEC-002' : 'SEC-003';

export const SECURITY_RULES: Rule[] = [
  {
    id: 'SEC-001',
    name: 'Security scan: error or OWASP Top 10 weakness',
    description: 'A security scan reported an error, or a warning about a weakness (CWE) of the OWASP Top 10, on a file of the slice (else of the change).',
    appliesTo: ['epic', 'story'],
    run: (c) =>
      findingsOf(c, (r) => securityRuleOf(r) === 'SEC-001', (r) => ({
        severity: 'critical',
        title: `${r.ruleId} at ${placeOfResult(r)}`,
        explanation: `${r.tool} reports ${r.level === 'error' ? 'an error' : `a warning about an OWASP Top 10 weakness`}${cweText(r)}: ${r.message} Fix it, or suppress it in the scanner with a reason when it is a false positive.`,
      })),
  },
  {
    id: 'SEC-002',
    name: 'Security scan: warning',
    description: 'A security scan reported a warning that is not about a weakness of the OWASP Top 10.',
    appliesTo: ['epic', 'story'],
    run: (c) =>
      findingsOf(c, (r) => securityRuleOf(r) === 'SEC-002', (r) => ({
        severity: 'warning',
        title: `${r.ruleId} at ${placeOfResult(r)}`,
        explanation: `${r.tool} reports a warning${cweText(r)}: ${r.message}`,
      })),
  },
  {
    id: 'SEC-003',
    name: 'Security scan: note',
    description: 'A security scan left a note.',
    appliesTo: ['epic', 'story'],
    run: (c) =>
      findingsOf(c, (r) => securityRuleOf(r) === 'SEC-003', (r) => ({
        severity: 'info',
        title: `${r.ruleId} at ${placeOfResult(r)}`,
        explanation: `${r.tool} notes${cweText(r)}: ${r.message}`,
      })),
  },
];
