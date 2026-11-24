import type { BotId, RoomId } from '../types/workspace';

export interface Vec2 {
  x: number;
  z: number;
}

export interface RoomCameraPreset {
  id: RoomId;
  label: string;
  shortLabel: string;
  target: [number, number, number];
  zoom: number;
  /** Label anchor on the floor for subtle architectural room markers */
  floorMarker?: [number, number, number];
}

/**
 * Architectural coordinates for the human-scale 20m × 15m Rhymvex Studio.
 * All furniture, walls, doorways, camera presets, and navigation waypoints derive from this file.
 */
export const STUDIO_DIMENSIONS = {
  width: 20,
  depth: 15,
  halfW: 10,
  halfD: 7.5,
  wallHeight: 3.35,
} as const;

export const ROOM_PRESETS: Record<RoomId, RoomCameraPreset> = {
  overview: {
    id: 'overview',
    label: 'Office Overview',
    shortLabel: 'Overview',
    target: [0, 0.45, 0.15],
    zoom: 1.0,
  },
  'open-work': {
    id: 'open-work',
    label: 'Open Work Area',
    shortLabel: 'Work Area',
    target: [-4.6, 0.55, -2.5],
    zoom: 1.72,
    floorMarker: [-4.6, 0.05, -6.5],
  },
  'meeting-room': {
    id: 'meeting-room',
    label: 'Glass Meeting Room',
    shortLabel: 'Meeting Room',
    target: [5.5, 0.7, -3.7],
    zoom: 1.95,
    floorMarker: [5.5, 0.05, -0.7],
  },
  'content-studio': {
    id: 'content-studio',
    label: 'Content Studio',
    shortLabel: 'Content Studio',
    target: [5.5, 0.6, 3.8],
    zoom: 1.88,
    floorMarker: [5.5, 0.05, 6.7],
  },
  reception: {
    id: 'reception',
    label: 'Reception',
    shortLabel: 'Reception',
    target: [-7.1, 0.55, 4.9],
    zoom: 1.95,
    floorMarker: [-7.3, 0.05, 6.85],
  },
  kitchen: {
    id: 'kitchen',
    label: 'Studio Kitchen',
    shortLabel: 'Kitchen',
    target: [-3.55, 0.6, 5.2],
    zoom: 2.15,
    floorMarker: [-3.55, 0.05, 7.05],
  },
  lounge: {
    id: 'lounge',
    label: 'Studio Lounge',
    shortLabel: 'Lounge',
    target: [-0.75, 0.5, 4.9],
    zoom: 2.0,
    floorMarker: [-0.75, 0.05, 6.85],
  },
};

export const ROOM_ORDER: RoomId[] = [
  'overview',
  'open-work',
  'meeting-room',
  'content-studio',
  'reception',
  'kitchen',
  'lounge',
];

/** Desk placements in the Open Work Area (generous walkable aisles between all 4 desks). */
export const BOT_DESK_POSITIONS: Record<BotId, [number, number, number]> = {
  'lead-finder': [-6.9, 0, -4.5],
  'business-strategist': [-2.3, 0, -4.5],
  'project-tracker': [-6.9, 0, -0.5],
  'content-creator': [-2.3, 0, -0.5],
};

/** Exact seated position & facing angle (radians, 0 = +Z toward monitor) at each coworker's home desk. */
export const BOT_DESK_SEAT_POSE: Record<
  BotId,
  { x: number; z: number; facing: number; nodeId: string }
> = {
  'lead-finder': { x: -6.9, z: -5.06, facing: 0, nodeId: 'desk:lead-finder' },
  'business-strategist': {
    x: -2.3,
    z: -5.06,
    facing: 0,
    nodeId: 'desk:business-strategist',
  },
  'project-tracker': {
    x: -6.9,
    z: -1.06,
    facing: 0,
    nodeId: 'desk:project-tracker',
  },
  'content-creator': {
    x: -2.3,
    z: -1.06,
    facing: 0,
    nodeId: 'desk:content-creator',
  },
};

/** Standing visitor spots right beside each desk for natural 2-person desk-side conversations. */
export const DESK_VISITOR_SPOTS: Record<
  BotId,
  { nodeId: string; x: number; z: number; facing: number }
> = {
  'lead-finder': {
    nodeId: 'visit:lead-finder',
    x: -5.55,
    z: -4.95,
    facing: -Math.PI / 2,
  },
  'business-strategist': {
    nodeId: 'visit:business-strategist',
    x: -0.95,
    z: -4.95,
    facing: -Math.PI / 2,
  },
  'project-tracker': {
    nodeId: 'visit:project-tracker',
    x: -5.55,
    z: -0.95,
    facing: -Math.PI / 2,
  },
  'content-creator': {
    nodeId: 'visit:content-creator',
    x: -0.95,
    z: -0.95,
    facing: -Math.PI / 2,
  },
};

/**
 * Distinct, reachable waiting spots positioned neatly in the nearby aisle (1.15m–1.45m away)
 * so queued coworkers never overlap the active speaker and can step forward cleanly when promoted.
 */
export const DESK_WAITING_SPOTS: Record<
  BotId,
  Array<{ nodeId: string; x: number; z: number; facing: number }>
> = {
  'business-strategist': [
    {
      nodeId: 'wait:business-strategist:1',
      x: -0.25,
      z: -3.75,
      facing: -Math.PI * 0.72,
    },
    {
      nodeId: 'wait:business-strategist:2',
      x: -0.25,
      z: -6.05,
      facing: -Math.PI * 0.32,
    },
  ],
  'lead-finder': [
    {
      nodeId: 'wait:lead-finder:1',
      x: -4.55,
      z: -3.95,
      facing: -Math.PI * 0.72,
    },
    {
      nodeId: 'wait:lead-finder:2',
      x: -4.55,
      z: -5.85,
      facing: -Math.PI * 0.3,
    },
  ],
  'project-tracker': [
    {
      nodeId: 'wait:project-tracker:1',
      x: -4.55,
      z: -2.25,
      facing: -Math.PI * 0.32,
    },
    {
      nodeId: 'wait:project-tracker:2',
      x: -4.55,
      z: 0.25,
      facing: -Math.PI * 0.72,
    },
  ],
  'content-creator': [
    {
      nodeId: 'wait:content-creator:1',
      x: -0.25,
      z: -2.25,
      facing: -Math.PI * 0.32,
    },
    {
      nodeId: 'wait:content-creator:2',
      x: -0.25,
      z: 0.35,
      facing: -Math.PI * 0.72,
    },
  ],
};

/**
 * Distinct meeting room seats for each coworker during 4-person meetings.
 * Conference table sits at (5.6, -3.7), Whiteboard at (5.6, 1.95, -7.27).
 */
export const MEETING_SPOTS: Record<
  BotId,
  { nodeId: string; x: number; z: number; facing: number }
> = {
  'lead-finder': {
    nodeId: 'meeting:lead-finder',
    x: 4.5,
    z: -5.25,
    facing: 0.25,
  },
  'business-strategist': {
    nodeId: 'meeting:business-strategist',
    x: 6.7,
    z: -5.25,
    facing: -0.25,
  },
  'project-tracker': {
    nodeId: 'meeting:project-tracker',
    x: 4.5,
    z: -2.15,
    facing: Math.PI - 0.25,
  },
  'content-creator': {
    nodeId: 'meeting:content-creator',
    x: 6.7,
    z: -2.15,
    facing: Math.PI + 0.25,
  },
};

/** Standing huddle positions right in front of the live 3D Whiteboard for 3-person brainstorms. */
export const WHITEBOARD_HUDDLE_SPOTS = [
  { nodeId: 'whiteboard:left', x: 4.2, z: -6.15, facing: Math.PI - 0.35 },
  { nodeId: 'whiteboard:center', x: 5.6, z: -6.25, facing: Math.PI },
  { nodeId: 'whiteboard:right', x: 7.0, z: -6.15, facing: Math.PI + 0.35 },
] as const;

export const CONTENT_STUDIO_SPOT = {
  nodeId: 'studio:recording',
  x: 5.7,
  z: 2.95,
  facing: 0, // Faces recording desk at +Z
};

export const LOUNGE_SPOT = {
  nodeId: 'lounge:sofa',
  x: -0.75,
  z: 4.6,
  facing: 0,
};

/** Multi-person Lounge hangout spots (sofa + standing/side spots around the coffee table). */
export const LOUNGE_HUDDLE_SPOTS = [
  { nodeId: 'lounge:sofa', x: -0.75, z: 4.6, facing: 0.15, posture: 'seated' as const },
  { nodeId: 'lounge:side', x: -1.75, z: 4.2, facing: 1.05, posture: 'standing' as const },
  { nodeId: 'lounge:east', x: 0.4, z: 4.3, facing: -1.05, posture: 'standing' as const },
] as const;

/** Standing Coffee Break rest spots in the Studio Kitchen & Espresso Bar (x in [-4.8, -2.3], z in [3.05, 7.05]). */
export const KITCHEN_SPOTS = [
  { nodeId: 'kitchen:espresso', x: -3.95, z: 5.25, facing: 0 },
  { nodeId: 'kitchen:counter', x: -3.05, z: 5.25, facing: 0 },
  { nodeId: 'kitchen:island', x: -3.5, z: 4.25, facing: 0 },
] as const;

export const RECEPTION_SPOT = {
  nodeId: 'reception:front',
  x: -5.55,
  z: 4.1,
  facing: -Math.PI / 2,
};
