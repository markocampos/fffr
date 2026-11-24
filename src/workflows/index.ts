import type { WorkflowRunner } from './runner';
import { LocalSimulationRunner } from './simulationRunner';

export * from './runner';
export { LocalSimulationRunner } from './simulationRunner';

/**
 * Single integration entry point for workflow execution across Rhymvex Bot Office.
 *
 * To connect a server-side n8n runner later:
 * 1. Implement `WorkflowRunner` (e.g. `N8nHttpWorkflowRunner`) sending
 *    `WorkflowRequest` payloads to your backend route (`/api/workflows/:botId`).
 * 2. Swap the return value of `createWorkflowRunner()` below (e.g. via an env flag
 *    like `VITE_WORKFLOW_MODE=live`) without touching UI components.
 */
export function createWorkflowRunner(): WorkflowRunner {
  return new LocalSimulationRunner({ delayMs: 450 });
}

export const workflowRunner: WorkflowRunner = createWorkflowRunner();
