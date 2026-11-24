# Rhymvex Bot Office

Internal 3D isometric agency workspace for **Rhymvex** (software development & automation agency). Features a spacious 5-room human-scale Three.js studio (**Reception**, **Open Work Area** with 4 desks, **Glass Meeting Room** with live 3D whiteboard, **Content Studio**, and **Lounge**), corridor waypoint pathfinding for all four bots (**Lead Finder**, **Proposal Writer**, **Project Tracker**, **Content Creator**), collaborative cross-bot workflows, a **Needs me** approval/deliverable queue, `localStorage` persistence, and a typed runner boundary ready for server-side n8n integration on OCI.

---

## Local Development & Production Build

Requires **Node.js 20+**.

```bash
# 1. Install dependencies
npm install

# 2. Run local dev server (port 3000)
npm run dev

# 3. Run unit tests (navigation, approval rules, orchestrator & workflow runners)
npx tsx --test src/workflows/simulationRunner.test.ts src/workflows/collaboration.test.ts

# 4. Type-check & build production static bundle
npm run lint
npm run build

# 5. Preview the production bundle locally
npm run preview
```

---

## Architecture Separation (OCI & Codex Ready)

Bot navigation, workflow execution, approval rules, and saved records are strictly decoupled:

- **Bot Navigation & 3D Studio**: `src/scene/officeLayout.ts`, `src/scene/navigation.ts`, `src/scene/buildOfficeScene.ts` — waypoint graph, Dijkstra shortest-path corridor routing, smooth corner turning, live whiteboard texture, and camera pan/zoom/room-focus/follow-bot controls.
- **Approval & Automation Policy**: `src/workflows/approvalRules.ts` — classifies small, medium, final-deliverable, and high-impact jobs; enforces idempotent review keys so reloads never duplicate completed work or approval items; routes change requests back to the affected bot.
- **Workflow Orchestrator**: `src/workflows/orchestrator.ts` — drives both 3D bot presence/speech bubbles and workspace record persistence from the same workflow events.
- **Typed Workflow Runner Contract**: `src/workflows/runner.ts` (`WorkflowRunner`, `WorkflowRequest`, `WorkflowResult`, `WorkflowError`, `runMeetingBrief`, `executeApprovedAction`).
- **Local Simulation Implementation**: `src/workflows/simulationRunner.ts` (`LocalSimulationRunner`) — runs locally without external credentials and labels every run as **Simulation**.
- **Single Swap Entry Point**: `src/workflows/index.ts` (`createWorkflowRunner()`).
- **Saved Workspace Persistence**: `src/state/workspaceStore.ts` — preserves all existing saved records in `localStorage` (`rhymvex_bot_office_state_v1`) and normalizes/deduplicates state safely across reloads.

### Handoff Steps for Codex / n8n Integration on OCI
1. Deploy a backend proxy service on OCI (e.g. `POST /api/workflows/:botId`, `POST /api/workflows/meeting`, `POST /api/workflows/approved-action`) that attaches n8n webhook credentials server-side and returns the exact `WorkflowResponse<TOutput>` shapes defined in `src/workflows/runner.ts`.
2. Add an `N8nHttpWorkflowRunner` class implementing `WorkflowRunner` (`mode = 'live'`) calling those endpoints.
3. Switch `createWorkflowRunner()` in `src/workflows/index.ts` when `import.meta.env.VITE_WORKFLOW_MODE === 'live'`.
4. Serve `dist/` via Nginx/Caddy on an OCI Compute VM (or OCI Object Storage + Load Balancer) with SPA fallback (`try_files $uri /index.html`).
