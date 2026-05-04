import * as THREE from "three";
import { outerWalls, innerWalls, rooms, WALL_HEIGHT, WALL_THICKNESS } from "../data/floorplan";

function buildWallMesh(
  x1: number, z1: number,
  x2: number, z2: number,
  height: number,
  thickness: number,
  material: THREE.Material
): THREE.Mesh {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geo, material);

  mesh.position.set(
    (x1 + x2) / 2,
    height / 2,
    (z1 + z2) / 2
  );
  mesh.rotation.y = -angle;
  return mesh;
}

function makeLabel(text: string, color: string = "#ffffff"): THREE.Sprite {
  const lines = text.split("\n");
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128 * lines.length;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = "bold 56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, (i + 0.5) * 128);
  });
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(8, 2 * lines.length, 1);
  return sprite;
}

export function buildScene(scene: THREE.Scene) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xd0ccc8 });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });

  const mainFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    floorMat
  );
  mainFloor.rotation.x = -Math.PI / 2;
  mainFloor.position.set(50, 0, 26);
  mainFloor.receiveShadow = true;
  scene.add(mainFloor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    ceilMat
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(50, WALL_HEIGHT, 26);
  scene.add(ceiling);

  for (const room of rooms) {
    const geo = new THREE.PlaneGeometry(room.width, room.height);
    const mat = new THREE.MeshLambertMaterial({ color: room.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      room.x + room.width / 2,
      0.01,
      room.y + room.height / 2
    );
    mesh.receiveShadow = true;
    scene.add(mesh);

    const label = makeLabel(room.name, "#e0e0ff");
    label.position.set(
      room.x + room.width / 2,
      WALL_HEIGHT - 0.3,
      room.y + room.height / 2
    );
    scene.add(label);
  }

  for (const w of outerWalls) {
    const thickMat = new THREE.MeshLambertMaterial({ color: 0xb0a898 });
    const mesh = buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, WALL_THICKNESS * 2, thickMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const w of innerWalls) {
    const mesh = buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, WALL_THICKNESS, wallMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const ambLight = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambLight);

  const positions = [
    [14, 2], [41, 12], [64, 12], [86, 10], [83, 24], [41, 26], [41, 40],
  ];
  for (const [x, z] of positions) {
    const light = new THREE.PointLight(0xffeedd, 1.5, 25);
    light.position.set(x, WALL_HEIGHT - 0.3, z);
    light.castShadow = false;
    scene.add(light);
  }
}
