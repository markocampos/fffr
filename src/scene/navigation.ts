import type { BotId, RoomId } from '../types/workspace';
import {
  BOT_DESK_SEAT_POSE,
  CONTENT_STUDIO_SPOT,
  DESK_VISITOR_SPOTS,
  DESK_WAITING_SPOTS,
  KITCHEN_SPOTS,
  LOUNGE_HUDDLE_SPOTS,
  MEETING_SPOTS,
  RECEPTION_SPOT,
  WHITEBOARD_HUDDLE_SPOTS,
  type Vec2,
} from './officeLayout';

export interface NavNode {
  id: string;
  x: number;
  z: number;
  room: Exclude<RoomId, 'overview'>;
  facing?: number;
  posture?: 'seated' | 'standing';
  neighbors: string[];
}

/**
 * Navigable corridor, doorway, desk-side, waiting-spot, lounge, and whiteboard waypoint graph for the 20m × 15m studio.
 * Every edge stays strictly inside open aisles and framed doorways so coworkers never clip walls or desks.
 */
export const NAV_NODES: Record<string, NavNode> = {
  // Open Work Area Desk Seats
  'desk:lead-finder': {
    id: 'desk:lead-finder',
    x: BOT_DESK_SEAT_POSE['lead-finder'].x,
    z: BOT_DESK_SEAT_POSE['lead-finder'].z,
    room: 'open-work',
    facing: BOT_DESK_SEAT_POSE['lead-finder'].facing,
    posture: 'seated',
    neighbors: ['visit:lead-finder', 'aisle:nw'],
  },
  'desk:business-strategist': {
    id: 'desk:business-strategist',
    x: BOT_DESK_SEAT_POSE['business-strategist'].x,
    z: BOT_DESK_SEAT_POSE['business-strategist'].z,
    room: 'open-work',
    facing: BOT_DESK_SEAT_POSE['business-strategist'].facing,
    posture: 'seated',
    neighbors: ['visit:business-strategist', 'aisle:ne'],
  },
  'desk:project-tracker': {
    id: 'desk:project-tracker',
    x: BOT_DESK_SEAT_POSE['project-tracker'].x,
    z: BOT_DESK_SEAT_POSE['project-tracker'].z,
    room: 'open-work',
    facing: BOT_DESK_SEAT_POSE['project-tracker'].facing,
    posture: 'seated',
    neighbors: ['visit:project-tracker', 'aisle:sw'],
  },
  'desk:content-creator': {
    id: 'desk:content-creator',
    x: BOT_DESK_SEAT_POSE['content-creator'].x,
    z: BOT_DESK_SEAT_POSE['content-creator'].z,
    room: 'open-work',
    facing: BOT_DESK_SEAT_POSE['content-creator'].facing,
    posture: 'seated',
    neighbors: ['visit:content-creator', 'aisle:se'],
  },

  // Desk-side standing visitor spots for 2-person desk conversations
  'visit:lead-finder': {
    id: 'visit:lead-finder',
    x: DESK_VISITOR_SPOTS['lead-finder'].x,
    z: DESK_VISITOR_SPOTS['lead-finder'].z,
    room: 'open-work',
    facing: DESK_VISITOR_SPOTS['lead-finder'].facing,
    posture: 'standing',
    neighbors: ['desk:lead-finder', 'aisle:nw', 'wait:lead-finder:1', 'wait:lead-finder:2'],
  },
  'visit:business-strategist': {
    id: 'visit:business-strategist',
    x: DESK_VISITOR_SPOTS['business-strategist'].x,
    z: DESK_VISITOR_SPOTS['business-strategist'].z,
    room: 'open-work',
    facing: DESK_VISITOR_SPOTS['business-strategist'].facing,
    posture: 'standing',
    neighbors: [
      'desk:business-strategist',
      'aisle:ne',
      'wait:business-strategist:1',
      'wait:business-strategist:2',
    ],
  },
  'visit:project-tracker': {
    id: 'visit:project-tracker',
    x: DESK_VISITOR_SPOTS['project-tracker'].x,
    z: DESK_VISITOR_SPOTS['project-tracker'].z,
    room: 'open-work',
    facing: DESK_VISITOR_SPOTS['project-tracker'].facing,
    posture: 'standing',
    neighbors: [
      'desk:project-tracker',
      'aisle:sw',
      'wait:project-tracker:1',
      'wait:project-tracker:2',
    ],
  },
  'visit:content-creator': {
    id: 'visit:content-creator',
    x: DESK_VISITOR_SPOTS['content-creator'].x,
    z: DESK_VISITOR_SPOTS['content-creator'].z,
    room: 'open-work',
    facing: DESK_VISITOR_SPOTS['content-creator'].facing,
    posture: 'standing',
    neighbors: [
      'desk:content-creator',
      'aisle:se',
      'wait:content-creator:1',
      'wait:content-creator:2',
    ],
  },

  // Reachable Queue Waiting Spots per Desk (zero body overlap with visitor spots)
  'wait:business-strategist:1': {
    id: 'wait:business-strategist:1',
    x: DESK_WAITING_SPOTS['business-strategist'][0].x,
    z: DESK_WAITING_SPOTS['business-strategist'][0].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['business-strategist'][0].facing,
    posture: 'standing',
    neighbors: ['visit:business-strategist', 'corridor:north', 'aisle:ne'],
  },
  'wait:business-strategist:2': {
    id: 'wait:business-strategist:2',
    x: DESK_WAITING_SPOTS['business-strategist'][1].x,
    z: DESK_WAITING_SPOTS['business-strategist'][1].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['business-strategist'][1].facing,
    posture: 'standing',
    neighbors: ['visit:business-strategist', 'aisle:ne'],
  },
  'wait:lead-finder:1': {
    id: 'wait:lead-finder:1',
    x: DESK_WAITING_SPOTS['lead-finder'][0].x,
    z: DESK_WAITING_SPOTS['lead-finder'][0].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['lead-finder'][0].facing,
    posture: 'standing',
    neighbors: ['visit:lead-finder', 'aisle:nw', 'aisle:mid'],
  },
  'wait:lead-finder:2': {
    id: 'wait:lead-finder:2',
    x: DESK_WAITING_SPOTS['lead-finder'][1].x,
    z: DESK_WAITING_SPOTS['lead-finder'][1].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['lead-finder'][1].facing,
    posture: 'standing',
    neighbors: ['visit:lead-finder', 'aisle:nw'],
  },
  'wait:project-tracker:1': {
    id: 'wait:project-tracker:1',
    x: DESK_WAITING_SPOTS['project-tracker'][0].x,
    z: DESK_WAITING_SPOTS['project-tracker'][0].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['project-tracker'][0].facing,
    posture: 'standing',
    neighbors: ['visit:project-tracker', 'aisle:sw', 'aisle:mid'],
  },
  'wait:project-tracker:2': {
    id: 'wait:project-tracker:2',
    x: DESK_WAITING_SPOTS['project-tracker'][1].x,
    z: DESK_WAITING_SPOTS['project-tracker'][1].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['project-tracker'][1].facing,
    posture: 'standing',
    neighbors: ['visit:project-tracker', 'aisle:sw', 'corridor:south-w'],
  },
  'wait:content-creator:1': {
    id: 'wait:content-creator:1',
    x: DESK_WAITING_SPOTS['content-creator'][0].x,
    z: DESK_WAITING_SPOTS['content-creator'][0].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['content-creator'][0].facing,
    posture: 'standing',
    neighbors: ['visit:content-creator', 'aisle:se', 'corridor:north'],
  },
  'wait:content-creator:2': {
    id: 'wait:content-creator:2',
    x: DESK_WAITING_SPOTS['content-creator'][1].x,
    z: DESK_WAITING_SPOTS['content-creator'][1].z,
    room: 'open-work',
    facing: DESK_WAITING_SPOTS['content-creator'][1].facing,
    posture: 'standing',
    neighbors: ['visit:content-creator', 'aisle:se', 'corridor:hub'],
  },

  // Open Work Area Internal Aisles (behind chairs & central spine)
  'aisle:nw': {
    id: 'aisle:nw',
    x: -4.6,
    z: -5.7,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'desk:lead-finder',
      'visit:lead-finder',
      'wait:lead-finder:1',
      'wait:lead-finder:2',
      'aisle:center-n',
      'aisle:mid',
    ],
  },
  'aisle:ne': {
    id: 'aisle:ne',
    x: -0.2,
    z: -5.7,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'desk:business-strategist',
      'visit:business-strategist',
      'wait:business-strategist:1',
      'wait:business-strategist:2',
      'aisle:center-n',
      'corridor:north',
    ],
  },
  'aisle:center-n': {
    id: 'aisle:center-n',
    x: -2.4,
    z: -5.7,
    room: 'open-work',
    posture: 'standing',
    neighbors: ['aisle:nw', 'aisle:ne'],
  },
  'aisle:mid': {
    id: 'aisle:mid',
    x: -4.6,
    z: -2.6,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'aisle:nw',
      'aisle:sw',
      'wait:lead-finder:1',
      'wait:project-tracker:1',
      'corridor:north',
    ],
  },
  'aisle:sw': {
    id: 'aisle:sw',
    x: -4.6,
    z: -1.6,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'desk:project-tracker',
      'visit:project-tracker',
      'wait:project-tracker:1',
      'wait:project-tracker:2',
      'aisle:mid',
      'corridor:south-w',
    ],
  },
  'aisle:se': {
    id: 'aisle:se',
    x: -0.2,
    z: -1.6,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'desk:content-creator',
      'visit:content-creator',
      'wait:content-creator:1',
      'wait:content-creator:2',
      'corridor:north',
      'corridor:hub',
    ],
  },

  // Main North-South & East-West Corridors
  'corridor:north': {
    id: 'corridor:north',
    x: -0.1,
    z: -3.5,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'aisle:ne',
      'aisle:mid',
      'aisle:se',
      'wait:business-strategist:1',
      'wait:content-creator:1',
      'door:meeting',
    ],
  },
  'corridor:hub': {
    id: 'corridor:hub',
    x: -0.1,
    z: 2.0,
    room: 'open-work',
    posture: 'standing',
    neighbors: [
      'aisle:se',
      'wait:content-creator:2',
      'corridor:south-w',
      'corridor:kitchen',
      'corridor:lounge',
      'corridor:studio-approach',
    ],
  },
  'corridor:south-w': {
    id: 'corridor:south-w',
    x: -4.6,
    z: 2.0,
    room: 'open-work',
    posture: 'standing',
    neighbors: ['aisle:sw', 'corridor:hub', 'corridor:kitchen', 'door:reception'],
  },
  'corridor:kitchen': {
    id: 'corridor:kitchen',
    x: -3.55,
    z: 3.15,
    room: 'kitchen',
    posture: 'standing',
    neighbors: [
      'corridor:south-w',
      'corridor:hub',
      'corridor:lounge',
      'kitchen:espresso',
      'kitchen:counter',
      'kitchen:island',
    ],
  },
  'corridor:lounge': {
    id: 'corridor:lounge',
    x: -0.75,
    z: 2.9,
    room: 'lounge',
    posture: 'standing',
    neighbors: ['corridor:hub', 'corridor:kitchen', 'lounge:sofa', 'lounge:side', 'lounge:east'],
  },
  'corridor:studio-approach': {
    id: 'corridor:studio-approach',
    x: -0.1,
    z: 3.4,
    room: 'open-work',
    posture: 'standing',
    neighbors: ['corridor:hub', 'door:studio'],
  },

  // Glass Meeting Room Doorway, Conference Chairs & Whiteboard Huddle
  'door:meeting': {
    id: 'door:meeting',
    x: 1.35,
    z: -3.5,
    room: 'meeting-room',
    posture: 'standing',
    neighbors: ['corridor:north', 'meeting:entry'],
  },
  'meeting:entry': {
    id: 'meeting:entry',
    x: 2.75,
    z: -3.5,
    room: 'meeting-room',
    posture: 'standing',
    neighbors: ['door:meeting', 'meeting:north-aisle', 'meeting:south-aisle'],
  },
  'meeting:north-aisle': {
    id: 'meeting:north-aisle',
    x: 3.1,
    z: -5.55,
    room: 'meeting-room',
    posture: 'standing',
    neighbors: ['meeting:entry', 'meeting:lead-finder', 'whiteboard:left'],
  },
  'meeting:south-aisle': {
    id: 'meeting:south-aisle',
    x: 3.1,
    z: -1.85,
    room: 'meeting-room',
    posture: 'standing',
    neighbors: ['meeting:entry', 'meeting:project-tracker'],
  },
  'whiteboard:left': {
    id: 'whiteboard:left',
    x: WHITEBOARD_HUDDLE_SPOTS[0].x,
    z: WHITEBOARD_HUDDLE_SPOTS[0].z,
    room: 'meeting-room',
    facing: WHITEBOARD_HUDDLE_SPOTS[0].facing,
    posture: 'standing',
    neighbors: ['meeting:north-aisle', 'whiteboard:center', 'meeting:lead-finder'],
  },
  'whiteboard:center': {
    id: 'whiteboard:center',
    x: WHITEBOARD_HUDDLE_SPOTS[1].x,
    z: WHITEBOARD_HUDDLE_SPOTS[1].z,
    room: 'meeting-room',
    facing: WHITEBOARD_HUDDLE_SPOTS[1].facing,
    posture: 'standing',
    neighbors: ['whiteboard:left', 'whiteboard:right', 'meeting:lead-finder', 'meeting:business-strategist'],
  },
  'whiteboard:right': {
    id: 'whiteboard:right',
    x: WHITEBOARD_HUDDLE_SPOTS[2].x,
    z: WHITEBOARD_HUDDLE_SPOTS[2].z,
    room: 'meeting-room',
    facing: WHITEBOARD_HUDDLE_SPOTS[2].facing,
    posture: 'standing',
    neighbors: ['whiteboard:center', 'meeting:business-strategist'],
  },
  'meeting:lead-finder': {
    id: 'meeting:lead-finder',
    x: MEETING_SPOTS['lead-finder'].x,
    z: MEETING_SPOTS['lead-finder'].z,
    room: 'meeting-room',
    facing: MEETING_SPOTS['lead-finder'].facing,
    posture: 'seated',
    neighbors: ['meeting:north-aisle', 'whiteboard:left', 'whiteboard:center', 'meeting:business-strategist'],
  },
  'meeting:business-strategist': {
    id: 'meeting:business-strategist',
    x: MEETING_SPOTS['business-strategist'].x,
    z: MEETING_SPOTS['business-strategist'].z,
    room: 'meeting-room',
    facing: MEETING_SPOTS['business-strategist'].facing,
    posture: 'seated',
    neighbors: ['meeting:lead-finder', 'whiteboard:center', 'whiteboard:right'],
  },
  'meeting:project-tracker': {
    id: 'meeting:project-tracker',
    x: MEETING_SPOTS['project-tracker'].x,
    z: MEETING_SPOTS['project-tracker'].z,
    room: 'meeting-room',
    facing: MEETING_SPOTS['project-tracker'].facing,
    posture: 'seated',
    neighbors: ['meeting:south-aisle', 'meeting:content-creator'],
  },
  'meeting:content-creator': {
    id: 'meeting:content-creator',
    x: MEETING_SPOTS['content-creator'].x,
    z: MEETING_SPOTS['content-creator'].z,
    room: 'meeting-room',
    facing: MEETING_SPOTS['content-creator'].facing,
    posture: 'seated',
    neighbors: ['meeting:project-tracker'],
  },

  // Content Studio Doorway & Recording Desk
  'door:studio': {
    id: 'door:studio',
    x: 1.35,
    z: 3.4,
    room: 'content-studio',
    posture: 'standing',
    neighbors: ['corridor:studio-approach', 'studio:entry'],
  },
  'studio:entry': {
    id: 'studio:entry',
    x: 3.3,
    z: 3.0,
    room: 'content-studio',
    posture: 'standing',
    neighbors: ['door:studio', 'studio:recording'],
  },
  'studio:recording': {
    id: 'studio:recording',
    x: CONTENT_STUDIO_SPOT.x,
    z: CONTENT_STUDIO_SPOT.z,
    room: 'content-studio',
    facing: CONTENT_STUDIO_SPOT.facing,
    posture: 'seated',
    neighbors: ['studio:entry'],
  },

  // Reception & Lounge
  'door:reception': {
    id: 'door:reception',
    x: -4.6,
    z: 3.4,
    room: 'reception',
    posture: 'standing',
    neighbors: ['corridor:south-w', 'reception:front'],
  },
  'reception:front': {
    id: 'reception:front',
    x: RECEPTION_SPOT.x,
    z: RECEPTION_SPOT.z,
    room: 'reception',
    facing: RECEPTION_SPOT.facing,
    posture: 'standing',
    neighbors: ['door:reception'],
  },
  'lounge:sofa': {
    id: 'lounge:sofa',
    x: LOUNGE_HUDDLE_SPOTS[0].x,
    z: LOUNGE_HUDDLE_SPOTS[0].z,
    room: 'lounge',
    facing: LOUNGE_HUDDLE_SPOTS[0].facing,
    posture: 'seated',
    neighbors: ['corridor:lounge', 'lounge:side', 'lounge:east'],
  },
  'lounge:side': {
    id: 'lounge:side',
    x: LOUNGE_HUDDLE_SPOTS[1].x,
    z: LOUNGE_HUDDLE_SPOTS[1].z,
    room: 'lounge',
    facing: LOUNGE_HUDDLE_SPOTS[1].facing,
    posture: 'standing',
    neighbors: ['corridor:lounge', 'lounge:sofa'],
  },
  'lounge:east': {
    id: 'lounge:east',
    x: LOUNGE_HUDDLE_SPOTS[2].x,
    z: LOUNGE_HUDDLE_SPOTS[2].z,
    room: 'lounge',
    facing: LOUNGE_HUDDLE_SPOTS[2].facing,
    posture: 'standing',
    neighbors: ['corridor:lounge', 'lounge:sofa'],
  },
  // Studio Kitchen & Espresso Bar Coffee Break Spots
  'kitchen:espresso': {
    id: 'kitchen:espresso',
    x: KITCHEN_SPOTS[0].x,
    z: KITCHEN_SPOTS[0].z,
    room: 'kitchen',
    facing: KITCHEN_SPOTS[0].facing,
    posture: 'standing',
    neighbors: ['corridor:kitchen', 'kitchen:island', 'kitchen:counter'],
  },
  'kitchen:counter': {
    id: 'kitchen:counter',
    x: KITCHEN_SPOTS[1].x,
    z: KITCHEN_SPOTS[1].z,
    room: 'kitchen',
    facing: KITCHEN_SPOTS[1].facing,
    posture: 'standing',
    neighbors: ['corridor:kitchen', 'kitchen:island', 'kitchen:espresso'],
  },
  'kitchen:island': {
    id: 'kitchen:island',
    x: KITCHEN_SPOTS[2].x,
    z: KITCHEN_SPOTS[2].z,
    room: 'kitchen',
    facing: KITCHEN_SPOTS[2].facing,
    posture: 'standing',
    neighbors: ['corridor:kitchen', 'kitchen:espresso', 'kitchen:counter'],
  },
};

export function getDeskNodeId(botId: BotId): string {
  return `desk:${botId}`;
}

export function getDeskVisitorNodeId(botId: BotId): string {
  return `visit:${botId}`;
}

export function getMeetingNodeId(botId: BotId): string {
  return `meeting:${botId}`;
}

export function findNearestNavNode(pos: Vec2): string {
  let bestId = 'corridor:hub';
  let bestDistSq = Infinity;
  for (const node of Object.values(NAV_NODES)) {
    const dx = node.x - pos.x;
    const dz = node.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * Finds the shortest navigable corridor path between two studio nodes using Dijkstra's algorithm.
 * Guarantees coworkers walk cleanly around corners and through framed doorways.
 */
export function findNavigationPath(startNodeId: string, goalNodeId: string): NavNode[] {
  const start = NAV_NODES[startNodeId];
  const goal = NAV_NODES[goalNodeId];
  if (!start || !goal) return [];
  if (startNodeId === goalNodeId) return [goal];

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const unvisited = new Set<string>(Object.keys(NAV_NODES));

  for (const id of unvisited) {
    dist.set(id, id === startNodeId ? 0 : Infinity);
  }

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let smallest = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < smallest) {
        smallest = d;
        currentId = id;
      }
    }
    if (!currentId || smallest === Infinity) break;
    if (currentId === goalNodeId) break;
    unvisited.delete(currentId);

    const curr = NAV_NODES[currentId];
    for (const neighborId of curr.neighbors) {
      if (!unvisited.has(neighborId)) continue;
      const neighbor = NAV_NODES[neighborId];
      if (!neighbor) continue;
      const edgeLen = Math.hypot(neighbor.x - curr.x, neighbor.z - curr.z);
      const candidate = smallest + edgeLen;
      if (candidate < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, candidate);
        prev.set(neighborId, currentId);
      }
    }
  }

  if (!prev.has(goalNodeId)) return [goal];

  const path: NavNode[] = [];
  let cursor: string | undefined = goalNodeId;
  while (cursor) {
    const node = NAV_NODES[cursor];
    if (node) path.unshift(node);
    cursor = prev.get(cursor);
  }
  return path;
}

export interface BotMovementState {
  x: number;
  z: number;
  facing: number;
  waypoints: NavNode[];
  targetFacing: number;
}

/** Shortest signed angle difference wrapped to [-PI, PI]. */
export function shortestAngleDelta(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Pure step function advancing a coworker along their waypoint path, smoothly turning at corners.
 */
export function advanceBotAlongPath(
  state: BotMovementState,
  dt: number,
  speedUnitsPerSec = 5.4
): { arrived: boolean; moved: boolean } {
  if (state.waypoints.length === 0) {
    const angleDiff = shortestAngleDelta(state.facing, state.targetFacing);
    if (Math.abs(angleDiff) > 0.015) {
      const turnStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), dt * 9.0);
      state.facing += turnStep;
      return { arrived: true, moved: true };
    }
    state.facing = state.targetFacing;
    return { arrived: true, moved: false };
  }

  let remaining = speedUnitsPerSec * dt;
  let moved = false;

  while (remaining > 0 && state.waypoints.length > 0) {
    const wp = state.waypoints[0];
    const dx = wp.x - state.x;
    const dz = wp.z - state.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= 0.04) {
      state.x = wp.x;
      state.z = wp.z;
      if (wp.facing !== undefined && state.waypoints.length === 1) {
        state.targetFacing = wp.facing;
      }
      state.waypoints.shift();
      moved = true;
      continue;
    }

    const desiredFacing = Math.atan2(dx, dz);
    const angleDelta = shortestAngleDelta(state.facing, desiredFacing);
    state.facing += Math.sign(angleDelta) * Math.min(Math.abs(angleDelta), dt * 11.0);

    if (remaining >= dist) {
      state.x = wp.x;
      state.z = wp.z;
      remaining -= dist;
      if (wp.facing !== undefined && state.waypoints.length === 1) {
        state.targetFacing = wp.facing;
      }
      state.waypoints.shift();
      moved = true;
    } else {
      state.x += (dx / dist) * remaining;
      state.z += (dz / dist) * remaining;
      remaining = 0;
      moved = true;
    }
  }

  return { arrived: state.waypoints.length === 0, moved };
}
