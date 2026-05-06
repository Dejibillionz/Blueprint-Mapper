import * as THREE from "three";

export interface PlatinumNFT {
  id:       number;
  title:    string;
  artist:   string;
  imageUrl?: string;
}

// ── Platinum Vault — room_4: x=77–100, z=4–22 ──────────────────────
//
//  11 square frames, single row:
//    West  wall (x=77 face):  3 frames, FW=2.50 m, gap=2.625 m
//    East  wall (x=100 face): 3 frames, same
//    North wall (z=4  face):  5 frames, FW=2.50 m, gap=1.75 m
//
const FW          = 2.50;   // frame width  (square ⇒ height = FW)
const FH          = FW;     // square
const FD          = 0.08;   // frame depth
const INNER_HALF  = 0.125;  // half of INNER_THICKNESS (0.25)
const FACE_OFFSET = INNER_HALF + 0.005;

const ROOM_X_MIN = 77;
const ROOM_X_MAX = 100;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;

const Y_CENTER = 2.0;  // single-row vertical centre (wall_height=4)

type Pos = { x: number; y: number; z: number; rotY: number };

function westPositions(): Pos[] {
  const xF = ROOM_X_MIN + FACE_OFFSET;
  const span = ROOM_Z_MAX - ROOM_Z_MIN;   // 18 m
  const gap  = (span - 3 * FW) / 4;       // 2.625 m
  return [0, 1, 2].map(i => ({
    x: xF,
    y: Y_CENTER,
    z: ROOM_Z_MIN + gap + FW / 2 + i * (FW + gap),
    rotY: -Math.PI / 2,   // faces east (into room)
  }));
}

function eastPositions(): Pos[] {
  const xF = ROOM_X_MAX - FACE_OFFSET;
  const span = ROOM_Z_MAX - ROOM_Z_MIN;
  const gap  = (span - 3 * FW) / 4;
  return [0, 1, 2].map(i => ({
    x: xF,
    y: Y_CENTER,
    z: ROOM_Z_MIN + gap + FW / 2 + i * (FW + gap),
    rotY: Math.PI / 2,    // faces west (into room)
  }));
}

function northPositions(): Pos[] {
  const zF = ROOM_Z_MIN + FACE_OFFSET;
  const span = ROOM_X_MAX - ROOM_X_MIN;   // 23 m
  const gap  = (span - 5 * FW) / 6;       // 1.75 m
  return [0, 1, 2, 3, 4].map(i => ({
    x: ROOM_X_MIN + gap + FW / 2 + i * (FW + gap),
    y: Y_CENTER,
    z: zF,
    rotY: 0,              // faces south (into room)
  }));
}

function allPositions(): Pos[] {
  return [
    ...westPositions(),
    ...eastPositions(),
    ...northPositions(),
  ];
}

export function buildPlatinumVault(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  nfts:       PlatinumNFT[];
} {
  const BORDER_COLOR = 0xd4d4d4;  // platinum silver
  const CANVAS_COLOR = 0x120a1e;  // deep vault purple placeholder

  const positions = allPositions();   // 11 total
  const count = positions.length;

  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: BORDER_COLOR, metalness: 0.80, roughness: 0.20,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);

  const artGeo = new THREE.BoxGeometry(FW - 0.14, FH - 0.14, FD * 0.45);
  const artMat = new THREE.MeshStandardMaterial({ color: CANVAS_COLOR, roughness: 0.88 });
  const artMesh = new THREE.InstancedMesh(artGeo, artMat, count);

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
  borderMesh.userData = { isPlatinumVault: true };

  scene.add(borderMesh);
  scene.add(artMesh);

  const nfts: PlatinumNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Platinum #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  return { borderMesh, nfts };
}
