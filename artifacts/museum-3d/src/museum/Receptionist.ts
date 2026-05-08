import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WallBox } from "./collision";

const DIALOGUE_LINES = [
  "Welcome to 10KSQUAD Museum — home of 3333 unique NFTs on Monad.",
  "The Common Gallery is straight ahead. Explore over 2,967 artworks.",
  "Turn right for the Uncommon Wing, or head deeper for Rare and Platinum.",
  "Hover over any frame to see the artist and rarity. Click to inspect.",
];

const PROX_TALK = 5;

export interface ReceptionistController {
  tick: (elapsed: number) => void;
  boxes: WallBox[];
  dispose: () => void;
}

export async function buildReceptionist(
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<ReceptionistController> {
  const BASE = import.meta.env.BASE_URL as string;
  const loader = new GLTFLoader();

  const load = (url: string) =>
    new Promise<THREE.Group>((res, rej) =>
      loader.load(url, (g) => res(g.scene), undefined, rej));

  // ── Load all three models in parallel ──────────────────────────
  const [charScene, deskScene, seatScene] = await Promise.all([
    load(`${BASE}models/reception/character.glb`).catch((err: unknown) => {
      console.error("[Receptionist] character.glb failed to load:", err);
      return null;
    }),
    load(`${BASE}models/reception/desk.glb`).catch((err: unknown) => {
      console.error("[Receptionist] desk.glb failed to load:", err);
      return null;
    }),
    load(`${BASE}models/reception/seat.glb`).catch((err: unknown) => {
      console.error("[Receptionist] seat.glb failed to load:", err);
      return null;
    }),
  ]);

  // ── Helper: scale model so its height matches targetH, rest on
  //    floor (y=0). Returns the world-space top Y after placement. ──
  function autoScale(model: THREE.Group, targetH: number): void {
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const scale = targetH / Math.max(h, 0.01);
    model.scale.setScalar(scale);
    // Recompute bbox after scaling and lift so min.y rests on y=0
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
  }

  function worldTopY(model: THREE.Group): number {
    const box = new THREE.Box3().setFromObject(model);
    return box.max.y;
  }

  // ── Desk (world pos 41, 0, 46) ─────────────────────────────────
  if (deskScene) {
    autoScale(deskScene, 1.0);
    const deskAdjY = deskScene.position.y; // preserve floor-rest offset
    deskScene.position.set(41, deskAdjY, 46);
    deskScene.rotation.y = 0;
    deskScene.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    scene.add(deskScene);
  } else {
    buildProceduralDesk(scene);
  }

  // ── Seat (world pos 41, ?, 44) — preserve floor-rest Y ─────────
  let seatTopY = 0.52;
  if (seatScene) {
    autoScale(seatScene, 0.5);
    const seatAdjY = seatScene.position.y; // preserve floor-rest offset
    seatScene.position.set(41, seatAdjY, 44);
    seatScene.rotation.y = 0;
    seatScene.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    scene.add(seatScene);
    seatTopY = worldTopY(seatScene); // actual world-space top after placement
  } else {
    buildProceduralChair(scene, 41, 0, 44);
    // procedural chair seat top is at 0.52 m (matches seatTopY default)
  }

  // ── Character group (world pos 41, seatTopY, 44.5) ─────────────
  const charGroup = new THREE.Group();
  charGroup.position.set(41, seatTopY, 44.5);
  charGroup.rotation.y = 0;
  scene.add(charGroup);

  let handBone: THREE.Bone | null = null;
  let jawBone: THREE.Bone | null = null;
  let jawMesh: THREE.SkinnedMesh | null = null;
  let jawMorphIdx = -1;
  let isSkinnedModel = false;

  if (charScene) {
    autoScale(charScene, 1.7);
    charScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        isSkinnedModel = true;
        const sm = obj as THREE.SkinnedMesh;

        // ── Log all skeleton bones so we know what's available ──
        console.log(
          "[Receptionist] Skeleton bones:",
          sm.skeleton.bones.map((b) => b.name),
        );

        sm.skeleton.bones.forEach((b) => {
          const lc = b.name.toLowerCase();
          if (
            !handBone &&
            (lc.includes("hand") ||
              lc.includes("arm") ||
              lc.includes("wrist"))
          ) {
            handBone = b;
          }
          if (
            !jawBone &&
            (lc.includes("jaw") ||
              lc.includes("mouth") ||
              lc.includes("lower"))
          ) {
            jawBone = b;
          }
        });

        // ── Check morph targets for jaw / mouth open ─────────────
        if (!jawBone && sm.morphTargetDictionary) {
          const morphKeys = Object.keys(sm.morphTargetDictionary);
          console.log("[Receptionist] Morph targets:", morphKeys);
          const jawKey = morphKeys.find(
            (k) =>
              k.toLowerCase().includes("mouth") ||
              k.toLowerCase().includes("jaw") ||
              k.toLowerCase().includes("open"),
          );
          if (jawKey !== undefined) {
            jawMorphIdx = sm.morphTargetDictionary[jawKey];
            jawMesh = sm;
          }
        }
      }
    });
    charGroup.add(charScene);
  } else {
    buildFallbackCharacter(charGroup);
  }

  // ── Dialogue DOM panel ─────────────────────────────────────────
  const dialogueEl = document.createElement("div");
  Object.assign(dialogueEl.style, {
    position: "fixed",
    bottom: "120px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(10,6,20,0.88)",
    border: "1px solid #c8a050",
    color: "#e8d090",
    fontFamily: "Georgia, serif",
    fontSize: "15px",
    padding: "14px 22px",
    borderRadius: "8px",
    maxWidth: "420px",
    width: "max-content",
    textAlign: "center",
    pointerEvents: "none",
    zIndex: "200",
    opacity: "0",
    transition: "opacity 0.4s",
  });
  document.body.appendChild(dialogueEl);

  const showLine = (idx: number): void => {
    dialogueEl.innerHTML =
      `<div style="color:#c8a050;font-size:12px;font-weight:bold;margin-bottom:6px;">🎙 Reception</div>` +
      DIALOGUE_LINES[idx];
    dialogueEl.style.opacity = "1";
  };
  const hideDialogue = (): void => {
    dialogueEl.style.opacity = "0";
  };

  // ── Tick state ─────────────────────────────────────────────────
  // dialogueIdx tracks which line to show on the NEXT approach entry.
  // Each new approach (wasNear→isNear) shows the current line then
  // advances the index, so lines cycle across consecutive visits.
  let dialogueIdx = 0;
  let wasNear = false;
  const charWorldPos = new THREE.Vector3(41, 1.0, 44.5);

  const tick = (elapsed: number): void => {
    const dist = camera.position.distanceTo(charWorldPos);
    const isTalking = dist < PROX_TALK;

    // ── Idle sway (rigid fallback) ─────────────────────────────
    if (!isSkinnedModel) {
      charGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.05;
    }

    // ── Hand wave — continuous ─────────────────────────────────
    if (handBone) {
      handBone.rotation.z = Math.sin(elapsed * 2.2) * 0.35;
    } else if (!isSkinnedModel) {
      charGroup.rotation.z = Math.sin(elapsed * 2.2) * 0.04;
    }

    // ── Jaw / mouth animation — only when isTalking ────────────
    if (isTalking) {
      const jawAmt = Math.max(0, Math.sin(elapsed * 8.0));
      if (jawBone) {
        jawBone.rotation.x = jawAmt * 0.18;
      } else if (jawMesh !== null && jawMorphIdx !== -1) {
        jawMesh.morphTargetInfluences![jawMorphIdx] = jawAmt;
      }
    } else {
      if (jawBone) {
        jawBone.rotation.x *= 0.8;
      } else if (jawMesh !== null && jawMorphIdx !== -1) {
        jawMesh.morphTargetInfluences![jawMorphIdx] *= 0.8;
      }
    }

    // ── Dialogue: show one line per approach, advance on each entry ──
    if (isTalking && !wasNear) {
      // Player just entered range — show current line and advance index
      showLine(dialogueIdx);
      dialogueIdx = (dialogueIdx + 1) % DIALOGUE_LINES.length;
    } else if (!isTalking && wasNear) {
      hideDialogue();
    }
    wasNear = isTalking;
  };

  // ── Collision boxes ────────────────────────────────────────────
  const boxes: WallBox[] = [{ minX: 38, maxX: 44, minZ: 44, maxZ: 49 }];

  const dispose = (): void => {
    hideDialogue();
    if (document.body.contains(dialogueEl)) {
      document.body.removeChild(dialogueEl);
    }
  };

  return { tick, boxes, dispose };
}

// ── Procedural desk fallback ────────────────────────────────────
function buildProceduralDesk(scene: THREE.Scene): void {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3b1f0a,
    roughness: 0.35,
    metalness: 0.1,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a017,
    roughness: 0.15,
    metalness: 0.85,
  });

  const g = new THREE.Group();
  g.position.set(41, 0, 46);

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.92, 1.0), mat);
  body.position.set(0, 0.46, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 1.1), mat);
  top.position.set(0, 0.96, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(3.32, 0.06, 0.04),
    goldMat,
  );
  trim.position.set(0, 0.93, 0.57);
  g.add(trim);

  const topTrim = new THREE.Mesh(
    new THREE.BoxGeometry(3.32, 0.025, 1.14),
    goldMat,
  );
  topTrim.position.set(0, 1.01, 0);
  g.add(topTrim);

  scene.add(g);
}

// ── Procedural chair fallback ───────────────────────────────────
function buildProceduralChair(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
): void {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x12122a,
    roughness: 0.65,
    metalness: 0.25,
  });

  const g = new THREE.Group();
  g.position.set(x, y, z);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.56), mat);
  seat.position.set(0, 0.52, 0);
  seat.castShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.07), mat);
  back.position.set(0, 0.88, -0.28);
  back.castShadow = true;
  g.add(back);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.5, 8),
    mat,
  );
  post.position.set(0, 0.26, 0);
  g.add(post);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.07), mat);
    arm.position.set(Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17);
    arm.rotation.y = a;
    g.add(arm);
  }

  scene.add(g);
}

// ── Simple fallback humanoid ────────────────────────────────────
function buildFallbackCharacter(group: THREE.Group): void {
  const skinM = new THREE.MeshStandardMaterial({
    color: 0xd4a373,
    roughness: 0.8,
  });
  const clothM = new THREE.MeshStandardMaterial({
    color: 0x12122a,
    roughness: 0.6,
  });

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.54, 0.23),
    clothM,
  );
  torso.position.set(0, 0.64, 0);
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 14, 10),
    skinM,
  );
  head.position.set(0, 1.07, 0);
  head.castShadow = true;
  group.add(head);

  const rArmG = new THREE.Group();
  rArmG.position.set(0.27, 0.77, 0);
  group.add(rArmG);
  const rArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.44, 0.13),
    clothM,
  );
  rArm.position.set(0, -0.22, 0);
  rArm.castShadow = true;
  rArmG.add(rArm);

  const lArmG = new THREE.Group();
  lArmG.position.set(-0.27, 0.77, 0);
  group.add(lArmG);
  const lArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.44, 0.13),
    clothM,
  );
  lArm.position.set(0, -0.22, 0);
  lArm.castShadow = true;
  lArmG.add(lArm);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.11, 8),
    skinM,
  );
  neck.position.set(0, 0.96, 0);
  group.add(neck);
}
