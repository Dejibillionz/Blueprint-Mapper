import { useEffect, useRef, useState, useCallback, MutableRefObject } from "react";
import * as THREE from "three";
import { buildScene, CommonNFT, UncommonNFT, RareNFT, PlatinumNFT } from "../museum/MuseumScene";
import { FirstPersonControls } from "../museum/FirstPersonControls";
import { buildCollisionBoxes } from "../museum/collision";
import { rooms } from "../data/floorplan";
import { drawMinimap, MAP_W, MAP_H } from "../museum/minimap";
import { AmbientAudio } from "../museum/AmbientAudio";
import { ProximityTextureManager } from "../museum/ProximityTextureManager";

const OPENSEA_CONTRACT = "0x818030837e8350ba63e64d7dc01a547fa73c8279";

interface ZoomedFrame {
  title: string;
  artist: string;
  imageUrl?: string;
  token_id?: string;
  rarityRank?: number | null;
  rarityScore?: number;
}

interface HoverFrame {
  title: string;
  artist: string;
}

function getRarity(title: string): { tier: string; color: string; bg: string } {
  if (title.startsWith("Diamond"))  return { tier: "Diamond",  color: "#00b4d8", bg: "rgba(0,180,216,0.18)" };
  if (title.startsWith("Platinum")) return { tier: "Platinum", color: "#d4d4d4", bg: "rgba(200,200,200,0.18)" };
  if (title.startsWith("Rare"))     return { tier: "Rare",      color: "#a855f7", bg: "rgba(168,85,247,0.18)" };
  if (title.startsWith("Uncommon")) return { tier: "Uncommon",  color: "#06d6a0", bg: "rgba(6,214,160,0.18)" };
  if (title.startsWith("Hall"))     return { tier: "Legendary", color: "#f77f00", bg: "rgba(247,127,0,0.18)" };
  return                                   { tier: "Common",    color: "#3a86ff", bg: "rgba(58,134,255,0.18)" };
}

function getNearbyRoom(pos: THREE.Vector3): string | null {
  for (const room of rooms) {
    if (pos.x >= room.x && pos.x <= room.x + room.width &&
        pos.z >= room.y && pos.z <= room.y + room.height) {
      return room.name.replace("\n", " — ");
    }
  }
  return null;
}

function getNearbyRoomId(pos: THREE.Vector3): string | null {
  for (const room of rooms) {
    if (pos.x >= room.x && pos.x <= room.x + room.width &&
        pos.z >= room.y && pos.z <= room.y + room.height) {
      return room.id;
    }
  }
  return null;
}

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

export default function MuseumWalker() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [zoomedFrame, setZoomedFrame] = useState<ZoomedFrame | null>(null);
  const [hoverFrame, setHoverFrame] = useState<HoverFrame | null>(null);
  const [webglSupported] = useState(isWebGLAvailable);
  const [muted, setMuted] = useState(false);
  const [dbg, setDbg] = useState<{meta:boolean;loaded:number;loading:number;error:number;total:number;room:string|null} | null>(null);

  // Refs for the Three.js state that needs to persist between renders
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<FirstPersonControls | null>(null);
  const frameMeshesRef = useRef<THREE.Mesh[]>([]);
  const commonGalleryMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const commonNFTsRef = useRef<CommonNFT[]>([]);
  const uncommonGalleryMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const uncommonNFTsRef = useRef<UncommonNFT[]>([]);
  const rareGalleryMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rareNFTsRef = useRef<RareNFT[]>([]);
  const platinumGalleryMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const platinumNFTsRef = useRef<PlatinumNFT[]>([]);
  const proximityMgrRef = useRef<ProximityTextureManager | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AmbientAudio>(new AmbientAudio());
  const lastHoverTitleRef = useRef<string | null>(null);
  const zoomStateRef = useRef<{
    active: boolean;
    savedPos: THREE.Vector3;
    savedYaw: number;
    savedPitch: number;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    progress: number;
  } | null>(null);

  useEffect(() => {
    audioRef.current.setMuted(muted);
  }, [muted]);

  const exitZoom = useCallback(() => {
    const st = zoomStateRef.current;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!st || !cam || !ctrl) return;

    cam.position.copy(st.savedPos);
    ctrl.setYaw(st.savedYaw);
    ctrl.setPitch(st.savedPitch);
    const euler = new THREE.Euler(st.savedPitch, st.savedYaw, 0, "YXZ");
    cam.quaternion.setFromEuler(euler);

    zoomStateRef.current = null;
    setZoomedFrame(null);
  }, []);

  useEffect(() => {
    if (!webglSupported) return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08080e);
    scene.fog = new THREE.Fog(0x08080e, 18, 55);

    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.05, 200);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch { return; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const collisionBoxes = buildCollisionBoxes();
    const {
      frameMeshes,
      commonGalleryMesh,   commonArtMesh,   commonNFTs,
      uncommonGalleryMesh, uncommonArtMesh, uncommonNFTs,
      rareGalleryMesh,     rareArtMesh,     rareNFTs,
      platinumGalleryMesh, platinumArtMesh, platinumNFTs,
    } = buildScene(scene);

    frameMeshesRef.current          = frameMeshes;
    commonGalleryMeshRef.current    = commonGalleryMesh;
    commonNFTsRef.current           = commonNFTs;
    uncommonGalleryMeshRef.current  = uncommonGalleryMesh;
    uncommonNFTsRef.current         = uncommonNFTs;
    rareGalleryMeshRef.current      = rareGalleryMesh;
    rareNFTsRef.current             = rareNFTs;
    platinumGalleryMeshRef.current  = platinumGalleryMesh;
    platinumNFTsRef.current         = platinumNFTs;

    // ── Proximity texture manager ──────────────────────────────────
    // Art-panel dimensions mirror what each gallery builder uses:
    //   Common:    FW−0.10=0.42 × FH−0.07=0.29
    //   Uncommon:  FW−0.12=0.94 × FH−0.09=0.522
    //   Rare:      FW−0.16=2.12 × FH−0.14=1.52
    //   Platinum:  FW−0.14=2.36 × FH−0.14=2.36
    //
    // metaOffset maps gallery → metadata.json indices:
    //   Platinum 0-10, Rare 11-65, Uncommon 66-365, Common 366-3332
    const ptm = new ProximityTextureManager(scene, [
      { artMesh: platinumArtMesh, artW: 2.36,  artH: 2.36,  metaOffset: 0,   loadDist: 30, roomId: "room_4" },
      { artMesh: rareArtMesh,     artW: 2.12,  artH: 1.52,  metaOffset: 11,  loadDist: 25, roomId: "room_3" },
      { artMesh: uncommonArtMesh, artW: 0.94,  artH: 0.522, metaOffset: 66,  loadDist: 15, roomId: "room_2" },
      { artMesh: commonArtMesh,   artW: 0.42,  artH: 0.29,  metaOffset: 366, loadDist: 10, roomId: "room_1" },
    ]);

    // When metadata loads, update NFT titles/artists from real token data
    ptm.onMetaLoaded = (meta) => {
      // Platinum: meta[0..10]
      platinumNFTsRef.current.forEach((nft, i) => {
        const m = meta[i];
        if (m) { nft.title = `10K Squad #${m.token_id}`; nft.artist = "10K Squad"; }
      });
      // Rare: meta[11..65]
      rareNFTsRef.current.forEach((nft, i) => {
        const m = meta[11 + i];
        if (m) { nft.title = `10K Squad #${m.token_id}`; nft.artist = "10K Squad"; }
      });
      // Uncommon: meta[66..365]
      uncommonNFTsRef.current.forEach((nft, i) => {
        const m = meta[66 + i];
        if (m) { nft.title = `10K Squad #${m.token_id}`; nft.artist = "10K Squad"; }
      });
      // Common: meta[366..3332]
      commonNFTsRef.current.forEach((nft, i) => {
        const m = meta[366 + i];
        if (m) { nft.title = `10K Squad #${m.token_id}`; nft.artist = "10K Squad"; }
      });
    };

    proximityMgrRef.current = ptm;

    const controls = new FirstPersonControls(camera, renderer.domElement, collisionBoxes);
    controlsRef.current = controls;

    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (isLocked) audioRef.current.start();
    };
    document.addEventListener("pointerlockchange", onLockChange);

    // ── Helper: decompose a Matrix4 into position + quaternion ──
    const decomposeMatrix = (m: THREE.Matrix4) => {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      m.decompose(pos, quat, scale);
      return { pos, quat };
    };

    // ── Helper: trigger zoom toward a frame given world pos + quat ──
    const triggerZoom = (
      framePos: THREE.Vector3,
      frameQuat: THREE.Quaternion,
      frameData: { title: string; artist: string; imageUrl?: string; token_id?: string; rarityRank?: number | null; rarityScore?: number },
    ) => {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(frameQuat);
      const targetPos = framePos.clone().add(n.multiplyScalar(1.2));
      targetPos.y = 1.7;
      const yaw   = (controls as unknown as Record<string, number>)["yaw"];
      const pitch = (controls as unknown as Record<string, number>)["pitch"];
      zoomStateRef.current = {
        active: true,
        savedPos:    camera.position.clone(),
        savedYaw:    yaw,
        savedPitch:  pitch,
        targetPos,
        targetLookAt: framePos.clone(),
        progress: 0,
      };
      setZoomedFrame(frameData);
    };

    // ── Click handler: pointer lock OR frame zoom ──────────────
    const onClick = (e: MouseEvent) => {
      if (!controls.isLocked) {
        controls.requestLock();
        return;
      }
      if (zoomStateRef.current !== null) return;

      raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);

      // 1. Hand-placed feature frames (all rooms)
      const hits = raycasterRef.current.intersectObjects(frameMeshesRef.current, false);
      if (hits.length > 0) {
        const hit  = hits[0];
        const data = hit.object.userData as { isFrame?: boolean; title?: string; artist?: string };
        if (data.isFrame) {
          triggerZoom(
            hit.object.position.clone(),
            hit.object.quaternion.clone(),
            { title: data.title ?? "", artist: data.artist ?? "" },
          );
          e.stopPropagation();
          return;
        }
      }

      // 2. Spawned standalone art-panel meshes (ProximityTextureManager)
      const ptm = proximityMgrRef.current;
      if (ptm) {
        const artMeshes = ptm.getSpawnedMeshes();
        const artHits   = raycasterRef.current.intersectObjects(artMeshes, false);
        const artNear   = artHits.find(h => h.distance < 8);
        if (artNear) {
          const ud = artNear.object.userData as {
            isArtFrame?: boolean; imageUrl?: string;
            galleryIndex?: number; frameIndex?: number;
          };
          if (ud.isArtFrame) {
            const { pos, quat } = decomposeMatrix((artNear.object as THREE.Mesh).matrix);
            const nftIdx = typeof ud.galleryIndex === "number" && typeof ud.frameIndex === "number"
              ? (() => {
                  // gallery order matches PTM constructor: 0=platinum,1=rare,2=uncommon,3=common
                  const galleryNfts = [platinumNFTsRef, rareNFTsRef, uncommonNFTsRef, commonNFTsRef];
                  return galleryNfts[ud.galleryIndex!]?.current[ud.frameIndex!];
                })()
              : undefined;
            const tokenId = typeof ud.galleryIndex === "number" && typeof ud.frameIndex === "number"
              ? ptm?.getTokenId(ud.galleryIndex, ud.frameIndex)
              : undefined;
            const metaEntry = typeof ud.galleryIndex === "number" && typeof ud.frameIndex === "number"
              ? ptm?.getMetaEntry(ud.galleryIndex, ud.frameIndex)
              : undefined;
            triggerZoom(pos, quat, {
              title:       nftIdx?.title  ?? "NFT",
              artist:      nftIdx?.artist ?? "10K Squad",
              imageUrl:    ud.imageUrl,
              token_id:    tokenId,
              rarityRank:  metaEntry?.rarityRank,
              rarityScore: metaEntry?.rarityScore,
            });
            e.stopPropagation();
            return;
          }
        }
      }

      // 3. Instanced border meshes (frame not yet loaded as standalone mesh)
      // Map: [instancedMesh, galleryIndex in PTM, nftRef]
      type NftLike = { title: string; artist: string };
      type GalleryEntry = [THREE.InstancedMesh | null, number, MutableRefObject<NftLike[]>];
      const galleryEntries: GalleryEntry[] = [
        [commonGalleryMeshRef.current,   3, commonNFTsRef   as MutableRefObject<NftLike[]>],
        [uncommonGalleryMeshRef.current, 2, uncommonNFTsRef as MutableRefObject<NftLike[]>],
        [rareGalleryMeshRef.current,     1, rareNFTsRef     as MutableRefObject<NftLike[]>],
        [platinumGalleryMeshRef.current, 0, platinumNFTsRef as MutableRefObject<NftLike[]>],
      ];
      for (const [imesh, gi, nftRef] of galleryEntries) {
        if (!imesh) continue;
        const iHits = raycasterRef.current.intersectObject(imesh, false);
        const iNear = iHits.find(h => h.distance < 8);
        if (iNear !== undefined && iNear.instanceId !== undefined) {
          const instanceId = iNear.instanceId;
          const m = new THREE.Matrix4();
          imesh.getMatrixAt(instanceId, m);
          const { pos, quat } = decomposeMatrix(m);
          const nft = nftRef.current[instanceId];
          const imageUrl  = ptm?.getImageUrl(gi, instanceId);
          const token_id  = ptm?.getTokenId(gi, instanceId);
          const metaEntry = ptm?.getMetaEntry(gi, instanceId);
          triggerZoom(pos, quat, {
            title:       nft?.title  ?? "NFT",
            artist:      nft?.artist ?? "10K Squad",
            imageUrl,
            token_id,
            rarityRank:  metaEntry?.rarityRank,
            rarityScore: metaEntry?.rarityScore,
          });
          e.stopPropagation();
          return;
        }
      }
    };

    renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const zst = zoomStateRef.current;
      if (zst && zst.active) {
        zst.progress = Math.min(1, zst.progress + delta * 3);
        const t = 1 - Math.pow(1 - zst.progress, 3);
        camera.position.lerpVectors(zst.savedPos, zst.targetPos, t);
        camera.lookAt(zst.targetLookAt);
      } else {
        controls.update(delta);
        const currentRoomId = getNearbyRoomId(camera.position);
        setRoomName(getNearbyRoom(camera.position));
        audioRef.current.setRoom(currentRoomId);

        // ── Proximity texture loading ──────────────────────────
        proximityMgrRef.current?.update(camera.position, elapsed, currentRoomId);

        // Proximity frame detection — raycast from crosshair, max 4 m
        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);

        let hData: { title: string; artist: string } | null = null;

        // 1. Check hand-placed feature frames (all rooms)
        const hits = raycasterRef.current.intersectObjects(frameMeshesRef.current, false);
        const near = hits.find(h => h.distance < 4);
        if (near?.object.userData?.isFrame) {
          const ud = near.object.userData as { title: string; artist: string };
          hData = { title: ud.title, artist: ud.artist };
        }

        // 2. Check Common Gallery InstancedMesh (only when inside room_1)
        if (!hData && commonGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_1") {
          const cgHits = raycasterRef.current.intersectObject(commonGalleryMeshRef.current, false);
          const cgNear = cgHits.find(h => h.distance < 3.5);
          if (cgNear !== undefined && cgNear.instanceId !== undefined) {
            const nft = commonNFTsRef.current[cgNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist };
          }
        }

        // 3. Check Uncommon Gallery InstancedMesh (only when inside room_2)
        if (!hData && uncommonGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_2") {
          const ugHits = raycasterRef.current.intersectObject(uncommonGalleryMeshRef.current, false);
          const ugNear = ugHits.find(h => h.distance < 3.5);
          if (ugNear !== undefined && ugNear.instanceId !== undefined) {
            const nft = uncommonNFTsRef.current[ugNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist };
          }
        }

        // 4. Check Rare Gallery InstancedMesh (only when inside room_3)
        if (!hData && rareGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_3") {
          const rHits = raycasterRef.current.intersectObject(rareGalleryMeshRef.current, false);
          const rNear = rHits.find(h => h.distance < 5);
          if (rNear !== undefined && rNear.instanceId !== undefined) {
            const nft = rareNFTsRef.current[rNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist };
          }
        }

        // 5. Check Platinum Vault InstancedMesh (only when inside room_4)
        if (!hData && platinumGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_4") {
          const pHits = raycasterRef.current.intersectObject(platinumGalleryMeshRef.current, false);
          const pNear = pHits.find(h => h.distance < 5);
          if (pNear !== undefined && pNear.instanceId !== undefined) {
            const nft = platinumNFTsRef.current[pNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist };
          }
        }

        const newTitle = hData?.title ?? null;
        if (newTitle !== lastHoverTitleRef.current) {
          lastHoverTitleRef.current = newTitle;
          setHoverFrame(hData ? { title: hData.title, artist: hData.artist } : null);
        }
      }

      renderer.render(scene, camera);

      // Update minimap
      if (minimapRef.current) {
        const yaw = controls.getYaw();
        drawMinimap(minimapRef.current, camera.position.x, camera.position.z, yaw);
      }
    };
    animate();

    // Poll PTM stats every second for debug overlay
    const statsInterval = setInterval(() => {
      const ptm = proximityMgrRef.current;
      const cam = cameraRef.current;
      if (!ptm || !cam) return;
      const s = ptm.getStats();
      setDbg({ meta: s.metaReady, loaded: s.loaded, loading: s.loading, error: s.error, total: s.total, room: getNearbyRoomId(cam.position) });
    }, 1000);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearInterval(statsInterval);
      cancelAnimationFrame(animId);
      controls.dispose();
      audioRef.current.dispose();
      proximityMgrRef.current?.dispose();
      proximityMgrRef.current = null;
      renderer.domElement.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      zoomStateRef.current = null;
      commonGalleryMeshRef.current = null;
      commonNFTsRef.current = [];
      uncommonGalleryMeshRef.current = null;
      uncommonNFTsRef.current = [];
    };
  }, [webglSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!webglSupported) {
    return (
      <div className="w-full h-screen bg-[#08080e] flex flex-col items-center justify-center text-white">
        <p className="text-3xl font-bold text-indigo-300 mb-3">MUSEUM GENESIS</p>
        <p className="text-gray-400 mb-6">3333 NFT Collection</p>
        <div className="border border-red-500/40 bg-red-900/20 rounded-lg px-8 py-6 max-w-md text-center">
          <p className="text-red-400 font-semibold mb-2">WebGL Not Available</p>
          <p className="text-gray-400 text-sm">Open in Chrome or Firefox to walk through the museum.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* ── Splash (pointer not locked) ── */}
      {!locked && !zoomedFrame && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white pointer-events-none select-none">
          <p className="text-5xl font-bold mb-1 tracking-widest text-indigo-300 drop-shadow-lg">MUSEUM GENESIS</p>
          <p className="text-gray-400 mb-8 tracking-wider">3333 NFT Collection — 3D Experience</p>
          <div className="border border-indigo-500/30 rounded-xl px-10 py-6 text-center bg-black/50 space-y-2">
            <p className="text-sm text-indigo-300 uppercase tracking-widest mb-3 font-semibold">Controls</p>
            <p className="text-white font-mono text-lg">Click to enter &amp; lock cursor</p>
            <p className="text-gray-300 font-mono text-sm">W A S D — Walk</p>
            <p className="text-gray-300 font-mono text-sm">Mouse — Look</p>
            <p className="text-gray-300 font-mono text-sm">Click a painting — Zoom in</p>
            <p className="text-gray-300 font-mono text-sm">ESC — Exit / release cursor</p>
          </div>
        </div>
      )}

      {/* ── Crosshair ── */}
      {locked && !zoomedFrame && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="relative w-4 h-4">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/70" />
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/70" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-white/50" />
          </div>
        </div>
      )}

      {/* ── Room indicator ── */}
      {locked && !zoomedFrame && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none select-none">
          {roomName ? (
            <div className="bg-black/65 border border-indigo-500/40 rounded-lg px-6 py-2 text-center">
              <p className="text-indigo-400 text-xs uppercase tracking-widest font-semibold">Current Location</p>
              <p className="text-white font-bold">{roomName}</p>
            </div>
          ) : (
            <div className="bg-black/40 border border-white/10 rounded-lg px-4 py-1">
              <p className="text-gray-500 text-xs font-mono">TRANSITION AREA</p>
            </div>
          )}
        </div>
      )}

      {/* ── Controls hint + mute (top-right) ── */}
      {locked && !zoomedFrame && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400 font-mono pointer-events-none select-none space-y-0.5">
            <p>W A S D — Walk</p>
            <p>Mouse — Look</p>
            <p>Click painting — Zoom</p>
            <p>ESC — Release cursor</p>
          </div>
          <button
            onClick={() => setMuted(m => !m)}
            className="bg-black/60 border border-white/20 hover:border-indigo-400/60 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-indigo-300 transition-all flex items-center gap-1.5 select-none"
            title={muted ? "Unmute ambient audio" : "Mute ambient audio"}
          >
            {muted ? "🔇 Muted" : "🔊 Sound On"}
          </button>
        </div>
      )}

      {/* ── Title (top-left) ── */}
      {locked && !zoomedFrame && (
        <div className="absolute top-4 left-4 pointer-events-none select-none">
          <p className="text-indigo-400 font-bold text-sm tracking-widest">MUSEUM GENESIS</p>
          <p className="text-gray-500 text-xs">3333 NFT Collection</p>
        </div>
      )}

      {/* ── Debug HUD (top-right) ── */}
      {locked && !zoomedFrame && dbg && (
        <div className="absolute top-4 right-4 pointer-events-none select-none font-mono text-[11px] space-y-0.5"
             style={{ background: "rgba(0,0,0,0.75)", borderRadius: 8, padding: "8px 12px", border: "1px solid #ffffff22" }}>
          <p style={{ color: dbg.meta ? "#4ade80" : "#f87171" }}>
            {dbg.meta ? "✔ Meta loaded" : "⏳ Meta loading…"}
          </p>
          <p style={{ color: "#a78bfa" }}>Room: {dbg.room ?? "—"}</p>
          <p style={{ color: "#4ade80" }}>✔ Loaded: {dbg.loaded}</p>
          <p style={{ color: "#facc15" }}>⏳ Loading: {dbg.loading}</p>
          {dbg.error > 0 && <p style={{ color: "#f87171" }}>✗ Error: {dbg.error}</p>}
          <p style={{ color: "#6b7280" }}>Total tracked: {dbg.total}</p>
        </div>
      )}

      {/* ── Minimap (bottom-left) ── */}
      {locked && !zoomedFrame && (
        <div className="absolute bottom-5 left-5 pointer-events-none select-none">
          <p className="text-gray-500 text-[10px] font-mono uppercase tracking-widest mb-1 text-center">Floor Plan</p>
          <canvas
            ref={minimapRef}
            width={MAP_W}
            height={MAP_H}
            style={{ display: "block", borderRadius: 6 }}
          />
        </div>
      )}

      {/* ── Proximity info panel (bottom-right when looking at a frame) ── */}
      {locked && !zoomedFrame && hoverFrame && (() => {
        const r = getRarity(hoverFrame.title);
        return (
          <div className="absolute bottom-20 right-6 w-64 select-none pointer-events-none"
               style={{ animation: "fadeSlideIn 0.2s ease-out" }}>
            <div className="rounded-xl overflow-hidden border"
                 style={{ borderColor: r.color + "55", background: "rgba(8,8,14,0.88)", backdropFilter: "blur(12px)" }}>
              <div className="px-4 py-2 flex items-center gap-2"
                   style={{ background: r.bg, borderBottom: `1px solid ${r.color}33` }}>
                <span className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: r.color }}>◆ {r.tier}</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-white font-bold text-base leading-tight">{hoverFrame.title}</p>
                <p className="text-gray-400 text-xs mt-0.5">{hoverFrame.artist}</p>
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-gray-500 text-[10px] font-mono uppercase">Click to inspect</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                        style={{ color: r.color, borderColor: r.color + "55" }}>CLICK</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Frame zoom overlay ── */}
      {zoomedFrame && (() => {
        const r = getRarity(zoomedFrame.title);
        return (
          <div className="absolute inset-0 pointer-events-none select-none">
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/10" />

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80">
              <div className="rounded-2xl overflow-hidden border"
                   style={{ borderColor: r.color + "55", background: "rgba(8,8,14,0.90)", backdropFilter: "blur(14px)" }}>
                <div className="px-5 py-2.5 flex items-center justify-between"
                     style={{ background: r.bg, borderBottom: `1px solid ${r.color}33` }}>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: r.color }}>
                    ◆ {r.tier} Edition
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Museum Genesis</span>
                </div>
                {zoomedFrame.imageUrl && (
                  <div className="relative w-full bg-black/40"
                       style={{ borderBottom: `1px solid ${r.color}22` }}>
                    <img
                      src={zoomedFrame.imageUrl}
                      alt={zoomedFrame.title}
                      className="w-full object-contain"
                      style={{ maxHeight: 260 }}
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <div className="px-5 py-4">
                  <p className="text-white text-xl font-bold leading-snug">{zoomedFrame.title}</p>
                  <p className="text-gray-400 text-sm mt-0.5">{zoomedFrame.artist}</p>
                  {(zoomedFrame.rarityRank != null || zoomedFrame.rarityScore != null) && (
                    <div className="mt-3 flex items-center gap-2">
                      {zoomedFrame.rarityRank != null && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono border"
                              style={{ color: r.color, borderColor: r.color + "55", background: r.bg }}>
                          # {zoomedFrame.rarityRank}
                          <span className="font-normal text-[10px] opacity-70 ml-0.5">RANK</span>
                        </span>
                      )}
                      {zoomedFrame.rarityScore != null && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono border border-white/10 text-gray-300 bg-white/5">
                          {zoomedFrame.rarityScore.toFixed(2)}
                          <span className="text-[10px] text-gray-500 ml-0.5">SCORE</span>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs text-gray-500 font-mono">
                    <div><span className="text-gray-600">Collection</span><br /><span className="text-gray-300">Genesis 3333</span></div>
                    <div><span className="text-gray-600">Blockchain</span><br /><span className="text-gray-300">Ethereum</span></div>
                  </div>
                  <div className="mt-4 pointer-events-auto">
                    <button
                      className="w-full py-2.5 rounded-lg font-bold text-sm text-black tracking-wide transition-all hover:brightness-110 active:scale-95"
                      style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}cc)` }}
                      onClick={() => {
                        const url = zoomedFrame.token_id
                          ? `https://opensea.io/assets/ethereum/${OPENSEA_CONTRACT}/${zoomedFrame.token_id}`
                          : "https://opensea.io";
                        window.open(url, "_blank");
                      }}
                    >
                      Place Bid
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
              <button
                onClick={exitZoom}
                className="bg-black/60 border border-white/20 hover:border-white/50 text-white text-sm font-mono px-5 py-2 rounded-lg transition-all hover:bg-black/80"
              >
                ← Back to Museum (ESC)
              </button>
            </div>
          </div>
        );
      })()}

      {zoomedFrame && (
        <EscListener onEsc={exitZoom} />
      )}
    </div>
  );
}

function EscListener({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.code === "Escape") onEsc(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEsc]);
  return null;
}
