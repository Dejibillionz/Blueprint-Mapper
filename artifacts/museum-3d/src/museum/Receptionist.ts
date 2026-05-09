import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type ReceptionistAnimState = "idle" | "greet" | "talk" | "walk";

/**
 * Self-contained receptionist NPC.
 * Loads 4 Mixamo FBX clips, drives an AnimationMixer, and exposes
 * a simple update() / setState() API for MuseumWalker to call.
 */
export class Receptionist {
  private mixer:        THREE.AnimationMixer | null = null;
  private actions:      Map<ReceptionistAnimState, THREE.AnimationAction> = new Map();
  private currentState: ReceptionistAnimState = "idle";
  private root:         THREE.Group | null = null;
  private readonly scene: THREE.Scene;

  // Delta-driven timers (no setTimeout)
  private greetCooldown = 0;  // secs before next auto-greet is allowed
  private greetTimer    = 0;  // secs left in the greet animation
  private walkTimer     = 0;  // secs left in the walk animation

  private static readonly POS       = new THREE.Vector3(41, 0, 48);
  private static readonly NEARBY_SQ = 9;    // 3 m²
  private static readonly GREET_SQ  = 6.25; // 2.5 m²

  constructor(scene: THREE.Scene, modelBasePath: string) {
    this.scene = scene;
    this._load(modelBasePath);
  }

  // ── Asset loading ────────────────────────────────────────────────────────

  private _load(base: string) {
    const loader = new FBXLoader();
    loader.load(
      `${base}standing_idle.fbx`,
      (fbx) => {
        // Mixamo exports in centimetres; scale to metres
        fbx.scale.setScalar(0.01);
        fbx.position.copy(Receptionist.POS);
        fbx.rotation.y = Math.PI; // face south, toward arriving visitors
        fbx.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        this.scene.add(fbx);
        this.root  = fbx;
        this.mixer = new THREE.AnimationMixer(fbx);

        if (fbx.animations.length > 0) {
          const action = this.mixer.clipAction(fbx.animations[0]);
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.actions.set("idle", action);
          action.play();
        }

        // Load additional clips — skeleton must match (all Mixamo = same rig)
        this._loadClip(loader, `${base}standing_greeting.fbx`, "greet", THREE.LoopOnce);
        this._loadClip(loader, `${base}talking.fbx`,           "talk",  THREE.LoopRepeat);
        this._loadClip(loader, `${base}start_walking.fbx`,     "walk",  THREE.LoopOnce);
      },
      undefined,
      (err) => console.error("[Receptionist] standing_idle.fbx failed:", err),
    );
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

        // If we were already asked to play this state before it loaded, switch now
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

  // ── Public API ───────────────────────────────────────────────────────────

  setState(state: ReceptionistAnimState) {
    if (state === this.currentState) return;
    const prev = this.actions.get(this.currentState);
    const next = this.actions.get(state);
    this.currentState = state;
    if (!next) return; // clip still loading — state is queued, _loadClip will apply it
    if (prev) prev.fadeOut(0.3);
    next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
  }

  /** Play walk animation for `duration` seconds then return to idle. */
  playWalk(duration = 1.2) {
    this.walkTimer = duration;
    this.setState("walk");
  }

  /**
   * Call every frame from the animate loop.
   * Returns proximity data so React can decide whether to show the hint.
   */
  update(delta: number, playerPos: THREE.Vector3): { nearbyPrompt: boolean } {
    if (this.mixer) this.mixer.update(delta);

    const distSq    = playerPos.distanceToSquared(Receptionist.POS);
    const nearby    = distSq < Receptionist.NEARBY_SQ;
    const veryClose = distSq < Receptionist.GREET_SQ;

    // Countdown timers
    if (this.greetCooldown > 0) this.greetCooldown -= delta;

    if (this.greetTimer > 0) {
      this.greetTimer -= delta;
      if (this.greetTimer <= 0 && this.currentState === "greet") this.setState("idle");
    }

    if (this.walkTimer > 0) {
      this.walkTimer -= delta;
      if (this.walkTimer <= 0 && this.currentState === "walk") this.setState("idle");
    }

    // Auto-greet once when player steps inside 2.5 m; 8-second cooldown
    if (veryClose && this.currentState === "idle" && this.greetCooldown <= 0) {
      this.setState("greet");
      this.greetCooldown = 8;
      this.greetTimer    = 2.5;
    }

    return { nearbyPrompt: nearby };
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
  }
}
