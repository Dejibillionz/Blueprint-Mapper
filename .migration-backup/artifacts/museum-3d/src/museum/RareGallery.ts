import * as THREE from "three";
import type { CommonNFT } from "./CommonGallery";

export type RareNFT = CommonNFT;

const Y_START = 0.22;
const Y_END   = 3.78;
const Y_RANGE = Y_END - Y_START;

const ROWS = 2;
const SW   = 2.40;
const FW   = SW - 0.12;        // 2.28 m
const SH   = Y_RANGE / ROWS;
const FH   = SH - 0.12;        // 1.66 m
const FD   = 0.07;
const ART_W   = FW - 0.16;      // 2.12 m
const ART_H   = FH - 0.14;      // 1.52 m
const ART_OFF = FD / 2 + 0.005; // 5 mm past border front face = 0.040 m

const INNER_HALF = 0.125;
const ROOM_X_MIN = 54;
const ROOM_X_MAX = 74;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;
const MARGIN     = 0.4;

function rowYs(): number[] {
  return Array.from({ length: ROWS }, (_, r) => Y_START + r * SH + FH / 2);
}

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

function allPositions(): { x: number; y: number; z: number; rotY: number }[] {
  const out: { x: number; y: number; z: number; rotY: number }[] = [];
  const zN = ROOM_Z_MIN + INNER_HALF + 0.005;
  const zS = ROOM_Z_MAX - INNER_HALF - 0.005;
  const xW = ROOM_X_MIN + INNER_HALF + 0.005;
  const xE = ROOM_X_MAX - INNER_HALF - 0.005;

  fillHorizontal(ROOM_X_MIN + MARGIN, ROOM_X_MAX - MARGIN, zN, 0, out);
  fillHorizontal(ROOM_X_MIN + MARGIN, 62, zS, Math.PI, out);
  fillHorizontal(66, ROOM_X_MAX - MARGIN, zS, Math.PI, out);
  fillVertical(ROOM_Z_MIN + MARGIN, ROOM_Z_MAX - MARGIN, xW, -Math.PI / 2, out);
  fillVertical(ROOM_Z_MIN + MARGIN, ROOM_Z_MAX - MARGIN, xE,  Math.PI / 2, out);
  return out;
}

export function buildRareGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMeshes:  THREE.Mesh[];
  nfts:       RareNFT[];
} {
  const positions = allPositions();
  const count = positions.length;

  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0x4a90e2, metalness: 0.65, roughness: 0.30,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);
  borderMesh.userData = { isRareGallery: true };

  const dummy = new THREE.Object3D();
  positions.forEach(({ x, y, z, rotY }, i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    borderMesh.setMatrixAt(i, dummy.matrix);
  });
  borderMesh.instanceMatrix.needsUpdate = true;
  scene.add(borderMesh);

  const artGeo = new THREE.PlaneGeometry(ART_W, ART_H);
  const towardRoom = new THREE.Vector3();

  const artMeshes: THREE.Mesh[] = positions.map(({ x, y, z, rotY }) => {
    towardRoom.set(-Math.sin(rotY), 0, Math.cos(rotY));
    const mat = new THREE.MeshStandardMaterial({
      color: 0x030d1a, roughness: 0.85, side: THREE.DoubleSide,
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

  const nfts: RareNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Rare #${String(i + 1).padStart(4, "0")}`,
    artist: "10K Squad",
  }));

  return { borderMesh, artMeshes, nfts };
}
