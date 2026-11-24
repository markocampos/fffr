import type {
  AssignmentRecord,
  AssignmentStep,
  BotActivityState,
  BotId,
  BotLivePresence,
  ContentQueueRecord,
  DeskScreenLine,
  ExternalActionPreview,
  LeadRecord,
  LinkedArtifactRef,
  MeetingRecord,
  ProjectRecord,
  ReviewDecisionOption,
  ReviewItem,
  StrategyExperimentRecord,
  WorkspaceState,
} from '../types/workspace';
import {
  CONTENT_STUDIO_SPOT,
  MEETING_SPOTS,
} from '../scene/officeLayout';
import {
  getDeskNodeId,
  getDeskVisitorNodeId,
  getMeetingNodeId,
} from '../scene/navigation';
import {
  classifyAssignment,
  enqueueReviewItemIdempotent,
  resolveAffectedBotForRevision,
} from './approvalRules';
import {
  buildCleaningOutreachCandidates,
  buildOutreachDraftForLead,
  evaluateLeadShortlist,
  evaluateOutreachDrafts,
  isLeadOutreachPipelinePrompt,
} from './teamLeadEngine';
import type { PlannedConversation } from './conversationPlanner';
import type { WorkflowRunner } from './runner';
import { createActivityEvent, deriveProjectStatus, nowStamp } from '../state/workspaceStore';
import {
  cancelAssignmentReservations,
  createInitialOfficeQueueState,
  reserveMeetingChairs,
} from '../state/officeQueueStore';
import {
  buildWhiteboardSnapshotFromMeeting,
  upsertWhiteboardSnapshot,
} from '../state/whiteboardHistory';
import { computeFocusProgress } from './focusPlanner';

export interface OrchestratorPacing {
  walkToMeetingMs: number;
  turnSpeechMs: number;
  walkToDeskMs: number;
  deskWorkMs: number;
}

export const DEFAULT_PACING: OrchestratorPacing = {
  walkToMeetingMs: 2250,
  turnSpeechMs: 1600,
  walkToDeskMs: 2050,
  deskWorkMs: 1450,
};

export interface OrchestratorCallbacks {
  runner: WorkflowRunner;
  pacing?: OrchestratorPacing;
  getState: () => WorkspaceState;
  updateState: (updater: (prev: WorkspaceState) => WorkspaceState) => void;
  setPresence: (
    botId: BotId,
    patch: Partial<BotLivePresence> & { activity: BotActivityState }
  ) => void;
  setWhiteboard: (lines: string[], isActiveMeeting: boolean) => void;
  isCancelled?: () => boolean;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function slugKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function mergeArtifactRefs(
  existing: LinkedArtifactRef[] | undefined,
  next: LinkedArtifactRef
): LinkedArtifactRef[] {
  const list = existing ? [...existing] : [];
  const key = `${next.kind}:${next.id}`;
  if (!list.some((item) => `${item.kind}:${item.id}` === key)) {
    list.push(next);
  }
  return list;
}

/**
 * Executes an autonomous or manual workspace conversation (1-, 2-, 3-, or 4-person format),
 * moves coworkers along walkable paths, animates one active speaker at a time with listeners facing them,
 * records the full transcript, and walks the follow-up owner to complete & save routine work automatically
 * WITHOUT polluting the Needs me queue.
 */
export async function runAutonomousConversation(
  plan: PlannedConversation,
  cb: OrchestratorCallbacks
): Promise<MeetingRecord> {
  const pacing = cb.pacing ?? DEFAULT_PACING;
  const meetingId = makeId('conv');

  const initialRecord: MeetingRecord = {
    id: meetingId,
    title: plan.title,
    startedAt: nowStamp(),
    status: 'active',
    format: plan.format,
    venue: plan.venue,
    source: 'autonomous',
    attendees: plan.attendees,
    followUpOwner: plan.followUp.owner,
    followUpTask: plan.nextSteps[0]?.task,
    candidateName: plan.candidateName,
    focusId: plan.focusId,
    turns: [],
    whiteboardLines:
      plan.whiteboardLines.length > 0 ? [plan.whiteboardLines[0]] : [],
    decisions: [],
    nextSteps: plan.nextSteps,
    linkedArtifacts: plan.contextArtifact ? [plan.contextArtifact] : [],
  };

  // Register the conversation immediately so clicking a walking speech bubble opens it cleanly
  cb.updateState((prev) => ({
    ...prev,
    meetings: [
      initialRecord,
      ...prev.meetings.filter((m) => m.id !== meetingId),
    ],
  }));

  // 1. Walk participants to their venue spots (desk-side, lounge, whiteboard, or meeting room)
  for (const pos of plan.positions) {
    cb.setPresence(pos.botId, {
      activity: 'walking',
      room: pos.room,
      targetNodeId: pos.targetNodeId,
      posture: 'standing',
      lookAtBotId: undefined,
      speech: pos.walkSpeech,
      activeArtifact: plan.contextArtifact,
      activeMeetingId: meetingId,
    });
  }

  // Shorter walk wait if only 1 person staying at their own desk
  const anyoneMoving =
    plan.attendees.length > 1 || plan.venue !== 'desk-side';
  if (anyoneMoving) {
    await wait(pacing.walkToMeetingMs);
  }

  if (plan.whiteboardLines.length > 0) {
    cb.setWhiteboard([plan.whiteboardLines[0]], true);
  }

  // 2. Play out turns — strictly ONE active speaker bubble at a time; listeners face the speaker!
  for (let i = 0; i < plan.turns.length; i++) {
    if (cb.isCancelled?.()) break;
    const rawTurn = plan.turns[i];
    const turn = { ...rawTurn, timestamp: nowStamp() };
    const visibleBoard =
      plan.whiteboardLines.length > 0
        ? plan.whiteboardLines.slice(
            0,
            Math.min(plan.whiteboardLines.length, i + 2)
          )
        : [];

    if (visibleBoard.length > 0) {
      cb.setWhiteboard(visibleBoard, true);
    }

    for (const pos of plan.positions) {
      const isSpeaker = pos.botId === turn.speaker;
      cb.setPresence(pos.botId, {
        activity: isSpeaker
          ? 'discussing'
          : plan.attendees.length === 1
            ? 'checking-notes'
            : 'discussing',
        room: pos.room,
        targetNodeId: pos.targetNodeId,
        posture: pos.posture,
        lookAtBotId: isSpeaker ? undefined : turn.speaker,
        speech: isSpeaker ? turn.bubbleText : undefined,
        activeArtifact: plan.contextArtifact,
        activeMeetingId: meetingId,
      });
    }

    cb.updateState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              turns: [...m.turns, turn],
              whiteboardLines:
                visibleBoard.length > 0 ? visibleBoard : m.whiteboardLines,
              decisions:
                i === plan.turns.length - 1 ? plan.decisions : m.decisions,
            }
          : m
      ),
    }));

    await wait(pacing.turnSpeechMs);
  }

  if (plan.whiteboardLines.length > 0) {
    cb.setWhiteboard(plan.whiteboardLines, false);
    const capturedAt = nowStamp();
    cb.updateState((prev) => {
      const currentMeeting = prev.meetings.find((m) => m.id === meetingId);
      const snapshot = buildWhiteboardSnapshotFromMeeting(
        {
          ...(currentMeeting ?? initialRecord),
          whiteboardLines: plan.whiteboardLines,
          decisions: plan.decisions,
          nextSteps: plan.nextSteps,
        },
        prev.projects,
        { capturedAt }
      );
      if (!snapshot) return prev;
      return {
        ...prev,
        whiteboardHistory: upsertWhiteboardSnapshot(
          prev.whiteboardHistory,
          snapshot
        ),
        activeWhiteboardSnapshotId: snapshot.id,
      };
    });
  }

  // 3. Conclude conversation & send non-owners back to their desks while owner walks to execute follow-up
  const ownerId = plan.followUp.owner;
  for (const pos of plan.positions) {
    if (pos.botId === ownerId) {
      cb.setPresence(ownerId, {
        activity: 'walking',
        room: plan.followUp.workRoom,
        targetNodeId: plan.followUp.workNodeId,
        posture: 'standing',
        lookAtBotId: undefined,
        speech:
          plan.followUp.kind === 'draft-content-post'
            ? 'Heading to Content Studio to draft post...'
            : plan.followUp.kind === 'save-lead-evaluation'
              ? `Saving evaluation for ${plan.candidateName ?? 'lead'}...`
              : 'Returning to desk to save follow-up...',
        activeArtifact: plan.contextArtifact,
        activeMeetingId: meetingId,
      });
    } else {
      cb.setPresence(pos.botId, {
        activity: 'walking',
        room: 'open-work',
        targetNodeId: getDeskNodeId(pos.botId),
        posture: 'standing',
        lookAtBotId: undefined,
        speech: undefined,
        activeArtifact: undefined,
        activeMeetingId: undefined,
      });
    }
  }

  await wait(pacing.walkToDeskMs);

  // Settle non-owners calmly at their desks
  for (const pos of plan.positions) {
    if (pos.botId !== ownerId) {
      cb.setPresence(pos.botId, {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId(pos.botId),
        posture: 'seated',
        lookAtBotId: undefined,
        speech: undefined,
        activeMeetingId: undefined,
      });
    }
  }

  // 4. Owner performs the concrete follow-up work in the simulation & saves automatically (zero Needs Me items!)
  cb.setPresence(ownerId, {
    activity: 'working',
    room: plan.followUp.workRoom,
    targetNodeId: plan.followUp.workNodeId,
    posture: 'seated',
    lookAtBotId: undefined,
    speech: undefined,
    activeArtifact: plan.contextArtifact,
    activeMeetingId: meetingId,
  });

  await wait(pacing.deskWorkMs);

  let savedArtifactRef: LinkedArtifactRef | undefined;
  let outcomeSummary = '';

  if (plan.followUp.kind === 'save-lead-evaluation') {
    const f = plan.followUp;
    const shortName =
      plan.candidateName ||
      f.candidate.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim();
    const candidateId = makeId('lead');

    const resolvedLeadRef: LinkedArtifactRef = {
      kind: 'lead',
      id: candidateId,
      label: `Evaluation: ${shortName}`,
      botId: 'lead-finder',
    };
    outcomeSummary = `Evaluated ${shortName} (${f.candidate.location}) — saved observed inquiry problem and suggested Rhymvex offer.`;

    cb.updateState((prev) => {
      // Idempotent guard: never save a duplicate evaluation for the same focus & business
      const existing = prev.leads.find(
        (l) =>
          l.focusId === f.focusId &&
          l.businessName.toLowerCase() === f.candidate.businessName.toLowerCase()
      );
      const finalLead: LeadRecord = existing ?? {
        ...f.candidate,
        id: candidateId,
        savedAt: nowStamp(),
        status: 'evaluated',
        focusId: f.focusId,
        sourceMeetingId: meetingId,
        isDemo: false,
      };
      const finalRef: LinkedArtifactRef = {
        kind: 'lead',
        id: finalLead.id,
        label: `Evaluation: ${shortName}`,
        botId: 'lead-finder',
      };
      savedArtifactRef = finalRef;

      return {
        ...prev,
        leads: existing ? prev.leads : [finalLead, ...prev.leads],
        botJobs: {
          ...prev.botJobs,
          'lead-finder': {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        meetings: prev.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: 'concluded',
                decisions: plan.decisions,
                outcomeSummary,
                linkedArtifacts: mergeArtifactRefs(m.linkedArtifacts, finalRef),
              }
            : m
        ),
        activity: [
          createActivityEvent(
            'lead-finder',
            'Lead evaluated',
            `${shortName}: ${f.candidate.observedProblem.slice(0, 145)}`,
            finalRef,
            { meetingId, focusId: f.focusId }
          ),
          ...prev.activity,
        ],
      };
    });

    if (!savedArtifactRef) {
      savedArtifactRef = resolvedLeadRef;
    }
  } else if (plan.followUp.kind === 'save-strategy-experiment') {
    const f = plan.followUp;
    const newExp: StrategyExperimentRecord = {
      id: makeId('strat'),
      title: `${f.niche}: ${f.serviceIdea}`,
      niche: f.niche,
      serviceIdea: f.serviceIdea,
      hypothesis: f.hypothesis,
      evidenceFromWorkspace: f.evidence,
      experimentPlan: [
        'Build a 1-page interactive intake & exception queue walkthrough.',
        'Validate positioning against 2 saved fictional leads before building custom integrations.',
        'Include Day-0 credential checklist and Owner Handoff milestone.',
      ],
      successMetric: '2 qualified discovery replies from 5 outreach teardowns.',
      estimatedPriceRange: '$6,500 – $8,500 (2 weeks)',
      deliveryConstraint: f.constraint,
      nextStepOwner: 'content-creator',
      nextStepAction: 'Turn the intake triage insight into a short LinkedIn post.',
      createdAt: nowStamp(),
      status: 'hypothesis',
      sourceLeadIds: f.sourceLeadIds,
      focusId: f.focusId,
      sourceMeetingId: meetingId,
      isDemo: false,
    };

    savedArtifactRef = {
      kind: 'strategy',
      id: newExp.id,
      label: `Experiment: ${newExp.title.slice(0, 44)}`,
      botId: 'business-strategist',
    };
    outcomeSummary = `Saved strategy experiment "${newExp.title}" automatically.`;

    cb.updateState((prev) => ({
      ...prev,
      strategyBriefs: [newExp, ...prev.strategyBriefs],
      botJobs: {
        ...prev.botJobs,
        'business-strategist': {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              status: 'concluded',
              decisions: plan.decisions,
              outcomeSummary,
              linkedArtifacts: mergeArtifactRefs(
                m.linkedArtifacts,
                savedArtifactRef!
              ),
            }
          : m
      ),
      activity: [
        createActivityEvent(
          'business-strategist',
          'Experiment saved from review',
          outcomeSummary,
          savedArtifactRef,
          { meetingId, focusId: f.focusId }
        ),
        ...prev.activity,
      ],
    }));
  } else if (plan.followUp.kind === 'draft-content-post') {
    const f = plan.followUp;
    const newPost: ContentQueueRecord = {
      id: makeId('cnt'),
      platform: 'LinkedIn',
      topic: f.topic,
      offer: f.offer,
      tone: 'Practical & direct',
      variantLabel: 'Auto-Draft from Desk Chat',
      hook: f.hook,
      body: f.body,
      callToAction: f.cta,
      savedAt: nowStamp(),
      queueStatus: f.focusId ? 'completed' : 'draft',
      focusId: f.focusId,
      sourceMeetingId: meetingId,
      isDemo: false,
    };

    savedArtifactRef = {
      kind: 'content',
      id: newPost.id,
      label: `Draft Post: ${newPost.hook.slice(0, 42)}`,
      botId: 'content-creator',
    };
    outcomeSummary = `Drafted LinkedIn post "${newPost.hook.slice(0, 56)}" in Content Queue.`;

    cb.updateState((prev) => ({
      ...prev,
      contentQueue: [newPost, ...prev.contentQueue],
      botJobs: {
        ...prev.botJobs,
        'content-creator': {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              status: 'concluded',
              decisions: plan.decisions,
              outcomeSummary,
              linkedArtifacts: mergeArtifactRefs(
                m.linkedArtifacts,
                savedArtifactRef!
              ),
            }
          : m
      ),
      activity: [
        createActivityEvent(
          'content-creator',
          'Draft created from conversation',
          outcomeSummary,
          savedArtifactRef,
          { meetingId, focusId: f.focusId }
        ),
        ...prev.activity,
      ],
    }));
  } else if (plan.followUp.kind === 'add-project-task') {
    const f = plan.followUp;
    const state = cb.getState();
    const targetProject =
      state.projects.find((p) => p.id === f.projectId) || state.projects[0];

    if (targetProject) {
      const taskId = makeId('ptask');
      savedArtifactRef = {
        kind: 'project',
        id: targetProject.id,
        label: `Project: ${targetProject.title}`,
        botId: 'project-tracker',
      };
      outcomeSummary = `Added task "${f.taskTitle}" to ${targetProject.title}.`;

      cb.updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === targetProject.id
            ? {
                ...p,
                tasks: [
                  ...p.tasks,
                  {
                    id: taskId,
                    title: f.taskTitle,
                    owner: f.taskOwner,
                    dueDate: '2026-12-03',
                    status: 'todo',
                    blocked: false,
                    blockerNote: '',
                    focusId: f.focusId,
                  },
                ],
              }
            : p
        ),
        botJobs: {
          ...prev.botJobs,
          'project-tracker': {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        meetings: prev.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: 'concluded',
                decisions: plan.decisions,
                outcomeSummary,
                linkedArtifacts: mergeArtifactRefs(
                  m.linkedArtifacts,
                  savedArtifactRef!
                ),
              }
            : m
        ),
        activity: [
          createActivityEvent(
            'project-tracker',
            'Follow-up task added',
            outcomeSummary,
            savedArtifactRef,
            { meetingId, focusId: f.focusId }
          ),
          ...prev.activity,
        ],
      }));
    }
  } else if (plan.followUp.kind === 'tag-and-note-lead') {
    const f = plan.followUp;
    const state = cb.getState();
    const targetLead =
      state.leads.find((l) => l.id === f.leadId) || state.leads[0];
    if (targetLead) {
      savedArtifactRef = {
        kind: 'lead',
        id: targetLead.id,
        label: `Lead: ${targetLead.businessName}`,
        botId: 'lead-finder',
      };
      outcomeSummary = f.noteSummary;

      cb.updateState((prev) => ({
        ...prev,
        leads: prev.leads.map((l) =>
          l.id === targetLead.id
            ? {
                ...l,
                status: 'evaluated',
                tags: Array.from(new Set([...(l.tags || []), f.tag])),
              }
            : l
        ),
        botJobs: {
          ...prev.botJobs,
          'lead-finder': {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        meetings: prev.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: 'concluded',
                decisions: plan.decisions,
                outcomeSummary,
                linkedArtifacts: mergeArtifactRefs(
                  m.linkedArtifacts,
                  savedArtifactRef!
                ),
              }
            : m
        ),
        activity: [
          createActivityEvent(
            'lead-finder',
            'Lead tagged from sync',
            outcomeSummary,
            savedArtifactRef,
            { meetingId, focusId: f.focusId }
          ),
          ...prev.activity,
        ],
      }));
    }
  }

  // If this step belonged to Today's focus, check whether all expected results are now saved
  if (plan.focusId) {
    const stepFocusId = plan.focusId;
    cb.updateState((prev) => {
      if (!prev.todayFocus || prev.todayFocus.id !== stepFocusId) {
        return prev;
      }
      const progress = computeFocusProgress(prev, prev.todayFocus);
      if (!progress.isComplete || prev.todayFocus.status === 'completed') {
        return prev;
      }

      const completedFocus = {
        ...prev.todayFocus,
        status: 'completed' as const,
        completedAt: nowStamp(),
      };

      let nextReviewQueue = prev.reviewQueue;
      if (completedFocus.requestConsolidatedReview) {
        const consolidatedReview: ReviewItem = {
          id: makeId('rev'),
          dedupeKey: `focus-review:${completedFocus.id}`,
          kind: 'final-deliverable',
          title: `Today's Focus Complete: ${progress.progressLabel}`,
          summary: `${completedFocus.goal} All ${progress.targetCount} results are saved and linked below for one consolidated owner review.`,
          deliverableText: progress.linkedResults
            .map((r, idx) => `${idx + 1}. ${r.label}`)
            .join('\n'),
          decisionSummary: [
            `Completed focus (${progress.progressLabel}).`,
            'All results saved and linked below in one consolidated review.',
          ],
          status: 'pending',
          createdAt: nowStamp(),
          linkedArtifacts: progress.linkedResults,
          revisionNumber: 1,
          mode: cb.runner.mode,
        };
        nextReviewQueue = enqueueReviewItemIdempotent(
          prev.reviewQueue,
          consolidatedReview
        );
      }

      return {
        ...prev,
        todayFocus: completedFocus,
        reviewQueue: nextReviewQueue,
        activity: [
          createActivityEvent(
            'business-strategist',
            "Today's focus completed",
            `${progress.progressLabel} — ${completedFocus.goal}`,
            progress.linkedResults[0],
            { meetingId, focusId: completedFocus.id }
          ),
          ...prev.activity,
        ],
      };
    });
  }

  if (plan.whiteboardLines.length > 0 && savedArtifactRef) {
    const finalRef = savedArtifactRef;
    cb.updateState((prev) => {
      const currentMeeting = prev.meetings.find((m) => m.id === meetingId);
      const snapshot = buildWhiteboardSnapshotFromMeeting(
        {
          ...(currentMeeting ?? initialRecord),
          whiteboardLines: plan.whiteboardLines,
          decisions: plan.decisions,
          nextSteps: plan.nextSteps,
        },
        prev.projects,
        {
          linkedArtifacts: [finalRef],
          projectId: finalRef.kind === 'project' ? finalRef.id : undefined,
        }
      );
      if (!snapshot) return prev;
      return {
        ...prev,
        whiteboardHistory: upsertWhiteboardSnapshot(
          prev.whiteboardHistory,
          snapshot
        ),
      };
    });
  }

  // Walk Content Creator back to desk cleanly if they worked in Content Studio
  if (plan.followUp.workRoom === 'content-studio') {
    cb.setPresence(ownerId, {
      activity: 'walking',
      room: 'open-work',
      targetNodeId: getDeskNodeId(ownerId),
      posture: 'standing',
      activeArtifact: savedArtifactRef,
      activeMeetingId: undefined,
    });
    await wait(Math.min(pacing.walkToDeskMs, 950));
  }

  cb.setPresence(ownerId, {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId(ownerId),
    posture: 'seated',
    lookAtBotId: undefined,
    speech: undefined,
    activeArtifact: savedArtifactRef,
    activeMeetingId: undefined,
  });

  return (
    cb.getState().meetings.find((m) => m.id === meetingId) ?? {
      ...initialRecord,
      status: 'concluded',
      decisions: plan.decisions,
      outcomeSummary,
    }
  );
}

/**
 * Executes a manually assigned job end-to-end across Lead Finder, Business Strategist,
 * Project Tracker, and Content Creator, preserving approval/review rules in Needs me.
 */
export async function runCollaborativeAssignment(
  rawPrompt: string,
  options: { includePromoPost?: boolean },
  cb: OrchestratorCallbacks
): Promise<AssignmentRecord | null> {
  const prompt = rawPrompt.trim();
  if (!prompt) return null;

  if (isLeadOutreachPipelinePrompt(prompt)) {
    return runTeamLeadOutreachPipeline(prompt, cb);
  }

  const pacing = cb.pacing ?? DEFAULT_PACING;
  const plan = classifyAssignment(prompt, options);
  const assignmentId = makeId('asgn');
  const createdAt = nowStamp();

  /* ----------------------- 1. HIGH-IMPACT ACTION FLOW ---------------------- */
  if (plan.tier === 'high-impact' && plan.highImpactActionType) {
    const state = cb.getState();
    const leadBot = plan.participants[0];
    const latestStrategy = state.strategyBriefs[0];
    const latestLead = state.leads[0];
    const latestContent = state.contentQueue[0];

    const step: AssignmentStep = {
      id: makeId('step'),
      botId: leadBot,
      label: `Prepare ${plan.title} & pause for human approval`,
      status: 'waiting-approval',
    };

    const assignment: AssignmentRecord = {
      id: assignmentId,
      prompt,
      title: plan.title,
      tier: 'high-impact',
      createdAt,
      status: 'awaiting-approval',
      participants: plan.participants,
      steps: [step],
      linkedArtifacts: [],
      revisionCount: 0,
    };

    cb.setPresence(leadBot, {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId(leadBot),
      posture: 'seated',
      speech: 'Drafting exact action preview for approval...',
    });

    await wait(Math.min(pacing.deskWorkMs, 350));

    let preview: ExternalActionPreview;
    const linkedArtifacts: LinkedArtifactRef[] = [];

    if (plan.highImpactActionType === 'send-external-message') {
      const targetName =
        latestLead?.businessName ||
        latestStrategy?.niche ||
        'Prospective Client (Fictional)';
      const priceStr = latestStrategy?.estimatedPriceRange || '$6,500 (3 weeks)';
      if (latestStrategy) {
        linkedArtifacts.push({
          kind: 'strategy',
          id: latestStrategy.id,
          label: `Experiment: ${latestStrategy.title.slice(0, 44)}`,
          botId: 'business-strategist',
        });
      }
      if (latestLead) {
        linkedArtifacts.push({
          kind: 'lead',
          id: latestLead.id,
          label: `Lead: ${latestLead.businessName}`,
          botId: 'lead-finder',
        });
      }
      preview = {
        actionType: 'send-external-message',
        targetLabel: targetName,
        recipient: `owner@${slugKey(targetName.replace(/fictional|demo/gi, '')) || 'client'}.example`,
        subject: `Rhymvex Pilot Offer: ${latestStrategy?.serviceIdea || plan.service}`,
        priceOrDeadline: priceStr,
        bodyPreview: `Hi ${targetName} team,\n\nSharing our tailored Rhymvex workflow pilot: ${latestStrategy?.serviceIdea || plan.service} (${priceStr}), including a dedicated Owner Handoff milestone.\n\nReply if you'd like a quick 10-minute walkthrough.\n— Rhymvex`,
        recordId: latestStrategy?.id || latestLead?.id,
      };
    } else if (plan.highImpactActionType === 'publish-content') {
      const targetDraft = latestContent;
      if (targetDraft) {
        linkedArtifacts.push({
          kind: 'content',
          id: targetDraft.id,
          label: `${targetDraft.platform}: ${targetDraft.hook.slice(0, 42)}`,
          botId: 'content-creator',
        });
      }
      preview = {
        actionType: 'publish-content',
        targetLabel: targetDraft?.hook || plan.title,
        channel: targetDraft?.platform || 'LinkedIn',
        bodyPreview: targetDraft
          ? `${targetDraft.hook}\n\n${targetDraft.body}\n\n${targetDraft.callToAction}`
          : `Proposed channel post for "${plan.title}" awaiting approval before publishing.`,
        recordId: targetDraft?.id,
      };
    } else if (plan.highImpactActionType === 'commit-price-deadline') {
      preview = {
        actionType: 'commit-price-deadline',
        targetLabel: latestStrategy?.title || plan.title,
        priceOrDeadline: latestStrategy?.estimatedPriceRange || '$6,500 · 3 weeks',
        bodyPreview: `Commit formal pilot terms (${latestStrategy?.estimatedPriceRange || '$6,500 · 3 weeks'}) for ${latestStrategy?.niche || 'client'}.`,
        recordId: latestStrategy?.id,
      };
    } else {
      preview = {
        actionType: 'delete-record',
        targetLabel: latestLead?.businessName || plan.title,
        bodyPreview: `Permanently delete saved record "${latestLead?.businessName || plan.title}" from workspace storage.`,
        recordId: latestLead?.id,
      };
    }

    assignment.linkedArtifacts = linkedArtifacts;

    const reviewItem: ReviewItem = {
      id: makeId('rev'),
      dedupeKey: `high-impact:${plan.highImpactActionType}:${preview.recordId || slugKey(plan.title)}`,
      kind: 'high-impact-action',
      assignmentId,
      title: `Approve: ${plan.title}`,
      decisionQuestion: `${plan.title}?`,
      summary: `Paused before executing high-impact action (${preview.actionType.replace(/-/g, ' ')}). Review exact details before proceeding.`,
      whyNeeded:
        'External sends, publishing, commercial commitments, and deletions require owner authorization.',
      recommendedOptionId: 'approve-send',
      recommendedLabel: 'Approve & Execute (Simulated)',
      escalationReason: 'external-authorization',
      options: [
        {
          id: 'approve-send',
          label: 'Approve & Execute (Simulated)',
          description: 'Team Lead executes this action in simulation mode and logs it.',
          action: 'approve-send',
        },
        {
          id: 'hold',
          label: 'Hold / Reject',
          description: 'Do not execute externally.',
          action: 'hold',
        },
      ],
      linkedArtifacts,
      proposedAction: preview,
      status: 'pending',
      createdAt: nowStamp(),
      revisionNumber: 1,
      mode: cb.runner.mode,
    };

    cb.setPresence(leadBot, {
      activity: 'waiting',
      room: 'open-work',
      targetNodeId: getDeskNodeId(leadBot),
      posture: 'seated',
      speech: 'Paused — waiting for approval in Needs me.',
      activeArtifact: linkedArtifacts[0],
    });

    cb.updateState((prev) => ({
      ...prev,
      assignments: [assignment, ...prev.assignments],
      reviewQueue: enqueueReviewItemIdempotent(prev.reviewQueue, reviewItem),
      botJobs: {
        ...prev.botJobs,
        [leadBot]: {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      activity: [
        createActivityEvent(
          leadBot,
          'Approval requested (High-impact)',
          `Paused "${plan.title}" — waiting in Needs me before simulated execution.`,
          linkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));

    return assignment;
  }

  /* --------------------------- 2. SMALL AUTO TASK -------------------------- */
  if (plan.tier === 'small') {
    const botId = plan.participants[0];
    const step: AssignmentStep = {
      id: makeId('step'),
      botId,
      label: plan.title,
      status: 'running',
    };
    const assignment: AssignmentRecord = {
      id: assignmentId,
      prompt,
      title: plan.title,
      tier: 'small',
      createdAt,
      status: 'running',
      participants: [botId],
      steps: [step],
      linkedArtifacts: [],
      revisionCount: 0,
    };

    cb.updateState((prev) => ({
      ...prev,
      assignments: [assignment, ...prev.assignments],
      botJobs: {
        ...prev.botJobs,
        [botId]: { status: 'running', mode: cb.runner.mode },
      },
    }));

    cb.setPresence(botId, {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId(botId),
      posture: 'seated',
      speech: `Handling "${plan.title}" automatically...`,
    });

    await wait(pacing.deskWorkMs);

    let detail = `Completed routine task "${plan.title}" and saved automatically.`;
    let artifactRef: LinkedArtifactRef | undefined;

    cb.updateState((prev) => {
      let nextLeads = prev.leads;
      let nextProjects = prev.projects;

      if (botId === 'lead-finder' && prev.leads.length > 0) {
        const tag =
          plan.industry === 'Service Businesses'
            ? 'priority-ops'
            : slugKey(plan.industry);
        nextLeads = prev.leads.map((l, idx) =>
          idx === 0
            ? {
                ...l,
                tags: Array.from(new Set([...(l.tags || []), tag, 'auto-tagged'])),
              }
            : l
        );
        detail = `Tagged "${prev.leads[0].businessName}" with [${tag}, auto-tagged] automatically.`;
        artifactRef = {
          kind: 'lead',
          id: prev.leads[0].id,
          label: prev.leads[0].businessName,
          botId: 'lead-finder',
        };
      } else if (botId === 'project-tracker' && prev.projects.length > 0) {
        const proj = prev.projects[0];
        const openTask = proj.tasks.find((t) => t.status === 'todo');
        if (openTask) {
          nextProjects = prev.projects.map((p) =>
            p.id === proj.id
              ? {
                  ...p,
                  tasks: p.tasks.map((t) =>
                    t.id === openTask.id
                      ? { ...t, status: 'in-progress' as const }
                      : t
                  ),
                }
              : p
          );
          detail = `Updated internal task "${openTask.title}" to In progress automatically.`;
          artifactRef = {
            kind: 'project',
            id: proj.id,
            label: proj.title,
            botId: 'project-tracker',
          };
        }
      }

      return {
        ...prev,
        leads: nextLeads,
        projects: nextProjects,
        assignments: prev.assignments.map((a) =>
          a.id === assignmentId
            ? {
                ...a,
                status: 'completed',
                steps: a.steps.map((s) => ({
                  ...s,
                  status: 'completed',
                  outputSummary: detail,
                })),
              }
            : a
        ),
        botJobs: {
          ...prev.botJobs,
          [botId]: {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(botId, 'Small task auto-saved', detail, artifactRef),
          ...prev.activity,
        ],
      };
    });

    cb.setPresence(botId, {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId(botId),
      posture: 'seated',
      speech: undefined,
      activeArtifact: artifactRef,
    });

    return cb.getState().assignments.find((a) => a.id === assignmentId) ?? assignment;
  }

  /* ------------- 3. MEDIUM & FINAL DELIVERABLE COLLABORATIVE FLOW ---------- */
  const attendees = plan.participants;
  const includePromo = plan.includePromoPost && attendees.includes('content-creator');

  const steps: AssignmentStep[] = [
    {
      id: makeId('step'),
      botId: 'lead-finder',
      label: `Research 3 fictional ${plan.industry.toLowerCase()} prospects`,
      status: 'pending',
    },
    {
      id: makeId('step'),
      botId: 'business-strategist',
      label: `Evaluate niche & draft ${plan.service} experiment brief`,
      status: 'pending',
    },
    ...(attendees.includes('project-tracker')
      ? [
          {
            id: makeId('step'),
            botId: 'project-tracker' as BotId,
            label: 'Create project outline with Owner Handoff milestone',
            status: 'pending' as const,
          },
        ]
      : []),
    ...(includePromo
      ? [
          {
            id: makeId('step'),
            botId: 'content-creator' as BotId,
            label: 'Draft matching promotional post in Content Studio',
            status: 'pending' as const,
          },
        ]
      : []),
  ];

  const meetingId = makeId('mtg');
  const assignment: AssignmentRecord = {
    id: assignmentId,
    prompt,
    title: plan.title,
    tier: plan.tier,
    includePromoPost: includePromo,
    createdAt,
    status: 'running',
    participants: attendees,
    steps,
    meetingId,
    linkedArtifacts: [],
    revisionCount: 0,
  };

  cb.updateState((prev) => ({
    ...prev,
    assignments: [assignment, ...prev.assignments],
    activity: [
      createActivityEvent(
        attendees[0],
        'Assignment started',
        `Routing "${plan.title}" to ${attendees.length} coworkers — walking to Glass Meeting Room.`
      ),
      ...prev.activity,
    ],
  }));

  const leadRes = await cb.runner.run('lead-finder', {
    industry: plan.industry,
    location: plan.location,
    targetClient: plan.targetClient,
    service: plan.service,
  });
  const researchedCandidates = leadRes.ok ? leadRes.output.leads : [];

  // Reserve a unique meeting chair for each participant through the authoritative queue store
  const chairByBot = new Map<BotId, string>();
  cb.updateState((prev) => {
    const q = prev.officeQueue ?? createInitialOfficeQueueState();
    const { state: nextQueue, reservations } = reserveMeetingChairs(
      q,
      attendees,
      assignmentId,
      plan.title
    );
    for (const r of reservations) {
      chairByBot.set(r.botId, r.assignedNodeId);
    }
    return { ...prev, officeQueue: nextQueue };
  });

  for (const botId of attendees) {
    cb.setPresence(botId, {
      activity: 'walking',
      room: 'meeting-room',
      targetNodeId: chairByBot.get(botId) ?? getMeetingNodeId(botId),
      posture: 'standing',
      lookAtBotId: undefined,
      speech:
        botId === 'lead-finder'
          ? `Bringing 3 ${plan.industry.toLowerCase()} leads to the meeting...`
          : 'Walking to Glass Meeting Room...',
    });
  }
  await wait(pacing.walkToMeetingMs);

  const meetingRes = await cb.runner.runMeetingBrief({
    assignmentId,
    title: plan.title,
    industry: plan.industry,
    location: plan.location,
    service: plan.service,
    attendees,
    leadNames: researchedCandidates.map((c) => c.businessName),
    includePromoPost: includePromo,
  });

  const meetingOutput = meetingRes.ok
    ? meetingRes.output
    : {
        title: plan.title,
        turns: [],
        whiteboardLines: [`MEETING: ${plan.title}`],
        decisions: [`Agreed on ${plan.service}`],
        nextSteps: [],
        recommendedDeliverables: [plan.service, 'Owner handoff milestone'],
        recommendedBudget: '$6,500',
        recommendedTimeline: '3 weeks',
      };

  const meetingRecord: MeetingRecord = {
    id: meetingId,
    assignmentId,
    title: meetingOutput.title,
    startedAt: nowStamp(),
    status: 'active',
    format: attendees.length >= 4 ? 'all-hands' : attendees.length === 3 ? 'trio' : 'pair',
    venue: 'meeting-room',
    source: 'assigned',
    attendees,
    followUpOwner: 'business-strategist',
    followUpTask: meetingOutput.nextSteps[0]?.task,
    turns: [],
    whiteboardLines: [meetingOutput.whiteboardLines[0] || `MEETING: ${plan.title}`],
    decisions: [],
    nextSteps: meetingOutput.nextSteps,
  };

  cb.updateState((prev) => ({
    ...prev,
    meetings: [meetingRecord, ...prev.meetings],
  }));
  cb.setWhiteboard(meetingRecord.whiteboardLines, true);

  for (let i = 0; i < meetingOutput.turns.length; i++) {
    const turn = meetingOutput.turns[i];
    const visibleBoard = meetingOutput.whiteboardLines.slice(
      0,
      Math.min(meetingOutput.whiteboardLines.length, i + 2)
    );
    cb.setWhiteboard(visibleBoard, true);

    for (const botId of attendees) {
      const spot = MEETING_SPOTS[botId];
      const isSpeaker = botId === turn.speaker;
      cb.setPresence(botId, {
        activity: 'discussing',
        room: 'meeting-room',
        targetNodeId: spot.nodeId,
        posture: 'seated',
        lookAtBotId: isSpeaker ? undefined : turn.speaker,
        speech: isSpeaker ? turn.bubbleText : undefined,
        activeMeetingId: meetingId,
      });
    }

    cb.updateState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              turns: [...m.turns, turn],
              whiteboardLines: visibleBoard,
              decisions:
                i === meetingOutput.turns.length - 1
                  ? meetingOutput.decisions
                  : m.decisions,
            }
          : m
      ),
    }));

    await wait(pacing.turnSpeechMs);
  }

  cb.setWhiteboard(meetingOutput.whiteboardLines, false);
  const meetingCapturedAt = nowStamp();
  cb.updateState((prev) => {
    const updatedMeetings = prev.meetings.map((m) =>
      m.id === meetingId
        ? {
            ...m,
            status: 'concluded' as const,
            decisions: meetingOutput.decisions,
            whiteboardLines: meetingOutput.whiteboardLines,
          }
        : m
    );
    const concludedMeeting = updatedMeetings.find((m) => m.id === meetingId);
    const snapshot = concludedMeeting
      ? buildWhiteboardSnapshotFromMeeting(concludedMeeting, prev.projects, {
          capturedAt: meetingCapturedAt,
        })
      : null;

    return {
      ...prev,
      meetings: updatedMeetings,
      whiteboardHistory: snapshot
        ? upsertWhiteboardSnapshot(prev.whiteboardHistory, snapshot)
        : prev.whiteboardHistory,
      activeWhiteboardSnapshotId: snapshot
        ? snapshot.id
        : prev.activeWhiteboardSnapshotId,
      activity: [
        createActivityEvent(
          'business-strategist',
          'Meeting concluded',
          `${plan.title}: ${meetingOutput.decisions.length} decisions recorded on whiteboard.`,
          undefined,
          { meetingId }
        ),
        ...prev.activity,
      ],
    };
  });

  // Release meeting chair reservations atomically as coworkers leave the Glass Meeting Room
  cb.updateState((prev) => {
    const q = prev.officeQueue ?? createInitialOfficeQueueState();
    const { state: nextQueue } = cancelAssignmentReservations(q, assignmentId);
    return { ...prev, officeQueue: nextQueue };
  });

  for (const botId of attendees) {
    const goStudio = botId === 'content-creator' && includePromo;
    cb.setPresence(botId, {
      activity: 'walking',
      room: goStudio ? 'content-studio' : 'open-work',
      targetNodeId: goStudio ? CONTENT_STUDIO_SPOT.nodeId : getDeskNodeId(botId),
      posture: 'standing',
      lookAtBotId: undefined,
      speech: goStudio
        ? 'Heading to Content Studio to draft promo post...'
        : 'Returning to desk to execute...',
      activeMeetingId: meetingId,
    });
  }
  await wait(pacing.walkToDeskMs);

  const linkedArtifacts: LinkedArtifactRef[] = [];

  // F1: Lead Finder saves 3 fictional leads automatically
  cb.setPresence('lead-finder', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    speech: 'Saving 3 fictional prospects to pipeline...',
  });
  await wait(pacing.deskWorkMs);

  const savedLeads: LeadRecord[] = researchedCandidates.map((cand, idx) => ({
    ...cand,
    id: `lead-${assignmentId}-${idx + 1}`,
    savedAt: nowStamp(),
    status: idx === 0 ? 'evaluated' : 'saved',
    tags: [slugKey(plan.industry), 'meeting-qualified'],
    isDemo: false,
  }));

  let leadRef: LinkedArtifactRef | undefined;
  if (savedLeads[0]) {
    leadRef = {
      kind: 'lead',
      id: savedLeads[0].id,
      label: `3 Fictional Leads (${savedLeads[0].businessName.replace(' (Fictional)', '')} + 2 more)`,
      botId: 'lead-finder',
    };
    linkedArtifacts.push(leadRef);
  }

  cb.updateState((prev) => ({
    ...prev,
    leads: [...savedLeads, ...prev.leads],
    botJobs: {
      ...prev.botJobs,
      'lead-finder': { status: 'ready', mode: cb.runner.mode, lastRunAt: nowStamp() },
    },
    assignments: prev.assignments.map((a) =>
      a.id === assignmentId
        ? {
            ...a,
            steps: a.steps.map((s) =>
              s.botId === 'lead-finder'
                ? {
                    ...s,
                    status: 'completed',
                    outputSummary: `Saved ${savedLeads.length} fictional ${plan.industry.toLowerCase()} prospects.`,
                  }
                : s
            ),
          }
        : a
    ),
    activity: [
      createActivityEvent(
        'lead-finder',
        'Lead research auto-saved',
        `Saved ${savedLeads.length} fictional ${plan.industry.toLowerCase()} businesses to pipeline.`,
        leadRef
      ),
      ...prev.activity,
    ],
  }));
  cb.setPresence('lead-finder', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    speech: undefined,
    activeArtifact: leadRef,
  });

  // F2: Business Strategist evaluates niche & saves structured Strategy Experiment automatically
  let savedStrategy: StrategyExperimentRecord | null = null;
  if (attendees.includes('business-strategist')) {
    cb.setPresence('business-strategist', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      speech: 'Drafting service experiment brief...',
    });

    const stratRes = await cb.runner.run('business-strategist', {
      niche: plan.industry,
      serviceIdea: plan.service,
      workspaceContext: `Meeting agreed on ${meetingOutput.recommendedBudget} / ${meetingOutput.recommendedTimeline} with mandatory Owner Handoff milestone.`,
      sourceLeadNames: savedLeads.map((l) => l.businessName),
    });

    await wait(Math.min(pacing.deskWorkMs, 360));

    if (stratRes.ok) {
      savedStrategy = {
        ...stratRes.output.experiment,
        id: `strat-${assignmentId}`,
        createdAt: nowStamp(),
        status: 'testing',
        sourceLeadIds: savedLeads.map((l) => l.id),
        isDemo: false,
      };
      const stratRef: LinkedArtifactRef = {
        kind: 'strategy',
        id: savedStrategy.id,
        label: `Experiment: ${savedStrategy.title.slice(0, 44)}`,
        botId: 'business-strategist',
      };
      linkedArtifacts.push(stratRef);

      cb.updateState((prev) => ({
        ...prev,
        strategyBriefs: [savedStrategy!, ...prev.strategyBriefs],
        botJobs: {
          ...prev.botJobs,
          'business-strategist': {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        assignments: prev.assignments.map((a) =>
          a.id === assignmentId
            ? {
                ...a,
                steps: a.steps.map((s) =>
                  s.botId === 'business-strategist'
                    ? {
                        ...s,
                        status: 'completed',
                        outputSummary: `Saved experiment brief (${savedStrategy!.estimatedPriceRange}).`,
                      }
                    : s
                ),
              }
            : a
        ),
        activity: [
          createActivityEvent(
            'business-strategist',
            'Strategy brief auto-saved',
            `${savedStrategy!.title} (${savedStrategy!.estimatedPriceRange}).`,
            stratRef
          ),
          ...prev.activity,
        ],
      }));
    }

    cb.setPresence('business-strategist', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      speech: undefined,
      activeArtifact: savedStrategy
        ? {
            kind: 'strategy',
            id: savedStrategy.id,
            label: savedStrategy.title,
            botId: 'business-strategist',
          }
        : undefined,
    });
  }

  // F3: Project Tracker creates & saves delivery outline with Owner Handoff milestone automatically
  let savedProject: ProjectRecord | null = null;
  if (attendees.includes('project-tracker') && savedStrategy) {
    cb.setPresence('project-tracker', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('project-tracker'),
      posture: 'seated',
      speech: 'Building delivery outline & Owner Handoff milestone...',
    });

    const primaryClient =
      savedLeads[0]?.businessName || `${plan.industry} Pilot (Fictional)`;
    const projRes = await cb.runner.run('project-tracker', {
      mode: 'create-plan',
      strategyId: savedStrategy.id,
      clientName: primaryClient,
      projectTitle: `${primaryClient.replace(' (Fictional)', '')} Pilot Delivery`,
      goal: savedStrategy.serviceIdea,
      deliverables: meetingOutput.recommendedDeliverables,
      timeline: meetingOutput.recommendedTimeline,
      includeHandoffMilestone: true,
    });

    await wait(Math.min(pacing.deskWorkMs, 360));

    if (projRes.ok && projRes.output.mode === 'create-plan') {
      const projectId = `proj-${assignmentId}`;
      savedProject = {
        id: projectId,
        strategyId: savedStrategy.id,
        clientName: primaryClient,
        title: `${primaryClient.replace(' (Fictional)', '')} Pilot Delivery`,
        summary: projRes.output.summary,
        status: 'active',
        createdAt: nowStamp(),
        milestones: projRes.output.milestones,
        tasks: projRes.output.tasks,
        clientUpdates: [],
        isDemo: false,
      };
      savedProject.status = deriveProjectStatus(savedProject);

      const projRef: LinkedArtifactRef = {
        kind: 'project',
        id: savedProject.id,
        label: `Project Outline: ${savedProject.title} (${savedProject.milestones.length} milestones)`,
        botId: 'project-tracker',
      };
      linkedArtifacts.push(projRef);

      cb.updateState((prev) => {
        const nextProjects = [savedProject!, ...prev.projects];
        const currentMeeting = prev.meetings.find((m) => m.id === meetingId);
        const enrichedSnapshot = currentMeeting
          ? buildWhiteboardSnapshotFromMeeting(currentMeeting, nextProjects, {
              projectId: savedProject!.id,
              projectTitle: savedProject!.title,
              linkedArtifacts: [...linkedArtifacts],
            })
          : null;

        return {
          ...prev,
          strategyBriefs: prev.strategyBriefs.map((s) =>
            s.id === savedStrategy!.id ? { ...s, projectId } : s
          ),
          projects: nextProjects,
          whiteboardHistory: enrichedSnapshot
            ? upsertWhiteboardSnapshot(prev.whiteboardHistory, enrichedSnapshot)
            : prev.whiteboardHistory,
          botJobs: {
            ...prev.botJobs,
            'project-tracker': {
              status: 'ready',
              mode: cb.runner.mode,
              lastRunAt: nowStamp(),
            },
          },
          assignments: prev.assignments.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  steps: a.steps.map((s) =>
                    s.botId === 'project-tracker'
                      ? {
                          ...s,
                          status: 'completed',
                          outputSummary: `Saved project outline with ${savedProject!.milestones.length} milestones & ${savedProject!.tasks.length} tasks.`,
                        }
                      : s
                  ),
                }
              : a
          ),
          activity: [
            createActivityEvent(
              'project-tracker',
              'Project outline auto-saved',
              `${savedProject!.title} created with Owner Handoff milestone.`,
              projRef
            ),
            ...prev.activity,
          ],
        };
      });
    }

    cb.setPresence('project-tracker', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('project-tracker'),
      posture: 'seated',
      speech: undefined,
      activeArtifact: savedProject
        ? {
            kind: 'project',
            id: savedProject.id,
            label: savedProject.title,
            botId: 'project-tracker',
          }
        : undefined,
    });
  }

  // F4: Optional Content Creator drafts promotional post in Content Studio
  if (includePromo) {
    cb.setPresence('content-creator', {
      activity: 'working',
      room: 'content-studio',
      targetNodeId: CONTENT_STUDIO_SPOT.nodeId,
      posture: 'seated',
      speech: 'Drafting promotional post in Content Studio...',
    });

    const contentRes = await cb.runner.run('content-creator', {
      platform: 'LinkedIn',
      topic: `${plan.industry} inquiry & owner job tracking`,
      offer: plan.service,
      tone: 'Practical & direct',
      cta: 'Reply "OFFER" for our 1-page inquiry & tracker breakdown.',
    });

    await wait(Math.min(pacing.deskWorkMs, 340));

    if (contentRes.ok && contentRes.output.drafts[0]) {
      const topDraft = contentRes.output.drafts[0];
      const queued: ContentQueueRecord = {
        ...topDraft,
        id: `cnt-${assignmentId}`,
        platform: 'LinkedIn',
        topic: `${plan.industry} inquiry & owner job tracking`,
        offer: plan.service,
        tone: 'Practical & direct',
        savedAt: nowStamp(),
        queueStatus: 'completed',
        sourceMeetingId: meetingId,
        isDemo: false,
      };
      const contentRef: LinkedArtifactRef = {
        kind: 'content',
        id: queued.id,
        label: `Promo Post Draft (LinkedIn): ${queued.hook.slice(0, 44)}`,
        botId: 'content-creator',
      };
      linkedArtifacts.push(contentRef);

      cb.updateState((prev) => ({
        ...prev,
        contentQueue: [queued, ...prev.contentQueue],
        botJobs: {
          ...prev.botJobs,
          'content-creator': {
            status: 'ready',
            mode: cb.runner.mode,
            lastRunAt: nowStamp(),
          },
        },
        assignments: prev.assignments.map((a) =>
          a.id === assignmentId
            ? {
                ...a,
                steps: a.steps.map((s) =>
                  s.botId === 'content-creator'
                    ? {
                        ...s,
                        status: 'completed',
                        outputSummary: 'Saved LinkedIn promo post draft to Content Queue.',
                      }
                    : s
                ),
              }
            : a
        ),
        activity: [
          createActivityEvent(
            'content-creator',
            'Promo draft auto-saved',
            `Saved LinkedIn promo draft aligned to "${plan.title}".`,
            contentRef
          ),
          ...prev.activity,
        ],
      }));
    }

    cb.setPresence('content-creator', {
      activity: 'walking',
      room: 'open-work',
      targetNodeId: getDeskNodeId('content-creator'),
      posture: 'standing',
      speech: undefined,
    });
    await wait(Math.min(pacing.walkToDeskMs, 750));
    cb.setPresence('content-creator', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('content-creator'),
      posture: 'seated',
      speech: undefined,
    });
  }

  // Step G: Final Deliverables create EXACTLY ONE review item in Needs me
  if (plan.tier === 'final-deliverable') {
    const deliverableLines = [
      `Offer Experiment Package: ${plan.title}`,
      `Prospects: ${savedLeads.map((l) => l.businessName).join(', ')}`,
      savedStrategy
        ? `Strategy Hypothesis (${savedStrategy.estimatedPriceRange}): ${savedStrategy.hypothesis}`
        : `Proposed Offer: ${plan.service}`,
      savedProject
        ? `Delivery Plan: ${savedProject.milestones.map((m) => m.title).join(' -> ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const finalReview: ReviewItem = {
      id: makeId('rev'),
      dedupeKey: `final-deliverable:${assignmentId}`,
      kind: 'final-deliverable',
      assignmentId,
      title: `Final Deliverable: ${plan.title}`,
      decisionQuestion: `Approve commercial offer package for ${plan.industry}?`,
      summary: `${savedLeads.length} fictional prospects, strategy experiment (${savedStrategy?.estimatedPriceRange || '$6,500'}), and project outline with Owner Handoff milestone are ready for your decision.`,
      whyNeeded:
        'Team Lead approved internal research and delivery milestones, and escalated pricing and offer scope for your owner sign-off.',
      recommendedOptionId: 'approve-send',
      recommendedLabel: 'Approve offer package',
      escalationReason: 'owner-judgment',
      options: [
        {
          id: 'approve-send',
          label: 'Approve offer package',
          description: 'Accept the recommended pricing, scope, and Owner Handoff milestone.',
          action: 'approve-send',
        },
        {
          id: 'save-drafts-only',
          label: 'Keep as internal reference',
          description: 'Save the research and delivery outline without commercial sign-off.',
          action: 'save-drafts-only',
        },
      ],
      deliverableText: deliverableLines,
      decisionSummary: meetingOutput.decisions,
      linkedArtifacts,
      status: 'pending',
      createdAt: nowStamp(),
      revisionNumber: 1,
      mode: cb.runner.mode,
    };

    cb.setPresence('business-strategist', {
      activity: 'waiting',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      speech: 'Final deliverable is ready in Needs me.',
      activeArtifact: linkedArtifacts[1] || linkedArtifacts[0],
    });

    cb.updateState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              status: 'awaiting-review',
              linkedArtifacts,
            }
          : a
      ),
      meetings: prev.meetings.map((m) =>
        m.id === meetingId ? { ...m, linkedArtifacts } : m
      ),
      reviewQueue: enqueueReviewItemIdempotent(prev.reviewQueue, finalReview),
      activity: [
        createActivityEvent(
          'business-strategist',
          'Final deliverable queued for review',
          `1 consolidated review item added to Needs me for "${plan.title}".`,
          linkedArtifacts[1] || linkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));
  } else {
    cb.updateState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              status: 'completed',
              linkedArtifacts,
            }
          : a
      ),
      meetings: prev.meetings.map((m) =>
        m.id === meetingId ? { ...m, linkedArtifacts } : m
      ),
      activity: [
        createActivityEvent(
          'business-strategist',
          'Medium workflow completed',
          `Intermediate work saved automatically for "${plan.title}".`,
          linkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));
  }

  return cb.getState().assignments.find((a) => a.id === assignmentId) ?? assignment;
}

/**
 * Resumes from the affected step when the user clicks "Request changes" on a final deliverable.
 */
export async function resumeRevisionFromFeedback(
  reviewItem: ReviewItem,
  feedbackNote: string,
  cb: OrchestratorCallbacks
): Promise<void> {
  const note = feedbackNote.trim();
  if (!note) return;

  const pacing = cb.pacing ?? DEFAULT_PACING;
  const affectedBot = resolveAffectedBotForRevision(note);
  const nextRevision = reviewItem.revisionNumber + 1;

  cb.setPresence(affectedBot, {
    activity: 'working',
    room: affectedBot === 'content-creator' ? 'content-studio' : 'open-work',
    targetNodeId:
      affectedBot === 'content-creator'
        ? CONTENT_STUDIO_SPOT.nodeId
        : getDeskNodeId(affectedBot),
    posture: 'seated',
    speech: `Revising per note: "${note.slice(0, 42)}"...`,
  });

  cb.updateState((prev) => ({
    ...prev,
    reviewQueue: prev.reviewQueue.map((r) =>
      r.id === reviewItem.id
        ? { ...r, status: 'changes-requested', feedbackNote: note }
        : r
    ),
    assignments: reviewItem.assignmentId
      ? prev.assignments.map((a) =>
          a.id === reviewItem.assignmentId
            ? {
                ...a,
                status: 'revising',
                revisionCount: a.revisionCount + 1,
                steps: a.steps.map((s) =>
                  s.botId === affectedBot ? { ...s, status: 'running' } : s
                ),
              }
            : a
        )
      : prev.assignments,
    activity: [
      createActivityEvent(
        affectedBot,
        'Revision started',
        `Resuming from ${affectedBot} step based on feedback: "${note}".`
      ),
      ...prev.activity,
    ],
  }));

  await wait(pacing.deskWorkMs);

  const state = cb.getState();
  const stratRef = reviewItem.linkedArtifacts.find((a) => a.kind === 'strategy');
  const projectRef = reviewItem.linkedArtifacts.find((a) => a.kind === 'project');
  const contentRef = reviewItem.linkedArtifacts.find((a) => a.kind === 'content');

  let revisionSummary = `Revised by ${affectedBot} (v${nextRevision}): ${note}`;

  if (affectedBot === 'business-strategist' && stratRef) {
    const existing = state.strategyBriefs.find((s) => s.id === stratRef.id);
    if (existing) {
      const res = await cb.runner.run('business-strategist', {
        niche: existing.niche,
        serviceIdea: existing.serviceIdea,
        targetConstraint: existing.deliveryConstraint,
        revisionNote: note,
      });
      if (res.ok) {
        cb.updateState((prev) => ({
          ...prev,
          strategyBriefs: prev.strategyBriefs.map((s) =>
            s.id === existing.id
              ? { ...s, ...res.output.experiment, id: existing.id }
              : s
          ),
        }));
        revisionSummary = `Business Strategist updated experiment brief (v${nextRevision}) incorporating: "${note}".`;
      }
    }
  } else if (affectedBot === 'project-tracker' && projectRef) {
    const existing = state.projects.find((p) => p.id === projectRef.id);
    if (existing) {
      const res = await cb.runner.run('project-tracker', {
        mode: 'create-plan',
        strategyId: existing.strategyId,
        clientName: existing.clientName,
        projectTitle: existing.title,
        goal: existing.summary,
        deliverables: existing.milestones.map((m) => m.title),
        timeline: '3 weeks',
        includeHandoffMilestone: true,
        revisionNote: note,
      });
      if (res.ok && res.output.mode === 'create-plan') {
        cb.updateState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  summary: res.output.mode === 'create-plan' ? res.output.summary : p.summary,
                  milestones:
                    res.output.mode === 'create-plan'
                      ? res.output.milestones
                      : p.milestones,
                }
              : p
          ),
        }));
        revisionSummary = `Project Tracker revised delivery plan (v${nextRevision}) incorporating: "${note}".`;
      }
    }
  } else if (affectedBot === 'content-creator' && contentRef) {
    const existing = state.contentQueue.find((c) => c.id === contentRef.id);
    if (existing) {
      const res = await cb.runner.run('content-creator', {
        platform: existing.platform,
        topic: existing.topic,
        offer: existing.offer,
        tone: existing.tone,
        cta: existing.callToAction,
        revisionNote: note,
      });
      if (res.ok && res.output.drafts[0]) {
        cb.updateState((prev) => ({
          ...prev,
          contentQueue: prev.contentQueue.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  hook: res.output.drafts[0].hook,
                  body: res.output.drafts[0].body,
                }
              : c
          ),
        }));
        revisionSummary = `Content Creator revised promo draft (v${nextRevision}) incorporating: "${note}".`;
      }
    }
  }

  const revisedItem: ReviewItem = {
    ...reviewItem,
    status: 'pending',
    revisionNumber: nextRevision,
    feedbackNote: note,
    summary: revisionSummary,
    deliverableText: `${reviewItem.deliverableText || ''}\n\n[Revision v${nextRevision}]: ${note}`,
    createdAt: nowStamp(),
  };

  cb.setPresence(affectedBot, {
    activity: 'waiting',
    room: 'open-work',
    targetNodeId: getDeskNodeId(affectedBot),
    posture: 'seated',
    speech: `Revision v${nextRevision} is ready in Needs me.`,
  });

  cb.updateState((prev) => ({
    ...prev,
    reviewQueue: enqueueReviewItemIdempotent(prev.reviewQueue, revisedItem),
    assignments: reviewItem.assignmentId
      ? prev.assignments.map((a) =>
          a.id === reviewItem.assignmentId
            ? {
                ...a,
                status: 'awaiting-review',
                steps: a.steps.map((s) =>
                  s.botId === affectedBot
                    ? { ...s, status: 'revised', outputSummary: revisionSummary }
                    : s
                ),
              }
            : a
        )
      : prev.assignments,
    activity: [
      createActivityEvent(
        affectedBot,
        `Revised deliverable returned (v${nextRevision})`,
        revisionSummary
      ),
      ...prev.activity,
    ],
  }));
}

/**
 * Advances one ready internal project task on the active project board so unrelated
 * office work visibly keeps moving even while an external send awaits owner approval.
 */
export async function advanceUnrelatedProjectTask(
  cb: OrchestratorCallbacks
): Promise<boolean> {
  const state = cb.getState();
  const project = state.projects[0];
  if (!project) return false;

  const targetIdx = project.tasks.findIndex(
    (t) => t.status !== 'done' && !t.blocked
  );
  if (targetIdx === -1) return false;

  const targetTask = project.tasks[targetIdx];
  const nextStatus: 'in-progress' | 'done' =
    targetTask.status === 'todo' ? 'in-progress' : 'done';
  const totalTasks = project.tasks.length;
  const doneBefore = project.tasks.filter((t) => t.status === 'done').length;
  const doneAfter = nextStatus === 'done' ? doneBefore + 1 : doneBefore;

  const boardLines: DeskScreenLine[] = project.tasks.slice(0, 4).map((t, i) => ({
    text: `${t.status === 'done' || (i === targetIdx && nextStatus === 'done') ? '[✓]' : i === targetIdx ? '[→]' : '[ ]'} ${t.title.slice(0, 22)}`,
    tone:
      t.status === 'done' || (i === targetIdx && nextStatus === 'done')
        ? 'ok'
        : i === targetIdx
          ? 'accent'
          : 'normal',
  }));

  cb.setPresence('project-tracker', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('project-tracker'),
    posture: 'seated',
    deskWorkMode: 'coordinating',
    hasActionableWork: true,
    taskLabel:
      nextStatus === 'done'
        ? `Checking off task ${doneAfter} of ${totalTasks}`
        : `Updating project board`,
    screenTitle: 'PROJECT BOARD',
    screenLines: boardLines,
    speech: undefined,
  });

  const pacing = cb.pacing ?? DEFAULT_PACING;
  await wait(Math.min(pacing.deskWorkMs, 1100));

  cb.updateState((prev) => {
    const nextProjects = prev.projects.map((p) => {
      if (p.id !== project.id) return p;
      const updated: ProjectRecord = {
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === targetTask.id ? { ...t, status: nextStatus } : t
        ),
      };
      updated.status = deriveProjectStatus(updated);
      return updated;
    });

    return {
      ...prev,
      projects: nextProjects,
      botJobs: {
        ...prev.botJobs,
        'project-tracker': {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      activity: [
        createActivityEvent(
          'project-tracker',
          nextStatus === 'done' ? 'Task checked off' : 'Project board updated',
          `${project.title}: marked "${targetTask.title}" ${nextStatus === 'done' ? 'Done' : 'In progress'} while outreach awaits decision.`,
          {
            kind: 'project',
            id: project.id,
            label: project.title,
            botId: 'project-tracker',
          }
        ),
        ...prev.activity,
      ],
    };
  });

  cb.setPresence('project-tracker', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('project-tracker'),
    posture: 'seated',
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: `Board updated (${doneAfter}/${totalTasks})`,
    screenTitle: 'PROJECT BOARD',
    screenLines: boardLines,
    speech: undefined,
  });

  return true;
}

/**
 * Full autonomous Team Lead workflow for "Find three cleaning businesses and draft outreach":
 * - Runs completely in the background with ALL employee panels closed.
 * - Lead Finder researches & saves 3 cleaning leads one-by-one (with visible progress & screen).
 * - Team Lead inspects the ACTUAL saved leads, catches the missing booking link on lead #2,
 *   and sends a specific revision back to Lead Finder.
 * - Lead Finder verifies the booking link & resubmits automatically.
 * - Team Lead approves the verified shortlist and hands it off to Content Creator.
 * - Content Creator opens drafts, types in bursts, rereads, and submits 3 outreach drafts
 *   tied directly to the 3 approved LeadRecords.
 * - Team Lead approves all 3 drafts internally and escalates EXACTLY ONE grouped decision
 *   card to Needs me: "Send these three outreach messages?"
 * - Meanwhile, Project Tracker continues updating unrelated internal project board work.
 */
export async function runTeamLeadOutreachPipeline(
  rawPrompt: string,
  cb: OrchestratorCallbacks,
  options?: { ownerPreAuthorizedSend?: boolean }
): Promise<AssignmentRecord> {
  const prompt = rawPrompt.trim();
  const pacing = cb.pacing ?? DEFAULT_PACING;
  const stepMs = pacing.deskWorkMs;
  const walkMs = Math.min(pacing.walkToDeskMs, 1500);
  const assignmentId = makeId('asgn');
  const createdAt = nowStamp();

  const steps: AssignmentStep[] = [
    {
      id: makeId('step'),
      botId: 'lead-finder',
      label: 'Find 3 fictional cleaning businesses with verified inquiry sources',
      status: 'running',
    },
    {
      id: makeId('step'),
      botId: 'business-strategist',
      label: 'Team Lead reviews shortlist against brief and approves handoff',
      status: 'pending',
    },
    {
      id: makeId('step'),
      botId: 'content-creator',
      label: 'Draft 3 tailored outreach messages from the approved shortlist',
      status: 'pending',
    },
    {
      id: makeId('step'),
      botId: 'business-strategist',
      label: 'Team Lead approves drafts internally & escalates send decision',
      status: 'pending',
    },
  ];

  const assignment: AssignmentRecord = {
    id: assignmentId,
    prompt,
    title: prompt,
    tier: 'final-deliverable',
    includePromoPost: true,
    createdAt,
    status: 'running',
    participants: ['lead-finder', 'business-strategist', 'content-creator'],
    steps,
    linkedArtifacts: [],
    revisionCount: 0,
  };

  cb.updateState((prev) => ({
    ...prev,
    assignments: [assignment, ...prev.assignments],
    botJobs: {
      ...prev.botJobs,
      'lead-finder': { status: 'running', mode: cb.runner.mode },
    },
    activity: [
      createActivityEvent(
        'business-strategist',
        'Team Lead assigned research',
        `Assigned Lead Finder to find 3 cleaning businesses for "${prompt}".`
      ),
      ...prev.activity,
    ],
  }));

  // Kick off Project Tracker working on unrelated project board tasks in parallel
  const initialProject = cb.getState().projects[0];
  if (initialProject) {
    const doneCnt = initialProject.tasks.filter((t) => t.status === 'done').length;
    cb.setPresence('project-tracker', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('project-tracker'),
      posture: 'seated',
      deskWorkMode: 'coordinating',
      hasActionableWork: true,
      taskLabel: `Updating project board (${doneCnt}/${initialProject.tasks.length})`,
      screenTitle: 'PROJECT BOARD',
      screenLines: initialProject.tasks.slice(0, 4).map((t) => ({
        text: `${t.status === 'done' ? '[✓]' : '[ ]'} ${t.title.slice(0, 22)}`,
        tone: t.status === 'done' ? 'ok' : t.blocked ? 'warn' : 'normal',
      })),
    });
  }

  /* ------------ STAGE 1: Lead Finder researches 3 cleaning leads ----------- */
  const candidates = buildCleaningOutreachCandidates(assignmentId, nowStamp());
  const savedLeads: LeadRecord[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const leadLines: DeskScreenLine[] = candidates.map((c, idx) => {
      if (idx < i) {
        return {
          text: `${c.lead.sourceVerified ? '✓' : '!'} ${c.shortName.slice(0, 20)}`,
          tone: c.lead.sourceVerified ? 'ok' : 'warn',
        };
      }
      if (idx === i) {
        return { text: `→ ${c.shortName.slice(0, 20)}`, tone: 'accent' };
      }
      return { text: `· ${c.shortName.slice(0, 20)}`, tone: 'normal' };
    });

    cb.setPresence('lead-finder', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('lead-finder'),
      posture: 'seated',
      deskWorkMode: 'researching',
      hasActionableWork: true,
      taskLabel: `Checking lead ${i + 1} of ${candidates.length}`,
      screenTitle: `SHORTLIST (${i + 1}/3)`,
      screenLines: leadLines,
      speech: undefined,
    });

    await wait(stepMs);

    savedLeads.push(item.lead);
    const leadRef: LinkedArtifactRef = {
      kind: 'lead',
      id: item.lead.id,
      label: item.shortName,
      botId: 'lead-finder',
    };

    cb.updateState((prev) => ({
      ...prev,
      leads: [
        item.lead,
        ...prev.leads.filter((l) => l.id !== item.lead.id),
      ],
      activity: [
        createActivityEvent(
          'lead-finder',
          `Lead ${i + 1} of 3 saved`,
          `${item.shortName}: ${item.lead.observedProblem.slice(0, 110)}`,
          leadRef
        ),
        ...prev.activity,
      ],
    }));
  }

  // Lead Finder submits shortlist directly to Team Lead
  cb.setPresence('lead-finder', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: 'Sent shortlist to Team Lead',
    screenTitle: 'SHORTLIST SENT',
    screenLines: [
      { text: '1. Harbourside Sparkle', tone: 'ok' },
      { text: '2. Bayside Eco Cleans', tone: 'warn' },
      { text: '3. Cedar & Pine Care', tone: 'ok' },
    ],
  });

  cb.updateState((prev) => ({
    ...prev,
    botJobs: {
      ...prev.botJobs,
      'lead-finder': {
        status: 'ready',
        mode: cb.runner.mode,
        lastRunAt: nowStamp(),
      },
      'business-strategist': { status: 'running', mode: cb.runner.mode },
    },
    assignments: prev.assignments.map((a) =>
      a.id === assignmentId
        ? {
            ...a,
            steps: a.steps.map((s, idx) =>
              idx === 0
                ? {
                    ...s,
                    status: 'completed',
                    outputSummary: 'Submitted 3 fictional cleaning businesses to Team Lead.',
                  }
                : idx === 1
                  ? { ...s, status: 'running' }
                  : s
            ),
          }
        : a
    ),
    activity: [
      createActivityEvent(
        'lead-finder',
        'Shortlist sent to Team Lead',
        'Submitted 3 cleaning businesses for Team Lead verification.'
      ),
      ...prev.activity,
    ],
  }));

  /* ------------ STAGE 2: Team Lead inspects actual saved shortlist --------- */
  const currentLeadsForReview = cb
    .getState()
    .leads.filter((l) => l.assignmentId === assignmentId);

  cb.setPresence('business-strategist', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    deskWorkMode: 'reviewing',
    hasActionableWork: true,
    taskLabel: `Reviewing shortlist (${currentLeadsForReview.length} leads)`,
    screenTitle: 'LEAD AUDIT (3)',
    screenLines: [
      { text: '✓ Harbourside · URL ok', tone: 'ok' },
      { text: '✕ Bayside · Missing URL', tone: 'warn' },
      { text: '✓ Cedar & Pine · URL ok', tone: 'ok' },
    ],
  });

  await wait(stepMs);

  const firstAudit = evaluateLeadShortlist(currentLeadsForReview);

  /* --- STAGE 3: Automatic Revision Loop (Missing Booking Link on Lead #2) -- */
  if (firstAudit.decision === 'request-revision' && firstAudit.missingLeads.length > 0) {
    const missingLead = firstAudit.missingLeads[0];
    const missingCandidate = candidates.find((c) => c.lead.id === missingLead.id);
    const missingShortName =
      missingCandidate?.shortName ||
      missingLead.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim();

    // Team Lead walks briefly to Lead Finder's desk with exact fix request
    cb.setPresence('business-strategist', {
      activity: 'walking',
      room: 'open-work',
      targetNodeId: getDeskVisitorNodeId('lead-finder'),
      posture: 'standing',
      deskWorkMode: 'idle',
      hasActionableWork: true,
      taskLabel: 'Requesting booking link fix',
      speech: `Verify the booking link for ${missingShortName}.`,
    });

    cb.updateState((prev) => ({
      ...prev,
      leads: prev.leads.map((l) =>
        l.id === missingLead.id
          ? {
              ...l,
              teamLeadReviewStatus: 'revision-requested',
              revisionNote: firstAudit.instruction,
            }
          : l
      ),
      activity: [
        createActivityEvent(
          'business-strategist',
          'Team Lead requested revision',
          `Team Lead asked Lead Finder to verify the booking link for ${missingShortName}.`,
          {
            kind: 'lead',
            id: missingLead.id,
            label: missingShortName,
            botId: 'lead-finder',
          }
        ),
        ...prev.activity,
      ],
    }));

    await wait(walkMs);

    // Team Lead returns to Desk 02 while Lead Finder immediately fixes & resubmits
    cb.setPresence('business-strategist', {
      activity: 'walking',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'standing',
      hasActionableWork: true,
      taskLabel: 'Waiting on verified link',
      speech: undefined,
    });

    cb.setPresence('lead-finder', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('lead-finder'),
      posture: 'seated',
      deskWorkMode: 'researching',
      hasActionableWork: true,
      taskLabel: 'Verifying booking link (2/3)',
      screenTitle: 'FIXING SOURCE URL',
      screenLines: [
        { text: `Checking ${missingShortName.slice(0, 16)}`, tone: 'accent' },
        { text: '→ /quote-request found', tone: 'ok' },
        { text: 'Updating shortlist...', tone: 'normal' },
      ],
      speech: undefined,
    });

    await wait(stepMs);

    const verifiedUrl =
      missingCandidate?.verifiedSourceUrl ||
      'https://bayside-ecocleans.example/quote-request';

    cb.updateState((prev) => ({
      ...prev,
      leads: prev.leads.map((l) =>
        l.id === missingLead.id
          ? {
              ...l,
              sourceUrl: verifiedUrl,
              sourceVerified: true,
              teamLeadReviewStatus: 'pending',
              revisionNote: undefined,
              tags: Array.from(
                new Set([
                  ...(l.tags || []).filter((t) => t !== 'needs-source-check'),
                  'verified-source',
                ])
              ),
            }
          : l
      ),
      activity: [
        createActivityEvent(
          'lead-finder',
          'Booking link verified & resubmitted',
          `Added verified source (${verifiedUrl}) for ${missingShortName} and resubmitted to Team Lead.`,
          {
            kind: 'lead',
            id: missingLead.id,
            label: missingShortName,
            botId: 'lead-finder',
          }
        ),
        ...prev.activity,
      ],
    }));

    cb.setPresence('lead-finder', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('lead-finder'),
      posture: 'seated',
      deskWorkMode: 'idle',
      hasActionableWork: false,
      taskLabel: 'Resubmitted shortlist',
      screenTitle: '3/3 VERIFIED',
      screenLines: [
        { text: '✓ Harbourside Sparkle', tone: 'ok' },
        { text: '✓ Bayside Eco Cleans', tone: 'ok' },
        { text: '✓ Cedar & Pine Care', tone: 'ok' },
      ],
    });
  }

  /* ------- STAGE 4: Team Lead approves shortlist & assigns Content --------- */
  const verifiedLeads = cb
    .getState()
    .leads.filter((l) => l.assignmentId === assignmentId);
  const secondAudit = evaluateLeadShortlist(verifiedLeads);

  cb.setPresence('business-strategist', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    deskWorkMode: 'reviewing',
    hasActionableWork: true,
    taskLabel: 'Approving shortlist (3/3)',
    screenTitle: 'APPROVED 3/3',
    screenLines: [
      { text: '✓ Harbourside · Verified', tone: 'ok' },
      { text: '✓ Bayside · Verified', tone: 'ok' },
      { text: '✓ Cedar & Pine · Verified', tone: 'ok' },
    ],
  });

  await wait(Math.min(stepMs, 1200));

  const approvedLeadRefs: LinkedArtifactRef[] = verifiedLeads.map((l) => ({
    kind: 'lead',
    id: l.id,
    label: l.businessName.replace(/\s*\(Fictional[^)]*\)/gi, '').trim(),
    botId: 'lead-finder',
  }));

  cb.updateState((prev) => ({
    ...prev,
    leads: prev.leads.map((l) =>
      l.assignmentId === assignmentId
        ? {
            ...l,
            status: 'evaluated',
            teamLeadReviewStatus:
              secondAudit.decision === 'approve' ? 'approved' : 'pending',
          }
        : l
    ),
    botJobs: {
      ...prev.botJobs,
      'content-creator': { status: 'running', mode: cb.runner.mode },
    },
    assignments: prev.assignments.map((a) =>
      a.id === assignmentId
        ? {
            ...a,
            linkedArtifacts: approvedLeadRefs,
            steps: a.steps.map((s, idx) =>
              idx === 1
                ? {
                    ...s,
                    status: 'completed',
                    outputSummary: secondAudit.summary,
                  }
                : idx === 2
                  ? { ...s, status: 'running' }
                  : s
            ),
          }
        : a
    ),
    activity: [
      createActivityEvent(
        'business-strategist',
        'Shortlist approved & handed off',
        'Team Lead approved the shortlist and assigned Content Creator to draft the follow-up.',
        approvedLeadRefs[0]
      ),
      ...prev.activity,
    ],
  }));

  // Purposeful handoff walk to Content Creator's desk
  cb.setPresence('business-strategist', {
    activity: 'walking',
    room: 'open-work',
    targetNodeId: getDeskVisitorNodeId('content-creator'),
    posture: 'standing',
    hasActionableWork: true,
    taskLabel: 'Handing shortlist to Content',
    speech: 'Shortlist approved — draft 3 outreach notes.',
  });
  await wait(walkMs);

  cb.setPresence('business-strategist', {
    activity: 'walking',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'standing',
    hasActionableWork: false,
    taskLabel: 'Returning to desk',
    speech: undefined,
  });

  /* ------- STAGE 5: Content Creator drafts & rereads 3 outreach notes ------ */
  // Keep ordered lead list matching candidates 1, 2, 3
  const orderedApprovedLeads = candidates
    .map((c) => verifiedLeads.find((l) => l.id === c.lead.id))
    .filter((l): l is LeadRecord => Boolean(l));

  const savedDrafts: ContentQueueRecord[] = [];

  for (let i = 0; i < orderedApprovedLeads.length; i++) {
    const lead = orderedApprovedLeads[i];
    const cleanName = lead.businessName
      .replace(/\s*\(Fictional[^)]*\)/gi, '')
      .trim();

    // Typing burst phase
    cb.setPresence('content-creator', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('content-creator'),
      posture: 'seated',
      deskWorkMode: 'drafting',
      hasActionableWork: true,
      taskLabel: `Drafting outreach ${i + 1} of ${orderedApprovedLeads.length}`,
      screenTitle: `DRAFT ${i + 1}/3`,
      screenLines: [
        { text: `To: ${cleanName.slice(0, 20)}`, tone: 'accent' },
        { text: 'Hook: Inquiry flow idea', tone: 'normal' },
        { text: 'Typing body & CTA...', tone: 'ok' },
      ],
      speech: undefined,
    });

    await wait(Math.round(stepMs * 0.72));

    // Brief reread & edit pause on every draft so the posture reads clearly
    cb.setPresence('content-creator', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('content-creator'),
      posture: 'seated',
      deskWorkMode: 'rereading',
      hasActionableWork: true,
      taskLabel: `Editing outreach ${i + 1} of ${orderedApprovedLeads.length}`,
      screenTitle: `REREADING ${i + 1}/3`,
      screenLines: [
        { text: `To: ${cleanName.slice(0, 20)}`, tone: 'accent' },
        { text: '✓ Verified URL cited', tone: 'ok' },
        { text: '✓ CTA tightened', tone: 'ok' },
      ],
      speech: undefined,
    });

    await wait(Math.round(stepMs * 0.48));

    const draftRecord = buildOutreachDraftForLead(
      lead,
      assignmentId,
      i,
      nowStamp()
    );
    savedDrafts.push(draftRecord);

    const draftRef: LinkedArtifactRef = {
      kind: 'content',
      id: draftRecord.id,
      label: draftRecord.variantLabel,
      botId: 'content-creator',
    };

    cb.updateState((prev) => ({
      ...prev,
      contentQueue: [
        draftRecord,
        ...prev.contentQueue.filter((c) => c.id !== draftRecord.id),
      ],
      activity: [
        createActivityEvent(
          'content-creator',
          `Outreach draft ${i + 1} of 3 saved`,
          `Drafted tailored outreach for ${cleanName} citing ${lead.sourceUrl || 'verified booking page'}.`,
          draftRef
        ),
        ...prev.activity,
      ],
    }));
  }

  // Content Creator submits all 3 drafts to Team Lead
  cb.setPresence('content-creator', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('content-creator'),
    posture: 'seated',
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: 'Sent draft to Team Lead',
    screenTitle: '3 DRAFTS SENT',
    screenLines: savedDrafts.map((d, idx) => ({
      text: `✓ #${idx + 1} ${(d.recipientBusinessName || '').replace(/\s*\(Fictional[^)]*\)/gi, '').slice(0, 18)}`,
      tone: 'ok',
    })),
  });

  cb.updateState((prev) => ({
    ...prev,
    botJobs: {
      ...prev.botJobs,
      'content-creator': {
        status: 'ready',
        mode: cb.runner.mode,
        lastRunAt: nowStamp(),
      },
      'business-strategist': { status: 'running', mode: cb.runner.mode },
    },
    assignments: prev.assignments.map((a) =>
      a.id === assignmentId
        ? {
            ...a,
            steps: a.steps.map((s, idx) =>
              idx === 2
                ? {
                    ...s,
                    status: 'completed',
                    outputSummary:
                      'Saved 3 tailored outreach drafts linked to the approved leads and sent to Team Lead.',
                  }
                : idx === 3
                  ? { ...s, status: 'running' }
                  : s
            ),
          }
        : a
    ),
    activity: [
      createActivityEvent(
        'content-creator',
        'Outreach drafts sent to Team Lead',
        'Submitted 3 personalized cleaning-business outreach drafts for Team Lead review.'
      ),
      ...prev.activity,
    ],
  }));

  /* ----- STAGE 6: Team Lead reviews drafts & escalates ONE decision card --- */
  cb.setPresence('business-strategist', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    deskWorkMode: 'reviewing',
    hasActionableWork: true,
    taskLabel: 'Reviewing outreach draft',
    screenTitle: 'OUTREACH REVIEW',
    screenLines: [
      { text: '✓ 3/3 leads matched', tone: 'ok' },
      { text: '✓ Tone & CTA approved', tone: 'ok' },
      { text: '! Send needs owner OK', tone: 'warn' },
    ],
  });

  await wait(stepMs);

  const draftEval = evaluateOutreachDrafts(savedDrafts, orderedApprovedLeads, {
    assignmentId,
    mode: cb.runner.mode,
    createdAt: nowStamp(),
    ownerPreAuthorizedSend: options?.ownerPreAuthorizedSend,
  });

  const allLinkedArtifacts: LinkedArtifactRef[] = [
    ...savedDrafts.map((d) => ({
      kind: 'content' as const,
      id: d.id,
      label: d.variantLabel,
      botId: 'content-creator' as const,
    })),
    ...approvedLeadRefs,
  ];

  if (draftEval.requiresOwnerDecision && draftEval.decisionCard) {
    const decisionCard = draftEval.decisionCard;
    const draftIds = new Set(savedDrafts.map((d) => d.id));

    cb.updateState((prev) => ({
      ...prev,
      contentQueue: prev.contentQueue.map((c) =>
        draftIds.has(c.id)
          ? {
              ...c,
              teamLeadReviewStatus: 'approved',
              deliveryStatus: 'awaiting-owner-send',
              queueStatus: 'ready-for-review',
            }
          : c
      ),
      reviewQueue: enqueueReviewItemIdempotent(prev.reviewQueue, decisionCard),
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              status: 'awaiting-approval',
              linkedArtifacts: allLinkedArtifacts,
              steps: a.steps.map((s, idx) =>
                idx === 3
                  ? {
                      ...s,
                      status: 'waiting-approval',
                      outputSummary:
                        'Approved all 3 drafts internally. Waiting on your decision to send in Needs me.',
                    }
                  : s
              ),
            }
          : a
      ),
      botJobs: {
        ...prev.botJobs,
        'business-strategist': {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      activity: [
        createActivityEvent(
          'business-strategist',
          'Team Lead escalated send decision',
          `Approved all 3 outreach drafts internally — waiting in Needs me: "${decisionCard.decisionQuestion}".`,
          allLinkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));

    cb.setPresence('business-strategist', {
      activity: 'waiting',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      deskWorkMode: 'reviewing',
      hasActionableWork: false,
      taskLabel: 'Awaiting send decision',
      screenTitle: 'NEEDS OWNER OK',
      screenLines: [
        { text: 'Send 3 outreach msgs?', tone: 'warn' },
        { text: '✓ Drafts approved (3/3)', tone: 'ok' },
        { text: 'Rec: Send (Simulated)', tone: 'accent' },
      ],
      speech: 'Approved 3 drafts — check Needs me to send.',
      activeArtifact: allLinkedArtifacts[0],
    });

    // Keep unrelated work visibly moving while the owner decision waits!
    await advanceUnrelatedProjectTask(cb);
  } else {
    // Pre-authorized: Team Lead delivers in simulation immediately
    const draftIds = new Set(savedDrafts.map((d) => d.id));
    cb.updateState((prev) => ({
      ...prev,
      contentQueue: prev.contentQueue.map((c) =>
        draftIds.has(c.id)
          ? {
              ...c,
              teamLeadReviewStatus: 'approved',
              deliveryStatus: 'sent-sim',
              queueStatus: 'published-sim',
            }
          : c
      ),
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              status: 'completed',
              linkedArtifacts: allLinkedArtifacts,
              steps: a.steps.map((s) => ({ ...s, status: 'completed' })),
            }
          : a
      ),
      botJobs: {
        ...prev.botJobs,
        'business-strategist': {
          status: 'ready',
          mode: cb.runner.mode,
          lastRunAt: nowStamp(),
        },
      },
      activity: [
        createActivityEvent(
          'business-strategist',
          'Outreach delivered (Simulated)',
          draftEval.summary,
          allLinkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));

    cb.setPresence('business-strategist', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      deskWorkMode: 'idle',
      hasActionableWork: false,
      taskLabel: 'Delivered 3 outreach (Sim)',
      screenTitle: 'OUTREACH SENT',
      screenLines: [
        { text: '✓ 3/3 sent (Simulated)', tone: 'ok' },
        { text: '✓ Board updated', tone: 'ok' },
      ],
    });
  }

  return (
    cb.getState().assignments.find((a) => a.id === assignmentId) ?? assignment
  );
}

/**
 * Applies the owner's decision from Needs me and automatically resumes the affected work
 * via the Team Lead without requiring any extra clicks.
 */
export async function applyOwnerDecision(
  item: ReviewItem,
  decision:
    | { kind: 'option'; option: ReviewDecisionOption }
    | { kind: 'instruction'; instruction: string },
  cb: OrchestratorCallbacks
): Promise<void> {
  const pacing = cb.pacing ?? DEFAULT_PACING;
  const stepMs = Math.min(pacing.deskWorkMs, 1100);

  if (decision.kind === 'instruction') {
    const note = decision.instruction.trim();
    if (!note) return;

    // If this is a grouped outreach send decision, route exact instruction to Content Creator
    if (item.groupedContentIds && item.groupedContentIds.length > 0) {
      const targetIds = new Set(item.groupedContentIds);
      const nextRev = item.revisionNumber + 1;

      cb.setPresence('business-strategist', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('business-strategist'),
        posture: 'seated',
        deskWorkMode: 'reviewing',
        hasActionableWork: true,
        taskLabel: 'Routing owner instruction',
        speech: `Team Lead: revising outreach per your note.`,
      });

      cb.setPresence('content-creator', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('content-creator'),
        posture: 'seated',
        deskWorkMode: 'drafting',
        hasActionableWork: true,
        taskLabel: 'Revising 3 outreach drafts',
        screenTitle: `REVISION v${nextRev}`,
        screenLines: [
          { text: `Note: ${note.slice(0, 20)}`, tone: 'accent' },
          { text: 'Updating 3 drafts...', tone: 'normal' },
          { text: 'Sending to Team Lead', tone: 'ok' },
        ],
      });

      await wait(stepMs);

      const updatedDrafts: ContentQueueRecord[] = [];
      cb.updateState((prev) => {
        const nextQueue = prev.contentQueue.map((c) => {
          if (!targetIds.has(c.id)) return c;
          const revised: ContentQueueRecord = {
            ...c,
            body: `${c.body}\n\n[Updated per owner note v${nextRev}]: ${note}`,
            teamLeadReviewStatus: 'approved',
            deliveryStatus: 'awaiting-owner-send',
          };
          updatedDrafts.push(revised);
          return revised;
        });

        const updatedCard: ReviewItem = {
          ...item,
          status: 'pending',
          revisionNumber: nextRev,
          feedbackNote: note,
          summary: `Team Lead applied your instruction ("${note}") via Content Creator and re-approved all ${updatedDrafts.length} outreach drafts (v${nextRev}). Ready to send on your go-ahead.`,
          deliverableText: updatedDrafts
            .map(
              (d, idx) =>
                `${idx + 1}. ${d.recipientBusinessName ?? d.topic}\nSubject: ${d.hook}\n${d.body}\nCTA: ${d.callToAction}`
            )
            .join('\n\n---\n\n'),
          createdAt: nowStamp(),
        };

        return {
          ...prev,
          contentQueue: nextQueue,
          reviewQueue: enqueueReviewItemIdempotent(prev.reviewQueue, updatedCard),
          activity: [
            createActivityEvent(
              'business-strategist',
              `Team Lead updated outreach drafts (v${nextRev})`,
              `Applied instruction "${note}" across ${updatedDrafts.length} drafts and returned one updated decision card to Needs me.`,
              item.linkedArtifacts[0]
            ),
            ...prev.activity,
          ],
        };
      });

      cb.setPresence('content-creator', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('content-creator'),
        posture: 'seated',
        deskWorkMode: 'idle',
        hasActionableWork: false,
        taskLabel: 'Sent revised drafts',
      });

      cb.setPresence('business-strategist', {
        activity: 'waiting',
        room: 'open-work',
        targetNodeId: getDeskNodeId('business-strategist'),
        posture: 'seated',
        deskWorkMode: 'reviewing',
        hasActionableWork: false,
        taskLabel: `Updated decision (v${nextRev})`,
        speech: `Updated 3 drafts (v${nextRev}) — ready in Needs me.`,
      });
      return;
    }

    await resumeRevisionFromFeedback(item, note, cb);
    return;
  }

  // Structured Option Selected by Owner
  const { option } = decision;

  if (option.action === 'approve-send') {
    cb.setPresence('business-strategist', {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      deskWorkMode: 'coordinating',
      hasActionableWork: true,
      taskLabel:
        item.groupedContentIds && item.groupedContentIds.length > 0
          ? `Sending ${item.groupedContentIds.length} outreach (Sim)`
          : 'Applying owner approval',
      screenTitle: 'EXECUTING (SIM)',
      screenLines: [
        { text: '✓ Owner approved send', tone: 'ok' },
        { text: '→ Dispatching messages', tone: 'accent' },
        { text: '→ Logging on board', tone: 'normal' },
      ],
      speech: 'Owner approved — simulating outreach delivery now.',
    });

    await wait(stepMs);

    const actionRes = item.proposedAction
      ? await cb.runner.executeApprovedAction({
          reviewItemId: item.id,
          action: item.proposedAction,
        })
      : null;

    const groupedIds = new Set(item.groupedContentIds ?? []);
    const stamp = nowStamp();

    cb.updateState((prev) => {
      const nextContent = prev.contentQueue.map((c) => {
        if (groupedIds.size > 0 && groupedIds.has(c.id)) {
          return {
            ...c,
            queueStatus: 'published-sim' as const,
            deliveryStatus: 'sent-sim' as const,
            teamLeadReviewStatus: 'approved' as const,
          };
        }
        if (
          item.proposedAction?.actionType === 'publish-content' &&
          item.proposedAction.recordId === c.id
        ) {
          return {
            ...c,
            queueStatus: 'published-sim' as const,
            deliveryStatus: 'sent-sim' as const,
          };
        }
        return c;
      });

      const nextLeads =
        item.proposedAction?.actionType === 'delete-record' &&
        item.proposedAction.recordId
          ? prev.leads.filter((l) => l.id !== item.proposedAction?.recordId)
          : prev.leads;

      const summaryDetail =
        groupedIds.size > 0
          ? `Team Lead applied your decision and simulated delivery of all ${groupedIds.size} outreach messages.`
          : actionRes?.ok
            ? actionRes.output.log.summary
            : `Team Lead applied your approval for "${item.title}".`;

      return {
        ...prev,
        leads: nextLeads,
        contentQueue: nextContent,
        reviewQueue: prev.reviewQueue.map((r) =>
          r.id === item.id
            ? {
                ...r,
                status: 'approved',
                resolvedAt: stamp,
                resolvedBy: 'owner',
                ownerChoiceLabel: option.label,
              }
            : r
        ),
        assignments: item.assignmentId
          ? prev.assignments.map((a) =>
              a.id === item.assignmentId
                ? {
                    ...a,
                    status: 'completed',
                    steps: a.steps.map((s) => ({
                      ...s,
                      status: 'completed',
                      outputSummary:
                        s.status === 'waiting-approval'
                          ? summaryDetail
                          : s.outputSummary,
                    })),
                  }
                : a
            )
          : prev.assignments,
        executedActions:
          actionRes && actionRes.ok
            ? [actionRes.output.log, ...prev.executedActions]
            : prev.executedActions,
        activity: [
          createActivityEvent(
            'business-strategist',
            groupedIds.size > 0
              ? 'Team Lead sent outreach (Sim)'
              : 'Team Lead applied approval',
            summaryDetail,
            item.linkedArtifacts[0]
          ),
          ...prev.activity,
        ],
      };
    });

    // Project Tracker automatically logs the delivered outreach batch on the board
    if (groupedIds.size > 0) {
      await advanceUnrelatedProjectTask(cb);
    }

    cb.setPresence('business-strategist', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      deskWorkMode: 'idle',
      hasActionableWork: false,
      taskLabel:
        groupedIds.size > 0
          ? `Sent ${groupedIds.size} outreach (Sim)`
          : 'Decision applied',
      screenTitle: 'TEAM LEAD QUEUE',
      screenLines: [
        { text: '✓ Outreach delivered (Sim)', tone: 'ok' },
        { text: '✓ Owner inbox clear', tone: 'ok' },
        { text: 'Ready for next brief', tone: 'normal' },
      ],
      speech: undefined,
    });
    return;
  }

  if (option.action === 'save-drafts-only') {
    const groupedIds = new Set(item.groupedContentIds ?? []);
    const stamp = nowStamp();

    cb.updateState((prev) => ({
      ...prev,
      contentQueue: prev.contentQueue.map((c) =>
        groupedIds.has(c.id)
          ? {
              ...c,
              queueStatus: 'completed' as const,
              deliveryStatus: 'approved-internal' as const,
              teamLeadReviewStatus: 'approved' as const,
            }
          : c
      ),
      reviewQueue: prev.reviewQueue.map((r) =>
        r.id === item.id
          ? {
              ...r,
              status: 'approved',
              resolvedAt: stamp,
              resolvedBy: 'owner',
              ownerChoiceLabel: option.label,
            }
          : r
      ),
      assignments: item.assignmentId
        ? prev.assignments.map((a) =>
            a.id === item.assignmentId
              ? {
                  ...a,
                  status: 'completed',
                  steps: a.steps.map((s) => ({
                    ...s,
                    status: 'completed',
                    outputSummary:
                      s.status === 'waiting-approval'
                        ? 'Kept as approved drafts only (no external send).'
                        : s.outputSummary,
                  })),
                }
              : a
          )
        : prev.assignments,
      activity: [
        createActivityEvent(
          'business-strategist',
          'Kept as approved drafts',
          `Team Lead applied your decision: kept ${groupedIds.size || 1} draft(s) saved internally without sending.`,
          item.linkedArtifacts[0]
        ),
        ...prev.activity,
      ],
    }));

    cb.setPresence('business-strategist', {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId('business-strategist'),
      posture: 'seated',
      deskWorkMode: 'idle',
      hasActionableWork: false,
      taskLabel: 'Kept approved drafts',
      speech: undefined,
    });
    return;
  }

  // Hold / Reject
  const groupedIds = new Set(item.groupedContentIds ?? []);
  const stamp = nowStamp();
  cb.updateState((prev) => ({
    ...prev,
    contentQueue: prev.contentQueue.map((c) =>
      groupedIds.has(c.id)
        ? {
            ...c,
            queueStatus: 'draft' as const,
            deliveryStatus: 'held' as const,
          }
        : c
    ),
    reviewQueue: prev.reviewQueue.map((r) =>
      r.id === item.id
        ? {
            ...r,
            status: 'rejected',
            resolvedAt: stamp,
            resolvedBy: 'owner',
            ownerChoiceLabel: option.label,
          }
        : r
    ),
    assignments: item.assignmentId
      ? prev.assignments.map((a) =>
          a.id === item.assignmentId ? { ...a, status: 'rejected' } : a
        )
      : prev.assignments,
    activity: [
      createActivityEvent(
        'business-strategist',
        'Held per owner decision',
        `Team Lead paused "${item.decisionQuestion || item.title}" — no external action executed.`
      ),
      ...prev.activity,
    ],
  }));

  cb.setPresence('business-strategist', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: 'Action held',
    speech: undefined,
  });
}

