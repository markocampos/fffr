import { ArrowUpRight, Coffee, MessageSquare } from 'lucide-react';
import type {
  ActivityEvent,
  BotActivityState,
  BotBreakRecord,
  BotId,
  BotLivePresence,
  LinkedArtifactRef,
} from '../types/workspace';
import { BOTS, BOT_ACTIVITY_LABELS } from '../state/seedDemo';
import { ROOM_PRESETS } from '../scene/officeLayout';
import { CONSECUTIVE_TASK_BREAK_THRESHOLD } from '../workflows/coffeeBreak';

interface CompactBotListProps {
  selectedBotId: BotId | null;
  botPresence: Record<BotId, BotLivePresence>;
  botBreaks?: Record<BotId, BotBreakRecord>;
  onSelectBot: (botId: BotId) => void;
}

const ACTIVITY_COLOR_CLASS: Record<BotActivityState, string> = {
  'at-desk': 'text-[#A4AAB5]',
  walking: 'text-[#22D3EE]',
  discussing: 'text-[#22D3EE]',
  working: 'text-[#4ADE80]',
  'checking-notes': 'text-[#22D3EE]',
  lounging: 'text-[#C7B398]',
  'on-break': 'text-[#F59E0B]',
  waiting: 'text-[#EAB365]',
};

export function CompactBotList({
  selectedBotId,
  botPresence,
  botBreaks,
  onSelectBot,
}: CompactBotListProps) {
  return (
    <nav
      aria-label="Coworker desks navigation"
      className="grid grid-cols-2 lg:grid-cols-4 gap-2"
    >
      {BOTS.map((bot) => {
        const presence = botPresence[bot.id];
        const isSelected = selectedBotId === bot.id;
        const roomLabel = ROOM_PRESETS[presence.room]?.shortLabel ?? 'Work Area';
        const breakRec = botBreaks?.[bot.id];
        const taskStreak = breakRec?.consecutiveDeskTasks ?? 0;
        const isOnBreak =
          presence.activity === 'on-break' || Boolean(breakRec?.onBreak);
        const statusText =
          presence.activity === 'on-break'
            ? BOT_ACTIVITY_LABELS['on-break']
            : presence.taskLabel || BOT_ACTIVITY_LABELS[presence.activity];
        return (
          <button
            key={bot.id}
            type="button"
            onClick={() => onSelectBot(bot.id)}
            aria-current={isSelected ? 'page' : undefined}
            data-consecutive-tasks={String(taskStreak)}
            data-on-break={isOnBreak ? 'true' : 'false'}
            className={`rounded-md border p-2.5 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
              isSelected
                ? 'border-[#22D3EE] bg-[#1E272E]'
                : isOnBreak
                  ? 'border-[#C27803]/80 bg-[#231D15] hover:border-[#F59E0B]'
                  : 'border-[#2E3440] bg-[#1B1F26] hover:border-[#424B5C]'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-semibold text-[#F4EFE6] truncate">
                {bot.name}
              </span>
              <span className="font-mono text-[10px] text-[#777E8B] shrink-0">
                {bot.deskLabel}
                {!isOnBreak && taskStreak > 0
                  ? ` · ${taskStreak}/${CONSECUTIVE_TASK_BREAK_THRESHOLD + 1}`
                  : ''}
              </span>
            </div>
            <p className="text-[11px] text-[#A4AAB5] truncate mt-0.5">
              {roomLabel}
              {presence.activeArtifact
                ? ` · ${presence.activeArtifact.label}`
                : ''}
            </p>
            <p
              data-testid={`bot-card-status-${bot.id}`}
              className={`font-mono text-[11px] mt-1 truncate flex items-center gap-1 ${
                presence.activity === 'on-break'
                  ? ACTIVITY_COLOR_CLASS['on-break']
                  : presence.taskLabel && presence.activity === 'at-desk'
                    ? 'text-[#22D3EE]'
                    : ACTIVITY_COLOR_CLASS[presence.activity]
              }`}
            >
              {isOnBreak && (
                <Coffee className="w-3 h-3 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              )}
              <span className="truncate">{statusText}</span>
            </p>
          </button>
        );
      })}
    </nav>
  );
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  onOpenArtifact?: (ref: LinkedArtifactRef) => void;
  onOpenConversation?: (meetingId: string) => void;
}

export function ActivityFeed({
  events,
  onOpenArtifact,
  onOpenConversation,
}: ActivityFeedProps) {
  const botNameById = Object.fromEntries(
    BOTS.map((b) => [b.id, b.name])
  ) as Record<BotId, string>;

  return (
    <section aria-label="Recent workspace activity" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#A4AAB5]">
          Recent Activity ({events.length})
        </h2>
        <span className="text-[11px] text-[#777E8B]">
          Auto-saved work links directly to records
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-[#777E8B]">No recent actions recorded yet.</p>
      ) : (
        <ul className="divide-y divide-[#262B35] rounded-md border border-[#2E3440] bg-[#181B21]">
          {events.slice(0, 14).map((evt) => (
            <li
              key={evt.id}
              className="px-3 py-2 flex items-start justify-between gap-3 text-xs"
            >
              <div className="min-w-0">
                <p className="text-[#F4EFE6] font-medium">
                  {botNameById[evt.botId] ?? evt.botId}
                  <span className="mx-1.5 text-[#525A68]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#EAB365]">{evt.action}</span>
                  {evt.isDemo && (
                    <span className="ml-1.5 font-mono text-[10px] text-[#777E8B]">
                      (Demo)
                    </span>
                  )}
                </p>
                <p className="text-[#A4AAB5] text-[11px] mt-0.5 break-words">
                  {evt.detail}
                </p>
                {((evt.meetingId && onOpenConversation) ||
                  (evt.artifactRef && onOpenArtifact)) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {evt.meetingId && onOpenConversation && (
                      <button
                        type="button"
                        data-testid={`activity-open-convo-${evt.meetingId}`}
                        onClick={() => onOpenConversation(evt.meetingId!)}
                        className="inline-flex items-center gap-1 rounded border border-[#343B48] bg-[#16191F] px-2 py-0.5 text-[11px] text-[#E4DFD5] hover:border-[#22D3EE] hover:text-[#22D3EE] cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" aria-hidden="true" />
                        <span>View conversation</span>
                      </button>
                    )}
                    {evt.artifactRef && onOpenArtifact && (
                      <button
                        type="button"
                        onClick={() => onOpenArtifact(evt.artifactRef!)}
                        className="inline-flex items-center gap-1 rounded border border-[#2A3C44] bg-[#142026] px-2 py-0.5 text-[11px] text-[#22D3EE] hover:border-[#22D3EE] cursor-pointer"
                      >
                        <span>Open {evt.artifactRef.label}</span>
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <span className="font-mono text-[10px] text-[#777E8B] tabular-nums shrink-0 pt-0.5">
                {evt.timestamp}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
