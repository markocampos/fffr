import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceBotAlongPath,
  findNavigationPath,
  getDeskNodeId,
  getDeskVisitorNodeId,
  getMeetingNodeId,
  NAV_NODES,
} from '../scene/navigation.ts';
import {
  classifyAssignment,
  enqueueReviewItemIdempotent,
  resolveAffectedBotForRevision,
} from './approvalRules.ts';
import { LocalSimulationRunner } from './simulationRunner.ts';
import {
  planWorkspaceConversation,
  chooseNextAutonomousFormat,
  pickIdleRoutineMove,
} from './conversationPlanner.ts';
import {
  runAutonomousConversation,
  runCollaborativeAssignment,
  resumeRevisionFromFeedback,
  type OrchestratorCallbacks,
} from './orchestrator.ts';
import { BOTS, createInitialWorkspaceState } from '../state/seedDemo.ts';
import type {
  BotActivityState,
  BotId,
  BotLivePresence,
  WorkspaceState,
} from '../types/workspace.ts';

function createTestHarness(initialState?: WorkspaceState) {
  let state: WorkspaceState = initialState ?? createInitialWorkspaceState();
  const presenceLog: Array<{
    botId: BotId;
    activity: BotActivityState;
    targetNodeId?: string;
    speech?: string;
    lookAtBotId?: BotId;
  }> = [];
  const whiteboardUpdates: Array<{ lines: string[]; active: boolean }> = [];
  const runner = new LocalSimulationRunner({ delayMs: 0 });

  const cb: OrchestratorCallbacks = {
    runner,
    pacing: {
      walkToMeetingMs: 0,
      turnSpeechMs: 0,
      walkToDeskMs: 0,
      deskWorkMs: 0,
    },
    getState: () => state,
    updateState: (updater) => {
      state = updater(state);
    },
    setPresence: (
      botId,
      patch: Partial<BotLivePresence> & { activity: BotActivityState }
    ) => {
      presenceLog.push({
        botId,
        activity: patch.activity,
        targetNodeId: patch.targetNodeId,
        speech: patch.speech,
        lookAtBotId: patch.lookAtBotId,
      });
    },
    setWhiteboard: (lines, isActiveMeeting) => {
      whiteboardUpdates.push({ lines: [...lines], active: isActiveMeeting });
    },
  };

  return {
    getState: () => state,
    presenceLog,
    whiteboardUpdates,
    runner,
    cb,
  };
}

test('active coworkers exclude Proposal Writer and include Business Strategist while preserving historical proposals', () => {
  const ids = BOTS.map((b) => b.id);
  assert.deepEqual(ids, [
    'lead-finder',
    'business-strategist',
    'project-tracker',
    'content-creator',
  ]);
  const initial = createInitialWorkspaceState();
  assert.ok(initial.strategyBriefs.length >= 1);
  assert.ok(initial.proposals.length >= 1, 'Historical proposal records must be preserved');
  assert.equal(initial.proposals[0].isHistorical, true);
});

test('navigation routes desks through framed doorways into meeting room, whiteboard, lounge, and visitor spots', () => {
  const toMeeting = findNavigationPath(
    getDeskNodeId('lead-finder'),
    getMeetingNodeId('lead-finder')
  );
  const nodeIds = toMeeting.map((n) => n.id);
  assert.ok(nodeIds.includes('door:meeting'), 'path must pass through Glass Meeting Room doorway');
  assert.equal(nodeIds[0], 'desk:lead-finder');
  assert.equal(nodeIds[nodeIds.length - 1], 'meeting:lead-finder');

  const toDeskVisit = findNavigationPath(
    getDeskNodeId('lead-finder'),
    getDeskVisitorNodeId('content-creator')
  );
  assert.equal(toDeskVisit[toDeskVisit.length - 1].id, 'visit:content-creator');

  const toWhiteboard = findNavigationPath(
    getDeskNodeId('business-strategist'),
    'whiteboard:center'
  );
  assert.ok(toWhiteboard.some((n) => n.id === 'door:meeting'));

  const toLounge = findNavigationPath(
    getDeskNodeId('project-tracker'),
    'lounge:sofa'
  );
  assert.equal(toLounge[toLounge.length - 1].id, 'lounge:sofa');

  // Step through entire path and verify arrival and final facing
  const start = NAV_NODES['desk:lead-finder'];
  const goal = NAV_NODES['meeting:lead-finder'];
  const moveState = {
    x: start.x,
    z: start.z,
    facing: start.facing ?? 0,
    waypoints: toMeeting.slice(1),
    targetFacing: goal.facing ?? 0,
  };

  let arrived = false;
  for (let i = 0; i < 400; i++) {
    const step = advanceBotAlongPath(moveState, 0.05, 5.0);
    if (step.arrived && !step.moved) {
      arrived = true;
      break;
    }
  }
  assert.equal(arrived, true);
  assert.ok(Math.hypot(moveState.x - goal.x, moveState.z - goal.z) < 0.05);
});

test('autonomous conversations support 1-, 2-, 3-, and 4-person formats and auto-save work without adding Needs me items', async () => {
  assert.equal(chooseNextAutonomousFormat(0), 'pair');
  assert.equal(chooseNextAutonomousFormat(1), 'solo');
  assert.equal(chooseNextAutonomousFormat(2), 'trio');
  assert.equal(chooseNextAutonomousFormat(3), 'all-hands');

  const harness = createTestHarness();
  const initialBriefs = harness.getState().strategyBriefs.length;
  const initialContent = harness.getState().contentQueue.length;
  const initialTasks = harness.getState().projects[0].tasks.length;

  // 1-person solo think-aloud -> Business Strategist logs experiment
  const soloPlan = planWorkspaceConversation(harness.getState(), 'solo', 0);
  assert.equal(soloPlan.attendees.length, 1);
  await runAutonomousConversation(soloPlan, harness.cb);
  assert.equal(harness.getState().strategyBriefs.length, initialBriefs + 1);
  assert.equal(harness.getState().reviewQueue.length, 0);

  // 2-person desk-side chat -> Content Creator walks to Content Studio & saves draft post
  const pairPlan = planWorkspaceConversation(harness.getState(), 'pair', 0);
  assert.equal(pairPlan.attendees.length, 2);
  assert.equal(pairPlan.venue, 'desk-side');
  await runAutonomousConversation(pairPlan, harness.cb);
  assert.equal(harness.getState().contentQueue.length, initialContent + 1);
  assert.equal(harness.getState().reviewQueue.length, 0);
  assert.ok(
    harness.getState().activity[0].artifactRef,
    'Auto-saved work must link directly to saved artifact in Recent Activity'
  );

  // 3-person whiteboard brainstorm -> Project Tracker adds staging task & captures whiteboard snapshot
  const beforeBoardCount = harness.getState().whiteboardHistory.length;
  const trioPlan = planWorkspaceConversation(harness.getState(), 'trio', 0);
  assert.equal(trioPlan.attendees.length, 3);
  assert.equal(trioPlan.venue, 'whiteboard');
  await runAutonomousConversation(trioPlan, harness.cb);
  assert.equal(harness.getState().projects[0].tasks.length, initialTasks + 1);
  assert.equal(harness.getState().reviewQueue.length, 0);
  assert.equal(
    harness.getState().whiteboardHistory.length,
    beforeBoardCount + 1
  );
  assert.equal(
    harness.getState().activeWhiteboardSnapshotId,
    harness.getState().whiteboardHistory[0].id
  );

  // 4-person all-hands sync -> Lead Finder tags lead, captures snapshot & listeners faced speaker
  const allHandsPlan = planWorkspaceConversation(harness.getState(), 'all-hands', 0);
  assert.equal(allHandsPlan.attendees.length, 4);
  assert.equal(allHandsPlan.venue, 'meeting-room');
  await runAutonomousConversation(allHandsPlan, harness.cb);
  assert.equal(harness.getState().reviewQueue.length, 0);
  assert.equal(
    harness.getState().whiteboardHistory.length,
    beforeBoardCount + 2
  );
  assert.ok(
    harness.presenceLog.some((p) => Boolean(p.lookAtBotId)),
    'Listeners must face the active speaker during conversations'
  );

  // Empty workspace gracefully falls back to clearly labeled fictional records
  const emptyState: WorkspaceState = {
    ...createInitialWorkspaceState(),
    leads: [],
    projects: [],
    contentQueue: [],
    strategyBriefs: [],
  };
  const fallbackSolo = planWorkspaceConversation(emptyState, 'solo', 0);
  assert.match(fallbackSolo.title, /Fictional/i);

  // Idle routine planner produces valid moves
  const move = pickIdleRoutineMove('lead-finder', 0, 'open-work');
  assert.equal(move.room, 'lounge');
});

test('approvalRules classifies small, medium, final-deliverable, and high-impact tiers using Business Strategist', () => {
  const small = classifyAssignment('Tag saved leads automatically');
  assert.equal(small.tier, 'small');
  assert.equal(small.requiresMeeting, false);

  const medium = classifyAssignment('Qualify a batch of dental leads');
  assert.equal(medium.tier, 'medium');
  assert.equal(medium.requiresMeeting, true);

  const finalOffer = classifyAssignment('Prepare a cleaning-business offer');
  assert.equal(finalOffer.tier, 'final-deliverable');
  assert.equal(finalOffer.industry, 'Cleaning Services');
  assert.equal(finalOffer.requiresMeeting, true);
  assert.deepEqual(finalOffer.participants, [
    'lead-finder',
    'business-strategist',
    'project-tracker',
  ]);

  const sendOffer = classifyAssignment('Send the offer to the client');
  assert.equal(sendOffer.tier, 'high-impact');
  assert.equal(sendOffer.highImpactActionType, 'send-external-message');

  assert.equal(
    resolveAffectedBotForRevision('Add a second handoff milestone'),
    'project-tracker'
  );
  assert.equal(
    resolveAffectedBotForRevision('Tighten the LinkedIn hook tone'),
    'content-creator'
  );
  assert.equal(
    resolveAffectedBotForRevision('Lower the sprint price to $5,500'),
    'business-strategist'
  );
});

test('enqueueReviewItemIdempotent prevents duplicates and updates in-place on revision', () => {
  const base = {
    id: 'rev-1',
    dedupeKey: 'final-deliverable:asgn-1',
    kind: 'final-deliverable' as const,
    title: 'Final Deliverable: Cleaning offer',
    summary: 'v1 summary',
    linkedArtifacts: [],
    status: 'pending' as const,
    createdAt: '10:00',
    revisionNumber: 1,
    mode: 'simulation' as const,
  };

  let queue = enqueueReviewItemIdempotent([], base);
  assert.equal(queue.length, 1);

  queue = enqueueReviewItemIdempotent(queue, { ...base, id: 'rev-dup' });
  assert.equal(queue.length, 1);

  queue = enqueueReviewItemIdempotent(queue, {
    ...base,
    revisionNumber: 2,
    summary: 'v2 revised',
  });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].revisionNumber, 2);
});

test('Prepare a cleaning-business offer completes intermediate work automatically and creates exactly 1 review item', async () => {
  const harness = createTestHarness();
  const initialLeadCount = harness.getState().leads.length;
  const initialStrategyCount = harness.getState().strategyBriefs.length;
  const initialProjectCount = harness.getState().projects.length;

  const assignment = await runCollaborativeAssignment(
    'Prepare a cleaning-business offer',
    { includePromoPost: false },
    harness.cb
  );

  assert.ok(assignment);
  assert.equal(assignment.status, 'awaiting-review');

  const state = harness.getState();
  assert.equal(state.leads.length, initialLeadCount + 3);
  assert.equal(state.strategyBriefs.length, initialStrategyCount + 1);
  assert.equal(state.projects.length, initialProjectCount + 1);
  assert.ok(state.projects[0].milestones.some((m) => /handoff/i.test(m.title)));
  assert.equal(
    state.whiteboardHistory[0].projectId,
    state.projects[0].id,
    'Captured whiteboard snapshot should link to the project created from the meeting'
  );
  assert.ok(state.whiteboardHistory[0].decisions.length > 0);

  assert.equal(state.reviewQueue.length, 1);
  assert.equal(state.reviewQueue[0].kind, 'final-deliverable');
  assert.equal(state.reviewQueue[0].status, 'pending');

  await resumeRevisionFromFeedback(
    state.reviewQueue[0],
    'Add a 48-hour post-handoff check-in milestone',
    harness.cb
  );
  const afterRevision = harness.getState();
  assert.equal(afterRevision.reviewQueue.length, 1);
  assert.equal(afterRevision.reviewQueue[0].revisionNumber, 2);
});

test('Send the offer to the client pauses in Needs me before executing simulated send', async () => {
  const harness = createTestHarness();

  const assignment = await runCollaborativeAssignment(
    'Send the offer to the client',
    {},
    harness.cb
  );

  assert.ok(assignment);
  assert.equal(assignment.status, 'awaiting-approval');

  const state = harness.getState();
  assert.equal(state.executedActions.length, 0);
  assert.equal(state.reviewQueue.length, 1);
  const gate = state.reviewQueue[0];
  assert.equal(gate.kind, 'high-impact-action');
  assert.equal(gate.proposedAction?.actionType, 'send-external-message');
});
