import type {
  LinkedArtifactRef,
  MeetingRecord,
  ProjectRecord,
  WhiteboardSnapshot,
  WorkspaceState,
} from '../types/workspace';

export type WhiteboardHistoryFilter =
  | 'all'
  | 'with-project'
  | 'assigned'
  | 'autonomous';

export function mergeUniqueArtifacts(
  existing?: LinkedArtifactRef[],
  incoming?: LinkedArtifactRef[]
): LinkedArtifactRef[] {
  const result: LinkedArtifactRef[] = [];
  const seen = new Set<string>();
  for (const item of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!item || !item.id) continue;
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Builds a persistent WhiteboardSnapshot from a collaborative session whenever
 * whiteboard content was written (or decisions were logged at the board/meeting room).
 */
export function buildWhiteboardSnapshotFromMeeting(
  meeting: Pick<
    MeetingRecord,
    | 'id'
    | 'title'
    | 'startedAt'
    | 'format'
    | 'venue'
    | 'source'
    | 'attendees'
    | 'whiteboardLines'
    | 'decisions'
    | 'nextSteps'
    | 'linkedArtifacts'
  >,
  projects: ProjectRecord[],
  overrides?: {
    capturedAt?: string;
    projectId?: string;
    projectTitle?: string;
    linkedArtifacts?: LinkedArtifactRef[];
  }
): WhiteboardSnapshot | null {
  const cleanLines = meeting.whiteboardLines
    .map((line) => line.trim())
    .filter(Boolean);
  const cleanDecisions = meeting.decisions
    .map((d) => d.trim())
    .filter(Boolean);

  if (cleanLines.length === 0) {
    return null;
  }

  const mergedArtifacts = mergeUniqueArtifacts(
    meeting.linkedArtifacts,
    overrides?.linkedArtifacts
  );

  const linkedProjectRef = mergedArtifacts.find((r) => r.kind === 'project');
  const resolvedProjectId = overrides?.projectId ?? linkedProjectRef?.id;
  const matchedProject = resolvedProjectId
    ? projects.find((p) => p.id === resolvedProjectId)
    : undefined;

  return {
    id: `wb-${meeting.id}`,
    meetingId: meeting.id,
    sessionTitle: meeting.title,
    capturedAt: overrides?.capturedAt || meeting.startedAt,
    format: meeting.format,
    venue: meeting.venue,
    source: meeting.source,
    attendees: [...meeting.attendees],
    whiteboardLines: cleanLines,
    decisions: cleanDecisions,
    nextSteps: meeting.nextSteps.map((s) => ({ ...s })),
    projectId: resolvedProjectId,
    projectTitle:
      overrides?.projectTitle ?? matchedProject?.title ?? linkedProjectRef?.label,
    linkedArtifacts: mergedArtifacts.length > 0 ? mergedArtifacts : undefined,
    isDemo: false,
  };
}

/**
 * Inserts a new snapshot at the top of history or updates an existing snapshot for
 * the same session (preserving order while enriching lines, decisions, or linked project).
 */
export function upsertWhiteboardSnapshot(
  history: WhiteboardSnapshot[],
  snapshot: WhiteboardSnapshot
): WhiteboardSnapshot[] {
  const idx = history.findIndex(
    (item) =>
      item.id === snapshot.id ||
      (snapshot.meetingId && item.meetingId === snapshot.meetingId)
  );

  if (idx === -1) {
    return [snapshot, ...history];
  }

  const existing = history[idx];
  const merged: WhiteboardSnapshot = {
    ...existing,
    ...snapshot,
    whiteboardLines:
      snapshot.whiteboardLines.length > 0
        ? snapshot.whiteboardLines
        : existing.whiteboardLines,
    decisions:
      snapshot.decisions.length > 0 ? snapshot.decisions : existing.decisions,
    nextSteps:
      snapshot.nextSteps.length > 0 ? snapshot.nextSteps : existing.nextSteps,
    projectId: snapshot.projectId ?? existing.projectId,
    projectTitle: snapshot.projectTitle ?? existing.projectTitle,
    linkedArtifacts: mergeUniqueArtifacts(
      existing.linkedArtifacts,
      snapshot.linkedArtifacts
    ),
  };

  const next = [...history];
  next[idx] = merged;
  return next;
}

export function filterWhiteboardSnapshots(
  history: WhiteboardSnapshot[],
  filter: WhiteboardHistoryFilter
): WhiteboardSnapshot[] {
  if (filter === 'all') return history;
  if (filter === 'with-project') {
    return history.filter(
      (snap) =>
        Boolean(snap.projectId) ||
        Boolean(snap.linkedArtifacts?.some((a) => a.kind === 'project'))
    );
  }
  if (filter === 'assigned') {
    return history.filter((snap) => snap.source === 'assigned');
  }
  return history.filter((snap) => snap.source === 'autonomous' || snap.source === 'demo');
}

/**
 * Applies a historical whiteboard snapshot's recorded decisions to a project record
 * without mutating the original project object.
 */
export function applySnapshotDecisionsToProject(
  project: ProjectRecord,
  snapshot: WhiteboardSnapshot,
  restoredAt: string
): ProjectRecord {
  const decisions =
    snapshot.decisions.length > 0
      ? [...snapshot.decisions]
      : [...snapshot.whiteboardLines];

  return {
    ...project,
    activeDecisions: {
      sourceSnapshotId: snapshot.id,
      sessionTitle: snapshot.sessionTitle,
      restoredAt,
      decisions,
      whiteboardLines: [...snapshot.whiteboardLines],
    },
  };
}

export function resolveLiveWhiteboardSnapshot(
  state: Pick<WorkspaceState, 'whiteboardHistory' | 'activeWhiteboardSnapshotId'>
): WhiteboardSnapshot | null {
  if (state.activeWhiteboardSnapshotId) {
    const found = state.whiteboardHistory.find(
      (s) => s.id === state.activeWhiteboardSnapshotId
    );
    if (found) return found;
  }
  return state.whiteboardHistory[0] ?? null;
}
