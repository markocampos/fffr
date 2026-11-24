import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  Play,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  AssignmentRecord,
  BotId,
  ConversationFormat,
  ConversationVenue,
  LinkedArtifactRef,
  MeetingRecord,
  ReviewItem,
  TodayFocus,
} from '../types/workspace';
import { BOTS } from '../state/seedDemo';
import { getMeetingDisplayStatus } from '../state/reviewStatus';
import type { FocusProgressSnapshot } from '../workflows/focusPlanner';
import { SAMPLE_CLEANING_OUTREACH_PROMPT } from '../workflows/teamLeadEngine';
import { TodayFocusCard, type SaveFocusInput } from './TodayFocusCard';

interface AssignmentsPanelProps {
  todayFocus: TodayFocus | null;
  focusProgress: FocusProgressSnapshot;
  assignments: AssignmentRecord[];
  meetings: MeetingRecord[];
  reviewQueue: ReviewItem[];
  selectedMeetingId: string | null;
  onSelectMeeting: (meetingId: string) => void;
  isRunningAssignment: boolean;
  isConversationActive: boolean;
  onSaveTodayFocus: (input: SaveFocusInput) => void;
  onAssignJob: (
    prompt: string,
    options: { includePromoPost: boolean }
  ) => Promise<void>;
  onRunStrategistQueue?: () => Promise<void>;
  onTriggerConversation: (format: ConversationFormat) => Promise<void>;
  onOpenArtifact: (ref: LinkedArtifactRef) => void;
  onOpenNeedsMe: () => void;
}

const QUICK_ASSIGNMENTS = [
  {
    label: 'Find 3 cleaning businesses & draft outreach',
    prompt: SAMPLE_CLEANING_OUTREACH_PROMPT,
    tierHint: 'Team Lead Auto-Review · 1 Owner Decision',
  },
  {
    label: 'Prepare a cleaning-business offer',
    prompt: 'Prepare a cleaning-business offer',
    tierHint: 'Team Meeting · Auto-save · Team Lead Closes',
  },
  {
    label: 'Send pilot offer to client',
    prompt: 'Send pilot offer to the client',
    tierHint: 'High-Impact · Pauses for Approval',
  },
  {
    label: 'Tag saved leads automatically',
    prompt: 'Tag saved leads for Q4 follow-up',
    tierHint: 'Small Task · Auto-saves',
  },
];

const FORMAT_LABELS: Record<ConversationFormat, string> = {
  solo: '1-Person Think-Aloud',
  pair: '2-Person Desk / Lounge',
  trio: '3-Person Whiteboard',
  'all-hands': '4-Person All-Hands',
};

const VENUE_LABELS: Record<ConversationVenue, string> = {
  'desk-side': 'Desk-Side',
  lounge: 'Lounge',
  whiteboard: 'Whiteboard',
  'meeting-room': 'Glass Meeting Room',
};

const TIER_LABEL: Record<AssignmentRecord['tier'], string> = {
  small: 'Small · Auto-save',
  medium: 'Medium · Team Auto-save',
  'final-deliverable': 'Final Deliverable · 1 Review',
  'high-impact': 'High-Impact · Approval Gate',
};

const FORMAT_BUTTONS: Array<{
  format: ConversationFormat;
  label: string;
  hint: string;
}> = [
  { format: 'solo', label: '1P Solo', hint: 'Strategist thinks aloud' },
  { format: 'pair', label: '2P Desk', hint: 'Lead + Content chat' },
  { format: 'trio', label: '3P Board', hint: 'Whiteboard brainstorm' },
  { format: 'all-hands', label: '4P Sync', hint: 'All-hands meeting' },
];

export function AssignmentsPanel({
  todayFocus,
  focusProgress,
  assignments,
  meetings,
  reviewQueue,
  selectedMeetingId,
  onSelectMeeting,
  isRunningAssignment,
  isConversationActive,
  onSaveTodayFocus,
  onAssignJob,
  onRunStrategistQueue,
  onTriggerConversation,
  onOpenArtifact,
  onOpenNeedsMe,
}: AssignmentsPanelProps) {
  const [prompt, setPrompt] = useState(SAMPLE_CLEANING_OUTREACH_PROMPT);
  const [includePromoPost, setIncludePromoPost] = useState(false);

  const botNameById = Object.fromEntries(
    BOTS.map((b) => [b.id, b.name])
  ) as Record<BotId, string>;

  const busy = isRunningAssignment || isConversationActive;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    await onAssignJob(prompt.trim(), { includePromoPost });
  }

  const activeMeeting =
    meetings.find((m) => m.id === selectedMeetingId) || meetings[0] || null;
  const activeMeetingStatus = activeMeeting
    ? getMeetingDisplayStatus(activeMeeting, reviewQueue)
    : null;
  const followUpOwnerId =
    activeMeeting?.followUpOwner ?? activeMeeting?.nextSteps[0]?.botId;
  const followUpTaskText =
    activeMeeting?.followUpTask ?? activeMeeting?.nextSteps[0]?.task;

  return (
    <div className="space-y-5">
      {/* Editable Today's Focus Card at the Top of Office & Jobs */}
      <TodayFocusCard
        focus={todayFocus}
        progress={focusProgress}
        isWorking={busy}
        onSaveFocus={onSaveTodayFocus}
        onOpenArtifact={onOpenArtifact}
      />

      {/* Live Office Conversations & Transcript Viewer */}
      <section
        aria-label="Office conversations and transcripts"
        className="rounded-md border border-[#2E3440] bg-[#191D24] p-3.5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6] flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#22D3EE]" aria-hidden="true" />
            Office Conversations ({meetings.length})
          </h3>
          <span className="font-mono text-[10px] text-[#8A92A0]">
            Auto-runs &amp; saves routine work
          </span>
        </div>

        {/* 4 Conversation Format Triggers for Instant Testing & Exploration */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {FORMAT_BUTTONS.map((btn) => (
            <button
              key={btn.format}
              type="button"
              disabled={busy}
              onClick={() => void onTriggerConversation(btn.format)}
              title={btn.hint}
              data-testid={`trigger-convo-${btn.format}`}
              className="rounded border border-[#323946] bg-[#16191F] px-2 py-1.5 text-left hover:border-[#22D3EE] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <span className="block text-[11px] font-semibold text-[#F4EFE6]">
                {btn.label}
              </span>
              <span className="block text-[10px] text-[#8A92A0] truncate">
                {btn.hint}
              </span>
            </button>
          ))}
        </div>

        {meetings.length > 1 && (
          <div>
            <label
              htmlFor="select-convo-transcript"
              className="sr-only"
            >
              Select recorded conversation
            </label>
            <select
              id="select-convo-transcript"
              value={activeMeeting?.id || ''}
              onChange={(e) => onSelectMeeting(e.target.value)}
              className="w-full rounded border border-[#343B48] bg-[#16191F] px-2.5 py-1.5 text-xs text-[#F4EFE6]"
            >
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  [{FORMAT_LABELS[m.format]}] {m.title} ({m.startedAt})
                </option>
              ))}
            </select>
          </div>
        )}

        {!activeMeeting ? (
          <p className="text-xs text-[#8A92A0]">
            Coworkers start workspace conversations on their own shortly after opening the office. Select any recorded discussion here to inspect the full transcript and saved outcome.
          </p>
        ) : (
          <div
            data-testid="conversation-inspector"
            data-meeting-id={activeMeeting.id}
            className="space-y-3 border-t border-[#2A303B] pt-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F4EFE6]">
                  {activeMeeting.title}
                </p>
                <p className="font-mono text-[10px] text-[#A4AAB5] mt-0.5">
                  {FORMAT_LABELS[activeMeeting.format]} ·{' '}
                  {VENUE_LABELS[activeMeeting.venue]} ·{' '}
                  {activeMeeting.source === 'autonomous' ? 'Autonomous' : 'Assigned'}
                </p>
                <p className="text-[11px] text-[#A4AAB5] mt-1">
                  <span className="text-[#777E8B]">Participants:</span>{' '}
                  {activeMeeting.attendees
                    .map((id) => botNameById[id] ?? id)
                    .join(', ')}
                </p>
                {followUpOwnerId && (
                  <p className="text-[11px] text-[#A4AAB5] mt-0.5">
                    <span className="text-[#777E8B]">Follow-up owner:</span>{' '}
                    <span className="text-[#F4EFE6] font-medium">
                      {botNameById[followUpOwnerId] ?? followUpOwnerId}
                    </span>
                    {followUpTaskText ? ` — ${followUpTaskText}` : ''}
                  </p>
                )}
              </div>
              <span
                data-testid="meeting-display-status"
                className={`font-mono text-[11px] shrink-0 ${
                  activeMeetingStatus === 'Live'
                    ? 'text-[#22D3EE]'
                    : activeMeetingStatus === 'Ready for review'
                      ? 'text-[#EAB365]'
                      : 'text-[#4ADE80]'
                }`}
              >
                {activeMeetingStatus}
              </span>
            </div>

            {activeMeeting.outcomeSummary && (
              <div className="rounded border border-[#274636] bg-[#14231B] px-2.5 py-2 text-xs text-[#A7F3D0]">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#4ADE80] block mb-0.5">
                  Saved Outcome ({activeMeetingStatus})
                </span>
                {activeMeeting.outcomeSummary}
              </div>
            )}

            {activeMeeting.decisions.length > 0 && (
              <div className="rounded border border-[#2A3B42] bg-[#142026] p-2.5 space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#22D3EE]">
                  What They Decided
                </p>
                <ul className="space-y-1 text-xs text-[#E4DFD5]">
                  {activeMeeting.decisions.map((d, idx) => (
                    <li key={idx}>• {d}</li>
                  ))}
                </ul>
              </div>
            )}

            {activeMeeting.linkedArtifacts &&
              activeMeeting.linkedArtifacts.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
                    Linked Saved Work
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeMeeting.linkedArtifacts.map((ref) => (
                      <button
                        key={`${ref.kind}-${ref.id}`}
                        type="button"
                        data-testid={`conversation-link-${ref.kind}-${ref.id}`}
                        onClick={() => onOpenArtifact(ref)}
                        className="inline-flex items-center gap-1 rounded border border-[#2A3C44] bg-[#16191F] px-2 py-1 text-[11px] text-[#22D3EE] hover:border-[#22D3EE] cursor-pointer"
                      >
                        <span>Open {ref.label}</span>
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Full Transcript */}
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0] flex items-center gap-1">
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                Full Transcript ({activeMeeting.turns.length})
              </p>
              <div className="space-y-1.5">
                {activeMeeting.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className="rounded border border-[#2A303B] bg-[#16191F] p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F4EFE6]">
                        {botNameById[turn.speaker] ?? turn.speaker}
                        <span className="ml-1.5 font-mono text-[10px] uppercase text-[#EAB365]">
                          {turn.roleTag}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-[#777E8B] tabular-nums">
                        {turn.timestamp}
                      </span>
                    </div>
                    <p className="text-[#C7C2B8] leading-relaxed">
                      {turn.fullText}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Manual Assignment Launcher */}
      <form
        onSubmit={handleSubmit}
        className="rounded-md border border-[#2E3440] bg-[#222730] p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F4EFE6]">
            Assign a Job to the Team
          </h3>
          <span className="font-mono text-[11px] text-[#EAB365]">
            Simulation · Live Choreography
          </span>
        </div>

        <div>
          <label
            htmlFor="assign-job-input"
            className="block text-xs font-medium text-[#A4AAB5] mb-1"
          >
            Task or Workflow Brief
          </label>
          <input
            id="assign-job-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Prepare a cleaning-business offer"
            className="w-full rounded border border-[#343B48] bg-[#16191F] px-3 py-2 text-sm text-[#F4EFE6] placeholder:text-[#656D7A] focus:border-[#22D3EE] focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-[#C7C2B8] cursor-pointer">
          <input
            type="checkbox"
            checked={includePromoPost}
            onChange={(e) => setIncludePromoPost(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#22D3EE]"
          />
          Include Content Creator promo post using agreed meeting positioning
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-[#8A92A0]">
            Coworkers meet, save intermediate work automatically, and pause only for final deliverables or high-impact actions.
          </p>
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-[#EAB365] px-3.5 py-2 text-xs font-semibold text-[#14171C] hover:bg-[#F3C37D] disabled:opacity-60 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {busy ? 'Office Working...' : 'Assign Job'}
          </button>
        </div>

        {/* One-Click Preset Jobs */}
        <div className="border-t border-[#2E3440] pt-3 space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#8A92A0]">
            Quick Missions
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {onRunStrategistQueue && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRunStrategistQueue()}
                className="flex items-center justify-between gap-2 rounded border border-[#22D3EE]/50 bg-[#15242B] px-3 py-2 text-left hover:border-[#22D3EE] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span className="text-xs font-medium text-[#F4EFE6] flex items-center gap-1.5">
                  <Users
                    className="w-3.5 h-3.5 text-[#22D3EE]"
                    aria-hidden="true"
                  />
                  Team Lead Desk Queue (Content + Tracker)
                </span>
                <span className="font-mono text-[10px] text-[#22D3EE] shrink-0">
                  Simultaneous Queue + Independent Desk
                </span>
              </button>
            )}
            {QUICK_ASSIGNMENTS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={busy}
                onClick={() => {
                  setPrompt(preset.prompt);
                  void onAssignJob(preset.prompt, { includePromoPost });
                }}
                className="flex items-center justify-between gap-2 rounded border border-[#323946] bg-[#191D24] px-3 py-2 text-left hover:border-[#22D3EE]/70 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span className="text-xs font-medium text-[#F4EFE6] flex items-center gap-1.5">
                  {preset.prompt.startsWith('Send') ? (
                    <Send
                      className="w-3.5 h-3.5 text-[#EAB365]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Sparkles
                      className="w-3.5 h-3.5 text-[#22D3EE]"
                      aria-hidden="true"
                    />
                  )}
                  {preset.label}
                </span>
                <span className="font-mono text-[10px] text-[#8A92A0] shrink-0">
                  {preset.tierHint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </form>

      {/* Active & Recent Assignments */}
      {assignments.length > 0 && (
        <section
          aria-label="Active and completed assignments"
          className="space-y-2.5 border-t border-[#2A303B] pt-4"
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[#F4EFE6]">
              Assigned Jobs ({assignments.length})
            </h3>
            <span className="text-xs text-[#8A92A0]">
              Workflow execution log
            </span>
          </div>

          <div className="space-y-3">
            {assignments.slice(0, 5).map((asgn) => (
              <div
                key={asgn.id}
                className="rounded-md border border-[#2E3440] bg-[#1C212A] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#F4EFE6]">
                      {asgn.title}
                    </p>
                    <p className="font-mono text-[11px] text-[#8A92A0] mt-0.5">
                      {TIER_LABEL[asgn.tier]} · {asgn.createdAt}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[11px] ${
                      asgn.status === 'awaiting-review' ||
                      asgn.status === 'awaiting-approval'
                        ? 'text-[#EAB365]'
                        : asgn.status === 'running' || asgn.status === 'revising'
                          ? 'text-[#22D3EE]'
                          : 'text-[#4ADE80]'
                    }`}
                  >
                    {asgn.status === 'awaiting-review'
                      ? 'Ready in Needs me'
                      : asgn.status === 'awaiting-approval'
                        ? 'Paused for Approval'
                        : asgn.status === 'running'
                          ? 'In Progress'
                          : asgn.status === 'revising'
                            ? 'Revising'
                            : 'Completed'}
                  </span>
                </div>

                <ul className="space-y-1.5 border-t border-[#2A303B] pt-2">
                  {asgn.steps.map((step) => (
                    <li
                      key={step.id}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {step.status === 'completed' ||
                        step.status === 'revised' ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[#4ADE80] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="w-3.5 h-3.5 text-[#EAB365] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <span className="text-[#F4EFE6] font-medium">
                            {botNameById[step.botId] ?? step.botId}
                          </span>
                          <span className="text-[#8A92A0] mx-1">·</span>
                          <span className="text-[#C7C2B8]">{step.label}</span>
                          {step.outputSummary && (
                            <p className="text-[11px] text-[#8A92A0] mt-0.5">
                              {step.outputSummary}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {(asgn.linkedArtifacts.length > 0 ||
                  asgn.status === 'awaiting-review' ||
                  asgn.status === 'awaiting-approval') && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2A303B] pt-2">
                    {asgn.linkedArtifacts.map((ref) => (
                      <button
                        key={`${ref.kind}-${ref.id}`}
                        type="button"
                        onClick={() => onOpenArtifact(ref)}
                        className="rounded border border-[#343B48] bg-[#16191F] px-2 py-1 text-[11px] text-[#C7C2B8] hover:border-[#22D3EE] hover:text-[#22D3EE] cursor-pointer"
                      >
                        {ref.label}
                      </button>
                    ))}
                    {(asgn.status === 'awaiting-review' ||
                      asgn.status === 'awaiting-approval') && (
                      <button
                        type="button"
                        onClick={onOpenNeedsMe}
                        className="rounded border border-[#EAB365]/60 bg-[#2C2418] px-2.5 py-1 text-[11px] font-medium text-[#EAB365] hover:bg-[#382E1D] cursor-pointer"
                      >
                        Review in Needs me →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
