import type {
  AssignmentRecord,
  BotActivityState,
  BotId,
  BotLivePresence,
  ContentQueueRecord,
  LeadRecord,
  LinkedArtifactRef,
  OfficeQueueState,
  PersistedSyncBatch,
  PersistedSyncTask,
  WorkspaceState,
} from '../types/workspace';
import {
  createInitialOfficeQueueState,
  getBotReservationForResource,
  getDeskResourceId,
  getVisitResourceId,
  hasProcessedEvent,
  recordIdempotentEvent,
  releaseBotReservations,
  releaseSpot,
  requestSimultaneousSpots,
  requestSpot,
} from '../state/officeQueueStore';
import {
  getDeskNodeId,
  getDeskVisitorNodeId,
} from '../scene/navigation';
import {
  createActivityEvent,
  deriveProjectStatus,
  nowStamp,
} from '../state/workspaceStore';

export interface QueueCoordinatorPacing {
  walkMs: number;
  turnMs: number;
  deskWorkMs: number;
}

export const DEFAULT_QUEUE_PACING: QueueCoordinatorPacing = {
  walkMs: 1850,
  turnMs: 2400,
  deskWorkMs: 1700,
};

export interface QueueCoordinatorCallbacks {
  pacing?: QueueCoordinatorPacing;
  getState: () => WorkspaceState;
  updateState: (updater: (prev: WorkspaceState) => WorkspaceState) => void;
  setPresence: (
    botId: BotId,
    patch: Partial<BotLivePresence> & { activity: BotActivityState }
  ) => void;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getQueue(state: WorkspaceState): OfficeQueueState {
  return state.officeQueue ?? createInitialOfficeQueueState();
}

/**
 * Runs an independent desk research workflow for Lead Finder on its own desk queue
 * (`desk:lead-finder`), demonstrating that a busy Team Lead / Strategist never blocks
 * an unrelated employee from completing desk work.
 */
async function runIndependentLeadDeskWork(
  batchId: string,
  assignmentId: string,
  cb: QueueCoordinatorCallbacks
): Promise<void> {
  const pacing = cb.pacing ?? DEFAULT_QUEUE_PACING;
  const doneEventKey = `independent-desk-done:${batchId}:lead-finder`;

  if (hasProcessedEvent(getQueue(cb.getState()), doneEventKey)) {
    return;
  }

  const deskResourceId = getDeskResourceId('lead-finder');
  let deskResId = '';

  cb.updateState((prev) => {
    const q = getQueue(prev);
    const req = requestSpot(q, {
      resourceId: deskResourceId,
      botId: 'lead-finder',
      assignmentId,
      purpose: 'Independent lead source verification',
    });
    deskResId = req.reservation.id;
    return { ...prev, officeQueue: req.state };
  });

  // Step 1: Scroll source
  cb.setPresence('lead-finder', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    deskWorkMode: 'researching',
    hasActionableWork: true,
    queuePosition: undefined,
    waitingForResourceId: undefined,
    taskLabel: 'Scrolling source (1/3)',
    screenTitle: 'LEAD RESEARCH',
    screenLines: [
      { text: '→ Scrolling directory', tone: 'accent' },
      { text: 'Checking inquiry form...', tone: 'normal' },
      { text: 'Desk queue independent', tone: 'ok' },
    ],
  });
  await wait(Math.round(pacing.deskWorkMs * 0.85));

  // Step 2: Pause to verify detail
  cb.setPresence('lead-finder', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    deskWorkMode: 'rereading',
    hasActionableWork: true,
    taskLabel: 'Verifying booking detail',
    screenTitle: 'VERIFY DETAIL',
    screenLines: [
      { text: '✓ Northshore Home Care', tone: 'ok' },
      { text: '→ Checking response SLA', tone: 'accent' },
      { text: 'Form drops SMS leads', tone: 'warn' },
    ],
  });
  await wait(Math.round(pacing.deskWorkMs * 0.75));

  // Step 3: Enter verified detail into lead list (idempotent!)
  cb.setPresence('lead-finder', {
    activity: 'working',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    deskWorkMode: 'drafting',
    hasActionableWork: true,
    taskLabel: 'Entering verified lead',
    screenTitle: 'SAVING LEAD',
    screenLines: [
      { text: '✓ Northshore Home Care', tone: 'ok' },
      { text: '✓ URL verified & logged', tone: 'ok' },
      { text: 'Saved to pipeline', tone: 'accent' },
    ],
  });
  await wait(Math.round(pacing.deskWorkMs * 0.7));

  cb.updateState((prev) => {
    const q = getQueue(prev);
    const idemp = recordIdempotentEvent(q, doneEventKey);
    if (idemp.alreadyProcessed) return prev;

    const released = releaseSpot(idemp.state, deskResId);
    const leadId = `lead-sync-${batchId}`;
    const alreadyExists = prev.leads.some((l) => l.id === leadId);
    const newLead: LeadRecord = {
      id: leadId,
      businessName: 'Northshore Home Care (Fictional)',
      industry: 'Residential Cleaning',
      location: 'Brisbane, QLD',
      targetClient: 'Homeowners booking recurring cleans',
      serviceOffered: 'Branded inquiry page + instant owner SMS alert',
      observedProblem:
        'Contact form routes into a shared inbox with 14-hour average reply lag.',
      suggestedOffer:
        'Branded quote intake page with instant owner tracker and 5-minute SMS ping.',
      outreachAngle:
        'Show a 2-minute prototype replacing the shared inbox quote form.',
      outreachDraft:
        'Hi Northshore Home Care team — noticed quote inquiries wait in a shared inbox. Built a quick branded booking & owner alert preview.',
      sourceUrl: 'https://northshorehomecare.example/book',
      sourceVerified: true,
      assignmentId,
      teamLeadReviewStatus: 'pending',
      savedAt: nowStamp(),
      status: 'evaluated',
      tags: ['verified-source', 'independent-desk-work'],
      isDemo: false,
    };

    const leadRef: LinkedArtifactRef = {
      kind: 'lead',
      id: leadId,
      label: 'Northshore Home Care',
      botId: 'lead-finder',
    };

    const nextBatch = released.state.activeSyncBatch
      ? { ...released.state.activeSyncBatch, independentTaskDone: true }
      : null;

    return {
      ...prev,
      leads: alreadyExists ? prev.leads : [newLead, ...prev.leads],
      officeQueue: {
        ...released.state,
        activeSyncBatch: nextBatch,
      },
      botJobs: {
        ...prev.botJobs,
        'lead-finder': {
          status: 'ready',
          mode: 'simulation',
          lastRunAt: nowStamp(),
        },
      },
      activity: [
        createActivityEvent(
          'lead-finder',
          'Verified & saved lead independently',
          'Lead Finder verified Northshore Home Care at Desk 01 while Team Lead handled the desk queue.',
          leadRef
        ),
        ...prev.activity,
      ],
    };
  });

  cb.setPresence('lead-finder', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('lead-finder'),
    posture: 'seated',
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: 'Saved verified lead',
    screenTitle: 'LEAD SAVED',
    screenLines: [
      { text: '✓ Northshore Home Care', tone: 'ok' },
      { text: '✓ Independent work done', tone: 'ok' },
    ],
  });
}

/**
 * Executes a single employee's granted turn at Team Lead's desk (`visit:business-strategist`),
 * applying Team Lead review & automatic approval idempotently so repeated arrival events
 * never submit work twice or duplicate an approval.
 */
async function executeStrategistTurn(
  batchId: string,
  assignmentId: string,
  task: PersistedSyncTask,
  cb: QueueCoordinatorCallbacks
): Promise<void> {
  const pacing = cb.pacing ?? DEFAULT_QUEUE_PACING;
  const arrivalEventKey = `sync-task-done:${batchId}:${task.id}`;

  if (hasProcessedEvent(getQueue(cb.getState()), arrivalEventKey)) {
    return;
  }

  const visitNode = getDeskVisitorNodeId('business-strategist');
  const visitResource = getVisitResourceId('business-strategist');

  // Step 1: Step forward to Team Lead's visitor spot (from desk OR from waiting spot!)
  cb.setPresence(task.botId, {
    activity: 'walking',
    room: 'open-work',
    targetNodeId: visitNode,
    posture: 'standing',
    lookAtBotId: 'business-strategist',
    queuePosition: undefined,
    waitingForResourceId: undefined,
    hasActionableWork: true,
    taskLabel: 'Stepping up to Team Lead',
    speech: `Heading to Team Lead for ${task.topic}.`,
  });

  await wait(pacing.walkMs);

  // Step 2: Employee presents work; Team Lead faces them and listens/takes notes
  cb.setPresence(task.botId, {
    activity: 'discussing',
    room: 'open-work',
    targetNodeId: visitNode,
    posture: 'standing',
    lookAtBotId: 'business-strategist',
    hasActionableWork: true,
    taskLabel: `Reviewing ${task.topic}`,
    speech:
      task.botId === 'content-creator'
        ? 'Team Lead, can you review the revised outreach intro?'
        : 'Team Lead, ready to confirm the handoff milestone status.',
  });

  cb.setPresence('business-strategist', {
    activity: 'discussing',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    lookAtBotId: task.botId,
    deskWorkMode: 'reviewing',
    hasActionableWork: true,
    taskLabel: `Listening to ${task.botId === 'content-creator' ? 'Content' : 'Tracker'}`,
    screenTitle: 'LIVE DESK REVIEW',
    screenLines: [
      { text: `With: ${task.botId === 'content-creator' ? 'Content Creator' : 'Project Tracker'}`, tone: 'accent' },
      { text: task.topic.slice(0, 26), tone: 'normal' },
      { text: 'Checking brief fit...', tone: 'warn' },
    ],
    speech: undefined,
  });

  await wait(pacing.turnMs);

  // Step 3: Team Lead responds with automatic review & approval (triggers actual handoff!)
  cb.setPresence(task.botId, {
    activity: 'discussing',
    room: 'open-work',
    targetNodeId: visitNode,
    posture: 'standing',
    lookAtBotId: 'business-strategist',
    hasActionableWork: true,
    taskLabel: 'Listening to Team Lead',
    speech: undefined,
  });

  cb.setPresence('business-strategist', {
    activity: 'discussing',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    lookAtBotId: task.botId,
    deskWorkMode: 'reviewing',
    hasActionableWork: true,
    taskLabel: 'Approving & handing off',
    screenTitle: 'TEAM LEAD APPROVED',
    screenLines: [
      { text: `✓ ${task.topic.slice(0, 24)}`, tone: 'ok' },
      { text: '✓ Meets brief & rules', tone: 'ok' },
      { text: '→ Advancing queue next', tone: 'accent' },
    ],
    speech:
      task.botId === 'content-creator'
        ? 'Approved internally — save the copy and queue next.'
        : 'Approved — update the project board milestone now.',
  });

  await wait(pacing.turnMs);

  // Step 4: Idempotent completion + artifact update + ATOMIC reservation release (promotes next in queue!)
  let promotedBot: BotId | null = null;
  let promotedNodeId: string | null = null;

  cb.updateState((prev) => {
    const q = getQueue(prev);
    const idemp = recordIdempotentEvent(q, arrivalEventKey);
    if (idemp.alreadyProcessed) {
      return prev;
    }

    const currentRes = getBotReservationForResource(
      idemp.state,
      visitResource,
      task.botId
    );
    const released = currentRes
      ? releaseSpot(idemp.state, currentRes.id)
      : releaseBotReservations(idemp.state, task.botId);

    if (released.promoted.length > 0) {
      promotedBot = released.promoted[0].botId;
      promotedNodeId = released.promoted[0].assignedNodeId;
    }

    let nextContent = prev.contentQueue;
    let nextProjects = prev.projects;
    let artifactRef: LinkedArtifactRef | undefined;

    if (task.botId === 'content-creator') {
      const draftId = `cnt-sync-${batchId}`;
      if (!prev.contentQueue.some((c) => c.id === draftId)) {
        const draft: ContentQueueRecord = {
          id: draftId,
          platform: 'Email Newsletter',
          topic: 'Team Lead approved outreach intro',
          offer: 'Branded inquiry page + owner tracker',
          tone: 'Direct & helpful',
          variantLabel: 'Approved Intro — Cleaning Outreach',
          hook: 'Quick 2-minute walkthrough of your inquiry flow',
          body: 'Hi team — we reviewed your inquiry page and drafted a lightweight branded booking flow with instant owner alerts.',
          callToAction: 'Reply "PREVIEW" if you want the live link.',
          savedAt: nowStamp(),
          queueStatus: 'completed',
          assignmentId,
          teamLeadReviewStatus: 'approved',
          deliveryStatus: 'approved-internal',
          isDemo: false,
        };
        nextContent = [draft, ...prev.contentQueue];
      }
      artifactRef = {
        kind: 'content',
        id: draftId,
        label: 'Approved Outreach Intro',
        botId: 'content-creator',
      };
    } else if (task.botId === 'project-tracker' && prev.projects.length > 0) {
      const targetProj = prev.projects[0];
      const nextTask =
        targetProj.tasks.find((t) => t.status === 'todo') ??
        targetProj.tasks.find((t) => t.status === 'in-progress');
      if (nextTask) {
        nextProjects = prev.projects.map((p) => {
          if (p.id !== targetProj.id) return p;
          const updated = {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id === nextTask.id
                ? {
                    ...t,
                    status:
                      t.status === 'todo'
                        ? ('in-progress' as const)
                        : ('done' as const),
                    blocked: false,
                  }
                : t
            ),
          };
          return { ...updated, status: deriveProjectStatus(updated) };
        });
      }
      artifactRef = {
        kind: 'project',
        id: targetProj.id,
        label: targetProj.title,
        botId: 'project-tracker',
      };
    }

    const updatedBatch: PersistedSyncBatch | null = released.state
      .activeSyncBatch
      ? {
          ...released.state.activeSyncBatch,
          tasks: released.state.activeSyncBatch.tasks.map((t) =>
            t.id === task.id
              ? { ...t, status: 'completed' as const }
              : promotedBot && t.botId === promotedBot
                ? { ...t, status: 'in-turn' as const }
                : t
          ),
        }
      : null;

    return {
      ...prev,
      contentQueue: nextContent,
      projects: nextProjects,
      officeQueue: {
        ...released.state,
        activeSyncBatch: updatedBatch,
      },
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              linkedArtifacts: artifactRef
                ? [
                    ...a.linkedArtifacts.filter(
                      (r) =>
                        `${r.kind}:${r.id}` !==
                        `${artifactRef!.kind}:${artifactRef!.id}`
                    ),
                    artifactRef,
                  ]
                : a.linkedArtifacts,
              steps: a.steps.map((s) =>
                s.botId === task.botId
                  ? {
                      ...s,
                      status: 'completed',
                      outputSummary: `Team Lead approved ${task.topic} automatically.`,
                    }
                  : s
              ),
            }
          : a
      ),
      activity: [
        createActivityEvent(
          'business-strategist',
          `Team Lead approved ${task.topic}`,
          `${task.botId === 'content-creator' ? 'Content Creator' : 'Project Tracker'} completed their queued review turn with Team Lead.${promotedBot ? ' Queue advanced automatically.' : ''}`,
          artifactRef
        ),
        ...prev.activity,
      ],
    };
  });

  // Step 5: Returning employee walks back to desk, sits cleanly, and logs/finishes work
  cb.setPresence(task.botId, {
    activity: 'walking',
    room: 'open-work',
    targetNodeId: getDeskNodeId(task.botId),
    posture: 'standing',
    lookAtBotId: undefined,
    speech: undefined,
    hasActionableWork: true,
    taskLabel: 'Returning to desk',
  });

  // If another employee was waiting, immediately show their promotion
  if (promotedBot && promotedNodeId) {
    cb.setPresence(promotedBot, {
      activity: 'walking',
      room: 'open-work',
      targetNodeId: promotedNodeId,
      posture: 'standing',
      lookAtBotId: 'business-strategist',
      queuePosition: undefined,
      waitingForResourceId: undefined,
      hasActionableWork: true,
      taskLabel: 'Turn granted · Stepping up',
      speech: 'My turn — heading to Team Lead.',
    });
  }

  // Background settle for returning employee (independent of next person's turn!)
  void (async () => {
    await wait(pacing.walkMs);
    cb.setPresence(task.botId, {
      activity: 'working',
      room: 'open-work',
      targetNodeId: getDeskNodeId(task.botId),
      posture: 'seated',
      lookAtBotId: undefined,
      deskWorkMode:
        task.botId === 'content-creator' ? 'drafting' : 'coordinating',
      hasActionableWork: true,
      taskLabel:
        task.botId === 'content-creator'
          ? 'Saving approved copy'
          : 'Updating project board',
      screenTitle:
        task.botId === 'content-creator' ? 'APPROVED DRAFT' : 'BOARD UPDATED',
      screenLines:
        task.botId === 'content-creator'
          ? [
              { text: '✓ Team Lead approved', tone: 'ok' },
              { text: '✓ Saved to queue', tone: 'ok' },
            ]
          : [
              { text: '✓ Milestone confirmed', tone: 'ok' },
              { text: '✓ Status updated', tone: 'ok' },
            ],
    });
    await wait(Math.round(pacing.deskWorkMs * 0.75));
    cb.setPresence(task.botId, {
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: getDeskNodeId(task.botId),
      posture: 'seated',
      lookAtBotId: undefined,
      deskWorkMode: 'idle',
      hasActionableWork: false,
      taskLabel:
        task.botId === 'content-creator'
          ? 'Copy approved & saved'
          : 'Board milestone updated',
    });
  })();
}

/**
 * Sends Content Creator and Project Tracker to Team Lead (Business Strategist) simultaneously
 * through the authoritative `officeQueueStore`, while Lead Finder continues working independently
 * at Desk 01.
 *
 * Also handles automatic resumption after a browser refresh/reconnect if `resumeBatch` is passed,
 * guaranteeing each task completes exactly once with zero duplicate submissions or approvals.
 */
export async function runSimultaneousStrategistQueue(
  cb: QueueCoordinatorCallbacks,
  resumeBatch?: PersistedSyncBatch | null
): Promise<AssignmentRecord | null> {
  const pacing = cb.pacing ?? DEFAULT_QUEUE_PACING;
  const visitResource = getVisitResourceId('business-strategist');

  let batch: PersistedSyncBatch;

  if (resumeBatch && resumeBatch.status === 'active') {
    batch = resumeBatch;
  } else {
    const batchId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const assignmentId = `asgn-${batchId}`;
    const createdAt = nowStamp();

    const tasks: PersistedSyncTask[] = [
      {
        id: 't-content',
        botId: 'content-creator',
        targetColleagueId: 'business-strategist',
        topic: 'outreach intro check',
        artifactSummary: 'Outreach intro approved internally',
        status: 'in-turn',
      },
      {
        id: 't-tracker',
        botId: 'project-tracker',
        targetColleagueId: 'business-strategist',
        topic: 'milestone handoff check',
        artifactSummary: 'Milestone status confirmed & updated',
        status: 'queued',
      },
    ];

    batch = {
      id: batchId,
      assignmentId,
      createdAt,
      status: 'active',
      tasks,
      independentBotId: 'lead-finder',
      independentTaskDone: false,
    };

    const assignment: AssignmentRecord = {
      id: assignmentId,
      prompt: 'Team Lead desk queue: Content Creator & Project Tracker sync',
      title: 'Team Lead Desk Queue (Content + Tracker)',
      tier: 'medium',
      createdAt,
      status: 'running',
      participants: [
        'content-creator',
        'project-tracker',
        'business-strategist',
        'lead-finder',
      ],
      steps: [
        {
          id: `step-${batchId}-1`,
          botId: 'content-creator',
          label: 'Request Team Lead desk spot & review outreach intro',
          status: 'running',
        },
        {
          id: `step-${batchId}-2`,
          botId: 'project-tracker',
          label: 'Wait in distinct queue spot, then confirm milestone handoff',
          status: 'pending',
        },
        {
          id: `step-${batchId}-3`,
          botId: 'lead-finder',
          label: 'Verify & save lead independently on Desk 01 queue',
          status: 'running',
        },
      ],
      linkedArtifacts: [],
      revisionCount: 0,
    };

    // ATOMIC single-operation grant + queue assignment for both simultaneous requests!
    cb.updateState((prev) => {
      const q = getQueue(prev);
      const { state: nextQueue, reservations } = requestSimultaneousSpots(q, [
        {
          resourceId: visitResource,
          botId: 'content-creator',
          assignmentId,
          purpose: 'outreach intro check',
        },
        {
          resourceId: visitResource,
          botId: 'project-tracker',
          assignmentId,
          purpose: 'milestone handoff check',
        },
      ]);

      const syncedTasks: PersistedSyncTask[] = tasks.map((t) => {
        const res = reservations.find((r) => r.botId === t.botId);
        return {
          ...t,
          reservationId: res?.id,
          status: res?.status === 'granted' ? 'in-turn' : 'queued',
        };
      });

      const persistedBatch: PersistedSyncBatch = {
        ...batch,
        tasks: syncedTasks,
      };
      batch = persistedBatch;

      return {
        ...prev,
        assignments: [assignment, ...prev.assignments],
        officeQueue: {
          ...nextQueue,
          activeSyncBatch: persistedBatch,
        },
        activity: [
          createActivityEvent(
            'business-strategist',
            'Simultaneous desk queue opened',
            'Content Creator granted Team Lead desk spot; Project Tracker assigned waiting spot #1 while Lead Finder works independently.'
          ),
          ...prev.activity,
        ],
      };
    });
  }

  // Ensure any remaining tasks have live reconciled reservations in the queue store
  const currentQueue = getQueue(cb.getState());
  const pendingTasks = batch.tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      !hasProcessedEvent(currentQueue, `sync-task-done:${batch.id}:${t.id}`)
  );

  // Place queued employees visibly at their distinct, reachable waiting spots IMMEDIATELY
  for (const task of pendingTasks) {
    const res = getBotReservationForResource(
      getQueue(cb.getState()),
      visitResource,
      task.botId
    );
    if (res && res.status === 'queued') {
      cb.setPresence(task.botId, {
        activity: 'waiting',
        room: 'open-work',
        targetNodeId: res.assignedNodeId,
        posture: 'standing',
        lookAtBotId: 'business-strategist',
        queuePosition: res.queuePosition,
        waitingForResourceId: visitResource,
        hasActionableWork: true,
        taskLabel: `Waiting #${res.queuePosition} · Team Lead`,
        speech: undefined,
      });
    }
  }

  // Launch Lead Finder's independent desk work concurrently (never blocked by Team Lead's queue!)
  const independentWorkPromise = batch.independentTaskDone
    ? Promise.resolve()
    : runIndependentLeadDeskWork(batch.id, batch.assignmentId, cb);

  // Process granted turns sequentially as the queue advances automatically
  for (let safety = 0; safety < 6; safety++) {
    const liveState = cb.getState();
    const liveQueue = getQueue(liveState);
    const activeRes = liveQueue.queues[visitResource]?.active[0];
    if (!activeRes) {
      // Check if any pending task lost its reservation and needs re-request
      const liveBatch = liveQueue.activeSyncBatch;
      const nextUnfinished = liveBatch?.tasks.find(
        (t) =>
          t.status !== 'completed' &&
          !hasProcessedEvent(liveQueue, `sync-task-done:${batch.id}:${t.id}`)
      );
      if (!nextUnfinished) break;

      cb.updateState((prev) => {
        const q = getQueue(prev);
        const req = requestSpot(q, {
          resourceId: visitResource,
          botId: nextUnfinished.botId,
          assignmentId: batch.assignmentId,
          purpose: nextUnfinished.topic,
        });
        return { ...prev, officeQueue: req.state };
      });
      continue;
    }

    const matchingTask = batch.tasks.find((t) => t.botId === activeRes.botId);
    if (!matchingTask) break;

    await executeStrategistTurn(batch.id, batch.assignmentId, matchingTask, cb);

    // Small breathing beat so the turn handoff reads clearly before the next person finishes walking up
    await wait(Math.min(pacing.walkMs * 0.25, 320));
  }

  await independentWorkPromise;

  // Finalize batch & relax Team Lead calmly at desk
  cb.updateState((prev) => {
    const q = getQueue(prev);
    const cleaned: OfficeQueueState = {
      ...q,
      activeSyncBatch: null,
    };
    return {
      ...prev,
      officeQueue: cleaned,
      assignments: prev.assignments.map((a) =>
        a.id === batch.assignmentId
          ? {
              ...a,
              status: 'completed',
              steps: a.steps.map((s) => ({ ...s, status: 'completed' })),
            }
          : a
      ),
    };
  });

  cb.setPresence('business-strategist', {
    activity: 'at-desk',
    room: 'open-work',
    targetNodeId: getDeskNodeId('business-strategist'),
    posture: 'seated',
    lookAtBotId: undefined,
    deskWorkMode: 'idle',
    hasActionableWork: false,
    taskLabel: 'Queue cleared (2/2)',
    screenTitle: 'TEAM LEAD QUEUE',
    screenLines: [
      { text: '✓ Content Creator done', tone: 'ok' },
      { text: '✓ Project Tracker done', tone: 'ok' },
      { text: '0 waiting in queue', tone: 'normal' },
    ],
    speech: undefined,
  });

  return (
    cb.getState().assignments.find((a) => a.id === batch.assignmentId) ?? null
  );
}
