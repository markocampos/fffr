import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COFFEE_BREAK_MAX_MS,
  COFFEE_BREAK_MIN_MS,
  CONSECUTIVE_TASK_BREAK_THRESHOLD,
  KITCHEN_BREAK_SPOTS,
  computeRandomizedBreakDurationMs,
  createInitialBotBreaks,
  finishCoffeeBreak,
  isBotDueForCoffeeBreak,
  reconcileBotBreaksOnHydrate,
  recordCompletedDeskTask,
  startCoffeeBreak,
} from './coffeeBreak';
import { BOT_ACTIVITY_LABELS } from '../state/seedDemo';
import { findNavigationPath, getDeskNodeId } from '../scene/navigation';
import type { BotId } from '../types/workspace';

test('Coffee Break triggers strictly after MORE than 3 consecutive desk tasks (tasks 1-3 false, task 4 true)', () => {
  let breaks = createInitialBotBreaks();
  assert.equal(CONSECUTIVE_TASK_BREAK_THRESHOLD, 3);

  for (let i = 1; i <= 3; i += 1) {
    const res = recordCompletedDeskTask(breaks, 'lead-finder');
    breaks = res.breaks;
    assert.equal(res.consecutiveDeskTasks, i);
    assert.equal(res.shouldTakeBreak, false);
    assert.equal(isBotDueForCoffeeBreak(breaks, 'lead-finder'), false);
  }

  const fourth = recordCompletedDeskTask(breaks, 'lead-finder');
  assert.equal(fourth.consecutiveDeskTasks, 4);
  assert.equal(fourth.shouldTakeBreak, true);
  assert.equal(isBotDueForCoffeeBreak(fourth.breaks, 'lead-finder'), true);
});

test('Randomized break duration stays within bounds, varies by RNG, and exposes On break status label', () => {
  const minDur = computeRandomizedBreakDurationMs(() => 0);
  const midDur = computeRandomizedBreakDurationMs(() => 0.5);
  const maxDur = computeRandomizedBreakDurationMs(() => 1);

  assert.equal(minDur, COFFEE_BREAK_MIN_MS);
  assert.equal(maxDur, COFFEE_BREAK_MAX_MS);
  assert.ok(midDur > minDur && midDur < maxDur);
  assert.equal(BOT_ACTIVITY_LABELS['on-break'], 'On break');
});

test('Simultaneous coffee breaks assign distinct unoccupied Kitchen spots and finishCoffeeBreak resets streak to 0', () => {
  let breaks = createInitialBotBreaks();
  for (let i = 0; i < 4; i += 1) {
    breaks = recordCompletedDeskTask(breaks, 'lead-finder').breaks;
    breaks = recordCompletedDeskTask(breaks, 'project-tracker').breaks;
  }

  const first = startCoffeeBreak(breaks, 'lead-finder', 10_000, () => 0.25);
  breaks = first.breaks;
  const second = startCoffeeBreak(breaks, 'project-tracker', 10_500, () => 0.75);
  breaks = second.breaks;

  assert.notEqual(first.spotId, second.spotId);
  assert.ok(KITCHEN_BREAK_SPOTS.includes(first.spotId as (typeof KITCHEN_BREAK_SPOTS)[number]));
  assert.ok(KITCHEN_BREAK_SPOTS.includes(second.spotId as (typeof KITCHEN_BREAK_SPOTS)[number]));
  assert.equal(breaks['lead-finder'].onBreak, true);
  assert.equal(breaks['project-tracker'].onBreak, true);

  const afterFinish = finishCoffeeBreak(breaks, 'lead-finder');
  assert.equal(afterFinish['lead-finder'].onBreak, false);
  assert.equal(afterFinish['lead-finder'].consecutiveDeskTasks, 0);
  assert.equal(afterFinish['lead-finder'].totalBreaksTaken, 1);
  assert.equal(afterFinish['project-tracker'].onBreak, true);
});

test('Hydration reconciliation clears expired breaks while preserving active breaks and streaks', () => {
  let breaks = createInitialBotBreaks();
  for (let i = 0; i < 4; i += 1) {
    breaks = recordCompletedDeskTask(breaks, 'lead-finder').breaks;
    breaks = recordCompletedDeskTask(breaks, 'content-creator').breaks;
  }
  breaks = recordCompletedDeskTask(breaks, 'project-tracker').breaks;
  breaks = recordCompletedDeskTask(breaks, 'project-tracker').breaks;

  breaks = startCoffeeBreak(breaks, 'lead-finder', 1_000, () => 0).breaks; // ends at 9,500
  breaks = startCoffeeBreak(breaks, 'content-creator', 20_000, () => 1).breaks; // ends at 34,500

  const reconciled = reconcileBotBreaksOnHydrate(breaks, 25_000);
  assert.equal(reconciled['lead-finder'].onBreak, false);
  assert.equal(reconciled['lead-finder'].consecutiveDeskTasks, 0);
  assert.equal(reconciled['content-creator'].onBreak, true);
  assert.equal(reconciled['project-tracker'].consecutiveDeskTasks, 2);
});

test('Navigation graph routes every employee desk cleanly to every Kitchen coffee spot and back', () => {
  const bots: BotId[] = [
    'lead-finder',
    'business-strategist',
    'project-tracker',
    'content-creator',
  ];
  for (const botId of bots) {
    const desk = getDeskNodeId(botId);
    for (const spot of KITCHEN_BREAK_SPOTS) {
      const toKitchen = findNavigationPath(desk, spot);
      assert.ok(toKitchen.length >= 3, `Expected valid multi-hop path from ${desk} to ${spot}`);
      assert.equal(toKitchen[0].id, desk);
      assert.equal(toKitchen[toKitchen.length - 1].id, spot);
      assert.equal(toKitchen[toKitchen.length - 1].room, 'kitchen');

      const backToDesk = findNavigationPath(spot, desk);
      assert.ok(backToDesk.length >= 3, `Expected valid return path from ${spot} to ${desk}`);
      assert.equal(backToDesk[0].id, spot);
      assert.equal(backToDesk[backToDesk.length - 1].id, desk);
    }
  }
});
