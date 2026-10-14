import { DEMO_SCENARIOS, demoProject, type ProjectContext } from '@ci/core';

/**
 * The base "Checkout" world (docs/TEST-DATA-GENERATOR.md, 5.2). For now it is the demo project, the same data the API
 * mocks serve, so the mocks, the demo mode and the sandbox describe one world. A fresh copy on every call: scenarios
 * change it in place.
 */
export function checkoutWorld(): ProjectContext {
  return demoProject();
}

/** The world after the given change scenarios, applied in order. */
export function worldAfter(...scenarioIds: string[]): ProjectContext {
  const world = checkoutWorld();
  for (const id of scenarioIds) {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario "${id}"`);
    scenario.apply(world);
  }
  return world;
}
