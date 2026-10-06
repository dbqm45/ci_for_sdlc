/**
 * JSON Schemas for request validation and the OpenAPI document. Bodies reject
 * unknown properties; the server still trims and caps free text.
 */
const str = (maxLength: number, extra: object = {}) => ({ type: 'string', maxLength, ...extra }) as const;
const bool = { type: 'boolean' } as const;
const strings = { type: 'array', maxItems: 200, items: str(200) } as const;
const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length && { required }) }) as const;

export const ISSUE_LEVELS = ['epic', 'feature', 'story', 'bug', 'task', 'subtask'] as const;

export const itemKeyParams = obj({ key: str(64, { pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*$' }) }, ['key']);
export const idParams = obj({ id: str(128, { minLength: 1 }) }, ['id']);

/** Settings are a partial update; the UI sends the whole object. */
export const settingsBody = obj({
  mode: { enum: ['demo', 'live'] },
  project: obj({ key: str(40), name: str(200) }),
  integrations: obj({
    jira: obj({
      enabled: bool,
      baseUrl: str(500),
      email: str(320),
      projectKey: str(40),
      acceptanceCriteriaField: str(100),
      jqlFilter: str(4000),
      issueTypeMap: { type: 'object', maxProperties: 100, propertyNames: { minLength: 1, maxLength: 100, pattern: '\\S' }, additionalProperties: { enum: ISSUE_LEVELS } },
    }),
    confluence: obj({ enabled: bool, baseUrl: str(500), email: str(320), spaceKeys: strings }),
    figma: obj({ enabled: bool, fileKeys: strings }),
  }),
  ai: obj({
    provider: { enum: ['none', 'anthropic', 'bedrock', 'openai', 'azure-openai', 'custom'] },
    model: str(200),
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    effort: { enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
    region: str(50),
    baseUrl: str(500),
    apiVersion: str(50),
    runOn: { enum: ['every_analysis', 'on_demand'] },
  }),
  security: obj({
    organizationManagedAi: bool,
    redactPersonalData: bool,
    maxCharsPerSource: { type: 'integer', minimum: 100, maximum: 200000 },
    localCacheOnly: bool,
    encryptStoredContext: bool,
    auditAiDecisions: bool,
    recordEvidenceSources: bool,
  }),
  schedule: obj({
    mode: { enum: ['on_demand', 'interval', 'continuous'] },
    intervalMinutes: { type: 'integer', minimum: 1, maximum: 10080 },
    onJiraChange: bool,
    onConfluenceChange: bool,
    onFigmaChange: bool,
  }),
  policy: obj({
    actions: obj({ critical: { enum: ['block', 'notify', 'record'] }, warning: { enum: ['block', 'notify', 'record'] }, info: { enum: ['block', 'notify', 'record'] } }),
    disabledRules: strings,
    aiFindings: { enum: ['block', 'require_confirmation', 'notify'] },
    driftReaction: { enum: ['warn', 'review_required', 'invalidate'] },
  }),
});

export const decisionBody = obj(
  {
    questionId: str(200, { minLength: 1 }),
    findingId: str(200),
    itemKey: str(64, { minLength: 1 }),
    topic: str(200),
    question: str(5000),
    answer: str(5000),
    note: str(5000),
    decidedBy: str(200),
    by: str(200),
    effect: { enum: ['resolve', 'accept_risk', 'dismiss', 'confirm'] },
    reason: str(5000),
    changeReason: str(5000),
  },
  ['questionId', 'itemKey', 'answer'],
);

export const approveBody = obj({ by: str(200), force: bool, reason: str(5000) });
/** DELETE bodies are optional. */
export const withdrawBody = { ...obj({ by: str(200), reason: str(5000) }), nullable: true } as const;

export const impactQuery = obj({ q: str(500) });

export const problem = {
  $id: 'Problem',
  type: 'object',
  description: 'RFC 9457 problem details. 5xx responses carry a generic detail; the cause is in the server log.',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
  },
} as const;

const problemRef = { $ref: 'Problem#' };
/** Error responses documented for a route. */
export const errors = (...codes: number[]) => Object.fromEntries(codes.map((c) => [c, { ...problemRef, description: 'Problem details' }]));
export const MUTATION = { security: [{ adminToken: [] }] };

/**
 * Keeps only what `schema` accepts: unknown keys and invalid values are dropped
 * (returns undefined for an invalid value). Used to migrate settings saved by an
 * older version, so the UI can save them back without a 422.
 */
export function pruneToSchema(value: unknown, schema: any): unknown {
  if (schema.enum) return schema.enum.includes(value) ? value : undefined;
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const sub = schema.properties?.[k] ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined);
        if (!sub || (schema.propertyNames && pruneToSchema(k, { type: 'string', ...schema.propertyNames }) === undefined)) continue;
        const p = pruneToSchema(v, sub);
        if (p !== undefined) out[k] = p;
      }
      return schema.maxProperties && Object.keys(out).length > schema.maxProperties ? undefined : out;
    }
    case 'array':
      return Array.isArray(value) ? value.map((v) => pruneToSchema(v, schema.items)).filter((v) => v !== undefined).slice(0, schema.maxItems) : undefined;
    case 'string':
      return typeof value === 'string' && value.length <= (schema.maxLength ?? Infinity) && value.length >= (schema.minLength ?? 0) && (!schema.pattern || new RegExp(schema.pattern).test(value)) ? value : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value) && (schema.type === 'number' || Number.isInteger(value)) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity) ? value : undefined;
    default:
      return undefined;
  }
}
