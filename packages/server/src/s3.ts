import { createHash, createHmac } from 'node:crypto';

/**
 * A minimal S3 client for the backups (T5, docs/BACKUPS.md): Backblaze B2's S3-compatible API, signed with AWS
 * Signature Version 4, without an SDK. Only what the backups need: put an object locked until a date, get one,
 * list keys under a prefix.
 */

export interface S3Config {
  /** e.g. https://s3.eu-central-003.backblazeb2.com (the bucket's "Endpoint" in B2, with https://). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

type Fetch = typeof fetch;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
/** RFC 3986, as SigV4 wants it: everything but unreserved characters escaped. */
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (key: string) => key.split('/').map(encode).join('/');

/** The region from a B2 endpoint (`s3.<region>.backblazeb2.com`), else `undefined`. */
export function regionFromEndpoint(endpoint: string): string | undefined {
  try {
    return /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(new URL(endpoint).hostname)?.[1];
  } catch {
    return undefined;
  }
}

/** The configuration from the environment; names what is missing, never a value. */
export function s3ConfigFrom(env: NodeJS.ProcessEnv): S3Config {
  const missing = ['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY'].filter((n) => !env[n]);
  if (missing.length) throw new Error(`Set ${missing.join(', ')} (from Backblaze B2; docs/BACKUPS.md).`);
  const raw = env.B2_ENDPOINT!;
  const endpoint = /^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`;
  const u = new URL(endpoint);
  // http only to this machine (a local stand-in for B2 when trying the scripts), never over a network.
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('B2_ENDPOINT must be https.');
  const region = env.B2_REGION || regionFromEndpoint(endpoint);
  if (!region) throw new Error('Set B2_REGION: it cannot be read from B2_ENDPOINT.');
  return { endpoint: endpoint.replace(/\/+$/, ''), region, bucket: env.B2_BUCKET!, accessKeyId: env.B2_KEY_ID!, secretAccessKey: env.B2_APPLICATION_KEY! };
}

export interface SignInput {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  at: Date;
}

/** Signature Version 4: the request's headers plus `x-amz-date`, `x-amz-content-sha256` and `authorization`. */
export function signV4(i: SignInput): Record<string, string> {
  const amzDate = i.at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...i.headers, host: i.url.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': i.payloadHash };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]));
  const query = [...i.url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = [i.method, i.url.pathname, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), i.payloadHash].join('\n');
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, date), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

const objectUrl = (c: S3Config, key: string) => new URL(`${c.endpoint}/${encode(c.bucket)}/${encodePath(key)}`);

async function send(c: S3Config, method: string, url: URL, body: Buffer | undefined, headers: Record<string, string>, fetchImpl: Fetch, at: Date) {
  const signed = signV4({ method, url, headers, payloadHash: sha256(body ?? ''), region: c.region, service: 's3', accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, at });
  // fetch sets Host itself (to the same value that was signed) and refuses to be given it.
  const { host: _host, ...sent } = signed;
  const res = await fetchImpl(url, { method, headers: sent, body, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    // The S3 error code only (e.g. AccessDenied, InvalidRequest): the body may echo request details.
    const code = /<Code>([^<]{1,64})<\/Code>/.exec(await res.text().catch(() => ''))?.[1] ?? 'no code';
    throw new Error(`${method} ${url.pathname} failed: HTTP ${res.status} (${code})`);
  }
  return res;
}

/**
 * Puts an object locked in compliance mode until `retainUntil`: nobody, the key's owner included, can delete or
 * overwrite that version before then. The bucket must have Object Lock enabled.
 */
export async function putLockedObject(c: S3Config, key: string, body: Buffer, retainUntil: Date, fetchImpl: Fetch = fetch, at = new Date()) {
  await send(
    c,
    'PUT',
    objectUrl(c, key),
    body,
    {
      'content-type': 'application/octet-stream',
      'content-md5': createHash('md5').update(body).digest('base64'),
      'x-amz-object-lock-mode': 'COMPLIANCE',
      'x-amz-object-lock-retain-until-date': retainUntil.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
    fetchImpl,
    at,
  );
}

export async function getObject(c: S3Config, key: string, fetchImpl: Fetch = fetch, at = new Date()): Promise<Buffer> {
  const res = await send(c, 'GET', objectUrl(c, key), undefined, {}, fetchImpl, at);
  return Buffer.from(await res.arrayBuffer());
}

/** Keys under a prefix (up to 1000, enough for the backups' naming). */
export async function listKeys(c: S3Config, prefix: string, fetchImpl: Fetch = fetch, at = new Date()): Promise<string[]> {
  const url = new URL(`${c.endpoint}/${encode(c.bucket)}`);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('prefix', prefix);
  const xml = await (await send(c, 'GET', url, undefined, {}, fetchImpl, at)).text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}
