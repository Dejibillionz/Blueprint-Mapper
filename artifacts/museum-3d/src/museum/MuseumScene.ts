import * as THREE from "three";
import {
  outerWalls, innerWalls, rooms, frames,
  WALL_HEIGHT, OUTER_THICKNESS, INNER_THICKNESS, DOOR_HEIGHT,
} from "../data/floorplan";

function buildWallMesh(
  x1: number, z1: number, x2: number, z2: number,
  height: number, thickness: number, yOffset: number,
  material: THREE.Material
): THREE.Mesh {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((x1 + x2) / 2, yOffset + height / 2, (z1 + z2) / 2);
  mesh.rotation.y = -angle;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function makeRoomLabel(text: string): THREE.Sprite {
  const lines = text.split("\n");
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96 * lines.length;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, (i + 0.5) * 96));
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(10, 2 * lines.length, 1);
  return sprite;
}

export function buildFrameMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const frameMeshes: THREE.Mesh[] = [];

  for (const f of frames) {
    // Outer frame border
    const frameGeo = new THREE.BoxGeometry(1.6, 1.1, 0.08);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, metalness: 0.6, roughness: 0.4 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(f.position[0], f.position[1], f.position[2]);
    frameMesh.rotation.y = f.rotationY;
    frameMesh.castShadow = true;
    frameMesh.userData = { isFrame: true, frameId: f.id, title: f.title, artist: f.artist };
    scene.add(frameMesh);
    frameMeshes.push(frameMesh);

    // Inner canvas (artwork)
    const canvasGeo = new THREE.BoxGeometry(1.3, 0.85, 0.06);

    // Make a procedural artwork texture
    const size = 256;
    const artCanvas = document.createElement("canvas");
    artCanvas.width = size;
    artCanvas.height = size;
    const ctx = artCanvas.getContext("2d")!;
    const baseColor = `#${f.color.toString(16).padStart(6, "0")}`;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 10 + Math.random() * 60;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, baseColor + "cc");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(f.title, size / 2, size - 28);
    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(f.artist, size / 2, size - 12);

    const artTex = new THREE.CanvasTexture(artCanvas);
    const artMat = new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.9, metalness: 0 });
    const artMesh = new THREE.Mesh(canvasGeo, artMat);

    // Offset canvas slightly forward of frame
    const fwd = new THREE.Vector3(0, 0, 0.025);
    fwd.applyEuler(new THREE.Euler(0, f.rotationY, 0));
    artMesh.position.set(
      f.position[0] + fwd.x,
      f.position[1] + fwd.y,
      f.position[2] + fwd.z
    );
    artMesh.rotation.y = f.rotationY;
    artMesh.userData = { isFrame: true, frameId: f.id, title: f.title, artist: f.artist };
    scene.add(artMesh);
    frameMeshes.push(artMesh);

    // Spotlight on each frame
    const spot = new THREE.SpotLight(0xfff5e0, 2, 6, Math.PI / 10, 0.4);
    spot.position.set(f.position[0], WALL_HEIGHT - 0.1, f.position[2]);
    spot.target.position.set(f.position[0], f.position[1], f.position[2]);
    scene.add(spot);
    scene.add(spot.target);
  }

  return frameMeshes;
}

export function buildScene(scene: THREE.Scene): THREE.Mesh[] {
  // ── Floor & ceiling ──────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1.0 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(50, 0, 26);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(50, WALL_HEIGHT, 26);
  scene.add(ceil);

  // ── Coloured room floors ──────────────────────────────────────
  for (const room of rooms) {
    const mat = new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(room.x + room.width / 2, 0.005, room.y + room.height / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const label = makeRoomLabel(room.name);
    label.position.set(room.x + room.width / 2, WALL_HEIGHT - 0.5, room.y + room.height / 2);
    scene.add(label);
  }

  // ── Wall materials ────────────────────────────────────────────
  const outerMat = new THREE.MeshStandardMaterial({ color: 0xd5cfc5, roughness: 0.8 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.75 });

  // ── Outer walls (solid, full height) ─────────────────────────
  for (const w of outerWalls) {
    const mesh = buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, OUTER_THICKNESS, 0, outerMat);
    scene.add(mesh);
  }

  // ── Inner walls (full height + door lintels) ──────────────────
  for (const w of innerWalls) {
    // Full-height solid wall section
    scene.add(buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, INNER_THICKNESS, 0, innerMat));
  }

  // ── Door lintels for the main door gaps ──────────────────────
  const lintelMat = new THREE.MeshStandardMaterial({ color: 0xd5cfc5, roughness: 0.8 });
  // D1 upper [26, 13-15]
  scene.add(buildWallMesh(26, 13, 26, 15, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // D1 lower [26, 20-22]
  scene.add(buildWallMesh(26, 20, 26, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // D2 [38-42, 22]
  scene.add(buildWallMesh(38, 22, 42, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // D3 [62-66, 22]
  scene.add(buildWallMesh(62, 22, 66, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Corridor passage [37-45, 30]
  scene.add(buildWallMesh(37, 30, 45, 30, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Room 4/5 wall gap [77, 24-26]
  scene.add(buildWallMesh(77, 24, 77, 26, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // D5 [82-85, 22]
  scene.add(buildWallMesh(82, 22, 85, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Grand entrance [37-45, 52]
  scene.add(buildWallMesh(37, 52, 45, 52, WALL_HEIGHT - DOOR_HEIGHT, OUTER_THICKNESS, DOOR_HEIGHT, lintelMat));

  // ── Door frame trim ───────────────────────────────────────────
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.2, roughness: 0.6 });
  const doorFrames: Array<[number, number, number, number]> = [
    [26, 13, 26, 15],
    [26, 20, 26, 22],
    [38, 22, 42, 22],
    [62, 22, 66, 22],
    [37, 30, 45, 30],
    [82, 22, 85, 22],
    [37, 52, 45, 52],
  ];
  for (const [x1, z1, x2, z2] of doorFrames) {
    scene.add(buildWallMesh(x1, z1, x2, z2, 0.1, INNER_THICKNESS + 0.05, DOOR_HEIGHT - 0.05, doorFrameMat));
  }

  // ── Lighting ──────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x304060, 0.4);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x405080, 0x201810, 0.3);
  scene.add(hemi);

  // Overhead ceiling lights per room area
  const lightPositions: Array<[number, number, number, number, number]> = [
    // [x, z, intensity, distance, color]
    [13, 15, 2.5, 22, 0xfff5e0],  // Room 1 left
    [13, 24, 1.5, 18, 0xfff5e0],  // Room 1 right
    [40, 13, 2, 20, 0xffeedd],    // Room 2
    [64, 11, 2, 20, 0xffeedd],    // Room 3
    [86, 11, 2, 20, 0xffeedd],    // Room 4
    [83, 24.5, 1.5, 10, 0xfff0ff],// Room 5 (cool)
    [52, 26, 1.5, 18, 0xfff5e0],  // Corridor
    [41, 41, 2, 16, 0xfff0e0],    // Entrance Hall
    [18, 43, 1, 10, 0xfff5e0],    // Ticket
    [57, 43, 1, 10, 0xfff5e0],    // Gift Shop
  ];

  for (const [x, z, intensity, distance, color] of lightPositions) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, WALL_HEIGHT - 0.15, z);
    light.castShadow = false;
    scene.add(light);
  }

  // ── Picture frames ────────────────────────────────────────────
  return buildFrameMeshes(scene);
}
