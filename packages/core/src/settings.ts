import type { AiProviderConfig } from './ai/providers.js';
import type { IssueType } from './model.js';
import type { AnalysisPolicy } from './policy.js';

/** Workspace settings, shared by the server (storage, validation) and the UI. Secrets are never part of it. */
export const SETTINGS_MODES = ['demo', 'live'] as const;
export const SCHEDULE_MODES = ['on_demand', 'interval', 'continuous'] as const;
export const AI_RUN_ON = ['every_analysis', 'on_demand'] as const;

export interface Settings {
  mode: (typeof SETTINGS_MODES)[number];
  project: { key: string; name: string };
  integrations: {
    jira: { enabled: boolean; baseUrl: string; email: string; projectKey: string; acceptanceCriteriaField?: string; storyPointsField?: string; jqlFilter?: string; issueTypeMap?: Record<string, IssueType> };
    confluence: { enabled: boolean; baseUrl: string; email: string; spaceKeys: string[] };
    figma: { enabled: boolean; fileKeys: string[] };
  };
  ai: AiProviderConfig & { runOn: (typeof AI_RUN_ON)[number] };
  security: {
    organizationManagedAi: boolean;
    redactPersonalData: boolean;
    maxCharsPerSource: number;
    localCacheOnly: boolean;
    encryptStoredContext: boolean;
    auditAiDecisions: boolean;
    recordEvidenceSources: boolean;
  };
  schedule: {
    mode: (typeof SCHEDULE_MODES)[number];
    intervalMinutes: number;
    onJiraChange: boolean;
    onConfluenceChange: boolean;
    onFigmaChange: boolean;
  };
  policy: AnalysisPolicy;
}

/** A partial update: every nested field optional, arrays replaced whole. */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
