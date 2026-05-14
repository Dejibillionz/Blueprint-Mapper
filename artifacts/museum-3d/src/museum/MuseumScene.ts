import * as THREE from "three";
import {
  outerWalls, innerWalls, rooms, frames,
  WALL_HEIGHT, OUTER_THICKNESS, INNER_THICKNESS, DOOR_HEIGHT,
} from "../data/floorplan";
import { DiscordPortal } from "./DiscordPortal";
import { buildCommonGallery, CommonNFT } from "./CommonGallery";
import { buildUncommonGallery, UncommonNFT } from "./UncommonGallery";
import { buildRareGallery, RareNFT } from "./RareGallery";
import { buildPlatinumVault, PlatinumNFT } from "./PlatinumVault";
import { buildPartnerBoard } from "./PartnerBoard";
import { buildTeamBoard } from "./TeamBoard";
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
  const loader = new THREE.TextureLoader();
  const baseUrl = import.meta.env.BASE_URL ?? "/";

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

    // Build placeholder canvas texture
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

    const placeholder = new THREE.CanvasTexture(artCanvas);
    placeholder.colorSpace = THREE.SRGBColorSpace;
    const artMat = new THREE.MeshStandardMaterial({ map: placeholder, roughness: 0.9, metalness: 0 });

    // Swap in the real image if imageUrl is provided
    if (f.imageUrl) {
      const resolved = f.imageUrl.startsWith("/")
        ? `${baseUrl.replace(/\/$/, "")}${f.imageUrl}`
        : f.imageUrl;
      loader.load(
        resolved,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          artMat.map = tex;
          artMat.needsUpdate = true;
          placeholder.dispose();
        },
        undefined,
        () => { /* load failed — placeholder stays */ },
      );
    }

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
    const spot = new THREE.SpotLight(0xfff5e0, 7, 9, Math.PI / 9, 0.35);
    spot.position.set(
      f.position[0] + spotOffset.x,
      WALL_HEIGHT - 0.05,
      f.position[2] + spotOffset.z
    );
    spot.target.position.set(f.position[0], f.position[1], f.position[2]);
    spot.castShadow = false;
    scene.add(spot);
    scene.add(spot.target);
  }

  return frameMeshes;
}

export interface AnimatedDoor {
  pivot:       THREE.Object3D;
  closedY:     number;
  openY:       number;
  triggerX:    number;
  triggerZ:    number;
  triggerDist: number;
  openness:    number;
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

  // Interior wood floor — clipped to the inside of the outer walls so exterior
  // stone ground is never covered by wood.  Outer walls are 0.5 m thick; their
  // inner faces sit at ±0.25 m from the wall centre-lines.  The floor runs from
  // x=0.5 to 99.5 and z=0.5 to 51.5 (safely inside all four outer walls).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(99, 51), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(50, 0.004, 26);   // 4 mm above exterior stone to avoid z-fight
  floor.receiveShadow = true;
  scene.add(floor);

  // Interior ceiling — same tight dimensions as the floor.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(99, 51), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(50, WALL_HEIGHT - 0.005, 26);  // 5 mm below roof slab to stop z-fight
  scene.add(ceil);

  // Outer walls use a stone / limestone facade material.
  const outerMat = new THREE.MeshStandardMaterial({ color: 0xD6CEBC, roughness: 0.82, metalness: 0.0 });

  // Interior walls — hot-pink painted brick texture
  const brickTex = new THREE.TextureLoader().load("/wall-brick.png");
  brickTex.wrapS = THREE.RepeatWrapping;
  brickTex.wrapT = THREE.RepeatWrapping;
  brickTex.repeat.set(12, 3);
  brickTex.anisotropy = 8;
  brickTex.colorSpace = THREE.SRGBColorSpace;
  const innerMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.80, metalness: 0.0 });

  for (const w of outerWalls) {
    const mesh = buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, OUTER_THICKNESS, 0, outerMat);
    scene.add(mesh);
  }

  for (const w of innerWalls) {
    scene.add(buildWallMesh(w.from[0], w.from[1], w.to[0], w.to[1], WALL_HEIGHT, INNER_THICKNESS, 0, innerMat));
  }

  const lintelMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.80, metalness: 0.0 });
  scene.add(buildWallMesh(26, 13, 26, 15, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(26, 20, 26, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(38, 22, 42, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(62, 22, 66, 22, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(37, 30, 45, 30, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Entrance gap narrowed to 4 m (x=39–43); outerWalls loop already covers x=37–39 and x=43–45
  scene.add(buildWallMesh(39, 52, 43, 52, WALL_HEIGHT - DOOR_HEIGHT, OUTER_THICKNESS, DOOR_HEIGHT, lintelMat));
  scene.add(buildWallMesh(77, 24, 77, 26, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Arcade door lintel — west wall x=62, z=41-43 (2 m opening into arcade)
  scene.add(buildWallMesh(62, 41, 62, 43, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));
  // Discord portal lintel — gift shop south wall z=46, x=56-58 (2 m portal gap)
  scene.add(buildWallMesh(56, 46, 58, 46, WALL_HEIGHT - DOOR_HEIGHT, INNER_THICKNESS, DOOR_HEIGHT, lintelMat));

  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.2, roughness: 0.6 });
  const doorFrames: Array<[number, number, number, number]> = [
    [26, 13, 26, 15], [26, 20, 26, 22],
    [38, 22, 42, 22], [62, 22, 66, 22],
    [37, 30, 45, 30], [39, 52, 43, 52],
    [77, 24, 77, 26],
    [62, 41, 62, 43], // arcade door (west wall, z=41-43)
    [56, 46, 58, 46], // discord portal (gift shop south wall, z=46)
  ];
  for (const [x1, z1, x2, z2] of doorFrames) {
    scene.add(buildWallMesh(x1, z1, x2, z2, 0.1, INNER_THICKNESS + 0.05, DOOR_HEIGHT - 0.05, doorFrameMat));
  }

  // ── Animated door panels ────────────────────────────────────────
  // Doors start CLOSED and open when the player (or guide) approaches.
  // Each panel pivots around its hinge edge.  closedY aligns the panel
  // flush with the wall; openY swings it ≈85° into the adjacent space.
  const doorPanelMat = new THREE.MeshStandardMaterial({
    color: 0x3d2310, roughness: 0.62, metalness: 0.15,
  });
  const OPEN_ANG = Math.PI * 0.47; // ≈ 84.6°

  const animatedDoors: AnimatedDoor[] = [];

  function addDoorPanel(
    pivX: number, pivZ: number,
    dW: number,
    closedY: number,
    openDelta: number,
    triggerX: number,
    triggerZ: number,
    triggerDist = 3.5,
  ) {
    const pivot = new THREE.Object3D();
    pivot.position.set(pivX, 0, pivZ);
    pivot.rotation.y = closedY; // start CLOSED
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(dW, DOOR_HEIGHT, 0.05),
      doorPanelMat,
    );
    panel.position.set(dW / 2, DOOR_HEIGHT / 2, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);
    scene.add(pivot);
    animatedDoors.push({
      pivot,
      closedY,
      openY: closedY + openDelta,
      triggerX,
      triggerZ,
      triggerDist,
      openness: 0,
    });
  }

  // D1 upper — x=26, z=13-15 — opens west into Common Gallery
  addDoorPanel(26, 13, 2, -Math.PI / 2, -OPEN_ANG, 26, 14);
  // D1 lower — x=26, z=20-22 — opens west into Common Gallery
  addDoorPanel(26, 22, 2,  Math.PI / 2,  OPEN_ANG, 26, 21);
  // D2 — z=22, x=38-42 — double door, opens south into corridor
  addDoorPanel(38, 22, 2,  0,           -OPEN_ANG, 40, 22, 4.0);
  addDoorPanel(42, 22, 2,  Math.PI,      OPEN_ANG, 40, 22, 4.0);
  // D3 — z=22, x=62-66 — double door, opens south into corridor
  addDoorPanel(62, 22, 2,  0,           -OPEN_ANG, 64, 22, 4.0);
  addDoorPanel(66, 22, 2,  Math.PI,      OPEN_ANG, 64, 22, 4.0);
  // Vault — x=77, z=24-26 — opens west into corridor
  addDoorPanel(77, 24, 2, -Math.PI / 2, -OPEN_ANG, 77, 25);
  // Grand entrance — z=52, x=39-43 — double door opens north into building
  addDoorPanel(39, 52, 2,  0,            OPEN_ANG, 41, 52, 5.0);
  addDoorPanel(43, 52, 2,  Math.PI,     -OPEN_ANG, 41, 52, 5.0);
  // Arcade entrance — west wall x=62, z=41-43 — single door swings east into arcade
  addDoorPanel(62, 41, 2, -Math.PI / 2, OPEN_ANG, 62, 42, 3.0);
  // Discord portal — gift shop south wall z=46, x=56-58 — swings north into gift shop
  addDoorPanel(56, 46, 2, 0, -OPEN_ANG, 57, 46, 3.5);

  const ambient = new THREE.AmbientLight(0xfff5e8, 1.8);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x302010, 0.9);
  scene.add(hemi);

  const lightPositions: Array<[number, number, number, number, number]> = [
    [8,  10, 4,  26, 0xfff5e0],
    [8,  24, 3,  22, 0xfff5e0],
    [20, 10, 3,  22, 0xfff5e0],
    [20, 24, 2.5,20, 0xfff5e0],
    [40, 13, 4,  24, 0xffeedd],
    [40,  7, 2.5,18, 0xffeedd],
    [64, 13, 4,  24, 0xffeedd],
    [64,  7, 2.5,18, 0xffeedd],
    [86, 13, 4,  24, 0xffeedd],
    [86,  7, 2.5,18, 0xffeedd],
    [42, 26, 2.5,20, 0xfff5e0],
    [62, 26, 2.5,20, 0xfff5e0],
    [41, 41, 4,  20, 0xfff0e0],
    [18, 43, 2,  14, 0xfff5e0],
    [57, 43, 2,  14, 0xfff5e0],
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
  const { frameMeshes: partnerFrameMeshes, lights: partnerLights }             = buildPartnerBoard(scene);
  for (const l of partnerLights) scene.add(l);

  buildTeamBoard(scene);

  const discordPortal = new DiscordPortal(scene);

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
    partnerFrameMeshes,
    animatedDoors,
    discordPortal,
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
  partnerFrameMeshes:   THREE.Mesh[];
  animatedDoors:        AnimatedDoor[];
  discordPortal:        DiscordPortal;
}
