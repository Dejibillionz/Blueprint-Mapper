import * as THREE from "three";

// ── Public types ──────────────────────────────────────────────────────────────

export interface GalleryConfig {
  artMesh:    THREE.InstancedMesh;
  artW:       number;   // art-panel width  (m)
  artH:       number;   // art-panel height (m)
  metaOffset: number;   // first index in metadata.json for this gallery
  loadDist:   number;   // metres — start loading when player is this close
  roomId:     string;   // floorplan room id — frames always load when player is in this room
}

interface MetaEntry {
  image:        string;
  token_id:     string;
  rarity_rank:  number | null;
  rarity_score: number;
  room:         number;
  room_index:   number;
}

// ── Internal per-frame state ──────────────────────────────────────────────────

type FrameState = "unloaded" | "loading" | "loaded" | "error";

interface Frame {
  pos:        THREE.Vector3;   // world-space centre of the art panel
  state:      FrameState;
  mesh?:      THREE.Mesh;
  origMatrix: THREE.Matrix4;   // saved so we can restore the instance if needed
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 6;   // max simultaneous texture fetches
const MAX_CACHED    = 150;  // LRU texture cache limit

// ── Manager ───────────────────────────────────────────────────────────────────

export class ProximityTextureManager {
  private scene:      THREE.Scene;
  private galleries:  GalleryConfig[];
  private frames:     Frame[][];   // [galleryIdx][instanceId]
  private meta:       MetaEntry[] = [];
  private metaReady   = false;
  private activeLoads = 0;

  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  // LRU texture cache
  private textureCache = new Map<string, THREE.Texture>();
  private cacheOrder:   string[] = [];

  /** Called once metadata.json is parsed; MuseumWalker can use it to update NFT titles. */
  onMetaLoaded?: (meta: MetaEntry[]) => void;

  constructor(scene: THREE.Scene, galleries: GalleryConfig[]) {
    this.scene     = scene;
    this.galleries = galleries;

    // Pre-cache world positions from instance matrices
    this.frames = galleries.map(g => {
      const arr: Frame[] = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < g.artMesh.count; i++) {
        g.artMesh.getMatrixAt(i, m);
        arr.push({
          pos:        new THREE.Vector3().setFromMatrixPosition(m),
          state:      "unloaded",
          origMatrix: m.clone(),
        });
      }
      return arr;
    });

    void this.fetchMeta();
  }

  // ── Metadata loading ───────────────────────────────────────────────────────

  private async fetchMeta() {
    try {
      const resp = await fetch("/metadata.json");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.meta      = (await resp.json()) as MetaEntry[];
      this.metaReady = true;
      this.onMetaLoaded?.(this.meta);
    } catch (err) {
      console.error("[ProximityTextureManager] Failed to load metadata.json:", err);
    }
  }

  // ── Per-frame animate update ───────────────────────────────────────────────

  update(cameraPos: THREE.Vector3, time: number, currentRoomId: string | null = null) {
    if (!this.metaReady) return;

    for (let gi = 0; gi < this.galleries.length; gi++) {
      const g       = this.galleries[gi];
      const gFrames = this.frames[gi];
      const inRoom  = currentRoomId === g.roomId;
      const distSq  = g.loadDist * g.loadDist;

      for (let i = 0; i < gFrames.length; i++) {
        const f  = gFrames[i];

        if (!inRoom) {
          const dx = f.pos.x - cameraPos.x;
          const dz = f.pos.z - cameraPos.z;
          if (dx * dx + dz * dz > distSq) continue;
        }

        if (f.state === "unloaded" && this.activeLoads < MAX_CONCURRENT) {
          void this.loadFrame(gi, i);
        } else if (f.state === "loading" && f.mesh) {
          // Pulse the loading glow
          const mat = f.mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.20 + 0.20 * Math.sin(time * 3.5);
        }
      }
    }
  }

  // ── Texture load + mesh swap ───────────────────────────────────────────────

  private async loadFrame(gi: number, i: number) {
    const g      = this.galleries[gi];
    const f      = this.frames[gi][i];
    const entry  = this.meta[g.metaOffset + i];

    if (!entry?.image) {
      f.state = "error";
      return;
    }

    f.state = "loading";
    this.activeLoads++;

    // Spawn a loading-state plane at the exact art-panel world transform
    const geo = new THREE.PlaneGeometry(g.artW, g.artH);
    const mat = new THREE.MeshStandardMaterial({
      color:            0x1a2a3a,
      emissive:         new THREE.Color(0x4488ff),
      emissiveIntensity: 0.30,
      roughness:        0.9,
      side:             THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(f.origMatrix);
    this.scene.add(mesh);
    f.mesh = mesh;

    // Hide the InstancedMesh art panel for this slot
    g.artMesh.setMatrixAt(i, this.zeroMatrix);
    g.artMesh.instanceMatrix.needsUpdate = true;

    try {
      const tex = await this.loadTexture(entry.image);
      const finalMat = new THREE.MeshStandardMaterial({
        map:       tex,
        roughness: 0.85,
        side:      THREE.DoubleSide,
      });
      (mesh.material as THREE.MeshStandardMaterial).dispose();
      mesh.material = finalMat;
      f.state = "loaded";
    } catch {
      // Show a subtle red error tint instead of crashing
      f.state = "error";
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.emissive.set(0x220000);
      m.emissiveIntensity = 0.05;
    } finally {
      this.activeLoads--;
    }
  }

  // ── LRU texture cache ──────────────────────────────────────────────────────

  private loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) {
      // Move to most-recently-used end
      this.cacheOrder = this.cacheOrder.filter(u => u !== url);
      this.cacheOrder.push(url);
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      loader.load(
        url,
        (tex) => {
          // Evict oldest when over cap
          if (this.cacheOrder.length >= MAX_CACHED) {
            const oldest = this.cacheOrder.shift()!;
            this.textureCache.get(oldest)?.dispose();
            this.textureCache.delete(oldest);
          }
          this.textureCache.set(url, tex);
          this.cacheOrder.push(url);
          resolve(tex);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose() {
    for (const gFrames of this.frames) {
      for (const f of gFrames) {
        if (f.mesh) {
          this.scene.remove(f.mesh);
          (f.mesh.material as THREE.MeshStandardMaterial).dispose();
          f.mesh.geometry.dispose();
        }
      }
    }
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
  }
}
