import type {
  ActivityEvent,
  AssignmentRecord,
  BotId,
  LinkedArtifactRef,
  MeetingRecord,
  ProjectRecord,
  ProposalRecord,
  ReviewItem,
  TodayFocus,
  WhiteboardSnapshot,
  WorkspaceState,
} from '../types/workspace';
import { createInitialWorkspaceState } from './seedDemo';
import { migrateRoutinePendingReviewsToTeamLead } from '../workflows/teamLeadEngine';
import { reconcileQueueOnHydrate } from './officeQueueStore';
import { reconcileBotBreaksOnHydrate } from '../workflows/coffeeBreak';

export const WORKSPACE_STORAGE_KEY = 'rhymvex_bot_office_state_v1';

const VALID_BOT_IDS = new Set<BotId>([
  'lead-finder',
  'business-strategist',
  'project-tracker',
  'content-creator',
]);

/** Migrates any legacy 'proposal-writer' role IDs to 'business-strategist' while preserving data. */
export function migrateRoleId(rawId: string | undefined): BotId {
  if (rawId === 'proposal-writer') return 'business-strategist';
  if (rawId && VALID_BOT_IDS.has(rawId as BotId)) {
    return rawId as BotId;
  }
  return 'business-strategist';
}

export function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createActivityEvent(
  botId: BotId,
  action: string,
  detail: string,
  artifactRef?: LinkedArtifactRef,
  meta?: { meetingId?: string; focusId?: string }
): ActivityEvent {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: nowStamp(),
    botId,
    action,
    detail,
    artifactRef,
    meetingId: meta?.meetingId,
    focusId: meta?.focusId,
  };
}

export function formatProposalAsMarkdown(
  proposal: ProposalRecord | Omit<ProposalRecord, 'id' | 'createdAt' | 'status'>
): string {
  const lines: string[] = [
    `# Historical Proposal: ${proposal.clientName}`,
    '',
    `**Project Goal:** ${proposal.projectGoal}`,
    `**Estimated Budget:** ${proposal.budget}`,
    `**Timeline:** ${proposal.timeline}`,
    '',
    '## Scope',
    proposal.scope,
    '',
    '## Deliverables',
    ...proposal.deliverables.map((d) => `- ${d}`),
    '',
    '## Milestones',
    ...proposal.milestones.map(
      (m) => `- **${m.phase}** (${m.targetWeek}): ${m.deliverable}`
    ),
    '',
    '## Exclusions',
    ...proposal.exclusions.map((e) => `- ${e}`),
    '',
    '## Pricing',
    ...proposal.pricing.map((p) => `- ${p.item}: ${p.amount}`),
    '',
    '## Next Steps',
    proposal.nextSteps,
  ];
  return lines.join('\n');
}

export function computeProjectProgress(project: ProjectRecord): {
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  percent: number;
} {
  const totalTasks = project.tasks.length;
  const doneTasks = project.tasks.filter((t) => t.status === 'done').length;
  const blockedTasks = project.tasks.filter((t) => t.blocked).length;
  const percent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  return { totalTasks, doneTasks, blockedTasks, percent };
}

export function deriveProjectStatus(
  project: ProjectRecord
): ProjectRecord['status'] {
  if (
    project.tasks.length > 0 &&
    project.tasks.every((t) => t.status === 'done')
  ) {
    return 'completed';
  }
  if (project.tasks.some((t) => t.blocked)) {
    return 'at-risk';
  }
  return 'active';
}

function normalizeBotJob(
  job?: WorkspaceState['botJobs'][BotId]
): WorkspaceState['botJobs'][BotId] {
  if (!job) return { status: 'idle', mode: 'simulation' };
  return {
    ...job,
    status: job.status === 'running' ? 'idle' : job.status,
  };
}

function normalizeArtifactRef(
  ref?: LinkedArtifactRef
): LinkedArtifactRef | undefined {
  if (!ref) return undefined;
  return { ...ref, botId: migrateRoleId(ref.botId) };
}

function normalizeReviewQueue(raw?: ReviewItem[]): ReviewItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const deduped: ReviewItem[] = [];
  for (const item of raw) {
    if (!item || typeof item.id !== 'string') continue;
    const key = item.dedupeKey || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...item,
      dedupeKey: key,
      linkedArtifacts: Array.isArray(item.linkedArtifacts)
        ? item.linkedArtifacts.map((r) => ({ ...r, botId: migrateRoleId(r.botId) }))
        : [],
    });
  }
  return deduped;
}

function normalizeAssignments(
  raw?: AssignmentRecord[],
  activeSyncAssignmentId?: string | null
): AssignmentRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    ...a,
    status:
      (a.status === 'running' || a.status === 'revising') &&
      a.id !== activeSyncAssignmentId
        ? 'completed'
        : a.status,
    participants: Array.isArray(a.participants)
      ? Array.from(new Set(a.participants.map((p) => migrateRoleId(p))))
      : [],
    steps: Array.isArray(a.steps)
      ? a.steps.map((s) => ({ ...s, botId: migrateRoleId(s.botId) }))
      : [],
    linkedArtifacts: Array.isArray(a.linkedArtifacts)
      ? a.linkedArtifacts.map((r) => ({ ...r, botId: migrateRoleId(r.botId) }))
      : [],
  }));
}

function normalizeMeetings(raw?: MeetingRecord[]): MeetingRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const normalized: MeetingRecord[] = [];
  for (const m of raw) {
    if (!m || typeof m.id !== 'string' || seen.has(m.id)) continue;
    // Drop conversations that were interrupted mid-flight before concluding & saving work
    if (m.status === 'active' && !m.outcomeSummary) continue;
    seen.add(m.id);
    normalized.push({
      ...m,
      status: m.status === 'active' ? 'concluded' : m.status,
      format:
        m.format ||
        (m.attendees?.length >= 4
          ? 'all-hands'
          : m.attendees?.length === 3
            ? 'trio'
            : m.attendees?.length === 2
              ? 'pair'
              : 'solo'),
      venue: m.venue || 'meeting-room',
      source: m.source || 'assigned',
      attendees: Array.isArray(m.attendees)
        ? Array.from(new Set(m.attendees.map((a) => migrateRoleId(a))))
        : [],
      turns: Array.isArray(m.turns)
        ? m.turns.map((t) => ({ ...t, speaker: migrateRoleId(t.speaker) }))
        : [],
      nextSteps: Array.isArray(m.nextSteps)
        ? m.nextSteps.map((ns) => ({ ...ns, botId: migrateRoleId(ns.botId) }))
        : [],
      followUpOwner: m.followUpOwner ? migrateRoleId(m.followUpOwner) : undefined,
      linkedArtifacts: Array.isArray(m.linkedArtifacts)
        ? m.linkedArtifacts.map((r) => ({ ...r, botId: migrateRoleId(r.botId) }))
        : undefined,
    });
  }
  return normalized;
}

function normalizeTodayFocus(raw?: TodayFocus | null): TodayFocus | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.goal !== 'string') {
    return null;
  }
  return {
    ...raw,
    targetCount:
      typeof raw.targetCount === 'number' && raw.targetCount >= 1
        ? Math.min(5, Math.round(raw.targetCount))
        : 3,
    workKind: raw.workKind || 'lead-evaluation',
    status: raw.status === 'completed' ? 'completed' : 'active',
  };
}

function normalizeWhiteboardHistory(
  raw?: WhiteboardSnapshot[],
  fallback: WhiteboardSnapshot[] = []
): WhiteboardSnapshot[] {
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<string>();
  const normalized: WhiteboardSnapshot[] = [];
  for (const snap of raw) {
    if (!snap || typeof snap.id !== 'string') continue;
    if (seen.has(snap.id)) continue;
    seen.add(snap.id);
    normalized.push({
      ...snap,
      format:
        snap.format ||
        (snap.attendees?.length >= 4
          ? 'all-hands'
          : snap.attendees?.length === 3
            ? 'trio'
            : snap.attendees?.length === 2
              ? 'pair'
              : 'solo'),
      venue: snap.venue || 'meeting-room',
      source: snap.source || 'autonomous',
      attendees: Array.isArray(snap.attendees)
        ? Array.from(new Set(snap.attendees.map((a) => migrateRoleId(a))))
        : [],
      whiteboardLines: Array.isArray(snap.whiteboardLines)
        ? snap.whiteboardLines.filter((l): l is string => typeof l === 'string')
        : [],
      decisions: Array.isArray(snap.decisions)
        ? snap.decisions.filter((d): d is string => typeof d === 'string')
        : [],
      nextSteps: Array.isArray(snap.nextSteps)
        ? snap.nextSteps.map((ns) => ({ ...ns, botId: migrateRoleId(ns.botId) }))
        : [],
      linkedArtifacts: Array.isArray(snap.linkedArtifacts)
        ? snap.linkedArtifacts.map((r) => ({ ...r, botId: migrateRoleId(r.botId) }))
        : undefined,
    });
  }
  return normalized;
}

/**
 * Loads saved state while preserving all prior leads, historical proposals, projects,
 * content drafts, strategy briefs, and activity. Safely migrates legacy 'proposal-writer' records.
 */
export function loadWorkspaceState(): WorkspaceState {
  const fallback = createInitialWorkspaceState();
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WorkspaceState> & {
      botJobs?: Record<string, WorkspaceState['botJobs'][BotId]>;
    };
    if (
      !Array.isArray(parsed.leads) ||
      !Array.isArray(parsed.proposals) ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.contentQueue) ||
      !Array.isArray(parsed.activity)
    ) {
      return fallback;
    }

    const migratedLeads = parsed.leads.map((l) => ({
      ...l,
      status:
        (l.status as string) === 'proposal-drafted'
          ? ('evaluated' as const)
          : l.status || ('saved' as const),
    }));

    const migratedActivity = parsed.activity.map((evt) => ({
      ...evt,
      botId: migrateRoleId(evt.botId),
      artifactRef: normalizeArtifactRef(evt.artifactRef),
    }));

    const activeSyncAssignmentId =
      parsed.officeQueue?.activeSyncBatch?.status === 'active'
        ? parsed.officeQueue.activeSyncBatch.assignmentId
        : null;
    const normalizedAssignments = normalizeAssignments(
      parsed.assignments,
      activeSyncAssignmentId
    );
    const reconciledQueue = reconcileQueueOnHydrate(
      parsed.officeQueue,
      normalizedAssignments
    );

    const loaded: WorkspaceState = {
      todayFocus: normalizeTodayFocus(parsed.todayFocus),
      leads: migratedLeads,
      strategyBriefs: Array.isArray(parsed.strategyBriefs)
        ? parsed.strategyBriefs.map((s) => ({
            ...s,
            nextStepOwner: migrateRoleId(s.nextStepOwner),
          }))
        : fallback.strategyBriefs,
      proposals: parsed.proposals.map((p) => ({ ...p, isHistorical: true })),
      projects: parsed.projects,
      contentQueue: parsed.contentQueue,
      activity: migratedActivity,
      botJobs: {
        'lead-finder': normalizeBotJob(parsed.botJobs?.['lead-finder']),
        'business-strategist': normalizeBotJob(
          parsed.botJobs?.['business-strategist'] ??
            parsed.botJobs?.['proposal-writer']
        ),
        'project-tracker': normalizeBotJob(parsed.botJobs?.['project-tracker']),
        'content-creator': normalizeBotJob(parsed.botJobs?.['content-creator']),
      },
      assignments: normalizedAssignments,
      meetings: normalizeMeetings(parsed.meetings),
      whiteboardHistory: normalizeWhiteboardHistory(
        parsed.whiteboardHistory,
        fallback.whiteboardHistory
      ),
      activeWhiteboardSnapshotId:
        typeof parsed.activeWhiteboardSnapshotId === 'string'
          ? parsed.activeWhiteboardSnapshotId
          : parsed.activeWhiteboardSnapshotId === null
            ? null
            : fallback.activeWhiteboardSnapshotId,
      reviewQueue: normalizeReviewQueue(parsed.reviewQueue),
      executedActions: Array.isArray(parsed.executedActions)
        ? parsed.executedActions
        : [],
      officeQueue: reconciledQueue,
      botBreaks: reconcileBotBreaksOnHydrate(parsed.botBreaks),
    };

    return migrateRoutinePendingReviewsToTeamLead(loaded).state;
  } catch {
    return fallback;
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Gracefully ignore storage quota errors
  }
}

export function clearWorkspaceStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
