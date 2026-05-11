import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

const TEX_BASE = "/models/receptionist/";

function loadPBRMaterial(texLoader: THREE.TextureLoader): THREE.MeshStandardMaterial {
  const diffuse   = texLoader.load(`${TEX_BASE}texture_diffuse.png`);
  const normal    = texLoader.load(`${TEX_BASE}texture_normal.png`);
  const metallic  = texLoader.load(`${TEX_BASE}texture_metallic.png`);
  const roughness = texLoader.load(`${TEX_BASE}texture_roughness.png`);

  diffuse.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshStandardMaterial({
    map:          diffuse,
    normalMap:    normal,
    metalnessMap: metallic,
    roughnessMap: roughness,
    metalness:    1.0,
    roughness:    1.0,
  });

  return mat;
}

function applyPBRMaterial(fbx: THREE.Group, mat: THREE.MeshStandardMaterial): void {
  fbx.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = mat;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
  });
}

function makeFlameTexture(): THREE.CanvasTexture {
  const W = 128, H = 192;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const tongue = (cx: number, baseY: number, tipY: number, c1: string, c2: string) => {
    const g = ctx.createLinearGradient(cx, tipY, cx, baseY);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.bezierCurveTo(cx + 20, baseY - 40, cx + 28, baseY, cx, baseY);
    ctx.bezierCurveTo(cx - 28, baseY, cx - 20, baseY - 40, cx, tipY);
    ctx.fill();
  };

  ctx.clearRect(0, 0, W, H);
  tongue(64, H,      H * 0.55, "#FF4400cc", "#FF220055");
  tongue(64, H - 20, H * 0.30, "#FFAA00ee", "#FF660033");
  tongue(64, H - 36, H * 0.15, "#FFFF88ff", "#FFDD0099");

  return new THREE.CanvasTexture(canvas);
}

function makeBadgeTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "#1E2E50";
  ctx.beginPath();
  ctx.roundRect(2, 2, S - 4, S - 4, 8);
  ctx.fill();

  const hx = S / 2, hy = S * 0.45, hr = S * 0.22;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy + hr * 0.5);
  ctx.bezierCurveTo(hx - hr * 1.5, hy - hr * 0.5, hx - hr * 1.5, hy + hr, hx, hy + hr * 1.5);
  ctx.bezierCurveTo(hx + hr * 1.5, hy + hr, hx + hr * 1.5, hy - hr * 0.5, hx, hy + hr * 0.5);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("10k", hx, hy + hr * 0.6);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Self-contained receptionist NPC.
 * Loads 4 Mixamo FBX clips, applies a full PBR texture set
 * (diffuse / normal / metallic / roughness), and adds a procedural
 * animated flame crown and "10k" heart badge.
 */
export class Receptionist {
  private mixer:        THREE.AnimationMixer | null = null;
  private actions:      Map<ReceptionistAnimState, THREE.AnimationAction> = new Map();
  private currentState: ReceptionistAnimState = "idle";
  private root:         THREE.Group | null = null;
  private readonly scene: THREE.Scene;

  private flameSprite: THREE.Mesh | null = null;
  private flameLight:  THREE.PointLight | null = null;
  private elapsed = 0;

  private greetCooldown = 0;
  private greetTimer    = 0;
  private walkTimer     = 0;

  private static readonly POS       = new THREE.Vector3(41, 0, 48);
  private static readonly NEARBY_SQ = 9;
  private static readonly GREET_SQ  = 4;
  private static readonly FLAME_Y   = 1.80;

  constructor(scene: THREE.Scene, modelBasePath: string) {
    this.scene = scene;
    this._load(modelBasePath);
  }

  private _load(base: string) {
    const loader    = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const pbrMat    = loadPBRMaterial(texLoader);

    loader.load(
      `${base}standing_idle.fbx`,
      (fbx) => {
        fbx.scale.setScalar(0.01);
        fbx.position.copy(Receptionist.POS);
        fbx.rotation.y = Math.PI;

        applyPBRMaterial(fbx, pbrMat);

        this.scene.add(fbx);
        this.root  = fbx;
        this.mixer = new THREE.AnimationMixer(fbx);

        if (fbx.animations.length > 0) {
          const action = this.mixer.clipAction(fbx.animations[0]);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.actions.set("idle", action);
          action.play();
        }

        this._loadClip(loader, pbrMat, `${base}standing_greeting.fbx`, "greet", THREE.LoopOnce);
        this._loadClip(loader, pbrMat, `${base}talking.fbx`,           "talk",  THREE.LoopRepeat);
        this._loadClip(loader, pbrMat, `${base}start_walking.fbx`,     "walk",  THREE.LoopOnce);

        this._addFlameCrown();
        this._addBadge(fbx);
      },
      undefined,
      (err) => console.error("[Receptionist] standing_idle.fbx failed:", err),
    );
  }

  private _addFlameCrown(): void {
    const tex = makeFlameTexture();
    tex.premultiplyAlpha = false;

    const geo = new THREE.PlaneGeometry(0.55, 0.75);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const flame = new THREE.Mesh(geo, mat);

    const P = Receptionist.POS;
    flame.position.set(P.x, Receptionist.FLAME_Y + 0.375, P.z);
    this.flameSprite = flame;
    this.scene.add(flame);

    const light = new THREE.PointLight(0xFF6010, 1.5, 3.0);
    light.position.set(P.x, Receptionist.FLAME_Y + 0.5, P.z);
    this.flameLight = light;
    this.scene.add(light);
  }

  private _addBadge(fbx: THREE.Group): void {
    const tex = makeBadgeTexture();
    const geo = new THREE.PlaneGeometry(8, 8);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const badge = new THREE.Mesh(geo, mat);
    badge.position.set(-12, 128, 10);
    fbx.add(badge);
  }

  private _loadClip(
    loader: FBXLoader,
    pbrMat: THREE.MeshStandardMaterial,
    url: string,
    name: ReceptionistAnimState,
    loopMode: THREE.AnimationActionLoopStyles,
  ) {
    loader.load(
      url,
      (fbx) => {
        applyPBRMaterial(fbx, pbrMat);

        if (!this.mixer || fbx.animations.length === 0) return;
        const clip   = fbx.animations[0];
        const action = this.mixer.clipAction(clip);
        action.setLoop(loopMode, Infinity);
        action.clampWhenFinished = loopMode === THREE.LoopOnce;
        action.weight = 0;
        this.actions.set(name, action);

        if (this.currentState === name) {
          const prev = this.actions.get("idle");
          if (prev) prev.fadeOut(0.3);
          action.reset().setEffectiveWeight(1).fadeIn(0.3).play();
        }
      },
      undefined,
      (err) => console.error(`[Receptionist] ${url} failed:`, err),
    );
  }

  setState(state: ReceptionistAnimState) {
    if (state === this.currentState) return;
    const prev = this.actions.get(this.currentState);
    const next = this.actions.get(state);
    this.currentState = state;
    if (!next) return;
    if (prev) prev.fadeOut(0.3);
    next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
  }

  playWalk(duration = 1.2) {
    this.walkTimer = duration;
    this.setState("walk");
  }

  update(delta: number, playerPos: THREE.Vector3): { nearbyPrompt: boolean; state: string } {
    this.elapsed += delta;
    if (this.mixer) this.mixer.update(delta);

    if (this.flameSprite) {
      const f = 1 + 0.12 * Math.sin(this.elapsed * 7.3) + 0.06 * Math.sin(this.elapsed * 13.1);
      this.flameSprite.scale.set(f, 0.9 + 0.15 * Math.sin(this.elapsed * 5.7), 1);
    }
    if (this.flameLight) {
      this.flameLight.intensity = 1.5 + 0.5 * Math.sin(this.elapsed * 9.1);
    }

    const distSq    = playerPos.distanceToSquared(Receptionist.POS);
    const nearby    = distSq < Receptionist.NEARBY_SQ;
    const veryClose = distSq < Receptionist.GREET_SQ;

    if (this.greetCooldown > 0) this.greetCooldown -= delta;

    if (this.greetTimer > 0) {
      this.greetTimer -= delta;
      if (this.greetTimer <= 0 && this.currentState === "greet") this.setState("idle");
    }

    if (this.walkTimer > 0) {
      this.walkTimer -= delta;
      if (this.walkTimer <= 0 && this.currentState === "walk") this.setState("idle");
    }

    if (veryClose && this.currentState === "idle" && this.greetCooldown <= 0) {
      this.setState("greet");
      this.greetCooldown = 8;
      this.greetTimer    = 2.5;
    }

    return { nearbyPrompt: nearby, state: this.currentState };
  }

  dispose() {
    this.mixer?.stopAllAction();

    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
          else (m.material as THREE.Material)?.dispose();
          m.geometry?.dispose();
        }
      });
    }

    if (this.flameSprite) {
      this.scene.remove(this.flameSprite);
      this.flameSprite.geometry?.dispose();
      (this.flameSprite.material as THREE.Material)?.dispose();
    }
    if (this.flameLight) this.scene.remove(this.flameLight);
  }
}
