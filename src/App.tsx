import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Briefcase,
  PanelRightOpen,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  BotActivityState,
  BotId,
  BotJobStatus,
  BotLivePresence,
  ClientUpdateDraft,
  ContentQueueRecord,
  ContentVariantDraft,
  ConversationFormat,
  LeadCandidate,
  LeadRecord,
  LinkedArtifactRef,
  PersistedSyncBatch,
  ProjectRecord,
  ReviewDecisionOption,
  ReviewItem,
  RoomId,
  StrategyExperimentDraft,
  StrategyExperimentRecord,
  WhiteboardSnapshot,
  WorkspaceState,
} from './types/workspace';
import {
  BOTS,
  BOT_ACTIVITY_LABELS,
  createInitialBotPresence,
  createInitialWorkspaceState,
} from './state/seedDemo';
import { getBotDeskStatusLabel } from './state/reviewStatus';
import {
  clearWorkspaceStorage,
  createActivityEvent,
  deriveProjectStatus,
  loadWorkspaceState,
  nowStamp,
  saveWorkspaceState,
} from './state/workspaceStore';
import { getDeskNodeId } from './scene/navigation';
import { workflowRunner } from './workflows';
import {
  chooseNextAutonomousFormat,
  pickIdleRoutineMove,
  planWorkspaceConversation,
} from './workflows/conversationPlanner';
import {
  computeFocusProgress,
  createTodayFocus,
  planNextFocusConversation,
} from './workflows/focusPlanner';
import {
  applyOwnerDecision,
  resumeRevisionFromFeedback,
  runAutonomousConversation,
  runCollaborativeAssignment,
} from './workflows/orchestrator';
import { runSimultaneousStrategistQueue } from './workflows/queueCoordinator';
import { SAMPLE_CLEANING_OUTREACH_PROMPT } from './workflows/teamLeadEngine';
import {
  CONSECUTIVE_TASK_BREAK_THRESHOLD,
  finishCoffeeBreak,
  isBotDueForCoffeeBreak,
  recordCompletedDeskTask,
  startCoffeeBreak,
} from './workflows/coffeeBreak';
import type {
  BusinessStrategistInput,
  ContentCreatorInput,
  LeadFinderInput,
} from './workflows/runner';
import { OfficeViewport3D } from './components/OfficeViewport3D';
import { ActivityFeed, CompactBotList } from './components/BotListAndActivity';
import { AssignmentsPanel } from './components/AssignmentsPanel';
import { MeetingRoomPanel } from './components/MeetingRoomPanel';
import { NeedsMeQueuePanel } from './components/NeedsMeQueuePanel';
import { LeadFinderPanel } from './components/LeadFinderPanel';
import { BusinessStrategistPanel } from './components/BusinessStrategistPanel';
import { ProjectTrackerPanel } from './components/ProjectTrackerPanel';
import { ContentCreatorPanel } from './components/ContentCreatorPanel';
import type { SaveFocusInput } from './components/TodayFocusCard';
import {
  applySnapshotDecisionsToProject,
  resolveLiveWhiteboardSnapshot,
} from './state/whiteboardHistory';

type WorkspaceTab = 'missions' | 'meeting-room' | 'needs-me' | 'desk';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

const JOB_STATUS_COLOR: Record<BotJobStatus, string> = {
  idle: 'text-[#A4AAB5]',
  running: 'text-[#22D3EE]',
  ready: 'text-[#4ADE80]',
  failed: 'text-[#F87171]',
};

export default function App() {
  const isDesktop = useIsDesktop();
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    loadWorkspaceState()
  );
  const workspaceRef = useRef<WorkspaceState>(workspace);
  workspaceRef.current = workspace;

  const [selectedBotId, setSelectedBotId] = useState<BotId>('lead-finder');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('missions');
  const [focusedRoom, setFocusedRoom] = useState<RoomId>('overview');
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [prefillLead, setPrefillLead] = useState<LeadRecord | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(
    () => loadWorkspaceState().strategyBriefs[0]?.id ?? null
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => loadWorkspaceState().projects[0]?.id ?? null
  );
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const [resetFeedback, setResetFeedback] = useState(false);
  const [isOfficePaused, setIsOfficePaused] = useState(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isOfficePaused;

  const [isRunningAssignment, setIsRunningAssignment] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isProcessingReview, setIsProcessingReview] = useState(false);

  const busyRef = useRef(false);
  const ambientAbortRef = useRef(false);
  const resumedSyncRef = useRef(false);
  const resumedBreaksRef = useRef(false);
  const convoCycleRef = useRef(0);
  const idleStepRef = useRef(0);
  const breakTimersRef = useRef<
    Partial<Record<BotId, { arriveTimer?: number; endTimer?: number }>>
  >({});
  const lastDeskTaskCountedAtRef = useRef<Partial<Record<BotId, number>>>({});

  // Live 3D studio presence & whiteboard state driven directly by workflow & autonomous events
  const [botPresence, setBotPresence] = useState<Record<BotId, BotLivePresence>>(
    () => createInitialBotPresence()
  );
  const botPresenceRef = useRef(botPresence);
  botPresenceRef.current = botPresence;

  const [whiteboardState, setWhiteboardState] = useState<{
    lines: string[];
    isActive: boolean;
  }>(() => {
    const initial = loadWorkspaceState();
    const liveSnap = resolveLiveWhiteboardSnapshot(initial);
    const lastMeeting = initial.meetings[0];
    return {
      lines: liveSnap?.whiteboardLines ?? lastMeeting?.whiteboardLines ?? [],
      isActive: false,
    };
  });

  // Persist workspace to localStorage whenever state updates
  useEffect(() => {
    saveWorkspaceState(workspace);
  }, [workspace]);

  // Close workspace panel / mobile bottom sheet on Escape key
  useEffect(() => {
    if (!desktopPanelOpen && !mobileSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSheetOpen(false);
        setDesktopPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [desktopPanelOpen, mobileSheetOpen]);

  const botStatuses = useMemo<Record<BotId, BotJobStatus>>(
    () => ({
      'lead-finder': workspace.botJobs['lead-finder'].status,
      'business-strategist': workspace.botJobs['business-strategist'].status,
      'project-tracker': workspace.botJobs['project-tracker'].status,
      'content-creator': workspace.botJobs['content-creator'].status,
    }),
    [workspace.botJobs]
  );

  const pendingReviewCount = useMemo(
    () => workspace.reviewQueue.filter((r) => r.status === 'pending').length,
    [workspace.reviewQueue]
  );

  const focusProgress = useMemo(
    () => computeFocusProgress(workspace, workspace.todayFocus),
    [workspace]
  );

  const activeBot = useMemo(
    () => BOTS.find((b) => b.id === selectedBotId) ?? BOTS[0],
    [selectedBotId]
  );
  const activeJob = workspace.botJobs[selectedBotId];
  const activeBotDeskStatus = getBotDeskStatusLabel(
    activeBot.id,
    activeJob.status,
    workspace.reviewQueue
  );

  const clearBotBreakTimers = useCallback((botId: BotId) => {
    const timers = breakTimersRef.current[botId];
    if (!timers) return;
    if (timers.arriveTimer !== undefined) window.clearTimeout(timers.arriveTimer);
    if (timers.endTimer !== undefined) window.clearTimeout(timers.endTimer);
    delete breakTimersRef.current[botId];
  }, []);

  const clearAllBreakTimers = useCallback(() => {
    for (const bot of BOTS) {
      clearBotBreakTimers(bot.id);
    }
  }, [clearBotBreakTimers]);

  useEffect(() => {
    return () => {
      clearAllBreakTimers();
    };
  }, [clearAllBreakTimers]);

  const updateBotPresence = useCallback(
    (
      botId: BotId,
      patch: Partial<BotLivePresence> & { activity: BotActivityState }
    ) => {
      const prevBot = botPresenceRef.current[botId];
      const deskNode = getDeskNodeId(botId);

      // If an active workflow or explicit task claims an employee who is currently on break,
      // cancel their break timer cleanly so it cannot overwrite the new assignment.
      if (
        (patch.activity === 'working' ||
          patch.activity === 'discussing' ||
          patch.hasActionableWork) &&
        workspaceRef.current.botBreaks?.[botId]?.onBreak
      ) {
        clearBotBreakTimers(botId);
        setWorkspace((prev) => {
          const next: WorkspaceState = {
            ...prev,
            botBreaks: finishCoffeeBreak(prev.botBreaks, botId),
          };
          workspaceRef.current = next;
          return next;
        });
      }

      // Count each completed desk work task (working at own desk -> at-desk) toward the Coffee Break streak
      const finishedDeskTask =
        prevBot &&
        prevBot.activity === 'working' &&
        prevBot.targetNodeId === deskNode &&
        patch.activity === 'at-desk';

      setBotPresence((prev) => {
        const next = {
          ...prev,
          [botId]: {
            ...prev[botId],
            ...patch,
            botId,
          },
        };
        botPresenceRef.current = next;
        return next;
      });

      if (finishedDeskTask) {
        const now = Date.now();
        const lastAt = lastDeskTaskCountedAtRef.current[botId] ?? 0;
        if (now - lastAt >= 300) {
          lastDeskTaskCountedAtRef.current[botId] = now;
          setWorkspace((prev) => {
            const res = recordCompletedDeskTask(prev.botBreaks, botId);
            const next: WorkspaceState = {
              ...prev,
              botBreaks: res.breaks,
            };
            workspaceRef.current = next;
            return next;
          });
        }
      }
    },
    [clearBotBreakTimers]
  );

  const scheduleBreakCompletion = useCallback(
    (
      botId: BotId,
      spotId: string,
      restDurationMs: number,
      alreadyInKitchen = false
    ) => {
      clearBotBreakTimers(botId);
      const entry: { arriveTimer?: number; endTimer?: number } = {};
      breakTimersRef.current[botId] = entry;

      const enterRestState = () => {
        const currentBreak = workspaceRef.current.botBreaks?.[botId];
        if (!currentBreak?.onBreak) return;
        const curPresence = botPresenceRef.current[botId];
        if (
          curPresence &&
          curPresence.targetNodeId === spotId &&
          curPresence.activity !== 'on-break'
        ) {
          updateBotPresence(botId, {
            activity: 'on-break',
            room: 'kitchen',
            targetNodeId: spotId,
            posture: 'standing',
            deskWorkMode: 'idle',
            lookAtBotId: undefined,
            speech: undefined,
            taskLabel: 'On break',
            statusDetail: 'Resting in the Kitchen (Coffee Break)',
            screenTitle: 'ON BREAK',
            screenLines: [
              { text: 'Coffee break in Kitchen', tone: 'accent' },
              { text: 'Back at desk shortly', tone: 'normal' },
            ],
          });
        }
      };

      if (!alreadyInKitchen) {
        entry.arriveTimer = window.setTimeout(enterRestState, 2400);
      }

      const walkLeadMs = alreadyInKitchen ? 0 : 1800;
      entry.endTimer = window.setTimeout(() => {
        clearBotBreakTimers(botId);
        const stillOnBreak = workspaceRef.current.botBreaks?.[botId]?.onBreak;
        if (!stillOnBreak) return;

        setWorkspace((prev) => {
          const next: WorkspaceState = {
            ...prev,
            botBreaks: finishCoffeeBreak(prev.botBreaks, botId),
            activity: [
              createActivityEvent(
                botId,
                'Returned from coffee break',
                'Finished resting in the Kitchen and headed back to desk.'
              ),
              ...prev.activity,
            ],
          };
          workspaceRef.current = next;
          return next;
        });

        const cur = botPresenceRef.current[botId];
        if (
          cur &&
          !cur.hasActionableWork &&
          !cur.queuePosition &&
          (cur.activity === 'on-break' || cur.room === 'kitchen')
        ) {
          updateBotPresence(botId, {
            activity: 'walking',
            room: 'open-work',
            targetNodeId: getDeskNodeId(botId),
            posture: 'seated',
            deskWorkMode: 'idle',
            lookAtBotId: undefined,
            speech: undefined,
            taskLabel: undefined,
            statusDetail: 'Returning from coffee break to desk',
          });
        }
      }, walkLeadMs + Math.max(1200, restDurationMs));
    },
    [clearBotBreakTimers, updateBotPresence]
  );

  // Recover any active, unexpired Coffee Breaks across a page refresh
  useEffect(() => {
    if (resumedBreaksRef.current) return;
    resumedBreaksRef.current = true;
    const breaks = workspaceRef.current.botBreaks;
    if (!breaks) return;
    const now = Date.now();
    for (const bot of BOTS) {
      const rec = breaks[bot.id];
      if (rec?.onBreak && rec.breakEndsAtMs && rec.breakEndsAtMs > now) {
        const spotId = rec.kitchenSpotId || 'kitchen:espresso';
        updateBotPresence(bot.id, {
          activity: 'on-break',
          room: 'kitchen',
          targetNodeId: spotId,
          posture: 'standing',
          deskWorkMode: 'idle',
          lookAtBotId: undefined,
          speech: undefined,
          taskLabel: 'On break',
          statusDetail: 'Resting in the Kitchen (Coffee Break)',
        });
        scheduleBreakCompletion(bot.id, spotId, rec.breakEndsAtMs - now, true);
      }
    }
  }, [scheduleBreakCompletion, updateBotPresence]);

  // Automatically send any employee who has completed > 3 consecutive desk tasks
  // to the Kitchen for a short, randomized Coffee Break when they are free.
  useEffect(() => {
    const breaks = workspace.botBreaks;
    if (!breaks) return;
    const queues = workspace.officeQueue?.queues ?? {};
    const hasActiveSync =
      workspace.officeQueue?.activeSyncBatch?.status === 'active';

    for (const bot of BOTS) {
      if (!isBotDueForCoffeeBreak(breaks, bot.id)) continue;
      const presence = botPresenceRef.current[bot.id];
      const hasQueueReservation = Object.values(queues).some(
        (q) =>
          q.active.some((r) => r.botId === bot.id) ||
          q.waiting.some((r) => r.botId === bot.id)
      );
      if (
        !presence ||
        hasActiveSync ||
        hasQueueReservation ||
        presence.hasActionableWork ||
        presence.queuePosition ||
        presence.activity === 'working' ||
        presence.activity === 'discussing' ||
        presence.activity === 'waiting' ||
        presence.activity === 'on-break'
      ) {
        continue;
      }

      const prevCount = breaks[bot.id].consecutiveDeskTasks;
      const started = startCoffeeBreak(workspaceRef.current.botBreaks, bot.id);
      const seconds = Math.round(started.durationMs / 1000);

      setWorkspace((prev) => {
        const next: WorkspaceState = {
          ...prev,
          botBreaks: started.breaks,
          activity: [
            createActivityEvent(
              bot.id,
              'Coffee break',
              `Completed ${prevCount} consecutive desk tasks (>${CONSECUTIVE_TASK_BREAK_THRESHOLD}); walking to the Kitchen for a ~${seconds}s rest.`
            ),
            ...prev.activity,
          ],
        };
        workspaceRef.current = next;
        return next;
      });

      updateBotPresence(bot.id, {
        activity: 'walking',
        room: 'kitchen',
        targetNodeId: started.spotId,
        posture: 'standing',
        deskWorkMode: 'idle',
        lookAtBotId: undefined,
        speech: undefined,
        taskLabel: 'On break',
        statusDetail: 'Heading to the Kitchen for a coffee break',
      });

      scheduleBreakCompletion(bot.id, started.spotId, started.durationMs, false);
    }
  }, [
    workspace.botBreaks,
    workspace.officeQueue,
    isRunningAssignment,
    isConversationActive,
    scheduleBreakCompletion,
    updateBotPresence,
  ]);

  // Sync physical arrival from 3D scene so coworkers never appear stuck on "Walking"
  const handleBotArrived = useCallback((botId: BotId, nodeId: string) => {
    setBotPresence((prev) => {
      const cur = prev[botId];
      if (!cur || cur.activity !== 'walking' || cur.targetNodeId !== nodeId) {
        return prev;
      }
      const nextActivity: BotActivityState = cur.queuePosition
        ? 'waiting'
        : nodeId.startsWith('kitchen:')
          ? 'on-break'
          : cur.speech
            ? 'discussing'
            : cur.posture === 'seated' || nodeId.startsWith('desk:')
              ? 'at-desk'
              : 'checking-notes';
      const next = {
        ...prev,
        [botId]: {
          ...cur,
          activity: nextActivity,
          ...(nextActivity === 'on-break'
            ? {
                taskLabel: 'On break',
                statusDetail: 'Resting in the Kitchen (Coffee Break)',
                screenTitle: 'ON BREAK',
                screenLines: [
                  { text: 'Coffee break in Kitchen', tone: 'accent' as const },
                  { text: 'Back at desk shortly', tone: 'normal' as const },
                ],
              }
            : {}),
        },
      };
      botPresenceRef.current = next;
      return next;
    });
  }, []);

  const handleOpenArtifact = useCallback(
    (ref: LinkedArtifactRef) => {
      if (ref.kind === 'lead') setSelectedLeadId(ref.id);
      if (ref.kind === 'strategy') setSelectedStrategyId(ref.id);
      if (ref.kind === 'project') setSelectedProjectId(ref.id);
      if (ref.kind === 'content') setSelectedContentId(ref.id);
      setSelectedBotId(ref.botId);
      setActiveTab('desk');
      if (isDesktop) setDesktopPanelOpen(true);
      else setMobileSheetOpen(true);
    },
    [isDesktop]
  );

  const handleOpenConversation = useCallback(
    (meetingId: string) => {
      setSelectedMeetingId(meetingId);
      setActiveTab('missions');
      if (isDesktop) setDesktopPanelOpen(true);
      else setMobileSheetOpen(true);
    },
    [isDesktop]
  );

  const handleSaveTodayFocus = useCallback((input: SaveFocusInput) => {
    const newFocus = createTodayFocus(input);
    setSelectedMeetingId(null);
    setWorkspace((prev) => {
      const next: WorkspaceState = {
        ...prev,
        todayFocus: newFocus,
        activity: [
          createActivityEvent(
            'business-strategist',
            "Today's focus saved",
            `${newFocus.goal}${newFocus.targetAudience ? ` (${newFocus.targetAudience})` : ''}`,
            undefined,
            { focusId: newFocus.id }
          ),
          ...prev.activity,
        ],
      };
      workspaceRef.current = next;
      return next;
    });
    if (isPausedRef.current) {
      setIsOfficePaused(false);
    }
  }, []);

  // Clicking a coworker who is reviewing a specific lead/strategy/project/draft opens that exact record
  const handleSelectBot = useCallback(
    (botId: BotId) => {
      const presence = botPresenceRef.current[botId];
      const artifact = presence?.activeArtifact;
      if (artifact && artifact.botId === botId) {
        if (artifact.kind === 'lead') setSelectedLeadId(artifact.id);
        if (artifact.kind === 'strategy') setSelectedStrategyId(artifact.id);
        if (artifact.kind === 'project') setSelectedProjectId(artifact.id);
        if (artifact.kind === 'content') setSelectedContentId(artifact.id);
      }
      setSelectedBotId(botId);
      setActiveTab('desk');
      if (isDesktop) {
        setDesktopPanelOpen(true);
      } else {
        setMobileSheetOpen(true);
      }
    },
    [isDesktop]
  );

  const handleOpenTab = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab);
      if (tab === 'meeting-room') {
        setFocusedRoom('meeting-room');
      }
      if (isDesktop) {
        setDesktopPanelOpen(true);
      } else {
        setMobileSheetOpen(true);
      }
    },
    [isDesktop]
  );

  const handleRoomFocused = useCallback(
    (roomId: RoomId) => {
      setFocusedRoom(roomId);
      if (roomId === 'meeting-room' && isDesktop && desktopPanelOpen) {
        setActiveTab('meeting-room');
      }
    },
    [isDesktop, desktopPanelOpen]
  );

  const handleRestoreWhiteboardSnapshot = useCallback(
    (snapshot: WhiteboardSnapshot) => {
      setWhiteboardState({
        lines: [...snapshot.whiteboardLines],
        isActive: false,
      });
      setFocusedRoom('meeting-room');
      setWorkspace((prev) => ({
        ...prev,
        activeWhiteboardSnapshotId: snapshot.id,
        activity: [
          createActivityEvent(
            'business-strategist',
            'Whiteboard snapshot restored',
            `Restored "${snapshot.sessionTitle}" (${snapshot.whiteboardLines.length} lines) to the Meeting Room whiteboard.`,
            snapshot.linkedArtifacts?.[0]
          ),
          ...prev.activity,
        ],
      }));
    },
    []
  );

  const handleRestoreDecisionsToProject = useCallback(
    (snapshot: WhiteboardSnapshot, projectId: string) => {
      const restoredAt = nowStamp();
      setWorkspace((prev) => {
        const target = prev.projects.find((p) => p.id === projectId);
        if (!target) return prev;
        const updatedProject = applySnapshotDecisionsToProject(
          target,
          snapshot,
          restoredAt
        );
        const projRef: LinkedArtifactRef = {
          kind: 'project',
          id: target.id,
          label: target.title,
          botId: 'project-tracker',
        };
        return {
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId ? updatedProject : p
          ),
          activity: [
            createActivityEvent(
              'project-tracker',
              'Project decisions restored',
              `Applied ${snapshot.decisions.length} whiteboard decisions from "${snapshot.sessionTitle}" to ${target.title}.`,
              projRef
            ),
            ...prev.activity,
          ],
        };
      });
    },
    []
  );

  const handleOpenProjectById = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setSelectedBotId('project-tracker');
      setActiveTab('desk');
      if (!isDesktop) setMobileSheetOpen(true);
    },
    [isDesktop]
  );

  const setBotJobStatus = useCallback(
    (
      botId: BotId,
      status: BotJobStatus,
      meta?: { runId?: string; error?: string }
    ) => {
      setWorkspace((prev) => ({
        ...prev,
        botJobs: {
          ...prev.botJobs,
          [botId]: {
            ...prev.botJobs[botId],
            status,
            mode: workflowRunner.mode,
            lastRunId: meta?.runId ?? prev.botJobs[botId].lastRunId,
            lastRunAt:
              status === 'ready' || status === 'failed'
                ? nowStamp()
                : prev.botJobs[botId].lastRunAt,
            lastError: status === 'failed' ? meta?.error : undefined,
          },
        },
      }));
    },
    []
  );

  /* ------------------- Collaborative & Autonomous Engine ------------------- */

  const makeOrchestratorCallbacks = useCallback(
    (respectAmbientPause = true) => ({
      runner: workflowRunner,
      getState: () => workspaceRef.current,
      updateState: (updater: (prev: WorkspaceState) => WorkspaceState) => {
        setWorkspace((prev) => {
          const next = updater(prev);
          workspaceRef.current = next;
          return next;
        });
      },
      setPresence: updateBotPresence,
      setWhiteboard: (lines: string[], isActive: boolean) => {
        setWhiteboardState({ lines, isActive });
      },
      isCancelled: () =>
        respectAmbientPause ? isPausedRef.current || ambientAbortRef.current : false,
    }),
    [updateBotPresence]
  );

  const handleRunStrategistQueue = useCallback(
    async (resumeBatch?: PersistedSyncBatch | null) => {
      if (isRunningAssignment) return;
      // Preempt any running ambient idle conversation immediately so explicit queue actions never stall
      ambientAbortRef.current = true;
      busyRef.current = true;
      setIsRunningAssignment(true);
      try {
        await runSimultaneousStrategistQueue(
          {
            getState: () => workspaceRef.current,
            updateState: (updater) => {
              setWorkspace((prev) => {
                const next = updater(prev);
                workspaceRef.current = next;
                return next;
              });
            },
            setPresence: updateBotPresence,
          },
          resumeBatch
        );
      } finally {
        busyRef.current = false;
        ambientAbortRef.current = false;
        setIsRunningAssignment(false);
      }
    },
    [isRunningAssignment, updateBotPresence]
  );

  // Automatic refresh/reconnect reconciliation: if a queued strategist sync batch survived reload,
  // resume its reconciled reservations immediately so it completes exactly once.
  useEffect(() => {
    if (resumedSyncRef.current) return;
    const activeBatch = workspaceRef.current.officeQueue?.activeSyncBatch;
    if (activeBatch && activeBatch.status === 'active') {
      resumedSyncRef.current = true;
      const timer = window.setTimeout(() => {
        void handleRunStrategistQueue(activeBatch);
      }, 280);
      return () => window.clearTimeout(timer);
    }
  }, [handleRunStrategistQueue]);

  const runConversationByFormat = useCallback(
    async (format: ConversationFormat) => {
      if (busyRef.current) return;
      ambientAbortRef.current = false;
      busyRef.current = true;
      setIsConversationActive(true);
      try {
        const seed = convoCycleRef.current++;
        const plan = planWorkspaceConversation(workspaceRef.current, format, seed);
        await runAutonomousConversation(plan, makeOrchestratorCallbacks(true));
      } finally {
        // Only clear busyRef if an explicit user job did not preempt this ambient chat
        if (!ambientAbortRef.current) {
          busyRef.current = false;
        }
        setIsConversationActive(false);
      }
    },
    [makeOrchestratorCallbacks]
  );

  const runNextFocusStep = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false;
    const state = workspaceRef.current;
    const activeFocus = state.todayFocus;
    if (!activeFocus || activeFocus.status !== 'active') return false;

    const plan = planNextFocusConversation(state, activeFocus);
    if (!plan) return false;

    busyRef.current = true;
    setIsConversationActive(true);
    try {
      await runAutonomousConversation(plan, makeOrchestratorCallbacks(false));
      return true;
    } finally {
      busyRef.current = false;
      setIsConversationActive(false);
    }
  }, [makeOrchestratorCallbacks]);

  const activeFocusId = workspace.todayFocus?.id ?? null;
  const activeFocusStatus = workspace.todayFocus?.status ?? null;

  // Living Office Simulation:
  // - When Today's focus is active, the Strategist immediately drives the next focus conversation & follow-up until complete.
  // - When Today's focus is completed, stop creating more focus tasks (gentle idle motion still allowed).
  // - When no Today's focus is set, cycle ambient 1P/2P/3P/4P workspace conversations automatically.
  useEffect(() => {
    if (isOfficePaused) return;

    let cancelled = false;
    let convoTimer: number | undefined;
    let routineTimer: number | undefined;
    let routineSettleTimer: number | undefined;

    const scheduleConversation = (delayMs: number) => {
      if (cancelled) return;
      convoTimer = window.setTimeout(async () => {
        if (cancelled || isPausedRef.current) return;
        const currentFocus = workspaceRef.current.todayFocus;

        if (currentFocus && currentFocus.status === 'active') {
          if (busyRef.current) {
            scheduleConversation(1200);
            return;
          }
          const ran = await runNextFocusStep();
          if (!cancelled && !isPausedRef.current && ran) {
            const refreshed = workspaceRef.current.todayFocus;
            if (refreshed && refreshed.status === 'active') {
              scheduleConversation(3200);
            }
          }
          return;
        }

        // If a Today's focus has completed, stop creating further automatic tasks for it
        if (currentFocus && currentFocus.status === 'completed') {
          return;
        }

        if (!busyRef.current) {
          const nextFormat = chooseNextAutonomousFormat(convoCycleRef.current);
          await runConversationByFormat(nextFormat);
        }
        if (!cancelled && !isPausedRef.current) {
          const variedGapMs = 13500 + (convoCycleRef.current % 3) * 3500;
          scheduleConversation(variedGapMs);
        }
      }, delayMs);
    };

    const scheduleIdleRoutine = (delayMs: number) => {
      if (cancelled) return;
      routineTimer = window.setTimeout(() => {
        if (cancelled || isPausedRef.current) return;
        const hasPersistedSync =
          workspaceRef.current.officeQueue?.activeSyncBatch?.status === 'active';
        if (!busyRef.current && !hasPersistedSync) {
          const stepIdx = idleStepRef.current++;
          const bot = BOTS[stepIdx % BOTS.length];
          const current = botPresenceRef.current[bot.id];
          const queues = workspaceRef.current.officeQueue?.queues ?? {};
          const hasActiveReservation = Object.values(queues).some(
            (q) =>
              q.active.some((r) => r.botId === bot.id) ||
              q.waiting.some((r) => r.botId === bot.id)
          );
          const isOnBreak = Boolean(workspaceRef.current.botBreaks?.[bot.id]?.onBreak);
          if (
            current &&
            !isOnBreak &&
            !current.hasActionableWork &&
            !current.queuePosition &&
            !hasActiveReservation &&
            current.activity !== 'working' &&
            current.activity !== 'discussing' &&
            current.activity !== 'waiting' &&
            current.activity !== 'walking' &&
            current.activity !== 'on-break'
          ) {
            // Alternate natural desk task sprints with studio walks so unattended coworkers also accumulate >3 desk tasks
            if (current.room === 'open-work' && stepIdx % 2 === 0) {
              updateBotPresence(bot.id, {
                activity: 'working',
                room: 'open-work',
                targetNodeId: getDeskNodeId(bot.id),
                posture: 'seated',
                deskWorkMode: 'researching',
                lookAtBotId: undefined,
                speech: undefined,
                statusDetail: 'Working on a routine desk task',
              });
              routineSettleTimer = window.setTimeout(() => {
                if (cancelled || busyRef.current || isPausedRef.current) return;
                const latest = botPresenceRef.current[bot.id];
                if (latest && latest.activity === 'working' && !latest.hasActionableWork) {
                  updateBotPresence(bot.id, {
                    activity: 'at-desk',
                    room: 'open-work',
                    targetNodeId: getDeskNodeId(bot.id),
                    posture: 'seated',
                    deskWorkMode: 'idle',
                    lookAtBotId: undefined,
                    speech: undefined,
                  });
                }
              }, 2400);
            } else {
              const move = pickIdleRoutineMove(bot.id, stepIdx, current.room);
              updateBotPresence(bot.id, {
                activity: 'walking',
                room: move.room,
                targetNodeId: move.targetNodeId,
                posture: 'standing',
                lookAtBotId: undefined,
                speech: undefined,
                statusDetail: move.statusDetail,
              });
              routineSettleTimer = window.setTimeout(() => {
                if (cancelled || busyRef.current || isPausedRef.current) return;
                if (workspaceRef.current.botBreaks?.[bot.id]?.onBreak) return;
                updateBotPresence(bot.id, {
                  activity: move.activityAfterArrive,
                  room: move.room,
                  targetNodeId: move.targetNodeId,
                  posture: move.posture,
                  lookAtBotId: undefined,
                  speech: undefined,
                  statusDetail: move.statusDetail,
                });
              }, 2200);
            }
          }
        }
        if (!cancelled && !isPausedRef.current) {
          scheduleIdleRoutine(6800 + (idleStepRef.current % 3) * 1800);
        }
      }, delayMs);
    };

    if (activeFocusId && activeFocusStatus === 'active') {
      scheduleConversation(1100);
      scheduleIdleRoutine(9000);
    } else if (activeFocusId && activeFocusStatus === 'completed') {
      // Focus finished: gentle idle ambiance only, zero new tasks
      scheduleIdleRoutine(5200);
    } else {
      scheduleIdleRoutine(1600);
      scheduleConversation(4500);
    }

    return () => {
      cancelled = true;
      if (convoTimer !== undefined) window.clearTimeout(convoTimer);
      if (routineTimer !== undefined) window.clearTimeout(routineTimer);
      if (routineSettleTimer !== undefined) window.clearTimeout(routineSettleTimer);
    };
  }, [
    isOfficePaused,
    activeFocusId,
    activeFocusStatus,
    runConversationByFormat,
    runNextFocusStep,
    updateBotPresence,
  ]);

  const handleAssignJob = useCallback(
    async (prompt: string, options: { includePromoPost: boolean }) => {
      if (isRunningAssignment) return;
      ambientAbortRef.current = true;
      busyRef.current = true;
      setIsRunningAssignment(true);
      try {
        // Explicit assigned jobs always complete on wall-clock timers even if ambient animation is paused
        await runCollaborativeAssignment(
          prompt,
          options,
          makeOrchestratorCallbacks(false)
        );
      } finally {
        busyRef.current = false;
        ambientAbortRef.current = false;
        setIsRunningAssignment(false);
      }
    },
    [isRunningAssignment, makeOrchestratorCallbacks]
  );

  const handleSelectDecisionOption = useCallback(
    async (item: ReviewItem, option: ReviewDecisionOption) => {
      setIsProcessingReview(true);
      try {
        await applyOwnerDecision(
          item,
          { kind: 'option', option },
          makeOrchestratorCallbacks(false)
        );
      } finally {
        setIsProcessingReview(false);
      }
    },
    [makeOrchestratorCallbacks]
  );

  const handleSendInstruction = useCallback(
    async (item: ReviewItem, instruction: string) => {
      setIsProcessingReview(true);
      try {
        await applyOwnerDecision(
          item,
          { kind: 'instruction', instruction },
          makeOrchestratorCallbacks(false)
        );
      } finally {
        setIsProcessingReview(false);
      }
    },
    [makeOrchestratorCallbacks]
  );

  const handleApproveReview = useCallback(
    async (item: ReviewItem) => {
      setIsProcessingReview(true);
      try {
        if (item.kind === 'high-impact-action' && item.proposedAction) {
          const actionRes = await workflowRunner.executeApprovedAction({
            reviewItemId: item.id,
            action: item.proposedAction,
          });
          if (actionRes.ok) {
            const log = actionRes.output.log;
            const actionType = item.proposedAction.actionType;
            const targetRecordId = item.proposedAction.recordId;
            const botToRelax: BotId =
              actionType === 'publish-content'
                ? 'content-creator'
                : 'business-strategist';

            setWorkspace((prev) => ({
              ...prev,
              reviewQueue: prev.reviewQueue.map((r) =>
                r.id === item.id
                  ? { ...r, status: 'approved', resolvedAt: nowStamp() }
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
                            outputSummary: log.summary,
                          })),
                        }
                      : a
                  )
                : prev.assignments,
              contentQueue:
                actionType === 'publish-content' && targetRecordId
                  ? prev.contentQueue.map((c) =>
                      c.id === targetRecordId
                        ? { ...c, queueStatus: 'published-sim' as const }
                        : c
                    )
                  : prev.contentQueue,
              leads:
                actionType === 'delete-record' && targetRecordId
                  ? prev.leads.filter((l) => l.id !== targetRecordId)
                  : prev.leads,
              executedActions: [log, ...prev.executedActions],
              activity: [
                createActivityEvent(
                  botToRelax,
                  'High-impact action approved',
                  log.summary,
                  item.linkedArtifacts[0]
                ),
                ...prev.activity,
              ],
            }));

            updateBotPresence(botToRelax, {
              activity: 'at-desk',
              room: 'open-work',
              targetNodeId: getDeskNodeId(botToRelax),
              posture: 'seated',
              speech: undefined,
            });
          }
        } else {
          setWorkspace((prev) => ({
            ...prev,
            reviewQueue: prev.reviewQueue.map((r) =>
              r.id === item.id
                ? { ...r, status: 'approved', resolvedAt: nowStamp() }
                : r
            ),
            assignments: item.assignmentId
              ? prev.assignments.map((a) =>
                  a.id === item.assignmentId ? { ...a, status: 'completed' } : a
                )
              : prev.assignments,
            activity: [
              createActivityEvent(
                'business-strategist',
                'Deliverable approved',
                `Approved "${item.title}" in Needs me.`,
                item.linkedArtifacts[0]
              ),
              ...prev.activity,
            ],
          }));

          updateBotPresence('business-strategist', {
            activity: 'at-desk',
            room: 'open-work',
            targetNodeId: getDeskNodeId('business-strategist'),
            posture: 'seated',
            speech: undefined,
          });
        }
      } finally {
        setIsProcessingReview(false);
      }
    },
    [updateBotPresence]
  );

  const handleRejectReview = useCallback(
    (item: ReviewItem) => {
      setWorkspace((prev) => ({
        ...prev,
        reviewQueue: prev.reviewQueue.map((r) =>
          r.id === item.id
            ? { ...r, status: 'rejected', resolvedAt: nowStamp() }
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
            'Action rejected',
            `Rejected "${item.title}" — no external action executed.`
          ),
          ...prev.activity,
        ],
      }));
      updateBotPresence('business-strategist', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('business-strategist'),
        posture: 'seated',
        speech: undefined,
      });
    },
    [updateBotPresence]
  );

  const handleRequestChanges = useCallback(
    async (item: ReviewItem, feedback: string) => {
      setIsProcessingReview(true);
      try {
        await resumeRevisionFromFeedback(
          item,
          feedback,
          makeOrchestratorCallbacks(false)
        );
      } finally {
        setIsProcessingReview(false);
      }
    },
    [makeOrchestratorCallbacks]
  );

  /* -------------------------- Lead Finder Actions -------------------------- */

  const handleRunLeadFinder = useCallback(
    async (input: LeadFinderInput): Promise<LeadCandidate[] | null> => {
      setBotJobStatus('lead-finder', 'running');
      updateBotPresence('lead-finder', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('lead-finder'),
        posture: 'seated',
        speech: `Researching ${input.industry} in ${input.location}...`,
      });
      const res = await workflowRunner.run('lead-finder', input);
      updateBotPresence('lead-finder', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('lead-finder'),
        posture: 'seated',
        speech: undefined,
      });
      if (!res.ok) {
        setBotJobStatus('lead-finder', 'failed', {
          runId: res.runId,
          error: res.message,
        });
        return null;
      }
      setWorkspace((prev) => ({
        ...prev,
        botJobs: {
          ...prev.botJobs,
          'lead-finder': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent('lead-finder', 'Simulation completed', res.summary),
          ...prev.activity,
        ],
      }));
      return res.output.leads;
    },
    [setBotJobStatus, updateBotPresence]
  );

  const handleSaveLead = useCallback((candidate: LeadCandidate) => {
    const newLead: LeadRecord = {
      ...candidate,
      id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      savedAt: nowStamp(),
      status: 'saved',
      isDemo: false,
    };
    const artifactRef: LinkedArtifactRef = {
      kind: 'lead',
      id: newLead.id,
      label: newLead.businessName,
      botId: 'lead-finder',
    };
    setWorkspace((prev) => ({
      ...prev,
      leads: [newLead, ...prev.leads],
      activity: [
        createActivityEvent(
          'lead-finder',
          'Lead saved to pipeline',
          `${newLead.businessName} (${newLead.industry} · ${newLead.location})`,
          artifactRef
        ),
        ...prev.activity,
      ],
    }));
  }, []);

  const handleDeleteLead = useCallback((leadId: string) => {
    setWorkspace((prev) => {
      const target = prev.leads.find((l) => l.id === leadId);
      return {
        ...prev,
        leads: prev.leads.filter((l) => l.id !== leadId),
        activity: target
          ? [
              createActivityEvent(
                'lead-finder',
                'Lead removed',
                `${target.businessName} removed from pipeline.`
              ),
              ...prev.activity,
            ]
          : prev.activity,
      };
    });
  }, []);

  const handleSendLeadToStrategist = useCallback(
    (lead: LeadRecord) => {
      setPrefillLead(lead);
      setSelectedBotId('business-strategist');
      setActiveTab('desk');
      if (!isDesktop) setMobileSheetOpen(true);
    },
    [isDesktop]
  );

  /* ---------------------- Business Strategist Actions ---------------------- */

  const handleRunStrategist = useCallback(
    async (
      input: BusinessStrategistInput
    ): Promise<StrategyExperimentDraft | null> => {
      setBotJobStatus('business-strategist', 'running');
      updateBotPresence('business-strategist', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('business-strategist'),
        posture: 'seated',
        speech: `Evaluating ${input.niche} service idea...`,
      });
      const res = await workflowRunner.run('business-strategist', input);
      updateBotPresence('business-strategist', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('business-strategist'),
        posture: 'seated',
        speech: undefined,
      });
      if (!res.ok) {
        setBotJobStatus('business-strategist', 'failed', {
          runId: res.runId,
          error: res.message,
        });
        return null;
      }
      setWorkspace((prev) => ({
        ...prev,
        botJobs: {
          ...prev.botJobs,
          'business-strategist': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(
            'business-strategist',
            'Service idea evaluated (Simulation)',
            res.summary
          ),
          ...prev.activity,
        ],
      }));
      return res.output.experiment;
    },
    [setBotJobStatus, updateBotPresence]
  );

  const handleSaveStrategy = useCallback(
    (
      draft: StrategyExperimentDraft,
      existingId?: string,
      status: StrategyExperimentRecord['status'] = 'hypothesis'
    ): StrategyExperimentRecord => {
      const id =
        existingId ||
        `strat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const record: StrategyExperimentRecord = {
        ...draft,
        id,
        createdAt: nowStamp(),
        status,
        isDemo: false,
      };
      const artifactRef: LinkedArtifactRef = {
        kind: 'strategy',
        id: record.id,
        label: `Experiment: ${record.title.slice(0, 42)}`,
        botId: 'business-strategist',
      };

      setWorkspace((prev) => {
        const exists = prev.strategyBriefs.some((s) => s.id === id);
        const nextBriefs = exists
          ? prev.strategyBriefs.map((s) =>
              s.id === id ? { ...s, ...record } : s
            )
          : [record, ...prev.strategyBriefs];
        return {
          ...prev,
          strategyBriefs: nextBriefs,
          activity: [
            createActivityEvent(
              'business-strategist',
              exists ? 'Experiment updated' : 'Experiment saved',
              `${record.title} (${record.estimatedPriceRange})`,
              artifactRef
            ),
            ...prev.activity,
          ],
        };
      });

      setSelectedStrategyId(record.id);
      return record;
    },
    []
  );

  const handleUpdateStrategyStatus = useCallback(
    (strategyId: string, status: StrategyExperimentRecord['status']) => {
      setWorkspace((prev) => {
        const target = prev.strategyBriefs.find((s) => s.id === strategyId);
        return {
          ...prev,
          strategyBriefs: prev.strategyBriefs.map((s) =>
            s.id === strategyId ? { ...s, status } : s
          ),
          activity: target
            ? [
                createActivityEvent(
                  'business-strategist',
                  `Experiment marked ${status}`,
                  target.title,
                  {
                    kind: 'strategy',
                    id: target.id,
                    label: target.title,
                    botId: 'business-strategist',
                  }
                ),
                ...prev.activity,
              ]
            : prev.activity,
        };
      });
    },
    []
  );

  const handleConvertStrategyToProject = useCallback(
    async (strategy: StrategyExperimentRecord) => {
      setBotJobStatus('project-tracker', 'running');
      updateBotPresence('project-tracker', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: `Setting up project plan for ${strategy.niche}...`,
      });
      const res = await workflowRunner.run('project-tracker', {
        mode: 'create-plan',
        strategyId: strategy.id,
        clientName: `${strategy.niche} Pilot`,
        projectTitle: `${strategy.serviceIdea} Pilot`,
        goal: strategy.hypothesis,
        deliverables: strategy.experimentPlan,
        timeline: '2–3 weeks',
        includeHandoffMilestone: true,
      });
      updateBotPresence('project-tracker', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: undefined,
      });

      if (!res.ok || res.output.mode !== 'create-plan') {
        setBotJobStatus('project-tracker', 'failed', {
          runId: res.runId,
          error: res.ok ? 'Unexpected workflow output' : res.message,
        });
        return;
      }

      const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const newProject: ProjectRecord = {
        id: projectId,
        strategyId: strategy.id,
        clientName: `${strategy.niche} Pilot`,
        title: `${strategy.serviceIdea} Pilot`,
        summary: res.output.summary,
        status: 'active',
        createdAt: nowStamp(),
        milestones: res.output.milestones,
        tasks: res.output.tasks,
        clientUpdates: [],
        isDemo: false,
      };
      newProject.status = deriveProjectStatus(newProject);
      const projRef: LinkedArtifactRef = {
        kind: 'project',
        id: projectId,
        label: newProject.title,
        botId: 'project-tracker',
      };

      setWorkspace((prev) => ({
        ...prev,
        strategyBriefs: prev.strategyBriefs.map((s) =>
          s.id === strategy.id
            ? { ...s, status: 'testing', projectId }
            : s
        ),
        projects: [newProject, ...prev.projects],
        botJobs: {
          ...prev.botJobs,
          'project-tracker': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(
            'project-tracker',
            'Experiment converted to project',
            `${newProject.title} created with ${newProject.tasks.length} tasks.`,
            projRef
          ),
          ...prev.activity,
        ],
      }));

      setSelectedProjectId(projectId);
      setSelectedBotId('project-tracker');
      setActiveTab('desk');
      if (!isDesktop) setMobileSheetOpen(true);
    },
    [isDesktop, setBotJobStatus, updateBotPresence]
  );

  const handleRequestSendOffer = useCallback(
    async (strategy: StrategyExperimentRecord) => {
      await handleAssignJob(`Send pilot offer for ${strategy.niche}`, {
        includePromoPost: false,
      });
      setActiveTab('needs-me');
      if (!isDesktop) setMobileSheetOpen(true);
    },
    [handleAssignJob, isDesktop]
  );

  /* ------------------------ Project Tracker Actions ------------------------ */

  const handleCreateManualProject = useCallback(
    async (input: {
      clientName: string;
      projectTitle: string;
      goal: string;
      deliverables: string;
      timeline: string;
    }) => {
      setBotJobStatus('project-tracker', 'running');
      updateBotPresence('project-tracker', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: `Creating plan for ${input.projectTitle}...`,
      });
      const deliverables = input.deliverables
        .split(/[\n,]+/)
        .map((d) => d.trim())
        .filter(Boolean);

      const res = await workflowRunner.run('project-tracker', {
        mode: 'create-plan',
        clientName: input.clientName,
        projectTitle: input.projectTitle,
        goal: input.goal,
        deliverables: deliverables.length > 0 ? deliverables : [input.goal],
        timeline: input.timeline,
      });
      updateBotPresence('project-tracker', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: undefined,
      });

      if (!res.ok || res.output.mode !== 'create-plan') {
        setBotJobStatus('project-tracker', 'failed', {
          runId: res.runId,
          error: res.ok ? 'Unexpected workflow output' : res.message,
        });
        return;
      }

      const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const newProject: ProjectRecord = {
        id: projectId,
        clientName: input.clientName,
        title: input.projectTitle,
        summary: res.output.summary,
        status: 'active',
        createdAt: nowStamp(),
        milestones: res.output.milestones,
        tasks: res.output.tasks,
        clientUpdates: [],
        isDemo: false,
      };
      const projRef: LinkedArtifactRef = {
        kind: 'project',
        id: projectId,
        label: newProject.title,
        botId: 'project-tracker',
      };

      setWorkspace((prev) => ({
        ...prev,
        projects: [newProject, ...prev.projects],
        botJobs: {
          ...prev.botJobs,
          'project-tracker': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(
            'project-tracker',
            'Manual project created',
            `${newProject.title} (${newProject.clientName})`,
            projRef
          ),
          ...prev.activity,
        ],
      }));
      setSelectedProjectId(projectId);
    },
    [setBotJobStatus, updateBotPresence]
  );

  const handleUpdateProject = useCallback(
    (
      updated: ProjectRecord,
      activityAction: string,
      activityDetail: string
    ) => {
      setWorkspace((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.id === updated.id ? updated : p)),
        activity: [
          createActivityEvent('project-tracker', activityAction, activityDetail, {
            kind: 'project',
            id: updated.id,
            label: updated.title,
            botId: 'project-tracker',
          }),
          ...prev.activity,
        ],
      }));
    },
    []
  );

  const handleGenerateClientUpdate = useCallback(
    async (project: ProjectRecord): Promise<ClientUpdateDraft | null> => {
      setBotJobStatus('project-tracker', 'running');
      updateBotPresence('project-tracker', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: `Drafting client update for ${project.clientName}...`,
      });
      const res = await workflowRunner.run('project-tracker', {
        mode: 'client-update',
        project,
      });
      updateBotPresence('project-tracker', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('project-tracker'),
        posture: 'seated',
        speech: undefined,
      });

      if (!res.ok || res.output.mode !== 'client-update') {
        setBotJobStatus('project-tracker', 'failed', {
          runId: res.runId,
          error: res.ok ? 'Unexpected workflow output' : res.message,
        });
        return null;
      }

      const update = res.output.update;
      setWorkspace((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === project.id
            ? { ...p, clientUpdates: [update, ...p.clientUpdates] }
            : p
        ),
        botJobs: {
          ...prev.botJobs,
          'project-tracker': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(
            'project-tracker',
            'Client update drafted (Simulation)',
            `${project.title}: "${update.subject}"`,
            {
              kind: 'project',
              id: project.id,
              label: project.title,
              botId: 'project-tracker',
            }
          ),
          ...prev.activity,
        ],
      }));

      return update;
    },
    [setBotJobStatus, updateBotPresence]
  );

  /* ------------------------ Content Creator Actions ------------------------ */

  const handleRunContentCreator = useCallback(
    async (
      input: ContentCreatorInput
    ): Promise<ContentVariantDraft[] | null> => {
      setBotJobStatus('content-creator', 'running');
      updateBotPresence('content-creator', {
        activity: 'working',
        room: 'open-work',
        targetNodeId: getDeskNodeId('content-creator'),
        posture: 'seated',
        speech: `Writing 3 ${input.platform} drafts...`,
      });
      const res = await workflowRunner.run('content-creator', input);
      updateBotPresence('content-creator', {
        activity: 'at-desk',
        room: 'open-work',
        targetNodeId: getDeskNodeId('content-creator'),
        posture: 'seated',
        speech: undefined,
      });
      if (!res.ok) {
        setBotJobStatus('content-creator', 'failed', {
          runId: res.runId,
          error: res.message,
        });
        return null;
      }
      setWorkspace((prev) => ({
        ...prev,
        botJobs: {
          ...prev.botJobs,
          'content-creator': {
            status: 'ready',
            mode: res.mode,
            lastRunId: res.runId,
            lastRunAt: nowStamp(),
          },
        },
        activity: [
          createActivityEvent(
            'content-creator',
            'Content drafts generated (Simulation)',
            res.summary
          ),
          ...prev.activity,
        ],
      }));
      return res.output.drafts;
    },
    [setBotJobStatus, updateBotPresence]
  );

  const handleSaveDraftToQueue = useCallback(
    (
      draft: ContentVariantDraft,
      meta: ContentCreatorInput,
      queueStatus: 'draft' | 'completed'
    ) => {
      const record: ContentQueueRecord = {
        ...draft,
        id: `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        platform: meta.platform,
        topic: meta.topic,
        offer: meta.offer,
        tone: meta.tone,
        savedAt: nowStamp(),
        queueStatus,
        isDemo: false,
      };
      const contentRef: LinkedArtifactRef = {
        kind: 'content',
        id: record.id,
        label: `${record.platform}: ${record.hook.slice(0, 38)}`,
        botId: 'content-creator',
      };
      setWorkspace((prev) => ({
        ...prev,
        contentQueue: [record, ...prev.contentQueue],
        activity: [
          createActivityEvent(
            'content-creator',
            queueStatus === 'completed'
              ? 'Content draft completed'
              : 'Content draft saved',
            `${record.platform}: "${record.hook}"`,
            contentRef
          ),
          ...prev.activity,
        ],
      }));
    },
    []
  );

  const handleToggleQueueStatus = useCallback((recordId: string) => {
    setWorkspace((prev) => {
      let changedTitle = '';
      let nextLabel = '';
      const nextQueue = prev.contentQueue.map((item) => {
        if (item.id !== recordId) return item;
        const isDone =
          item.queueStatus === 'completed' ||
          item.queueStatus === 'ready-for-review';
        const nextStatus: ContentQueueRecord['queueStatus'] = isDone
          ? 'draft'
          : 'completed';
        changedTitle = item.hook;
        nextLabel = nextStatus === 'completed' ? 'Completed' : 'Draft';
        return { ...item, queueStatus: nextStatus };
      });
      return {
        ...prev,
        contentQueue: nextQueue,
        activity: changedTitle
          ? [
              createActivityEvent(
                'content-creator',
                `Marked ${nextLabel}`,
                changedTitle,
                {
                  kind: 'content',
                  id: recordId,
                  label: changedTitle.slice(0, 40),
                  botId: 'content-creator',
                }
              ),
              ...prev.activity,
            ]
          : prev.activity,
      };
    });
  }, []);

  const handleDeleteQueueRecord = useCallback((recordId: string) => {
    setWorkspace((prev) => ({
      ...prev,
      contentQueue: prev.contentQueue.filter((item) => item.id !== recordId),
    }));
  }, []);

  const handleRequestPublishContent = useCallback(
    async (record: ContentQueueRecord) => {
      await handleAssignJob(`Publish content: ${record.hook}`, {
        includePromoPost: true,
      });
      setActiveTab('needs-me');
      if (!isDesktop) setMobileSheetOpen(true);
    },
    [handleAssignJob, isDesktop]
  );

  /* ------------------------------ Reset Demo ------------------------------- */

  const handleResetDemo = useCallback(() => {
    clearAllBreakTimers();
    clearWorkspaceStorage();
    const fresh = createInitialWorkspaceState();
    setWorkspace(fresh);
    workspaceRef.current = fresh;
    const initPresence = createInitialBotPresence();
    setBotPresence(initPresence);
    botPresenceRef.current = initPresence;
    const initialBoard = resolveLiveWhiteboardSnapshot(fresh);
    setWhiteboardState({
      lines: initialBoard?.whiteboardLines ?? [],
      isActive: false,
    });
    setFocusedRoom('overview');
    setPrefillLead(null);
    setSelectedLeadId(null);
    setSelectedStrategyId(fresh.strategyBriefs[0]?.id ?? null);
    setSelectedProjectId(fresh.projects[0]?.id ?? null);
    setSelectedContentId(null);
    setSelectedMeetingId(null);
    convoCycleRef.current = 0;
    setResetFeedback(true);
    setTimeout(() => setResetFeedback(false), 2200);
  }, [clearAllBreakTimers]);

  /* --------------------------- Render Active Panel ------------------------- */

  function renderPanelBody() {
    if (activeTab === 'missions') {
      return (
        <AssignmentsPanel
          todayFocus={workspace.todayFocus}
          focusProgress={focusProgress}
          assignments={workspace.assignments}
          meetings={workspace.meetings}
          reviewQueue={workspace.reviewQueue}
          selectedMeetingId={selectedMeetingId}
          onSelectMeeting={setSelectedMeetingId}
          isRunningAssignment={isRunningAssignment}
          isConversationActive={isConversationActive}
          onSaveTodayFocus={handleSaveTodayFocus}
          onAssignJob={handleAssignJob}
          onRunStrategistQueue={() => handleRunStrategistQueue()}
          onTriggerConversation={runConversationByFormat}
          onOpenArtifact={handleOpenArtifact}
          onOpenNeedsMe={() => setActiveTab('needs-me')}
        />
      );
    }

    if (activeTab === 'meeting-room') {
      return (
        <MeetingRoomPanel
          snapshots={workspace.whiteboardHistory}
          activeSnapshotId={workspace.activeWhiteboardSnapshotId ?? null}
          liveWhiteboardLines={whiteboardState.lines}
          isMeetingActive={whiteboardState.isActive}
          isBusy={isRunningAssignment || isConversationActive}
          projects={workspace.projects}
          onRestoreToWhiteboard={handleRestoreWhiteboardSnapshot}
          onRestoreDecisionsToProject={handleRestoreDecisionsToProject}
          onTriggerSession={runConversationByFormat}
          onOpenArtifact={handleOpenArtifact}
          onOpenProject={handleOpenProjectById}
        />
      );
    }

    if (activeTab === 'needs-me') {
      return (
        <NeedsMeQueuePanel
          reviewQueue={workspace.reviewQueue}
          executedActions={workspace.executedActions}
          isProcessing={isProcessingReview || isRunningAssignment}
          onSelectDecisionOption={handleSelectDecisionOption}
          onSendInstruction={handleSendInstruction}
          onApproveReview={handleApproveReview}
          onRejectReview={handleRejectReview}
          onRequestChanges={handleRequestChanges}
          onOpenArtifact={handleOpenArtifact}
        />
      );
    }

    switch (selectedBotId) {
      case 'lead-finder':
        return (
          <LeadFinderPanel
            leads={workspace.leads}
            reviewQueue={workspace.reviewQueue}
            selectedLeadId={selectedLeadId}
            jobStatus={activeJob.status}
            lastError={activeJob.lastError}
            onRunSimulation={handleRunLeadFinder}
            onSaveLead={handleSaveLead}
            onSendToStrategist={handleSendLeadToStrategist}
            onDeleteLead={handleDeleteLead}
          />
        );
      case 'business-strategist':
        return (
          <BusinessStrategistPanel
            leads={workspace.leads}
            strategyBriefs={workspace.strategyBriefs}
            reviewQueue={workspace.reviewQueue}
            historicalProposals={workspace.proposals}
            prefillLead={prefillLead}
            selectedStrategyId={selectedStrategyId}
            onClearPrefill={() => setPrefillLead(null)}
            jobStatus={activeJob.status}
            lastError={activeJob.lastError}
            onRunSimulation={handleRunStrategist}
            onSaveStrategy={handleSaveStrategy}
            onUpdateStrategyStatus={handleUpdateStrategyStatus}
            onConvertStrategyToProject={handleConvertStrategyToProject}
            onRequestSendOffer={handleRequestSendOffer}
          />
        );
      case 'project-tracker':
        return (
          <ProjectTrackerPanel
            projects={workspace.projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            jobStatus={activeJob.status}
            lastError={activeJob.lastError}
            onCreateManualProject={handleCreateManualProject}
            onUpdateProject={handleUpdateProject}
            onGenerateClientUpdate={handleGenerateClientUpdate}
          />
        );
      case 'content-creator':
        return (
          <ContentCreatorPanel
            contentQueue={workspace.contentQueue}
            reviewQueue={workspace.reviewQueue}
            selectedContentId={selectedContentId}
            jobStatus={activeJob.status}
            lastError={activeJob.lastError}
            onRunSimulation={handleRunContentCreator}
            onSaveDraftToQueue={handleSaveDraftToQueue}
            onToggleQueueStatus={handleToggleQueueStatus}
            onDeleteQueueRecord={handleDeleteQueueRecord}
            onRequestPublish={handleRequestPublishContent}
          />
        );
    }
  }

  function renderTabStrip() {
    return (
      <div
        role="tablist"
        aria-label="Workspace views"
        className="grid grid-cols-4 border-b border-[#2E3440] bg-[#16191F]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'missions'}
          onClick={() => setActiveTab('missions')}
          className={`flex items-center justify-center gap-1 py-2.5 px-1 text-[11px] sm:text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'missions'
              ? 'border-[#22D3EE] text-[#F4EFE6] bg-[#1B1F26]'
              : 'border-transparent text-[#8A92A0] hover:text-[#E4DFD5]'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Office</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'meeting-room'}
          onClick={() => {
            setActiveTab('meeting-room');
            setFocusedRoom('meeting-room');
          }}
          className={`flex items-center justify-center gap-1 py-2.5 px-1 text-[11px] sm:text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'meeting-room'
              ? 'border-[#22D3EE] text-[#F4EFE6] bg-[#1B1F26]'
              : 'border-transparent text-[#8A92A0] hover:text-[#E4DFD5]'
          }`}
        >
          <Presentation className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="sm:hidden">Board</span>
          <span className="hidden sm:inline">Meeting Room</span>
        </button>

        <button
          type="button"
          role="tab"
          data-testid="tab-needs-me-btn"
          aria-selected={activeTab === 'needs-me'}
          onClick={() => setActiveTab('needs-me')}
          className={`flex items-center justify-center gap-1 py-2.5 px-1 text-[11px] sm:text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'needs-me'
              ? 'border-[#22D3EE] text-[#F4EFE6] bg-[#1B1F26]'
              : 'border-transparent text-[#8A92A0] hover:text-[#E4DFD5]'
          }`}
        >
          <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Needs me ({pendingReviewCount})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'desk'}
          onClick={() => setActiveTab('desk')}
          className={`flex items-center justify-center gap-1 py-2.5 px-1 text-[11px] sm:text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'desk'
              ? 'border-[#22D3EE] text-[#F4EFE6] bg-[#1B1F26]'
              : 'border-transparent text-[#8A92A0] hover:text-[#E4DFD5]'
          }`}
        >
          <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[88px]">{activeBot.shortTag}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-[#14171C] text-[#F4EFE6]">
      {/* Top Studio Header */}
      <header className="shrink-0 h-14 border-b border-[#2E3440] bg-[#16191F] px-3 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-sm sm:text-lg font-semibold tracking-tight text-[#F4EFE6] truncate">
            <span className="sm:hidden">Rhymvex</span>
            <span className="hidden sm:inline">Rhymvex Bot Office</span>
          </h1>
          <span className="hidden md:inline font-mono text-[11px] text-[#EAB365]">
            {workflowRunner.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <p className="hidden xl:block font-mono text-xs text-[#A4AAB5] tabular-nums">
            {workspace.leads.length} leads
            <span className="mx-1.5 text-[#4B5563]">·</span>
            {workspace.strategyBriefs.length} briefs
            <span className="mx-1.5 text-[#4B5563]">·</span>
            {workspace.projects.length} projects
            <span className="mx-1.5 text-[#4B5563]">·</span>
            {workspace.contentQueue.length} queued
          </p>

          <button
            type="button"
            data-testid="pause-office-btn"
            aria-pressed={isOfficePaused}
            onClick={() => setIsOfficePaused((p) => !p)}
            className={`inline-flex items-center gap-1 rounded border px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              isOfficePaused
                ? 'border-[#22D3EE] bg-[#152830] text-[#22D3EE]'
                : 'border-[#343B48] bg-[#1F242D] text-[#E4DFD5] hover:border-[#22D3EE]/70'
            }`}
          >
            {isOfficePaused ? (
              <>
                <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">Resume</span>
                <span className="hidden sm:inline">Resume office</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">Pause</span>
                <span className="hidden sm:inline">Pause office</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="header-needs-me-btn"
            onClick={() => handleOpenTab('needs-me')}
            className={`inline-flex items-center gap-1 rounded border px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
              pendingReviewCount > 0
                ? 'border-[#EAB365] bg-[#2D2416] text-[#F5C678] hover:bg-[#3A2E1B]'
                : 'border-[#343B48] bg-[#1F242D] text-[#C7C2B8] hover:border-[#4B5563]'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Needs me ({pendingReviewCount})
          </button>

          {isDesktop && (
            <button
              type="button"
              data-testid="toggle-desktop-panel"
              onClick={() => setDesktopPanelOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                desktopPanelOpen
                  ? 'border-[#22D3EE] bg-[#152830] text-[#22D3EE]'
                  : 'border-[#343B48] bg-[#1F242D] text-[#E4DFD5] hover:border-[#22D3EE]/70'
              }`}
            >
              <PanelRightOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{desktopPanelOpen ? 'Hide Panel' : 'Office & Jobs'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetDemo}
            aria-label="Reset demo workspace"
            className="inline-flex items-center gap-1.5 rounded border border-[#343B48] bg-[#1F242D] px-2 sm:px-2.5 py-1.5 text-xs font-medium text-[#E4DFD5] hover:border-[#EAB365] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">
              {resetFeedback ? 'Demo Reset' : 'Reset demo'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace (Desktop) / Stacked Studio + Sheet (Mobile) */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left / Primary 3D Studio Column */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Spacious 5-Room 3D Isometric Studio */}
          <div className="h-[360px] sm:h-[420px] lg:h-auto lg:flex-1 min-h-[300px] relative">
            <OfficeViewport3D
              selectedBotId={selectedBotId}
              botStatuses={botStatuses}
              botPresence={botPresence}
              whiteboardLines={whiteboardState.lines}
              isMeetingActive={whiteboardState.isActive}
              focusedRoom={focusedRoom}
              onRoomFocused={handleRoomFocused}
              onSelectBot={handleSelectBot}
              onBotArrived={handleBotArrived}
              onOpenConversation={handleOpenConversation}
            />
          </div>

          {/* Panels-Closed Direct Overview Actions (works with every employee panel closed!) */}
          <div className="shrink-0 border-t border-[#2E3440] bg-[#181C22] px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                data-testid="run-strategist-queue-btn"
                disabled={isRunningAssignment}
                onClick={() => void handleRunStrategistQueue()}
                className="inline-flex items-center gap-1.5 rounded border border-[#22D3EE]/70 bg-[#15252C] px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-[#22D3EE] hover:bg-[#1B313B] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Run Team Sync Queue</span>
              </button>
              <button
                type="button"
                data-testid="run-sample-cleaning-job"
                disabled={isRunningAssignment}
                onClick={() =>
                  void handleAssignJob(SAMPLE_CLEANING_OUTREACH_PROMPT, {
                    includePromoPost: true,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded border border-[#EAB365]/65 bg-[#2A2215] px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-[#F5C678] hover:bg-[#362B19] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Find 3 leads &amp; outreach</span>
              </button>
            </div>

            {!isDesktop && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenTab('missions')}
                  className="rounded border border-[#343B48] bg-[#1F242D] px-2 py-1.5 text-[11px] font-medium text-[#E4DFD5] cursor-pointer whitespace-nowrap"
                >
                  Office &amp; Jobs
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenTab('meeting-room')}
                  className="rounded border border-[#343B48] bg-[#1F242D] px-2 py-1.5 text-[11px] font-medium text-[#E4DFD5] cursor-pointer whitespace-nowrap"
                >
                  Board
                </button>
              </div>
            )}
          </div>

          {/* Compact Coworker List + Recent Activity with Direct Record Links */}
          <div className="shrink-0 border-t border-[#2E3440] bg-[#16191F] p-3 sm:p-3.5 space-y-3 lg:max-h-[240px] lg:overflow-y-auto">
            <CompactBotList
              selectedBotId={selectedBotId}
              botPresence={botPresence}
              botBreaks={workspace.botBreaks}
              onSelectBot={handleSelectBot}
            />

            <ActivityFeed
              events={workspace.activity}
              onOpenArtifact={handleOpenArtifact}
              onOpenConversation={handleOpenConversation}
            />
          </div>
        </div>

        {/* Collapsible Desktop Side-by-Side Workspace Panel (closed by default so overview shines) */}
        {isDesktop && desktopPanelOpen && (
          <aside
            aria-label="Agency operations panel"
            className="w-[470px] xl:w-[520px] shrink-0 border-l border-[#2E3440] bg-[#1B1F26] flex flex-col min-h-0"
          >
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[#2E3440] bg-[#16191F] px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
                Workspace Drawer · Team runs even when closed
              </span>
              <button
                type="button"
                data-testid="close-desktop-panel"
                onClick={() => setDesktopPanelOpen(false)}
                aria-label="Close workspace panel"
                className="rounded border border-[#343B48] bg-[#222730] p-1 text-[#A4AAB5] hover:text-[#F4EFE6] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {renderTabStrip()}

            {activeTab === 'desk' && (
              <div className="shrink-0 border-b border-[#2E3440] px-5 py-3 bg-[#191D24]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <h2 className="font-display text-base font-semibold text-[#F4EFE6] whitespace-nowrap">
                      {activeBot.name}
                    </h2>
                    <span className="font-mono text-[11px] text-[#777E8B] whitespace-nowrap">
                      {activeBot.deskLabel} ·{' '}
                      {BOT_ACTIVITY_LABELS[botPresence[activeBot.id].activity]}
                    </span>
                  </div>
                  <span
                    data-testid="desk-status-label"
                    className={`font-mono text-[11px] tabular-nums shrink-0 whitespace-nowrap ${
                      activeBotDeskStatus === 'Ready for review'
                        ? 'text-[#EAB365]'
                        : JOB_STATUS_COLOR[activeJob.status]
                    }`}
                  >
                    {activeBotDeskStatus}
                  </span>
                </div>
                <p className="text-xs text-[#A4AAB5] mt-1">
                  {activeBot.summary}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {renderPanelBody()}
            </div>
          </aside>
        )}

        {/* Mobile Bottom Sheet Workspace */}
        {!isDesktop && mobileSheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/65"
              aria-hidden="true"
              onClick={() => setMobileSheetOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Rhymvex workspace panel"
              className="relative z-10 max-h-[88vh] w-full flex flex-col rounded-t-xl border-t border-[#2E3440] bg-[#1B1F26] shadow-2xl"
            >
              <div className="flex justify-center pt-2 pb-1 shrink-0">
                <div className="h-1 w-10 rounded-full bg-[#3E4656]" />
              </div>

              <div className="shrink-0 flex items-center justify-between gap-2 px-4 pb-2">
                <span className="font-display text-sm font-semibold text-[#F4EFE6]">
                  {activeTab === 'missions'
                    ? 'Office & Jobs'
                    : activeTab === 'meeting-room'
                      ? 'Meeting Room · Whiteboard History'
                      : activeTab === 'needs-me'
                        ? `Needs me (${pendingReviewCount})`
                        : `${activeBot.name} · ${activeBot.deskLabel}`}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  aria-label="Close workspace sheet"
                  className="rounded border border-[#343B48] bg-[#222730] p-1.5 text-[#A4AAB5] hover:text-[#F4EFE6] cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {renderTabStrip()}

              <div className="flex-1 overflow-y-auto p-4">
                {renderPanelBody()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
