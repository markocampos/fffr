import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelAssignmentReservations,
  createInitialOfficeQueueState,
  getDeskResourceId,
  getVisitResourceId,
  hasProcessedEvent,
  reconcileQueueOnHydrate,
  recordIdempotentEvent,
  releaseSpot,
  requestSimultaneousSpots,
  requestSpot,
  reserveMeetingChairs,
} from './officeQueueStore';
import { createInitialWorkspaceState } from './seedDemo';
import { findNavigationPath, NAV_NODES } from '../scene/navigation';
import { runSimultaneousStrategistQueue } from '../workflows/queueCoordinator';
import type { BotActivityState, BotId, BotLivePresence, WorkspaceState } from '../types/workspace';

test('simultaneous requests for Strategist grant one atomically and give the other a distinct reachable waiting spot', () => {
  const initial = createInitialOfficeQueueState();
  const visitStrategist = getVisitResourceId('business-strategist');

  const { state, reservations } = requestSimultaneousSpots(initial, [
    {
      resourceId: visitStrategist,
      botId: 'content-creator',
      assignmentId: 'asgn-1',
      purpose: 'outreach intro check',
    },
    {
      resourceId: visitStrategist,
      botId: 'project-tracker',
      assignmentId: 'asgn-1',
      purpose: 'milestone check',
    },
  ]);

  assert.equal(reservations.length, 2);
  const contentRes = reservations.find((r) => r.botId === 'content-creator')!;
  const trackerRes = reservations.find((r) => r.botId === 'project-tracker')!;

  assert.equal(contentRes.status, 'granted');
  assert.equal(contentRes.assignedNodeId, 'visit:business-strategist');

  assert.equal(trackerRes.status, 'queued');
  assert.equal(trackerRes.queuePosition, 1);
  assert.equal(trackerRes.assignedNodeId, 'wait:business-strategist:1');
  assert.notEqual(trackerRes.assignedNodeId, contentRes.assignedNodeId);

  // Confirm waiting spot exists in navigation graph and is reachable from Tracker's desk
  assert.ok(NAV_NODES[trackerRes.assignedNodeId], 'Waiting spot must exist in NAV_NODES');
  const path = findNavigationPath('desk:project-tracker', trackerRes.assignedNodeId);
  assert.ok(path.length >= 2, 'Waiting spot must be reachable along walkable paths');
  assert.equal(path[path.length - 1].id, trackerRes.assignedNodeId);

  // Releasing Content Creator's spot automatically promotes Project Tracker
  const released = releaseSpot(state, contentRes.id);
  assert.equal(released.promoted.length, 1);
  assert.equal(released.promoted[0].botId, 'project-tracker');
  assert.equal(released.promoted[0].status, 'granted');
  assert.equal(released.promoted[0].assignedNodeId, 'visit:business-strategist');
  assert.equal(released.state.queues[visitStrategist].active.length, 1);
  assert.equal(released.state.queues[visitStrategist].waiting.length, 0);
});

test('separate per-resource queues prevent a busy Strategist from blocking Lead Finder at Desk 01', () => {
  const initial = createInitialOfficeQueueState();
  const visitStrategist = getVisitResourceId('business-strategist');
  const leadDesk = getDeskResourceId('lead-finder');

  const step1 = requestSimultaneousSpots(initial, [
    {
      resourceId: visitStrategist,
      botId: 'content-creator',
      assignmentId: 'asgn-2',
      purpose: 'copy check',
    },
    {
      resourceId: visitStrategist,
      botId: 'project-tracker',
      assignmentId: 'asgn-2',
      purpose: 'board check',
    },
  ]);

  const leadReq = requestSpot(step1.state, {
    resourceId: leadDesk,
    botId: 'lead-finder',
    assignmentId: 'asgn-2',
    purpose: 'independent lead verification',
  });

  assert.equal(leadReq.reservation.status, 'granted');
  assert.equal(leadReq.reservation.assignedNodeId, 'desk:lead-finder');
  assert.equal(leadReq.state.queues[visitStrategist].waiting.length, 1);
});

test('meeting room assigns each participant their own unique chair', () => {
  const initial = createInitialOfficeQueueState();
  const participants: BotId[] = [
    'lead-finder',
    'business-strategist',
    'project-tracker',
    'content-creator',
  ];

  const { state, reservations } = reserveMeetingChairs(
    initial,
    participants,
    'asgn-meeting',
    'Weekly review'
  );

  assert.equal(reservations.length, 4);
  const chairs = new Set(reservations.map((r) => r.assignedNodeId));
  assert.equal(chairs.size, 4, 'Every meeting participant must get a distinct chair');
  for (const res of reservations) {
    assert.equal(res.status, 'granted');
    assert.ok(NAV_NODES[res.assignedNodeId], `Chair node ${res.assignedNodeId} must exist`);
  }

  // Cancelling the assignment releases all stale reservations cleanly
  const cleaned = cancelAssignmentReservations(state, 'asgn-meeting');
  assert.equal(cleaned.state.queues['meeting-room']?.active.length ?? 0, 0);
  assert.equal(cleaned.state.queues['meeting-room']?.waiting.length ?? 0, 0);
});

test('idempotent event ledger blocks duplicate arrival submissions and approvals', () => {
  const initial = createInitialOfficeQueueState();
  const key = 'sync-task-done:batch-99:t-content';

  assert.equal(hasProcessedEvent(initial, key), false);

  const first = recordIdempotentEvent(initial, key);
  assert.equal(first.alreadyProcessed, false);
  assert.equal(hasProcessedEvent(first.state, key), true);

  const second = recordIdempotentEvent(first.state, key);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(second.state.completedEventKeys.length, 1);
});

test('refresh reconciliation drops stale finished reservations and resumes active queued sync exactly once', async () => {
  let state: WorkspaceState = createInitialWorkspaceState();
  const presenceLog: Array<{ botId: BotId; activity: BotActivityState; node?: string; queue?: number }> = [];

  const cb = {
    pacing: { walkMs: 0, turnMs: 0, deskWorkMs: 0 },
    getState: () => state,
    updateState: (updater: (prev: WorkspaceState) => WorkspaceState) => {
      state = updater(state);
    },
    setPresence: (
      botId: BotId,
      patch: Partial<BotLivePresence> & { activity: BotActivityState }
    ) => {
      presenceLog.push({
        botId,
        activity: patch.activity,
        node: patch.targetNodeId,
        queue: patch.queuePosition,
      });
    },
  };

  // Seed a mid-queue persisted state simulating a browser refresh RIGHT AFTER Content Creator finished
  // while Project Tracker was still queued at wait:business-strategist:1
  const visitStrategist = getVisitResourceId('business-strategist');
  const seededQ = requestSimultaneousSpots(createInitialOfficeQueueState(), [
    {
      resourceId: visitStrategist,
      botId: 'content-creator',
      assignmentId: 'asgn-refresh',
      purpose: 'outreach intro check',
    },
    {
      resourceId: visitStrategist,
      botId: 'project-tracker',
      assignmentId: 'asgn-refresh',
      purpose: 'milestone handoff check',
    },
  ]);

  // Simulate Content Creator's turn already recorded in completedEventKeys before refresh,
  // plus a stale reservation from an already-completed old assignment
  const withStale = requestSpot(seededQ.state, {
    resourceId: getDeskResourceId('content-creator'),
    botId: 'content-creator',
    assignmentId: 'asgn-old-finished',
    purpose: 'stale old task',
  });

  const withRecorded = recordIdempotentEvent(
    withStale.state,
    'sync-task-done:batch-refresh:t-content'
  ).state;

  const rawBeforeRefresh: WorkspaceState = {
    ...state,
    assignments: [
      {
        id: 'asgn-refresh',
        prompt: 'Team Lead desk queue',
        title: 'Team Lead Desk Queue (Content + Tracker)',
        tier: 'medium',
        createdAt: '09:00',
        status: 'running',
        participants: ['content-creator', 'project-tracker', 'business-strategist', 'lead-finder'],
        steps: [
          { id: 's1', botId: 'content-creator', label: 'Content check', status: 'completed' },
          { id: 's2', botId: 'project-tracker', label: 'Tracker check', status: 'pending' },
        ],
        linkedArtifacts: [],
        revisionCount: 0,
      },
      {
        id: 'asgn-old-finished',
        prompt: 'Old job',
        title: 'Old finished job',
        tier: 'small',
        createdAt: '08:00',
        status: 'completed',
        participants: ['content-creator'],
        steps: [],
        linkedArtifacts: [],
        revisionCount: 0,
      },
    ],
    officeQueue: {
      ...withRecorded,
      activeSyncBatch: {
        id: 'batch-refresh',
        assignmentId: 'asgn-refresh',
        createdAt: '09:00',
        status: 'active',
        independentBotId: 'lead-finder',
        independentTaskDone: true,
        tasks: [
          {
            id: 't-content',
            botId: 'content-creator',
            targetColleagueId: 'business-strategist',
            topic: 'outreach intro check',
            artifactSummary: 'Done',
            status: 'in-turn',
          },
          {
            id: 't-tracker',
            botId: 'project-tracker',
            targetColleagueId: 'business-strategist',
            topic: 'milestone handoff check',
            artifactSummary: 'Pending',
            status: 'queued',
          },
        ],
      },
    },
  };

  // Reconcile as happens on page reload
  const reconciledQueue = reconcileQueueOnHydrate(
    rawBeforeRefresh.officeQueue,
    rawBeforeRefresh.assignments
  );

  // Stale reservation from completed job must be cleared
  assert.equal(
    reconciledQueue.queues[getDeskResourceId('content-creator')]?.active.length ?? 0,
    0
  );
  // Content Creator's already-completed task must be marked completed & Tracker promoted to active!
  assert.equal(
    reconciledQueue.activeSyncBatch?.tasks.find((t) => t.id === 't-content')?.status,
    'completed'
  );
  assert.equal(
    reconciledQueue.queues[visitStrategist]?.active[0]?.botId,
    'project-tracker'
  );

  state = { ...rawBeforeRefresh, officeQueue: reconciledQueue };
  const initialContentCount = state.contentQueue.length;

  // Resume batch after reload
  const result = await runSimultaneousStrategistQueue(cb, state.officeQueue?.activeSyncBatch);
  assert.equal(result?.status, 'completed');
  // Content Creator was already completed before refresh -> MUST NOT duplicate content item!
  assert.equal(state.contentQueue.length, initialContentCount);
  // Project Tracker's task completed exactly once
  assert.equal(
    hasProcessedEvent(state.officeQueue!, 'sync-task-done:batch-refresh:t-tracker'),
    true
  );
  assert.equal(state.officeQueue?.activeSyncBatch, null);
  assert.equal(state.officeQueue?.queues[visitStrategist]?.active.length ?? 0, 0);
  assert.ok(presenceLog.some((p) => p.botId === 'project-tracker' && p.activity === 'discussing'));
});
