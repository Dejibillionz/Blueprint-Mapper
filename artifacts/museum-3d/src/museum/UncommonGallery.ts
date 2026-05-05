import * as THREE from "three";
import type { CommonNFT } from "./CommonGallery";

export type UncommonNFT = CommonNFT;

// ── Shared frame slot constants ───────────────────────────────────
const FW = 0.52;
const FH = 0.36;
const FD = 0.04;
const SW = FW + 0.08;   // 0.60 m slot width
const SH = FH + 0.10;   // 0.46 m slot height
const WALL_H  = 4;
const Y_START = 0.22;
const Y_END   = 3.78;
const ROWS    = Math.floor((Y_END - Y_START) / SH); // 7

export const TOTAL_UNCOMMON = 300;

// ── Room 2 (Uncommon Wing) boundaries ────────────────────────────
// room_2: x = 29-51, z = 4-22
// Inner wall thickness 0.25 → half = 0.125
const INNER_HALF = 0.125;

// Door D2 in south wall at x = 38-42
const ROOM_X_MIN = 29;
const ROOM_X_MAX = 51;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;

// ── Position generator ────────────────────────────────────────────
type FPos = { x: number; y: number; z: number; rotY: number };

function fillX(
  xF: number, rotY: number, zMin: number, zMax: number,
  out: FPos[], cap: number,
) {
  const usable = zMax - zMin;
  const cols   = Math.floor(usable / SW);
  if (!cols) return;
  const z0 = zMin + (usable - cols * SW) / 2 + FW / 2;
  for (let r = 0; r < ROWS && out.length < cap; r++) {
    const y = Y_START + r * SH + FH / 2;
    for (let c = 0; c < cols && out.length < cap; c++) {
      out.push({ x: xF, y, z: z0 + c * SW, rotY });
    }
  }
}

function fillZ(
  zF: number, rotY: number, xMin: number, xMax: number,
  out: FPos[], cap: number,
) {
  const usable = xMax - xMin;
  const cols   = Math.floor(usable / SW);
  if (!cols) return;
  const x0 = xMin + (usable - cols * SW) / 2 + FW / 2;
  for (let r = 0; r < ROWS && out.length < cap; r++) {
    const y = Y_START + r * SH + FH / 2;
    for (let c = 0; c < cols && out.length < cap; c++) {
      out.push({ x: x0 + c * SW, y, z: zF, rotY });
    }
  }
}

function generatePositions(): FPos[] {
  const out: FPos[] = [];
  const N = TOTAL_UNCOMMON;

  // South wall (corridor north wall z=22) — split around D2 door (x=38-42)
  // West segment  x=29.4 → 37.8, art faces north (rotY=π)
  fillZ(ROOM_Z_MAX - INNER_HALF - 0.005, Math.PI, ROOM_X_MIN + 0.4, 37.8, out, N);
  // East segment  x=42.2 → 50.6, art faces north
  fillZ(ROOM_Z_MAX - INNER_HALF - 0.005, Math.PI, 42.2, ROOM_X_MAX - 0.4, out, N);

  // West wall (x=29, east face) — art faces east (rotY = -π/2)
  fillX(ROOM_X_MIN + INNER_HALF + 0.005, -Math.PI / 2, ROOM_Z_MIN + 0.4, ROOM_Z_MAX - 0.4, out, N);

  // East wall (x=51, west face) — art faces west (rotY = π/2)
  fillX(ROOM_X_MAX - INNER_HALF - 0.005, Math.PI / 2, ROOM_Z_MIN + 0.4, ROOM_Z_MAX - 0.4, out, N);

  return out;
}

// ── Public builder ────────────────────────────────────────────────
export function buildUncommonGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMesh:    THREE.InstancedMesh;
  nfts:       UncommonNFT[];
} {
  const positions = generatePositions();
  const count     = positions.length;

  const nfts: UncommonNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Uncommon #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  // ── Gold border InstancedMesh ─────────────────────────────────────
  // Slightly brighter gold-green tint for Uncommon tier
  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xb8d46e, metalness: 0.55, roughness: 0.40,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);

  // ── Dark placeholder canvas — green-tinted ────────────────────────
  const artGeo = new THREE.BoxGeometry(FW - 0.10, FH - 0.07, FD * 0.5);
  const artMat = new THREE.MeshStandardMaterial({ color: 0x0d1a0d, roughness: 0.9 });
  const artMesh = new THREE.InstancedMesh(artGeo, artMat, count);

  // ── Populate matrices ─────────────────────────────────────────────
  const dummy  = new THREE.Object3D();
  const fwdVec = new THREE.Vector3();

  positions.forEach(({ x, y, z, rotY }, i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    borderMesh.setMatrixAt(i, dummy.matrix);

    fwdVec.set(0, 0, FD * 0.22).applyEuler(dummy.rotation);
    dummy.position.set(x + fwdVec.x, y + fwdVec.y, z + fwdVec.z);
    dummy.updateMatrix();
    artMesh.setMatrixAt(i, dummy.matrix);
  });

  borderMesh.instanceMatrix.needsUpdate = true;
  artMesh.instanceMatrix.needsUpdate    = true;

  borderMesh.userData = { isUncommonGallery: true, nfts };
  artMesh.userData    = { isUncommonGallery: true, nfts };

  scene.add(borderMesh);
  scene.add(artMesh);

  return { borderMesh, artMesh, nfts };
}
