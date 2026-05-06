import * as THREE from "three";
import {
  outerWalls, innerWalls, rooms, frames,
  WALL_HEIGHT, OUTER_THICKNESS, INNER_THICKNESS, DOOR_HEIGHT,
} from "../data/floorplan";
import { buildCommonGallery, CommonNFT } from "./CommonGallery";
import { buildUncommonGallery, UncommonNFT } from "./UncommonGallery";
import { buildRareGallery, RareNFT } from "./RareGallery";
import { buildPlatinumVault, PlatinumNFT } from "./PlatinumVault";
export type { CommonNFT, UncommonNFT, RareNFT, PlatinumNFT };

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


export function buildFrameMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const frameMeshes: THREE.Mesh[] = [];

  for (const f of frames) {
    const frameGeo = new THREE.BoxGeometry(1.6, 1.1, 0.08);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, metalness: 0.6, roughness: 0.4 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(f.position[0], f.position[1], f.position[2]);
    frameMesh.rotation.y = f.rotationY;
    frameMesh.castShadow = true;
    frameMesh.userData = { isFrame: true, frameId: f.id, title: f.title, artist: f.artist };
    scene.add(frameMesh);
    frameMeshes.push(frameMesh);

    const canvasGeo = new THREE.BoxGeometry(1.3, 0.85, 0.06);
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

    const spotOffset = new THREE.Vector3(0, 0, 1.5).applyEuler(new THREE.Euler(0, f.rotationY, 0));
    const spot = new THREE.SpotLight(0xfff5e0, 18, 9, Math.PI / 9, 0.35);
    spot.position.set(
      f.position[0] + spotOffset.x,
      WALL_HEIGHT - 0.05,
      f.position[2] + spotOffset.z
    );
    spot.target.position.set(f.position[0], f.position[1], f.position[2]);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 10;
    scene.add(spot);
    scene.add(spot.target);
  }

  return frameMeshes;
}

export function buildScene(scene: THREE.Scene): BuildSceneResult {
  const woodTex = new THREE.TextureLoader().load("/floor-wood.jpg");
  woodTex.wrapS = THREE.RepeatWrapping;
  woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(50, 25);
  woodTex.anisotropy = 8;

  const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });

  const ceilTex = new THREE.TextureLoader().load("/ceiling-texture.jpg");
  ceilTex.wrapS = THREE.RepeatWrapping;
  ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(30, 20);
  ceilTex.anisotropy = 8;
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1.0, color: 0xdddddd });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(50, 0, 26);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(50, WALL_HEIGHT, 26);
  scene.add(ceil);

  const outerMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.8 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.75 });

  for (const w of outerWalls) {
    const mesh = buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, OUTER_THICKNESS, 0, outerMat);
    scene.add(mesh);
  }

  for (const w of innerWalls) {
    scene.add(buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, INNER_THICKNESS, 0, innerMat));
  }

  const lintelMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.8 });
  scene.add(buildWallMesh(26, 13, 26, 15, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(26, 20, 26, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(38, 22, 42, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(62, 22, 66, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(37, 30, 45, 30, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(37, 52, 45, 52, WALL_HEIGHT - DOOR_HEIGHT, OUTER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(77, 24, 77, 26, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));

  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.2, roughness: 0.6 });
  const doorFrames: Array<[number, number, number, number]> = [
    [26, 13, 26, 15], [26, 20, 26, 22],
    [38, 22, 42, 22], [62, 22, 66, 22],
    [37, 30, 45, 30], [37, 52, 45, 52],
    [77, 24, 77, 26],
  ];
  for (const [x1, z1, x2, z2] of doorFrames) {
    scene.add(buildWallMesh(x1, z1, x2, z2, 0.1, INNER_THICKNESS + 0.05, DOOR_HEIGHT - 0.05, doorFrameMat));
  }

  const ambient = new THREE.AmbientLight(0xfff5e8, 1.8);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x302010, 0.9);
  scene.add(hemi);

  const lightPositions: Array<[number, number, number, number, number]> = [
    [8,  10, 8,  26, 0xfff5e0],
    [8,  24, 6,  22, 0xfff5e0],
    [20, 10, 6,  22, 0xfff5e0],
    [20, 24, 5,  20, 0xfff5e0],
    [40, 13, 8,  24, 0xffeedd],
    [40,  7, 5,  18, 0xffeedd],
    [64, 13, 8,  24, 0xffeedd],
    [64,  7, 5,  18, 0xffeedd],
    [86, 13, 8,  24, 0xffeedd],
    [86,  7, 5,  18, 0xffeedd],
    [42, 26, 5,  20, 0xfff5e0],
    [62, 26, 5,  20, 0xfff5e0],
    [41, 41, 8,  20, 0xfff0e0],
    [18, 43, 4,  14, 0xfff5e0],
    [57, 43, 4,  14, 0xfff5e0],
  ];

  for (const [x, z, intensity, distance, color] of lightPositions) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, WALL_HEIGHT - 0.15, z);
    light.castShadow = false;
    scene.add(light);
  }

  const frameMeshes = buildFrameMeshes(scene);

  const { borderMesh: cgMesh, artMeshes: cgArtMeshes, nfts: commonNFTs }     = buildCommonGallery(scene);
  const { borderMesh: ugMesh, artMeshes: ugArtMeshes, nfts: uncommonNFTs }   = buildUncommonGallery(scene);
  const { borderMesh: rgMesh, artMeshes: rgArtMeshes, nfts: rareNFTs }       = buildRareGallery(scene);
  const { borderMesh: pgMesh, artMeshes: pgArtMeshes, nfts: platinumNFTs }   = buildPlatinumVault(scene);

  return {
    frameMeshes,
    commonGalleryMesh:    cgMesh,
    commonArtMeshes:      cgArtMeshes,
    commonNFTs,
    uncommonGalleryMesh:  ugMesh,
    uncommonArtMeshes:    ugArtMeshes,
    uncommonNFTs,
    rareGalleryMesh:      rgMesh,
    rareArtMeshes:        rgArtMeshes,
    rareNFTs,
    platinumGalleryMesh:  pgMesh,
    platinumArtMeshes:    pgArtMeshes,
    platinumNFTs,
  };
}

export interface BuildSceneResult {
  frameMeshes:          THREE.Mesh[];
  commonGalleryMesh:    THREE.InstancedMesh;
  commonArtMeshes:      THREE.Mesh[];
  commonNFTs:           CommonNFT[];
  uncommonGalleryMesh:  THREE.InstancedMesh;
  uncommonArtMeshes:    THREE.Mesh[];
  uncommonNFTs:         UncommonNFT[];
  rareGalleryMesh:      THREE.InstancedMesh;
  rareArtMeshes:        THREE.Mesh[];
  rareNFTs:             RareNFT[];
  platinumGalleryMesh:  THREE.InstancedMesh;
  platinumArtMeshes:    THREE.Mesh[];
  platinumNFTs:         PlatinumNFT[];
}
