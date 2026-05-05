import * as THREE from "three";

// ── Frame slot dimensions ─────────────────────────────────────────
const FW = 0.52;          // frame width  (m)
const FH = 0.36;          // frame height (m)
const FD = 0.04;          // frame depth  (m)
const GH = 0.08;          // horizontal gap
const GV = 0.10;          // vertical gap
const SW = FW + GH;       // slot width  0.60 m
const SH = FH + GV;       // slot height 0.46 m

const WALL_H  = 4;
const Y_START = 0.22;     // lowest frame centre
const Y_END   = 3.78;     // highest frame centre
const ROWS    = Math.floor((Y_END - Y_START) / SH); // 7 rows

export const TOTAL_COMMON = 2967;

export interface CommonNFT {
  id: number;
  title: string;
  artist: string;
  imageUrl?: string;
}

// ── Navigation gap boundaries inside each partition ───────────────
// Gaps are aligned with the doors in the east wall of Room 1
// (D1 upper z=13-15, D1 lower z=20-22)
export const PART_SEGS: Array<[number, number]> = [
  [1.0,  12.7],
  [15.5, 19.5],
  [22.5, 29.0],
];

// x positions of the 4 internal partitions
export const PARTITION_XS = [3.375, 6.75, 13.5, 20.25] as const;

// ── Position generators ───────────────────────────────────────────
type FPos = { x: number; y: number; z: number; rotY: number };

/** Frames on a wall at fixed z, spanning x. */
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

/** Frames on a wall at fixed x, spanning z. */
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

function generatePositions(): FPos[] {
  const out: FPos[] = [];
  const N = TOTAL_COMMON;

  // ── Room-1 boundary walls ─────────────────────────────────────
  // North outer wall  (z≈0, outer thickness 0.5 → inner face z=0.5)
  fillZ(0.27,   0,            0.6, 26.4, out, N); // art faces south

  // South inner wall  (z=30, inner thickness 0.25 → north face z=29.875)
  fillZ(29.87,  Math.PI,      0.6, 25.4, out, N); // art faces north

  // West outer wall   (x=0, inner face x=0.5)
  fillX(0.27,  -Math.PI / 2,  0.6, 29.4, out, N); // art faces east

  // East inner wall   (x=26, west face ≈ 25.875) — split around doors
  fillX(25.87,  Math.PI / 2,  0.6, 12.8, out, N); // seg 1
  fillX(25.87,  Math.PI / 2, 15.2, 19.8, out, N); // seg 2
  fillX(25.87,  Math.PI / 2, 22.2, 29.4, out, N); // seg 3

  // ── Internal partitions (both faces, with navigation gaps) ────
  for (const px of PARTITION_XS) {
    if (out.length >= N) break;
    // East-facing face (art visible from east / higher x)
    for (const [z1, z2] of PART_SEGS) {
      fillX(px + 0.078, -Math.PI / 2, z1, z2, out, N);
    }
    // West-facing face (art visible from west / lower x)
    for (const [z1, z2] of PART_SEGS) {
      fillX(px - 0.078,  Math.PI / 2, z1, z2, out, N);
    }
  }

  return out;
}

// ── Public builder ────────────────────────────────────────────────
export function buildCommonGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMesh:    THREE.InstancedMesh;
  nfts:       CommonNFT[];
} {
  const positions = generatePositions();
  const count     = positions.length; // ≤ TOTAL_COMMON

  // Build NFT metadata array (placeholders — metadata injected later)
  const nfts: CommonNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Genesis #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  // ── Partition wall meshes (physical geometry with nav gaps) ──────
  const partMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8 });
  for (const px of PARTITION_XS) {
    for (const [z1, z2] of PART_SEGS) {
      const len  = z2 - z1;
      const geo  = new THREE.BoxGeometry(0.15, WALL_H, len);
      const mesh = new THREE.Mesh(geo, partMat);
      mesh.position.set(px, WALL_H / 2, (z1 + z2) / 2);
      mesh.receiveShadow = true;
      mesh.castShadow    = true;
      scene.add(mesh);
    }
  }

  // ── Gold border InstancedMesh ────────────────────────────────────
  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xc8a96e, metalness: 0.55, roughness: 0.45,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);

  // ── Dark placeholder canvas InstancedMesh ────────────────────────
  const artGeo = new THREE.BoxGeometry(FW - 0.10, FH - 0.07, FD * 0.5);
  const artMat = new THREE.MeshStandardMaterial({ color: 0x12121e, roughness: 0.9 });
  const artMesh = new THREE.InstancedMesh(artGeo, artMat, count);

  // ── Populate matrices ────────────────────────────────────────────
  const dummy   = new THREE.Object3D();
  const fwdVec  = new THREE.Vector3();

  positions.forEach(({ x, y, z, rotY }, i) => {
    // Border
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    borderMesh.setMatrixAt(i, dummy.matrix);

    // Canvas — offset slightly "forward" from frame centre so it sits proud
    fwdVec.set(0, 0, FD * 0.22).applyEuler(dummy.rotation);
    dummy.position.set(x + fwdVec.x, y + fwdVec.y, z + fwdVec.z);
    dummy.updateMatrix();
    artMesh.setMatrixAt(i, dummy.matrix);
  });

  borderMesh.instanceMatrix.needsUpdate = true;
  artMesh.instanceMatrix.needsUpdate    = true;

  // Tag for hit-detection in MuseumWalker
  borderMesh.userData = { isCommonGallery: true, nfts };
  artMesh.userData    = { isCommonGallery: true, nfts };

  scene.add(borderMesh);
  scene.add(artMesh);

  return { borderMesh, artMesh, nfts };
}
