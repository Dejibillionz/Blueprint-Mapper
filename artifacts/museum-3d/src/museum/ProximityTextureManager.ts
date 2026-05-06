import * as THREE from "three";

// ── Public types ──────────────────────────────────────────────────────────────

export interface GalleryConfig {
  artMesh:    THREE.InstancedMesh;
  artW:       number;
  artH:       number;
  metaOffset: number;
  loadDist:   number;
  roomId:     string;
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
  pos:        THREE.Vector3;
  state:      FrameState;
  mesh?:      THREE.Mesh;
  origMatrix: THREE.Matrix4;
  needsUFlip: boolean;
  flippedTex?: THREE.Texture;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 8;
const MAX_CACHED     = 200;

// ── Manager ───────────────────────────────────────────────────────────────────

export class ProximityTextureManager {
  private scene:      THREE.Scene;
  private galleries:  GalleryConfig[];
  private frames:     Frame[][];
  private meta:       MetaEntry[] = [];
  private metaReady   = false;
  private activeLoads = 0;

  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  private textureCache = new Map<string, THREE.Texture>();
  private cacheOrder:   string[] = [];

  onMetaLoaded?: (meta: MetaEntry[]) => void;

  constructor(scene: THREE.Scene, galleries: GalleryConfig[]) {
    this.scene     = scene;
    this.galleries = galleries;

    const _localZ = new THREE.Vector3();
    this.frames = galleries.map(g => {
      const arr: Frame[] = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < g.artMesh.count; i++) {
        g.artMesh.getMatrixAt(i, m);
        m.extractBasis(new THREE.Vector3(), new THREE.Vector3(), _localZ);
        arr.push({
          pos:        new THREE.Vector3().setFromMatrixPosition(m),
          state:      "unloaded",
          origMatrix: m.clone(),
          needsUFlip: Math.abs(_localZ.x) > 0.5,
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
      console.log(`[ProximityTextureManager] Metadata loaded: ${this.meta.length} entries`);
      this.onMetaLoaded?.(this.meta);
    } catch (err) {
      console.error("[ProximityTextureManager] Failed to load metadata.json:", err);
    }
  }

  // ── Per-frame animate update ───────────────────────────────────────────────

  update(cameraPos: THREE.Vector3, time: number, currentRoomId: string | null = null) {
    if (!this.metaReady) return;

    type Candidate = { gi: number; i: number; distSq: number };
    const candidates: Candidate[] = [];

    for (let gi = 0; gi < this.galleries.length; gi++) {
      const g       = this.galleries[gi];
      const gFrames = this.frames[gi];
      const inRoom  = currentRoomId === g.roomId;
      const distSq  = g.loadDist * g.loadDist;

      for (let i = 0; i < gFrames.length; i++) {
        const f = gFrames[i];

        if (f.state === "loading" && f.mesh) {
          const mat = f.mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.20 + 0.20 * Math.sin(time * 3.5);
          continue;
        }

        if (f.state !== "unloaded") continue;

        const dx   = f.pos.x - cameraPos.x;
        const dz   = f.pos.z - cameraPos.z;
        const dSq  = dx * dx + dz * dz;

        if (!inRoom && dSq > distSq) continue;

        candidates.push({ gi, i, distSq: dSq });
      }
    }

    // Sort nearest-first so frames closest to the player load first
    candidates.sort((a, b) => a.distSq - b.distSq);

    for (const c of candidates) {
      if (this.activeLoads >= MAX_CONCURRENT) break;
      void this.loadFrame(c.gi, c.i);
    }
  }

  // ── Texture load + mesh swap ───────────────────────────────────────────────

  private async loadFrame(gi: number, i: number) {
    const g     = this.galleries[gi];
    const f     = this.frames[gi][i];
    const entry = this.meta[g.metaOffset + i];

    if (!entry?.image) {
      f.state = "error";
      return;
    }

    // Prefer the locally-downloaded AVIF; fall back to CDN if absent/failed
    const localUrl = `/nft-images/${entry.token_id}.avif`;
    const cdnUrl   = entry.image;

    f.state = "loading";
    this.activeLoads++;

    const geo = new THREE.PlaneGeometry(g.artW, g.artH);
    const mat = new THREE.MeshStandardMaterial({
      color:             0x1a2a3a,
      emissive:          new THREE.Color(0x4488ff),
      emissiveIntensity: 0.30,
      roughness:         0.9,
      side:              THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(f.origMatrix);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.userData = {
      isArtFrame:   true,
      imageUrl:     cdnUrl,
      galleryIndex: gi,
      frameIndex:   i,
    };
    this.scene.add(mesh);
    f.mesh = mesh;

    g.artMesh.setMatrixAt(i, this.zeroMatrix);
    g.artMesh.instanceMatrix.needsUpdate = true;

    try {
      // Try local JPEG first (served by Vite, no CORS/AVIF issues)
      // Fall back to CDN if local file isn't ready yet
      let tex: THREE.Texture;
      try {
        tex = await this.loadTexture(localUrl);
      } catch {
        tex = await this.loadTexture(cdnUrl);
      }

      let map: THREE.Texture = tex;
      if (f.needsUFlip) {
        const clone      = tex.clone();
        clone.wrapS      = THREE.RepeatWrapping;
        clone.repeat.x   = -1;
        clone.offset.x   =  1;
        clone.needsUpdate = true;
        f.flippedTex = clone;
        map = clone;
      }

      const finalMat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.85,
        side:      THREE.DoubleSide,
      });
      (mesh.material as THREE.MeshStandardMaterial).dispose();
      mesh.material = finalMat;
      f.state = "loaded";
    } catch (err) {
      console.error(`[ProximityTextureManager] Texture load failed gi=${gi} i=${i} url=${entry.image}:`, err);
      f.state = "error";
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.emissive.set(0x220000);
      m.emissiveIntensity = 0.05;
    } finally {
      this.activeLoads--;
    }
  }

  // ── Fetch-based texture loader (avoids AVIF format issues) ─────────────────
  //
  // Using fetch() instead of THREE.TextureLoader directly gives us:
  //   1. An explicit Accept header so CDNs that do content-negotiation prefer
  //      JPEG/PNG/WebP over AVIF, which has uneven WebGL support across devices.
  //   2. Blob URLs that bypass any lingering CORS preflight caching issues.
  //   3. Proper error propagation — TextureLoader swallows errors in some
  //      Three.js versions; fetch() always throws on non-2xx.

  private loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) {
      this.cacheOrder = this.cacheOrder.filter(u => u !== url);
      this.cacheOrder.push(url);
      return Promise.resolve(cached);
    }

    return (async () => {
      let tex: THREE.Texture;

      if (url.startsWith("/")) {
        // Local file served by Vite — use TextureLoader directly (no CORS, no AVIF)
        tex = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(url, resolve, undefined, reject);
        });
      } else {
        // Remote CDN — fetch as blob so we control Accept header and error handling
        const resp = await fetch(url, {
          headers: { Accept: "image/jpeg, image/png, image/webp, image/avif, image/*;q=0.8" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
        const objectUrl = URL.createObjectURL(await resp.blob());
        tex = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(
            objectUrl,
            (t) => { URL.revokeObjectURL(objectUrl); resolve(t); },
            undefined,
            (err) => { URL.revokeObjectURL(objectUrl); reject(err); },
          );
        });
      }

      if (this.cacheOrder.length >= MAX_CACHED) {
        const oldest = this.cacheOrder.shift()!;
        this.textureCache.get(oldest)?.dispose();
        this.textureCache.delete(oldest);
      }
      this.textureCache.set(url, tex);
      this.cacheOrder.push(url);
      return tex;
    })();
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  getStats(): { metaReady: boolean; total: number; loaded: number; loading: number; error: number; unloaded: number } {
    let loaded = 0, loading = 0, error = 0, unloaded = 0;
    for (const gFrames of this.frames)
      for (const f of gFrames) {
        if      (f.state === "loaded")   loaded++;
        else if (f.state === "loading")  loading++;
        else if (f.state === "error")    error++;
        else                             unloaded++;
      }
    return { metaReady: this.metaReady, total: loaded + loading + error + unloaded, loaded, loading, error, unloaded };
  }

  getSpawnedMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const gFrames of this.frames)
      for (const f of gFrames)
        if (f.mesh) out.push(f.mesh);
    return out;
  }

  getImageUrl(galleryIndex: number, frameIndex: number): string | undefined {
    const g = this.galleries[galleryIndex];
    if (!g) return undefined;
    return this.meta[g.metaOffset + frameIndex]?.image;
  }

  /** Returns the token_id for a given gallery + instance slot, if metadata is ready. */
  getTokenId(galleryIndex: number, frameIndex: number): string | undefined {
    const g = this.galleries[galleryIndex];
    if (!g) return undefined;
    return this.meta[g.metaOffset + frameIndex]?.token_id;
  }

  /** Returns rarity_rank and rarity_score for a given gallery + instance slot, if metadata is ready. */
  getMetaEntry(galleryIndex: number, frameIndex: number): { rarityRank: number | null; rarityScore: number } | undefined {
    const g = this.galleries[galleryIndex];
    if (!g) return undefined;
    const entry = this.meta[g.metaOffset + frameIndex];
    if (!entry) return undefined;
    return { rarityRank: entry.rarity_rank, rarityScore: entry.rarity_score };
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
        f.flippedTex?.dispose();
      }
    }
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
  }
}
