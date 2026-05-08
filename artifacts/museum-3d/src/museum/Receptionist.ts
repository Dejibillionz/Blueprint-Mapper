import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WallBox } from "./collision";

const DIALOGUE_LINES = [
  "Welcome to 10KSQUAD Museum — home of 3333 unique NFTs on Monad.",
  "The Common Gallery is straight ahead. Explore over 2,967 artworks.",
  "Turn right for the Uncommon Wing, or head deeper for Rare and Platinum.",
  "Hover over any frame to see the artist and rarity. Click to inspect.",
];

const RX = 41;
const RZ = 46;
const PROX_DIST_TALK = 5;
const PROX_DIST_APPROACH = 10;
const DIALOGUE_INTERVAL = 4.5;

export interface ReceptionistController {
  tick: (elapsed: number, cameraPos: THREE.Vector3) => { dialogueLine: string | null };
  boxes: WallBox[];
}

export function buildReceptionist(scene: THREE.Scene): ReceptionistController {
  const root = new THREE.Group();
  root.position.set(RX, 0, RZ);
  scene.add(root);

  const deskMat = new THREE.MeshStandardMaterial({
    color: 0x3b1f0a,
    roughness: 0.35,
    metalness: 0.1,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a017,
    roughness: 0.15,
    metalness: 0.85,
  });
  const chairMat = new THREE.MeshStandardMaterial({
    color: 0x12122a,
    roughness: 0.65,
    metalness: 0.25,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x060615,
    roughness: 0.4,
    metalness: 0.6,
    emissive: new THREE.Color(0x0a0a40),
    emissiveIntensity: 0.4,
  });

  // ── Desk body ─────────────────────────────────────────────────
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.92, 1.0), deskMat);
  body.position.set(0, 0.46, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 1.1), deskMat);
  top.position.set(0, 0.96, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  root.add(top);

  // Gold front trim
  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.06, 0.04), goldMat);
  frontTrim.position.set(0, 0.93, 0.57);
  root.add(frontTrim);

  // Gold top edge trim
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.025, 1.14), goldMat);
  topTrim.position.set(0, 1.01, 0);
  root.add(topTrim);

  // Gold side trims
  for (const sx of [-1.65, 1.65]) {
    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.94, 1.04), goldMat);
    sideTrim.position.set(sx, 0.47, 0);
    root.add(sideTrim);
  }

  // ── Monitor on desk ───────────────────────────────────────────
  const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.28), chairMat);
  monBase.position.set(-0.6, 1.02, -0.12);
  root.add(monBase);

  const monPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), chairMat);
  monPost.position.set(-0.6, 1.13, -0.22);
  root.add(monPost);

  const monScreen = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 0.03), screenMat);
  monScreen.position.set(-0.6, 1.30, -0.28);
  root.add(monScreen);

  // ── Chair (behind desk) ───────────────────────────────────────
  const seatGeo = new THREE.BoxGeometry(0.56, 0.07, 0.56);
  const seat = new THREE.Mesh(seatGeo, chairMat);
  seat.position.set(0, 0.52, -0.74);
  seat.castShadow = true;
  root.add(seat);

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.07), chairMat);
  backrest.position.set(0, 0.88, -1.02);
  backrest.castShadow = true;
  root.add(backrest);

  // Lumbar curve accent on backrest
  const lumbar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.05), goldMat);
  lumbar.position.set(0, 0.62, -0.99);
  root.add(lumbar);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.5, 8), chairMat);
  post.position.set(0, 0.26, -0.74);
  root.add(post);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.07), chairMat);
    arm.position.set(Math.cos(a) * 0.17, 0.03, -0.74 + Math.sin(a) * 0.17);
    arm.rotation.y = a;
    root.add(arm);
  }

  // ── Character group (sits behind desk, faces +Z toward player) ─
  const charGroup = new THREE.Group();
  charGroup.position.set(0, 0.52, -0.72); // sit on chair
  charGroup.rotation.y = Math.PI;          // face +Z (toward player entering from south)
  root.add(charGroup);

  let waveTarget: THREE.Object3D | null = null;
  const waveOriginQ = new THREE.Quaternion();

  const loader = new GLTFLoader();
  const BASE = import.meta.env.BASE_URL as string;

  // Load primary character model
  loader.load(
    `${BASE}models/reception/model_a.glb`,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const scale = 1.65 / Math.max(h, 0.01);
      model.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y = -box2.min.y;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
        const lc = child.name.toLowerCase();
        if (
          !waveTarget &&
          (lc.includes("rightarm") ||
            lc.includes("right_arm") ||
            lc.includes("r_arm") ||
            lc.includes("upperarm_r") ||
            lc.includes("arm_r") ||
            lc.includes("hand_r"))
        ) {
          waveTarget = child;
          waveOriginQ.copy(child.quaternion);
        }
      });

      charGroup.add(model);
    },
    undefined,
    () => {
      buildFallbackCharacter(charGroup);
    },
  );

  // Load secondary model — auto-assign as prop/second figure based on proportions
  loader.load(
    `${BASE}models/reception/model_b.glb`,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const w = box.max.x - box.min.x;
      const d = box.max.z - box.min.z;
      const isUpright = h > Math.max(w, d) * 1.2;

      if (isUpright) {
        // Treat as a standing figure — place beside the desk
        const scale = 1.6 / Math.max(h, 0.01);
        model.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.set(1.85, -box2.min.y * scale, 0);
        model.rotation.y = Math.PI + 0.25;
        model.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        root.add(model);
      } else {
        // Treat as a prop — place on desk surface
        const scale = 0.9 / Math.max(h, 0.01);
        model.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.set(0.6, 1.03 - box2.min.y * scale, -0.05);
        model.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        root.add(model);
      }
    },
    undefined,
    () => {},
  );

  // ── Collision boxes ───────────────────────────────────────────
  // Desk footprint + chair/character area behind it
  const boxes: WallBox[] = [
    { minX: 38, maxX: 44, minZ: 44, maxZ: 49 },
  ];

  // ── Tick state ────────────────────────────────────────────────
  let dialogueIdx = 0;
  let lastLineTime = -15;
  let wasNear = false;
  const recepPos = new THREE.Vector3(RX, 1.0, RZ);
  const waveAxis = new THREE.Vector3(0, 0, 1);
  const tmpQ = new THREE.Quaternion();

  const tick = (elapsed: number, camPos: THREE.Vector3): { dialogueLine: string | null } => {
    const dist = camPos.distanceTo(recepPos);
    const isTalking = dist < PROX_DIST_TALK;
    const isNear    = dist < PROX_DIST_APPROACH;

    if (isTalking && !wasNear) {
      dialogueIdx = 0;
      lastLineTime = elapsed;
    }

    if (isTalking && elapsed - lastLineTime > DIALOGUE_INTERVAL) {
      dialogueIdx = (dialogueIdx + 1) % DIALOGUE_LINES.length;
      lastLineTime = elapsed;
    }
    wasNear = isTalking;

    // Gentle idle breathing sway on charGroup
    charGroup.position.y = 0.52 + Math.sin(elapsed * 1.1) * 0.004;
    charGroup.rotation.z = Math.sin(elapsed * 0.85) * 0.01;

    // Wave animation when player is near
    if (isNear) {
      const waveAmt = Math.abs(Math.sin(elapsed * 2.8)) * 0.7;
      if (waveTarget) {
        tmpQ.setFromAxisAngle(waveAxis, -waveAmt);
        waveTarget.quaternion.copy(waveOriginQ).multiply(tmpQ);
      } else {
        charGroup.rotation.y = Math.PI + Math.sin(elapsed * 2.8) * 0.09;
      }
    } else {
      if (waveTarget) {
        waveTarget.quaternion.slerp(waveOriginQ, 0.08);
      } else {
        charGroup.rotation.y += (Math.PI - charGroup.rotation.y) * 0.05;
      }
    }

    return { dialogueLine: isTalking ? DIALOGUE_LINES[dialogueIdx] : null };
  };

  return { tick, boxes };
}

function buildFallbackCharacter(group: THREE.Group): void {
  const skinM  = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.8 });
  const clothM = new THREE.MeshStandardMaterial({ color: 0x12122a, roughness: 0.6 });
  const hairM  = new THREE.MeshStandardMaterial({ color: 0x1a0d00, roughness: 0.9 });
  const goldM  = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.3, metalness: 0.7 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.23), clothM);
  torso.position.set(0, 1.14, 0);
  torso.castShadow = true;
  group.add(torso);

  // Collar accent
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.25), goldM);
  collar.position.set(0, 1.41, 0);
  group.add(collar);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), skinM);
  head.position.set(0, 1.57, 0);
  head.castShadow = true;
  group.add(head);

  // Hair
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairM,
  );
  hair.position.set(0, 1.64, -0.02);
  group.add(hair);

  // Right arm group (for wave animation)
  const rArmG = new THREE.Group();
  rArmG.position.set(0.27, 1.27, 0);
  group.add(rArmG);
  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.13), clothM);
  rArm.position.set(0, -0.22, 0);
  rArm.castShadow = true;
  rArmG.add(rArm);

  // Left arm
  const lArmG = new THREE.Group();
  lArmG.position.set(-0.27, 1.27, 0);
  group.add(lArmG);
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.13), clothM);
  lArm.position.set(0, -0.22, 0);
  lArm.castShadow = true;
  lArmG.add(lArm);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.11, 8), skinM);
  neck.position.set(0, 1.46, 0);
  group.add(neck);
}
