import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, renderUserPrompt, type SemanticAnalyzer, type SemanticChallenge, type SemanticFinding, type SemanticInput, type SemanticOutput } from './types.js';
import { isRecord, isStringArray, oneOf } from '../guards.js';

/**
 * Organization-selectable AI provider. Secrets (API keys) are never part of
 * the persisted config — they come from the environment of the server.
 */
export const AI_PROVIDERS = ['none', 'anthropic', 'bedrock', 'openai', 'azure-openai', 'custom'] as const;
export type AiProviderKind = (typeof AI_PROVIDERS)[number];

export const AI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface AiProviderConfig {
  provider: AiProviderKind;
  model: string;
  /** Only used by OpenAI-compatible providers; current Claude models do not accept sampling params. */
  temperature?: number;
  /** Claude effort level (low…max). */
  effort?: AiEffort;
  /** Bedrock region. */
  region?: string;
  /** OpenAI-compatible base URL (custom endpoint / Azure resource endpoint). */
  baseUrl?: string;
  /** Azure OpenAI API version. */
  apiVersion?: string;
}

export interface AiSecrets {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  azureOpenaiApiKey?: string;
  customApiKey?: string;
}

export const DEFAULT_MODELS: Record<AiProviderKind, string> = {
  none: '',
  anthropic: 'claude-opus-5-5',
  bedrock: 'anthropic.claude-opus-5-5',
  openai: 'gpt-5',
  'azure-openai': '',
  custom: '',
};

// Models that support the server-side refusal fallback ("fallbacks": "default") on the Claude API.
const SERVER_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export function createSemanticAnalyzer(cfg: AiProviderConfig, secrets: AiSecrets = {}): SemanticAnalyzer | undefined {
  switch (cfg.provider) {
    case 'none':
      return undefined;
    case 'anthropic':
      return new ClaudeAnalyzer('anthropic', cfg, new Anthropic(secrets.anthropicApiKey ? { apiKey: secrets.anthropicApiKey } : {}));
    case 'bedrock':
      return new ClaudeAnalyzer('bedrock', cfg, new AnthropicBedrockMantle({ awsRegion: cfg.region }) as unknown as Anthropic);
    case 'openai':
      return new OpenAICompatibleAnalyzer('openai', cfg, 'https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${secrets.openaiApiKey ?? ''}` });
    case 'azure-openai': {
      const base = (cfg.baseUrl ?? '').replace(/\/$/, '');
      const url = `${base}/openai/deployments/${encodeURIComponent(cfg.model)}/chat/completions?api-version=${cfg.apiVersion ?? '2024-10-21'}`;
      return new OpenAICompatibleAnalyzer('azure-openai', cfg, url, { 'api-key': secrets.azureOpenaiApiKey ?? '' });
    }
    case 'custom': {
      const base = (cfg.baseUrl ?? '').replace(/\/$/, '');
      return new OpenAICompatibleAnalyzer('custom', cfg, `${base}/chat/completions`, secrets.customApiKey ? { Authorization: `Bearer ${secrets.customApiKey}` } : {});
    }
  }
}

class ClaudeAnalyzer implements SemanticAnalyzer {
  readonly model: string;
  constructor(
    readonly provider: 'anthropic' | 'bedrock',
    private cfg: AiProviderConfig,
    private client: Anthropic,
  ) {
    this.model = cfg.model || DEFAULT_MODELS[provider];
  }

  async analyze(input: SemanticInput): Promise<SemanticOutput> {
    const useFallback = this.provider === 'anthropic' && SERVER_FALLBACK_MODELS.has(this.model);
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: renderUserPrompt(input) }],
      output_config: { effort: this.cfg.effort ?? 'high', format: { type: 'json_schema', schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (response.stop_reason === 'refusal') throw new Error('The model declined to analyze this item (refusal).');
    if (response.stop_reason === 'max_tokens') throw new Error('The model response was cut off (max_tokens).');
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return parseOutput(text);
  }
}

class OpenAICompatibleAnalyzer implements SemanticAnalyzer {
  readonly model: string;
  constructor(
    readonly provider: string,
    private cfg: AiProviderConfig,
    private url: string,
    private headers: Record<string, string>,
  ) {
    this.model = cfg.model || DEFAULT_MODELS[cfg.provider];
  }

  async analyze(input: SemanticInput): Promise<SemanticOutput> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify({
        model: this.model,
        temperature: this.cfg.temperature ?? 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: renderUserPrompt(input) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'specification_review', strict: true, schema: OUTPUT_SCHEMA } },
      }),
    });
    if (!res.ok) throw new Error(`${this.provider} request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseOutput(json.choices?.[0]?.message?.content ?? '');
  }
}

export function parseOutput(text: string): SemanticOutput {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI response did not contain JSON');
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (!isRecord(parsed)) return { findings: [], challenges: [] };
  // Strict structured output is not available on every provider; items off the schema are dropped.
  return {
    findings: Array.isArray(parsed.findings) ? parsed.findings.filter(isSemanticFinding) : [],
    challenges: Array.isArray(parsed.challenges) ? parsed.challenges.filter(isSemanticChallenge) : [],
  };
}

const FINDING_PROPS = OUTPUT_SCHEMA.properties.findings.items.properties;

const isQuestion = (v: unknown): v is NonNullable<SemanticFinding['question']> => isRecord(v) && typeof v.text === 'string' && isStringArray(v.options) && typeof v.topic === 'string';

function isSemanticFinding(v: unknown): v is SemanticFinding {
  return (
    isRecord(v) &&
    oneOf(FINDING_PROPS.category.enum, v.category) &&
    oneOf(FINDING_PROPS.severity.enum, v.severity) &&
    oneOf(FINDING_PROPS.dimension.enum, v.dimension) &&
    typeof v.title === 'string' &&
    typeof v.explanation === 'string' &&
    Array.isArray(v.evidence) &&
    v.evidence.every((e) => isRecord(e) && typeof e.ref === 'string' && typeof e.quote === 'string') &&
    (v.question === undefined || isQuestion(v.question))
  );
}

const isSemanticChallenge = (v: unknown): v is SemanticChallenge =>
  isRecord(v) && typeof v.question === 'string' && typeof v.rationale === 'string' && isStringArray(v.options) && typeof v.topic === 'string';
