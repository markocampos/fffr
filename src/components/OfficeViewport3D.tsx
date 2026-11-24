import { useEffect, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';
import type {
  BotActivityState,
  BotId,
  BotJobStatus,
  BotLivePresence,
  RoomId,
} from '../types/workspace';
import { BOTS, BOT_ACTIVITY_LABELS } from '../state/seedDemo';
import { ROOM_ORDER, ROOM_PRESETS } from '../scene/officeLayout';
import {
  mountOfficeScene,
  type OfficeSceneController,
  type SceneProjectionSnapshot,
} from '../scene/buildOfficeScene';

interface OfficeViewport3DProps {
  selectedBotId: BotId;
  botStatuses: Record<BotId, BotJobStatus>;
  botPresence: Record<BotId, BotLivePresence>;
  whiteboardLines: string[];
  isMeetingActive: boolean;
  focusedRoom?: RoomId;
  onRoomFocused?: (roomId: RoomId) => void;
  onSelectBot: (botId: BotId) => void;
  onBotArrived?: (botId: BotId, nodeId: string) => void;
  onOpenConversation?: (meetingId: string) => void;
}

const ACTIVITY_TEXT_CLASS: Record<BotActivityState, string> = {
  'at-desk': 'text-[#5A554C]',
  walking: 'text-[#0E7490]',
  discussing: 'text-[#0E7490]',
  working: 'text-[#166534]',
  'checking-notes': 'text-[#0E7490]',
  lounging: 'text-[#6B5B45]',
  'on-break': 'text-[#92400E]',
  waiting: 'text-[#B45309]',
};

export function OfficeViewport3D({
  selectedBotId,
  botStatuses,
  botPresence,
  whiteboardLines,
  isMeetingActive,
  focusedRoom,
  onRoomFocused,
  onSelectBot,
  onBotArrived,
  onOpenConversation,
}: OfficeViewport3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeSceneController | null>(null);
  const onSelectBotRef = useRef(onSelectBot);
  onSelectBotRef.current = onSelectBot;
  const onBotArrivedRef = useRef(onBotArrived);
  onBotArrivedRef.current = onBotArrived;

  const [webglFailed, setWebglFailed] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomId>(focusedRoom ?? 'overview');
  const [followSelected, setFollowSelected] = useState(false);
  const [projections, setProjections] = useState<SceneProjectionSnapshot>({
    bots: [],
    rooms: [],
  });

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    try {
      const controller = mountOfficeScene(mountEl, {
        onSelectBot: (botId) => onSelectBotRef.current(botId),
        onProjectionsUpdated: (next) => setProjections(next),
        onBotArrived: (botId, nodeId) => onBotArrivedRef.current?.(botId, nodeId),
        onUserCameraMove: () => {
          setFollowSelected(false);
        },
        onContextLost: () => setWebglFailed(true),
      });
      controllerRef.current = controller;
      controller.setSelectedBot(selectedBotId);
      controller.setBotStatuses(botStatuses);
      controller.setBotPresence(botPresence);
      controller.setWhiteboardContent(whiteboardLines, isMeetingActive);

      return () => {
        controller.dispose();
        controllerRef.current = null;
      };
    } catch {
      setWebglFailed(true);
    }
    // Mount WebGLRenderer once; sync mutable state via dedicated effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.setSelectedBot(selectedBotId);
    if (followSelected) {
      controllerRef.current?.setFollowBot(selectedBotId);
    }
  }, [selectedBotId, followSelected]);

  useEffect(() => {
    controllerRef.current?.setBotStatuses(botStatuses);
  }, [botStatuses]);

  useEffect(() => {
    controllerRef.current?.setBotPresence(botPresence);
  }, [botPresence]);

  useEffect(() => {
    controllerRef.current?.setWhiteboardContent(
      whiteboardLines,
      isMeetingActive
    );
  }, [whiteboardLines, isMeetingActive]);

  useEffect(() => {
    if (!focusedRoom) return;
    setActiveRoom(focusedRoom);
    setFollowSelected(false);
    controllerRef.current?.focusRoom(focusedRoom);
  }, [focusedRoom]);

  function handleFocusRoom(roomId: RoomId) {
    setActiveRoom(roomId);
    setFollowSelected(false);
    controllerRef.current?.focusRoom(roomId);
    onRoomFocused?.(roomId);
  }

  function handleToggleFollow() {
    const next = !followSelected;
    setFollowSelected(next);
    if (next) {
      controllerRef.current?.setFollowBot(selectedBotId);
    } else {
      controllerRef.current?.focusRoom(activeRoom);
    }
  }

  const selectedBotMeta = BOTS.find((b) => b.id === selectedBotId) ?? BOTS[0];

  return (
    <div
      data-testid="office-3d-viewport"
      data-meeting-active={isMeetingActive ? 'true' : 'false'}
      data-active-room={activeRoom}
      className="relative w-full h-full min-h-[300px] lg:min-h-[480px] bg-[#14171C] overflow-hidden select-none"
    >
      {/* Dedicated Empty WebGL Mount */}
      {!webglFailed && (
        <div
          ref={canvasMountRef}
          className="absolute inset-0 w-full h-full"
          aria-label="Interactive 3D isometric Rhymvex studio with connected rooms and human coworkers"
        />
      )}

      {/* Non-WebGL Fallback Grid */}
      {webglFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#181C22]">
          <p className="text-xs text-[#A4AAB5] mb-4">
            3D preview unavailable on this device — select a coworker below.
          </p>
          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            {BOTS.map((bot) => {
              const p = botPresence[bot.id];
              const isSelected = selectedBotId === bot.id;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => onSelectBot(bot.id)}
                  className={`rounded-md p-3.5 text-left border transition-colors ${
                    isSelected
                      ? 'bg-[#222730] border-[#22D3EE]'
                      : 'bg-[#1C2027] border-[#2E3440] hover:border-[#4B5563]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[#F4EFE6]">
                    {bot.name}
                  </p>
                  <p className="text-xs text-[#A4AAB5] mt-0.5">
                    {ROOM_PRESETS[p.room]?.shortLabel}
                  </p>
                  <p className="text-xs font-mono text-[#EAB365] mt-1.5">
                    {BOT_ACTIVITY_LABELS[p.activity]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtle Architectural Room Floor Labels (only on md+ so mobile stays uncluttered) */}
      {!webglFailed && (
        <div className="pointer-events-none hidden md:block absolute inset-0 z-10 overflow-hidden">
          {projections.rooms.map((rm) => {
            if (rm.xPct < 5 || rm.xPct > 95 || rm.yPct < 6 || rm.yPct > 86) {
              return null;
            }
            return (
              <span
                key={rm.roomId}
                style={{ left: `${rm.xPct}%`, top: `${rm.yPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-[#14171C]/80 border border-[#2E3440]/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap"
              >
                {rm.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Projected Live Bot Labels & Contextual Speech Bubbles (zero backdrop-blur over WebGL) */}
      {!webglFailed && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {projections.bots.map((proj) => {
            const bot = BOTS.find((b) => b.id === proj.botId);
            if (!bot) return null;
            const presence = botPresence[bot.id];
            const isSelected = selectedBotId === bot.id;

            // Hide markers scrolled completely off-canvas when zoomed into another room
            if (
              proj.xPct < -5 ||
              proj.xPct > 105 ||
              proj.yPct < -5 ||
              proj.yPct > 105
            ) {
              return null;
            }

            const clampedLeft = Math.min(89, Math.max(11, proj.xPct));
            const clampedTop = Math.min(84, Math.max(14, proj.yPct));
            const zLayer = presence.speech
              ? 'z-30'
              : isSelected
                ? 'z-20'
                : 'z-10';
            const displayActivity: BotActivityState =
              presence.activity === 'walking' && !proj.isPhysicallyWalking
                ? presence.queuePosition
                  ? 'waiting'
                  : presence.targetNodeId.startsWith('kitchen:')
                    ? 'on-break'
                    : presence.speech
                      ? 'discussing'
                      : presence.posture === 'seated'
                        ? 'at-desk'
                        : 'checking-notes'
                : presence.activity;

            const microLabel = presence.queuePosition
              ? `Waiting #${presence.queuePosition}`
              : displayActivity === 'on-break'
                ? BOT_ACTIVITY_LABELS['on-break']
                : presence.taskLabel ||
                  (displayActivity === 'discussing'
                    ? presence.speech
                      ? BOT_ACTIVITY_LABELS[displayActivity]
                      : undefined
                    : displayActivity !== 'at-desk'
                      ? BOT_ACTIVITY_LABELS[displayActivity]
                      : undefined);

            return (
              <div
                key={bot.id}
                style={{ left: `${clampedLeft}%`, top: `${clampedTop}%` }}
                className={`absolute -translate-x-1/2 -translate-y-full flex flex-col items-center gap-1 ${zLayer}`}
              >
                {/* Clickable Short Single-Speaker Speech Bubble — opens linked conversation */}
                {presence.speech && (
                  <button
                    type="button"
                    data-testid={`speech-bubble-${bot.id}`}
                    onClick={() => {
                      if (presence.activeMeetingId && onOpenConversation) {
                        onOpenConversation(presence.activeMeetingId);
                      } else {
                        onSelectBot(bot.id);
                      }
                    }}
                    aria-label={
                      presence.activeMeetingId
                        ? `Open conversation with ${bot.name}: ${presence.speech}`
                        : `Inspect ${bot.name}: ${presence.speech}`
                    }
                    className="pointer-events-auto cursor-pointer text-left max-w-[165px] sm:max-w-[220px] rounded-md border border-[#22D3EE]/85 bg-[#151B22] hover:bg-[#1A242E] hover:border-[#5CE1F5] px-2 py-1 text-[10px] sm:text-[11px] leading-snug text-[#F4EFE6] shadow-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
                  >
                    <span className="font-semibold text-[#22D3EE] mr-1">
                      {bot.shortTag}:
                    </span>
                    {presence.speech}
                    {presence.activeMeetingId && (
                      <span
                        className="ml-1 font-mono text-[9px] text-[#22D3EE]/85"
                        aria-hidden="true"
                      >
                        ↗
                      </span>
                    )}
                  </button>
                )}

                {/* Compact Name + Live Task Progress Tag — readable from overview on desktop & mobile */}
                <button
                  type="button"
                  data-testid={`bot-tag-${bot.id}`}
                  data-bot-activity={displayActivity}
                  data-bot-node={presence.targetNodeId}
                  data-bot-queue={presence.queuePosition ? String(presence.queuePosition) : ''}
                  onClick={() => onSelectBot(bot.id)}
                  aria-pressed={isSelected}
                  aria-label={`${bot.name} — ${microLabel || BOT_ACTIVITY_LABELS[displayActivity]} in ${ROOM_PRESETS[presence.room]?.shortLabel}`}
                  className={`pointer-events-auto rounded px-1 py-0.5 sm:px-1.5 text-left transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
                    isSelected
                      ? 'bg-[#F4EFE6] border border-[#22D3EE] shadow-md'
                      : displayActivity === 'on-break'
                        ? 'bg-[#FBF3E4] border border-[#C27803] shadow-md'
                        : presence.queuePosition || displayActivity === 'waiting'
                          ? 'bg-[#FEF3C7] border border-[#D97706] shadow-md'
                          : displayActivity === 'working'
                            ? 'bg-[#F4EFE6] border border-[#EAB365] shadow-md'
                            : 'bg-[#F4EFE6]/92 border border-[#C9BFA9]/90 hover:scale-[1.03] shadow'
                  }`}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[9px] sm:text-[10px] font-semibold text-[#14171C]">
                      {bot.shortTag}
                    </span>
                    {microLabel && (
                      <>
                        <span
                          className={`${
                            presence.queuePosition || displayActivity !== 'at-desk'
                              ? 'inline'
                              : 'hidden sm:inline'
                          } text-[#9E9689] text-[8px] sm:text-[9px]`}
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span
                          className={`${
                            presence.queuePosition || displayActivity !== 'at-desk'
                              ? 'inline-block'
                              : 'hidden sm:inline-block'
                          } font-mono text-[8px] sm:text-[9px] font-semibold max-w-[68px] sm:max-w-[175px] truncate ${
                            presence.taskLabel && displayActivity === 'at-desk'
                              ? 'text-[#0E7490]'
                              : ACTIVITY_TEXT_CLASS[displayActivity]
                          }`}
                        >
                          {microLabel}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Compact Bottom Camera Control Dock (Overview, Room Focus, Follow Bot, Zoom) */}
      {!webglFailed && (
        <div
          aria-label="Office camera controls"
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 w-fit max-w-[98%] flex items-center gap-0.5 sm:gap-1 rounded-md border border-[#2E3440] bg-[#14171C]/95 px-1 sm:px-1.5 py-1 shadow-lg overflow-x-auto"
        >
          {ROOM_ORDER.map((roomId) => {
            const preset = ROOM_PRESETS[roomId];
            const isCurrent = !followSelected && activeRoom === roomId;
            const dockLabel =
              roomId === 'open-work'
                ? 'Work'
                : roomId === 'meeting-room'
                  ? 'Meeting'
                  : roomId === 'content-studio'
                    ? 'Studio'
                    : preset.shortLabel;
            const mobileLabel =
              roomId === 'reception'
                ? 'Entry'
                : roomId === 'overview'
                  ? 'All'
                  : dockLabel;
            return (
              <button
                key={roomId}
                type="button"
                onClick={() => handleFocusRoom(roomId)}
                aria-pressed={isCurrent}
                aria-label={`Focus ${preset.shortLabel}`}
                className={`shrink-0 rounded px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-[#172C33] text-[#22D3EE] border border-[#22D3EE]/70'
                    : 'text-[#C7C2B8] hover:text-[#F4EFE6] border border-transparent hover:border-[#343B48]'
                }`}
              >
                <span className="sm:hidden">{mobileLabel}</span>
                <span className="hidden sm:inline">{dockLabel}</span>
              </button>
            );
          })}

          <span className="h-3.5 w-px bg-[#2E3440] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={handleToggleFollow}
            aria-pressed={followSelected}
            title={`Follow ${selectedBotMeta.name}`}
            className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              followSelected
                ? 'bg-[#172C33] text-[#22D3EE] border border-[#22D3EE]/70'
                : 'text-[#EAB365] hover:text-[#F4EFE6] border border-transparent hover:border-[#343B48]'
            }`}
          >
            <Crosshair className="w-3 h-3" aria-hidden="true" />
            <span>Follow</span>
          </button>

          <span className="hidden sm:block h-3.5 w-px bg-[#2E3440] mx-0.5 shrink-0" aria-hidden="true" />

          <div className="hidden sm:flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => controllerRef.current?.zoomBy(1.22)}
              aria-label="Zoom in office camera"
              className="rounded p-1 text-[#A4AAB5] hover:text-[#F4EFE6] hover:bg-[#222730] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => controllerRef.current?.zoomBy(0.82)}
              aria-label="Zoom out office camera"
              className="rounded p-1 text-[#A4AAB5] hover:text-[#F4EFE6] hover:bg-[#222730] cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFocusRoom('overview')}
              aria-label="Reset camera to office overview"
              className="rounded p-1 text-[#A4AAB5] hover:text-[#F4EFE6] hover:bg-[#222730] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
