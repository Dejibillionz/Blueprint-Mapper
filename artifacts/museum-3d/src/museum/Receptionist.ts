import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

const TEX_BASE    = "/models/receptionist/";
const WALK_SPEED  = 3.0;        // m/s
const WP_THRESH   = 0.3;        // metres — waypoint considered reached
const HOME        = new THREE.Vector3(41, 0, 44);

// ── Wall-aware waypoint paths ───────────────────────────────────────────────
// Museum layout key facts:
//   Entrance hall: x=33-48, z=35-46. Receptionist desk at z=48 (open lobby south of hall).
//   Corridor: x=28-76, z=22-30.
//   South-wall passage gap (entrance → corridor): x=37-45 at z=30  →  x=41 clears it.
//   North-wall entrance gaps:
//     D2 (→ Uncommon Wing):   x=38-42, z=22
//     D3 (→ Rare Collection): x=62-66, z=22
//   Room-1 east-wall door (→ Common Gallery): x=26, z=20-22 (lower door)
//     Approach: west to x=27.5 in corridor, then north past z=22 (wall only applies x≥28),
//     then west through the x=26 door gap at z≈21.
//   Vault west-wall gap (→ Legendary): x=77, z=24-26
//     Approach: east to x=76 at z=25, step through to x=79.
const ROOM_PATHS: Record<string, THREE.Vector3[]> = {
  common: [
    new THREE.Vector3(41,   0, 26),   // straight north — passes through all gaps cleanly
    new THREE.Vector3(27.5, 0, 26),   // west along corridor, clear of x=26 wall
    new THREE.Vector3(27.5, 0, 21),   // north past corridor wall (only solid x≥28)
    new THREE.Vector3(14,   0, 15),   // Common Gallery interior
  ],
  uncommon: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(40,   0, 26),   // approach D2 (x=38-42)
    new THREE.Vector3(40,   0, 21),   // through D2 door gap
    new THREE.Vector3(40,   0, 13),   // Uncommon Wing interior
  ],
  rare: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(64,   0, 26),   // east along corridor, approach D3 (x=62-66)
    new THREE.Vector3(64,   0, 21),   // through D3 door gap
    new THREE.Vector3(64,   0, 13),   // Rare Collection interior
  ],
  platinum: [
    new THREE.Vector3(41,   0, 26),
    new THREE.Vector3(76,   0, 25),   // corridor east end, approach vault gap (z=24-26)
    new THREE.Vector3(79,   0, 25),   // through vault gap at x=77
    new THREE.Vector3(88,   0, 13),   // Legendary Vault interior
  ],
};

function buildReturnPath(roomKey: string): THREE.Vector3[] {
  const fwd = ROOM_PATHS[roomKey];
  if (!fwd) return [HOME.clone()];
  return [...fwd].reverse().concat([HOME.clone()]);
}

function loadPBRMaterial(texLoader: THREE.TextureLoader): THREE.MeshStandardMaterial {
  const diffuse   = texLoader.load(`${TEX_BASE}texture_diffuse.png`);
  const normal    = texLoader.load(`${TEX_BASE}texture_normal.png`);
  const metallic  = texLoader.load(`${TEX_BASE}texture_metallic.png`);
  const roughness = texLoader.load(`${TEX_BASE}texture_roughness.png`);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: diffuse, normalMap: normal,
    metalnessMap: metallic, roughnessMap: roughness,
    metalness: 1.0, roughness: 1.0,
  });
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
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy + hr * 0.5);
  ctx.bezierCurveTo(hx - hr * 1.5, hy - hr * 0.5, hx - hr * 1.5, hy + hr, hx, hy + hr * 1.5);
  ctx.bezierCurveTo(hx + hr * 1.5, hy + hr, hx + hr * 1.5, hy - hr * 0.5, hx, hy + hr * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("10k", hx, hy + hr * 0.6);
  return new THREE.CanvasTexture(canvas);
}

export class Receptionist {
  private mixer:        THREE.AnimationMixer | null = null;
  private actions:      Map<ReceptionistAnimState, THREE.AnimationAction> = new Map();
  private currentState: ReceptionistAnimState = "idle";
  private root:         THREE.Group | null = null;
  private readonly scene: THREE.Scene;

  private flameSprite:  THREE.Mesh | null = null;
  private flameLight:   THREE.PointLight | null = null;
  private elapsed = 0;

  private greetCooldown = 0;
  private greetTimer    = 0;

  // ── Navigation ──────────────────────────────────────────────────
  private navPath:      THREE.Vector3[] = [];
  private navReturnKey: string | null   = null;
  private navOnArrived: (() => void) | null = null;
  private isNavigating  = false;
  private isReturning   = false;

  // Current walk direction (unit XZ vector), updated every frame
  private walkDir = new THREE.Vector3(0, 0, 1);

  private static readonly HOME_POS  = HOME;
  private static readonly FLAME_Y   = 1.80;
  private static readonly NEARBY_SQ = 9;
  private static readonly GREET_SQ  = 4;

  constructor(scene: THREE.Scene, modelBasePath: string) {
    this.scene = scene;
    this._load(modelBasePath);
  }

  // ── Public API ──────────────────────────────────────────────────

  walkToRoom(roomKey: string, onArrived?: () => void) {
    const path = ROOM_PATHS[roomKey];
    if (!path || !this.root) return;
    this.navPath       = path.map(p => p.clone());
    this.navReturnKey  = roomKey;
    this.navOnArrived  = onArrived ?? null;
    this.isNavigating  = true;
    this.isReturning   = false;
    this._startWalkAnim();
  }

  /** Returns current world position (floor level). */
  getPosition(): THREE.Vector3 {
    return this.root ? this.root.position.clone() : HOME.clone();
  }

  /** Returns the unit XZ direction the receptionist is currently facing/moving. */
  getWalkDirection(): THREE.Vector3 {
    return this.walkDir.clone();
  }

  /** True while actively guiding (walking to destination, not yet returned home). */
  isGuiding(): boolean {
    return this.isNavigating && !this.isReturning;
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
    this._startWalkAnim();
    setTimeout(() => {
      if (this.currentState === "walk" && !this.isNavigating) this.setState("idle");
    }, duration * 1000);
  }

  // ── Private helpers ─────────────────────────────────────────────

  private _startWalkAnim() {
    const action = this.actions.get("walk");
    if (action) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished  = false;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(1);
      // Only reset+play if not already running — avoids a pose-pop mid-stride
      if (!action.isRunning()) {
        action.reset().play();
      }
    }
    // Bypass setState's early-return guard so weight/fade are always applied
    const prev = this.actions.get(this.currentState);
    if (this.currentState !== "walk") {
      if (prev) prev.fadeOut(0.3);
      this.currentState = "walk";
    }
  }

  private _updateFlamePosition(pos: THREE.Vector3) {
    if (this.flameSprite)
      this.flameSprite.position.set(pos.x, Receptionist.FLAME_Y + 0.375, pos.z);
    if (this.flameLight)
      this.flameLight.position.set(pos.x, Receptionist.FLAME_Y + 0.5, pos.z);
  }

  private _load(base: string) {
    const loader    = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const pbrMat    = loadPBRMaterial(texLoader);

    loader.load(
      `${base}standing_idle.fbx`,
      (fbx) => {
        fbx.scale.setScalar(0.01);
        fbx.position.copy(Receptionist.HOME_POS);
        fbx.rotation.y = 0;
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
        this._loadClip(loader, pbrMat, `${base}start_walking.fbx`,     "walk",  THREE.LoopRepeat);

        this._addFlameCrown();
        this._addBadge(fbx);
      },
      undefined,
      (err) => console.error("[Receptionist] standing_idle.fbx failed:", err),
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

  private _addBadge(fbx: THREE.Group): void {
    const tex  = makeBadgeTexture();
    const geo  = new THREE.PlaneGeometry(8, 8);
    const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
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
        const action = this.mixer.clipAction(fbx.animations[0]);
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

  // ── Frame update ────────────────────────────────────────────────

  update(delta: number, playerPos: THREE.Vector3): { nearbyPrompt: boolean; state: string } {
    this.elapsed += delta;
    if (this.mixer) this.mixer.update(delta);

    // Flame flicker (position updated below after nav)
    if (this.flameSprite) {
      const f = 1 + 0.12 * Math.sin(this.elapsed * 7.3) + 0.06 * Math.sin(this.elapsed * 13.1);
      this.flameSprite.scale.set(f, 0.9 + 0.15 * Math.sin(this.elapsed * 5.7), 1);
    }
    if (this.flameLight) {
      this.flameLight.intensity = 1.5 + 0.5 * Math.sin(this.elapsed * 9.1);
    }

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
            // Arrived at destination — greet, then walk home after delay
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
              this._startWalkAnim();
            }, 3500);
          } else {
            // Back home — snap to exact position and idle
            this.root.position.copy(Receptionist.HOME_POS);
            this.root.rotation.y = 0;
            this.walkDir.set(0, 0, 1);
            this.isReturning  = false;
            this.navReturnKey = null;
            this.greetCooldown = 3;
            this.setState("idle");
          }
        }
      } else {
        const nx = dx / dist;
        const nz = dz / dist;
        const step = Math.min(dist, WALK_SPEED * delta);
        curr.x += nx * step;
        curr.z += nz * step;
        this.root.rotation.y = Math.atan2(nx, nz);
        this.walkDir.set(nx, 0, nz);
      }
    }

    // Sync flame crown with current position
    if (this.root) this._updateFlamePosition(this.root.position);

    // ── Proximity checks (use live position) ──────────────────────
    const refPos  = this.root ? this.root.position : Receptionist.HOME_POS;
    const distSq  = playerPos.distanceToSquared(refPos);
    const nearby  = distSq < Receptionist.NEARBY_SQ && !this.isNavigating;

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
