import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  BotActivityState,
  BotId,
  BotJobStatus,
  BotLivePresence,
  DeskScreenLine,
  DeskWorkMode,
  RoomId,
} from '../types/workspace';
import { BOTS } from '../state/seedDemo';
import {
  BOT_DESK_POSITIONS,
  ROOM_PRESETS,
  STUDIO_DIMENSIONS,
} from './officeLayout';
import {
  advanceBotAlongPath,
  findNavigationPath,
  findNearestNavNode,
  NAV_NODES,
} from './navigation';
import {
  animateHumanCoworker,
  buildHumanCoworker,
  createSharedHumanMaterials,
  type HumanCoworkerRig,
} from './buildHumanCoworker';

export interface BotLabelProjection {
  botId: BotId;
  xPct: number;
  yPct: number;
  isPhysicallyWalking: boolean;
}

export interface RoomLabelProjection {
  roomId: Exclude<RoomId, 'overview'>;
  label: string;
  xPct: number;
  yPct: number;
}

export interface SceneProjectionSnapshot {
  bots: BotLabelProjection[];
  rooms: RoomLabelProjection[];
}

export interface OfficeSceneController {
  setSelectedBot: (botId: BotId | null) => void;
  setBotStatuses: (statuses: Record<BotId, BotJobStatus>) => void;
  setBotPresence: (presence: Record<BotId, BotLivePresence>) => void;
  setWhiteboardContent: (lines: string[], isActiveMeeting: boolean) => void;
  focusRoom: (roomId: RoomId) => void;
  setFollowBot: (botId: BotId | null) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  resize: () => void;
  dispose: () => void;
}

interface DeskDisplayController {
  texture: THREE.CanvasTexture;
  draw: (params: {
    title: string;
    lines: DeskScreenLine[];
    mode: DeskWorkMode;
    isWorking: boolean;
    isWaiting: boolean;
  }) => void;
}

interface DeskStationRig {
  botId: BotId;
  root: THREE.Group;
  hitProxy: THREE.Mesh;
  screenMat: THREE.MeshStandardMaterial;
  display: DeskDisplayController;
  lastDisplaySig: string;
  lampLight: THREE.PointLight;
}

function createDeskDisplayController(
  botId: BotId,
  accentHex: string,
  maxAniso: number
): DeskDisplayController {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(maxAniso, 4);

  const defaultTitle =
    botId === 'lead-finder'
      ? 'LEAD RESEARCH'
      : botId === 'business-strategist'
        ? 'TEAM LEAD REVIEW'
        : botId === 'project-tracker'
          ? 'PROJECT BOARD'
          : 'OUTREACH DRAFT';

  const draw: DeskDisplayController['draw'] = ({
    title,
    lines,
    mode,
    isWorking,
    isWaiting,
  }) => {
    // Deep studio screen background
    ctx.fillStyle = '#0F151D';
    ctx.fillRect(0, 0, 512, 320);

    // Subtle frame & top status strip
    const headerColor = isWaiting
      ? '#EAB365'
      : isWorking
        ? '#22D3EE'
        : accentHex;
    ctx.fillStyle = '#18222F';
    ctx.fillRect(10, 10, 492, 54);
    ctx.fillStyle = headerColor;
    ctx.fillRect(10, 10, 10, 54);

    // Title
    ctx.fillStyle = '#F4EFE6';
    ctx.font = '700 22px monospace';
    ctx.fillText((title || defaultTitle).slice(0, 22), 32, 45);

    // Mode pill on right of header
    const badgeText = isWaiting
      ? 'WAITING'
      : mode === 'researching'
        ? 'RESEARCH'
        : mode === 'drafting'
          ? 'TYPING'
          : mode === 'rereading'
            ? 'REREAD'
            : mode === 'coordinating'
              ? 'BOARD'
              : mode === 'reviewing'
                ? 'AUDIT'
                : 'READY';
    ctx.fillStyle = isWaiting ? '#3B2C16' : isWorking ? '#13313B' : '#202938';
    ctx.fillRect(368, 20, 122, 34);
    ctx.fillStyle = headerColor;
    ctx.font = '700 18px monospace';
    ctx.fillText(badgeText, 382, 43);

    // Document / list / checklist rows
    const displayLines: DeskScreenLine[] =
      lines.length > 0
        ? lines.slice(0, 4)
        : [{ text: 'Workspace ready', tone: 'normal' }];

    displayLines.forEach((line, idx) => {
      const y = 84 + idx * 54;
      ctx.fillStyle = '#141C26';
      ctx.fillRect(16, y, 480, 44);

      const barColor =
        line.tone === 'ok'
          ? '#4ADE80'
          : line.tone === 'warn'
            ? '#F59E0B'
            : line.tone === 'accent'
              ? '#22D3EE'
              : '#475569';
      ctx.fillStyle = barColor;
      ctx.fillRect(16, y, 7, 44);

      ctx.fillStyle =
        line.tone === 'ok'
          ? '#BBF7D0'
          : line.tone === 'warn'
            ? '#FDE68A'
            : line.tone === 'accent'
              ? '#A5F3FC'
              : '#E2E8F0';
      ctx.font = '600 21px monospace';
      ctx.fillText(line.text.slice(0, 30), 34, y + 29);
    });

    // Bottom activity progress indicator
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(16, 298, 480, 10);
    ctx.fillStyle = headerColor;
    ctx.fillRect(16, 298, isWorking ? 340 : isWaiting ? 240 : 120, 10);

    texture.needsUpdate = true;
  };

  draw({
    title: defaultTitle,
    lines: [{ text: 'Studio workspace online', tone: 'normal' }],
    mode: 'idle',
    isWorking: false,
    isWaiting: false,
  });

  return { texture, draw };
}

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createWalnutWoodTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#4a3527';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const planks = 8;
  const plankH = size / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * plankH;
    const shade = (p % 3) * 6 - 6;
    ctx.fillStyle = `rgb(${78 + shade}, ${56 + shade}, ${40 + shade})`;
    ctx.fillRect(0, y0, size, plankH - 1.5);

    for (let g = 0; g < 16; g++) {
      const gy = y0 + (g / 16) * plankH;
      ctx.strokeStyle =
        g % 2 === 0 ? 'rgba(34, 22, 14, 0.22)' : 'rgba(130, 98, 70, 0.17)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(
        size * 0.3,
        gy + Math.sin(p + g) * 2.5,
        size * 0.7,
        gy - Math.cos(p + g) * 2.5,
        size,
        gy
      );
      ctx.stroke();

      bCtx.strokeStyle = g % 2 === 0 ? '#6a6a6a' : '#969696';
      bCtx.beginPath();
      bCtx.moveTo(0, gy);
      bCtx.lineTo(size, gy);
      bCtx.stroke();
    }

    ctx.fillStyle = '#281b12';
    ctx.fillRect(0, y0 + plankH - 1.5, size, 1.5);
    bCtx.fillStyle = '#3c3c3c';
    bCtx.fillRect(0, y0 + plankH - 2, size, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 4);
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(5, 4);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function createWovenFabricTexture(
  baseHex: string,
  accentHex: string,
  maxAniso: number
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = accentHex;
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      if (((x + y) / 4) % 2 === 0) {
        ctx.globalAlpha = 0.24;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = Math.min(maxAniso, 4);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(6, 8, 12, 0.56)');
  grad.addColorStop(0.55, 'rgba(6, 8, 12, 0.24)');
  grad.addColorStop(1, 'rgba(6, 8, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createRhymvexSignTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#191D24';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#3A4252';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 144);

  // Subtle cyan accent rule
  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(36, 46, 5, 68);

  ctx.fillStyle = '#F4EFE6';
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('RHYMVEX', 58, 86);

  ctx.fillStyle = '#EAB365';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('SOFTWARE & AUTOMATION STUDIO', 58, 114);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createWhiteboardController(maxAniso: number): {
  texture: THREE.CanvasTexture;
  draw: (lines: string[], isActiveMeeting: boolean) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;

  function draw(lines: string[], isActiveMeeting: boolean) {
    ctx.fillStyle = '#E8E3D8';
    ctx.fillRect(0, 0, 640, 320);

    // Subtle grid dots
    ctx.fillStyle = '#CFC8BA';
    for (let gx = 24; gx < 620; gx += 32) {
      for (let gy = 68; gy < 304; gy += 32) {
        ctx.fillRect(gx, gy, 2, 2);
      }
    }

    // Header band
    ctx.fillStyle = isActiveMeeting ? '#0C252E' : '#1E232C';
    ctx.fillRect(0, 0, 640, 54);

    ctx.fillStyle = isActiveMeeting ? '#22D3EE' : '#EAB365';
    ctx.fillRect(0, 49, 640, 5);

    ctx.fillStyle = '#F4EFE6';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText(
      isActiveMeeting
        ? 'MEETING ACTIVE · LIVE DECISIONS'
        : 'RHYMVEX MEETING WHITEBOARD',
      20,
      34
    );

    const effectiveLines =
      lines.length > 0
        ? lines
        : [
            'Ready for team brainstorms & strategy reviews.',
            'Coworkers gather here to test offer ideas.',
            'Decisions & next steps appear live on this board.',
          ];

    effectiveLines.slice(0, 5).forEach((line, idx) => {
      const y = 94 + idx * 44;
      ctx.fillStyle = idx === 0 ? '#0B647A' : '#11151C';
      ctx.font =
        idx === 0
          ? '700 23px "Plus Jakarta Sans", sans-serif'
          : '700 20px "Plus Jakarta Sans", sans-serif';
      const clipped = line.length > 46 ? `${line.slice(0, 44)}…` : line;
      ctx.fillText(clipped, 22, y);
    });

    texture.needsUpdate = true;
  }

  draw([], false);
  return { texture, draw };
}

function buildStudioPlant(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({
    color: 0xd9d1c3,
    roughness: 0.72,
    metalness: 0.05,
  });
  const soilMat = new THREE.MeshStandardMaterial({
    color: 0x2a1f18,
    roughness: 0.95,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3b6346,
    roughness: 0.65,
    metalness: 0.04,
  });
  const leafDarkMat = new THREE.MeshStandardMaterial({
    color: 0x2c4d36,
    roughness: 0.72,
  });

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.17, 0.36, 14),
    potMat
  );
  pot.position.y = 0.18;
  pot.castShadow = true;
  group.add(pot);

  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.04, 12),
    soilMat
  );
  soil.position.y = 0.35;
  group.add(soil);

  const offsets = [
    [0, 0.56, 0, 0.18, 0.42],
    [0.14, 0.49, 0.08, 0.14, 0.34],
    [-0.13, 0.51, 0.07, 0.15, 0.36],
    [0.05, 0.48, -0.13, 0.14, 0.34],
    [-0.1, 0.46, -0.1, 0.13, 0.31],
  ];
  offsets.forEach(([x, y, z, r, h], idx) => {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      idx % 2 === 0 ? leafMat : leafDarkMat
    );
    leaf.position.set(x, y, z);
    leaf.rotation.z = -x * 1.1;
    leaf.rotation.x = z * 1.1;
    leaf.castShadow = true;
    group.add(leaf);
  });

  group.scale.setScalar(scale);
  return group;
}

function buildTaskLamp(withPointLight: boolean): {
  group: THREE.Group;
  light: THREE.PointLight;
} {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x242830,
    roughness: 0.35,
    metalness: 0.75,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c58,
    roughness: 0.28,
    metalness: 0.82,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffefc9,
    emissive: new THREE.Color(0xf5b856),
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.125, 0.035, 12),
    baseMat
  );
  base.position.y = 0.0175;
  group.add(base);

  const stemLower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.32, 8),
    brassMat
  );
  stemLower.position.set(-0.02, 0.17, 0);
  stemLower.rotation.z = 0.14;
  group.add(stemLower);

  const stemUpper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.24, 8),
    brassMat
  );
  stemUpper.position.set(0.05, 0.38, 0);
  stemUpper.rotation.z = -0.52;
  group.add(stemUpper);

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.115, 0.13, 14, 1, true),
    baseMat
  );
  shade.position.set(0.15, 0.43, 0);
  shade.rotation.z = -0.3;
  group.add(shade);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), bulbMat);
  bulb.position.set(0.15, 0.39, 0);
  group.add(bulb);

  const light = new THREE.PointLight(0xffcb80, withPointLight ? 1.85 : 0, 4.4, 1.8);
  light.position.set(0.16, 0.34, 0);
  group.add(light);

  return { group, light };
}

function buildSwivelChair(
  accentHex: string,
  sharedFabricMat: THREE.MeshStandardMaterial,
  sharedMetalMat: THREE.MeshStandardMaterial,
  shadowTex?: THREE.CanvasTexture
): THREE.Group {
  const chair = new THREE.Group();
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.55,
  });

  if (shadowTex) {
    const cShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.76),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    chair.add(cShadow);
  }

  // 5-star caster base
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.06, 10),
    sharedMetalMat
  );
  hub.position.y = 0.07;
  chair.add(hub);

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.024, 0.25),
      sharedMetalMat
    );
    arm.position.set(Math.sin(angle) * 0.125, 0.055, Math.cos(angle) * 0.125);
    arm.rotation.y = angle;
    chair.add(arm);

    const caster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.028, 8),
      sharedMetalMat
    );
    caster.rotation.z = Math.PI / 2;
    caster.position.set(Math.sin(angle) * 0.24, 0.024, Math.cos(angle) * 0.24);
    chair.add(caster);
  }

  // Pneumatic cylinder
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.032, 0.34, 8),
    sharedMetalMat
  );
  stem.position.y = 0.24;
  chair.add(stem);

  // Ergonomic seat cushion: top surface precisely at y = 0.46m (real-world office chair height)
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.47, 0.068, 0.45),
    sharedFabricMat
  );
  seat.position.y = 0.426;
  seat.castShadow = true;
  chair.add(seat);

  // Slim armrests (y = 0.63m, cleanly below 0.68m desk underside)
  [-0.24, 0.24].forEach((ax) => {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.18, 0.032),
      sharedMetalMat
    );
    post.position.set(ax, 0.53, -0.02);
    chair.add(post);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.024, 0.22),
      sharedMetalMat
    );
    pad.position.set(ax, 0.625, 0.01);
    chair.add(pad);
  });

  // Backrest frame + curved lumbar cushion
  const backSpine = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.48, 0.032),
    sharedMetalMat
  );
  backSpine.position.set(0, 0.65, -0.225);
  chair.add(backSpine);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.47, 0.055),
    sharedFabricMat
  );
  back.position.set(0, 0.71, -0.205);
  back.castShadow = true;
  chair.add(back);

  const topAccent = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.026, 0.062),
    trimMat
  );
  topAccent.position.set(0, 0.945, -0.205);
  chair.add(topAccent);

  return chair;
}

function buildDeskStation(
  botId: BotId,
  coords: [number, number, number],
  accentHex: string,
  woodMat: THREE.MeshStandardMaterial,
  sharedChairFabricMat: THREE.MeshStandardMaterial,
  sharedSteelMat: THREE.MeshStandardMaterial,
  shadowTex: THREE.CanvasTexture,
  maxAniso: number
): DeskStationRig {
  const root = new THREE.Group();
  root.position.set(coords[0], coords[1], coords[2]);

  // Ground contact shadow under desk footprint
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 1.95),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.021, 0.14);
  root.add(shadowPlane);

  const steelMat = sharedSteelMat;
  const creamPaperMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe6,
    roughness: 0.85,
  });
  const coverMat = new THREE.MeshStandardMaterial({
    color: 0x4b3c31,
    roughness: 0.78,
  });
  const keycapMat = new THREE.MeshStandardMaterial({
    color: 0x353c48,
    roughness: 0.62,
    metalness: 0.15,
  });
  const deskMatPad = new THREE.MeshStandardMaterial({
    color: 0x20252e,
    roughness: 0.92,
  });

  // Real-world scale desk top: top surface at y = 0.74m, underside y = 0.68m, front edge z = -0.34m
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.06, 1.04), woodMat);
  deskTop.position.set(0, 0.71, 0.18);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  root.add(deskTop);

  // Desk mat pad where keyboard & mouse rest cleanly
  const deskPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.008, 0.42),
    deskMatPad
  );
  deskPad.position.set(0.05, 0.744, -0.1);
  root.add(deskPad);

  // Steel A-frame/T-legs grounded at y = 0.00m up to desk underside y = 0.68m
  [
    [-0.96, 0.34, -0.26],
    [0.96, 0.34, -0.26],
    [-0.96, 0.34, 0.6],
    [0.96, 0.34, 0.6],
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.68, 0.055), steelMat);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    root.add(leg);
  });

  // Live procedural CanvasTexture monitor display + subtle ambient emissive glow
  const display = createDeskDisplayController(botId, accentHex, maxAniso);
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: display.texture,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: display.texture,
    emissiveIntensity: 0.72,
    roughness: 0.22,
    metalness: 0.08,
  });
  const stripGlowMat = new THREE.MeshStandardMaterial({
    color: 0x151b23,
    emissive: new THREE.Color(0x2d4558),
    emissiveIntensity: 0.55,
    roughness: 0.24,
    metalness: 0.2,
  });

  const monitorW = botId === 'business-strategist' ? 0.92 : 0.76;
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.016, 0.16), steelMat);
  standBase.position.set(0, 0.748, 0.42);
  root.add(standBase);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.05), steelMat);
  stand.position.set(0, 0.87, 0.43);
  root.add(stand);

  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(monitorW, 0.44, 0.036),
    steelMat
  );
  bezel.position.set(0, 1.09, 0.4);
  bezel.castShadow = true;
  root.add(bezel);

  // Front screen facing seated coworker (-Z)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(monitorW - 0.05, 0.38),
    screenMat
  );
  screen.position.set(0, 1.09, 0.38);
  screen.rotation.y = Math.PI;
  root.add(screen);

  // Back status bar facing isometric camera (+Z)
  const backStrip = new THREE.Mesh(
    new THREE.BoxGeometry(monitorW - 0.14, 0.032, 0.018),
    stripGlowMat
  );
  backStrip.position.set(0, 1.24, 0.422);
  root.add(backStrip);

  // Angled side studio display facing the isometric camera (+X, +Z) so live documents/lists/checklists are legible from overview
  const isoDisplayGroup = new THREE.Group();
  isoDisplayGroup.position.set(0.66, 1.04, 0.34);
  isoDisplayGroup.rotation.y = Math.PI * 0.22;
  isoDisplayGroup.rotation.x = -0.14;
  root.add(isoDisplayGroup);

  const isoBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.38, 0.032),
    steelMat
  );
  isoBezel.castShadow = true;
  isoDisplayGroup.add(isoBezel);

  const isoScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.32),
    screenMat
  );
  isoScreen.position.z = 0.018;
  isoDisplayGroup.add(isoScreen);

  const isoStand = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.18, 0.055),
    steelMat
  );
  isoStand.position.set(0, -0.21, -0.01);
  isoDisplayGroup.add(isoStand);

  // Ergonomically positioned keyboard & mouse (z = -0.14 so seated hands reach cleanly above y = 0.74m desk top)
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.016, 0.14), keycapMat);
  kb.position.set(-0.04, 0.754, -0.14);
  root.add(kb);

  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.018, 0.095), keycapMat);
  mouse.position.set(0.26, 0.755, -0.13);
  root.add(mouse);

  const notebook = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.022, 0.22),
    creamPaperMat
  );
  notebook.position.set(-0.62, 0.755, -0.06);
  notebook.rotation.y = 0.16;
  root.add(notebook);

  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.042, 0.095, 10),
    creamPaperMat
  );
  mug.position.set(-0.64, 0.79, 0.32);
  root.add(mug);

  // Warm Task Lamp
  const lamp = buildTaskLamp(true);
  lamp.group.position.set(-0.86, 0.74, 0.42);
  lamp.group.rotation.y = -0.35;
  root.add(lamp.group);

  // Role-specific desk prop
  if (botId === 'business-strategist') {
    for (let i = 0; i < 3; i++) {
      const binder = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.028, 0.2),
        i === 1 ? coverMat : creamPaperMat
      );
      binder.position.set(-0.46, 0.754 + i * 0.03, 0.36);
      binder.rotation.y = (i - 1) * 0.08;
      root.add(binder);
    }
  } else if (botId === 'content-creator') {
    const micArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8),
      steelMat
    );
    micArm.position.set(-0.52, 0.94, 0.4);
    micArm.rotation.z = -0.42;
    root.add(micArm);
  }

  // Ergonomic swivel chair aligned directly with BOT_DESK_SEAT_POSE (z = -0.56)
  const chair = buildSwivelChair(
    accentHex,
    sharedChairFabricMat,
    sharedSteelMat,
    shadowTex
  );
  chair.position.set(0, 0, -0.56);
  root.add(chair);

  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 1.7),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.position.set(0, 0.75, 0.02);
  hitProxy.userData.botId = botId;
  root.add(hitProxy);

  return {
    botId,
    root,
    hitProxy,
    screenMat: stripGlowMat,
    display,
    lastDisplaySig: '',
    lampLight: lamp.light,
  };
}

/**
 * Builds the spacious 20m × 15m 5-room human-scale Rhymvex studio:
 * Open Work Area, Glass Meeting Room (with live whiteboard), Content Studio, Reception, and Lounge.
 */
function buildFiveRoomArchitecture(
  scene: THREE.Scene,
  woodMat: THREE.MeshStandardMaterial,
  sharedChairFabricMat: THREE.MeshStandardMaterial,
  sharedSteelMat: THREE.MeshStandardMaterial,
  rugFabricTex: THREE.CanvasTexture,
  warmFabricTex: THREE.CanvasTexture,
  shadowTex: THREE.CanvasTexture,
  floorTex: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture },
  whiteboardTex: THREE.CanvasTexture,
  signTex: THREE.CanvasTexture
) {
  const { width, depth, wallHeight } = STUDIO_DIMENSIONS;

  const addContactShadow = (x: number, z: number, w: number, d: number, opacity = 0.38) => {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.02, z);
    scene.add(s);
  };

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x242933,
    roughness: 0.88,
    metalness: 0.03,
  });
  const mullionMat = sharedSteelMat;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fd3e3,
    transparent: true,
    opacity: 0.2,
    roughness: 0.1,
    metalness: 0.08,
    reflectivity: 0.7,
    depthWrite: false,
  });
  const daylightGlassMat = new THREE.MeshStandardMaterial({
    color: 0xdce8f4,
    emissive: new THREE.Color(0xf6dfb8),
    emissiveIntensity: 0.42,
    roughness: 0.18,
    metalness: 0.05,
  });
  const sunSpillMat = new THREE.MeshBasicMaterial({
    color: 0xffe6bd,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  const slateFloorMat = new THREE.MeshStandardMaterial({
    color: 0x282e39,
    roughness: 0.84,
    metalness: 0.04,
  });
  const studioMatFloor = new THREE.MeshStandardMaterial({
    color: 0x242833,
    roughness: 0.9,
  });
  const receptionFloorMat = new THREE.MeshStandardMaterial({
    color: 0x2d313a,
    roughness: 0.7,
    metalness: 0.06,
  });
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rugFabricTex,
    roughness: 0.95,
  });
  const warmRugMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: warmFabricTex,
    roughness: 0.95,
  });
  const sofaMat = new THREE.MeshStandardMaterial({
    color: 0x444c5b,
    map: rugFabricTex,
    roughness: 0.9,
  });
  const leatherAccentMat = new THREE.MeshStandardMaterial({
    color: 0x8d5e3e,
    roughness: 0.56,
  });
  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe6,
    roughness: 0.82,
  });

  // 1. Main Walnut Floor Slab (20m × 15m)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorTex.map,
    bumpMap: floorTex.bumpMap,
    bumpScale: 0.018,
    roughness: 0.62,
    metalness: 0.06,
  });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.3, depth),
    floorMat
  );
  floor.position.set(0, -0.15, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle Room Zone Floor Inlays (y = 0.018 to avoid any Z-fighting)
  const workRug = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.02, 6.2), rugMat);
  workRug.position.set(-4.6, 0.015, -2.5);
  workRug.receiveShadow = true;
  scene.add(workRug);

  const meetingFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.02, 7.0),
    slateFloorMat
  );
  meetingFloor.position.set(5.5, 0.015, -3.75);
  meetingFloor.receiveShadow = true;
  scene.add(meetingFloor);

  const studioFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.02, 6.9),
    studioMatFloor
  );
  studioFloor.position.set(5.5, 0.015, 3.8);
  studioFloor.receiveShadow = true;
  scene.add(studioFloor);

  const receptionTile = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.02, 4.4),
    receptionFloorMat
  );
  receptionTile.position.set(-7.3, 0.015, 5.0);
  receptionTile.receiveShadow = true;
  scene.add(receptionTile);

  // Studio Kitchen terrazzo tile bay cleanly separating Reception and Lounge
  const kitchenTileMat = new THREE.MeshStandardMaterial({
    color: 0x353b47,
    roughness: 0.72,
    metalness: 0.08,
  });
  const kitchenTile = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 0.02, 4.05),
    kitchenTileMat
  );
  kitchenTile.position.set(-3.55, 0.016, 5.05);
  kitchenTile.receiveShadow = true;
  scene.add(kitchenTile);

  const loungeRug = new THREE.Mesh(
    new THREE.BoxGeometry(3.05, 0.02, 4.0),
    warmRugMat
  );
  loungeRug.position.set(-0.75, 0.016, 4.95);
  loungeRug.receiveShadow = true;
  scene.add(loungeRug);

  // 2. Exterior Cutaway Back Walls (North -Z & West -X so isometric view is 100% open)
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(width, wallHeight, 0.24),
    wallMat
  );
  northWall.position.set(0, wallHeight / 2, -depth / 2);
  northWall.receiveShadow = true;
  scene.add(northWall);

  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, wallHeight, depth + 0.24),
    wallMat
  );
  westWall.position.set(-width / 2, wallHeight / 2, 0);
  westWall.receiveShadow = true;
  scene.add(westWall);

  // Architectural Wood Baseboards
  const northBase = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.2, 0.16, 0.06),
    woodMat
  );
  northBase.position.set(0, 0.08, -depth / 2 + 0.14);
  scene.add(northBase);

  const westBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.16, depth - 0.2),
    woodMat
  );
  westBase.position.set(-width / 2 + 0.14, 0.08, 0);
  scene.add(westBase);

  // Soft Architectural Daylight Windows along West Wall (-X) in Open Work Area (well clear of Reception RHYMVEX sign)
  [-4.7, -1.1].forEach((wz) => {
    const winGroup = new THREE.Group();
    winGroup.position.set(-width / 2 + 0.14, 1.9, wz);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.88, 2.3),
      mullionMat
    );
    winGroup.add(frame);
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 2.42),
      woodMat
    );
    sill.position.set(0.05, -0.94, 0);
    winGroup.add(sill);
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.14, 1.72),
      daylightGlassMat
    );
    pane.rotation.y = Math.PI / 2;
    pane.position.x = 0.055;
    winGroup.add(pane);
    const vBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 1.78, 0.05),
      mullionMat
    );
    winGroup.add(vBar);
    const hBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.05, 2.18),
      mullionMat
    );
    hBar.position.y = 0.24;
    winGroup.add(hBar);
    scene.add(winGroup);

    // Subtle warm sunlit floor spill angled inward from West window
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), sunSpillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(-width / 2 + 2.2, 0.023, wz + 0.25);
    scene.add(spill);
  });

  // 3. Glass Meeting Room Partitions & Framed Doorway (x = 1.0, doorway at z in [-4.6, -2.4])
  const glassH = 2.65;
  const addGlassSegment = (
    x: number,
    z: number,
    len: number,
    rotY = 0,
    height = glassH
  ) => {
    const seg = new THREE.Group();
    seg.position.set(x, 0, z);
    seg.rotation.y = rotY;

    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.08, 0.09),
      mullionMat
    );
    topRail.position.y = height;
    seg.add(topRail);

    const botRail = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.12, 0.09),
      mullionMat
    );
    botRail.position.y = 0.06;
    seg.add(botRail);

    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(len - 0.06, height - 0.18, 0.03),
      glassMat
    );
    pane.position.y = height / 2;
    seg.add(pane);

    [-len / 2, len / 2].forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, height, 0.09),
        mullionMat
      );
      post.position.set(px, height / 2, 0);
      seg.add(post);
    });

    scene.add(seg);
  };

  // West glass wall of Meeting Room (split around framed doorway z = -3.5)
  addGlassSegment(1.0, -6.0, 2.8, Math.PI / 2, glassH);
  addGlassSegment(1.0, -1.3, 2.2, Math.PI / 2, glassH);
  // Doorway lintel beam above Meeting Room entrance
  const meetingLintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.24, 2.2),
    mullionMat
  );
  meetingLintel.position.set(1.0, glassH - 0.08, -3.5);
  scene.add(meetingLintel);

  // South low architectural glass divider between Meeting Room & Content Studio (z = -0.15)
  addGlassSegment(5.4, -0.15, 8.8, 0, 1.35);

  // 4. Content Studio West Partition with Framed Doorway (x = 1.0, doorway z in [2.3, 4.5])
  addGlassSegment(1.0, 1.1, 2.4, Math.PI / 2, 2.1);
  addGlassSegment(1.0, 5.9, 2.8, Math.PI / 2, 2.1);
  const studioLintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.2, 2.2),
    mullionMat
  );
  studioLintel.position.set(1.0, 2.02, 3.4);
  scene.add(studioLintel);

  // Acoustic Wood Slats along Content Studio north divider
  for (let s = 0; s < 14; s++) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.25, 0.06),
      woodMat
    );
    slat.position.set(2.1 + s * 0.54, 0.65, 0.04);
    scene.add(slat);
  }

  // 5. Meeting Room Furniture: Conference Table (y = 0.74m top), 4 Chairs, Live Whiteboard
  addContactShadow(5.6, -3.7, 4.1, 2.2, 0.42);
  const confTable = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.07, 1.7),
    woodMat
  );
  confTable.position.set(5.6, 0.705, -3.7);
  confTable.castShadow = true;
  confTable.receiveShadow = true;
  scene.add(confTable);

  [
    [4.1, 0.34, -3.7],
    [7.1, 0.34, -3.7],
  ].forEach(([lx, ly, lz]) => {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.68, 1.15),
      mullionMat
    );
    base.position.set(lx, ly, lz);
    base.castShadow = true;
    scene.add(base);
  });

  // Meeting table notebooks & warm centerpiece lamp
  const tablePad = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.022, 0.32),
    creamMat
  );
  tablePad.position.set(5.1, 0.752, -3.8);
  scene.add(tablePad);

  const tableLamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.16, 0.22, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffefc9,
      emissive: new THREE.Color(0xeab365),
      emissiveIntensity: 1.0,
      roughness: 0.3,
    })
  );
  tableLamp.position.set(6.1, 0.85, -3.65);
  scene.add(tableLamp);

  const meetingLight = new THREE.PointLight(0xffdca8, 1.35, 7.5, 1.6);
  meetingLight.position.set(5.6, 2.5, -3.7);
  scene.add(meetingLight);

  // 4 Meeting Room Chairs positioned around table (each participant gets their own chair)
  const confChairCoords: Array<[number, number, number]> = [
    [4.5, -5.0, 0],
    [6.7, -5.0, 0],
    [4.5, -2.4, Math.PI],
    [6.7, -2.4, Math.PI],
  ];
  confChairCoords.forEach(([cx, cz, ry]) => {
    const ch = buildSwivelChair('#64748B', sharedChairFabricMat, sharedSteelMat, shadowTex);
    ch.position.set(cx, 0, cz);
    ch.rotation.y = ry;
    scene.add(ch);
  });

  // Live 3D Whiteboard on North Wall of Meeting Room
  const wbFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.85, 1.95, 0.08),
    mullionMat
  );
  wbFrame.position.set(5.6, 1.95, -7.32);
  scene.add(wbFrame);

  const wbSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(3.68, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0xe6e2d9,
      map: whiteboardTex,
      roughness: 0.92,
      metalness: 0.0,
    })
  );
  wbSurface.position.set(5.6, 1.95, -7.27);
  scene.add(wbSurface);

  // 6. Content Studio Furniture: Production Desk (y = 0.74m), Softbox Key Light, Camera Tripod
  addContactShadow(5.8, 4.15, 2.9, 1.6, 0.4);
  const studioDesk = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.06, 1.1),
    woodMat
  );
  studioDesk.position.set(5.8, 0.71, 4.15);
  studioDesk.castShadow = true;
  scene.add(studioDesk);

  [
    [4.7, 0.34, 3.7],
    [6.9, 0.34, 3.7],
    [4.7, 0.34, 4.6],
    [6.9, 0.34, 4.6],
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 0.06), mullionMat);
    leg.position.set(lx, ly, lz);
    scene.add(leg);
  });

  // Dual Studio Monitors & Boom Mic
  [-0.45, 0.45].forEach((mx) => {
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.44, 0.04), mullionMat);
    mon.position.set(5.8 + mx, 1.1, 4.45);
    mon.rotation.y = mx < 0 ? 0.15 : -0.15;
    scene.add(mon);
  });

  const studioChair = buildSwivelChair(
    '#C084FC',
    sharedChairFabricMat,
    sharedSteelMat,
    shadowTex
  );
  studioChair.position.set(5.7, 0, 2.95);
  scene.add(studioChair);

  // Studio Softbox Light Stand
  const lightPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 2.0, 8),
    mullionMat
  );
  lightPole.position.set(8.2, 1.0, 2.5);
  scene.add(lightPole);

  const softbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.5, 0.16),
    new THREE.MeshStandardMaterial({
      color: 0xfff3d8,
      emissive: new THREE.Color(0xeab365),
      emissiveIntensity: 1.05,
      roughness: 0.4,
    })
  );
  softbox.position.set(8.05, 1.95, 2.65);
  softbox.rotation.y = -0.7;
  scene.add(softbox);

  // Camera on Tripod facing host seat
  const tripodPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.04, 1.35, 8),
    mullionMat
  );
  tripodPole.position.set(7.6, 0.68, 5.2);
  scene.add(tripodPole);
  const camBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.2, 0.34),
    mullionMat
  );
  camBody.position.set(7.6, 1.4, 5.2);
  camBody.rotation.y = -2.4;
  scene.add(camBody);

  // 7. Reception Area: Counter, Waiting Bench, Illuminated RHYMVEX Sign
  addContactShadow(-7.1, 5.1, 3.0, 1.3, 0.42);
  const lowDivider = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.85, 0.14),
    woodMat
  );
  lowDivider.position.set(-7.8, 0.425, 2.6);
  scene.add(lowDivider);

  const receptionDesk = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.05, 0.82),
    woodMat
  );
  receptionDesk.position.set(-7.1, 0.525, 5.1);
  receptionDesk.castShadow = true;
  scene.add(receptionDesk);

  const receptionCap = new THREE.Mesh(
    new THREE.BoxGeometry(2.68, 0.07, 0.9),
    mullionMat
  );
  receptionCap.position.set(-7.1, 1.07, 5.1);
  scene.add(receptionCap);

  const receptionLamp = buildTaskLamp(false);
  receptionLamp.group.position.set(-6.15, 1.1, 5.05);
  scene.add(receptionLamp.group);

  // RHYMVEX Wall Sign on West Wall
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: signTex,
      roughness: 0.45,
      emissive: new THREE.Color(0x16222c),
      emissiveIntensity: 0.35,
    })
  );
  signMesh.rotation.y = Math.PI / 2;
  signMesh.position.set(-9.82, 1.98, 5.0);
  scene.add(signMesh);

  // 8. Studio Kitchen & Espresso Bar (x in [-4.8, -2.3], z in [3.05, 7.05])
  const stoneCounterMat = new THREE.MeshStandardMaterial({
    color: 0xd8d1c5,
    roughness: 0.44,
    metalness: 0.08,
  });
  const brushedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    roughness: 0.24,
    metalness: 0.84,
  });
  const applianceDarkMat = new THREE.MeshStandardMaterial({
    color: 0x20252e,
    roughness: 0.48,
    metalness: 0.32,
  });
  const terracottaMugMat = new THREE.MeshStandardMaterial({
    color: 0xb96846,
    roughness: 0.36,
    metalness: 0.04,
  });
  const espressoIndicatorMat = new THREE.MeshStandardMaterial({
    color: 0xffd27d,
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  // Compact brushed-steel studio fridge on left of Kitchen counter
  addContactShadow(-4.48, 6.35, 0.82, 0.92, 0.42);
  const fridgeGroup = new THREE.Group();
  fridgeGroup.position.set(-4.48, 0, 6.35);
  const fridgeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 1.46, 0.68),
    brushedSteelMat
  );
  fridgeBody.position.y = 0.73;
  fridgeBody.castShadow = true;
  fridgeBody.receiveShadow = true;
  fridgeGroup.add(fridgeBody);
  const fridgeSeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.59, 0.02, 0.02),
    applianceDarkMat
  );
  fridgeSeam.position.set(0, 1.02, -0.34);
  fridgeGroup.add(fridgeSeam);
  [1.24, 0.72].forEach((hy) => {
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.22, 0.03),
      mullionMat
    );
    handle.position.set(0.21, hy, -0.36);
    fridgeGroup.add(handle);
  });
  scene.add(fridgeGroup);

  // Walnut base kitchen cabinetry + matte stone countertop (y = 0.92m)
  addContactShadow(-3.3, 6.35, 1.95, 0.96, 0.42);
  const kitchenCabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.74, 0.86, 0.72),
    woodMat
  );
  kitchenCabinet.position.set(-3.3, 0.43, 6.35);
  kitchenCabinet.castShadow = true;
  kitchenCabinet.receiveShadow = true;
  scene.add(kitchenCabinet);

  const kitchenToeKick = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.08, 0.68),
    applianceDarkMat
  );
  kitchenToeKick.position.set(-3.3, 0.04, 6.36);
  scene.add(kitchenToeKick);

  const kitchenCounter = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.06, 0.78),
    stoneCounterMat
  );
  kitchenCounter.position.set(-3.3, 0.89, 6.35);
  kitchenCounter.castShadow = true;
  kitchenCounter.receiveShadow = true;
  scene.add(kitchenCounter);

  // Composite Multi-Part Espresso Machine (mounted on stone countertop y = 0.92m)
  const espressoGroup = new THREE.Group();
  espressoGroup.position.set(-3.78, 0.92, 6.36);

  const espBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.06, 0.36),
    applianceDarkMat
  );
  espBase.position.y = 0.03;
  espressoGroup.add(espBase);

  const espDripGrate = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.014, 0.14),
    brushedSteelMat
  );
  espDripGrate.position.set(0, 0.064, -0.1);
  espressoGroup.add(espDripGrate);

  const espChassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.34, 0.22),
    brushedSteelMat
  );
  espChassis.position.set(0, 0.22, 0.06);
  espChassis.castShadow = true;
  espressoGroup.add(espChassis);

  const espOverhang = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.15),
    brushedSteelMat
  );
  espOverhang.position.set(0, 0.34, -0.09);
  espressoGroup.add(espOverhang);

  const espGroupHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.05, 10),
    applianceDarkMat
  );
  espGroupHead.position.set(-0.04, 0.27, -0.11);
  espressoGroup.add(espGroupHead);

  const espPortafilter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.012, 0.12, 8),
    applianceDarkMat
  );
  espPortafilter.rotation.x = Math.PI / 2;
  espPortafilter.position.set(-0.04, 0.25, -0.19);
  espressoGroup.add(espPortafilter);

  const espSteamWand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6),
    brushedSteelMat
  );
  espSteamWand.position.set(0.11, 0.24, -0.11);
  espSteamWand.rotation.z = -0.22;
  espressoGroup.add(espSteamWand);

  const espPowerLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 6),
    espressoIndicatorMat
  );
  espPowerLed.position.set(0.14, 0.34, -0.17);
  espressoGroup.add(espPowerLed);

  scene.add(espressoGroup);

  // Pour-Over Kettle & Ceramic Mug Station on right half of Kitchen counter
  const kettleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.09, 0.18, 12),
    applianceDarkMat
  );
  kettleBody.position.set(-3.18, 1.01, 6.38);
  kettleBody.castShadow = true;
  scene.add(kettleBody);

  const kettleLid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.02, 0.025, 8),
    woodMat
  );
  kettleLid.position.set(-3.18, 1.11, 6.38);
  scene.add(kettleLid);

  const mugTray = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.018, 0.28),
    woodMat
  );
  mugTray.position.set(-2.72, 0.929, 6.34);
  scene.add(mugTray);

  [
    [-2.83, 0.985, 6.31, creamMat],
    [-2.71, 0.985, 6.38, terracottaMugMat],
    [-2.6, 0.985, 6.29, creamMat],
  ].forEach(([mx, my, mz, mat]) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.034, 0.088, 10),
      mat as THREE.MeshStandardMaterial
    );
    m.position.set(mx as number, my as number, mz as number);
    scene.add(m);
  });

  // Subtle warm coffee-bar glow illuminating espresso counter
  const kitchenLight = new THREE.PointLight(0xffd7a1, 0.95, 5.2, 1.7);
  kitchenLight.position.set(-3.45, 2.25, 5.9);
  scene.add(kitchenLight);

  // 9. Lounge: Sectional Sofa, Coffee Table, Warm Floor Lamp (cleanly east of Kitchen)
  addContactShadow(-0.75, 5.75, 2.35, 1.3, 0.44);
  const sofaBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.42, 0.88),
    sofaMat
  );
  sofaBase.position.set(-0.75, 0.21, 5.75);
  sofaBase.castShadow = true;
  scene.add(sofaBase);

  const sofaBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.52, 0.22),
    sofaMat
  );
  sofaBack.position.set(-0.75, 0.56, 6.08);
  sofaBack.castShadow = true;
  scene.add(sofaBack);

  // Warm leather throw pillows
  [-0.62, 0.62].forEach((ox) => {
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.3, 0.14),
      leatherAccentMat
    );
    pillow.position.set(-0.75 + ox, 0.52, 5.86);
    pillow.rotation.z = ox < 0 ? 0.12 : -0.12;
    scene.add(pillow);
  });

  addContactShadow(-0.75, 4.45, 1.55, 1.0, 0.38);
  const coffeeTable = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.06, 0.72),
    woodMat
  );
  coffeeTable.position.set(-0.75, 0.38, 4.45);
  coffeeTable.castShadow = true;
  scene.add(coffeeTable);

  const cup1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.04, 0.088, 10),
    creamMat
  );
  cup1.position.set(-0.98, 0.455, 4.4);
  scene.add(cup1);

  // Floor Lamp in Lounge
  const floorLampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 1.85, 8),
    mullionMat
  );
  floorLampPole.position.set(0.52, 0.925, 5.95);
  scene.add(floorLampPole);

  const floorLampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 0.34, 14),
    new THREE.MeshStandardMaterial({
      color: 0xf4e3c1,
      emissive: new THREE.Color(0xeab365),
      emissiveIntensity: 0.9,
      roughness: 0.65,
    })
  );
  floorLampShade.position.set(0.52, 1.88, 5.95);
  scene.add(floorLampShade);

  // 9. Open Work Area Credenza, Wall Prints & Studio Plants
  const credenza = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.82, 3.4),
    woodMat
  );
  credenza.position.set(-9.42, 0.41, -2.5);
  scene.add(credenza);

  // Framed Prints along North Wall of Open Work Area
  [-7.2, -4.6, -2.0].forEach((fx, idx) => {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.98, 0.06),
      mullionMat
    );
    frame.position.set(fx, 1.95, -7.34);
    scene.add(frame);

    const art = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.82, 0.07),
      new THREE.MeshStandardMaterial({
        color: idx === 1 ? 0x1f3644 : 0xe9e1d2,
        roughness: 0.82,
      })
    );
    art.position.set(fx, 1.95, -7.33);
    scene.add(art);
  });

  // Plants across rooms
  const plantLocations: Array<[number, number, number]> = [
    [-9.2, -6.7, 1.15],
    [0.2, -6.8, 0.95],
    [9.1, -6.7, 1.1],
    [9.1, 6.5, 1.05],
    [-9.2, 6.6, 1.0],
    [-2.15, 6.55, 0.88],
  ];
  plantLocations.forEach(([px, pz, sc]) => {
    addContactShadow(px, pz, 0.72 * sc, 0.72 * sc, 0.36);
    const p = buildStudioPlant(sc);
    p.position.set(px, 0, pz);
    scene.add(p);
  });
}

/**
 * Mounts the upgraded human-scale 5-room Three.js isometric office with live bot pathfinding,
 * meeting whiteboard updates, pan/zoom/room-focus/follow-bot controls, and software-WebGL pacing.
 */
export function mountOfficeScene(
  container: HTMLDivElement,
  callbacks: {
    onSelectBot: (botId: BotId) => void;
    onProjectionsUpdated: (snapshot: SceneProjectionSnapshot) => void;
    onBotArrived?: (botId: BotId, nodeId: string) => void;
    onUserCameraMove?: () => void;
    onContextLost: () => void;
  }
): OfficeSceneController {
  const isSoftwareGl = detectSoftwareWebGL();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
  );
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  // Isometric Orthographic Camera framing the full 20m × 15m studio cleanly
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 260);
  const aspect = width / height;
  const getBaseFrustum = (a: number) => (a < 1.3 ? 17.5 : 15.2);
  let baseFrustum = getBaseFrustum(aspect);

  const camera = new THREE.OrthographicCamera(
    (-baseFrustum * aspect) / 2,
    (baseFrustum * aspect) / 2,
    baseFrustum / 2,
    -baseFrustum / 2,
    0.1,
    100
  );
  const ISO_OFFSET = new THREE.Vector3(19, 16.8, 19);
  const initialTarget = new THREE.Vector3(...ROOM_PRESETS.overview.target);
  camera.position.copy(initialTarget).add(ISO_OFFSET);
  camera.lookAt(initialTarget);
  camera.zoom = 1.0;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);

  // OrbitControls for effortless Pan & Zoom while preserving clean isometric cutaway readability
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(initialTarget);
  controls.enableRotate = false;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.enableZoom = true;
  controls.minZoom = 0.65;
  controls.maxZoom = 2.6;
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.09;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.update();

  // Soft Daylight from One Side (West Architectural Windows) + Gentle Sky/Wood Bounce
  const hemi = new THREE.HemisphereLight(0xc2d8ee, 0x352920, 0.82);
  scene.add(hemi);

  const daylightKey = new THREE.DirectionalLight(0xfff1dc, 1.55);
  daylightKey.position.set(-14, 16, 8);
  if (!isSoftwareGl) {
    daylightKey.castShadow = true;
    daylightKey.shadow.mapSize.set(1024, 1024);
    daylightKey.shadow.camera.left = -13;
    daylightKey.shadow.camera.right = 13;
    daylightKey.shadow.camera.top = 11;
    daylightKey.shadow.camera.bottom = -11;
    daylightKey.shadow.bias = -0.0005;
    daylightKey.shadow.normalBias = 0.02;
  }
  scene.add(daylightKey);

  const coolFill = new THREE.DirectionalLight(0x8cb4db, 0.42);
  coolFill.position.set(13, 10, -11);
  scene.add(coolFill);

  // Shared Procedural Textures & Lightweight Pooled PBR Materials
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const floorTex = createWalnutWoodTextures(maxAniso);
  const rugFabricTex = createWovenFabricTexture('#282e39', '#3a4252', maxAniso);
  const warmFabricTex = createWovenFabricTexture('#39312b', '#4d4138', maxAniso);
  const shadowTex = createContactShadowTexture();
  const signTex = createRhymvexSignTexture(maxAniso);
  const whiteboard = createWhiteboardController(maxAniso);

  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c422f,
    roughness: 0.56,
    metalness: 0.06,
  });
  const sharedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x282e38,
    roughness: 0.36,
    metalness: 0.72,
  });
  const sharedChairFabricMat = new THREE.MeshStandardMaterial({
    color: 0x373e4c,
    map: rugFabricTex,
    roughness: 0.88,
  });
  const sharedHumanMats = createSharedHumanMaterials();

  buildFiveRoomArchitecture(
    scene,
    darkWoodMat,
    sharedChairFabricMat,
    sharedSteelMat,
    rugFabricTex,
    warmFabricTex,
    shadowTex,
    floorTex,
    whiteboard.texture,
    signTex
  );

  // 4 Distinct Ergonomic Desks + 4 Realistic Articulated Human Coworkers
  const deskRigs = new Map<BotId, DeskStationRig>();
  const botRigs = new Map<BotId, HumanCoworkerRig>();
  const interactables: THREE.Object3D[] = [];

  for (const bot of BOTS) {
    const desk = buildDeskStation(
      bot.id,
      BOT_DESK_POSITIONS[bot.id],
      bot.accentHex,
      darkWoodMat,
      sharedChairFabricMat,
      sharedSteelMat,
      shadowTex,
      maxAniso
    );
    scene.add(desk.root);
    deskRigs.set(bot.id, desk);
    interactables.push(desk.hitProxy);

    const actor = buildHumanCoworker(bot.id, shadowTex, sharedHumanMats);
    scene.add(actor.root);
    botRigs.set(bot.id, actor);
    interactables.push(actor.hitProxy);
  }

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Mutable Scene State
  let selectedBotId: BotId | null = 'lead-finder';
  let hoveredBotId: BotId | null = null;
  let followBotId: BotId | null = null;

  let botStatuses: Record<BotId, BotJobStatus> = {
    'lead-finder': 'idle',
    'business-strategist': 'idle',
    'project-tracker': 'idle',
    'content-creator': 'idle',
  };

  let botPresence: Record<BotId, BotLivePresence> = {
    'lead-finder': {
      botId: 'lead-finder',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:lead-finder',
      posture: 'seated',
    },
    'business-strategist': {
      botId: 'business-strategist',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:business-strategist',
      posture: 'seated',
    },
    'project-tracker': {
      botId: 'project-tracker',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:project-tracker',
      posture: 'seated',
    },
    'content-creator': {
      botId: 'content-creator',
      activity: 'at-desk',
      room: 'open-work',
      targetNodeId: 'desk:content-creator',
      posture: 'seated',
    },
  };

  // Scripted camera transition state (canceled immediately on manual OrbitControls drag/zoom)
  let cameraGoalTarget: THREE.Vector3 | null = null;
  let cameraGoalZoom: number | null = null;

  // Scratch vectors (zero GC in loop)
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const _projVec = new THREE.Vector3();
  const _panDelta = new THREE.Vector3();
  const _cyan = new THREE.Color(0x22d3ee);
  const _emerald = new THREE.Color(0x34d399);
  const _amber = new THREE.Color(0xeab365);
  const _red = new THREE.Color(0xf87171);
  const _idleScreen = new THREE.Color(0x2d4558);

  let disposed = false;
  let frameId = 0;
  let renderBusy = false;
  let renderDirty = false;
  let elapsed = 0;
  let lastFrameMs = performance.now();
  let lastProjectionEmitMs = 0;

  function clampCameraPan() {
    const cx = THREE.MathUtils.clamp(controls.target.x, -8.5, 8.5);
    const cz = THREE.MathUtils.clamp(controls.target.z, -6.5, 6.5);
    const dx = cx - controls.target.x;
    const dz = cz - controls.target.z;
    if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
      controls.target.x = cx;
      controls.target.z = cz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
  }

  function hasContinuousMotion(): boolean {
    if (cameraGoalTarget || cameraGoalZoom !== null || followBotId) return true;
    for (const bot of BOTS) {
      const rig = botRigs.get(bot.id);
      const presence = botPresence[bot.id];
      const act = presence.activity;
      if (rig && rig.movement.waypoints.length > 0) return true;
      if (
        rig &&
        (rig.posturePhase === 'standing-up' ||
          rig.posturePhase === 'sitting-down' ||
          rig.posturePhase === 'turning-to-chair')
      ) {
        return true;
      }
      const destPosture =
        presence.posture ?? NAV_NODES[presence.targetNodeId]?.posture ?? 'seated';
      const targetSit = act === 'walking' ? 0 : destPosture === 'seated' ? 1 : 0;
      if (rig && Math.abs(rig.sitAmount - targetSit) > 0.01) return true;
      if (
        act === 'walking' ||
        act === 'discussing' ||
        act === 'working' ||
        act === 'checking-notes' ||
        (act === 'waiting' && destPosture === 'standing')
      ) {
        return true;
      }
      if (botStatuses[bot.id] === 'running') return true;
    }
    return false;
  }

  function emitProjections(force = false) {
    const now = performance.now();
    if (!force && now - lastProjectionEmitMs < 85) return;
    lastProjectionEmitMs = now;

    const bots: BotLabelProjection[] = [];
    for (const bot of BOTS) {
      const rig = botRigs.get(bot.id);
      if (!rig) continue;
      // Float compact tag neatly right above human head whether standing or seated
      const labelY = THREE.MathUtils.lerp(1.94, 1.62, rig.sitAmount);
      _projVec.set(rig.root.position.x, labelY, rig.root.position.z).project(camera);
      bots.push({
        botId: bot.id,
        xPct: ((_projVec.x + 1) / 2) * 100,
        yPct: ((-_projVec.y + 1) / 2) * 100,
        isPhysicallyWalking: rig.movement.waypoints.length > 0,
      });
    }

    const rooms: RoomLabelProjection[] = [];
    (
      [
        'open-work',
        'meeting-room',
        'content-studio',
        'reception',
        'kitchen',
        'lounge',
      ] as const
    ).forEach((roomId) => {
      const preset = ROOM_PRESETS[roomId];
      if (!preset.floorMarker) return;
      _projVec
        .set(preset.floorMarker[0], preset.floorMarker[1], preset.floorMarker[2])
        .project(camera);
      rooms.push({
        roomId,
        label: preset.shortLabel,
        xPct: ((_projVec.x + 1) / 2) * 100,
        yPct: ((-_projVec.y + 1) / 2) * 100,
      });
    });

    callbacks.onProjectionsUpdated({ bots, rooms });
  }

  function stepScene(dt: number): boolean {
    elapsed += dt;
    let movedAnything = false;

    // 1. Advance coworkers along walkable paths ONLY once they have stood up (eliminates seated floor sliding!)
    const stepResults = new Map<
      BotId,
      { moved: boolean; arrived: boolean; hasPendingPath: boolean }
    >();
    for (const bot of BOTS) {
      const rig = botRigs.get(bot.id)!;
      const hadPendingPath = rig.movement.waypoints.length > 0;
      if (hadPendingPath && rig.sitAmount <= 0.16) {
        const step = advanceBotAlongPath(rig.movement, dt, 5.4);
        rig.root.position.set(rig.movement.x, 0, rig.movement.z);
        rig.root.rotation.y = rig.movement.facing;
        if (step.moved) movedAnything = true;
        const stillHasPath = rig.movement.waypoints.length > 0;
        if (!stillHasPath) {
          callbacks.onBotArrived?.(bot.id, rig.lastTargetNodeId);
        }
        stepResults.set(bot.id, {
          moved: step.moved,
          arrived: step.arrived,
          hasPendingPath: stillHasPath,
        });
      } else if (!hadPendingPath) {
        // Already at target — smoothly settle facing if no lookAt overrides it
        const step = advanceBotAlongPath(rig.movement, dt, 5.4);
        rig.root.rotation.y = rig.movement.facing;
        if (step.moved) movedAnything = true;
        stepResults.set(bot.id, {
          moved: step.moved,
          arrived: true,
          hasPendingPath: false,
        });
      } else {
        // Still standing up from chair before stepping onto path
        movedAnything = true;
        stepResults.set(bot.id, {
          moved: false,
          arrived: false,
          hasPendingPath: true,
        });
      }
    }

    // 2. Animate human rigs (stand-up -> walk -> turn -> sit -> reach -> role desk work & conversations)
    for (const bot of BOTS) {
      const rig = botRigs.get(bot.id)!;
      const desk = deskRigs.get(bot.id)!;
      const presence = botPresence[bot.id];
      const status = botStatuses[bot.id];
      const activity: BotActivityState = presence.activity;
      const step = stepResults.get(bot.id)!;

      const isWalkingPhysically = step.hasPendingPath && rig.sitAmount <= 0.16;
      const isSelected = selectedBotId === bot.id;
      const isHovered = hoveredBotId === bot.id;

      const ringMat = rig.selectionRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = isSelected ? 0.9 : isHovered ? 0.38 : 0;

      const destPosture =
        presence.posture ?? NAV_NODES[presence.targetNodeId]?.posture ?? 'seated';
      const wantsSeated = destPosture === 'seated';
      const isActiveSpeaker = Boolean(presence.speech && activity === 'discussing');

      let lookAtWorldPos: { x: number; z: number } | null = null;
      if (presence.lookAtBotId && presence.lookAtBotId !== bot.id) {
        const speakerRig = botRigs.get(presence.lookAtBotId);
        if (speakerRig) {
          lookAtWorldPos = {
            x: speakerRig.movement.x,
            z: speakerRig.movement.z,
          };
        }
      }

      // If logical presence still says 'walking' after rig physically arrived at destination,
      // render calm seated/standing posture instead of marching in place!
      const effectiveActivity: BotActivityState =
        activity === 'walking' && !step.hasPendingPath
          ? wantsSeated
            ? 'at-desk'
            : 'waiting'
          : status === 'running' && activity === 'at-desk'
            ? 'working'
            : activity;

      const animated = animateHumanCoworker(rig, {
        activity: effectiveActivity,
        deskWorkMode: presence.deskWorkMode,
        isWalkingPhysically,
        hasPendingPath: step.hasPendingPath,
        wantsSeated,
        isActiveSpeaker,
        lookAtWorldPos,
        elapsed,
        dt,
      });
      if (animated) movedAnything = true;

      // Desk monitor & warm task lamp response
      if (effectiveActivity === 'working' || status === 'running') {
        desk.screenMat.emissive.copy(_cyan);
        desk.screenMat.emissiveIntensity = 0.82 + Math.sin(elapsed * 6.5) * 0.22;
        desk.lampLight.intensity = 1.9;
      } else if (effectiveActivity === 'waiting') {
        desk.screenMat.emissive.copy(_amber);
        desk.screenMat.emissiveIntensity = 0.65;
        desk.lampLight.intensity = 1.75;
      } else if (status === 'ready') {
        desk.screenMat.emissive.copy(isSelected ? _cyan : _emerald);
        desk.screenMat.emissiveIntensity = 0.66;
        desk.lampLight.intensity = isSelected ? 1.85 : 1.5;
      } else if (status === 'failed') {
        desk.screenMat.emissive.copy(_red);
        desk.screenMat.emissiveIntensity = 0.65;
        desk.lampLight.intensity = 1.5;
      } else {
        desk.screenMat.emissive.copy(isSelected ? _cyan : _idleScreen);
        desk.screenMat.emissiveIntensity = isSelected ? 0.66 : 0.45;
        desk.lampLight.intensity = isSelected ? 1.85 : 1.48;
      }
    }

    // 2. Smooth Follow-Bot or Room-Focus Camera Gliding
    if (followBotId) {
      const rig = botRigs.get(followBotId);
      if (rig) {
        const nextX = THREE.MathUtils.damp(
          controls.target.x,
          rig.root.position.x,
          6.5,
          dt
        );
        const nextZ = THREE.MathUtils.damp(
          controls.target.z,
          rig.root.position.z,
          6.5,
          dt
        );
        _panDelta.set(nextX - controls.target.x, 0, nextZ - controls.target.z);
        controls.target.add(_panDelta);
        camera.position.add(_panDelta);
        const targetZoom = 1.9;
        if (Math.abs(camera.zoom - targetZoom) > 0.01) {
          camera.zoom = THREE.MathUtils.damp(camera.zoom, targetZoom, 6, dt);
          camera.updateProjectionMatrix();
        }
        if (_panDelta.lengthSq() > 0.00001) movedAnything = true;
      }
    } else if (cameraGoalTarget || cameraGoalZoom !== null) {
      let settled = true;
      if (cameraGoalTarget) {
        const nx = THREE.MathUtils.damp(
          controls.target.x,
          cameraGoalTarget.x,
          7.5,
          dt
        );
        const ny = THREE.MathUtils.damp(
          controls.target.y,
          cameraGoalTarget.y,
          7.5,
          dt
        );
        const nz = THREE.MathUtils.damp(
          controls.target.z,
          cameraGoalTarget.z,
          7.5,
          dt
        );
        _panDelta.set(
          nx - controls.target.x,
          ny - controls.target.y,
          nz - controls.target.z
        );
        controls.target.add(_panDelta);
        camera.position.add(_panDelta);
        if (controls.target.distanceTo(cameraGoalTarget) > 0.03) {
          settled = false;
          movedAnything = true;
        } else {
          _panDelta.copy(cameraGoalTarget).sub(controls.target);
          controls.target.copy(cameraGoalTarget);
          camera.position.add(_panDelta);
          cameraGoalTarget = null;
        }
      }
      if (cameraGoalZoom !== null) {
        camera.zoom = THREE.MathUtils.damp(camera.zoom, cameraGoalZoom, 7.5, dt);
        camera.updateProjectionMatrix();
        if (Math.abs(camera.zoom - cameraGoalZoom) > 0.01) {
          settled = false;
          movedAnything = true;
        } else {
          camera.zoom = cameraGoalZoom;
          camera.updateProjectionMatrix();
          cameraGoalZoom = null;
        }
      }
      if (settled) movedAnything = true;
    }

    clampCameraPan();
    controls.update();
    return movedAnything;
  }

  function afterDraw(cb: () => void) {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 45);
        }
      };
      frameId = window.setTimeout(poll, 6);
    } else {
      frameId = window.setTimeout(cb, 45);
    }
  }

  function requestRender(forceProjection = false) {
    if (disposed) return;
    if (renderBusy) {
      renderDirty = true;
      return;
    }
    renderBusy = true;
    frameId = window.requestAnimationFrame(() => {
      if (disposed) return;
      renderDirty = false;
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.25);
      lastFrameMs = nowMs;

      const moved = stepScene(dt);
      renderer.render(scene, camera);
      if (moved || forceProjection) {
        emitProjections(forceProjection);
      }

      const done = () => {
        if (disposed) return;
        renderBusy = false;
        if (renderDirty || hasContinuousMotion()) {
          requestRender(false);
        }
      };

      if (isSoftwareGl) afterDraw(done);
      else done();
    });
  }

  // Cancel scripted camera flights whenever the user manually pans or zooms
  controls.addEventListener('start', () => {
    if (cameraGoalTarget || cameraGoalZoom !== null || followBotId) {
      cameraGoalTarget = null;
      cameraGoalZoom = null;
      followBotId = null;
      callbacks.onUserCameraMove?.();
    }
  });
  controls.addEventListener('change', () => {
    clampCameraPan();
    emitProjections(false);
    requestRender(false);
  });

  function resize() {
    if (disposed) return;
    const w = Math.max(container.clientWidth, 280);
    const h = Math.max(container.clientHeight, 240);
    const a = w / h;
    baseFrustum = getBaseFrustum(a);
    camera.left = (-baseFrustum * a) / 2;
    camera.right = (baseFrustum * a) / 2;
    camera.top = baseFrustum / 2;
    camera.bottom = -baseFrustum / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    emitProjections(true);
    requestRender(true);
  }

  // Click vs. Pan drag differentiation so panning never accidentally clicks a desk
  let pointerDownPos = { x: 0, y: 0 };
  let lastHoverMs = 0;

  function pickBotFromPointer(clientX: number, clientY: number): BotId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(interactables, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.botId as BotId) || null;
    }
    return null;
  }

  const handlePointerDown = (e: PointerEvent) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - lastHoverMs < 55) return;
    lastHoverMs = now;
    const hit = pickBotFromPointer(e.clientX, e.clientY);
    if (hit !== hoveredBotId) {
      hoveredBotId = hit;
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      requestRender(false);
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const dist = Math.hypot(
      e.clientX - pointerDownPos.x,
      e.clientY - pointerDownPos.y
    );
    if (dist > 6) return; // Ignore pan drags
    const hit = pickBotFromPointer(e.clientX, e.clientY);
    if (hit) callbacks.onSelectBot(hit);
  };

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    callbacks.onContextLost();
  };

  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);

  emitProjections(true);
  requestRender(true);

  return {
    setSelectedBot(botId) {
      selectedBotId = botId;
      requestRender(false);
    },
    setBotStatuses(nextStatuses) {
      botStatuses = { ...nextStatuses };
      lastFrameMs = performance.now();
      requestRender(false);
    },
    setBotPresence(nextPresence) {
      botPresence = { ...nextPresence };
      for (const bot of BOTS) {
        const rig = botRigs.get(bot.id);
        const desk = deskRigs.get(bot.id);
        const p = nextPresence[bot.id];
        if (!rig || !p) continue;
        if (desk) {
          const title = p.screenTitle || '';
          const lines = p.screenLines || [];
          const mode = p.deskWorkMode || 'idle';
          const isWorking = p.activity === 'working';
          const isWaiting = p.activity === 'waiting';
          const sig = `${title}|${mode}|${isWorking ? 1 : 0}|${isWaiting ? 1 : 0}|${lines.map((l) => `${l.text}:${l.tone || ''}`).join(';')}`;
          if (sig !== desk.lastDisplaySig) {
            desk.lastDisplaySig = sig;
            desk.display.draw({ title, lines, mode, isWorking, isWaiting });
          }
        }
        if (p.targetNodeId && p.targetNodeId !== rig.lastTargetNodeId) {
          rig.lastTargetNodeId = p.targetNodeId;
          const startNodeId = findNearestNavNode({
            x: rig.movement.x,
            z: rig.movement.z,
          });
          const path = findNavigationPath(startNodeId, p.targetNodeId);
          // Skip redundant first node if already standing right on it
          if (
            path.length > 1 &&
            Math.hypot(path[0].x - rig.movement.x, path[0].z - rig.movement.z) <
              0.35
          ) {
            path.shift();
          }
          rig.movement.waypoints = path;
          const destNode = NAV_NODES[p.targetNodeId];
          if (destNode?.facing !== undefined) {
            rig.movement.targetFacing = destNode.facing;
          }
        }
      }
      lastFrameMs = performance.now();
      requestRender(true);
    },
    setWhiteboardContent(lines, isActiveMeeting) {
      whiteboard.draw(lines, isActiveMeeting);
      requestRender(false);
    },
    focusRoom(roomId) {
      const preset = ROOM_PRESETS[roomId] || ROOM_PRESETS.overview;
      followBotId = null;
      cameraGoalTarget = new THREE.Vector3(...preset.target);
      cameraGoalZoom = preset.zoom;
      lastFrameMs = performance.now();
      requestRender(true);
    },
    setFollowBot(botId) {
      followBotId = botId;
      cameraGoalTarget = null;
      cameraGoalZoom = null;
      lastFrameMs = performance.now();
      requestRender(true);
    },
    zoomBy(factor) {
      cameraGoalZoom = THREE.MathUtils.clamp(
        (cameraGoalZoom ?? camera.zoom) * factor,
        controls.minZoom,
        controls.maxZoom
      );
      lastFrameMs = performance.now();
      requestRender(true);
    },
    resetView() {
      followBotId = null;
      cameraGoalTarget = new THREE.Vector3(...ROOM_PRESETS.overview.target);
      cameraGoalZoom = ROOM_PRESETS.overview.zoom;
      lastFrameMs = performance.now();
      requestRender(true);
    },
    resize,
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      deskRigs.forEach((d) => d.display.texture.dispose());
      floorTex.map.dispose();
      floorTex.bumpMap.dispose();
      rugFabricTex.dispose();
      warmFabricTex.dispose();
      shadowTex.dispose();
      signTex.dispose();
      whiteboard.texture.dispose();
      sharedHumanMats.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
