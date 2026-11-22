import { randomBytes } from 'node:crypto';
import type { HumanQuestion } from '@ci/core';
import type { Engine } from './engine.js';
import { httpError, type Principal } from './http.js';
import type { Store } from './store.js';

export interface QuestionInput {
  text: string;
  link?: string;
  author: string;
  via?: HumanQuestion['via'];
}

/**
 * R1: one question on a work item, from the page (POST /items/:key/questions) or a chat app (POST /api/webhooks/channels).
 * 404 for an unknown item, 400 for an empty text or a link that is not http(s). A chat event seen before returns its
 * question again (`duplicate`), so a retried delivery never adds a second one.
 */
export async function addQuestion(store: Store, engine: Engine, itemKey: string, input: QuestionInput, audit: { actor: string; via?: Principal }) {
  const known = engine.state.result ?? (await engine.analyze('initial'));
  if (!known.items.some((i) => i.key === itemKey)) throw httpError(404, `No work item ${itemKey}`);
  const text = input.text.trim();
  if (!text) throw httpError(400, 'A question needs its text');
  const link = input.link?.trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) throw httpError(400, 'The link must be an http(s) address');
  if (input.via) {
    const seen = (await store.humanQuestions()).find((q) => q.via?.platform === input.via!.platform && q.via.event === input.via!.event);
    if (seen) return { question: seen, item: known.items.find((i) => i.key === seen.itemKey), duplicate: true };
  }
  const question: HumanQuestion = {
    id: `hq-${randomBytes(6).toString('hex')}`,
    itemKey,
    text,
    ...(link && { link }),
    author: input.author.trim().slice(0, 80) || 'anonymous',
    askedAt: new Date().toISOString(),
    accepted: false,
    ...(input.via && { via: input.via }),
  };
  await store.updateHumanQuestions((all) => [...all, question]);
  const from = input.via ? ` from ${input.via.platform}` : '';
  await store.audit({ at: question.askedAt, kind: 'question', ...audit, summary: `${itemKey}: question asked${from} (${question.id})` });
  const next = await engine.analyze(`question on ${itemKey}`);
  return { question, item: next.items.find((i) => i.key === itemKey), duplicate: false };
}

/** Settings of the DI Channels link (step 16): the shared signing secret and the public address for links back. */
export interface ChannelsOptions {
  /** Shared with di-channels; defaults to CI_CHANNELS_SIGNING_SECRET. Without it POST /api/webhooks/channels is 404. */
  secret?: string;
}

const SLACK_USER = /^[UW][A-Z0-9]{2,20}$/;
const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
const WORKSPACE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface ChannelQuestion {
  id: string;
  platform: 'slack';
  workspace?: string;
  item: string;
  text: string;
  link?: string;
  author: { name: string; user: string };
}

/** The body di-channels sends (docs/CHANNELS.md), or why it is not one. Never echoes what was sent. */
export function parseChannelQuestion(body: unknown): ChannelQuestion | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'The body must be a JSON object';
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  if (!str(b.id, 128) || !EVENT_ID.test(b.id as string)) return 'id: 1–128 letters, digits, ".", "_", ":" or "-"';
  if (b.platform !== 'slack') return 'platform: only "slack" is supported';
  if (b.workspace !== undefined && (!str(b.workspace, 40) || !WORKSPACE.test(b.workspace as string))) return 'workspace: not a workspace id';
  if (!str(b.item, 64) || !KEY.test(b.item as string)) return 'item: a work item key such as PAY-123';
  if (!str(b.text, 2000) || !(b.text as string).trim()) return 'text: 1–2000 characters';
  if (b.link !== undefined && !str(b.link, 500)) return 'link: at most 500 characters';
  const a = b.author as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object' || !str(a.name, 80) || !(a.name as string).trim() || !str(a.user, 24) || !SLACK_USER.test(a.user as string))
    return 'author: { name, user } with the Slack user id';
  const extra = Object.keys(b).filter((k) => !['id', 'platform', 'workspace', 'item', 'text', 'link', 'author'].includes(k));
  if (extra.length) return `Unknown fields: ${extra.slice(0, 5).join(', ')}`;
  return {
    id: b.id as string,
    platform: 'slack',
    ...(b.workspace !== undefined && { workspace: b.workspace as string }),
    item: b.item as string,
    text: b.text as string,
    ...(b.link !== undefined && { link: b.link as string }),
    author: { name: (a.name as string).trim(), user: a.user as string },
  };
}
