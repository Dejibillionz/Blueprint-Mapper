import * as THREE from "three";
import { WALL_HEIGHT } from "../data/floorplan";

export interface ArcadeInteractable {
  prompt: string;
  machineIndex: number;
}

interface MachineDef {
  x: number;
  z: number;
  rotY: number;
}

const MACHINE_DEFS: MachineDef[] = [
  // North wall (z≈30), facing south — rotY=0 keeps local +z pointing south
  { x: 68,   z: 31.0, rotY: 0 },
  { x: 76,   z: 31.0, rotY: 0 },
  { x: 84,   z: 31.0, rotY: 0 },
  // East wall (x≈100), facing west — rotY=-π/2 turns local +z to world -x
  { x: 99.6, z: 37,   rotY: -Math.PI / 2 },
  { x: 99.6, z: 44,   rotY: -Math.PI / 2 },
  { x: 99.6, z: 50,   rotY: -Math.PI / 2 },
];

const INTERACT_DIST = 2.0;

const SCREEN_W = 256;
const SCREEN_H = 192;
const ANIM_FPS = 10;
const ANIM_INTERVAL = 1 / ANIM_FPS;

interface ScreenState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  index: number;
}

export class ArcadeRoom {
  private gameUrls: string[] = new Array(MACHINE_DEFS.length).fill("");
  private machinePositions: THREE.Vector3[] = [];
  private machineMeshes: Array<{ body: THREE.Mesh; screen: THREE.Mesh }> = [];
  private screenStates: ScreenState[] = [];
  private lastAnimTime = 0;

  constructor(private scene: THREE.Scene) {
    this.buildRoomStructure();
    this.buildSign();
    this.buildMachines();
    this.buildLighting();
  }

  setGameUrl(index: number, url: string): void {
    if (index >= 0 && index < this.gameUrls.length) {
      this.gameUrls[index] = url;
      const meshes = this.machineMeshes[index];
      if (meshes) {
        meshes.body.userData.gameUrl = url;
        meshes.screen.userData.gameUrl = url;
      }
    }
  }

  getInteractable(playerPos: THREE.Vector3): ArcadeInteractable | null {
    let closest: ArcadeInteractable | null = null;
    let closestDist = Infinity;
    for (let i = 0; i < this.machinePositions.length; i++) {
      const mp = this.machinePositions[i];
      const dx = playerPos.x - mp.x;
      const dz = playerPos.z - mp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < INTERACT_DIST && dist < closestDist) {
        closestDist = dist;
        closest = { prompt: `E — Play [Game ${i + 1}]`, machineIndex: i };
      }
    }
    return closest;
  }

  activateMachine(index: number): string | null {
    const url = this.gameUrls[index];
    return url || null;
  }

  /** Call once per render frame with the scene's elapsed time in seconds. */
  update(elapsed: number): void {
    if (elapsed - this.lastAnimTime < ANIM_INTERVAL) return;
    this.lastAnimTime = elapsed;

    const coinVisible = Math.floor(elapsed * 2) % 2 === 0;
    // Scan-line position: sweeps 0→H over 1.5 s, then repeats
    const scanY = ((elapsed % 1.5) / 1.5) * SCREEN_H;

    for (const ss of this.screenStates) {
      this.drawScreen(ss.ctx, ss.index, coinVisible, scanY);
      ss.texture.needsUpdate = true;
    }
  }

  private buildRoomStructure(): void {
    // Dark arcade floor — x=62..100, z=30..52 (38 × 22 m)
    const floorGeo = new THREE.PlaneGeometry(38, 22);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x07000f, roughness: 0.9, metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(81, 0.01, 41);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Dark ceiling — same footprint
    const ceilGeo = new THREE.PlaneGeometry(38, 22);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x060008, roughness: 1.0, metalness: 0.0,
      emissive: 0x0a0014, emissiveIntensity: 0.15,
    });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(81, WALL_HEIGHT, 41);
    this.scene.add(ceil);
  }

  private buildSign(): void {
    const W = 512, H = 154;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#050008";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#cc00ff";
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    ctx.shadowColor = "#cc00ff";
    ctx.shadowBlur = 30;
    ctx.font = `bold ${Math.floor(H * 0.60)}px Arial Black, Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff88ff";
    ctx.fillText("ARCADE", W / 2, H / 2);

    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.7;
    ctx.fillText("ARCADE", W / 2, H / 2);
    ctx.globalAlpha = 1.0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(4, 1.2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(61.9, WALL_HEIGHT - 0.55, 42);
    mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);

    const signLight = new THREE.PointLight(0xcc00ff, 1.2, 6);
    signLight.position.set(61.5, WALL_HEIGHT - 0.55, 42);
    this.scene.add(signLight);
  }

  private buildMachines(): void {
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x1a0a2e, roughness: 0.65, metalness: 0.35,
    });
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x2a1040, roughness: 0.8, metalness: 0.2,
    });

    for (let i = 0; i < MACHINE_DEFS.length; i++) {
      const def = MACHINE_DEFS[i];
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.rotY;

      // Cabinet body
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.6), cabinetMat);
      body.position.set(0, 1.0, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = { isArcadeMachine: true, machineIndex: i, gameUrl: "" };
      group.add(body);

      // Trim stripe (neon edge)
      const trimMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x9900cc : 0x00ccff,
        emissive: i % 2 === 0 ? 0x660088 : 0x007799,
        roughness: 0.3, metalness: 0.5,
      });
      const trimTop = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 0.62), trimMat);
      trimTop.position.set(0, 2.03, 0);
      group.add(trimTop);
      const trimBottom = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 0.62), trimMat);
      trimBottom.position.set(0, 0.03, 0);
      group.add(trimBottom);

      // Screen — build animated canvas texture
      const canvas = document.createElement("canvas");
      canvas.width = SCREEN_W;
      canvas.height = SCREEN_H;
      const ctx = canvas.getContext("2d")!;

      const screenTex = new THREE.CanvasTexture(canvas);
      screenTex.colorSpace = THREE.SRGBColorSpace;

      const ss: ScreenState = { canvas, ctx, texture: screenTex, index: i };
      this.screenStates.push(ss);

      // Draw initial frame
      this.drawScreen(ctx, i, true, 0);

      const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.66), screenMat);
      screen.position.set(0, 1.42, 0.31);
      screen.userData = { isArcadeMachine: true, machineIndex: i, gameUrl: "" };
      group.add(screen);

      // Controls shelf
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.38), shelfMat);
      shelf.position.set(0, 0.72, 0.15);
      group.add(shelf);

      // Joystick nub
      const nubMat = new THREE.MeshStandardMaterial({ color: 0xff2244, roughness: 0.4 });
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), nubMat);
      nub.position.set(-0.18, 0.80, 0.18);
      group.add(nub);

      // Screen glow light
      const glow = new THREE.PointLight(0x00ffff, 0.25, 2.0);
      glow.position.set(0, 1.42, 0.5);
      group.add(glow);

      this.scene.add(group);
      this.machinePositions.push(new THREE.Vector3(def.x, 0, def.z));
      this.machineMeshes.push({ body, screen });
    }
  }

  /** Draw one animated frame onto the given 2D context. */
  private drawScreen(
    ctx: CanvasRenderingContext2D,
    index: number,
    coinVisible: boolean,
    scanY: number,
  ): void {
    const W = SCREEN_W;
    const H = SCREEN_H;

    // Background
    ctx.fillStyle = "#000a18";
    ctx.fillRect(0, 0, W, H);

    // Static grid
    ctx.strokeStyle = "#002244";
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 0; x < W; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // Neon scan-line sweep — a bright horizontal band that drifts down
    const scanHeight = 18;
    const grad = ctx.createLinearGradient(0, scanY - scanHeight, 0, scanY + scanHeight);
    grad.addColorStop(0,   "rgba(0,255,255,0)");
    grad.addColorStop(0.4, "rgba(0,255,255,0.18)");
    grad.addColorStop(0.5, "rgba(0,255,255,0.38)");
    grad.addColorStop(0.6, "rgba(0,255,255,0.18)");
    grad.addColorStop(1,   "rgba(0,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - scanHeight, W, scanHeight * 2);

    // Border
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.shadowBlur = 0;

    // Game number
    ctx.shadowColor = "#ffff00";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffff00";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`GAME ${index + 1}`, W / 2, 38);

    // Corner stars
    ctx.fillStyle = "#cc00ff";
    ctx.shadowColor = "#cc00ff";
    ctx.shadowBlur = 6;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillText("★", 10, 22);
    ctx.textAlign = "right";
    ctx.fillText("★", W - 10, 22);

    // INSERT COIN — blinks at ~1 Hz
    ctx.textAlign = "center";
    if (coinVisible) {
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#00ff88";
      ctx.font = "bold 16px monospace";
      ctx.fillText("INSERT COIN", W / 2, H / 2 - 8);
      ctx.shadowColor = "#00cc66";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#00cc66";
      ctx.font = "14px monospace";
      ctx.fillText("TO PLAY", W / 2, H / 2 + 14);
    }

    // Bottom decorative bar
    ctx.shadowBlur = 0;
    const barGrad = ctx.createLinearGradient(0, H - 28, W, H - 28);
    barGrad.addColorStop(0,   "#9900cc");
    barGrad.addColorStop(0.5, "#00ccff");
    barGrad.addColorStop(1,   "#9900cc");
    ctx.fillStyle = barGrad;
    ctx.fillRect(10, H - 28, W - 20, 4);
  }

  private buildLighting(): void {
    const defs: Array<[number, number, number]> = [
      [72, 36, 0x9900cc],
      [90, 36, 0x00ccff],
      [72, 47, 0x00ccff],
      [90, 47, 0x9900cc],
    ];
    for (const [x, z, color] of defs) {
      const light = new THREE.PointLight(color, 0.7, 16);
      light.position.set(x, WALL_HEIGHT - 0.25, z);
      this.scene.add(light);
    }
  }
}
