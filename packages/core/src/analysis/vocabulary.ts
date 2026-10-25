import type { Journey, UiState } from '../model.js';

/**
 * Deterministic vocabulary used by the rules engine. Every pattern is a
 * regular expression evaluated case-insensitively against plain text.
 * Keeping this in one place makes the "linting" behaviour auditable.
 */

export const STATE_PATTERNS: Record<UiState, RegExp> = {
  idle: /\b(idle|initial state|default state)\b/i,
  loading: /\b(loading|spinner|skeleton|submitting|in progress|progress indicator|disabled while)\b/i,
  processing: /\b(processing|pending|awaiting confirmation|being processed|in[- ]flight|polling)\b/i,
  success: /\b(success|successful|succeeds|confirmation screen|confirmed|completed|saved|done screen)\b/i,
  validation_error: /\b(validation|invalid|inline error|field error|required field|incorrect format|wrong format)\b/i,
  server_error: /\b(server error|http 5\d\d|5\d\d|internal error|service unavailable|error (?:state|screen|message|page)|generic error|something went wrong|failure (?:state|screen)|fails|failed|declined)\b/i,
  timeout: /\b(time[- ]?outs?|timed out|does not respond|no response|not respond)\b/i,
  retry: /\b(retry|retries|retried|try again|re-?attempt)\b/i,
  empty: /\b(empty state|no items|no results|nothing (?:to show|here)|no saved|zero state)\b/i,
  confirmation: /\b(confirm(?:ation)? (?:dialog|modal|prompt|step)|are you sure|confirm deletion|asks? (?:the user )?to confirm|undo)\b/i,
  session_expired: /\b(session (?:expir|timeout|ends)|session expired|logged out|re-?authenticat|token expir)\w*/i,
  network_failure: /\b(network (?:failure|error|loss)|offline|no connection|connection (?:lost|error)|disconnect)\w*/i,
  permission_denied: /\b(permission denied|not authori[sz]ed|forbidden|403|insufficient (?:rights|permissions)|access denied)\b/i,
};

export const STATE_LABELS: Record<UiState, string> = {
  idle: 'Idle',
  loading: 'Loading / Submitting',
  processing: 'Processing',
  success: 'Success',
  validation_error: 'Validation error',
  server_error: 'Server error',
  timeout: 'Timeout',
  retry: 'Retry',
  empty: 'Empty',
  confirmation: 'Confirmation',
  session_expired: 'Session expired',
  network_failure: 'Network failure',
  permission_denied: 'Permission denied',
};

/** Design-side detection is stricter: frame / layer names are short labels. */
export const DESIGN_STATE_PATTERNS: Record<UiState, RegExp> = {
  idle: /\b(idle|default|initial)\b/i,
  loading: /\b(loading|spinner|skeleton|submitting|progress)\b/i,
  processing: /\b(processing|pending|polling|in progress)\b/i,
  success: /\b(success|confirmed|completed|done|saved)\b/i,
  validation_error: /\b(validation|invalid|field error|inline error)\b/i,
  server_error: /\b(error|failed|failure|declined|500)\b/i,
  timeout: /\b(time[- ]?out|timed out)\b/i,
  retry: /\b(retry|try again)\b/i,
  empty: /\b(empty|no items|no results|zero state|no saved)\b/i,
  confirmation: /\b(confirm|are you sure|modal - delete|delete dialog)\b/i,
  session_expired: /\b(session expired|logged out|sign in again)\b/i,
  network_failure: /\b(offline|no connection|network)\b/i,
  permission_denied: /\b(permission|forbidden|no access|not authori[sz]ed)\b/i,
};

/** Traits — properties of a feature that imply required behaviour. */
export type Trait =
  | 'network'
  | 'async'
  | 'retry'
  | 'payment'
  | 'destructive'
  | 'form'
  | 'list'
  | 'authenticated'
  | 'upload'
  | 'time_bound'
  | 'concurrent';

export const TRAIT_PATTERNS: Record<Trait, RegExp> = {
  network: /\b(api|server|backend|services?|submit\w*|save|saves|saving|load|loads|loading|fetch\w*|requests?|endpoints?|send\w*|sync\w*|upload\w*|delet\w*|remov\w*|update\w*)\b/i,
  async: /\b(async(?:hronous)?|processing|webhook|queue|polling|eventually|background job|callback|202 accepted|pending)\b/i,
  retry: /\b(retry|retries|retried|try again|re-?attempt)\b/i,
  payment: /\b(payment|charge|card|refund|billing|invoice|pay)\w*/i,
  destructive: /\b(delete|remove|cancel(?:lation)?|revoke|unlink|deactivate|archive)\w*/i,
  form: /\b(form|input|enter|field|card number|cvv|expiry|validate|validation)\w*/i,
  list: /\b(list|saved (?:cards|methods|items)|overview of|all (?:cards|items))\b/i,
  authenticated: /\b(logged[- ]in|account|session|profile|sign[- ]in|authenticated|my )\w*/i,
  upload: /\b(upload|attachment|file)\w*/i,
  time_bound: /\b(time[- ]?outs?|timed out|within \d+ (?:seconds|minutes)|\d+ seconds)\b/i,
  concurrent: /\b(another user|concurrent|simultaneous|at the same time|other device|twice|double)\b/i,
};

export const TRAIT_LABELS: Record<Trait, string> = {
  network: 'Network operation',
  async: 'Asynchronous processing',
  retry: 'Retry behaviour',
  payment: 'Payment / money movement',
  destructive: 'Destructive action',
  form: 'User input / form',
  list: 'List / collection',
  authenticated: 'Authenticated context',
  upload: 'File upload',
  time_bound: 'Time-bound operation',
  concurrent: 'Concurrency',
};

/** Words that make acceptance criteria untestable. */
export const VAGUE_TERMS: { pattern: RegExp; hint: string }[] = [
  { pattern: /\b(fast|quick(?:ly)?|immediately|instant(?:ly)?|real[- ]time)\b/i, hint: 'define a measurable latency (e.g. p95 < 2 s)' },
  { pattern: /\b(user[- ]friendly|intuitive|easy|simple|nice|clean)\b/i, hint: 'describe observable behaviour instead of a quality' },
  { pattern: /\b(appropriate(?:ly)?|properly|correctly|reasonable|suitable|adequate)\b/i, hint: 'state exactly what "appropriate" means' },
  { pattern: /\b(etc\.?|and so on|and more|or similar)\b/i, hint: 'list all cases explicitly' },
  { pattern: /\b(some|several|many|a few|multiple)\b/i, hint: 'give an exact number or limit' },
  { pattern: /\b(handle(?:s|d)? (?:the |all )?errors?|error handling)\b/i, hint: 'enumerate which errors and what the user sees' },
  { pattern: /\b(if needed|as needed|when necessary|if possible|tbd|to be defined|later)\b/i, hint: 'resolve the open condition' },
  { pattern: /\b(should|may|might|could)\b/i, hint: 'use "must" for requirements; "should/may" is not testable' },
];

export const JOURNEY_LABELS: Record<Journey, string> = {
  happy_path: 'Happy path',
  validation_error: 'Validation error',
  server_error: 'Server error',
  timeout: 'Timeout',
  retry: 'Retry',
  session_expired: 'Session expired',
  network_failure: 'Network failure',
  permission_denied: 'Permission denied',
  empty_state: 'Empty state',
  cancel: 'Cancel / leave flow',
};

export const JOURNEY_PATTERNS: Record<Journey, RegExp> = {
  happy_path: STATE_PATTERNS.success,
  validation_error: STATE_PATTERNS.validation_error,
  server_error: /\b(server error|http 5\d\d|5\d\d|internal error|service unavailable|error state|something went wrong|fails?|failed|declined|failure)\b/i,
  timeout: STATE_PATTERNS.timeout,
  retry: STATE_PATTERNS.retry,
  session_expired: STATE_PATTERNS.session_expired,
  network_failure: STATE_PATTERNS.network_failure,
  permission_denied: STATE_PATTERNS.permission_denied,
  empty_state: STATE_PATTERNS.empty,
  cancel: /\b(cancel|leave|close the (?:screen|page|modal)|navigate away|back button|abandon)\w*/i,
};

/** Doc labels / phrases that mark content as stale. */
export const OUTDATED_PATTERNS = /\b(deprecated|obsolete|legacy|superseded by|no longer (?:valid|used|applies)|archived|outdated|old version|v1 \(old\))\b/i;

// ---------------------------------------------------------------------------- story shape (pdi contract 0.4.0)
// From contract/fixtures/story-shape/vocabulary.json; GWT keywords live with the parser (acceptance.ts).

/** AC-002: results that are not an observable state (substring, any case). */
export const WEAK_RESULTS = ['poprawnie', 'prawidłowo', 'działa', 'jest obsłużon', 'bez problemów', 'zgodnie z oczekiwaniami', 'correctly', 'properly', 'works', 'is handled', 'as expected', 'without issues'];

/** STORY-003: a title starting with one of these words names a layer, not a user outcome. */
export const LAYER_TERMS = {
  caseSensitive: ['BE', 'FE', 'API', 'DB'],
  caseInsensitive: ['backend', 'frontend', 'endpoint', 'migracja', 'migration', 'tabela', 'table', 'schema', 'schemat'],
};

/** STORY-001: conjunctions that join actions (only between verbs) in a title or a goal. */
export const ACTION_CONJUNCTIONS = { pl: ['i', 'oraz', 'lub', 'albo'], en: ['and', 'or'] };

/** AC-003: implementation detail in a criterion. */
export const IMPLEMENTATION_TERMS: { category: string; pattern: RegExp }[] = [
  { category: 'provider', pattern: /\b(Stripe|Supabase|Vercel|Cloudflare|AWS|Azure|GCP|Google Cloud|Firebase|OpenAI|Anthropic|Netlify|Heroku|PostgreSQL|Postgres|MySQL|MongoDB|Redis|Kafka|RabbitMQ|Elasticsearch|React|Angular|Vue|Next\.js|Django|Spring|Laravel|Rails|Auth0|Clerk|Twilio|SendGrid|Resend|S3)\w*/ },
  { category: 'data schema', pattern: /\(FK\)|\bFK\b|\bnullable\b|\b\w+_hash\b|\bsoft[- ]?delete\w*|\bmigracj\w*|\bmigration\w*|\bklucz\w* obc\w*|\bVARCHAR\b|\bforeign key\b/i },
  { category: 'data structure', pattern: /\btabel\w*|\btables?\b|\bkolumn\w*|\bcolumns?\b/i },
  { category: 'place of execution', pattern: /\bpo stronie (serwera|klienta|przeglądarki|backendu|frontendu)\b|\bserver[- ]side\b|\bclient[- ]side\b|\bna edge\w*|\bw cache\w*|\bw pamięci podręcznej\b/i },
  { category: 'mechanism', pattern: /\bper IP\b|\btoken bucket\b|\bsliding window\b|\bJWT\b|\bcron\w*/i },
  { category: 'protocol', pattern: /\b(WebSocket\w*|gRPC|GraphQL|webhook\w*|SSE|REST|MQTT)\b/ },
  { category: 'technical interface', pattern: /\bendpoint\w*/i },
];
