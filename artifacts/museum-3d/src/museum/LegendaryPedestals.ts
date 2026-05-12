import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ─────────────────────────────────────────────────────────────────────────────
// PEDESTAL POSITIONS — two rows of two, centred in the open floor of the
// Legendary Vault (room_4: x 77–100, z 4–22, south entrance corridor at z≈24).
// Tweak these values freely; each entry is { x, z } in world-space metres.
// ─────────────────────────────────────────────────────────────────────────────
export const LEGENDARY_PEDESTAL_POSITIONS: readonly { x: number; z: number }[] = [
  { x: 83, z:  9 },   // west row — north pedestal
  { x: 83, z: 17 },   // west row — south pedestal
  { x: 94, z:  9 },   // east row — north pedestal
  { x: 94, z: 17 },   // east row — south pedestal
] as const;

// Pedestal geometry constants
const BASE_W   = 0.50;
const BASE_H   = 1.00;
const BASE_D   = 0.50;
const BAND_W   = 0.54;
const BAND_H   = 0.04;
const BAND_D   = 0.54;
const CAP_W    = 0.40;
const CAP_H    = 0.20;
const CAP_D    = 0.40;

// The world-Y of the pedestal top surface (group origin is at floor level y=0)
const TOP_SURFACE_Y = BASE_H + CAP_H;  // 1.20 m

// Maximum bounding-box size for auto-scaled GLTF models sitting on top
const MODEL_BOX = 0.40;

const stoneMat = new THREE.MeshStandardMaterial({
  color:     0x1a1a2e,
  metalness: 0.40,
  roughness: 0.70,
});

const bandMat = new THREE.MeshStandardMaterial({
  color:     0xd4d4d4,
  metalness: 0.80,
  roughness: 0.20,
});

function buildPedestalGroup(): THREE.Group {
  const group = new THREE.Group();

  // Base column
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_W, BASE_H, BASE_D),
    stoneMat,
  );
  base.position.set(0, BASE_H / 2, 0);
  base.castShadow    = true;
  base.receiveShadow = true;
  group.add(base);

  // Metallic trim band (sits on top of the base, just below the cap)
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(BAND_W, BAND_H, BAND_D),
    bandMat,
  );
  band.position.set(0, BASE_H - BAND_H / 2, 0);
  band.castShadow    = true;
  band.receiveShadow = true;
  group.add(band);

  // Narrower top cap
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(CAP_W, CAP_H, CAP_D),
    stoneMat,
  );
  cap.position.set(0, BASE_H + CAP_H / 2, 0);
  cap.castShadow    = true;
  cap.receiveShadow = true;
  group.add(cap);

  return group;
}

function loadModelOnPedestal(
  url: string,
  pedestalGroup: THREE.Group,
): void {
  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene;

      // Auto-center and scale so the model fits inside MODEL_BOX × MODEL_BOX × MODEL_BOX
      const box    = new THREE.Box3().setFromObject(model);
      const size   = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = maxDim > 0 ? MODEL_BOX / maxDim : 1;
      model.scale.setScalar(scale);

      // After scaling, re-compute the bounding box to find the bottom
      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledMin = scaledBox.min.clone();

      // Translate so the model bottom sits flush on the pedestal top surface
      // pedestalGroup origin is at floor (y=0), top surface is at TOP_SURFACE_Y
      model.position.x -= center.x * scale;
      model.position.y  = TOP_SURFACE_Y - scaledMin.y;
      model.position.z -= center.z * scale;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow    = true;
          child.receiveShadow = true;
        }
      });

      pedestalGroup.add(model);
    },
    undefined,
    (err) => {
      console.warn(`[LegendaryPedestals] Failed to load model "${url}":`, err);
    },
  );
}

/**
 * Builds 4 display pedestals in the Legendary Vault and optionally loads a
 * GLTF/GLB model on each one.
 *
 * @param scene     - The Three.js scene to add pedestals to.
 * @param modelUrls - Tuple of 4 optional GLB/GLTF URL strings (one per pedestal).
 *                    Leave a slot as "" or undefined to keep the pedestal bare.
 */
export type PedestalModelSlots = readonly [
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
];

export function buildLegendaryPedestals(
  scene: THREE.Scene,
  modelUrls: PedestalModelSlots | readonly (string | undefined)[],
): void {
  LEGENDARY_PEDESTAL_POSITIONS.forEach(({ x, z }, i) => {
    const group = buildPedestalGroup();
    group.position.set(x, 0, z);
    scene.add(group);

    const url = modelUrls[i];
    if (url && url.trim() !== "") {
      loadModelOnPedestal(url.trim(), group);
    }
  });
}
