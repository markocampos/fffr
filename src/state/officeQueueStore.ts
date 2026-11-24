import type {
  AssignmentRecord,
  BotId,
  OfficeQueueState,
  PersistedSyncBatch,
  ResourceQueue,
  SpotReservation,
} from '../types/workspace';
import { DESK_WAITING_SPOTS, MEETING_SPOTS } from '../scene/officeLayout';
import {
  getDeskNodeId,
  getDeskVisitorNodeId,
  getMeetingNodeId,
  NAV_NODES,
} from '../scene/navigation';

/**
 * Authoritative client-side simulation queue & spot reservation store.
 *
 * Scope: Rhymvex Bot Office is a browser-only simulation (no backend server).
 * All spot reservations, per-resource FIFO queues, meeting-chair allocations,
 * stale reservation cleanup, refresh reconciliation, and idempotent arrival
 * event deduplication live here and persist via WorkspaceState in localStorage.
 */

export function createInitialOfficeQueueState(): OfficeQueueState {
  return {
    version: 1,
    queues: {},
    completedEventKeys: [],
    activeSyncBatch: null,
  };
}

export function getVisitResourceId(hostBotId: BotId): string {
  return `visit:${hostBotId}`;
}

export function getDeskResourceId(botId: BotId): string {
  return `desk:${botId}`;
}

export const MEETING_ROOM_RESOURCE_ID = 'meeting-room';

function getResourceCapacity(resourceId: string): number {
  if (resourceId === MEETING_ROOM_RESOURCE_ID) return 4;
  return 1;
}

/**
 * Resolves a distinct, reachable navigation node for a granted reservation.
 * Meeting room participants always receive their own dedicated chair node.
 */
export function resolvePrimaryNodeForResource(
  resourceId: string,
  botId: BotId
): string {
  if (resourceId === MEETING_ROOM_RESOURCE_ID) {
    return getMeetingNodeId(botId);
  }
  if (resourceId.startsWith('visit:')) {
    const hostId = resourceId.slice('visit:'.length) as BotId;
    return getDeskVisitorNodeId(hostId);
  }
  if (resourceId.startsWith('desk:')) {
    const ownerId = resourceId.slice('desk:'.length) as BotId;
    return getDeskNodeId(ownerId);
  }
  if (NAV_NODES[resourceId]) {
    return resourceId;
  }
  return getDeskNodeId(botId);
}

/**
 * Resolves a distinct, reachable waiting node for a queued employee (1-based index).
 * Guarantees zero overlap with the primary interaction spot or other queued coworkers.
 */
export function resolveWaitingNodeForResource(
  resourceId: string,
  queuePosition: number
): string {
  if (resourceId.startsWith('visit:')) {
    const hostId = resourceId.slice('visit:'.length) as BotId;
    const spots = DESK_WAITING_SPOTS[hostId];
    if (spots && spots.length > 0) {
      const idx = Math.max(0, Math.min(spots.length - 1, queuePosition - 1));
      return spots[idx].nodeId;
    }
  }
  if (resourceId.startsWith('desk:')) {
    const ownerId = resourceId.slice('desk:'.length) as BotId;
    const spots = DESK_WAITING_SPOTS[ownerId];
    if (spots && spots.length > 0) {
      const idx = Math.max(0, Math.min(spots.length - 1, queuePosition - 1));
      return spots[idx].nodeId;
    }
  }
  if (resourceId === MEETING_ROOM_RESOURCE_ID) {
    return 'corridor:north';
  }
  return 'corridor:hub';
}

function getOrCreateQueue(
  queues: Record<string, ResourceQueue>,
  resourceId: string
): ResourceQueue {
  const existing = queues[resourceId];
  if (existing) {
    return {
      ...existing,
      active: [...existing.active],
      waiting: [...existing.waiting],
    };
  }
  return {
    resourceId,
    capacity: getResourceCapacity(resourceId),
    active: [],
    waiting: [],
  };
}

/** Recomputes waiting positions (1..N) and distinct waiting node IDs cleanly. */
function reindexWaitingList(queue: ResourceQueue): ResourceQueue {
  return {
    ...queue,
    waiting: queue.waiting.map((res, idx) => {
      const pos = idx + 1;
      return {
        ...res,
        status: 'queued',
        queuePosition: pos,
        assignedNodeId: resolveWaitingNodeForResource(queue.resourceId, pos),
      };
    }),
  };
}

/** Promotes waiting reservations into open slots atomically. */
function promoteAvailableWaiters(
  queue: ResourceQueue,
  nowMs: number
): { queue: ResourceQueue; promoted: SpotReservation[] } {
  const nextActive = [...queue.active];
  const nextWaiting = [...queue.waiting];
  const promoted: SpotReservation[] = [];

  while (nextActive.length < queue.capacity && nextWaiting.length > 0) {
    const candidate = nextWaiting.shift()!;
    const granted: SpotReservation = {
      ...candidate,
      status: 'granted',
      queuePosition: 0,
      assignedNodeId: resolvePrimaryNodeForResource(
        queue.resourceId,
        candidate.botId
      ),
      grantedAtMs: nowMs,
    };
    nextActive.push(granted);
    promoted.push(granted);
  }

  return {
    queue: reindexWaitingList({
      ...queue,
      active: nextActive,
      waiting: nextWaiting,
    }),
    promoted,
  };
}

export interface RequestSpotInput {
  resourceId: string;
  botId: BotId;
  assignmentId: string;
  purpose: string;
  nowMs?: number;
}

export interface RequestSpotResult {
  state: OfficeQueueState;
  reservation: SpotReservation;
  wasDuplicate: boolean;
}

/**
 * Atomically requests a reservation on a single resource queue.
 * - If this bot already holds or is queued for this exact resource + assignment, returns existing (idempotent).
 * - If this bot held a stale reservation on a DIFFERENT resource for a different purpose, releases it if requested.
 * - Grants immediately if capacity allows; otherwise queues in FIFO order with a distinct reachable waiting spot.
 */
export function requestSpot(
  state: OfficeQueueState,
  input: RequestSpotInput
): RequestSpotResult {
  const nowMs = input.nowMs ?? Date.now();
  const queue = getOrCreateQueue(state.queues, input.resourceId);

  // Idempotent lookup: already active or queued for this resource
  const existingActive = queue.active.find(
    (r) => r.botId === input.botId && r.assignmentId === input.assignmentId
  );
  if (existingActive) {
    return { state, reservation: existingActive, wasDuplicate: true };
  }
  const existingWaiting = queue.waiting.find(
    (r) => r.botId === input.botId && r.assignmentId === input.assignmentId
  );
  if (existingWaiting) {
    return { state, reservation: existingWaiting, wasDuplicate: true };
  }

  // Also prevent same bot occupying two slots in the same queue across assignments
  const sameBotActive = queue.active.find((r) => r.botId === input.botId);
  if (sameBotActive) {
    return { state, reservation: sameBotActive, wasDuplicate: true };
  }

  const reservationId = `res-${input.resourceId}-${input.botId}-${input.assignmentId}`;

  // Meeting-room chair uniqueness check
  if (
    input.resourceId === MEETING_ROOM_RESOURCE_ID &&
    !MEETING_SPOTS[input.botId]
  ) {
    throw new Error(`No meeting chair configured for ${input.botId}`);
  }

  let reservation: SpotReservation;
  if (queue.active.length < queue.capacity) {
    reservation = {
      id: reservationId,
      resourceId: input.resourceId,
      botId: input.botId,
      assignmentId: input.assignmentId,
      status: 'granted',
      assignedNodeId: resolvePrimaryNodeForResource(
        input.resourceId,
        input.botId
      ),
      queuePosition: 0,
      purpose: input.purpose,
      requestedAtMs: nowMs,
      grantedAtMs: nowMs,
    };
    queue.active.push(reservation);
  } else {
    const queuePosition = queue.waiting.length + 1;
    reservation = {
      id: reservationId,
      resourceId: input.resourceId,
      botId: input.botId,
      assignmentId: input.assignmentId,
      status: 'queued',
      assignedNodeId: resolveWaitingNodeForResource(
        input.resourceId,
        queuePosition
      ),
      queuePosition,
      purpose: input.purpose,
      requestedAtMs: nowMs,
    };
    queue.waiting.push(reservation);
  }

  const nextState: OfficeQueueState = {
    ...state,
    queues: {
      ...state.queues,
      [input.resourceId]: reindexWaitingList(queue),
    },
  };

  // Return the re-indexed reservation reference
  const updatedQueue = nextState.queues[input.resourceId];
  const finalRes =
    updatedQueue.active.find((r) => r.id === reservationId) ??
    updatedQueue.waiting.find((r) => r.id === reservationId) ??
    reservation;

  return { state: nextState, reservation: finalRes, wasDuplicate: false };
}

/**
 * Atomically processes multiple simultaneous spot requests (e.g., Content Creator + Project Tracker
 * approaching the Business Strategist at the same instant). Grants one in a single state transition
 * and assigns distinct reachable waiting spots to the rest.
 */
export function requestSimultaneousSpots(
  state: OfficeQueueState,
  requests: RequestSpotInput[]
): { state: OfficeQueueState; reservations: SpotReservation[] } {
  let cursor = state;
  const reservations: SpotReservation[] = [];
  for (const req of requests) {
    const res = requestSpot(cursor, req);
    cursor = res.state;
    reservations.push(res.reservation);
  }
  return { state: cursor, reservations };
}

/**
 * Reserves distinct meeting room chairs for all listed participants in a single operation.
 * Every participant gets their own unique chair node (`meeting:<botId>`).
 */
export function reserveMeetingChairs(
  state: OfficeQueueState,
  participants: BotId[],
  assignmentId: string,
  purpose: string,
  nowMs = Date.now()
): { state: OfficeQueueState; reservations: SpotReservation[] } {
  return requestSimultaneousSpots(
    state,
    participants.map((botId) => ({
      resourceId: MEETING_ROOM_RESOURCE_ID,
      botId,
      assignmentId,
      purpose,
      nowMs,
    }))
  );
}

/**
 * Releases a reservation by ID and automatically advances the queue for that resource.
 */
export function releaseSpot(
  state: OfficeQueueState,
  reservationId: string,
  nowMs = Date.now()
): { state: OfficeQueueState; promoted: SpotReservation[] } {
  let promotedAll: SpotReservation[] = [];
  const nextQueues: Record<string, ResourceQueue> = { ...state.queues };
  let changed = false;

  for (const [resourceId, q] of Object.entries(state.queues)) {
    const hadActive = q.active.some((r) => r.id === reservationId);
    const hadWaiting = q.waiting.some((r) => r.id === reservationId);
    if (!hadActive && !hadWaiting) continue;

    changed = true;
    const filtered: ResourceQueue = {
      ...q,
      active: q.active.filter((r) => r.id !== reservationId),
      waiting: q.waiting.filter((r) => r.id !== reservationId),
    };
    const { queue: updated, promoted } = promoteAvailableWaiters(
      filtered,
      nowMs
    );
    nextQueues[resourceId] = updated;
    promotedAll = [...promotedAll, ...promoted];
  }

  if (!changed) return { state, promoted: [] };

  return {
    state: {
      ...state,
      queues: nextQueues,
    },
    promoted: promotedAll,
  };
}

/**
 * Releases all active or queued reservations held by a specific employee (e.g. on reassignment)
 * and automatically advances every affected resource queue.
 */
export function releaseBotReservations(
  state: OfficeQueueState,
  botId: BotId,
  options?: { keepResourceId?: string; nowMs?: number }
): { state: OfficeQueueState; promoted: SpotReservation[] } {
  const nowMs = options?.nowMs ?? Date.now();
  let promotedAll: SpotReservation[] = [];
  const nextQueues: Record<string, ResourceQueue> = { ...state.queues };
  let changed = false;

  for (const [resourceId, q] of Object.entries(state.queues)) {
    if (options?.keepResourceId && resourceId === options.keepResourceId) {
      continue;
    }
    const hadBot =
      q.active.some((r) => r.botId === botId) ||
      q.waiting.some((r) => r.botId === botId);
    if (!hadBot) continue;

    changed = true;
    const filtered: ResourceQueue = {
      ...q,
      active: q.active.filter((r) => r.botId !== botId),
      waiting: q.waiting.filter((r) => r.botId !== botId),
    };
    const { queue: updated, promoted } = promoteAvailableWaiters(
      filtered,
      nowMs
    );
    nextQueues[resourceId] = updated;
    promotedAll = [...promotedAll, ...promoted];
  }

  if (!changed) return { state, promoted: [] };

  return {
    state: {
      ...state,
      queues: nextQueues,
    },
    promoted: promotedAll,
  };
}

/**
 * Releases all stale reservations belonging to a cancelled or reassigned assignment
 * and advances any waiting employees behind them.
 */
export function cancelAssignmentReservations(
  state: OfficeQueueState,
  assignmentId: string,
  nowMs = Date.now()
): { state: OfficeQueueState; promoted: SpotReservation[] } {
  let promotedAll: SpotReservation[] = [];
  const nextQueues: Record<string, ResourceQueue> = { ...state.queues };
  let changed = false;

  for (const [resourceId, q] of Object.entries(state.queues)) {
    const hadMatch =
      q.active.some((r) => r.assignmentId === assignmentId) ||
      q.waiting.some((r) => r.assignmentId === assignmentId);
    if (!hadMatch) continue;

    changed = true;
    const filtered: ResourceQueue = {
      ...q,
      active: q.active.filter((r) => r.assignmentId !== assignmentId),
      waiting: q.waiting.filter((r) => r.assignmentId !== assignmentId),
    };
    const { queue: updated, promoted } = promoteAvailableWaiters(
      filtered,
      nowMs
    );
    nextQueues[resourceId] = updated;
    promotedAll = [...promotedAll, ...promoted];
  }

  const nextBatch =
    state.activeSyncBatch?.assignmentId === assignmentId
      ? null
      : state.activeSyncBatch;

  if (!changed && nextBatch === state.activeSyncBatch) {
    return { state, promoted: [] };
  }

  return {
    state: {
      ...state,
      queues: nextQueues,
      activeSyncBatch: nextBatch,
    },
    promoted: promotedAll,
  };
}

/**
 * Checks whether a deterministic arrival/submission/approval event key has already been processed.
 */
export function hasProcessedEvent(
  state: OfficeQueueState,
  eventKey: string
): boolean {
  return state.completedEventKeys.includes(eventKey);
}

/**
 * Idempotently records an arrival, submission, or approval event key.
 * A repeated arrival event NEVER submits work twice, repeats an approval, or restarts a completed task.
 */
export function recordIdempotentEvent(
  state: OfficeQueueState,
  eventKey: string
): { state: OfficeQueueState; alreadyProcessed: boolean } {
  if (state.completedEventKeys.includes(eventKey)) {
    return { state, alreadyProcessed: true };
  }
  const capped = [eventKey, ...state.completedEventKeys].slice(0, 200);
  return {
    state: {
      ...state,
      completedEventKeys: capped,
    },
    alreadyProcessed: false,
  };
}

/**
 * Reads a bot's active or queued reservation on a given resource, if any.
 */
export function getBotReservationForResource(
  state: OfficeQueueState,
  resourceId: string,
  botId: BotId
): SpotReservation | null {
  const q = state.queues[resourceId];
  if (!q) return null;
  return (
    q.active.find((r) => r.botId === botId) ??
    q.waiting.find((r) => r.botId === botId) ??
    null
  );
}

/**
 * Reconciles persisted reservations & queues on page refresh / reconnect:
 * 1. Keeps reservations belonging to an active persisted sync batch or still-running assignment.
 * 2. Drops stale reservations whose assignment already completed, was rejected, or no longer exists.
 * 3. Promotes queued waiters if an active slot cleared during reconciliation.
 * 4. Marks activeSyncBatch completed if all its tasks are already completed.
 */
export function reconcileQueueOnHydrate(
  rawQueue: OfficeQueueState | undefined,
  assignments: AssignmentRecord[],
  nowMs = Date.now()
): OfficeQueueState {
  if (!rawQueue || typeof rawQueue !== 'object') {
    return createInitialOfficeQueueState();
  }

  const completedEventKeys = Array.isArray(rawQueue.completedEventKeys)
    ? Array.from(
        new Set(
          rawQueue.completedEventKeys.filter(
            (k): k is string => typeof k === 'string' && k.length > 0
          )
        )
      ).slice(0, 200)
    : [];

  let activeSyncBatch: PersistedSyncBatch | null =
    rawQueue.activeSyncBatch &&
    typeof rawQueue.activeSyncBatch.id === 'string' &&
    Array.isArray(rawQueue.activeSyncBatch.tasks)
      ? {
          ...rawQueue.activeSyncBatch,
          tasks: rawQueue.activeSyncBatch.tasks.map((t) => {
            const doneKey = `sync-task-done:${rawQueue.activeSyncBatch!.id}:${t.id}`;
            if (completedEventKeys.includes(doneKey)) {
              return { ...t, status: 'completed' as const };
            }
            return t;
          }),
        }
      : null;

  if (
    activeSyncBatch &&
    activeSyncBatch.tasks.every((t) => t.status === 'completed') &&
    activeSyncBatch.independentTaskDone
  ) {
    activeSyncBatch = { ...activeSyncBatch, status: 'completed' };
  }

  const validAssignmentIds = new Set<string>();
  for (const a of assignments) {
    if (a.status === 'running' || a.status === 'revising') {
      validAssignmentIds.add(a.id);
    }
  }
  if (activeSyncBatch && activeSyncBatch.status === 'active') {
    validAssignmentIds.add(activeSyncBatch.assignmentId);
  }

  const nextQueues: Record<string, ResourceQueue> = {};
  const rawQueues = rawQueue.queues ?? {};

  for (const [resourceId, q] of Object.entries(rawQueues)) {
    if (!q || !Array.isArray(q.active) || !Array.isArray(q.waiting)) continue;

    // Filter out stale reservations for completed/unknown assignments or completed batch tasks
    const isReservationStillValid = (r: SpotReservation): boolean => {
      if (!validAssignmentIds.has(r.assignmentId)) return false;
      if (
        activeSyncBatch &&
        activeSyncBatch.assignmentId === r.assignmentId
      ) {
        const task = activeSyncBatch.tasks.find((t) => t.botId === r.botId);
        if (task && task.status === 'completed') return false;
      }
      return true;
    };

    const validActive = q.active.filter(isReservationStillValid);
    const validWaiting = q.waiting.filter(isReservationStillValid);

    const { queue: reconciled } = promoteAvailableWaiters(
      {
        resourceId,
        capacity: getResourceCapacity(resourceId),
        active: validActive,
        waiting: validWaiting,
      },
      nowMs
    );

    if (reconciled.active.length > 0 || reconciled.waiting.length > 0) {
      nextQueues[resourceId] = reconciled;
    }
  }

  return {
    version: 1,
    queues: nextQueues,
    completedEventKeys,
    activeSyncBatch:
      activeSyncBatch && activeSyncBatch.status === 'active'
        ? activeSyncBatch
        : null,
  };
}
