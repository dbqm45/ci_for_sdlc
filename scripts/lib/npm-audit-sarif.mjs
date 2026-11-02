// `npm audit --json` (auditReportVersion 2, npm 7–10) as SARIF 2.1.0, for `analyze --sarif` (docs/SECURITY-SCAN-PLAN.md).
// npm audit writes no SARIF itself. One result per advisory and package; the place is the package's entry in the lockfile.

export class AuditError extends Error {}

const LEVEL = { critical: 'error', high: 'error', moderate: 'warning', low: 'note', info: 'note' };

/** The 1-based line of `"<node>": {` in the lockfile's text, if any. */
function lineOf(text, node) {
  const needle = `${JSON.stringify(node)}:`;
  const i = text.split(/\r?\n/).findIndex((l) => l.trimStart().startsWith(needle));
  return i >= 0 ? i + 1 : undefined;
}

/**
 * @param {unknown} audit the parsed output of `npm audit --json`
 * @param {{ lockfile?: { path: string; text: string } }} [opts] the lockfile that results point at
 * @returns {object} a SARIF 2.1.0 log
 * @throws {AuditError} not an audit report of version 2, or npm's own error object
 */
export function auditToSarif(audit, opts = {}) {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) throw new AuditError('Not an npm audit report (auditReportVersion 2): not an object');
  if (audit.error) throw new AuditError(`npm audit failed: ${[audit.error.code, audit.error.summary].filter(Boolean).join(' ') || 'unknown error'}`);
  if (audit.auditReportVersion !== 2) throw new AuditError(`Not an npm audit report (auditReportVersion 2): auditReportVersion is ${audit.auditReportVersion ?? 'missing'}`);
  const vulns = audit.vulnerabilities && typeof audit.vulnerabilities === 'object' ? audit.vulnerabilities : {};
  const rules = [];
  const ruleIndex = new Map();
  const results = [];
  const seen = new Set();
  for (const [pkg, v] of Object.entries(vulns)) {
    for (const a of Array.isArray(v?.via) ? v.via : []) {
      if (!a || typeof a !== 'object') continue; // a package name: the advisory is reported on that package
      const ghsa = /GHSA(-[a-z0-9]{4}){3}/i.exec(String(a.url ?? ''))?.[0];
      const id = `npm-audit/${ghsa ?? a.source ?? a.title ?? 'advisory'}`;
      const node = (Array.isArray(v.nodes) && v.nodes[0]) || `node_modules/${pkg}`;
      if (seen.has(`${id}\u0000${node}`)) continue;
      seen.add(`${id}\u0000${node}`);
      if (!ruleIndex.has(id)) {
        ruleIndex.set(id, rules.length);
        rules.push({
          id,
          shortDescription: { text: String(a.title ?? id) },
          ...(a.url && { helpUri: String(a.url) }),
          defaultConfiguration: { level: LEVEL[a.severity] ?? 'warning' },
          properties: { tags: ['security', ...(Array.isArray(a.cwe) ? a.cwe.map(String) : [])] },
        });
      }
      const line = opts.lockfile ? lineOf(opts.lockfile.text, node) : undefined;
      results.push({
        ruleId: id,
        ruleIndex: ruleIndex.get(id),
        level: LEVEL[a.severity] ?? 'warning',
        message: { text: `${a.name ?? pkg} ${a.range ?? v.range ?? ''}`.trim() + `: ${a.title ?? id} (${a.severity ?? 'unknown'}, ${node})` },
        ...(opts.lockfile && {
          locations: [{ physicalLocation: { artifactLocation: { uri: opts.lockfile.path }, ...(line && { region: { startLine: line } }) } }],
        }),
      });
    }
  }
  return { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{ tool: { driver: { name: 'npm audit', informationUri: 'https://docs.npmjs.com/cli/commands/npm-audit', rules } }, results }] };
}
