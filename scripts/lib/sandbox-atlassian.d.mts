// Types for sandbox-atlassian.mjs, so the TypeScript seeder (packages/sandbox) reuses the same guard and client.

export declare const KEY: 'CITEST';
export declare const MARKER: '[ci-sandbox]';
export declare const BOT_TOKENS: { env: string; app: 'jira' | 'confluence'; role: 'read' | 'write' }[];

export interface Reply { status: number; ok: boolean; json: any }
export type Call = (method: string, url: string, opts?: { auth?: string; body?: unknown }) => Promise<Reply>;

export interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<{
    status: number;
    headers?: { get(name: string): string | null };
    text(): Promise<string>;
  }>;
}

export declare function parseSite(value: unknown): string | null;
export declare function checkSite(env: Record<string, string | undefined>): string[];
export declare function noConnectionHint(env: Record<string, string | undefined>): string;
export declare function basic(email: string, token: string): string;
export declare function redact(text: unknown, secrets: (string | undefined)[]): string;
export declare function hasMarker(text: unknown): boolean;
export declare function adfText(node: unknown): string;
export declare function client(opts: {
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  secrets?: (string | undefined)[];
}): Call;
export declare function gateway(app: 'jira' | 'confluence', cloudId: string): string;
export declare function cloudIdOf(call: Call, site: string): Promise<string>;
