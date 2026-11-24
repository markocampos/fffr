import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  FolderCheck,
  History,
  Presentation,
  RotateCcw,
  Users,
} from 'lucide-react';
import type {
  BotId,
  ConversationFormat,
  ConversationVenue,
  LinkedArtifactRef,
  ProjectRecord,
  WhiteboardSnapshot,
} from '../types/workspace';
import { BOTS } from '../state/seedDemo';
import {
  filterWhiteboardSnapshots,
  type WhiteboardHistoryFilter,
} from '../state/whiteboardHistory';

interface MeetingRoomPanelProps {
  snapshots: WhiteboardSnapshot[];
  activeSnapshotId: string | null;
  liveWhiteboardLines: string[];
  isMeetingActive: boolean;
  isBusy: boolean;
  projects: ProjectRecord[];
  onRestoreToWhiteboard: (snapshot: WhiteboardSnapshot) => void;
  onRestoreDecisionsToProject: (
    snapshot: WhiteboardSnapshot,
    projectId: string
  ) => void;
  onTriggerSession: (format: Extract<ConversationFormat, 'trio' | 'all-hands'>) => Promise<void>;
  onOpenArtifact: (ref: LinkedArtifactRef) => void;
  onOpenProject: (projectId: string) => void;
}

const FORMAT_LABELS: Record<ConversationFormat, string> = {
  solo: '1-Person Review',
  pair: '2-Person Huddle',
  trio: '3-Person Whiteboard',
  'all-hands': '4-Person All-Hands',
};

const VENUE_LABELS: Record<ConversationVenue, string> = {
  'desk-side': 'Desk-Side',
  lounge: 'Lounge',
  whiteboard: 'Whiteboard',
  'meeting-room': 'Glass Meeting Room',
};

const FILTER_OPTIONS: Array<{ id: WhiteboardHistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'with-project', label: 'With Project' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'autonomous', label: 'Team Auto' },
];

export function MeetingRoomPanel({
  snapshots,
  activeSnapshotId,
  liveWhiteboardLines,
  isMeetingActive,
  isBusy,
  projects,
  onRestoreToWhiteboard,
  onRestoreDecisionsToProject,
  onTriggerSession,
  onOpenArtifact,
  onOpenProject,
}: MeetingRoomPanelProps) {
  const [filter, setFilter] = useState<WhiteboardHistoryFilter>('all');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    () => activeSnapshotId ?? snapshots[0]?.id ?? null
  );
  const [targetProjectId, setTargetProjectId] = useState<string>(
    () => projects[0]?.id ?? ''
  );
  const [boardRestoreNotice, setBoardRestoreNotice] = useState<string | null>(
    null
  );
  const [projectRestoreNotice, setProjectRestoreNotice] = useState<{
    snapshotId: string;
    projectId: string;
    projectTitle: string;
  } | null>(null);

  const botNameById = useMemo(
    () =>
      Object.fromEntries(BOTS.map((b) => [b.id, b.name])) as Record<
        BotId,
        string
      >,
    []
  );

  const filteredSnapshots = useMemo(
    () => filterWhiteboardSnapshots(snapshots, filter),
    [snapshots, filter]
  );

  const selectedSnapshot =
    filteredSnapshots.find((s) => s.id === selectedSnapshotId) ??
    filteredSnapshots[0] ??
    null;

  // Keep target project aligned with the inspected snapshot's linked project when switching snapshots
  useEffect(() => {
    if (!selectedSnapshot) return;
    if (
      selectedSnapshot.projectId &&
      projects.some((p) => p.id === selectedSnapshot.projectId)
    ) {
      setTargetProjectId(selectedSnapshot.projectId);
    } else if (
      projects.length > 0 &&
      !projects.some((p) => p.id === targetProjectId)
    ) {
      setTargetProjectId(projects[0].id);
    }
  }, [selectedSnapshot, projects, targetProjectId]);

  const activeSnapshot =
    snapshots.find((s) => s.id === activeSnapshotId) ?? null;

  const isSelectedOnBoard =
    Boolean(selectedSnapshot) &&
    !isMeetingActive &&
    activeSnapshotId === selectedSnapshot?.id;

  const resolvedProject =
    projects.find((p) => p.id === targetProjectId) ?? projects[0] ?? null;

  function handleRestoreBoard(snapshot: WhiteboardSnapshot) {
    onRestoreToWhiteboard(snapshot);
    setBoardRestoreNotice(snapshot.id);
    window.setTimeout(() => {
      setBoardRestoreNotice((curr) => (curr === snapshot.id ? null : curr));
    }, 2600);
  }

  function handleRestoreProject(snapshot: WhiteboardSnapshot) {
    if (!resolvedProject) return;
    onRestoreDecisionsToProject(snapshot, resolvedProject.id);
    setProjectRestoreNotice({
      snapshotId: snapshot.id,
      projectId: resolvedProject.id,
      projectTitle: resolvedProject.title,
    });
  }

  return (
    <div className="space-y-5" data-testid="meeting-room-workspace">
      {/* Live Meeting Room Board Summary & Quick Session Controls */}
      <section
        aria-label="Live Meeting Room whiteboard"
        className="rounded-md border border-[#2E3440] bg-[#191D24] p-4 space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[#F4EFE6] flex items-center gap-2">
              <Presentation
                className="w-4 h-4 text-[#22D3EE] shrink-0"
                aria-hidden="true"
              />
              Glass Meeting Room
            </h2>
            <p className="text-xs text-[#A4AAB5] mt-0.5">
              {isMeetingActive
                ? 'Live session writing decisions to the 3D whiteboard.'
                : activeSnapshot
                  ? `Showing on 3D board: ${activeSnapshot.sessionTitle}`
                  : 'Select any saved snapshot below to inspect or restore on the 3D whiteboard.'}
            </p>
          </div>
          <span
            className={`font-mono text-[11px] shrink-0 ${
              isMeetingActive ? 'text-[#22D3EE]' : 'text-[#EAB365]'
            }`}
          >
            {isMeetingActive
              ? 'Live Session'
              : activeSnapshot
                ? 'Snapshot Active'
                : 'Board Ready'}
          </span>
        </div>

        {/* Live 3D Board Readout */}
        <div
          data-testid="live-board-summary"
          className="rounded border border-[#343B48] bg-[#14171C] px-3 py-2.5 space-y-1"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#8A92A0]">
            <span>Current 3D Whiteboard</span>
            <span className="tabular-nums">
              {liveWhiteboardLines.length > 0
                ? `${liveWhiteboardLines.length} lines`
                : 'Default standby'}
            </span>
          </div>
          {liveWhiteboardLines.length > 0 ? (
            <p className="text-xs text-[#F4EFE6] truncate">
              {liveWhiteboardLines[0]}
              {liveWhiteboardLines.length > 1
                ? ` · ${liveWhiteboardLines[1]}`
                : ''}
            </p>
          ) : (
            <p className="text-xs text-[#8A92A0]">
              Ready for team brainstorms and decision reviews.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-[#8A92A0]">
            Run a new whiteboard session:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onTriggerSession('trio')}
              className="rounded border border-[#343B48] bg-[#222730] px-2.5 py-1.5 text-xs font-medium text-[#E4DFD5] hover:border-[#22D3EE] disabled:opacity-50 transition-colors cursor-pointer"
            >
              3P Whiteboard
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onTriggerSession('all-hands')}
              className="rounded border border-[#343B48] bg-[#222730] px-2.5 py-1.5 text-xs font-medium text-[#E4DFD5] hover:border-[#22D3EE] disabled:opacity-50 transition-colors cursor-pointer"
            >
              4P All-Hands
            </button>
          </div>
        </div>
      </section>

      {/* Whiteboard History Panel */}
      <section
        aria-label="Whiteboard History"
        data-testid="whiteboard-history-panel"
        className="rounded-md border border-[#2E3440] bg-[#191D24] p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#F4EFE6] flex items-center gap-1.5">
              <History
                className="w-4 h-4 text-[#EAB365] shrink-0"
                aria-hidden="true"
              />
              Whiteboard History ({snapshots.length})
            </h3>
            <p className="text-xs text-[#8A92A0] mt-0.5">
              Past whiteboard snapshots captured from collaborative sessions.
            </p>
          </div>
        </div>

        {/* Segmented Filter Controls */}
        <div
          role="group"
          aria-label="Filter whiteboard snapshots"
          className="grid grid-cols-4 gap-1 rounded bg-[#14171C] p-1 border border-[#2A303B]"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(opt.id)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#222730] text-[#F4EFE6] border border-[#3E4656]'
                    : 'text-[#8A92A0] hover:text-[#E4DFD5] border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Snapshot Timeline List */}
        {filteredSnapshots.length === 0 ? (
          <div className="rounded border border-[#2A303B] bg-[#16191F] p-4 text-center space-y-1.5">
            <p className="text-xs font-medium text-[#E4DFD5]">
              No whiteboard snapshots match this filter yet.
            </p>
            <p className="text-[11px] text-[#8A92A0]">
              Switch to All snapshots or run a 3-person whiteboard or 4-person meeting session above.
            </p>
          </div>
        ) : (
          <div
            className="space-y-1.5 max-h-[215px] overflow-y-auto pr-0.5"
            data-testid="whiteboard-snapshot-list"
          >
            {filteredSnapshots.map((snap) => {
              const isSelected = selectedSnapshot?.id === snap.id;
              const isOnBoard = !isMeetingActive && activeSnapshotId === snap.id;
              return (
                <button
                  key={snap.id}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`whiteboard-snapshot-${snap.id}`}
                  onClick={() => {
                    setSelectedSnapshotId(snap.id);
                    setProjectRestoreNotice(null);
                  }}
                  className={`w-full rounded border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#22D3EE] bg-[#15252C]'
                      : 'border-[#2B313D] bg-[#16191F] hover:border-[#434C5E]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F4EFE6] leading-snug">
                      {snap.sessionTitle}
                    </span>
                    <span
                      className={`font-mono text-[10px] shrink-0 tabular-nums ${
                        isOnBoard ? 'text-[#22D3EE]' : 'text-[#8A92A0]'
                      }`}
                    >
                      {isOnBoard ? 'On board' : snap.capturedAt}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A4AAB5] mt-1 truncate">
                    <span>{FORMAT_LABELS[snap.format]}</span>
                    <span className="mx-1.5 text-[#4B5563]" aria-hidden="true">
                      ·
                    </span>
                    <span className="tabular-nums">
                      {snap.decisions.length}{' '}
                      {snap.decisions.length === 1 ? 'decision' : 'decisions'}
                    </span>
                    {snap.projectTitle && (
                      <>
                        <span
                          className="mx-1.5 text-[#4B5563]"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="text-[#EAB365]">
                          {snap.projectTitle}
                        </span>
                      </>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Snapshot Inspector */}
        {selectedSnapshot && (
          <div
            data-testid="whiteboard-snapshot-inspector"
            className="border-t border-[#2A303B] pt-4 space-y-4"
          >
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-[#F4EFE6]">
                  {selectedSnapshot.sessionTitle}
                </h4>
                <span className="font-mono text-[10px] text-[#8A92A0] shrink-0 tabular-nums">
                  {selectedSnapshot.capturedAt}
                </span>
              </div>
              <p className="text-[11px] text-[#A4AAB5]">
                <span>{VENUE_LABELS[selectedSnapshot.venue]}</span>
                <span className="mx-1.5 text-[#4B5563]" aria-hidden="true">
                  ·
                </span>
                <span>{FORMAT_LABELS[selectedSnapshot.format]}</span>
                <span className="mx-1.5 text-[#4B5563]" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3 inline" aria-hidden="true" />
                  {selectedSnapshot.attendees
                    .map((id) => botNameById[id] ?? id)
                    .join(', ')}
                </span>
              </p>
            </div>

            {/* Warm Studio Drafting Board Preview (Matches 3D Whiteboard Canvas) */}
            <div
              aria-label="Whiteboard snapshot preview"
              className="rounded-md border border-[#3E4656] overflow-hidden shadow-inner"
            >
              <div className="bg-[#1E232C] border-b-2 border-[#EAB365] px-3 py-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold tracking-wide text-[#F4EFE6]">
                  RHYMVEX MEETING WHITEBOARD
                </span>
                <span className="font-mono text-[10px] text-[#EAB365] tabular-nums">
                  {isSelectedOnBoard ? 'Active on 3D board' : 'Archived snapshot'}
                </span>
              </div>
              <div className="bg-[#E8E3D8] px-3.5 py-3 space-y-1.5 text-[#14171C]">
                {selectedSnapshot.whiteboardLines.map((line, idx) => (
                  <p
                    key={idx}
                    className={
                      idx === 0
                        ? 'text-xs font-bold text-[#0B647A] tracking-tight'
                        : 'text-xs font-medium text-[#181C22] leading-snug'
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* Recorded Project Decisions */}
            {selectedSnapshot.decisions.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-semibold text-[#F4EFE6]">
                  Recorded Project Decisions ({selectedSnapshot.decisions.length})
                </h5>
                <ul className="space-y-1.5 text-xs text-[#D5D0C6]">
                  {selectedSnapshot.decisions.map((decision, idx) => (
                    <li
                      key={idx}
                      className="rounded border border-[#2A303B] bg-[#16191F] px-3 py-2 leading-relaxed"
                    >
                      {decision}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recorded Next Steps */}
            {selectedSnapshot.nextSteps.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-semibold text-[#A4AAB5]">
                  Assigned Next Steps
                </h5>
                <ul className="space-y-1 text-xs text-[#C7C2B8]">
                  {selectedSnapshot.nextSteps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      <span className="font-medium text-[#F4EFE6]">
                        {botNameById[step.botId] ?? step.botId}:
                      </span>{' '}
                      {step.task}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Linked Workspace Artifacts */}
            {selectedSnapshot.linkedArtifacts &&
              selectedSnapshot.linkedArtifacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSnapshot.linkedArtifacts.map((ref) => (
                    <button
                      key={`${ref.kind}-${ref.id}`}
                      type="button"
                      onClick={() => onOpenArtifact(ref)}
                      className="inline-flex items-center gap-1 rounded border border-[#2A3C44] bg-[#16191F] px-2.5 py-1 text-[11px] text-[#22D3EE] hover:border-[#22D3EE] cursor-pointer"
                    >
                      <span>{ref.label}</span>
                      <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}

            {/* Restore Actions */}
            <div className="border-t border-[#2A303B] pt-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  data-testid="restore-to-whiteboard-btn"
                  disabled={isMeetingActive || isSelectedOnBoard}
                  onClick={() => handleRestoreBoard(selectedSnapshot)}
                  className="inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3.5 py-2 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isSelectedOnBoard ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Active on Whiteboard
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      Restore to Whiteboard
                    </>
                  )}
                </button>

                {boardRestoreNotice === selectedSnapshot.id && (
                  <span
                    role="status"
                    className="font-mono text-[11px] text-[#4ADE80]"
                  >
                    Restored to 3D Meeting Room whiteboard
                  </span>
                )}
              </div>

              {/* Restore Decisions to Project */}
              {selectedSnapshot.decisions.length > 0 && projects.length > 0 && (
                <div className="rounded border border-[#2E3440] bg-[#16191F] p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="wb-restore-project-select"
                      className="text-xs font-medium text-[#E4DFD5]"
                    >
                      Restore Decisions to Project
                    </label>
                    <span className="font-mono text-[10px] text-[#8A92A0]">
                      Updates active project decisions
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      id="wb-restore-project-select"
                      value={resolvedProject?.id ?? ''}
                      onChange={(e) => {
                        setTargetProjectId(e.target.value);
                        setProjectRestoreNotice(null);
                      }}
                      className="flex-1 min-w-0 rounded border border-[#343B48] bg-[#1B1F26] px-2.5 py-1.5 text-xs text-[#F4EFE6] focus:border-[#22D3EE] focus:outline-none"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      data-testid="restore-decisions-to-project-btn"
                      onClick={() => handleRestoreProject(selectedSnapshot)}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded border border-[#22D3EE]/70 bg-[#15252C] px-3 py-1.5 text-xs font-semibold text-[#22D3EE] hover:bg-[#1B313B] transition-colors cursor-pointer"
                    >
                      <FolderCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      Apply Decisions
                    </button>
                  </div>

                  {projectRestoreNotice &&
                    projectRestoreNotice.snapshotId === selectedSnapshot.id && (
                      <div
                        role="status"
                        className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#A7F3D0]"
                      >
                        <span>
                          Restored {selectedSnapshot.decisions.length} decisions
                          to {projectRestoreNotice.projectTitle}.
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenProject(projectRestoreNotice.projectId)
                          }
                          className="inline-flex items-center gap-1 font-medium text-[#22D3EE] hover:underline cursor-pointer"
                        >
                          <span>View in Project Tracker</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
