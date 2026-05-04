import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildScene } from "../museum/MuseumScene";
import { FirstPersonControls } from "../museum/FirstPersonControls";
import { rooms } from "../data/floorplan";

function getNearbyRoom(pos: THREE.Vector3): string | null {
  for (const room of rooms) {
    if (
      pos.x >= room.x && pos.x <= room.x + room.width &&
      pos.z >= room.y && pos.z <= room.y + room.height
    ) {
      return room.name.replace("\n", " — ");
    }
  }
  return null;
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function MuseumWalker() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [webglSupported] = useState(() => isWebGLAvailable());

  useEffect(() => {
    if (!webglSupported) return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 20, 60);

    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    );

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    buildScene(scene);

    const controls = new FirstPersonControls(camera, renderer.domElement);

    const onLockChange = () => setLocked(document.pointerLockElement === renderer.domElement);
    document.addEventListener("pointerlockchange", onLockChange);

    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      controls.update(delta);
      setRoomName(getNearbyRoom(camera.position));
      renderer.render(scene, camera);
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
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [webglSupported]);

  if (!webglSupported) {
    return (
      <div className="w-full h-screen bg-[#0a0a0f] flex flex-col items-center justify-center text-white">
        <p className="text-3xl font-bold text-indigo-300 mb-3">MUSEUM GENESIS</p>
        <p className="text-gray-400 mb-6">3333 NFT Collection — 3D Floor Walker</p>
        <div className="border border-red-500/40 bg-red-900/20 rounded-lg px-8 py-6 max-w-md text-center">
          <p className="text-red-400 font-semibold mb-2">WebGL Not Available</p>
          <p className="text-gray-400 text-sm">
            This 3D experience requires WebGL, which isn't supported in this preview environment.
            Open the app in a standard browser tab to walk through the museum.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-4 text-center max-w-xl">
          {["Common Gallery", "Uncommon Wing", "Rare Collection", "Platinum Vault", "Diamond Sanctum", "Entrance Hall"].map((r) => (
            <div key={r} className="bg-white/5 border border-white/10 rounded px-3 py-2">
              <p className="text-xs text-indigo-300 font-semibold">{r}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {!locked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white pointer-events-none select-none">
          <p className="text-4xl font-bold mb-2 tracking-wider text-indigo-300">MUSEUM GENESIS</p>
          <p className="text-lg text-gray-300 mb-1">3333 NFT Collection — 3D Floor Walk</p>
          <div className="mt-8 border border-white/20 rounded-lg px-8 py-5 text-center space-y-1 bg-black/40">
            <p className="text-sm text-gray-400 uppercase tracking-widest mb-3">Controls</p>
            <p className="text-white font-mono">Click anywhere to start</p>
            <p className="text-gray-300 font-mono text-sm mt-2">W A S D — Move</p>
            <p className="text-gray-300 font-mono text-sm">Mouse — Look around</p>
            <p className="text-gray-300 font-mono text-sm">ESC — Release mouse</p>
          </div>
        </div>
      )}

      {locked && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/70" />
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/70" />
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none select-none">
            {roomName ? (
              <div className="bg-black/60 border border-indigo-500/40 rounded-lg px-6 py-2">
                <p className="text-indigo-300 font-semibold text-sm uppercase tracking-widest">Current Location</p>
                <p className="text-white text-lg font-bold">{roomName}</p>
              </div>
            ) : (
              <div className="bg-black/40 border border-white/10 rounded-lg px-4 py-1">
                <p className="text-gray-500 text-xs font-mono">LOBBY / TRANSITION AREA</p>
              </div>
            )}
          </div>

          <div className="absolute top-4 right-4 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400 font-mono pointer-events-none select-none">
            <p>W A S D — Move</p>
            <p>ESC — Release cursor</p>
          </div>

          <div className="absolute top-4 left-4 text-white/60 text-xs font-mono pointer-events-none select-none">
            <p className="text-indigo-400 font-bold text-sm">MUSEUM GENESIS</p>
            <p>3333 NFT Collection</p>
          </div>
        </>
      )}
    </div>
  );
}
