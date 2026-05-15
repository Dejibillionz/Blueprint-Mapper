import * as THREE from "three";
import type { CommonNFT } from "./CommonGallery";

export type UncommonNFT = CommonNFT;

const FW = 1.06;
const FH = (3.78 - 0.22) / 5 - 0.10; // 0.612 m
const FD = 0.05;
const ART_W   = FW - 0.12;      // 0.94 m
const ART_H   = FH - 0.09;      // 0.522 m
const ART_OFF = FD / 2 + 0.005; // 5 mm past border front face = 0.030 m

const SW = 1.16;
const SH = (3.78 - 0.22) / 5;
const ROWS    = 5;
const Y_START = 0.22;

const INNER_HALF = 0.125;
const ROOM_X_MIN = 29;
const ROOM_X_MAX = 51;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;

type FPos = { x: number; y: number; z: number; rotY: number };

function fillX(
  xF: number, rotY: number, zMin: number, zMax: number,
  out: FPos[],
) {
  const usable = zMax - zMin;
  const cols   = Math.floor(usable / SW);
  if (!cols) return;
  const z0 = zMin + (usable - cols * SW) / 2 + FW / 2;
  for (let r = 0; r < ROWS; r++) {
    const y = Y_START + r * SH + FH / 2;
    for (let c = 0; c < cols; c++) {
      out.push({ x: xF, y, z: z0 + c * SW, rotY });
    }
  }
}

function fillZ(
  zF: number, rotY: number, xMin: number, xMax: number,
  out: FPos[],
) {
  const usable = xMax - xMin;
  const cols   = Math.floor(usable / SW);
  if (!cols) return;
  const x0 = xMin + (usable - cols * SW) / 2 + FW / 2;
  for (let r = 0; r < ROWS; r++) {
    const y = Y_START + r * SH + FH / 2;
    for (let c = 0; c < cols; c++) {
      out.push({ x: x0 + c * SW, y, z: zF, rotY });
    }
  }
}

function generatePositions(): FPos[] {
  const out: FPos[] = [];
  fillZ(ROOM_Z_MIN + INNER_HALF + 0.005, 0, ROOM_X_MIN + 0.4, ROOM_X_MAX - 0.4, out);
  fillZ(ROOM_Z_MAX - INNER_HALF - 0.005, Math.PI, ROOM_X_MIN + 0.4, 37.8, out);
  fillZ(ROOM_Z_MAX - INNER_HALF - 0.005, Math.PI, 42.2, ROOM_X_MAX - 0.4, out);
  fillX(ROOM_X_MIN + INNER_HALF + 0.005, -Math.PI / 2, ROOM_Z_MIN + 0.4, ROOM_Z_MAX - 0.4, out);
  fillX(ROOM_X_MAX - INNER_HALF - 0.005,  Math.PI / 2, ROOM_Z_MIN + 0.4, ROOM_Z_MAX - 0.4, out);
  return out;
}

export function buildUncommonGallery(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMeshes:  THREE.Mesh[];
  nfts:       UncommonNFT[];
} {
  const positions = generatePositions();
  const count     = positions.length;

  const nfts: UncommonNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Uncommon #${String(i + 1).padStart(4, "0")}`,
    artist: "10K Squad",
  }));

  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xb8d46e, metalness: 0.55, roughness: 0.40,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);
  borderMesh.userData = { isUncommonGallery: true, nfts };

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
      color: 0x0d1a0d, roughness: 0.9, side: THREE.DoubleSide,
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
