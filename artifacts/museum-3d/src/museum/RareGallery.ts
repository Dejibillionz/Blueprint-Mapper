import * as THREE from "three";
import type { CommonNFT } from "./CommonGallery";

export type RareNFT = CommonNFT;

// ── Uniform frame dimensions — all 4 walls ─────────────────────────
//
//  Room 3: x = 54–74, z = 4–22
//
//  ROWS = 2, SW = 2.40 m → FW = 2.28 m
//                SH = 1.78 m → FH = 1.66 m   (ratio 1.37 — nearly square)
//
//  Distribution:
//    North full wall (19.2 m):  8 cols × 2 rows = 16
//    South-left  (x=54.4–62):   3 cols × 2 rows =  6  ← avoids door gap x=62–66
//    South-right (x=66–73.6):   3 cols × 2 rows =  6
//    West wall   (17.2 m):      7 cols × 2 rows = 14
//    East wall   (17.2 m):      7 cols × 2 rows = 14
//    TOTAL                                       = 56
//
const Y_START = 0.22;
const Y_END   = 3.78;
const Y_RANGE = Y_END - Y_START;  // 3.56 m

const ROWS = 2;
const SW   = 2.40;    // slot width
const FW   = SW - 0.12;   // 2.28 m frame width
const SH   = Y_RANGE / ROWS;  // 1.78 m slot height
const FH   = SH - 0.12;   // 1.66 m frame height
const FD   = 0.07;         // frame depth

const INNER_HALF = 0.125;
const ROOM_X_MIN = 54;
const ROOM_X_MAX = 74;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;
const MARGIN     = 0.4;   // wall-end margin

// ── Row Y centers ──────────────────────────────────────────────────
function rowYs(): number[] {
  return Array.from({ length: ROWS }, (_, r) => Y_START + r * SH + FH / 2);
}

// ── Generic fill: horizontal wall (z fixed, x varies) ─────────────
function fillHorizontal(
  xMin: number, xMax: number,
  zF: number, rotY: number,
  positions: { x: number; y: number; z: number; rotY: number }[],
): void {
  const span = xMax - xMin;
  const cols = Math.floor(span / SW);
  const x0   = xMin + (span - cols * SW) / 2 + FW / 2;
  for (const y of rowYs()) {
    for (let c = 0; c < cols; c++) {
      positions.push({ x: x0 + c * SW, y, z: zF, rotY });
    }
  }
}

// ── Generic fill: vertical wall (x fixed, z varies) ───────────────
function fillVertical(
  zMin: number, zMax: number,
  xF: number, rotY: number,
  positions: { x: number; y: number; z: number; rotY: number }[],
): void {
  const span = zMax - zMin;
  const cols = Math.floor(span / SW);
  const z0   = zMin + (span - cols * SW) / 2 + FW / 2;
  for (const y of rowYs()) {
    for (let c = 0; c < cols; c++) {
      positions.push({ x: xF, y, z: z0 + c * SW, rotY });
    }
  }
}

// ── Position builder ───────────────────────────────────────────────
function allPositions(): { x: number; y: number; z: number; rotY: number }[] {
  const out: { x: number; y: number; z: number; rotY: number }[] = [];

  const zN = ROOM_Z_MIN + INNER_HALF + 0.005;  // north face (~4.13)
  const zS = ROOM_Z_MAX - INNER_HALF - 0.005;  // south face (~21.87)
  const xW = ROOM_X_MIN + INNER_HALF + 0.005;  // west face (~54.13)
  const xE = ROOM_X_MAX - INNER_HALF - 0.005;  // east face (~73.87)

  // North — full span, rotY=0 (faces south)
  fillHorizontal(
    ROOM_X_MIN + MARGIN, ROOM_X_MAX - MARGIN,
    zN, 0, out,
  );

  // South-left — left of door gap (x=54.4 → 62), rotY=π (faces north)
  fillHorizontal(ROOM_X_MIN + MARGIN, 62, zS, Math.PI, out);

  // South-right — right of door gap (x=66 → 73.6), rotY=π
  fillHorizontal(66, ROOM_X_MAX - MARGIN, zS, Math.PI, out);

  // West — rotY=−π/2 (faces east)
  fillVertical(
    ROOM_Z_MIN + MARGIN, ROOM_Z_MAX - MARGIN,
    xW, -Math.PI / 2, out,
  );

  // East — rotY=π/2 (faces west)
  fillVertical(
    ROOM_Z_MIN + MARGIN, ROOM_Z_MAX - MARGIN,
    xE, Math.PI / 2, out,
  );

  return out;
}

// ── InstancedMesh builder ──────────────────────────────────────────
export function buildRareGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  nfts:       RareNFT[];
} {
  const BORDER_COLOR = 0x4a90e2;  // rare blue metallic
  const CANVAS_COLOR = 0x030d1a;  // deep navy placeholder

  const positions = allPositions();
  const count = positions.length;  // 56

  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: BORDER_COLOR, metalness: 0.65, roughness: 0.30,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);

  const artGeo = new THREE.BoxGeometry(FW - 0.16, FH - 0.14, FD * 0.45);
  const artMat = new THREE.MeshStandardMaterial({ color: CANVAS_COLOR, roughness: 0.85 });
  const artMesh = new THREE.InstancedMesh(artGeo, artMat, count);

  const dummy  = new THREE.Object3D();
  const fwdVec = new THREE.Vector3();

  positions.forEach(({ x, y, z, rotY }, i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    borderMesh.setMatrixAt(i, dummy.matrix);

    fwdVec.set(0, 0, FD * 0.20).applyEuler(dummy.rotation);
    dummy.position.set(x + fwdVec.x, y + fwdVec.y, z + fwdVec.z);
    dummy.updateMatrix();
    artMesh.setMatrixAt(i, dummy.matrix);
  });

  borderMesh.instanceMatrix.needsUpdate = true;
  artMesh.instanceMatrix.needsUpdate    = true;
  borderMesh.userData = { isRareGallery: true };

  scene.add(borderMesh);
  scene.add(artMesh);

  const nfts: RareNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Rare #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  return { borderMesh, nfts };
}
