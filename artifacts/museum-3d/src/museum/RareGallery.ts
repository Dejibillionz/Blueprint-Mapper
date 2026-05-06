import * as THREE from "three";
import type { CommonNFT } from "./CommonGallery";

export type RareNFT = CommonNFT;

// ── Per-wall frame dimensions ─────────────────────────────────────
//
//  Room 3: x = 54–74, z = 4–22
//
//  NORTH wall (25 frames — 5 cols × 5 rows):
//    span = 19.2 m  → SW_N = 3.84 m → FW_N = 3.54 m
//    ROWS_N = 5     → SH_N = 0.712 m → FH_N = 0.612 m
//
//  WEST / EAST walls (15 frames each — 5 cols × 3 rows):
//    span = 17.2 m  → SW_S = 3.44 m → FW_S = 3.14 m
//    ROWS_S = 3     → SH_S = 1.187 m → FH_S = 1.067 m
//
//  Total: 25 + 15 + 15 = 55 frames
//
const Y_START  = 0.22;
const Y_END    = 3.78;
const Y_RANGE  = Y_END - Y_START; // 3.56 m

const N_COLS = 5, N_ROWS = 5;
const S_COLS = 5, S_ROWS = 3;

const FD      = 0.07;   // frame depth — thick for impact

// North dimensions
const SW_N  = 19.2 / N_COLS;                // 3.84 m
const FW_N  = SW_N - 0.30;                  // 3.54 m
const SH_N  = Y_RANGE / N_ROWS;             // 0.712 m
const FH_N  = SH_N - 0.10;                  // 0.612 m

// Side dimensions
const SW_S  = 17.2 / S_COLS;               // 3.44 m
const FW_S  = SW_S - 0.30;                 // 3.14 m
const SH_S  = Y_RANGE / S_ROWS;            // 1.187 m
const FH_S  = SH_S - 0.12;                 // 1.067 m

// ── Room 3 boundaries ─────────────────────────────────────────────
const INNER_HALF = 0.125;
const ROOM_X_MIN = 54;
const ROOM_X_MAX = 74;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;
const MARGIN     = 0.4;

// ── Position types ────────────────────────────────────────────────
type FPosN = { x: number; y: number; z: number; rotY: number };

// ── North wall positions (5×5 = 25) ──────────────────────────────
function northPositions(): FPosN[] {
  const zF   = ROOM_Z_MIN + INNER_HALF + 0.005; // ~4.13, art faces south (rotY=0)
  const xMin = ROOM_X_MIN + MARGIN;
  const span = (ROOM_X_MAX - MARGIN) - xMin;    // 19.2 m
  const x0   = xMin + (span - N_COLS * SW_N) / 2 + FW_N / 2;
  const out: FPosN[] = [];
  for (let r = 0; r < N_ROWS; r++) {
    const y = Y_START + r * SH_N + FH_N / 2;
    for (let c = 0; c < N_COLS; c++) {
      out.push({ x: x0 + c * SW_N, y, z: zF, rotY: 0 });
    }
  }
  return out;
}

// ── Side wall positions (5×3 = 15 per wall) ──────────────────────
function sidePositions(xF: number, rotY: number): FPosN[] {
  const zMin = ROOM_Z_MIN + MARGIN;
  const span = (ROOM_Z_MAX - MARGIN) - zMin;    // 17.2 m
  const z0   = zMin + (span - S_COLS * SW_S) / 2 + FW_S / 2;
  const out: FPosN[] = [];
  for (let r = 0; r < S_ROWS; r++) {
    const y = Y_START + r * SH_S + FH_S / 2;
    for (let c = 0; c < S_COLS; c++) {
      out.push({ x: xF, y, z: z0 + c * SW_S, rotY });
    }
  }
  return out;
}

// ── Instanced mesh builder ────────────────────────────────────────
function buildMesh(
  positions: FPosN[], fw: number, fh: number,
  borderColor: number, canvasColor: number,
  scene: THREE.Scene,
): { border: THREE.InstancedMesh; art: THREE.InstancedMesh } {
  const count = positions.length;

  const borderGeo = new THREE.BoxGeometry(fw, fh, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: borderColor, metalness: 0.65, roughness: 0.30,
  });
  const border = new THREE.InstancedMesh(borderGeo, borderMat, count);

  const artGeo = new THREE.BoxGeometry(fw - 0.18, fh - 0.14, FD * 0.45);
  const artMat = new THREE.MeshStandardMaterial({ color: canvasColor, roughness: 0.85 });
  const art = new THREE.InstancedMesh(artGeo, artMat, count);

  const dummy  = new THREE.Object3D();
  const fwdVec = new THREE.Vector3();

  positions.forEach(({ x, y, z, rotY }, i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    border.setMatrixAt(i, dummy.matrix);

    fwdVec.set(0, 0, FD * 0.20).applyEuler(dummy.rotation);
    dummy.position.set(x + fwdVec.x, y + fwdVec.y, z + fwdVec.z);
    dummy.updateMatrix();
    art.setMatrixAt(i, dummy.matrix);
  });

  border.instanceMatrix.needsUpdate = true;
  art.instanceMatrix.needsUpdate    = true;
  scene.add(border);
  scene.add(art);
  return { border, art };
}

// ── Public builder ────────────────────────────────────────────────
// Returns two border meshes (north + sides) and a flat 55-NFT array.
// instanceId on northBorder → nfts[instanceId]
// instanceId on sidesBorder → nfts[25 + instanceId]
export function buildRareGallery(scene: THREE.Scene): {
  northBorder:  THREE.InstancedMesh;
  sidesBorder:  THREE.InstancedMesh;
  nfts:         RareNFT[];
} {
  const BORDER_COLOR = 0x4a90e2;  // rare blue
  const CANVAS_COLOR = 0x030d1a;  // deep navy placeholder

  const nPos = northPositions();
  const wPos = sidePositions(ROOM_X_MIN + INNER_HALF + 0.005, -Math.PI / 2); // west, faces east
  const ePos = sidePositions(ROOM_X_MAX - INNER_HALF - 0.005,  Math.PI / 2); // east, faces west

  const sidesPos = [...wPos, ...ePos]; // 30 side positions

  const nfts: RareNFT[] = [
    ...nPos.map((_, i) => ({
      id: i + 1, title: `Rare #${String(i + 1).padStart(4, "0")}`, artist: "Origin Protocol",
    })),
    ...sidesPos.map((_, i) => ({
      id: 26 + i, title: `Rare #${String(26 + i).padStart(4, "0")}`, artist: "Origin Protocol",
    })),
  ];

  const { border: northBorder }  = buildMesh(nPos,      FW_N, FH_N, BORDER_COLOR, CANVAS_COLOR, scene);
  const { border: sidesBorder }  = buildMesh(sidesPos,  FW_S, FH_S, BORDER_COLOR, CANVAS_COLOR, scene);

  northBorder.userData = { isRareGallery: true, section: "north" };
  sidesBorder.userData = { isRareGallery: true, section: "sides" };

  return { northBorder, sidesBorder, nfts };
}

export const RARE_NORTH_COUNT = N_COLS * N_ROWS; // 25 — used by MuseumWalker for index offset
