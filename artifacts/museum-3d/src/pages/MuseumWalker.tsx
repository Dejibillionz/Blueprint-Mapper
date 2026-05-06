import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { buildScene, CommonNFT, UncommonNFT, RareNFT } from "../museum/MuseumScene";
import { FirstPersonControls } from "../museum/FirstPersonControls";
import { buildCollisionBoxes } from "../museum/collision";
import { rooms } from "../data/floorplan";
import { drawMinimap, MAP_W, MAP_H } from "../museum/minimap";
import { AmbientAudio } from "../museum/AmbientAudio";

interface ZoomedFrame {
  title: string;
  artist: string;
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
      frameMeshes, commonGalleryMesh, commonNFTs,
      uncommonGalleryMesh, uncommonNFTs,
      rareGalleryMesh, rareNFTs,
    } = buildScene(scene);
    frameMeshesRef.current = frameMeshes;
    commonGalleryMeshRef.current = commonGalleryMesh;
    commonNFTsRef.current = commonNFTs;
    uncommonGalleryMeshRef.current = uncommonGalleryMesh;
    uncommonNFTsRef.current = uncommonNFTs;
    rareGalleryMeshRef.current = rareGalleryMesh;
    rareNFTsRef.current = rareNFTs;

    const controls = new FirstPersonControls(camera, renderer.domElement, collisionBoxes);
    controlsRef.current = controls;

    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (isLocked) audioRef.current.start();
    };
    document.addEventListener("pointerlockchange", onLockChange);

    // ── Click handler: pointer lock OR frame zoom ──────────────
    const onClick = (e: MouseEvent) => {
      if (!controls.isLocked) {
        controls.requestLock();
        return;
      }
      if (zoomStateRef.current !== null) return; // already zoomed, handled by UI

      // Raycast from screen centre toward frames
      raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = raycasterRef.current.intersectObjects(frameMeshesRef.current, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const data = hit.object.userData as { isFrame?: boolean; title?: string; artist?: string };
        if (data.isFrame) {
          // Build zoom target: 1.2m in front of frame
          const n = new THREE.Vector3(0, 0, 1).applyQuaternion(hit.object.quaternion);
          const targetPos = hit.object.position.clone().add(n.multiplyScalar(1.2));
          targetPos.y = 1.7;

          const yaw = (controls as unknown as Record<string, number>)["yaw"];
          const pitch = (controls as unknown as Record<string, number>)["pitch"];

          zoomStateRef.current = {
            active: true,
            savedPos: camera.position.clone(),
            savedYaw: yaw,
            savedPitch: pitch,
            targetPos,
            targetLookAt: hit.object.position.clone(),
            progress: 0,
          };
          setZoomedFrame({ title: data.title ?? "", artist: data.artist ?? "" });
          e.stopPropagation();
        }
      }
    };

    renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);

      const zst = zoomStateRef.current;
      if (zst && zst.active) {
        // Lerp toward zoom target
        zst.progress = Math.min(1, zst.progress + delta * 3);
        const t = 1 - Math.pow(1 - zst.progress, 3);
        camera.position.lerpVectors(zst.savedPos, zst.targetPos, t);
        camera.lookAt(zst.targetLookAt);
      } else {
        controls.update(delta);
        const rName = getNearbyRoom(camera.position);
        setRoomName(rName);
        audioRef.current.setRoom(getNearbyRoomId(camera.position));

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

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      controls.dispose();
      audioRef.current.dispose();
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
              {/* Rarity bar */}
              <div className="px-4 py-2 flex items-center gap-2"
                   style={{ background: r.bg, borderBottom: `1px solid ${r.color}33` }}>
                <span className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: r.color }}>◆ {r.tier}</span>
              </div>
              {/* Content */}
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
            {/* Dark vignette */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/10" />

            {/* NFT info card — bottom centre */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80">
              <div className="rounded-2xl overflow-hidden border"
                   style={{ borderColor: r.color + "55", background: "rgba(8,8,14,0.90)", backdropFilter: "blur(14px)" }}>
                {/* Rarity header */}
                <div className="px-5 py-2.5 flex items-center justify-between"
                     style={{ background: r.bg, borderBottom: `1px solid ${r.color}33` }}>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: r.color }}>
                    ◆ {r.tier} Edition
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Museum Genesis</span>
                </div>
                {/* Body */}
                <div className="px-5 py-4">
                  <p className="text-white text-xl font-bold leading-snug">{zoomedFrame.title}</p>
                  <p className="text-gray-400 text-sm mt-0.5">{zoomedFrame.artist}</p>
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs text-gray-500 font-mono">
                    <div><span className="text-gray-600">Collection</span><br /><span className="text-gray-300">Genesis 3333</span></div>
                    <div><span className="text-gray-600">Blockchain</span><br /><span className="text-gray-300">Ethereum</span></div>
                  </div>
                  {/* Bid button — pointer-events-auto so it's clickable */}
                  <div className="mt-4 pointer-events-auto">
                    <button
                      className="w-full py-2.5 rounded-lg font-bold text-sm text-black tracking-wide transition-all hover:brightness-110 active:scale-95"
                      style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}cc)` }}
                      onClick={() => window.open("https://opensea.io", "_blank")}
                    >
                      Place Bid
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit button */}
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

      {/* ESC while zoomed */}
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
