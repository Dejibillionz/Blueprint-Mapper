import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

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

// Metadata displayed in the inspect panel when a visitor clicks a pedestal
export const LEGENDARY_PEDESTAL_META: readonly { name: string; description: string }[] = [
  {
    name: "Genesis Crown",
    description: "The rarest artifact of the 10K Squad collection — a symbol of legendary status forged in the genesis block. Only holders of the highest rank may gaze upon it.",
  },
  {
    name: "Vault Key",
    description: "An ancient key that grants access to the inner sanctum of the Legendary Vault. One of a kind, it has never left these hallowed halls.",
  },
  {
    name: "Squad Emblem",
    description: "The original emblem of the 10K Squad, minted at the dawn of the collection. Its glow intensifies in the presence of true believers.",
  },
  {
    name: "Origin Stone",
    description: "A crystallised fragment of the first block, preserved as a testament to the collection's origins. Rumoured to pulse faintly in the hands of a genesis holder.",
  },
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
const MODEL_BOX = 0.80;

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

function buildPedestalGroup(pedestalIndex: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.isPedestal    = true;
  group.userData.pedestalIndex = pedestalIndex;

  // Base column
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_W, BASE_H, BASE_D),
    stoneMat,
  );
  base.position.set(0, BASE_H / 2, 0);
  base.castShadow    = true;
  base.receiveShadow = true;
  base.userData.isPedestal    = true;
  base.userData.pedestalIndex = pedestalIndex;
  group.add(base);

  // Metallic trim band (sits on top of the base, just below the cap)
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(BAND_W, BAND_H, BAND_D),
    bandMat,
  );
  band.position.set(0, BASE_H - BAND_H / 2, 0);
  band.castShadow    = true;
  band.receiveShadow = true;
  band.userData.isPedestal    = true;
  band.userData.pedestalIndex = pedestalIndex;
  group.add(band);

  // Narrower top cap
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(CAP_W, CAP_H, CAP_D),
    stoneMat,
  );
  cap.position.set(0, BASE_H + CAP_H / 2, 0);
  cap.castShadow    = true;
  cap.receiveShadow = true;
  cap.userData.isPedestal    = true;
  cap.userData.pedestalIndex = pedestalIndex;
  group.add(cap);

  return group;
}

// Shared loader with Draco support (handles both compressed and uncompressed GLBs)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

function loadModelOnPedestal(
  url: string,
  pedestalGroup: THREE.Group,
  pedestalIndex: number,
): void {
  // Resolve relative to Vite's base path so proxied deployments work
  const base = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
  const resolved = url.startsWith("/") ? `${base}${url}` : url;

  gltfLoader.load(
    resolved,
    (gltf) => {
      const model = gltf.scene;

      // Force world-matrix update before measuring so scale is accounted for
      model.updateMatrixWorld(true);

      // Compute bounding box in model-local space (model not yet scaled)
      const box    = new THREE.Box3().setFromObject(model);
      const size   = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Scale so the longest axis fits MODEL_BOX metres
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = maxDim > 0 ? MODEL_BOX / maxDim : 1;
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);

      // Re-measure after scaling to find the new bottom Y
      const scaledBox = new THREE.Box3().setFromObject(model);

      // Centre on X/Z, sit flush on pedestal top surface
      model.position.set(
        -center.x * scale,
        TOP_SURFACE_Y - scaledBox.min.y,
        -center.z * scale,
      );

      // Tag every mesh so raycasting can identify which pedestal was hit
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow    = true;
          child.receiveShadow = true;
        }
        child.userData.isPedestal    = true;
        child.userData.pedestalIndex = pedestalIndex;
      });

      pedestalGroup.add(model);
      console.info(`[LegendaryPedestals] Loaded pedestal ${pedestalIndex} model: ${resolved}`);
    },
    undefined,
    (err) => {
      console.warn(`[LegendaryPedestals] Failed to load model "${resolved}":`, err);
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
 * @returns Array of the 4 pedestal THREE.Group objects (for raycasting).
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
): THREE.Group[] {
  const groups: THREE.Group[] = [];
  LEGENDARY_PEDESTAL_POSITIONS.forEach(({ x, z }, i) => {
    const group = buildPedestalGroup(i);
    group.position.set(x, 0, z);
    scene.add(group);
    groups.push(group);

    const url = modelUrls[i];
    if (url && url.trim() !== "") {
      loadModelOnPedestal(url.trim(), group, i);
    }
  });
  return groups;
}
