import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialWorkspaceState } from '../state/seedDemo';
import {
  getBotDeskStatusLabel,
  getContentDisplayStatus,
  getLeadDisplayStatus,
  getMeetingDisplayStatus,
  getStrategyDisplayStatus,
} from '../state/reviewStatus';
import {
  AUSTRALIAN_CLEANING_EXAMPLE_FOCUS,
  computeFocusProgress,
  createTodayFocus,
  planNextFocusConversation,
} from './focusPlanner';
import { runAutonomousConversation } from './orchestrator';
import { LocalSimulationRunner } from './simulationRunner';
import type {
  BotId,
  BotLivePresence,
  ReviewItem,
  WorkspaceState,
} from '../types/workspace';

const INSTANT_PACING = {
  walkToMeetingMs: 0,
  turnSpeechMs: 0,
  walkToDeskMs: 0,
  deskWorkMs: 0,
};

function makeHarness(initial: WorkspaceState) {
  let state = initial;
  const presenceLog: Array<{
    botId: BotId;
    patch: Partial<BotLivePresence>;
  }> = [];

  const callbacks = {
    runner: new LocalSimulationRunner(),
    pacing: INSTANT_PACING,
    getState: () => state,
    updateState: (updater: (prev: WorkspaceState) => WorkspaceState) => {
      state = updater(state);
    },
    setPresence: (botId: BotId, patch: Partial<BotLivePresence>) => {
      presenceLog.push({ botId, patch });
    },
    setWhiteboard: () => {},
  };

  return {
    getState: () => state,
    setState: (next: WorkspaceState) => {
      state = next;
    },
    presenceLog,
    callbacks,
  };
}

test('Today focus parses Australian residential cleaning example and progresses 0 -> 3 then stops', async () => {
  const initial = createInitialWorkspaceState();
  const focus = createTodayFocus(AUSTRALIAN_CLEANING_EXAMPLE_FOCUS);

  assert.equal(focus.targetCount, 3);
  assert.equal(focus.workKind, 'lead-evaluation');
  assert.equal(focus.status, 'active');
  assert.equal(focus.requestConsolidatedReview, false);

  const harness = makeHarness({
    ...initial,
    todayFocus: focus,
  });

  // 0 of 3 before any autonomous step runs
  let progress = computeFocusProgress(
    harness.getState(),
    harness.getState().todayFocus
  );
  assert.equal(progress.completedCount, 0);
  assert.equal(progress.progressLabel, '0 of 3 leads evaluated');
  assert.equal(progress.isComplete, false);

  // Run 3 autonomous steps driven strictly by planNextFocusConversation
  for (let step = 1; step <= 3; step++) {
    const state = harness.getState();
    const plan = planNextFocusConversation(state, state.todayFocus!);
    assert.ok(plan, `Expected plan for step ${step}`);
    assert.equal(plan.focusId, focus.id);

    if (step === 1) {
      // Strategist walks to Lead Finder's desk to discuss candidate #1 by name
      const stratPos = plan.positions.find(
        (p) => p.botId === 'business-strategist'
      );
      assert.equal(stratPos?.targetNodeId, 'visit:lead-finder');
      assert.match(plan.candidateName ?? '', /Harbourside Home Sparkle/i);
    }

    const meeting = await runAutonomousConversation(plan, harness.callbacks);
    assert.equal(meeting.status, 'concluded');
    assert.equal(meeting.followUpOwner, 'lead-finder');
    assert.ok(meeting.decisions.length >= 2);
    assert.ok(meeting.linkedArtifacts && meeting.linkedArtifacts.length >= 1);

    const linkedLeadRef = meeting.linkedArtifacts!.find(
      (a) => a.kind === 'lead'
    );
    assert.ok(linkedLeadRef, 'Conversation must link directly to saved lead');

    const savedLead = harness
      .getState()
      .leads.find((l) => l.id === linkedLeadRef.id);
    assert.ok(savedLead, 'Linked lead must exist in workspace');
    assert.equal(savedLead.focusId, focus.id);
    assert.equal(savedLead.sourceMeetingId, meeting.id);
    assert.equal(savedLead.status, 'evaluated');
    assert.match(savedLead.businessName, /Fictional/i);
    assert.ok(
      savedLead.sampleInquiryFlow && savedLead.sampleInquiryFlow.length > 10
    );
    assert.match(
      savedLead.suggestedOffer,
      /branded.*inquiry|owner tracker|notification/i
    );

    // Recent activity must link back to both the conversation and saved lead
    const evalEvent = harness
      .getState()
      .activity.find(
        (e) => e.meetingId === meeting.id && e.artifactRef?.id === savedLead.id
      );
    assert.ok(evalEvent, 'Activity event should carry meetingId and artifactRef');

    progress = computeFocusProgress(
      harness.getState(),
      harness.getState().todayFocus
    );
    assert.equal(progress.completedCount, step);
    assert.equal(progress.progressLabel, `${step} of 3 leads evaluated`);
  }

  // Focus completes cleanly with zero Needs me items and stops creating further tasks
  const finishedState = harness.getState();
  assert.equal(finishedState.todayFocus?.status, 'completed');
  assert.equal(finishedState.reviewQueue.length, 0);
  assert.equal(
    planNextFocusConversation(finishedState, finishedState.todayFocus!),
    null
  );

  // Presence updates during conversation carry activeMeetingId for clickable speech bubbles
  assert.ok(
    harness.presenceLog.some(
      (p) => Boolean(p.patch.speech) && Boolean(p.patch.activeMeetingId)
    )
  );
});

test('Changing Today focus preserves earlier work in history and resets progress to 0 for the new focus', async () => {
  const initial = createInitialWorkspaceState();
  const focusA = createTodayFocus(AUSTRALIAN_CLEANING_EXAMPLE_FOCUS);
  const harness = makeHarness({ ...initial, todayFocus: focusA });

  // Complete 1 lead under Focus A
  const planA1 = planNextFocusConversation(harness.getState(), focusA)!;
  await runAutonomousConversation(planA1, harness.callbacks);

  const leadsAfterA = harness.getState().leads.length;
  assert.equal(
    computeFocusProgress(harness.getState(), harness.getState().todayFocus)
      .completedCount,
    1
  );

  // Switch to a brand new Focus B
  const focusB = createTodayFocus({
    goal: 'Draft two LinkedIn posts for residential cleaning owners',
    targetAudience: 'Cleaning business owners',
    expectedResult: '2 drafts saved',
  });
  harness.setState({
    ...harness.getState(),
    todayFocus: focusB,
  });

  // Earlier leads stay intact, while Focus B progress counts strictly Focus B work
  assert.equal(harness.getState().leads.length, leadsAfterA);
  const progressB = computeFocusProgress(harness.getState(), focusB);
  assert.equal(progressB.completedCount, 0);
  assert.equal(progressB.targetCount, 2);
  assert.equal(progressB.progressLabel, '0 of 2 drafts saved');
});

test('Optional consolidated owner review submits exactly ONE review item with all focus results linked', async () => {
  const initial = createInitialWorkspaceState();
  const focus = createTodayFocus({
    goal: 'Evaluate two Australian residential cleaning businesses for owner review',
    targetAudience: 'Australian residential cleaning businesses',
    expectedResult: '2 leads evaluated',
    requestConsolidatedReview: true,
  });
  const harness = makeHarness({ ...initial, todayFocus: focus });

  for (let i = 0; i < 2; i++) {
    const plan = planNextFocusConversation(
      harness.getState(),
      harness.getState().todayFocus!
    )!;
    await runAutonomousConversation(plan, harness.callbacks);
  }

  const finalState = harness.getState();
  assert.equal(finalState.todayFocus?.status, 'completed');
  assert.equal(finalState.reviewQueue.length, 1);
  assert.equal(finalState.reviewQueue[0].status, 'pending');
  assert.equal(finalState.reviewQueue[0].linkedArtifacts.length, 2);
});

test('Review status shows Evaluated or Completed for finished internal work, and Ready for review ONLY when open in Needs me', () => {
  const state = createInitialWorkspaceState();
  const lead = { ...state.leads[0], status: 'evaluated' as const };
  const brief = state.strategyBriefs[0];
  const content = state.contentQueue[0];
  const meeting = {
    ...state.meetings[0],
    status: 'concluded' as const,
    outcomeSummary: `Evaluated ${lead.businessName} — saved problem & offer.`,
    linkedArtifacts: [
      { kind: 'lead' as const, id: lead.id, label: lead.businessName, botId: 'lead-finder' as const },
    ],
  };

  // With empty Needs me queue, nothing displays Ready for review
  assert.equal(getLeadDisplayStatus(lead, []), 'Evaluated');
  assert.equal(getStrategyDisplayStatus(brief, []), 'Completed');
  assert.equal(getContentDisplayStatus(content, []), 'Completed');
  assert.equal(getMeetingDisplayStatus(meeting, []), 'Evaluated');
  assert.equal(getBotDeskStatusLabel('lead-finder', 'ready', []), 'Completed');

  // With a pending review item linking that lead & brief, ONLY linked records show Ready for review
  const pendingReview: ReviewItem = {
    id: 'rev-test-1',
    dedupeKey: 'test:1',
    kind: 'final-deliverable',
    title: 'Consolidated Review',
    summary: 'Review evaluated leads',
    deliverableText: lead.businessName,
    status: 'pending',
    createdAt: '10:00 AM',
    revisionNumber: 1,
    mode: 'simulation',
    linkedArtifacts: [
      { kind: 'lead', id: lead.id, label: lead.businessName, botId: 'lead-finder' },
      { kind: 'strategy', id: brief.id, label: brief.title, botId: 'business-strategist' },
    ],
  };

  assert.equal(getLeadDisplayStatus(lead, [pendingReview]), 'Ready for review');
  assert.equal(getStrategyDisplayStatus(brief, [pendingReview]), 'Ready for review');
  assert.equal(getMeetingDisplayStatus(meeting, [pendingReview]), 'Ready for review');
  assert.equal(
    getBotDeskStatusLabel('lead-finder', 'ready', [pendingReview]),
    'Ready for review'
  );
  // Unlinked content item stays Completed
  assert.equal(getContentDisplayStatus(content, [pendingReview]), 'Completed');

  // Once approved, statuses immediately revert from Ready for review -> Evaluated / Completed
  const approvedReview: ReviewItem = { ...pendingReview, status: 'approved' };
  assert.equal(getLeadDisplayStatus(lead, [approvedReview]), 'Evaluated');
  assert.equal(getStrategyDisplayStatus(brief, [approvedReview]), 'Completed');
  assert.equal(
    getBotDeskStatusLabel('lead-finder', 'ready', [approvedReview]),
    'Completed'
  );
});
