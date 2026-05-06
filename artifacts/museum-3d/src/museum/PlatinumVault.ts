import * as THREE from "three";

export interface PlatinumNFT {
  id:       number;
  title:    string;
  artist:   string;
  imageUrl?: string;
}

const FW           = 2.50;
const FH           = FW;
const FD           = 0.08;
const ART_W        = FW - 0.14;      // 2.36 m
const ART_H        = FH - 0.14;      // 2.36 m
const ART_OFF      = FD / 2 + 0.005; // 5 mm past border front face = 0.045 m
const INNER_HALF   = 0.125;
const OUTER_HALF   = 0.250;
const FACE_OFFSET  = INNER_HALF + 0.005;

const ROOM_X_MIN = 77;
const ROOM_X_MAX = 100;
const ROOM_Z_MIN = 4;
const ROOM_Z_MAX = 22;
const Y_CENTER = 2.0;

type Pos = { x: number; y: number; z: number; rotY: number };

function westPositions(): Pos[] {
  const xF = ROOM_X_MIN + FACE_OFFSET;
  const span = ROOM_Z_MAX - ROOM_Z_MIN;
  const gap  = (span - 3 * FW) / 4;
  return [0, 1, 2].map(i => ({
    x: xF, y: Y_CENTER,
    z: ROOM_Z_MIN + gap + FW / 2 + i * (FW + gap),
    rotY: -Math.PI / 2,
  }));
}

function eastPositions(): Pos[] {
  const xF = ROOM_X_MAX - OUTER_HALF - 0.005;
  const span = ROOM_Z_MAX - ROOM_Z_MIN;
  const gap  = (span - 3 * FW) / 4;
  return [0, 1, 2].map(i => ({
    x: xF, y: Y_CENTER,
    z: ROOM_Z_MIN + gap + FW / 2 + i * (FW + gap),
    rotY: Math.PI / 2,
  }));
}

function northPositions(): Pos[] {
  const zF = ROOM_Z_MIN + FACE_OFFSET;
  const span = ROOM_X_MAX - ROOM_X_MIN;
  const gap  = (span - 5 * FW) / 6;
  return [0, 1, 2, 3, 4].map(i => ({
    x: ROOM_X_MIN + gap + FW / 2 + i * (FW + gap),
    y: Y_CENTER, z: zF, rotY: 0,
  }));
}

function allPositions(): Pos[] {
  return [...westPositions(), ...eastPositions(), ...northPositions()];
}

export function buildPlatinumVault(scene: THREE.Scene): {
  borderMesh: THREE.InstancedMesh;
  artMeshes:  THREE.Mesh[];
  nfts:       PlatinumNFT[];
} {
  const positions = allPositions();
  const count = positions.length;

  const borderGeo = new THREE.BoxGeometry(FW, FH, FD);
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d4, metalness: 0.80, roughness: 0.20,
  });
  const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);
  borderMesh.userData = { isPlatinumVault: true };

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
      color: 0x120a1e, roughness: 0.88, side: THREE.DoubleSide,
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

  const nfts: PlatinumNFT[] = positions.map((_, i) => ({
    id:     i + 1,
    title:  `Platinum #${String(i + 1).padStart(4, "0")}`,
    artist: "Origin Protocol",
  }));

  return { borderMesh, artMeshes, nfts };
}
