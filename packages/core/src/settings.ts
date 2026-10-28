import type { AiProviderConfig } from './ai/providers.js';
import type { ClaimPackId, IssueType } from './model.js';
import type { AnalysisPolicy } from './policy.js';
import type { ReleaseLineSource } from './connectors/atlassian.js';

/** Workspace settings, shared by the server (storage, validation) and the UI. Secrets are never part of it. */
export const SETTINGS_MODES = ['demo', 'live'] as const;
export const SCHEDULE_MODES = ['on_demand', 'interval', 'continuous'] as const;
export const AI_RUN_ON = ['every_analysis', 'on_demand'] as const;

export interface Settings {
  mode: (typeof SETTINGS_MODES)[number];
  /** `claimPack`: the domain vocabulary of claims (CON-001 conflicts); optional in settings saved before it existed. */
  project: { key: string; name: string; claimPack?: ClaimPackId };
  integrations: {
    jira: { enabled: boolean; baseUrl: string; email: string; projectKey: string; acceptanceCriteriaField?: string; storyPointsField?: string; releaseLineSource?: ReleaseLineSource; releaseLabelPrefix?: string; releaseLineField?: string; flagLabelPrefix?: string; flagField?: string; changeLabelPrefix?: string; jqlFilter?: string; issueTypeMap?: Record<string, IssueType> };
    confluence: { enabled: boolean; baseUrl: string; email: string; spaceKeys: string[] };
    figma: { enabled: boolean; fileKeys: string[] };
    /** tf's reconstruction from code (`reconstruction.json`, connectors/reconstruction.ts), read from the server's disk. */
    code: { enabled: boolean; reconstructionPath: string; repoUrl?: string };
    /** Test results as JUnit XML (a file or a directory of them, connectors/tests.ts), read from the server's disk (G4). */
    tests: { enabled: boolean; reportsPath: string };
    /** An OpenAPI 3.x contract (a file or a directory of them, connectors/openapi.ts) on the server's disk; absent in older settings. */
    openapi?: { enabled: boolean; specPath: string };
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
