/**
 * JSON Schemas for request validation and the OpenAPI document. Bodies reject
 * unknown properties; the server still trims and caps free text.
 */
import { AC_FORMATS, CLAIM_PACKS, AI_EFFORTS, AI_FINDINGS_ACTIONS, AI_PROVIDERS, AI_RUN_ON, DECISION_EFFECTS, DRIFT_REACTIONS, ISSUE_TYPES, SCHEDULE_MODES, SETTINGS_MODES, SEVERITY_ACTIONS, REQUIRE_FLAG, RELEASE_LINE_SOURCES } from '@ci/core';

const str = (maxLength: number, extra: object = {}) => ({ type: 'string', maxLength, ...extra }) as const;
const bool = { type: 'boolean' } as const;
const strings = { type: 'array', maxItems: 200, items: str(200) } as const;
const obj = <P extends Record<string, object>>(properties: P, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length && { required }) }) as const;

export const itemKeyParams = obj({ key: str(64, { pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*$' }) }, ['key']);
export const idParams = obj({ id: str(128, { minLength: 1 }) }, ['id']);

/** Settings are a partial update; the UI sends the whole object. */
export const settingsBody = obj({
  mode: { enum: SETTINGS_MODES },
  project: obj({ key: str(40), name: str(200), claimPack: { enum: CLAIM_PACKS } }),
  integrations: obj({
    jira: obj({
      enabled: bool,
      baseUrl: str(500),
      email: str(320),
      projectKey: str(40),
      acceptanceCriteriaField: str(100),
      storyPointsField: str(100),
      releaseLineSource: { enum: RELEASE_LINE_SOURCES },
      releaseLabelPrefix: str(50),
      releaseLineField: str(100),
      flagLabelPrefix: str(50),
      flagField: str(100),
      changeLabelPrefix: str(50),
      jqlFilter: str(4000),
      issueTypeMap: { type: 'object', maxProperties: 100, propertyNames: { minLength: 1, maxLength: 100, pattern: '\\S' }, additionalProperties: { enum: ISSUE_TYPES } },
    }),
    confluence: obj({ enabled: bool, baseUrl: str(500), email: str(320), spaceKeys: strings }),
    figma: obj({ enabled: bool, fileKeys: strings }),
    code: obj({ enabled: bool, reconstructionPath: str(1000), repoUrl: str(500, { pattern: '^(https://[^\\s]+)?$' }) }),
    tests: obj({ enabled: bool, reportsPath: str(1000) }),
  }),
  ai: obj({
    provider: { enum: AI_PROVIDERS },
    model: str(200),
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    effort: { enum: AI_EFFORTS },
    region: str(50),
    baseUrl: str(500),
    apiVersion: str(50),
    runOn: { enum: AI_RUN_ON },
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
    mode: { enum: SCHEDULE_MODES },
    intervalMinutes: { type: 'integer', minimum: 1, maximum: 10080 },
    onJiraChange: bool,
    onConfluenceChange: bool,
    onFigmaChange: bool,
  }),
  policy: obj({
    actions: obj({ critical: { enum: SEVERITY_ACTIONS }, warning: { enum: SEVERITY_ACTIONS }, info: { enum: SEVERITY_ACTIONS } }),
    disabledRules: strings,
    aiFindings: { enum: AI_FINDINGS_ACTIONS },
    driftReaction: { enum: DRIFT_REACTIONS },
    storyShape: obj({
      acFormat: { enum: AC_FORMATS },
      maxScenarios: { type: 'integer', minimum: 1, maximum: 50 },
      maxActions: { type: 'integer', minimum: 1, maximum: 20 },
      maxStoryPoints: { type: 'integer', minimum: 1, maximum: 100 },
    }),
    release: obj({
      maxMvpPercent: { type: 'integer', minimum: 1, maximum: 100 },
      requireFlag: { enum: REQUIRE_FLAG },
    }),
  }),
});

/** Limits on what a person types match what is stored; topic and question echo server text and are truncated. */
export const decisionBody = obj(
  {
    questionId: str(200, { minLength: 1 }),
    findingId: str(200),
    itemKey: str(64, { minLength: 1 }),
    topic: str(200),
    question: str(5000),
    answer: str(500),
    note: str(2000),
    decidedBy: str(200),
    by: str(200),
    effect: { enum: DECISION_EFFECTS },
    reason: str(2000),
    changeReason: str(2000),
  },
  ['questionId', 'itemKey', 'answer'],
);

export const approveBody = obj({ by: str(200), force: bool, reason: str(5000) });
/** DELETE bodies are optional. */
export const withdrawBody = { ...obj({ by: str(200), reason: str(5000) }), nullable: true } as const;

export const impactQuery = obj({ q: str(500) });

/** Which Atlassian site of the connection the analysis reads. */
export const atlassianSiteBody = obj({ cloudId: str(100, { minLength: 1 }) }, ['cloudId']);
/** What Atlassian sends back to the callback; extra parameters are ignored, not refused. */
export const oauthCallbackQuery = { type: 'object', properties: { code: str(2000), state: str(200), error: str(200), error_description: str(2000) } } as const;

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

/** The subset of JSON Schema that pruneToSchema understands. */
export interface JsonSchemaNode {
  type?: string;
  enum?: readonly unknown[];
  properties?: Readonly<Record<string, JsonSchemaNode>>;
  additionalProperties?: boolean | JsonSchemaNode;
  propertyNames?: JsonSchemaNode;
  maxProperties?: number;
  items?: JsonSchemaNode;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * Keeps only what `schema` accepts: unknown keys and invalid values are dropped
 * (returns undefined for an invalid value). Used to migrate settings saved by an
 * older version, so the UI can save them back without a 422.
 */
export function pruneToSchema(value: unknown, schema: JsonSchemaNode): unknown {
  if (schema.enum) return schema.enum.includes(value) ? value : undefined;
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const declared = schema.properties && Object.hasOwn(schema.properties, k) ? schema.properties[k] : undefined;
        const sub = declared ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined);
        if (!sub || (schema.propertyNames && pruneToSchema(k, { type: 'string', ...schema.propertyNames }) === undefined)) continue;
        const p = pruneToSchema(v, sub);
        if (p !== undefined) out[k] = p;
      }
      return schema.maxProperties && Object.keys(out).length > schema.maxProperties ? undefined : out;
    }
    case 'array': {
      const items = schema.items;
      return Array.isArray(value) && items ? value.map((v) => pruneToSchema(v, items)).filter((v) => v !== undefined).slice(0, schema.maxItems) : undefined;
    }
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
