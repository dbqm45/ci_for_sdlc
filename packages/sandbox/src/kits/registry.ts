import type { ProjectContext } from '@ci/core';
import type { ScenarioSource } from '../world/scenarios.js';

/**
 * Kit registry (docs/TEST-DATA-GENERATOR.md, 5.3, check 2): for each source, where its objects sit in the world and
 * which API mock, contract test and seeder serve it. Paths are relative to the repository root.
 */
export interface KitInfo {
  id: ScenarioSource;
  /** The objects of this source in a world. */
  objects(world: ProjectContext): unknown[];
  /** API mock the tests run the real connector against. */
  mock: string;
  /** Contract test that reads the world back through the real connector and the mock. */
  contract: string;
  /** Seeder that writes the world to a live sandbox. */
  seeder: string;
  /** How the seeder writes: through the REST API or through a Figma plugin. */
  writeMode: 'rest' | 'plugin';
}

export const KITS: KitInfo[] = [
  {
    id: 'jira',
    objects: (w) => w.requirements,
    mock: 'packages/core/test/mocks/atlassian-mock.ts',
    contract: 'packages/core/test/atlassian-contract.test.ts',
    seeder: 'packages/sandbox/src/kits/jira.ts',
    writeMode: 'rest',
  },
  {
    id: 'confluence',
    objects: (w) => w.documents,
    mock: 'packages/core/test/mocks/atlassian-mock.ts',
    contract: 'packages/core/test/atlassian-contract.test.ts',
    seeder: 'packages/sandbox/src/kits/confluence.ts',
    writeMode: 'rest',
  },
  {
    id: 'figma',
    objects: (w) => w.frames,
    mock: 'packages/core/test/mocks/figma-mock.ts',
    contract: 'packages/core/test/figma-contract.test.ts',
    seeder: 'packages/sandbox/src/kits/figma.ts',
    writeMode: 'plugin',
  },
];
