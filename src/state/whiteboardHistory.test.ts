import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialWorkspaceState } from './seedDemo';
import {
  applySnapshotDecisionsToProject,
  buildWhiteboardSnapshotFromMeeting,
  filterWhiteboardSnapshots,
  resolveLiveWhiteboardSnapshot,
  upsertWhiteboardSnapshot,
} from './whiteboardHistory';
import type { MeetingRecord } from '../types/workspace';

test('seeded demo workspace starts with historical whiteboard snapshots and active board pointer', () => {
  const state = createInitialWorkspaceState();
  assert.ok(state.whiteboardHistory.length >= 2);
  const live = resolveLiveWhiteboardSnapshot(state);
  assert.ok(live);
  assert.equal(live.id, state.activeWhiteboardSnapshotId);
  assert.ok(live.whiteboardLines.length >= 3);
  assert.ok(live.decisions.length >= 2);
});

test('buildWhiteboardSnapshotFromMeeting captures non-empty board sessions and skips desk-only chats without board lines', () => {
  const state = createInitialWorkspaceState();

  const deskOnlyMeeting: MeetingRecord = {
    id: 'conv-desk-1',
    title: 'Quick Desk Chat',
    startedAt: '10:00 AM',
    status: 'concluded',
    format: 'pair',
    venue: 'desk-side',
    source: 'autonomous',
    attendees: ['lead-finder', 'content-creator'],
    turns: [],
    whiteboardLines: [],
    decisions: ['Draft a short post'],
    nextSteps: [],
  };

  assert.equal(
    buildWhiteboardSnapshotFromMeeting(deskOnlyMeeting, state.projects),
    null
  );

  const boardMeeting: MeetingRecord = {
    id: 'mtg-board-1',
    title: 'Whiteboard Brainstorm: Staging Handoff',
    startedAt: '10:15 AM',
    status: 'concluded',
    format: 'trio',
    venue: 'whiteboard',
    source: 'assigned',
    attendees: ['business-strategist', 'project-tracker', 'lead-finder'],
    turns: [],
    whiteboardLines: [
      'STAGING HANDOFF PLAN',
      'Decouple Week 1 from client IT tokens',
    ],
    decisions: ['Use mock webhook fixtures in Week 1'],
    nextSteps: [{ botId: 'project-tracker', task: 'Add fixture task' }],
    linkedArtifacts: [
      {
        kind: 'project',
        id: 'demo-proj-1',
        label: 'Copperleaf BOL Automation Portal (Demo)',
        botId: 'project-tracker',
      },
    ],
  };

  const snap = buildWhiteboardSnapshotFromMeeting(boardMeeting, state.projects);
  assert.ok(snap);
  assert.equal(snap.id, 'wb-mtg-board-1');
  assert.equal(snap.projectId, 'demo-proj-1');
  assert.equal(snap.projectTitle, 'Copperleaf BOL Automation Portal (Demo)');
  assert.equal(snap.decisions.length, 1);
});

test('upsertWhiteboardSnapshot prepends new snapshots and merges enrichment without creating duplicates', () => {
  const state = createInitialWorkspaceState();
  const baseSnap = {
    id: 'wb-mtg-42',
    meetingId: 'mtg-42',
    sessionTitle: 'Cleaning Offer Kickoff',
    capturedAt: '11:00 AM',
    format: 'all-hands' as const,
    venue: 'meeting-room' as const,
    source: 'assigned' as const,
    attendees: ['lead-finder', 'business-strategist', 'project-tracker'] as const,
    whiteboardLines: ['CLEANING OFFER', 'Branded inquiry form + owner tracker'],
    decisions: ['Include Owner Handoff milestone'],
    nextSteps: [],
  };

  const afterInsert = upsertWhiteboardSnapshot(state.whiteboardHistory, {
    ...baseSnap,
    attendees: [...baseSnap.attendees],
  });
  assert.equal(afterInsert.length, state.whiteboardHistory.length + 1);
  assert.equal(afterInsert[0].id, 'wb-mtg-42');

  const afterEnrich = upsertWhiteboardSnapshot(afterInsert, {
    ...baseSnap,
    attendees: [...baseSnap.attendees],
    projectId: 'proj-clean-1',
    projectTitle: 'SparkClean Pilot Delivery',
    linkedArtifacts: [
      {
        kind: 'project',
        id: 'proj-clean-1',
        label: 'SparkClean Pilot Delivery',
        botId: 'project-tracker',
      },
    ],
  });
  assert.equal(afterEnrich.length, afterInsert.length);
  assert.equal(afterEnrich[0].projectId, 'proj-clean-1');
  assert.equal(afterEnrich[0].projectTitle, 'SparkClean Pilot Delivery');
  assert.equal(afterEnrich[0].linkedArtifacts?.length, 1);
});

test('filterWhiteboardSnapshots filters by project linkage and session source accurately', () => {
  const state = createInitialWorkspaceState();
  const history = upsertWhiteboardSnapshot(state.whiteboardHistory, {
    id: 'wb-assigned-1',
    meetingId: 'mtg-assigned-1',
    sessionTitle: 'Assigned Offer Meeting',
    capturedAt: '11:20 AM',
    format: 'all-hands',
    venue: 'meeting-room',
    source: 'assigned',
    attendees: ['lead-finder', 'business-strategist'],
    whiteboardLines: ['OFFER SCOPE'],
    decisions: ['Lock 3-week timeline'],
    nextSteps: [],
  });

  assert.equal(filterWhiteboardSnapshots(history, 'all').length, history.length);
  assert.equal(
    filterWhiteboardSnapshots(history, 'assigned').every(
      (s) => s.source === 'assigned'
    ),
    true
  );
  assert.equal(filterWhiteboardSnapshots(history, 'assigned').length, 1);
  assert.ok(filterWhiteboardSnapshots(history, 'with-project').length >= 1);
  assert.ok(filterWhiteboardSnapshots(history, 'autonomous').length >= 2);
});

test('applySnapshotDecisionsToProject attaches restored decisions immutably', () => {
  const state = createInitialWorkspaceState();
  const project = state.projects[0];
  const snapshot = state.whiteboardHistory[1]; // Intake & Exception Queue Sprint Positioning

  const updated = applySnapshotDecisionsToProject(
    project,
    snapshot,
    '02:30 PM'
  );

  assert.equal(project.activeDecisions, undefined);
  assert.ok(updated.activeDecisions);
  assert.equal(updated.activeDecisions.sourceSnapshotId, snapshot.id);
  assert.equal(updated.activeDecisions.sessionTitle, snapshot.sessionTitle);
  assert.equal(updated.activeDecisions.restoredAt, '02:30 PM');
  assert.deepEqual(updated.activeDecisions.decisions, snapshot.decisions);
});
