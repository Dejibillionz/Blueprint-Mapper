import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

const WALK_SPEED  = 3.0;
const WP_THRESH   = 0.3;
const HOME        = new THREE.Vector3(41, 0, 48);

// ── Wall-aware waypoint paths ───────────────────────────────────────────────
const ROOM_PATHS: Record<string, THREE.Vector3[]> = {
  common: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(27.5, 0, 26),
    new THREE.Vector3(27.5, 0, 21),
    new THREE.Vector3(14,   0, 15),
  ],
  uncommon: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(40,   0, 26),
    new THREE.Vector3(40,   0, 21),
    new THREE.Vector3(40,   0, 13),
  ],
  rare: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(64,   0, 26),
    new THREE.Vector3(64,   0, 21),
    new THREE.Vector3(64,   0, 13),
  ],
  platinum: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(76,   0, 25),
    new THREE.Vector3(79,   0, 25),
    new THREE.Vector3(88,   0, 13),
  ],
};

function buildReturnPath(roomKey: string): THREE.Vector3[] {
  const fwd = ROOM_PATHS[roomKey];
  if (!fwd) return [HOME.clone()];
  return [...fwd].reverse().concat([HOME.clone()]);
}

// ── Shared Draco + GLTF loader ───────────────────────────────────────────────
const _draco = new DRACOLoader();
_draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_draco);

// ── Flame texture helper ─────────────────────────────────────────────────────
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

// ── Badge texture helper ─────────────────────────────────────────────────────
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
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy + hr * 0.5);
  ctx.bezierCurveTo(hx - hr * 1.5, hy - hr * 0.5, hx - hr * 1.5, hy + hr, hx, hy + hr * 0.5);
  ctx.bezierCurveTo(hx + hr * 1.5, hy + hr, hx + hr * 1.5, hy - hr * 0.5, hx, hy + hr * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("10k", hx, hy + hr * 0.6);
  return new THREE.CanvasTexture(canvas);
}

// ── Procedural animation helpers ─────────────────────────────────────────────
// All animations use absolute elapsed time so they are perfectly consistent
// regardless of frame-rate or delta jitter.

type AnimParams = {
  // Y-axis bob (breathing / walk bounce)
  bobAmp:   number;  // metres
  bobFreq:  number;  // Hz
  bobPhase: number;

  // X-axis sway (left-right lean)
  swayAmp:  number;  // radians
  swayFreq: number;
  swayPhase:number;

  // Z-axis pitch (forward nod)
  pitchAmp: number;  // radians
  pitchFreq:number;
  pitchPhase:number;

  // Scale pulse
  scaleAmp: number;
  scaleFreq:number;
};

const ANIM_PARAMS: Record<ReceptionistAnimState, AnimParams> = {
  idle: {
    bobAmp:    0.012, bobFreq:  0.6,  bobPhase:  0,
    swayAmp:   0.018, swayFreq: 0.4,  swayPhase: 0.8,
    pitchAmp:  0.010, pitchFreq:0.35, pitchPhase:1.2,
    scaleAmp:  0.004, scaleFreq:0.5,
  },
  greet: {
    bobAmp:    0.025, bobFreq:  1.4,  bobPhase:  0,
    swayAmp:   0.110, swayFreq: 1.2,  swayPhase: 0,
    pitchAmp:  0.045, pitchFreq:0.8,  pitchPhase:0,
    scaleAmp:  0.010, scaleFreq:1.2,
  },
  talk: {
    bobAmp:    0.014, bobFreq:  1.1,  bobPhase:  0,
    swayAmp:   0.030, swayFreq: 0.9,  swayPhase: 0.4,
    pitchAmp:  0.028, pitchFreq:1.0,  pitchPhase:0.6,
    scaleAmp:  0.006, scaleFreq:0.9,
  },
  walk: {
    bobAmp:    0.045, bobFreq:  2.4,  bobPhase:  0,   // two bobs per stride
    swayAmp:   0.065, swayFreq: 1.2,  swayPhase: 0,   // one lean per stride
    pitchAmp:  0.030, pitchFreq:2.4,  pitchPhase:1.57,
    scaleAmp:  0.000, scaleFreq:1.0,
  },
};

// ── Main class ───────────────────────────────────────────────────────────────

export class Receptionist {
  private root:         THREE.Group | null = null;
  private modelGroup:   THREE.Group | null = null;  // child group animated by procedural system
  private readonly scene: THREE.Scene;

  private flameSprite:  THREE.Mesh | null = null;
  private flameLight:   THREE.PointLight | null = null;

  private elapsed     = 0;
  private stateStart  = 0;   // elapsed value when current state began
  private currentState: ReceptionistAnimState = "idle";
  private prevParams:  AnimParams = ANIM_PARAMS.idle;
  private blendT      = 1;   // 0 → full prev, 1 → full current (lerps over BLEND_DUR)
  private readonly BLEND_DUR = 0.35; // seconds

  private greetCooldown = 0;
  private greetTimer    = 0;

  // ── Navigation ──────────────────────────────────────────────────
  private navPath:      THREE.Vector3[] = [];
  private navReturnKey: string | null   = null;
  private navOnArrived: (() => void) | null = null;
  private isNavigating  = false;
  private isReturning   = false;
  private walkDir = new THREE.Vector3(0, 0, -1);

  private static readonly HOME_POS  = HOME;
  private static readonly FLAME_Y   = 1.80;
  private static readonly NEARBY_SQ = 9;
  private static readonly GREET_SQ  = 4;

  constructor(scene: THREE.Scene, _modelBasePath: string) {
    this.scene = scene;
    this._load();
  }

  // ── Public API ──────────────────────────────────────────────────

  walkToRoom(roomKey: string, onArrived?: () => void) {
    const path = ROOM_PATHS[roomKey];
    if (!path || !this.root) return;
    this.navPath      = path.map(p => p.clone());
    this.navReturnKey = roomKey;
    this.navOnArrived = onArrived ?? null;
    this.isNavigating = true;
    this.isReturning  = false;
    this.setState("walk");
  }

  getPosition(): THREE.Vector3 {
    return this.root ? this.root.position.clone() : HOME.clone();
  }

  getWalkDirection(): THREE.Vector3 {
    return this.walkDir.clone();
  }

  isGuiding(): boolean {
    return this.isNavigating && !this.isReturning;
  }

  setState(state: ReceptionistAnimState) {
    if (state === this.currentState) return;
    this.prevParams   = ANIM_PARAMS[this.currentState];
    this.currentState = state;
    this.stateStart   = this.elapsed;
    this.blendT       = 0;
  }

  playWalk(duration = 1.2) {
    this.setState("walk");
    setTimeout(() => {
      if (this.currentState === "walk" && !this.isNavigating) this.setState("idle");
    }, duration * 1000);
  }

  // ── Private helpers ─────────────────────────────────────────────

  private _load() {
    const base = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");

    _gltfLoader.load(
      `${base}/models/receptionist.glb`,
      (gltf) => {
        const model = gltf.scene;

        // Auto-scale so character stands ~1.72 m tall
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetH = 1.72;
        const scale = size.y > 0 ? targetH / size.y : 1;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        // Re-measure to find floor offset
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y = -box2.min.y;

        // Enable shadows on every mesh
        model.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow    = true;
            m.receiveShadow = true;
          }
        });

        // modelGroup is the animated pivot — sits at floor level
        const modelGroup = new THREE.Group();
        modelGroup.add(model);
        this.modelGroup = modelGroup;

        // root group controls world position
        const root = new THREE.Group();
        root.position.copy(Receptionist.HOME_POS);
        root.rotation.y = Math.PI;
        root.add(modelGroup);
        this.root = root;
        this.scene.add(root);

        this._addBadge(model, box2, scale);
        this._addFlameCrown();

        console.info("[Receptionist] GLB loaded OK");
      },
      undefined,
      (err) => console.error("[Receptionist] receptionist.glb failed:", err),
    );
  }

  private _addFlameCrown(): void {
    const tex  = makeFlameTexture();
    tex.premultiplyAlpha = false;
    const geo  = new THREE.PlaneGeometry(0.55, 0.75);
    const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const flame = new THREE.Mesh(geo, mat);
    const P = Receptionist.HOME_POS;
    flame.position.set(P.x, Receptionist.FLAME_Y + 0.375, P.z);
    this.flameSprite = flame;
    this.scene.add(flame);

    const light = new THREE.PointLight(0xFF6010, 1.5, 3.0);
    light.position.set(P.x, Receptionist.FLAME_Y + 0.5, P.z);
    this.flameLight = light;
    this.scene.add(light);
  }

  private _addBadge(model: THREE.Object3D, scaledBox: THREE.Box3, _scale: number): void {
    const tex  = makeBadgeTexture();
    const geo  = new THREE.PlaneGeometry(0.18, 0.18);
    const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const badge = new THREE.Mesh(geo, mat);
    // Position badge on left chest area — ~55 % up the character height
    const charH = scaledBox.max.y - scaledBox.min.y;
    badge.position.set(0.12, charH * 0.55 - scaledBox.min.y, 0.06);
    model.add(badge);
  }

  private _updateFlamePosition(pos: THREE.Vector3) {
    if (this.flameSprite) this.flameSprite.position.set(pos.x, Receptionist.FLAME_Y + 0.375, pos.z);
    if (this.flameLight)  this.flameLight.position.set(pos.x, Receptionist.FLAME_Y + 0.5,   pos.z);
  }

  // Apply blended procedural animation to modelGroup
  private _applyProcAnim(t: number) {
    const mg = this.modelGroup;
    if (!mg) return;

    const cur = ANIM_PARAMS[this.currentState];
    const prev = this.prevParams;
    const blend = Math.min(this.blendT, 1);

    const lerp = (a: number, b: number) => a + (b - a) * blend;

    // Use local phase within current state for smooth cross-fade
    const tCur  = t - this.stateStart;
    // For prev params, use t directly (it was already running at that offset)
    const tPrev = t;

    const curBob   = Math.sin(tCur  * cur.bobFreq   * Math.PI * 2 + cur.bobPhase)   * cur.bobAmp;
    const prevBob  = Math.sin(tPrev * prev.bobFreq   * Math.PI * 2 + prev.bobPhase)  * prev.bobAmp;
    const curSway  = Math.sin(tCur  * cur.swayFreq   * Math.PI * 2 + cur.swayPhase)  * cur.swayAmp;
    const prevSway = Math.sin(tPrev * prev.swayFreq   * Math.PI * 2 + prev.swayPhase) * prev.swayAmp;
    const curPitch = Math.sin(tCur  * cur.pitchFreq  * Math.PI * 2 + cur.pitchPhase) * cur.pitchAmp;
    const prevPitch= Math.sin(tPrev * prev.pitchFreq  * Math.PI * 2 + prev.pitchPhase)* prev.pitchAmp;
    const curScale = 1 + Math.sin(tCur  * cur.scaleFreq  * Math.PI * 2) * cur.scaleAmp;
    const prevScale= 1 + Math.sin(tPrev * prev.scaleFreq  * Math.PI * 2) * prev.scaleAmp;

    mg.position.y    = lerp(prevBob,   curBob);
    mg.rotation.z    = lerp(prevSway,  curSway);
    mg.rotation.x    = lerp(prevPitch, curPitch);
    const s          = lerp(prevScale, curScale);
    mg.scale.setScalar(s);
  }

  // ── Frame update ────────────────────────────────────────────────

  update(delta: number, playerPos: THREE.Vector3): { nearbyPrompt: boolean; state: string } {
    this.elapsed += delta;

    // Advance blend
    if (this.blendT < 1) this.blendT = Math.min(1, this.blendT + delta / this.BLEND_DUR);

    // Flame flicker
    if (this.flameSprite) {
      const f = 1 + 0.12 * Math.sin(this.elapsed * 7.3) + 0.06 * Math.sin(this.elapsed * 13.1);
      this.flameSprite.scale.set(f, 0.9 + 0.15 * Math.sin(this.elapsed * 5.7), 1);
    }
    if (this.flameLight) {
      this.flameLight.intensity = 1.5 + 0.5 * Math.sin(this.elapsed * 9.1);
    }

    // ── Procedural animation ─────────────────────────────────────
    this._applyProcAnim(this.elapsed);

    // ── Waypoint navigation ──────────────────────────────────────
    if (this.isNavigating && this.root && this.navPath.length > 0) {
      const curr   = this.root.position;
      const target = this.navPath[0];
      const dx     = target.x - curr.x;
      const dz     = target.z - curr.z;
      const dist   = Math.sqrt(dx * dx + dz * dz);

      if (dist < WP_THRESH) {
        this.navPath.shift();

        if (this.navPath.length === 0) {
          this.isNavigating = false;

          if (!this.isReturning) {
            this.setState("greet");
            this.greetCooldown = 99;
            this.greetTimer    = 2.5;
            const returnKey = this.navReturnKey;
            this.navOnArrived?.();
            this.navOnArrived = null;
            setTimeout(() => {
              if (!returnKey) return;
              this.navPath      = buildReturnPath(returnKey);
              this.isNavigating = true;
              this.isReturning  = true;
              this.setState("walk");
            }, 3500);
          } else {
            this.root.position.copy(Receptionist.HOME_POS);
            this.root.rotation.y = Math.PI;
            this.walkDir.set(0, 0, -1);
            this.isReturning  = false;
            this.navReturnKey = null;
            this.greetCooldown = 3;
            this.setState("idle");
          }
        }
      } else {
        const nx   = dx / dist;
        const nz   = dz / dist;
        const step = Math.min(dist, WALK_SPEED * delta);
        curr.x += nx * step;
        curr.z += nz * step;
        this.root.rotation.y = Math.atan2(nx, nz);
        this.walkDir.set(nx, 0, nz);
      }
    }

    // Sync flame crown with current position
    if (this.root) this._updateFlamePosition(this.root.position);

    // ── Proximity checks ─────────────────────────────────────────
    const refPos = this.root ? this.root.position : Receptionist.HOME_POS;
    const distSq = playerPos.distanceToSquared(refPos);
    const nearby = distSq < Receptionist.NEARBY_SQ && !this.isNavigating;

    if (this.greetCooldown > 0) this.greetCooldown -= delta;
    if (this.greetTimer    > 0) {
      this.greetTimer -= delta;
      if (this.greetTimer <= 0 && this.currentState === "greet") this.setState("idle");
    }

    if (distSq < Receptionist.GREET_SQ && this.currentState === "idle" && this.greetCooldown <= 0 && !this.isNavigating) {
      this.setState("greet");
      this.greetCooldown = 8;
      this.greetTimer    = 2.5;
    }

    return { nearbyPrompt: nearby, state: this.currentState };
  }

  dispose() {
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
