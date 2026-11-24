import * as THREE from 'three';
import type { BotActivityState, BotId, DeskWorkMode } from '../types/workspace';
import { BOT_DESK_SEAT_POSE } from './officeLayout';
import { shortestAngleDelta, type BotMovementState } from './navigation';

export type HumanPosturePhase =
  | 'standing'
  | 'turning-to-chair'
  | 'sitting-down'
  | 'seated'
  | 'standing-up';

export interface HumanCoworkerRig {
  botId: BotId;
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  notebookProp: THREE.Mesh;
  coffeeMugProp: THREE.Group;
  selectionRing: THREE.Mesh;
  hitProxy: THREE.Mesh;
  movement: BotMovementState;
  lastTargetNodeId: string;
  /** Smoothly interpolated posture weight: 0 = standing, 1 = seated. */
  sitAmount: number;
  /** Smoothly interpolated hand reach to keyboard/desk: 0 = rest/lap, 1 = desk work. */
  reachAmount: number;
  /** Gentle push-back offset (meters along local -Z) when sitting down or standing up. */
  chairPushOffset: number;
  /** High-level blended posture state used by the scene to avoid seated floor sliding. */
  posturePhase: HumanPosturePhase;
  /** Smoothly interpolated walk phase so stride never snaps on stop/start. */
  walkPhase: number;
  /** Scale factor stored so exact standing/seated floor grounding holds for every coworker. */
  heightScale: number;
}

export interface SharedHumanMaterials {
  eyeMat: THREE.MeshStandardMaterial;
  scleraMat: THREE.MeshStandardMaterial;
  soleMat: THREE.MeshStandardMaterial;
  glassesMat: THREE.MeshStandardMaterial;
  beltMat: THREE.MeshStandardMaterial;
  notebookPaperMat: THREE.MeshStandardMaterial;
  notebookCoverMat: THREE.MeshStandardMaterial;
  coffeeMugMat: THREE.MeshStandardMaterial;
  coffeeLiquidMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createSharedHumanMaterials(): SharedHumanMaterials {
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    roughness: 0.32,
  });
  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    roughness: 0.45,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0x1e2025,
    roughness: 0.85,
  });
  const glassesMat = new THREE.MeshStandardMaterial({
    color: 0x262b35,
    roughness: 0.28,
    metalness: 0.78,
  });
  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x2d231c,
    roughness: 0.55,
    metalness: 0.12,
  });
  const notebookPaperMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe6,
    roughness: 0.86,
  });
  const notebookCoverMat = new THREE.MeshStandardMaterial({
    color: 0x384352,
    roughness: 0.78,
  });
  const coffeeMugMat = new THREE.MeshStandardMaterial({
    color: 0xf4ece0,
    roughness: 0.32,
    metalness: 0.04,
  });
  const coffeeLiquidMat = new THREE.MeshStandardMaterial({
    color: 0x3b2214,
    roughness: 0.18,
    metalness: 0.08,
  });

  return {
    eyeMat,
    scleraMat,
    soleMat,
    glassesMat,
    beltMat,
    notebookPaperMat,
    notebookCoverMat,
    coffeeMugMat,
    coffeeLiquidMat,
    dispose() {
      eyeMat.dispose();
      scleraMat.dispose();
      soleMat.dispose();
      glassesMat.dispose();
      beltMat.dispose();
      notebookPaperMat.dispose();
      notebookCoverMat.dispose();
      coffeeMugMat.dispose();
      coffeeLiquidMat.dispose();
    },
  };
}

interface CoworkerAppearance {
  skin: number;
  top: number;
  undershirt: number;
  pants: number;
  shoes: number;
  hair: number;
  brow: number;
  hairStyle: 'wavy-crop' | 'bob-glasses' | 'taper-fade' | 'low-bun';
  shoulderWidth: number;
  chestWidth: number;
  waistWidth: number;
  heightScale: number;
  longSleeves: boolean;
  hasOpenJacket: boolean;
}

const APPEARANCE_BY_ROLE: Record<BotId, CoworkerAppearance> = {
  'lead-finder': {
    skin: 0xd09572,
    top: 0x3b6385, // Muted slate-indigo knit crewneck
    undershirt: 0xefe9dd,
    pants: 0x2b313c, // Charcoal chinos
    shoes: 0x7d5d43, // Tan suede derby
    hair: 0x3b2619,
    brow: 0x2c1b12,
    hairStyle: 'wavy-crop',
    shoulderWidth: 0.43,
    chestWidth: 0.34,
    waistWidth: 0.29,
    heightScale: 0.99,
    longSleeves: true,
    hasOpenJacket: false,
  },
  'business-strategist': {
    skin: 0xdfb18f,
    top: 0x9c6e44, // Warm camel tailored blazer (Team Lead)
    undershirt: 0xf2ece0, // Cream knit mock-neck
    pants: 0x222936, // Navy tailored trousers
    shoes: 0x2a221d, // Dark espresso loafers
    hair: 0x1e1816,
    brow: 0x1a1412,
    hairStyle: 'bob-glasses',
    shoulderWidth: 0.41,
    chestWidth: 0.32,
    waistWidth: 0.27,
    heightScale: 1.0,
    longSleeves: true,
    hasOpenJacket: true,
  },
  'project-tracker': {
    skin: 0x7c4b32,
    top: 0x456654, // Sage-pine cotton overshirt
    undershirt: 0xe6e0d4, // Warm stone tee
    pants: 0x262e3a, // Slate trousers
    shoes: 0xd8d1c5, // Off-white minimal sneakers
    hair: 0x181616,
    brow: 0x141212,
    hairStyle: 'taper-fade',
    shoulderWidth: 0.46,
    chestWidth: 0.37,
    waistWidth: 0.32,
    heightScale: 1.03,
    longSleeves: false,
    hasOpenJacket: true,
  },
  'content-creator': {
    skin: 0xe8bfa4,
    top: 0x874e60, // Dusty plum-terracotta cardigan
    undershirt: 0xf4eee3, // Ivory linen blouse
    pants: 0x2a2f39, // Soft graphite trousers
    shoes: 0x42322b, // Walnut ankle boots
    hair: 0x5c3623,
    brow: 0x47281a,
    hairStyle: 'low-bun',
    shoulderWidth: 0.39,
    chestWidth: 0.3,
    waistWidth: 0.26,
    heightScale: 0.96,
    longSleeves: false,
    hasOpenJacket: true,
  },
};

// Exact unscaled leg lengths (meters):
// thigh pivot -> knee pivot = 0.40m
// knee pivot -> shoe sole bottom = 0.48m (calf 0.40m + ankle/shoe sole 0.08m)
const THIGH_LEN = 0.4;
const KNEE_TO_SOLE = 0.48;
const STANDING_HIP_BASE = THIGH_LEN + KNEE_TO_SOLE; // 0.88m
const SEATED_HIP_BASE = KNEE_TO_SOLE; // 0.48m (feet sit flush at y = 0.00m while thighs rest at ~0.48m on 0.46m chair seat)

/**
 * Builds a realistic, natural-proportion low-poly human coworker with articulated hips,
 * thighs, knees, shoulders, elbows, sculpted head/hair/face, and grounded footwear.
 * Bottom-center pivoted at y = 0 so both standing AND seated shoes rest flush on y = 0.00m.
 */
export function buildHumanCoworker(
  botId: BotId,
  shadowTex: THREE.CanvasTexture,
  shared?: SharedHumanMaterials
): HumanCoworkerRig {
  const cfg = APPEARANCE_BY_ROLE[botId];
  const seatPose = BOT_DESK_SEAT_POSE[botId];
  const mats = shared ?? createSharedHumanMaterials();

  const root = new THREE.Group();
  root.position.set(seatPose.x, 0, seatPose.z);
  root.rotation.y = seatPose.facing;

  // Soft ground contact shadow beneath shoes/chair
  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.84),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.024;
  root.add(shadowDisc);

  // Restrained cyan floor selection ring
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.47, 32),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.028;
  root.add(selectionRing);

  // Per-coworker matte fabric, soft skin, natural hair, and footwear materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: cfg.skin,
    roughness: 0.66,
    metalness: 0.02,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: cfg.top,
    roughness: 0.88,
    metalness: 0.02,
  });
  const underMat = new THREE.MeshStandardMaterial({
    color: cfg.undershirt,
    roughness: 0.9,
    metalness: 0.01,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: cfg.pants,
    roughness: 0.9,
    metalness: 0.02,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: cfg.shoes,
    roughness: 0.54,
    metalness: 0.06,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: cfg.hair,
    roughness: 0.64,
    metalness: 0.04,
  });
  const browMat = new THREE.MeshStandardMaterial({
    color: cfg.brow,
    roughness: 0.72,
  });

  // Character scale root anchored at hips (starts seated smoothly at y = SEATED_HIP_BASE * heightScale)
  const hips = new THREE.Group();
  hips.position.y = SEATED_HIP_BASE * cfg.heightScale;
  hips.scale.setScalar(cfg.heightScale);
  root.add(hips);

  // Rounded pelvis & belt (replaces boxy hip block)
  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(
      cfg.waistWidth * 0.5,
      cfg.waistWidth * 0.54,
      0.14,
      12
    ),
    pantsMat
  );
  pelvis.scale.set(1.06, 1, 0.74);
  pelvis.position.y = 0.01;
  pelvis.castShadow = true;
  hips.add(pelvis);

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(
      cfg.waistWidth * 0.515,
      cfg.waistWidth * 0.515,
      0.032,
      12
    ),
    mats.beltMat
  );
  belt.scale.set(1.07, 1, 0.76);
  belt.position.y = 0.068;
  hips.add(belt);

  // Articulated realistic two-segment leg (thigh -> knee joint -> calf -> sculpted shoe with sole)
  const buildLeg = (sideX: number) => {
    const thigh = new THREE.Group();
    thigh.position.set(sideX, 0, 0);
    hips.add(thigh);

    // Rounded hip cap so seated thigh bends cleanly without gaps
    const hipCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), pantsMat);
    thigh.add(hipCap);

    const upperMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.056, THIGH_LEN, 10),
      pantsMat
    );
    upperMesh.position.y = -THIGH_LEN / 2;
    upperMesh.castShadow = true;
    thigh.add(upperMesh);

    const knee = new THREE.Group();
    knee.position.set(0, -THIGH_LEN, 0);
    thigh.add(knee);

    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), pantsMat);
    knee.add(kneeCap);

    const calfLen = 0.39;
    const calfMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.042, calfLen, 10),
      pantsMat
    );
    calfMesh.position.y = -calfLen / 2;
    calfMesh.castShadow = true;
    knee.add(calfMesh);

    // Subtle ankle transition
    const ankle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.036, 0.04, 8),
      skinMat
    );
    ankle.position.y = -0.405;
    knee.add(ankle);

    // Sculpted office shoe: rounded upper + flat sole resting precisely at y = -KNEE_TO_SOLE (-0.48m)
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(0, -KNEE_TO_SOLE, 0.035);
    knee.add(shoeGroup);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.02, 0.21),
      mats.soleMat
    );
    sole.position.set(0, 0.01, 0.015);
    shoeGroup.add(sole);

    const shoeUpper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.044, 0.11, 4, 8),
      shoeMat
    );
    shoeUpper.rotation.x = Math.PI / 2;
    shoeUpper.scale.set(1.05, 1.0, 0.72);
    shoeUpper.position.set(0, 0.044, 0.015);
    shoeUpper.castShadow = true;
    shoeGroup.add(shoeUpper);

    const heel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.046, 0.06, 8),
      shoeMat
    );
    heel.position.set(0, 0.045, -0.045);
    shoeGroup.add(heel);

    return { thigh, knee };
  };

  const hipOffset = cfg.waistWidth * 0.29;
  const leftLeg = buildLeg(-hipOffset);
  const rightLeg = buildLeg(hipOffset);

  // Articulated Torso (pivots at waist y = 0.075m)
  const torso = new THREE.Group();
  torso.position.y = 0.075;
  hips.add(torso);

  // Sculpted natural tapered torso (wider chest, gentler waist, organic oval depth)
  const coreTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(
      cfg.chestWidth * 0.54,
      cfg.waistWidth * 0.49,
      0.42,
      12
    ),
    cfg.hasOpenJacket ? underMat : topMat
  );
  coreTorso.scale.set(1.04, 1, 0.68);
  coreTorso.position.y = 0.21;
  coreTorso.castShadow = true;
  torso.add(coreTorso);

  // Rounded shoulder yoke
  const shoulderYoke = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, cfg.shoulderWidth - 0.14, 4, 10),
    topMat
  );
  shoulderYoke.rotation.z = Math.PI / 2;
  shoulderYoke.scale.set(1, 1, 1.15);
  shoulderYoke.position.set(0, 0.39, -0.005);
  shoulderYoke.castShadow = true;
  torso.add(shoulderYoke);

  if (cfg.hasOpenJacket) {
    // Open blazer / overshirt / cardigan panels over undershirt
    const backPanel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        cfg.chestWidth * 0.56,
        cfg.waistWidth * 0.52,
        0.43,
        12,
        1,
        false,
        Math.PI * 0.6,
        Math.PI * 0.8
      ),
      topMat
    );
    backPanel.scale.set(1.06, 1, 0.72);
    backPanel.position.set(0, 0.215, -0.004);
    backPanel.castShadow = true;
    torso.add(backPanel);

    [-1, 1].forEach((side) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.chestWidth * 0.32, 0.42, 0.16),
        topMat
      );
      panel.position.set(side * cfg.chestWidth * 0.34, 0.21, 0.008);
      panel.castShadow = true;
      torso.add(panel);

      // Subtle collar lapel
      const lapel = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.2, 0.025),
        topMat
      );
      lapel.position.set(side * 0.068, 0.32, 0.105);
      lapel.rotation.z = side * -0.18;
      torso.add(lapel);
    });
  } else {
    // Knit crewneck collar trim
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.074, 0.018, 6, 14),
      underMat
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.435, 0.006);
    torso.add(collar);
  }

  // Articulated Two-Segment Arms (shoulder -> upper arm -> elbow -> forearm -> sculpted hand)
  const buildArm = (sideX: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 0.39, 0);
    torso.add(shoulder);

    const shoulderCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 10, 8),
      topMat
    );
    shoulder.add(shoulderCap);

    const upperLen = 0.26;
    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.044, upperLen, 10),
      topMat
    );
    upperArm.position.y = -upperLen / 2;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const forearm = new THREE.Group();
    forearm.position.set(0, -upperLen, 0);
    shoulder.add(forearm);

    const elbowCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.043, 8, 8),
      cfg.longSleeves ? topMat : skinMat
    );
    forearm.add(elbowCap);

    const foreLen = 0.23;
    const lowerArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.032, foreLen, 10),
      cfg.longSleeves ? topMat : skinMat
    );
    lowerArm.position.y = -foreLen / 2;
    lowerArm.castShadow = true;
    forearm.add(lowerArm);

    // Cuff detail on long sleeves
    if (cfg.longSleeves) {
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.037, 0.035, 0.032, 8),
        underMat
      );
      cuff.position.y = -foreLen + 0.01;
      forearm.add(cuff);
    }

    // Natural rounded hand silhouette
    const hand = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.028, 0.045, 4, 8),
      skinMat
    );
    hand.scale.set(1.05, 1.0, 0.65);
    hand.position.set(0, -foreLen - 0.038, 0.008);
    forearm.add(hand);

    return { shoulder, forearm };
  };

  const armOffset = cfg.shoulderWidth / 2 + 0.015;
  const leftArm = buildArm(-armOffset);
  const rightArm = buildArm(armOffset);

  // Slim notebook prop held in left hand during review / whiteboard checks
  const notebookProp = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.018, 0.2),
    mats.notebookPaperMat
  );
  notebookProp.position.set(0.025, -0.265, 0.085);
  notebookProp.visible = false;
  const nbCover = new THREE.Mesh(
    new THREE.BoxGeometry(0.156, 0.008, 0.206),
    mats.notebookCoverMat
  );
  nbCover.position.y = -0.011;
  notebookProp.add(nbCover);
  leftArm.forearm.add(notebookProp);

  // Ceramic coffee mug prop held in right hand during Kitchen Coffee Breaks
  const coffeeMugProp = new THREE.Group();
  coffeeMugProp.position.set(-0.015, -0.265, 0.055);
  coffeeMugProp.rotation.x = Math.PI / 2;
  coffeeMugProp.visible = false;

  const mugCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.036, 0.092, 12),
    mats.coffeeMugMat
  );
  mugCup.castShadow = true;
  coffeeMugProp.add(mugCup);

  const mugCoffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.036, 10),
    mats.coffeeLiquidMat
  );
  mugCoffee.rotation.x = -Math.PI / 2;
  mugCoffee.position.y = 0.042;
  coffeeMugProp.add(mugCoffee);

  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.024, 0.007, 6, 12, Math.PI * 1.25),
    mats.coffeeMugMat
  );
  mugHandle.position.set(0.042, 0, 0);
  mugHandle.rotation.z = -Math.PI * 0.62;
  coffeeMugProp.add(mugHandle);

  rightArm.forearm.add(coffeeMugProp);

  // Neck + Sculpted Natural Head + Facial Features + Distinct Hairstyles
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.056, 0.09, 10),
    skinMat
  );
  neck.position.y = 0.465;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.61, 0.008);
  torso.add(head);

  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 14, 12),
    skinMat
  );
  cranium.scale.set(0.92, 1.08, 0.96);
  cranium.castShadow = true;
  head.add(cranium);

  // Subtle sculpted ears & nose for readable head orientation from isometric view
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), skinMat);
    ear.scale.set(0.55, 1.25, 0.85);
    ear.position.set(side * 0.12, -0.005, -0.005);
    head.add(ear);
  });

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.016, 0.036, 6),
    skinMat
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.012, 0.132);
  head.add(nose);

  // Expressive eyes & eyebrows
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 8, 6),
      mats.eyeMat
    );
    eye.position.set(side * 0.044, 0.014, 0.118);
    head.add(eye);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, 0.009, 0.012),
      browMat
    );
    brow.position.set(side * 0.044, 0.042, 0.118);
    brow.rotation.z = side * -0.06;
    head.add(brow);
  });

  // Sculpted organic hairstyles (no blocky cube helmets)
  if (cfg.hairStyle === 'wavy-crop') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    dome.scale.set(0.95, 1.06, 1.0);
    dome.position.set(0, 0.014, -0.006);
    dome.castShadow = true;
    head.add(dome);

    const frontSweep = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.034, 0.11, 4, 8),
      hairMat
    );
    frontSweep.rotation.z = Math.PI / 2 - 0.18;
    frontSweep.position.set(0.01, 0.118, 0.055);
    frontSweep.castShadow = true;
    head.add(frontSweep);

    const nape = new THREE.Mesh(
      new THREE.SphereGeometry(0.118, 10, 8),
      hairMat
    );
    nape.scale.set(0.94, 0.92, 0.55);
    nape.position.set(0, -0.015, -0.072);
    head.add(nape);
  } else if (cfg.hairStyle === 'bob-glasses') {
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.142, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    crown.scale.set(0.98, 1.06, 1.02);
    crown.position.set(0, 0.016, -0.008);
    crown.castShadow = true;
    head.add(crown);

    // Swept shoulder-length bob sides + rounded back drape
    [-1, 1].forEach((side) => {
      const sideLock = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.044, 0.16, 4, 8),
        hairMat
      );
      sideLock.scale.set(0.85, 1, 1.15);
      sideLock.position.set(side * 0.116, -0.035, -0.015);
      sideLock.rotation.z = side * 0.08;
      head.add(sideLock);
    });

    const backDrape = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.092, 0.12, 4, 10),
      hairMat
    );
    backDrape.scale.set(1.25, 1.0, 0.6);
    backDrape.position.set(0, -0.045, -0.09);
    head.add(backDrape);

    // Thin metal spectacles for Team Lead / Business Strategist
    [-1, 1].forEach((side) => {
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(0.033, 0.0055, 6, 16),
        mats.glassesMat
      );
      frame.position.set(side * 0.045, 0.014, 0.13);
      head.add(frame);
    });
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.006, 0.006),
      mats.glassesMat
    );
    bridge.position.set(0, 0.016, 0.13);
    head.add(bridge);
  } else if (cfg.hairStyle === 'taper-fade') {
    const topCrop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.118, 0.075, 12),
      hairMat
    );
    topCrop.scale.set(0.95, 1, 1.02);
    topCrop.position.set(0, 0.125, -0.005);
    topCrop.castShadow = true;
    head.add(topCrop);

    const upperWrap = new THREE.Mesh(
      new THREE.SphereGeometry(0.134, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
      hairMat
    );
    upperWrap.scale.set(0.93, 1.05, 0.97);
    upperWrap.position.set(0, 0.018, -0.004);
    head.add(upperWrap);
  } else {
    // Swept crown + textured high bun for Content Creator
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat
    );
    crown.scale.set(0.95, 1.06, 1.0);
    crown.position.set(0, 0.016, -0.006);
    crown.castShadow = true;
    head.add(crown);

    const backSweep = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 10, 8),
      hairMat
    );
    backSweep.scale.set(0.96, 0.95, 0.58);
    backSweep.position.set(0, -0.015, -0.074);
    head.add(backSweep);

    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.072, 10, 8),
      hairMat
    );
    bun.scale.set(1.05, 0.92, 0.95);
    bun.position.set(0, 0.108, -0.132);
    bun.castShadow = true;
    head.add(bun);
  }

  // Invisible raycast hit proxy for reliable clicking/tapping
  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.72, 0.76),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.position.y = 0.86;
  hitProxy.userData.botId = botId;
  root.add(hitProxy);

  return {
    botId,
    root,
    hips,
    torso,
    head,
    thighL: leftLeg.thigh,
    thighR: rightLeg.thigh,
    kneeL: leftLeg.knee,
    kneeR: rightLeg.knee,
    armL: leftArm.shoulder,
    armR: rightArm.shoulder,
    forearmL: leftArm.forearm,
    forearmR: rightArm.forearm,
    notebookProp,
    coffeeMugProp,
    selectionRing,
    hitProxy,
    movement: {
      x: seatPose.x,
      z: seatPose.z,
      facing: seatPose.facing,
      waypoints: [],
      targetFacing: seatPose.facing,
    },
    lastTargetNodeId: seatPose.nodeId,
    sitAmount: 1,
    reachAmount: 0.65,
    chairPushOffset: 0,
    posturePhase: 'seated',
    walkPhase: 0,
    heightScale: cfg.heightScale,
  };
}

export interface AnimateHumanOptions {
  activity: BotActivityState;
  deskWorkMode?: DeskWorkMode;
  isWalkingPhysically: boolean;
  hasPendingPath: boolean;
  wantsSeated: boolean;
  isActiveSpeaker: boolean;
  lookAtWorldPos?: { x: number; z: number } | null;
  elapsed: number;
  dt: number;
}

/**
 * Smoothly animates a human coworker across complete, blended sequences:
 * - Standing up from chair: lower hands -> push back slightly -> stand -> turn -> walk
 * - Sitting down at desk: arrive -> turn toward monitor -> ease into chair -> reach for keyboard
 * - Recognizable role desk work:
 *   * Lead Finder: scroll source -> pause to verify -> enter verified lead
 *   * Content Creator: typing bursts -> lean back & reread paragraph -> edit
 *   * Project Tracker: check project board -> click status update -> move to next item
 *   * Team Lead: inspect submission with notebook -> nod/mark correction or approve -> handoff
 * - Conversations: face partner, speaker gestures occasionally, listener nods/takes notes
 * - Waiting in queue: relaxed standing posture facing colleague, ready to step forward
 */
export function animateHumanCoworker(
  rig: HumanCoworkerRig,
  opts: AnimateHumanOptions
): boolean {
  const {
    activity,
    deskWorkMode = 'idle',
    isWalkingPhysically,
    hasPendingPath,
    wantsSeated,
    isActiveSpeaker,
    lookAtWorldPos,
    elapsed,
    dt,
  } = opts;

  let animated = false;

  // 1. Blended sit <-> stand state machine (prevents snapping & prevents floor sliding while seated)
  const needsToStand = isWalkingPhysically || hasPendingPath || !wantsSeated;
  const targetSit = needsToStand ? 0 : 1;

  // Check if facing target before sitting down smoothly
  let facingDelta = 0;
  if (!isWalkingPhysically && !hasPendingPath && rig.movement.targetFacing !== undefined) {
    facingDelta = shortestAngleDelta(rig.movement.facing, rig.movement.targetFacing);
  }

  const prevSit = rig.sitAmount;
  if (targetSit === 1 && Math.abs(facingDelta) > 0.25 && rig.sitAmount < 0.15) {
    // Finish turning toward the monitor before sitting down
    rig.posturePhase = 'turning-to-chair';
    rig.movement.facing +=
      Math.sign(facingDelta) * Math.min(Math.abs(facingDelta), dt * 7.2);
    rig.root.rotation.y = rig.movement.facing;
    animated = true;
  } else {
    rig.sitAmount = THREE.MathUtils.damp(rig.sitAmount, targetSit, 7.2, dt);
    if (Math.abs(rig.sitAmount - targetSit) < 0.006) {
      rig.sitAmount = targetSit;
    }
    if (Math.abs(rig.sitAmount - prevSit) > 0.001) animated = true;

    if (rig.sitAmount >= 0.96) {
      rig.posturePhase = 'seated';
    } else if (rig.sitAmount <= 0.04) {
      rig.posturePhase = 'standing';
    } else {
      rig.posturePhase = targetSit === 1 ? 'sitting-down' : 'standing-up';
    }
  }

  // Gentle push-back arc (-0.11m along local -Z) midway through sitting down or standing up
  const midTransition = Math.sin(rig.sitAmount * Math.PI);
  const targetPush =
    rig.posturePhase === 'sitting-down' || rig.posturePhase === 'standing-up'
      ? -0.11 * midTransition
      : 0;
  rig.chairPushOffset = THREE.MathUtils.damp(rig.chairPushOffset, targetPush, 9.5, dt);
  rig.hips.position.z = rig.chairPushOffset;

  // Reach hands toward desk keyboard only after seated (prevents hands clipping desk while sitting/standing)
  const wantsDeskReach =
    rig.sitAmount > 0.78 &&
    !isWalkingPhysically &&
    !hasPendingPath &&
    (activity === 'working' || activity === 'at-desk' || activity === 'waiting');
  rig.reachAmount = THREE.MathUtils.damp(
    rig.reachAmount,
    wantsDeskReach ? 1 : 0,
    8.0,
    dt
  );

  // 2. Smoothly turn toward conversation partner or queued colleague when stationary
  if (!isWalkingPhysically && !hasPendingPath && lookAtWorldPos) {
    const dx = lookAtWorldPos.x - rig.movement.x;
    const dz = lookAtWorldPos.z - rig.movement.z;
    if (Math.hypot(dx, dz) > 0.15) {
      const desired = Math.atan2(dx, dz);
      const delta = shortestAngleDelta(rig.movement.facing, desired);
      if (Math.abs(delta) > 0.02) {
        rig.movement.facing +=
          Math.sign(delta) * Math.min(Math.abs(delta), dt * 6.8);
        rig.root.rotation.y = rig.movement.facing;
        animated = true;
      }
    }
  }

  const s = rig.sitAmount;
  const r = rig.reachAmount;
  const phaseOffset = rig.botId.length * 0.73;

  // Exact grounded hip height so shoe soles stay flush on y = 0.00m whether standing OR seated
  const standingHipY = STANDING_HIP_BASE * rig.heightScale;
  const seatedHipY = SEATED_HIP_BASE * rig.heightScale;
  let hipY = THREE.MathUtils.lerp(standingHipY, seatedHipY, s);

  // Exact 90° hip/knee flexion when seated so shins drop vertically and shoes rest flat on floor
  let thighLX = -1.55 * s;
  let thighRX = -1.55 * s;
  let kneeLX = 1.55 * s;
  let kneeRX = 1.55 * s;

  let torsoPitch = 0.05 * s;
  let torsoYaw = 0;
  let headPitch = 0.04 * s;
  let headYaw = 0;

  // Base resting arms (natural slight elbow bend at sides when standing, hands on lap during sit/stand transition)
  let armLX = -0.16 * s;
  let armRX = -0.16 * s;
  let armLZ = 0.06;
  let armRZ = -0.06;
  let foreLX = -0.25 - 0.55 * s;
  let foreRX = -0.25 - 0.55 * s;

  rig.notebookProp.visible = false;
  rig.coffeeMugProp.visible = false;

  if (isWalkingPhysically) {
    rig.walkPhase += dt * 8.6;
    const stride = Math.sin(rig.walkPhase);
    const lift = Math.abs(Math.cos(rig.walkPhase));

    thighLX = stride * 0.52;
    thighRX = -stride * 0.52;
    kneeLX = Math.max(0, -stride) * 0.56 + 0.07;
    kneeRX = Math.max(0, stride) * 0.56 + 0.07;

    armLX = -stride * 0.42;
    armRX = stride * 0.42;
    foreLX = -0.26 - Math.max(0, stride) * 0.18;
    foreRX = -0.26 - Math.max(0, -stride) * 0.18;

    hipY = standingHipY + lift * 0.032 * rig.heightScale;
    torsoPitch = 0.05;
    torsoYaw = -stride * 0.06;
    headYaw = stride * 0.03;
    animated = true;
  } else if (rig.posturePhase === 'standing-up' || rig.posturePhase === 'sitting-down') {
    // Lean slightly forward with hands balanced as weight shifts off/onto chair
    const shift = Math.sin(s * Math.PI);
    torsoPitch = 0.22 * shift + 0.04 * s;
    armLX = -0.22 * shift - 0.16 * s;
    armRX = -0.22 * shift - 0.16 * s;
    foreLX = -0.58 * shift - 0.45 * s;
    foreRX = -0.58 * shift - 0.45 * s;
    animated = true;
  } else if (activity === 'discussing') {
    if (isActiveSpeaker) {
      // Measured, natural speaking cadence: occasional gesture bursts with calm pauses
      const gestureWindow = Math.sin(elapsed * 1.45 + phaseOffset);
      const gesturing = gestureWindow > -0.1 ? 1 : 0.25;
      const g1 = Math.sin(elapsed * 3.2 + phaseOffset) * gesturing;
      const g2 = Math.cos(elapsed * 2.5 + phaseOffset) * gesturing;

      torsoPitch = 0.06;
      torsoYaw = g2 * 0.07;
      headYaw = g1 * 0.1;
      headPitch = Math.sin(elapsed * 3.8 + phaseOffset) * 0.05;

      armLX = -0.34 + g1 * 0.16;
      armRX = -0.46 + g2 * 0.2;
      armLZ = 0.12 + Math.abs(g1) * 0.08;
      armRZ = -0.12 - Math.abs(g2) * 0.08;
      foreLX = -0.95 + g2 * 0.22;
      foreRX = -1.08 + g1 * 0.24;
    } else {
      // Attentive listener: faces speaker, occasional thoughtful nod or checking notes
      const nodCycle = (elapsed + phaseOffset) % 4.2;
      const isNodding = nodCycle > 2.6 && nodCycle < 3.5;
      const nod = isNodding ? Math.sin((nodCycle - 2.6) * 7.0) * 0.085 : 0;
      const takesNotes = rig.botId === 'business-strategist' || rig.botId === 'project-tracker';
      rig.notebookProp.visible = takesNotes && s < 0.2;

      torsoPitch = 0.04;
      headPitch = 0.04 + Math.max(0, nod);
      headYaw = Math.sin(elapsed * 0.8 + phaseOffset) * 0.04;

      if (takesNotes && s < 0.2) {
        armLX = -0.4;
        foreLX = -1.08;
        armRX = -0.32 + Math.sin(elapsed * 2.2) * 0.04;
        foreRX = -0.95;
      } else {
        armLX = -0.22 - 0.1 * s;
        armRX = -0.22 - 0.1 * s;
        armLZ = 0.05;
        armRZ = -0.05;
        foreLX = -0.72 - 0.25 * s;
        foreRX = -0.72 - 0.25 * s;
      }
    }
    animated = true;
  } else if (activity === 'working' && s > 0.6) {
    // Desk-accurate keyboard & mouse target angles (hands hover cleanly at y ≈ 0.765m, > 0.74m desk top)
    // Keyboard rest: armX ≈ -0.35, foreX ≈ -1.46, armLZ ≈ -0.08, armRZ ≈ +0.08 (angled slightly inward onto keys)
    // Mouse grip:    armRX ≈ -0.38, foreRX ≈ -1.42, armRZ ≈ -0.16 (right hand cleanly over mouse at x = +0.26)
    let workTorsoPitch = 0.09;
    let workTorsoYaw = 0;
    let workHeadPitch = 0.09;
    let workHeadYaw = 0;

    let workArmLX = -0.35;
    let workArmRX = -0.35;
    let workArmLZ = -0.08;
    let workArmRZ = 0.08;
    let workForeLX = -1.46;
    let workForeRX = -1.46;

    if (deskWorkMode === 'researching') {
      // Lead Finder: 3-beat readable sequence — Scroll source -> Pause to verify -> Enter into lead list
      const cycle = (elapsed + phaseOffset) % 6.2;
      if (cycle < 2.5) {
        // Beat 1: Mouse scroll & scan source
        const scroll = Math.sin(elapsed * 3.8);
        workTorsoPitch = 0.1;
        workHeadYaw = Math.sin(elapsed * 1.4) * 0.16;
        workHeadPitch = 0.08;
        workArmLX = -0.3;
        workForeLX = -1.36;
        workArmRX = -0.38 + scroll * 0.03;
        workArmRZ = -0.15 + scroll * 0.04;
        workForeRX = -1.42 + scroll * 0.05;
      } else if (cycle < 3.9) {
        // Beat 2: Pause slightly back to verify booking detail
        workTorsoPitch = 0.04;
        workHeadYaw = 0.14 + Math.sin(elapsed * 1.8) * 0.06;
        workHeadPitch = 0.06;
        workArmLX = -0.32;
        workForeLX = -1.38;
        workArmRX = -0.36;
        workArmRZ = -0.14;
        workForeRX = -1.4;
      } else {
        // Beat 3: Short crisp typing burst logging verified lead
        const tL = Math.sin(elapsed * 15.0);
        const tR = Math.cos(elapsed * 15.8);
        workTorsoPitch = 0.12;
        workHeadPitch = 0.12;
        workHeadYaw = Math.sin(elapsed * 2.1) * 0.07;
        workArmLX = -0.35 + tL * 0.025;
        workArmRX = -0.35 + tR * 0.025;
        workForeLX = -1.47 + tL * 0.09;
        workForeRX = -1.47 + tR * 0.09;
      }
    } else if (deskWorkMode === 'rereading') {
      // Content Creator rereading paragraph: sits slightly back, pauses hands, scans lines
      workTorsoPitch = 0.02;
      workHeadPitch = 0.07 + Math.sin(elapsed * 1.3) * 0.025;
      workHeadYaw = Math.sin(elapsed * 1.9 + phaseOffset) * 0.15;
      workArmLX = -0.28;
      workForeLX = -1.32;
      workArmRX = -0.58;
      workArmRZ = 0.14;
      workForeRX = -1.78 + Math.sin(elapsed * 1.6) * 0.03;
    } else if (deskWorkMode === 'drafting') {
      // Content Creator: Draft typing burst -> Brief reread pause -> Mouse highlight & edit burst
      const cycle = (elapsed + phaseOffset) % 6.4;
      if (cycle < 2.8) {
        // Typing burst
        const tL = Math.sin(elapsed * 16.0);
        const tR = Math.cos(elapsed * 16.6);
        workTorsoPitch = 0.11;
        workHeadPitch = 0.11;
        workHeadYaw = Math.sin(elapsed * 1.6) * 0.08;
        workArmLX = -0.35 + tL * 0.03;
        workArmRX = -0.35 + tR * 0.03;
        workForeLX = -1.47 + tL * 0.1;
        workForeRX = -1.47 + tR * 0.1;
      } else if (cycle < 4.5) {
        // Pause to reread paragraph
        workTorsoPitch = 0.03;
        workHeadPitch = 0.07;
        workHeadYaw = Math.sin((cycle - 2.8) * 2.4) * 0.16;
        workArmLX = -0.3;
        workForeLX = -1.35;
        workArmRX = -0.54;
        workArmRZ = 0.12;
        workForeRX = -1.72;
      } else {
        // Switch to mouse & edit line
        const m = Math.sin(elapsed * 3.4);
        workTorsoPitch = 0.1;
        workHeadPitch = 0.1;
        workArmLX = -0.34 + Math.sin(elapsed * 11.0) * 0.02;
        workForeLX = -1.46 + Math.sin(elapsed * 11.0) * 0.06;
        workArmRX = -0.38 + m * 0.03;
        workArmRZ = -0.16;
        workForeRX = -1.42 + m * 0.04;
      }
    } else if (deskWorkMode === 'coordinating') {
      // Project Tracker: Check board item -> Click status update -> Move to next task
      const cycle = (elapsed + phaseOffset) % 5.4;
      if (cycle < 1.9) {
        // Glance right at angled project board monitor
        workTorsoPitch = 0.07;
        workTorsoYaw = 0.09;
        workHeadYaw = 0.24;
        workHeadPitch = 0.07;
        workArmLX = -0.31;
        workForeLX = -1.38;
        workArmRX = -0.37;
        workArmRZ = -0.16;
        workForeRX = -1.42;
      } else if (cycle < 3.4) {
        // Click mouse to update task status with subtle confirming nod
        const click = Math.sin(elapsed * 5.2);
        workTorsoPitch = 0.1;
        workTorsoYaw = 0.05;
        workHeadYaw = 0.14;
        workHeadPitch = 0.09 + Math.max(0, click) * 0.04;
        workArmLX = -0.33;
        workForeLX = -1.42;
        workArmRX = -0.39 + click * 0.025;
        workArmRZ = -0.17;
        workForeRX = -1.44 + click * 0.06;
      } else {
        // Quick status note on keyboard before next item
        const tL = Math.sin(elapsed * 13.5);
        const tR = Math.cos(elapsed * 14.0);
        workTorsoPitch = 0.11;
        workHeadPitch = 0.11;
        workHeadYaw = -0.04;
        workArmLX = -0.35 + tL * 0.025;
        workArmRX = -0.35 + tR * 0.025;
        workForeLX = -1.46 + tL * 0.08;
        workForeRX = -1.46 + tR * 0.08;
      }
    } else if (deskWorkMode === 'reviewing') {
      // Team Lead: Review submitted item -> Nod approval or mark correction -> Trigger handoff
      const cycle = (elapsed + phaseOffset) % 6.0;
      rig.notebookProp.visible = cycle < 3.6;
      if (cycle < 2.6) {
        // Reviewing submitted evidence against checklist
        workTorsoPitch = 0.06;
        workHeadYaw = Math.sin(elapsed * 1.4) * 0.17;
        workHeadPitch = 0.09;
        workArmLX = -0.36;
        workForeLX = -1.42;
        workArmRX = -0.38 + Math.sin(elapsed * 2.8) * 0.025;
        workArmRZ = -0.15;
        workForeRX = -1.42 + Math.cos(elapsed * 2.8) * 0.04;
      } else if (cycle < 4.1) {
        // Deliberate confirming nod / marking approval
        const nod = Math.max(0, Math.sin((cycle - 2.6) * 4.2)) * 0.09;
        workTorsoPitch = 0.05;
        workHeadPitch = 0.08 + nod;
        workHeadYaw = 0.04;
        workArmLX = -0.34;
        workForeLX = -1.4;
        workArmRX = -0.38;
        workArmRZ = -0.14;
        workForeRX = -1.44;
      } else {
        // Typing approval / handoff command
        const tL = Math.sin(elapsed * 14.2);
        const tR = Math.cos(elapsed * 14.8);
        workTorsoPitch = 0.11;
        workHeadPitch = 0.11;
        workArmLX = -0.35 + tL * 0.025;
        workArmRX = -0.35 + tR * 0.025;
        workForeLX = -1.46 + tL * 0.08;
        workForeRX = -1.46 + tR * 0.08;
      }
    } else {
      // Default rhythmic desk typing with brief reading pause
      const cycle = (elapsed + phaseOffset) % 4.4;
      const typing = cycle < 3.1;
      const tL = typing ? Math.sin(elapsed * 14.0 + phaseOffset) : 0;
      const tR = typing ? Math.cos(elapsed * 14.6 + phaseOffset) : 0;
      workTorsoPitch = typing ? 0.11 : 0.05;
      workHeadPitch = 0.1;
      workHeadYaw = Math.sin(elapsed * 1.5 + phaseOffset) * 0.1;
      workArmLX = -0.35 + tL * 0.025;
      workArmRX = -0.35 + tR * 0.025;
      workForeLX = -1.46 + tL * 0.08;
      workForeRX = -1.46 + tR * 0.08;
    }

    // Blend smoothly using reachAmount so hands never clip the desk while sitting down
    torsoPitch = THREE.MathUtils.lerp(torsoPitch, workTorsoPitch, r);
    torsoYaw = THREE.MathUtils.lerp(torsoYaw, workTorsoYaw, r);
    headPitch = THREE.MathUtils.lerp(headPitch, workHeadPitch, r);
    headYaw = THREE.MathUtils.lerp(headYaw, workHeadYaw, r);
    armLX = THREE.MathUtils.lerp(armLX, workArmLX, r);
    armRX = THREE.MathUtils.lerp(armRX, workArmRX, r);
    armLZ = THREE.MathUtils.lerp(armLZ, workArmLZ, r);
    armRZ = THREE.MathUtils.lerp(armRZ, workArmRZ, r);
    foreLX = THREE.MathUtils.lerp(foreLX, workForeLX, r);
    foreRX = THREE.MathUtils.lerp(foreRX, workForeRX, r);
    animated = true;
  } else if (activity === 'checking-notes') {
    rig.notebookProp.visible = true;
    torsoPitch = 0.05;
    headPitch = 0.14 + Math.sin(elapsed * 1.6) * 0.03;
    headYaw = Math.sin(elapsed * 1.1 + phaseOffset) * 0.12;
    armLX = -0.44;
    foreLX = -1.16;
    armRX = -0.28 + Math.sin(elapsed * 2.2) * 0.06;
    foreRX = -0.82;
    animated = true;
  } else if (activity === 'lounging') {
    const breathe = Math.sin(elapsed * 1.5 + phaseOffset);
    torsoPitch = -0.05 * s;
    headYaw = Math.sin(elapsed * 0.8 + phaseOffset) * 0.1;
    armLX = -0.18 * s;
    armRX = -0.18 * s;
    foreLX = -0.55 * s;
    foreRX = -0.55 * s;
    hipY += breathe * 0.004;
  } else if (activity === 'on-break') {
    // Relaxed standing Kitchen Coffee Break: hold ceramic mug and take periodic natural sips
    rig.coffeeMugProp.visible = true;
    const cycle = (elapsed * 0.42 + phaseOffset * 0.35) % 4.0;
    const sip =
      cycle < 0.9
        ? Math.sin((cycle / 0.9) * Math.PI)
        : 0;
    const sway = Math.sin(elapsed * 1.15 + phaseOffset);
    torsoPitch = -0.02 - sip * 0.03;
    torsoYaw = sway * 0.045;
    headPitch = -0.03 - sip * 0.08;
    headYaw = Math.sin(elapsed * 0.75 + phaseOffset) * 0.09 * (1 - sip * 0.7);
    // Left arm rests loosely at side / relaxed near waist
    armLX = -0.1 + sway * 0.025;
    armLZ = -0.06;
    foreLX = -0.45;
    // Right arm holds mug comfortably at chest height, lifting smoothly to take a sip
    armRX = -0.42 - sip * 0.42;
    armRZ = 0.08 - sip * 0.12;
    foreRX = -1.18 - sip * 0.46;
    hipY += Math.sin(elapsed * 1.6 + phaseOffset) * 0.003;
    animated = true;
  } else if (activity === 'waiting') {
    if (s < 0.25) {
      // Standing naturally at a queue waiting spot: slight weight shift, calm gaze toward colleague
      const sway = Math.sin(elapsed * 1.2 + phaseOffset);
      torsoPitch = 0.02;
      torsoYaw = sway * 0.04;
      headYaw = Math.sin(elapsed * 0.9 + phaseOffset) * 0.08;
      headPitch = 0.02;
      armLX = -0.14;
      armRX = -0.14;
      armLZ = -0.04;
      armRZ = 0.04;
      foreLX = -0.68;
      foreRX = -0.68;
      animated = true;
    } else {
      // Seated at desk awaiting owner decision
      torsoPitch = 0.04;
      headYaw = Math.sin(elapsed * 1.1 + phaseOffset) * 0.1;
      armLX = THREE.MathUtils.lerp(armLX, -0.32, r);
      armRX = THREE.MathUtils.lerp(armRX, -0.32, r);
      foreLX = THREE.MathUtils.lerp(foreLX, -1.36, r);
      foreRX = THREE.MathUtils.lerp(foreRX, -1.36, r);
    }
  } else {
    // Calm at-desk idle: gentle breathing, hands resting naturally near keyboard edge
    const breathe = Math.sin(elapsed * 1.6 + phaseOffset);
    torsoPitch = 0.06 + breathe * 0.01;
    headPitch = 0.07;
    headYaw = Math.sin(elapsed * 0.65 + phaseOffset) * 0.07;
    armLX = THREE.MathUtils.lerp(armLX, -0.33, r);
    armRX = THREE.MathUtils.lerp(armRX, -0.33, r);
    armLZ = THREE.MathUtils.lerp(armLZ, -0.06, r);
    armRZ = THREE.MathUtils.lerp(armRZ, 0.06, r);
    foreLX = THREE.MathUtils.lerp(foreLX, -1.4, r);
    foreRX = THREE.MathUtils.lerp(foreRX, -1.4, r);
  }

  // Smoothly damp all joints for natural, snap-free motion
  const dampRate = 11.5;
  rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, hipY, dampRate, dt);
  rig.thighL.rotation.x = THREE.MathUtils.damp(rig.thighL.rotation.x, thighLX, dampRate, dt);
  rig.thighR.rotation.x = THREE.MathUtils.damp(rig.thighR.rotation.x, thighRX, dampRate, dt);
  rig.kneeL.rotation.x = THREE.MathUtils.damp(rig.kneeL.rotation.x, kneeLX, dampRate, dt);
  rig.kneeR.rotation.x = THREE.MathUtils.damp(rig.kneeR.rotation.x, kneeRX, dampRate, dt);

  rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, torsoPitch, dampRate, dt);
  rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, torsoYaw, dampRate, dt);
  rig.head.rotation.x = THREE.MathUtils.damp(rig.head.rotation.x, headPitch, dampRate, dt);
  rig.head.rotation.y = THREE.MathUtils.damp(rig.head.rotation.y, headYaw, dampRate, dt);

  rig.armL.rotation.x = THREE.MathUtils.damp(rig.armL.rotation.x, armLX, dampRate, dt);
  rig.armR.rotation.x = THREE.MathUtils.damp(rig.armR.rotation.x, armRX, dampRate, dt);
  rig.armL.rotation.z = THREE.MathUtils.damp(rig.armL.rotation.z, armLZ, dampRate, dt);
  rig.armR.rotation.z = THREE.MathUtils.damp(rig.armR.rotation.z, armRZ, dampRate, dt);
  rig.forearmL.rotation.x = THREE.MathUtils.damp(rig.forearmL.rotation.x, foreLX, dampRate, dt);
  rig.forearmR.rotation.x = THREE.MathUtils.damp(rig.forearmR.rotation.x, foreRX, dampRate, dt);

  return animated;
}
