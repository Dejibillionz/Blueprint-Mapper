import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

const TEX_BASE    = "/models/receptionist/";
const WALK_SPEED  = 3.2;        // m/s
const WP_THRESH   = 0.25;       // metres — waypoint considered reached
const HOME        = new THREE.Vector3(41, 0, 48);

// Waypoint paths for each room (y=0, floor level).
// Each path leads from the home position through the corridor to the room entrance.
const ROOM_PATHS: Record<string, THREE.Vector3[]> = {
  common:   [
    new THREE.Vector3(41, 0, 42),
    new THREE.Vector3(41, 0, 29),
    new THREE.Vector3(26, 0, 22),
    new THREE.Vector3(14, 0, 15),
  ],
  uncommon: [
    new THREE.Vector3(41, 0, 42),
    new THREE.Vector3(41, 0, 29),
    new THREE.Vector3(40, 0, 22),
    new THREE.Vector3(40, 0, 13),
  ],
  rare: [
    new THREE.Vector3(41, 0, 42),
    new THREE.Vector3(41, 0, 29),
    new THREE.Vector3(64, 0, 22),
    new THREE.Vector3(64, 0, 13),
  ],
  platinum: [
    new THREE.Vector3(41, 0, 42),
    new THREE.Vector3(41, 0, 29),
    new THREE.Vector3(76, 0, 25),
    new THREE.Vector3(88, 0, 13),
  ],
};

// Return path is the reverse, ending at HOME.
function buildReturnPath(roomKey: string): THREE.Vector3[] {
  const forward = ROOM_PATHS[roomKey];
  if (!forward) return [HOME.clone()];
  return [...forward].reverse().concat([HOME.clone()]);
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

  private static readonly HOME_POS    = HOME;
  private static readonly FLAME_Y     = 1.80;
  private static readonly NEARBY_SQ   = 9;
  private static readonly GREET_SQ    = 4;

  constructor(scene: THREE.Scene, modelBasePath: string) {
    this.scene = scene;
    this._load(modelBasePath);
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Walk the receptionist to a named room, then back home once arrived. */
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

  setState(state: ReceptionistAnimState) {
    if (state === this.currentState) return;
    const prev = this.actions.get(this.currentState);
    const next = this.actions.get(state);
    this.currentState = state;
    if (!next) return;
    if (prev) prev.fadeOut(0.3);
    next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
  }

  /** Legacy one-shot walk used by old code — kept for compat. */
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
      action.clampWhenFinished = false;
    }
    this.setState("walk");
  }

  private _updateFlamePosition(pos: THREE.Vector3) {
    if (this.flameSprite)
      this.flameSprite.position.set(pos.x, Receptionist.FLAME_Y + 0.375, pos.z);
    if (this.flameLight)
      this.flameLight.position.set(pos.x, Receptionist.FLAME_Y + 0.5, pos.z);
  }

  // ── Loader ──────────────────────────────────────────────────────

  private _load(base: string) {
    const loader    = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const pbrMat    = loadPBRMaterial(texLoader);

    loader.load(
      `${base}standing_idle.fbx`,
      (fbx) => {
        fbx.scale.setScalar(0.01);
        fbx.position.copy(Receptionist.HOME_POS);
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
        this._loadClip(loader, pbrMat, `${base}start_walking.fbx`,     "walk",  THREE.LoopRepeat);

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

  // ── Frame update ────────────────────────────────────────────────

  update(delta: number, playerPos: THREE.Vector3): { nearbyPrompt: boolean; state: string } {
    this.elapsed += delta;
    if (this.mixer) this.mixer.update(delta);

    // Animate flame (uses current root position so it follows correctly)
    if (this.root) this._updateFlamePosition(this.root.position);
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
        // Reached this waypoint — advance
        this.navPath.shift();

        if (this.navPath.length === 0) {
          // All waypoints done
          this.isNavigating = false;

          if (!this.isReturning) {
            // Arrived at destination room — greet, then walk home
            this.setState("greet");
            this.greetCooldown = 99; // prevent auto-re-greet
            this.greetTimer    = 2.5;

            const returnKey = this.navReturnKey;
            this.navOnArrived?.();
            this.navOnArrived = null;

            setTimeout(() => {
              if (!returnKey) return;
              const returnPath = buildReturnPath(returnKey);
              this.navPath      = returnPath;
              this.isNavigating = true;
              this.isReturning  = true;
              this._startWalkAnim();
            }, 3000);
          } else {
            // Arrived back home — snap to exact home pos + rotation, idle
            this.root.position.copy(Receptionist.HOME_POS);
            this.root.rotation.y = Math.PI;
            this.isReturning     = false;
            this.navReturnKey    = null;
            this.greetCooldown   = 3; // brief cooldown before greeting again
            this.setState("idle");
          }
        }
      } else {
        // Step toward next waypoint
        const step = Math.min(dist, WALK_SPEED * delta);
        curr.x += (dx / dist) * step;
        curr.z += (dz / dist) * step;

        // Face direction of travel
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    }

    // ── Proximity checks (use live root position while navigating) ──
    const refPos  = this.root ? this.root.position : Receptionist.HOME_POS;
    const distSq  = playerPos.distanceToSquared(refPos);
    const nearby  = distSq < Receptionist.NEARBY_SQ && !this.isNavigating;
    const vClose  = distSq < Receptionist.GREET_SQ;

    if (this.greetCooldown > 0) this.greetCooldown -= delta;
    if (this.greetTimer    > 0) {
      this.greetTimer -= delta;
      if (this.greetTimer <= 0 && this.currentState === "greet") this.setState("idle");
    }

    if (vClose && this.currentState === "idle" && this.greetCooldown <= 0 && !this.isNavigating) {
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
