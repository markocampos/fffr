import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCleaningOutreachCandidates,
  buildOutreachDraftForLead,
  evaluateLeadShortlist,
  evaluateOutreachDrafts,
  isLeadOutreachPipelinePrompt,
  migrateRoutinePendingReviewsToTeamLead,
  SAMPLE_CLEANING_OUTREACH_PROMPT,
} from './teamLeadEngine';
import { createInitialWorkspaceState } from '../state/seedDemo';
import { applyOwnerDecision } from './orchestrator';
import { workflowRunner } from './index';
import type { WorkspaceState } from '../types/workspace';

test('recognizes lead + outreach assignment prompts and audits missing source evidence', () => {
  assert.equal(isLeadOutreachPipelinePrompt(SAMPLE_CLEANING_OUTREACH_PROMPT), true);
  assert.equal(isLeadOutreachPipelinePrompt('Tag saved leads'), false);

  const candidates = buildCleaningOutreachCandidates('asgn-test', '10:00');
  assert.equal(candidates.length, 3);

  // First submission has Bayside Eco Cleans missing verified source URL
  const firstAudit = evaluateLeadShortlist(candidates.map((c) => c.lead));
  assert.equal(firstAudit.decision, 'request-revision');
  assert.equal(firstAudit.targetBot, 'lead-finder');
  assert.equal(firstAudit.missingLeads.length, 1);
  assert.match(firstAudit.instruction || '', /Bayside Eco Cleans/);

  // After Lead Finder verifies the missing source URL, Team Lead approves automatically
  const fixedLeads = candidates.map((c) => ({
    ...c.lead,
    sourceUrl: c.verifiedSourceUrl,
    sourceVerified: true,
  }));
  const secondAudit = evaluateLeadShortlist(fixedLeads);
  assert.equal(secondAudit.decision, 'approve');
  assert.equal(secondAudit.targetBot, 'content-creator');
});

test('Team Lead groups 3 outreach drafts into one clear owner decision card and applies owner choices', async () => {
  const candidates = buildCleaningOutreachCandidates('asgn-outreach', '10:05');
  const approvedLeads = candidates.map((c) => ({
    ...c.lead,
    sourceUrl: c.verifiedSourceUrl,
    sourceVerified: true,
    teamLeadReviewStatus: 'approved' as const,
  }));
  const drafts = approvedLeads.map((lead, idx) =>
    buildOutreachDraftForLead(lead, 'asgn-outreach', idx, '10:06')
  );

  const evalRes = evaluateOutreachDrafts(drafts, approvedLeads, {
    assignmentId: 'asgn-outreach',
    mode: 'simulation',
    createdAt: '10:07',
  });

  assert.equal(evalRes.approvedInternal, true);
  assert.equal(evalRes.requiresOwnerDecision, true);
  assert.ok(evalRes.decisionCard);
  assert.equal(evalRes.decisionCard!.decisionQuestion, 'Send these three outreach messages?');
  assert.equal(evalRes.decisionCard!.groupedTaskLabels?.length, 3);
  assert.equal(evalRes.decisionCard!.recommendedOptionId, 'approve-send');

  let state: WorkspaceState = {
    ...createInitialWorkspaceState(),
    leads: [...approvedLeads],
    contentQueue: [...drafts],
    reviewQueue: [evalRes.decisionCard!],
  };

  const acceptOption = evalRes.decisionCard!.options!.find(
    (o) => o.id === 'approve-send'
  )!;

  await applyOwnerDecision(
    evalRes.decisionCard!,
    { kind: 'option', option: acceptOption },
    {
      runner: workflowRunner,
      pacing: { walkToMeetingMs: 0, turnSpeechMs: 0, walkToDeskMs: 0, deskWorkMs: 0 },
      getState: () => state,
      updateState: (updater) => {
        state = updater(state);
      },
      setPresence: () => {},
      setWhiteboard: () => {},
    }
  );

  assert.equal(state.reviewQueue[0].status, 'approved');
  assert.equal(
    state.contentQueue.filter((c) => c.deliveryStatus === 'sent-sim').length,
    3
  );
  assert.ok(state.executedActions.length >= 1);
});

test('migrates routine pending internal reviews to Team Lead while preserving owner escalations', () => {
  const base = createInitialWorkspaceState();
  const state: WorkspaceState = {
    ...base,
    reviewQueue: [
      {
        id: 'rev-routine',
        dedupeKey: 'routine:brief:1',
        kind: 'final-deliverable',
        title: 'Routine internal brief',
        summary: 'Internal deliverable',
        deliverableText: 'Body',
        linkedArtifacts: [],
        status: 'pending',
        createdAt: '09:00',
        revisionNumber: 1,
        mode: 'simulation',
      },
      {
        id: 'rev-owner',
        dedupeKey: 'owner:outreach:1',
        kind: 'high-impact-action',
        title: 'Send these three outreach messages?',
        summary: 'Needs owner send authorization',
        escalationReason: 'external-authorization',
        deliverableText: 'Body',
        linkedArtifacts: [],
        status: 'pending',
        createdAt: '09:05',
        revisionNumber: 1,
        mode: 'simulation',
      },
    ],
  };

  const migrated = migrateRoutinePendingReviewsToTeamLead(state);
  assert.equal(migrated.migratedCount, 1);
  assert.equal(
    migrated.state.reviewQueue.find((r) => r.id === 'rev-routine')?.status,
    'approved'
  );
  assert.equal(
    migrated.state.reviewQueue.find((r) => r.id === 'rev-routine')?.resolvedBy,
    'team-lead'
  );
  assert.equal(
    migrated.state.reviewQueue.find((r) => r.id === 'rev-owner')?.status,
    'pending'
  );
});
