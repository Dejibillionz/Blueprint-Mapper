import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

// ── Colour palette from the reference NFT illustration ──────────────────────
const PALETTE = {
  skin:  new THREE.Color(0xC87080), // dusty rose-pink  (scales, body, face)
  hair:  new THREE.Color(0x7A5020), // warm brown       (hair)
  suit:  new THREE.Color(0x1E2E50), // dark navy        (blazer, skirt, shirt)
  shoes: new THREE.Color(0x111520), // near-black       (heels)
  beak:  new THREE.Color(0x8040A0), // purple           (beak / lips)
};

// Keyword lists for material-name → colour mapping (all lower-case)
const BEAK_KW  = ["beak","lip","mouth","teeth","tongue","bird","bill"];
const HAIR_KW  = ["hair","head"];
const SHOES_KW = ["shoe","boot","heel","sandal","sole","pump"];
const SUIT_KW  = ["suit","jacket","cloth","outfit","shirt","skirt","pant","top",
                  "bottom","tie","collar","sleeve","blazer","vest","button","lapel"];
const SKIN_KW  = ["skin","body","surface","face","hand","arm","leg","character",
                  "alpha","beta","ch0","mesh","default","material"];

function pickColour(meshName: string, matName: string): THREE.Color {
  const n = (meshName + " " + matName).toLowerCase();
  if (BEAK_KW.some(k  => n.includes(k))) return PALETTE.beak;
  if (HAIR_KW.some(k  => n.includes(k))) return PALETTE.hair;
  if (SHOES_KW.some(k => n.includes(k))) return PALETTE.shoes;
  if (SUIT_KW.some(k  => n.includes(k))) return PALETTE.suit;
  if (SKIN_KW.some(k  => n.includes(k))) return PALETTE.skin;
  return PALETTE.skin; // safe fallback — body colour shows through
}

function applyPalette(fbx: THREE.Group): void {
  fbx.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const applyToMat = (mat: THREE.Material): THREE.Material => {
      const matName = mat.name ?? "";
      const col = pickColour(mesh.name, matName);

      // Preserve any existing texture maps but tint the colour
      if (mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhongMaterial     ||
          mat instanceof THREE.MeshLambertMaterial) {
        const cast = mat as THREE.MeshStandardMaterial;
        // If the material has a meaningful texture, tint it; otherwise replace
        if (cast.map) {
          cast.color.copy(col);
        } else {
          const newMat = new THREE.MeshLambertMaterial({ color: col, side: THREE.FrontSide });
          newMat.name = matName;
          return newMat;
        }
        return mat;
      }

      // Unknown material type — replace with a Lambert
      const newMat = new THREE.MeshLambertMaterial({ color: col, side: THREE.FrontSide });
      newMat.name = matName;
      return newMat;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(applyToMat);
    } else if (mesh.material) {
      mesh.material = applyToMat(mesh.material);
    }
  });
}

// ── Procedural flame canvas texture ─────────────────────────────────────────
function makeFlameTexture(): THREE.CanvasTexture {
  const W = 128, H = 192;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Draw 3 overlapping teardrop tongues of flame
  const drawTongue = (cx: number, baseY: number, tipY: number, col1: string, col2: string) => {
    const grad = ctx.createLinearGradient(cx, tipY, cx, baseY);
    grad.addColorStop(0, col1);
    grad.addColorStop(1, col2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.bezierCurveTo(cx + 20, baseY - 40, cx + 28, baseY, cx, baseY);
    ctx.bezierCurveTo(cx - 28, baseY, cx - 20, baseY - 40, cx, tipY);
    ctx.fill();
  };

  ctx.clearRect(0, 0, W, H);
  // outer (large) red-orange tongue
  drawTongue(64, H, H * 0.55, "#FF4400cc", "#FF220055");
  // middle yellow-orange tongue
  drawTongue(64, H - 20, H * 0.30, "#FFAA00ee", "#FF660033");
  // inner bright white-yellow core
  drawTongue(64, H - 36, H * 0.15, "#FFFF88ff", "#FFDD0099");

  return new THREE.CanvasTexture(canvas);
}

// ── "10k" heart badge canvas texture ────────────────────────────────────────
function makeBadgeTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width  = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, S, S);

  // Background pill
  ctx.fillStyle = "#1E2E50";
  ctx.beginPath();
  ctx.roundRect(2, 2, S - 4, S - 4, 8);
  ctx.fill();

  // Heart outline
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const hx = S / 2, hy = S * 0.45, hr = S * 0.22;
  ctx.moveTo(hx, hy + hr * 0.5);
  ctx.bezierCurveTo(hx - hr * 1.5, hy - hr * 0.5, hx - hr * 1.5, hy + hr, hx, hy + hr * 1.5);
  ctx.bezierCurveTo(hx + hr * 1.5, hy + hr, hx + hr * 1.5, hy - hr * 0.5, hx, hy + hr * 0.5);
  ctx.stroke();

  // "10k" text
  ctx.fillStyle = "#FFFFFF";
  ctx.font      = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("10k", hx, hy + hr * 0.6);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Self-contained receptionist NPC.
 * Loads 4 Mixamo FBX clips, drives an AnimationMixer, applies the 10KSQUAD
 * colour palette, and adds a procedural flame crown + "10k" badge.
 */
export class Receptionist {
  private mixer:        THREE.AnimationMixer | null = null;
  private actions:      Map<ReceptionistAnimState, THREE.AnimationAction> = new Map();
  private currentState: ReceptionistAnimState = "idle";
  private root:         THREE.Group | null = null;
  private readonly scene: THREE.Scene;

  // Flame + glow
  private flameSprite:  THREE.Mesh | null = null;
  private flameLight:   THREE.PointLight | null = null;
  private elapsed = 0;

  // Delta-driven timers (no setTimeout)
  private greetCooldown = 0;
  private greetTimer    = 0;
  private walkTimer     = 0;

  private static readonly POS       = new THREE.Vector3(41, 0, 48);
  private static readonly NEARBY_SQ = 9;  // 3 m²
  private static readonly GREET_SQ  = 4;  // 2 m²

  // World-space Y of the flame crown (head top ≈ 1.7 m, flame sits above it)
  private static readonly FLAME_Y   = 1.80;

  constructor(scene: THREE.Scene, modelBasePath: string) {
    this.scene = scene;
    this._load(modelBasePath);
  }

  // ── Asset loading ─────────────────────────────────────────────────────────

  private _load(base: string) {
    const loader = new FBXLoader();
    loader.load(
      `${base}standing_idle.fbx`,
      (fbx) => {
        fbx.scale.setScalar(0.01);
        fbx.position.copy(Receptionist.POS);
        fbx.rotation.y = Math.PI;

        fbx.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });

        // Apply the 10KSQUAD colour palette
        applyPalette(fbx);

        this.scene.add(fbx);
        this.root  = fbx;
        this.mixer = new THREE.AnimationMixer(fbx);

        if (fbx.animations.length > 0) {
          const action = this.mixer.clipAction(fbx.animations[0]);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.actions.set("idle", action);
          action.play();
        }

        this._loadClip(loader, `${base}standing_greeting.fbx`, "greet", THREE.LoopOnce);
        this._loadClip(loader, `${base}talking.fbx`,           "talk",  THREE.LoopRepeat);
        this._loadClip(loader, `${base}start_walking.fbx`,     "walk",  THREE.LoopOnce);

        // Flame crown
        this._addFlameCrown();

        // "10k" heart badge
        this._addBadge(fbx);
      },
      undefined,
      (err) => console.error("[Receptionist] standing_idle.fbx failed:", err),
    );
  }

  private _addFlameCrown(): void {
    const flameTex = makeFlameTexture();
    flameTex.premultiplyAlpha = false;

    const geo = new THREE.PlaneGeometry(0.55, 0.75);
    const mat = new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flame = new THREE.Mesh(geo, mat);

    const P = Receptionist.POS;
    flame.position.set(P.x, Receptionist.FLAME_Y + 0.375, P.z);
    flame.rotation.y = Math.PI; // face same direction as character
    this.flameSprite = flame;
    this.scene.add(flame);

    // Warm point light at flame position
    const light = new THREE.PointLight(0xFF6010, 1.5, 3.0);
    light.position.set(P.x, Receptionist.FLAME_Y + 0.5, P.z);
    this.flameLight = light;
    this.scene.add(light);
  }

  private _addBadge(fbx: THREE.Group): void {
    const badgeTex = makeBadgeTexture();
    const geo = new THREE.PlaneGeometry(0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const badge = new THREE.Mesh(geo, mat);
    // Position on chest in local space (before fbx scaling/rotation applied to group children)
    // The group is already at POS and scaled 0.01; badge is added directly to scene at world coords
    badge.position.set(
      Receptionist.POS.x + 0.12, // character's left lapel (+X = character's left when facing south)
      1.28,                        // chest height in world metres
      Receptionist.POS.z - 0.10,  // in front of chest (character faces -Z so chest is at -Z side)
    );
    badge.rotation.y = 0; // plane default front face is +Z, viewer approaches from +Z — correct
    this.scene.add(badge);
    // Store for disposal — attach as user-data reference on the group
    (fbx as unknown as Record<string, unknown>)["_badge"] = badge;
  }

  private _loadClip(
    loader: FBXLoader,
    url: string,
    name: ReceptionistAnimState,
    loopMode: THREE.AnimationActionLoopStyles,
  ) {
    loader.load(
      url,
      (fbx) => {
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

  // ── Public API ────────────────────────────────────────────────────────────

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

    // Animate flame — flicker in scale and light intensity
    if (this.flameSprite) {
      const flicker = 1 + 0.12 * Math.sin(this.elapsed * 7.3) + 0.06 * Math.sin(this.elapsed * 13.1);
      this.flameSprite.scale.set(flicker, 0.9 + 0.15 * Math.sin(this.elapsed * 5.7), 1);
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
      const badge = (this.root as unknown as Record<string, unknown>)["_badge"] as THREE.Mesh | undefined;
      if (badge) {
        this.scene.remove(badge);
        badge.geometry?.dispose();
        (badge.material as THREE.Material)?.dispose();
      }
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
    if (this.flameLight) {
      this.scene.remove(this.flameLight);
    }
  }
}
