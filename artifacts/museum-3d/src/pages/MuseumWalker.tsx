import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { buildScene } from "../museum/MuseumScene";
import { FirstPersonControls } from "../museum/FirstPersonControls";
import { buildCollisionBoxes } from "../museum/collision";
import { rooms } from "../data/floorplan";
import { drawMinimap, MAP_W, MAP_H } from "../museum/minimap";

interface ZoomedFrame {
  title: string;
  artist: string;
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
  const [webglSupported] = useState(isWebGLAvailable);

  // Refs for the Three.js state that needs to persist between renders
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<FirstPersonControls | null>(null);
  const frameMeshesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const zoomStateRef = useRef<{
    active: boolean;
    savedPos: THREE.Vector3;
    savedYaw: number;
    savedPitch: number;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    progress: number;
  } | null>(null);

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
    const frameMeshes = buildScene(scene);
    frameMeshesRef.current = frameMeshes;

    const controls = new FirstPersonControls(camera, renderer.domElement, collisionBoxes);
    controlsRef.current = controls;

    const onLockChange = () => setLocked(document.pointerLockElement === renderer.domElement);
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
        setRoomName(getNearbyRoom(camera.position));
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
      renderer.domElement.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      zoomStateRef.current = null;
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

      {/* ── Controls hint (top-right) ── */}
      {locked && !zoomedFrame && (
        <div className="absolute top-4 right-4 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400 font-mono pointer-events-none select-none space-y-0.5">
          <p>W A S D — Walk</p>
          <p>Mouse — Look</p>
          <p>Click painting — Zoom</p>
          <p>ESC — Release cursor</p>
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

      {/* ── Frame zoom overlay ── */}
      {zoomedFrame && (
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Dark vignette sides */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20" />

          {/* Info card bottom */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
            <div className="bg-black/70 border border-yellow-500/30 rounded-xl px-8 py-4 backdrop-blur-sm">
              <p className="text-yellow-300 text-xs uppercase tracking-widest font-semibold mb-1">Viewing Artwork</p>
              <p className="text-white text-xl font-bold">{zoomedFrame.title}</p>
              <p className="text-gray-300 text-sm">{zoomedFrame.artist}</p>
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
      )}

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
