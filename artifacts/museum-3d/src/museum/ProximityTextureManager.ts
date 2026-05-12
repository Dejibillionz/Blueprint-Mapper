import * as THREE from "three";

export interface GalleryConfig {
  artMeshes:  THREE.Mesh[];
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

type FrameState = "unloaded" | "loading" | "loaded" | "error";

interface Frame {
  pos:        THREE.Vector3;
  state:      FrameState;
  mesh:       THREE.Mesh;
  needsUFlip: boolean;
}

const MAX_CONCURRENT = 8;
const MAX_CACHED     = 200;

export class ProximityTextureManager {
  private scene:      THREE.Scene;
  private galleries:  GalleryConfig[];
  private frames:     Frame[][];
  private meta:       MetaEntry[] = [];
  private metaReady   = false;
  private activeLoads = 0;
  private anisotropy: number;
  private dpr:        number;

  private textureCache = new Map<string, THREE.Texture>();
  private cacheOrder:   string[] = [];

  onMetaLoaded?: (meta: MetaEntry[]) => void;

  constructor(scene: THREE.Scene, galleries: GalleryConfig[], anisotropy = 4, dpr = 1) {
    this.scene      = scene;
    this.galleries  = galleries;
    this.anisotropy = anisotropy;
    this.dpr        = Math.min(dpr, 2);

    // Build frame state from pre-created art meshes.
    // needsUFlip: east/west-facing walls (|sin(rotY)| ≈ 1) show the back face
    // of the plane to room-interior viewers — texture U must be flipped.
    this.frames = galleries.map(g =>
      g.artMeshes.map(mesh => ({
        pos:        mesh.position.clone(),
        state:      "unloaded" as FrameState,
        mesh,
        needsUFlip: Math.abs(Math.sin(mesh.rotation.y)) > 0.5,
      })),
    );

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

        if (f.state === "loading") {
          const mat = f.mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.20 + 0.20 * Math.sin(time * 3.5);
          continue;
        }

        if (f.state !== "unloaded") continue;

        const dx  = f.pos.x - cameraPos.x;
        const dz  = f.pos.z - cameraPos.z;
        const dSq = dx * dx + dz * dz;

        if (!inRoom && dSq > distSq) continue;

        candidates.push({ gi, i, distSq: dSq });
      }
    }

    candidates.sort((a, b) => a.distSq - b.distSq);

    for (const c of candidates) {
      if (this.activeLoads >= MAX_CONCURRENT) break;
      void this.loadFrame(c.gi, c.i);
    }
  }

  // ── DPR-aware URL builder ──────────────────────────────────────────────────
  // Scales the `w=` query parameter on CDN URLs by the device pixel ratio so
  // that high-DPI displays receive a proportionally larger source image.
  // Local paths (starting with "/") are returned unchanged — they are already
  // full-resolution AVIF assets served from disk.

  private buildDprUrl(url: string): string {
    if (this.dpr <= 1 || url.startsWith("/")) return url;
    try {
      const u = new URL(url);
      const w = u.searchParams.get("w");
      if (w) {
        u.searchParams.set("w", String(Math.round(parseInt(w, 10) * this.dpr)));
      } else {
        u.searchParams.set("w", String(Math.round(1000 * this.dpr)));
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  // ── Texture load — updates the pre-created mesh material in place ──────────

  private async loadFrame(gi: number, i: number) {
    const g     = this.galleries[gi];
    const f     = this.frames[gi][i];
    const entry = this.meta[g.metaOffset + i];

    if (!entry?.image) {
      f.state = "error";
      return;
    }

    const localUrl  = `/nft-images/${entry.token_id}.avif`;
    const cdnUrl    = entry.image;
    const cdnDprUrl = this.buildDprUrl(cdnUrl);

    f.state = "loading";
    this.activeLoads++;

    // Swap to a loading-indicator material (pulsed in update())
    const loadingMat = new THREE.MeshStandardMaterial({
      color:             0x1a2a3a,
      emissive:          new THREE.Color(0x4488ff),
      emissiveIntensity: 0.30,
      roughness:         0.9,
      side:              THREE.DoubleSide,
    });
    (f.mesh.material as THREE.MeshStandardMaterial).dispose();
    f.mesh.material = loadingMat;

    // Store CDN URL so click handler can show it in the zoom panel
    f.mesh.userData.imageUrl = cdnUrl;

    try {
      let tex: THREE.Texture;
      try {
        tex = await this.loadTexture(localUrl);
      } catch {
        tex = await this.loadTexture(cdnDprUrl);
      }

      let map: THREE.Texture = tex;
      if (f.needsUFlip) {
        const clone      = tex.clone();
        clone.wrapS      = THREE.RepeatWrapping;
        clone.repeat.x   = -1;
        clone.offset.x   =  1;
        clone.needsUpdate = true;
        map = clone;
      }

      const finalMat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.85,
        side:      THREE.DoubleSide,
      });
      (f.mesh.material as THREE.MeshStandardMaterial).dispose();
      f.mesh.material = finalMat;
      f.state = "loaded";
    } catch (err) {
      console.error(`[ProximityTextureManager] Texture load failed gi=${gi} i=${i}:`, err);
      f.state = "error";
      const m = f.mesh.material as THREE.MeshStandardMaterial;
      m.emissive?.set(0x220000);
      m.emissiveIntensity = 0.05;
    } finally {
      this.activeLoads--;
    }
  }

  // ── Fetch-based texture loader ─────────────────────────────────────────────

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
        tex = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(url, resolve, undefined, reject);
        });
      } else {
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

      tex.anisotropy = this.anisotropy;
      tex.needsUpdate = true;

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

  // ── Find a mesh by token_id (same mapping the texture loader uses) ─────────

  findArtMeshByTokenId(token_id: string): THREE.Mesh | null {
    for (let gi = 0; gi < this.galleries.length; gi++) {
      const g = this.galleries[gi];
      for (let i = 0; i < g.artMeshes.length; i++) {
        if (this.meta[g.metaOffset + i]?.token_id === token_id) {
          return g.artMeshes[i];
        }
      }
    }
    return null;
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

  getImageUrl(galleryIndex: number, frameIndex: number): string | undefined {
    const g = this.galleries[galleryIndex];
    if (!g) return undefined;
    return this.meta[g.metaOffset + frameIndex]?.image;
  }

  getTokenId(galleryIndex: number, frameIndex: number): string | undefined {
    const g = this.galleries[galleryIndex];
    if (!g) return undefined;
    return this.meta[g.metaOffset + frameIndex]?.token_id;
  }

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
        (f.mesh.material as THREE.MeshStandardMaterial).dispose();
      }
    }
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
  }
}
