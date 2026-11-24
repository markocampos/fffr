import type { BotBreakRecord, BotId } from '../types/workspace';

/**
 * Employees trigger a Kitchen Coffee Break once they have completed MORE than 3
 * consecutive tasks at their desk (i.e. >= 4 consecutive desk tasks).
 */
export const CONSECUTIVE_TASK_BREAK_THRESHOLD = 3;

/** Short, randomized Kitchen rest duration range in milliseconds. */
export const COFFEE_BREAK_MIN_MS = 8500;
export const COFFEE_BREAK_MAX_MS = 14500;

export const KITCHEN_BREAK_SPOTS = [
  'kitchen:espresso',
  'kitchen:counter',
  'kitchen:island',
] as const;

const ALL_BOT_IDS: BotId[] = [
  'lead-finder',
  'business-strategist',
  'project-tracker',
  'content-creator',
];

function createEmptyBreakRecord(): BotBreakRecord {
  return {
    consecutiveDeskTasks: 0,
    onBreak: false,
    totalBreaksTaken: 0,
  };
}

export function createInitialBotBreaks(): Record<BotId, BotBreakRecord> {
  return {
    'lead-finder': createEmptyBreakRecord(),
    'business-strategist': createEmptyBreakRecord(),
    'project-tracker': createEmptyBreakRecord(),
    'content-creator': createEmptyBreakRecord(),
  };
}

export function normalizeBotBreaks(
  raw?: Partial<Record<BotId, Partial<BotBreakRecord>>>
): Record<BotId, BotBreakRecord> {
  const base = createInitialBotBreaks();
  if (!raw) return base;
  for (const botId of ALL_BOT_IDS) {
    const rec = raw[botId];
    if (!rec) continue;
    base[botId] = {
      consecutiveDeskTasks:
        typeof rec.consecutiveDeskTasks === 'number' &&
        Number.isFinite(rec.consecutiveDeskTasks) &&
        rec.consecutiveDeskTasks >= 0
          ? Math.floor(rec.consecutiveDeskTasks)
          : 0,
      onBreak: Boolean(rec.onBreak),
      breakStartedAtMs:
        typeof rec.breakStartedAtMs === 'number' ? rec.breakStartedAtMs : undefined,
      breakEndsAtMs:
        typeof rec.breakEndsAtMs === 'number' ? rec.breakEndsAtMs : undefined,
      kitchenSpotId:
        typeof rec.kitchenSpotId === 'string' ? rec.kitchenSpotId : undefined,
      totalBreaksTaken:
        typeof rec.totalBreaksTaken === 'number' &&
        Number.isFinite(rec.totalBreaksTaken) &&
        rec.totalBreaksTaken >= 0
          ? Math.floor(rec.totalBreaksTaken)
          : 0,
    };
  }
  return base;
}

/**
 * Reconciles persisted break records on reload/hydrate:
 * - Preserves active, unexpired breaks and desk task streaks
 * - Clears expired breaks cleanly and resets their consecutive streak to 0
 */
export function reconcileBotBreaksOnHydrate(
  raw?: Partial<Record<BotId, Partial<BotBreakRecord>>>,
  nowMs = Date.now()
): Record<BotId, BotBreakRecord> {
  const normalized = normalizeBotBreaks(raw);
  const next = { ...normalized };
  for (const botId of ALL_BOT_IDS) {
    const rec = normalized[botId];
    if (rec.onBreak && (!rec.breakEndsAtMs || rec.breakEndsAtMs <= nowMs)) {
      next[botId] = {
        consecutiveDeskTasks: 0,
        onBreak: false,
        totalBreaksTaken: rec.totalBreaksTaken,
      };
    }
  }
  return next;
}

/**
 * Records a completed task at an employee's desk and returns updated break state
 * plus whether the employee has now crossed the > 3 consecutive desk tasks threshold.
 */
export function recordCompletedDeskTask(
  current: Record<BotId, BotBreakRecord> | undefined,
  botId: BotId
): {
  breaks: Record<BotId, BotBreakRecord>;
  consecutiveDeskTasks: number;
  shouldTakeBreak: boolean;
} {
  const normalized = normalizeBotBreaks(current);
  const prev = normalized[botId];
  const nextCount = prev.consecutiveDeskTasks + 1;
  const nextBreaks: Record<BotId, BotBreakRecord> = {
    ...normalized,
    [botId]: {
      ...prev,
      consecutiveDeskTasks: nextCount,
    },
  };
  return {
    breaks: nextBreaks,
    consecutiveDeskTasks: nextCount,
    shouldTakeBreak: !prev.onBreak && nextCount > CONSECUTIVE_TASK_BREAK_THRESHOLD,
  };
}

/** True strictly when an employee has completed MORE than 3 consecutive desk tasks and is not already on break. */
export function isBotDueForCoffeeBreak(
  current: Record<BotId, BotBreakRecord> | undefined,
  botId: BotId
): boolean {
  const rec = normalizeBotBreaks(current)[botId];
  return !rec.onBreak && rec.consecutiveDeskTasks > CONSECUTIVE_TASK_BREAK_THRESHOLD;
}

/** Computes a randomized Kitchen rest period within [COFFEE_BREAK_MIN_MS, COFFEE_BREAK_MAX_MS]. */
export function computeRandomizedBreakDurationMs(
  rng: () => number = Math.random
): number {
  const clamped = Math.max(0, Math.min(1, rng()));
  return Math.round(
    COFFEE_BREAK_MIN_MS + clamped * (COFFEE_BREAK_MAX_MS - COFFEE_BREAK_MIN_MS)
  );
}

/** Picks an unoccupied Kitchen spot so simultaneous coffee breaks never overlap in 3D space. */
export function pickAvailableKitchenSpot(
  current: Record<BotId, BotBreakRecord> | undefined,
  botId: BotId
): string {
  const normalized = normalizeBotBreaks(current);
  const occupied = new Set<string>();
  for (const id of ALL_BOT_IDS) {
    if (id === botId) continue;
    const rec = normalized[id];
    if (rec.onBreak && rec.kitchenSpotId) {
      occupied.add(rec.kitchenSpotId);
    }
  }
  const available = KITCHEN_BREAK_SPOTS.find((spot) => !occupied.has(spot));
  if (available) return available;
  const fallbackIdx = ALL_BOT_IDS.indexOf(botId) % KITCHEN_BREAK_SPOTS.length;
  return KITCHEN_BREAK_SPOTS[fallbackIdx];
}

/** Transitions an employee into a Kitchen Coffee Break with a randomized rest duration and distinct Kitchen spot. */
export function startCoffeeBreak(
  current: Record<BotId, BotBreakRecord> | undefined,
  botId: BotId,
  nowMs = Date.now(),
  rng: () => number = Math.random
): {
  breaks: Record<BotId, BotBreakRecord>;
  spotId: string;
  durationMs: number;
} {
  const normalized = normalizeBotBreaks(current);
  const prev = normalized[botId];
  const spotId = pickAvailableKitchenSpot(normalized, botId);
  const durationMs = computeRandomizedBreakDurationMs(rng);
  const nextBreaks: Record<BotId, BotBreakRecord> = {
    ...normalized,
    [botId]: {
      ...prev,
      onBreak: true,
      breakStartedAtMs: nowMs,
      breakEndsAtMs: nowMs + durationMs,
      kitchenSpotId: spotId,
      totalBreaksTaken: prev.totalBreaksTaken + 1,
    },
  };
  return {
    breaks: nextBreaks,
    spotId,
    durationMs,
  };
}

/** Ends an employee's Coffee Break and resets their consecutive desk task streak back to 0. */
export function finishCoffeeBreak(
  current: Record<BotId, BotBreakRecord> | undefined,
  botId: BotId
): Record<BotId, BotBreakRecord> {
  const normalized = normalizeBotBreaks(current);
  const prev = normalized[botId];
  return {
    ...normalized,
    [botId]: {
      consecutiveDeskTasks: 0,
      onBreak: false,
      totalBreaksTaken: prev.totalBreaksTaken,
    },
  };
}
