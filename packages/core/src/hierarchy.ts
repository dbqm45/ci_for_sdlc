import type { IssueType, RequirementItem } from './model.js';

/** Jira issue type name (any case) → hierarchy level (P1). */
export type IssueTypeMap = Record<string, IssueType>;

const LEVELS: readonly IssueType[] = ['epic', 'feature', 'story', 'task', 'subtask', 'bug'];
const isIssueType = (v: unknown): v is IssueType => (LEVELS as readonly unknown[]).includes(v);

/** Used when the Jira project has no custom mapping. Without a Feature type the hierarchy stays epic → story. */
export const DEFAULT_ISSUE_TYPE_MAP: IssueTypeMap = {
  epic: 'epic',
  feature: 'feature',
  story: 'story',
  bug: 'bug',
  task: 'task',
  'sub-task': 'subtask',
  subtask: 'subtask',
};

/** Resolve a Jira issue type: configured mapping first, then defaults and name heuristics; anything else is a story. */
export function resolveIssueType(name: string, opts: { subtask?: boolean } = {}, map: Record<string, string> = {}): IssueType {
  if (opts.subtask) return 'subtask';
  const n = name.trim().toLowerCase();
  const custom = Object.entries(map).find(([k]) => k.trim().toLowerCase() === n)?.[1];
  if (isIssueType(custom)) return custom;
  if (Object.hasOwn(DEFAULT_ISSUE_TYPE_MAP, n)) return DEFAULT_ISSUE_TYPE_MAP[n];
  return n.includes('epic') ? 'epic' : n.includes('bug') ? 'bug' : n.includes('task') ? 'task' : 'story';
}

/** Stories (and bugs) under an epic or feature, following features down to their stories. */
export function workItemsUnder(childrenOf: Map<string, RequirementItem[]>, key: string, seen = new Set<string>()): RequirementItem[] {
  if (seen.has(key)) return [];
  seen.add(key);
  return (childrenOf.get(key) ?? []).flatMap((c) => (c.type === 'story' ? [c] : c.type === 'feature' ? workItemsUnder(childrenOf, c.key, seen) : []));
}
