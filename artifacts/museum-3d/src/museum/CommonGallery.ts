import * as THREE from "three";

const FW = 0.52;
const FH = 0.36;
const FD = 0.04;
const ART_W   = FW - 0.10;     // 0.42 m
const ART_H   = FH - 0.07;     // 0.29 m
const ART_OFF = FD / 2 + 0.005; // 5 mm past border front face = 0.025 m

const GH = 0.08;
const GV = 0.10;
const SW = FW + GH;
const SH = FH + GV;

const WALL_H  = 4;
const Y_START = 0.22;
const Y_END   = 3.78;
const ROWS    = Math.floor((Y_END - Y_START) / SH);

export const TOTAL_COMMON = 2967;

export interface CommonNFT {
  id: number;
  title: string;
  artist: string;
  imageUrl?: string;
}

export const PART_SEGS: Array<[number, number]> = [
  [1.0,  12.7],
  [15.5, 19.5],
  [22.5, 29.0],
];

export const PARTITION_XS = [3.375, 6.75, 13.5, 20.25] as const;

type FPos = { x: number; y: number; z: number; rotY: number };

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

  fillZ(0.27,   0,            0.6, 25.4, out, N);
  fillZ(29.87,  Math.PI,      0.6, 25.4, out, N);
  fillX(0.27,  -Math.PI / 2,  0.6, 29.4, out, N);
  fillX(25.87,  Math.PI / 2,  0.6, 12.8, out, N);
  fillX(25.87,  Math.PI / 2, 15.2, 19.8, out, N);
  fillX(25.87,  Math.PI / 2, 22.2, 29.4, out, N);

  for (const px of PARTITION_XS) {
    if (out.length >= N) break;
    for (const [z1, z2] of PART_SEGS) {
      fillX(px + 0.078, -Math.PI / 2, z1, z2, out, N);
    }
    for (const [z1, z2] of PART_SEGS) {
      fillX(px - 0.078,  Math.PI / 2, z1, z2, out, N);
    }
  }

  return out;
}

export function buildCommonGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMeshes:  THREE.Mesh[];
  nfts:       CommonNFT[];
} {
  const positions = generatePositions();
  const count     = positions.length;

  const nfts: CommonNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Genesis #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  // ── Partition wall meshes ─────────────────────────────────────────
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

  // ── Gold border InstancedMesh ──────────────────────────────────────
  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xc8a96e, metalness: 0.55, roughness: 0.45,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);
  borderMesh.userData = { isCommonGallery: true, nfts };

  const dummy = new THREE.Object3D();
  positions.forEach(({ x, y, z, rotY }, i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    borderMesh.setMatrixAt(i, dummy.matrix);
  });
  borderMesh.instanceMatrix.needsUpdate = true;
  scene.add(borderMesh);

  // ── Individual art plane meshes ────────────────────────────────────
  // towardRoom = (-sin(rotY), 0, cos(rotY)) is the room-facing direction
  // for every wall orientation (verified for N/S/E/W and all partitions).
  // Placing the plane at ART_OFF = FD/2 + 0.005 m past the border front
  // face ensures it is never depth-culled behind the gold border.
  const artGeo = new THREE.PlaneGeometry(ART_W, ART_H);
  const towardRoom = new THREE.Vector3();

  const artMeshes: THREE.Mesh[] = positions.map(({ x, y, z, rotY }) => {
    towardRoom.set(-Math.sin(rotY), 0, Math.cos(rotY));
    const mat = new THREE.MeshStandardMaterial({
      color: 0x12121e, roughness: 0.9, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(artGeo, mat);
    mesh.position.set(
      x + towardRoom.x * ART_OFF,
      y,
      z + towardRoom.z * ART_OFF,
    );
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  });

  return { borderMesh, artMeshes, nfts };
}
