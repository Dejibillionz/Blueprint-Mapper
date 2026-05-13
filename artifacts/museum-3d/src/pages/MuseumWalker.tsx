import { useEffect, useRef, useState, useCallback, MutableRefObject, TouchEvent } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { buildScene, CommonNFT, UncommonNFT, RareNFT, PlatinumNFT, AnimatedDoor } from "../museum/MuseumScene";
import { partners } from "../data/partners";
import { FirstPersonControls } from "../museum/FirstPersonControls";
import { buildCollisionBoxes } from "../museum/collision";
import { buildExterior } from "../museum/Exterior";
import { rooms } from "../data/floorplan";
import { drawMinimap, MAP_W, MAP_H } from "../museum/minimap";
import { AmbientAudio } from "../museum/AmbientAudio";
import { ProximityTextureManager } from "../museum/ProximityTextureManager";
import { Receptionist } from "../museum/Receptionist";
import { buildLegendaryPedestals, LEGENDARY_PEDESTAL_META, LEGENDARY_PEDESTAL_POSITIONS } from "../museum/LegendaryPedestals";

// ── Legendary Vault pedestal model slots ─────────────────────────────────────
// Drop your GLB/GLTF paths here (one per pedestal, index 0-3).
// Leave a slot as "" to keep that pedestal bare.
const LEGENDARY_PEDESTAL_MODELS: readonly string[] = [
  "/models/base_basic_shaded.glb", // pedestal 1 — west row, north  (x≈83, z≈9)
  "", // pedestal 2 — west row, south  (x≈83, z≈17)
  "", // pedestal 3 — east row, north  (x≈94, z≈9)
  "", // pedestal 4 — east row, south  (x≈94, z≈17)
];

const OPENSEA_CONTRACT = "0x818030837e8350ba63e64d7dc01a547fa73c8279";
const IS_TOUCH = typeof window !== "undefined" && "ontouchstart" in window;

interface ZoomedFrame {
  title: string;
  artist: string;
  imageUrl?: string;
  token_id?: string;
  rarityRank?: number | null;
  rarityScore?: number;
  rarity?: string;
}

interface ZoomedPartner {
  index: number;
  name: string;
  description: string;
  imageUrl: string;
  linkUrl?: string;
}

interface ZoomedPedestal {
  index: number;
  name: string;
  description: string;
}

interface HoverFrame {
  title: string;
  artist: string;
  rarity: string;
}

function getRarity(title: string, rarity?: string): { tier: string; color: string; bg: string } {
  const t = rarity ?? title;
  if (t === "Legendary" || t.startsWith("Legendary") || t === "Platinum" || t.startsWith("Platinum")) return { tier: "Legendary", color: "#f77f00", bg: "rgba(247,127,0,0.18)" };
  if (t === "Rare"     || t.startsWith("Rare"))     return { tier: "Rare",     color: "#a855f7", bg: "rgba(168,85,247,0.18)" };
  if (t === "Uncommon" || t.startsWith("Uncommon")) return { tier: "Uncommon", color: "#06d6a0", bg: "rgba(6,214,160,0.18)" };
  if (t === "Common"   || t.startsWith("Common"))   return { tier: "Common",   color: "#3a86ff", bg: "rgba(58,134,255,0.18)" };
  if (t.startsWith("Diamond"))                       return { tier: "Diamond",  color: "#00b4d8", bg: "rgba(0,180,216,0.18)" };
  if (t.startsWith("Hall"))                          return { tier: "Legendary",color: "#f77f00", bg: "rgba(247,127,0,0.18)" };
  return                                                    { tier: "Common",   color: "#3a86ff", bg: "rgba(58,134,255,0.18)" };
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

interface NftTrait {
  trait_type: string;
  value: string | number;
}

interface NftDetail {
  traits: NftTrait[];
  owner: string | null;
}

const API_BASE   = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const EYE_HEIGHT = 1.7;

const nftDetailCache = new Map<string, NftDetail>();

interface SearchMeta {
  token_id:   string;
  rarity_rank: number | null;
  room:        number;
  room_index:  number;
}

const ROOM_NAMES: Record<number, string> = {
  1: "Common Gallery",
  2: "Uncommon Wing",
  3: "Rare Collection",
  4: "Legendary Vault",
};

const ROOM_RARITY: Record<number, { tier: string; color: string }> = {
  1: { tier: "Common",    color: "#3a86ff" },
  2: { tier: "Uncommon",  color: "#06d6a0" },
  3: { tier: "Rare",      color: "#a855f7" },
  4: { tier: "Legendary", color: "#f77f00" },
};

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
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
  const [nftDetail, setNftDetail] = useState<NftDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allMeta, setAllMeta] = useState<SearchMeta[]>([]);
  const [teleportBanner, setTeleportBanner] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [loadingFading, setLoadingFading] = useState(false);
  const [zoomedPartner, setZoomedPartner] = useState<ZoomedPartner | null>(null);
  const [zoomedPedestal, setZoomedPedestal] = useState<ZoomedPedestal | null>(null);
  const [detailPage, setDetailPage] = useState(0);   // 0 = artwork, 1 = details
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const welcomeTriggeredRef = useRef(false);
  const welcomeHideTimerRef = useRef<number | null>(null);
  const [receptionistHint,  setReceptionistHint]  = useState(false);
  const [receptionistOpen,  setReceptionistOpen]  = useState(false);
  const [receptionistQuery, setReceptionistQuery] = useState("");

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
  const commonArtMeshesRef   = useRef<THREE.Mesh[]>([]);
  const uncommonArtMeshesRef = useRef<THREE.Mesh[]>([]);
  const rareArtMeshesRef     = useRef<THREE.Mesh[]>([]);
  const platinumArtMeshesRef = useRef<THREE.Mesh[]>([]);
  const partnerFrameMeshesRef = useRef<THREE.Mesh[]>([]);
  const pedestalGroupsRef = useRef<THREE.Group[]>([]);
  const proximityMgrRef = useRef<ProximityTextureManager | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AmbientAudio>(new AmbientAudio());
  const lastHoverTitleRef = useRef<string | null>(null);
  const receptionistRef      = useRef<Receptionist | null>(null);
  const receptionistNearbyRef = useRef(false);
  const animatedDoorsRef     = useRef<AnimatedDoor[]>([]);
  const lastRecHintRef        = useRef(false);
  const receptionistOpenRef   = useRef(false);
  const followingGuideRef     = useRef(false);

  // ── Touch controls ─────────────────────────────────────────────
  const touchStartedRef   = useRef(false);
  const lookTouchIdRef    = useRef(-1);
  const lookTouchLastRef  = useRef({ x: 0, y: 0 });
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const joystickActiveRef  = useRef(false);
  const joystickTouchIdRef = useRef(-1);

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
    if (sessionStorage.getItem("museum_welcome_shown") === "1") {
      welcomeTriggeredRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!sceneReady) return;
    setLoadingFading(true);
    const t = setTimeout(() => setLoadingVisible(false), 700);
    return () => clearTimeout(t);
  }, [sceneReady]);

  useEffect(() => {
    audioRef.current.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    setDetailPage(0);   // always start on the artwork page when a new frame opens
    if (!zoomedFrame?.token_id) {
      setNftDetail(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }

    const cached = nftDetailCache.get(zoomedFrame.token_id);
    if (cached) {
      setNftDetail(cached);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }

    setNftDetail(null);
    setDetailError(false);
    setDetailLoading(true);

    const controller = new AbortController();
    fetch(`${API_BASE}/api/nft/${encodeURIComponent(zoomedFrame.token_id)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<NftDetail>;
      })
      .then(d => {
        nftDetailCache.set(zoomedFrame.token_id!, d);
        setNftDetail(d);
        setDetailLoading(false);
      })
      .catch(err => {
        if ((err as Error).name !== "AbortError") {
          setDetailError(true);
          setDetailLoading(false);
        }
      });
    return () => controller.abort();
  }, [zoomedFrame?.token_id]);

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

  const exitPedestalZoom = useCallback(() => {
    const st = zoomStateRef.current;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (st && cam && ctrl) {
      cam.position.copy(st.savedPos);
      ctrl.setYaw(st.savedYaw);
      ctrl.setPitch(st.savedPitch);
      const euler = new THREE.Euler(st.savedPitch, st.savedYaw, 0, "YXZ");
      cam.quaternion.setFromEuler(euler);
      zoomStateRef.current = null;
    }
    setZoomedPedestal(null);
  }, []);

  const teleportToNFT = useCallback((entry: SearchMeta) => {
    const cam  = cameraRef.current;
    const ctrl = controlsRef.current;
    const ptm  = proximityMgrRef.current;
    if (!cam || !ctrl || !ptm) return;

    // Use the PTM to find the exact mesh — same mapping the texture loader uses,
    // so the frame we stand in front of is always the one displaying this token.
    const artMesh = ptm.findArtMeshByTokenId(entry.token_id);
    if (!artMesh) return;

    const framePos = new THREE.Vector3();
    artMesh.getWorldPosition(framePos);

    // Use the same room-facing formula the gallery builders use:
    // towardRoom = (-sin(rotY), 0, cos(rotY))
    // Rotating local (0,0,1) by rotY gives (+sin, 0, +cos) — wrong sign on X
    // for east/west walls (rotY = ±π/2), which would put the viewer outside.
    const rotY = artMesh.rotation.y;
    const normal = new THREE.Vector3(-Math.sin(rotY), 0, Math.cos(rotY));
    normal.normalize();

    const STAND_DIST = 1.8;
    const viewerPos = framePos.clone().addScaledVector(normal, STAND_DIST);
    viewerPos.y = EYE_HEIGHT;

    // Viewer is at framePos + normal * STAND_DIST, so they must look back
    // toward the frame: forward direction = -normal.
    // FirstPersonControls forward = (-sin(yaw), 0, -cos(yaw)), so:
    //   -sin(yaw) = -(-sin(rotY)) = sin(rotY) = normal.x * -1... derivation
    //   gives yaw = atan2(normal.x, normal.z)  (NOT negated)
    const yaw   = Math.atan2(normal.x, normal.z);
    const pitch = Math.atan2(framePos.y - EYE_HEIGHT, STAND_DIST);

    cam.position.copy(viewerPos);
    ctrl.setYaw(yaw);
    ctrl.setPitch(pitch);
    cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));

    setSearchOpen(false);
    setSearchQuery("");
    setTeleportBanner(`NFT #${entry.token_id} — ${ROOM_NAMES[entry.room] ?? "Museum"}`);
    setTimeout(() => setTeleportBanner(null), 3500);
  }, []);

  const closeReceptionist = useCallback(() => {
    setReceptionistOpen(false);
    receptionistOpenRef.current = false;
    setReceptionistQuery("");
    receptionistRef.current?.setState("idle");
    if (controlsRef.current) controlsRef.current.suspended = false;
  }, []);

  const handleMobileStart = useCallback(() => {
    if (!IS_TOUCH) return;
    touchStartedRef.current = true;
    setLocked(true);
    audioRef.current.start();
  }, []);

  const handleJoystickMove = useCallback((dx: number, dz: number) => {
    controlsRef.current?.setTouchMove(dx, dz);
  }, []);

  const handleJoystickBreakGuide = useCallback(() => {
    if (followingGuideRef.current) {
      followingGuideRef.current = false;
      if (controlsRef.current) controlsRef.current.suspended = false;
      setTeleportBanner(null);
    }
  }, []);

  // Canvas look-drag handlers (touch only) — attached to the mountRef div via React props
  const handleCanvasTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!IS_TOUCH || receptionistOpenRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (lookTouchIdRef.current === -1) {
        lookTouchIdRef.current = t.identifier;
        lookTouchLastRef.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, []);

  const handleCanvasTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!IS_TOUCH) return;
    const controls = controlsRef.current;
    if (!controls) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchIdRef.current) {
        const dx = t.clientX - lookTouchLastRef.current.x;
        const dy = t.clientY - lookTouchLastRef.current.y;
        controls.setTouchLook(dx, dy);
        lookTouchLastRef.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, []);

  const handleCanvasTouchEnd = useCallback((e: TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchIdRef.current) {
        lookTouchIdRef.current = -1;
      }
    }
  }, []);

  // Release pointer lock when the receptionist panel opens so the cursor is visible
  useEffect(() => {
    if (receptionistOpen) {
      document.exitPointerLock();
    }
  }, [receptionistOpen]);

  // Suspend / resume movement controls when the partner overlay opens or closes.
  // On close, only unsuspend if no other mode (guide-follow, receptionist) has
  // suspended controls — avoids clobbering their suspension state.
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    if (zoomedPartner) {
      ctrl.suspended = true;
      document.exitPointerLock();
    } else {
      const otherSuspend = receptionistOpenRef.current || followingGuideRef.current || !!zoomedPedestal;
      if (!otherSuspend) ctrl.suspended = false;
    }
  }, [zoomedPartner, zoomedPedestal]);

  // Suspend / resume controls when the pedestal inspect overlay opens or closes.
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    if (zoomedPedestal) {
      ctrl.suspended = true;
      document.exitPointerLock();
    } else {
      const otherSuspend = receptionistOpenRef.current || followingGuideRef.current || !!zoomedPartner;
      if (!otherSuspend) ctrl.suspended = false;
    }
  }, [zoomedPedestal, zoomedPartner]);

  const ROOM_KEYS: Record<string, string> = {
    "Common Gallery":  "common",
    "Uncommon Wing":   "uncommon",
    "Rare Collection": "rare",
    "Legendary Vault":  "platinum",
  };

  const teleportToRoom = useCallback((name: string, _pos: [number, number, number], _yaw: number) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    // Close the panel right away — release pointer lock so cursor returns
    receptionistOpenRef.current = false;
    setReceptionistOpen(false);
    setReceptionistQuery("");
    ctrl.suspended = false;

    // Send the receptionist walking and switch the camera to follow mode
    const roomKey = ROOM_KEYS[name];
    if (roomKey) {
      receptionistRef.current?.walkToRoom(roomKey);
      followingGuideRef.current = true;
      ctrl.suspended = true; // freeze free movement while following
    }

    setTeleportBanner(`🚶 Follow your guide to ${name}…`);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Slash") { e.preventDefault(); setSearchOpen(s => !s); if (searchOpen) setSearchQuery(""); }
      if (e.code === "Escape" && searchOpen) { setSearchOpen(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchOpen]);

  // WASD / arrow-key break-away from guide follow mode
  useEffect(() => {
    const MOVE_KEYS = new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
    const h = (e: KeyboardEvent) => {
      if (!followingGuideRef.current) return;
      if (!MOVE_KEYS.has(e.code)) return;
      followingGuideRef.current = false;
      if (controlsRef.current) controlsRef.current.suspended = false;
      setTeleportBanner(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyE") {
        if (!receptionistOpen && receptionistNearbyRef.current) {
          setReceptionistOpen(true);
          receptionistOpenRef.current = true;
          if (controlsRef.current) controlsRef.current.suspended = true;
          receptionistRef.current?.setState("talk");
        } else if (receptionistOpen) {
          closeReceptionist();
        }
      }
      if (e.code === "Escape" && receptionistOpen) closeReceptionist();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [receptionistOpen, closeReceptionist]);

  // Keyboard-driven search and room navigation while panel is open (pointer-lock stays active)
  useEffect(() => {
    if (!receptionistOpen) return;
    const ROOM_DEST_KEYS: Array<{ name: string; pos: [number, number, number]; yaw: number }> = [
      { name: "Common Gallery",  pos: [27.5, EYE_HEIGHT, 14.0], yaw: -Math.PI / 2 },
      { name: "Uncommon Wing",   pos: [40.0, EYE_HEIGHT, 21.0], yaw:  0           },
      { name: "Rare Collection", pos: [64.0, EYE_HEIGHT, 21.0], yaw:  0           },
      { name: "Legendary Vault",  pos: [75.5, EYE_HEIGHT, 25.0], yaw:  Math.PI / 2 },
    ];
    const h = (e: KeyboardEvent) => {
      // Enter while search input is focused: teleport to first result
      if (e.code === "Enter") {
        const q = receptionistQuery.trim().toLowerCase();
        if (q) {
          const first = allMeta.find(m => m.token_id.toLowerCase().includes(q));
          if (first) { teleportToNFT(first); closeReceptionist(); }
        }
        return;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [receptionistOpen, receptionistQuery, allMeta, teleportToNFT, closeReceptionist]);

  useEffect(() => {
    if (!webglSupported) return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Match the horizon colour of the photo sky texture.
    scene.background = new THREE.Color(0x0d1f3c);
    // Extended far distance so the building facade is fully visible from outside.
    scene.fog = new THREE.Fog(0x0d1f3c, 25, 200);

    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.05, 500);
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
    setLoadProgress(0.05);

    // ── Post-processing: SSAO + Bloom (skipped on mobile / low-end GPUs) ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const isLowEnd = IS_TOUCH || renderer.capabilities.maxTextureSize < 4096;
    let ssaoPass: SSAOPass | null = null;

    if (!isLowEnd) {
      ssaoPass = new SSAOPass(scene, camera, mount.clientWidth, mount.clientHeight);
      ssaoPass.kernelRadius  = 0.25;
      ssaoPass.minDistance   = 0.001;
      ssaoPass.maxDistance   = 0.08;
      composer.addPass(ssaoPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(mount.clientWidth, mount.clientHeight),
        0.30,
        0.50,
        0.85,
      );
      composer.addPass(bloomPass);
    }
    setLoadProgress(0.15);

    const collisionBoxes = buildCollisionBoxes();

    // Exterior build is deferred so the interior renders on the first frame.
    // exterior becomes non-null after the first event-loop tick.
    let exterior: ReturnType<typeof buildExterior> | null = null;
    setTimeout(() => {
      exterior = buildExterior(scene);
      collisionBoxes.push(...exterior.boxes);
    }, 0);

    const {
      frameMeshes,
      commonGalleryMesh,   commonArtMeshes,   commonNFTs,
      uncommonGalleryMesh, uncommonArtMeshes, uncommonNFTs,
      rareGalleryMesh,     rareArtMeshes,     rareNFTs,
      platinumGalleryMesh, platinumArtMeshes, platinumNFTs,
      partnerFrameMeshes,
      animatedDoors,
    } = buildScene(scene);
    animatedDoorsRef.current = animatedDoors;

    // ── Legendary Vault pedestals (alongside buildPlatinumVault inside buildScene)
    pedestalGroupsRef.current = buildLegendaryPedestals(scene, LEGENDARY_PEDESTAL_MODELS);

    // ── Pedestal collision boxes (0.5 m × 0.5 m footprint each) ──────────────
    const PEDESTAL_HALF = 0.25;
    for (const { x, z } of LEGENDARY_PEDESTAL_POSITIONS) {
      collisionBoxes.push({
        minX: x - PEDESTAL_HALF,
        maxX: x + PEDESTAL_HALF,
        minZ: z - PEDESTAL_HALF,
        maxZ: z + PEDESTAL_HALF,
      });
    }

    frameMeshesRef.current          = frameMeshes;
    commonGalleryMeshRef.current    = commonGalleryMesh;
    commonNFTsRef.current           = commonNFTs;
    uncommonGalleryMeshRef.current  = uncommonGalleryMesh;
    uncommonNFTsRef.current         = uncommonNFTs;
    rareGalleryMeshRef.current      = rareGalleryMesh;
    rareNFTsRef.current             = rareNFTs;
    platinumGalleryMeshRef.current  = platinumGalleryMesh;
    platinumNFTsRef.current         = platinumNFTs;
    commonArtMeshesRef.current      = commonArtMeshes;
    uncommonArtMeshesRef.current    = uncommonArtMeshes;
    rareArtMeshesRef.current        = rareArtMeshes;
    platinumArtMeshesRef.current    = platinumArtMeshes;
    partnerFrameMeshesRef.current   = partnerFrameMeshes;
    setLoadProgress(0.50);

    // ── Readiness gate: scene is "ready" only when BOTH the first render
    //    frame has fired AND metadata.json has finished loading.
    let sceneFirstFrameFired = false;
    let metaDataLoaded = false;
    const tryMarkReady = () => {
      if (sceneFirstFrameFired && metaDataLoaded) {
        setLoadProgress(1);
        setSceneReady(true);
      }
    };

    // ── Proximity texture manager ──────────────────────────────────
    // metaOffset maps gallery → metadata.json indices:
    //   Platinum 0-10, Rare 11-65, Uncommon 66-365, Common 366-3332
    // Art plane meshes are pre-created by each gallery builder and
    // positioned 5 mm past the gold border front face so they are
    // never depth-culled.  PTM just swaps their material on load.
    const maxAniso  = renderer.capabilities.getMaxAnisotropy();
    const anisotropy = IS_TOUCH
      ? Math.min(maxAniso, 4)
      : Math.min(maxAniso, 8);
    const dpr = Math.min(window.devicePixelRatio, 2);

    const ptm = new ProximityTextureManager(scene, [
      { artMeshes: platinumArtMeshes, metaOffset: 0,   loadDist: 30, roomId: "room_4" },
      { artMeshes: rareArtMeshes,     metaOffset: 11,  loadDist: 25, roomId: "room_3" },
      { artMeshes: uncommonArtMeshes, metaOffset: 66,  loadDist: 15, roomId: "room_2" },
      { artMeshes: commonArtMeshes,   metaOffset: 366, loadDist: 10, roomId: "room_1" },
    ], anisotropy, dpr);

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
      // Populate search index
      setAllMeta(meta.map(m => ({
        token_id:   m.token_id,
        rarity_rank: m.rarity_rank,
        room:        m.room,
        room_index:  m.room_index,
      })));
      metaDataLoaded = true;
      tryMarkReady();
    };

    proximityMgrRef.current = ptm;
    setLoadProgress(0.65);

    const controls = new FirstPersonControls(camera, renderer.domElement, collisionBoxes);
    controlsRef.current = controls;

    // ── Receptionist NPC ───────────────────────────────────────────────────
    const receptionist = new Receptionist(
      scene,
      `${import.meta.env.BASE_URL}models/receptionist/`,
    );
    receptionistRef.current = receptionist;
    setLoadProgress(0.80);

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
      frameData: { title: string; artist: string; imageUrl?: string; token_id?: string; rarityRank?: number | null; rarityScore?: number; rarity?: string },
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
      // Release pointer lock so the detail panel sidebar can receive
      // wheel/scroll events — browser routes all scroll to the locked
      // element (canvas) while pointer lock is active.
      document.exitPointerLock();
    };

    // ── Click handler: pointer lock OR frame zoom ──────────────
    const onClick = (e: MouseEvent) => {
      // On touch devices, ignore taps while the entry splash is still showing
      if (IS_TOUCH && !touchStartedRef.current) return;
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

      // 2. Partner board frames
      if (partnerFrameMeshesRef.current.length > 0) {
        const pHits = raycasterRef.current.intersectObjects(partnerFrameMeshesRef.current, false);
        const pNear = pHits.find(h => h.distance < 6);
        if (pNear) {
          const ud = pNear.object.userData as { isPartnerFrame?: boolean; partnerIndex?: number };
          if (ud.isPartnerFrame && ud.partnerIndex !== undefined) {
            const p = partners[ud.partnerIndex];
            if (p) {
              setZoomedPartner({ index: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, linkUrl: p.linkUrl });
              document.exitPointerLock();
              e.stopPropagation();
              return;
            }
          }
        }
      }

      // 3. Legendary Vault pedestals — recursive raycast to hit GLTF children
      if (pedestalGroupsRef.current.length > 0) {
        const pedHits = raycasterRef.current.intersectObjects(pedestalGroupsRef.current, true);
        const pedNear = pedHits.find(h => h.distance < 6);
        if (pedNear) {
          // Walk up the object's parent chain to find the node tagged isPedestal
          let obj: THREE.Object3D | null = pedNear.object;
          while (obj && !obj.userData.isPedestal) obj = obj.parent;
          const pedestalIndex = obj?.userData.pedestalIndex as number | undefined;
          if (pedestalIndex !== undefined) {
            const meta = LEGENDARY_PEDESTAL_META[pedestalIndex];
            const group = pedestalGroupsRef.current[pedestalIndex];
            if (meta && group) {
              // Zoom camera close to the pedestal (same mechanism as painting zoom)
              const pedPos = new THREE.Vector3();
              group.getWorldPosition(pedPos);

              // Stand on the same horizontal side the player is already on
              const towardPlayer = new THREE.Vector3()
                .subVectors(camera.position, pedPos)
                .setY(0);
              if (towardPlayer.lengthSq() < 0.001) towardPlayer.set(0, 0, 1);
              towardPlayer.normalize();

              const targetPos = pedPos.clone().addScaledVector(towardPlayer, 1.1);
              targetPos.y = EYE_HEIGHT;

              // Look at model centre (top of pedestal + ~0.2 m model offset)
              const lookAtPos = pedPos.clone();
              lookAtPos.y = 1.5;

              const yaw   = (controls as unknown as Record<string, number>)["yaw"];
              const pitch = (controls as unknown as Record<string, number>)["pitch"];
              zoomStateRef.current = {
                active: true,
                savedPos:    camera.position.clone(),
                savedYaw:    yaw,
                savedPitch:  pitch,
                targetPos,
                targetLookAt: lookAtPos,
                progress: 0,
              };
              document.exitPointerLock();
              setZoomedPedestal({ index: pedestalIndex, name: meta.name, description: meta.description });
              e.stopPropagation();
              return;
            }
          }
        }
      }

      // 4. Instanced border meshes — zoom on click via instanceId
      // Map: [instancedMesh, galleryIndex in PTM, nftRef]
      type NftLike = { title: string; artist: string };
      type GalleryEntry = [THREE.InstancedMesh | null, number, MutableRefObject<NftLike[]>, string];
      const galleryEntries: GalleryEntry[] = [
        [commonGalleryMeshRef.current,   3, commonNFTsRef   as MutableRefObject<NftLike[]>, "Common"],
        [uncommonGalleryMeshRef.current, 2, uncommonNFTsRef as MutableRefObject<NftLike[]>, "Uncommon"],
        [rareGalleryMeshRef.current,     1, rareNFTsRef     as MutableRefObject<NftLike[]>, "Rare"],
        [platinumGalleryMeshRef.current, 0, platinumNFTsRef as MutableRefObject<NftLike[]>, "Legendary"],
      ];
      for (const [imesh, gi, nftRef, rarity] of galleryEntries) {
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
            rarity,
          });
          e.stopPropagation();
          return;
        }
      }
    };

    renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Clock();
    let animId: number;
    let firstFrame = true;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (firstFrame) {
        firstFrame = false;
        sceneFirstFrameFired = true;
        tryMarkReady();
        // Safety net: if metadata.json fails to load, dismiss the loader after 8 s
        // so the user is never stuck on the loading screen.
        setTimeout(() => {
          if (!metaDataLoaded) {
            setLoadProgress(1);
            setSceneReady(true);
          }
        }, 8000);
      }

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

        // ── Welcome message: fire once when player crosses entrance threshold ──
        if (!welcomeTriggeredRef.current && camera.position.z < 58) {
          welcomeTriggeredRef.current = true;
          sessionStorage.setItem("museum_welcome_shown", "1");
          setWelcomeVisible(true);
          welcomeHideTimerRef.current = window.setTimeout(() => setWelcomeVisible(false), 5000);
        }

        // ── Proximity texture loading ──────────────────────────
        proximityMgrRef.current?.update(camera.position, elapsed, currentRoomId);
        if (exterior) {
          exterior.tick(elapsed);
          exterior.updateDoor(camera.position, delta);
        }

        // ── Receptionist NPC ──────────────────────────────────
        const rec       = receptionistRef.current;
        const recResult = rec?.update(delta, camera.position);
        const isNearby  = !!recResult?.nearbyPrompt;
        receptionistNearbyRef.current = isNearby;
        if (isNearby !== lastRecHintRef.current) {
          lastRecHintRef.current = isNearby;
          setReceptionistHint(isNearby);
        }

        // ── Animated doors ────────────────────────────────────
        {
          const recPos = receptionistRef.current?.getPosition();
          for (const door of animatedDoorsRef.current) {
            const px = camera.position.x - door.triggerX;
            const pz = camera.position.z - door.triggerZ;
            const playerNear = Math.sqrt(px * px + pz * pz) < door.triggerDist;
            let guideNear = false;
            if (recPos) {
              const gx = recPos.x - door.triggerX;
              const gz = recPos.z - door.triggerZ;
              guideNear = Math.sqrt(gx * gx + gz * gz) < door.triggerDist;
            }
            const target = playerNear || guideNear ? 1 : 0;
            door.openness = THREE.MathUtils.lerp(door.openness, target, delta * 3.5);
            door.pivot.rotation.y = door.closedY + (door.openY - door.closedY) * door.openness;
          }
        }

        // ── Guide follow-cam ───────────────────────────────────
        if (followingGuideRef.current && rec) {
          if (rec.isGuiding()) {
            const recPos = rec.getPosition();
            const dir    = rec.getWalkDirection();
            // Camera sits 2.8 m behind the guide (opposite to walk dir)
            const behind = recPos.clone().addScaledVector(dir, -2.8);
            behind.y = EYE_HEIGHT;
            camera.position.lerp(behind, 0.07);
            // Look toward a point just ahead of the guide
            const lookAt = recPos.clone().addScaledVector(dir, 1.5);
            lookAt.y = EYE_HEIGHT - 0.05;
            const toGuide = new THREE.Vector3().subVectors(lookAt, camera.position).normalize();
            // yaw = atan2(-d.x, -d.z) makes camera look in direction d
            const yaw   = Math.atan2(-toGuide.x, -toGuide.z);
            const pitch = Math.asin(Math.max(-1, Math.min(1, toGuide.y)));
            controls.setYaw(yaw);
            controls.setPitch(pitch);
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
          } else {
            // Guide has arrived — hand control back to the player
            followingGuideRef.current = false;
            controls.suspended = false;
            setTeleportBanner(null);
          }
        }

        // Proximity frame detection — raycast from crosshair, max 4 m
        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);

        let hData: { title: string; artist: string; rarity: string } | null = null;

        // 1. Check hand-placed feature frames (all rooms)
        const hits = raycasterRef.current.intersectObjects(frameMeshesRef.current, false);
        const near = hits.find(h => h.distance < 4);
        if (near?.object.userData?.isFrame) {
          const ud = near.object.userData as { title: string; artist: string };
          hData = { title: ud.title, artist: ud.artist, rarity: "Common" };
        }

        // 2. Check Common Gallery InstancedMesh (only when inside room_1)
        if (!hData && commonGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_1") {
          const cgHits = raycasterRef.current.intersectObject(commonGalleryMeshRef.current, false);
          const cgNear = cgHits.find(h => h.distance < 3.5);
          if (cgNear !== undefined && cgNear.instanceId !== undefined) {
            const nft = commonNFTsRef.current[cgNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist, rarity: "Common" };
          }
        }

        // 3. Check Uncommon Gallery InstancedMesh (only when inside room_2)
        if (!hData && uncommonGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_2") {
          const ugHits = raycasterRef.current.intersectObject(uncommonGalleryMeshRef.current, false);
          const ugNear = ugHits.find(h => h.distance < 3.5);
          if (ugNear !== undefined && ugNear.instanceId !== undefined) {
            const nft = uncommonNFTsRef.current[ugNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist, rarity: "Uncommon" };
          }
        }

        // 4. Check Rare Gallery InstancedMesh (only when inside room_3)
        if (!hData && rareGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_3") {
          const rHits = raycasterRef.current.intersectObject(rareGalleryMeshRef.current, false);
          const rNear = rHits.find(h => h.distance < 5);
          if (rNear !== undefined && rNear.instanceId !== undefined) {
            const nft = rareNFTsRef.current[rNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist, rarity: "Rare" };
          }
        }

        // 5. Check Legendary Vault InstancedMesh (only when inside room_4)
        if (!hData && platinumGalleryMeshRef.current && getNearbyRoomId(camera.position) === "room_4") {
          const pHits = raycasterRef.current.intersectObject(platinumGalleryMeshRef.current, false);
          const pNear = pHits.find(h => h.distance < 5);
          if (pNear !== undefined && pNear.instanceId !== undefined) {
            const nft = platinumNFTsRef.current[pNear.instanceId];
            if (nft) hData = { title: nft.title, artist: nft.artist, rarity: "Legendary" };
          }
        }

        // 6. Check Partner Board frames (entrance hall east wall)
        if (!hData && partnerFrameMeshesRef.current.length > 0) {
          const pfHits = raycasterRef.current.intersectObjects(partnerFrameMeshesRef.current, false);
          const pfNear = pfHits.find(h => h.distance < 6);
          if (pfNear) {
            const ud = pfNear.object.userData as { isPartnerFrame?: boolean; partnerIndex?: number };
            if (ud.isPartnerFrame && ud.partnerIndex !== undefined) {
              const p = partners[ud.partnerIndex];
              if (p) hData = { title: p.name, artist: "NFT Partner", rarity: "Partner" };
            }
          }
        }

        // 7. Check Legendary Vault pedestals (recursive, room_4)
        if (!hData && pedestalGroupsRef.current.length > 0 && getNearbyRoomId(camera.position) === "room_4") {
          const pedHits = raycasterRef.current.intersectObjects(pedestalGroupsRef.current, true);
          const pedNear = pedHits.find(h => h.distance < 5);
          if (pedNear) {
            let obj: THREE.Object3D | null = pedNear.object;
            while (obj && !obj.userData.isPedestal) obj = obj.parent;
            const pedestalIndex = obj?.userData.pedestalIndex as number | undefined;
            if (pedestalIndex !== undefined) {
              const meta = LEGENDARY_PEDESTAL_META[pedestalIndex];
              if (meta) hData = { title: meta.name, artist: "Legendary Vault", rarity: "Legendary" };
            }
          }
        }

        const newTitle = hData?.title ?? null;
        if (newTitle !== lastHoverTitleRef.current) {
          lastHoverTitleRef.current = newTitle;
          setHoverFrame(hData ? { title: hData.title, artist: hData.artist, rarity: hData.rarity } : null);
        }
      }

      composer.render();

      // Update minimap
      if (minimapRef.current) {
        const yaw    = controls.getYaw();
        const recRef = receptionistRef.current;
        const recPos = recRef?.getPosition();
        const recDir = recRef?.getWalkDirection();
        // guideYaw convention matches model rotation: atan2(dx, dz)
        const recYaw = recDir ? Math.atan2(recDir.x, recDir.z) : undefined;
        drawMinimap(
          minimapRef.current,
          camera.position.x, camera.position.z, yaw,
          recPos?.x, recPos?.z, recYaw,
        );
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
      composer.setSize(mount.clientWidth, mount.clientHeight);
      if (ssaoPass) ssaoPass.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (welcomeHideTimerRef.current !== null) clearTimeout(welcomeHideTimerRef.current);
      clearInterval(statsInterval);
      cancelAnimationFrame(animId);
      controls.dispose();
      audioRef.current.dispose();
      proximityMgrRef.current?.dispose();
      proximityMgrRef.current = null;
      receptionistRef.current?.dispose();
      receptionistRef.current = null;
      renderer.domElement.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      composer.dispose();
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
        <p className="text-3xl font-bold text-indigo-300 mb-3">10KSQUAD MUSEUM</p>
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
      <div
        ref={mountRef}
        className="w-full h-full"
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleCanvasTouchMove}
        onTouchEnd={handleCanvasTouchEnd}
      />

      {/* ── Loading progress bar ── */}
      {loadingVisible && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center select-none"
          style={{
            background: "radial-gradient(ellipse at 50% 60%, #0d1535 0%, #08080e 70%)",
            opacity: loadingFading ? 0 : 1,
            transition: "opacity 0.65s ease-out",
            pointerEvents: loadingFading ? "none" : "all",
          }}
        >
          <div className="flex flex-col items-center gap-0 mb-10">
            <div
              className="mb-4 rounded-full flex items-center justify-center"
              style={{
                width: 72,
                height: 72,
                background: "linear-gradient(135deg, #4f46e5 0%, #c9a84c 100%)",
                boxShadow: "0 0 40px rgba(79,70,229,0.5), 0 0 80px rgba(201,168,76,0.2)",
              }}
            >
              <span style={{ fontSize: 36, lineHeight: 1 }}>🏛️</span>
            </div>
            <p
              className="font-bold tracking-widest uppercase"
              style={{
                fontSize: "clamp(1.25rem, 4vw, 2rem)",
                background: "linear-gradient(90deg, #818cf8, #c9a84c)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "0.25em",
              }}
            >
              10KSQUAD MUSEUM
            </p>
            <p className="text-gray-500 text-xs tracking-[0.2em] uppercase mt-1">
              3333 NFT Collection — 3D Experience
            </p>
          </div>

          <div className="w-72 flex flex-col items-center gap-2">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(loadProgress * 100)}%`,
                  background: "linear-gradient(90deg, #4f46e5, #818cf8 50%, #c9a84c)",
                  transition: "width 0.35s ease-out",
                  boxShadow: "0 0 8px rgba(129,140,248,0.7)",
                }}
              />
            </div>
            <p className="text-gray-600 text-[11px] font-mono tabular-nums">
              {loadProgress >= 1 ? "Entering museum…" : `Loading artwork data… ${Math.round(loadProgress * 100)}%`}
            </p>
          </div>
        </div>
      )}

      {/* ── Splash (pointer not locked / mobile not started) ── */}
      {!locked && !zoomedFrame && (
        IS_TOUCH ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white select-none cursor-pointer"
            onClick={handleMobileStart}
          >
            <p className="text-4xl font-bold mb-1 tracking-widest text-indigo-300 drop-shadow-lg">10KSQUAD MUSEUM</p>
            <p className="text-gray-400 mb-8 tracking-wider text-sm">3333 NFT Collection — 3D Experience</p>
            <div className="border border-indigo-500/30 rounded-xl px-8 py-6 text-center bg-black/50 space-y-2 max-w-[320px]">
              <p className="text-sm text-indigo-300 uppercase tracking-widest mb-3 font-semibold">Controls</p>
              <p className="text-white font-bold text-lg mb-2">Tap anywhere to explore</p>
              <p className="text-gray-300 text-sm">Left thumb — Walk (joystick)</p>
              <p className="text-gray-300 text-sm">Right thumb drag — Look around</p>
              <p className="text-gray-300 text-sm">Tap a painting — Zoom in</p>
              <p className="text-gray-300 text-sm">Tap Receptionist — Get a guide</p>
            </div>
            <p className="mt-6 text-indigo-400 text-sm animate-pulse">Tap to begin →</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white pointer-events-none select-none">
            <p className="text-5xl font-bold mb-1 tracking-widest text-indigo-300 drop-shadow-lg">10KSQUAD MUSEUM</p>
            <p className="text-gray-400 mb-8 tracking-wider">3333 NFT Collection — 3D Experience</p>
            <div className="border border-indigo-500/30 rounded-xl px-10 py-6 text-center bg-black/50 space-y-2">
              <p className="text-sm text-indigo-300 uppercase tracking-widest mb-3 font-semibold">Controls</p>
              <p className="text-white font-mono text-lg">Click to enter &amp; lock cursor</p>
              <p className="text-gray-300 font-mono text-sm">W A S D — Walk</p>
              <p className="text-gray-300 font-mono text-sm">Mouse — Look</p>
              <p className="text-gray-300 font-mono text-sm">Click a painting — Zoom in</p>
              <p className="text-gray-300 font-mono text-sm">E — Talk to Receptionist</p>
              <p className="text-gray-300 font-mono text-sm">ESC — Exit / release cursor</p>
            </div>
          </div>
        )
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
          {!IS_TOUCH && (
            <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400 font-mono pointer-events-none select-none space-y-0.5">
              <p>W A S D — Walk</p>
              <p>Mouse — Look</p>
              <p>Click painting — Zoom</p>
              <p>/ — Search NFT</p>
              <p>E — Talk to Receptionist</p>
              <p>ESC — Release cursor</p>
            </div>
          )}
          <button
            onClick={() => setMuted(m => !m)}
            className="bg-black/60 border border-white/20 hover:border-indigo-400/60 rounded-lg px-3 min-h-[44px] text-xs font-mono text-gray-300 hover:text-indigo-300 transition-all flex items-center gap-1.5 select-none"
            title={muted ? "Unmute ambient audio" : "Mute ambient audio"}
          >
            {muted ? "🔇 Muted" : "🔊 Sound On"}
          </button>
        </div>
      )}

      {/* ── Title + Search button (top-left) ── */}
      {!zoomedFrame && (
        <div className="absolute top-4 left-4 flex items-start gap-3 select-none">
          <div className="pointer-events-none">
            <p className="text-indigo-400 font-bold text-sm tracking-widest">10KSQUAD MUSEUM</p>
            <p className="text-gray-500 text-xs">3333 NFT Collection</p>
          </div>
          {allMeta.length > 0 && (
            <button
              onClick={() => setSearchOpen(s => !s)}
              className="mt-0.5 flex items-center gap-1.5 bg-black/60 border border-indigo-500/40 hover:border-indigo-400 rounded-lg px-2.5 py-1 text-xs font-mono text-indigo-300 hover:text-white transition-all pointer-events-auto"
              title="Search NFT by number (press /)"
            >
              🔍 <span className="hidden sm:inline">Search</span>
              <kbd className="ml-0.5 text-[9px] bg-white/10 rounded px-1">/</kbd>
            </button>
          )}
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

      {/* ── Minimap (bottom-left desktop / bottom-right mobile so joystick doesn't overlap) ── */}
      {locked && !zoomedFrame && (
        <div className={`absolute pointer-events-none select-none ${IS_TOUCH ? "bottom-5 right-5" : "bottom-5 left-5"}`}>
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
        const r = getRarity(hoverFrame.title, hoverFrame.rarity);
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
                  <span className="text-gray-500 text-[10px] font-mono uppercase">{IS_TOUCH ? "Tap to inspect" : "Click to inspect"}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                        style={{ color: r.color, borderColor: r.color + "55" }}>{IS_TOUCH ? "TAP" : "CLICK"}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Frame zoom overlay ── */}
      {zoomedFrame && (() => {
        const r = getRarity(zoomedFrame.title, zoomedFrame.rarity);
        return (
          <div className="absolute inset-0 pointer-events-none select-none">
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/10" />

            {/* ── Card ── pointer-events-auto so all taps register */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80 pointer-events-auto">
              <div className="rounded-2xl overflow-hidden border"
                   style={{ borderColor: r.color + "55", background: "rgba(8,8,14,0.92)", backdropFilter: "blur(14px)" }}>

                {/* Rarity header */}
                <div className="px-5 py-2.5 flex items-center justify-between"
                     style={{ background: r.bg, borderBottom: `1px solid ${r.color}33` }}>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: r.color }}>
                    ◆ {r.tier} Edition
                  </span>
                  {/* Page indicator dots */}
                  <div className="flex items-center gap-1.5">
                    {[0, 1].map(p => (
                      <button key={p} onClick={() => setDetailPage(p)}
                              className="rounded-full transition-all"
                              style={{ width: 6, height: 6, background: detailPage === p ? r.color : r.color + "44" }} />
                    ))}
                  </div>
                </div>

                {/* ── Page 0: Artwork ── */}
                {detailPage === 0 && (
                  <>
                    {zoomedFrame.imageUrl && (
                      <div className="relative w-full bg-black/40"
                           style={{ borderBottom: `1px solid ${r.color}22` }}>
                        <img
                          src={zoomedFrame.imageUrl}
                          alt={zoomedFrame.title}
                          className="w-full object-contain"
                          style={{ maxHeight: 240 }}
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
                      {/* Tap for details CTA */}
                      <button
                        className="mt-4 w-full min-h-[44px] py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-1.5"
                        style={{ background: r.bg, border: `1px solid ${r.color}55`, color: r.color }}
                        onClick={() => setDetailPage(1)}
                      >
                        Tap for Details
                        <span style={{ fontSize: 16, lineHeight: 1 }}>›</span>
                      </button>
                    </div>
                  </>
                )}

                {/* ── Page 1: Details ── */}
                {detailPage === 1 && (
                  <div className="px-5 py-4">
                    {/* Traits */}
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">Traits</p>
                    {detailLoading && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="rounded-lg px-2.5 py-2 bg-white/5 animate-pulse">
                            <div className="h-2 w-10 bg-white/10 rounded mb-1.5" />
                            <div className="h-2.5 w-14 bg-white/15 rounded" />
                          </div>
                        ))}
                      </div>
                    )}
                    {!detailLoading && detailError && (
                      <p className="text-gray-600 text-xs font-mono">Metadata unavailable</p>
                    )}
                    {!detailLoading && !detailError && nftDetail && nftDetail.traits.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {nftDetail.traits.slice(0, 8).map((t, i) => (
                          <div key={i} className="rounded-lg px-2.5 py-2 border border-white/8"
                               style={{ background: r.bg + "55" }}>
                            <p className="text-[9px] uppercase tracking-wider font-mono leading-none"
                               style={{ color: r.color + "cc" }}>
                              {t.trait_type}
                            </p>
                            <p className="text-white text-[11px] font-semibold mt-1 leading-tight truncate">
                              {String(t.value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!detailLoading && !detailError && nftDetail && nftDetail.traits.length === 0 && (
                      <p className="text-gray-600 text-xs font-mono">No traits</p>
                    )}

                    {/* Collection / Blockchain / Owner */}
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs text-gray-500 font-mono">
                      <div><span className="text-gray-600">Collection</span><br /><span className="text-gray-300">The 10K Squad</span></div>
                      <div><span className="text-gray-600">Blockchain</span><br /><span className="text-gray-300">Monad</span></div>
                      <div className="col-span-2">
                        <span className="text-gray-600">Owner</span><br />
                        {detailLoading && (
                          <span className="inline-block h-3 w-28 bg-white/10 rounded animate-pulse mt-0.5" />
                        )}
                        {!detailLoading && nftDetail?.owner && (
                          <a
                            href={`https://explorer.monad.xyz/address/${nftDetail.owner}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                            style={{ color: r.color }}
                            title={nftDetail.owner}
                          >
                            {shortenAddress(nftDetail.owner)}
                          </a>
                        )}
                        {!detailLoading && !nftDetail?.owner && (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="mt-4 flex gap-2">
                      <button
                        className="flex-1 min-h-[44px] py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all hover:brightness-110 active:scale-95"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af" }}
                        onClick={() => setDetailPage(0)}
                      >
                        ‹ Artwork
                      </button>
                      <button
                        className="flex-1 min-h-[44px] py-2.5 rounded-lg font-bold text-sm text-black tracking-wide transition-all hover:brightness-110 active:scale-95"
                        style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}cc)` }}
                        onClick={() => {
                          const url = zoomedFrame.token_id
                            ? `https://opensea.io/assets/monad/${OPENSEA_CONTRACT}/${zoomedFrame.token_id}`
                            : "https://opensea.io";
                          window.open(url, "_blank");
                        }}
                      >
                        Place Bid
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Back button */}
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

      {/* ── Partner frame overlay ── */}
      {zoomedPartner && (
        <div className="absolute inset-0 pointer-events-auto select-none z-40"
             style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)" }}>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80">
            <div className="rounded-2xl overflow-hidden border border-indigo-500/40"
                 style={{ background: "rgba(8,8,20,0.95)", backdropFilter: "blur(14px)", boxShadow: "0 0 40px rgba(99,102,241,0.12)" }}>

              {/* Header */}
              <div className="px-5 py-3 flex items-center gap-2 border-b border-indigo-500/20"
                   style={{ background: "rgba(99,102,241,0.10)" }}>
                <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">◆ NFT Partner</span>
              </div>

              {/* Image */}
              {zoomedPartner.imageUrl ? (
                <div className="relative w-full bg-black/40 border-b border-indigo-500/10">
                  <img
                    src={zoomedPartner.imageUrl}
                    alt={zoomedPartner.name}
                    className="w-full object-contain"
                    style={{ maxHeight: 200 }}
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div className="w-full flex items-center justify-center border-b border-indigo-500/10"
                     style={{ height: 120, background: "rgba(99,102,241,0.07)" }}>
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full border border-indigo-500/40 flex items-center justify-center mx-auto mb-2"
                         style={{ background: "rgba(99,102,241,0.18)" }}>
                      <span className="text-indigo-300 text-xl font-bold">{zoomedPartner.index + 1}</span>
                    </div>
                    <p className="text-indigo-400/60 text-xs font-mono uppercase tracking-widest">Photo coming soon</p>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="px-5 py-4">
                <p className="text-white text-xl font-bold leading-snug">{zoomedPartner.name}</p>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{zoomedPartner.description}</p>

                <div className="mt-4 flex gap-2">
                  <button
                    className="flex-1 min-h-[44px] py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all hover:brightness-110 active:scale-95"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af" }}
                    onClick={() => setZoomedPartner(null)}
                  >
                    ← Back
                  </button>
                  {zoomedPartner.linkUrl && (
                    <button
                      className="flex-1 min-h-[44px] py-2.5 rounded-lg font-bold text-sm text-white tracking-wide transition-all hover:brightness-110 active:scale-95"
                      style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "1px solid rgba(99,102,241,0.4)" }}
                      onClick={() => window.open(zoomedPartner.linkUrl, "_blank", "noopener,noreferrer")}
                    >
                      Visit Collection ↗
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Back button top */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={() => setZoomedPartner(null)}
              className="bg-black/60 border border-white/20 hover:border-white/50 text-white text-sm font-mono px-5 py-2 rounded-lg transition-all hover:bg-black/80"
            >
              ← Back to Museum (ESC)
            </button>
          </div>
        </div>
      )}

      {zoomedPartner && (
        <EscListener onEsc={() => setZoomedPartner(null)} />
      )}

      {/* ── Pedestal inspect overlay ── */}
      {zoomedPedestal && (
        <div
          className="absolute inset-0 pointer-events-auto select-none z-40"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(1px)" }}
          onClick={exitPedestalZoom}
        >
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80"
            onClick={e => e.stopPropagation()}
          >
            <div className="rounded-2xl overflow-hidden border border-amber-500/40"
                 style={{ background: "rgba(8,8,20,0.95)", backdropFilter: "blur(14px)", boxShadow: "0 0 40px rgba(247,127,0,0.18)" }}>

              {/* Header */}
              <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-500/20"
                   style={{ background: "rgba(247,127,0,0.10)" }}>
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">◆ Legendary Vault Artifact</span>
              </div>

              {/* Artifact viewer — stylised 3-D pedestal preview */}
              <div className="w-full flex items-center justify-center border-b border-amber-500/10 relative overflow-hidden"
                   style={{ height: 160, background: "linear-gradient(160deg, #0d0a00 0%, #1a0e00 50%, #0d0800 100%)" }}>
                {/* Ambient glow rings */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div style={{
                    width: 200, height: 200, borderRadius: "50%",
                    background: "radial-gradient(ellipse, rgba(247,127,0,0.12) 0%, transparent 70%)",
                  }} />
                </div>
                {/* Pedestal + artifact icon */}
                <div className="flex flex-col items-center gap-0 relative z-10">
                  {/* Artifact itself */}
                  <div className="rounded-full flex items-center justify-center mb-2"
                       style={{
                         width: 72, height: 72,
                         background: "linear-gradient(135deg, rgba(247,127,0,0.35) 0%, rgba(201,168,76,0.20) 100%)",
                         border: "1.5px solid rgba(247,127,0,0.55)",
                         boxShadow: "0 0 32px rgba(247,127,0,0.30), 0 0 8px rgba(201,168,76,0.20)",
                       }}>
                    <span style={{ fontSize: 34, lineHeight: 1 }}>
                      {["👑","🗝️","🛡️","💎"][zoomedPedestal.index] ?? "🏺"}
                    </span>
                  </div>
                  {/* Pedestal column */}
                  <div style={{
                    width: 32, height: 20,
                    background: "linear-gradient(to bottom, #2a2a3e, #1a1a2e)",
                    border: "1px solid rgba(212,212,212,0.20)",
                    borderRadius: "2px 2px 0 0",
                  }} />
                  <div style={{
                    width: 40, height: 6,
                    background: "linear-gradient(to right, #9ca3af, #d1d5db, #9ca3af)",
                    borderRadius: 1,
                  }} />
                </div>
                {/* Artifact number label */}
                <p className="absolute bottom-2 right-3 text-amber-400/50 text-[10px] font-mono uppercase tracking-widest">
                  Artifact {zoomedPedestal.index + 1} / {LEGENDARY_PEDESTAL_META.length}
                </p>
              </div>

              {/* Content */}
              <div className="px-5 py-4">
                <p className="text-white text-xl font-bold leading-snug">{zoomedPedestal.name}</p>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{zoomedPedestal.description}</p>

                {/* Rarity badge */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono border"
                        style={{ color: "#f77f00", borderColor: "#f77f0055", background: "rgba(247,127,0,0.14)" }}>
                    ◆ Legendary
                  </span>
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Legendary Vault</span>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="flex-1 min-h-[44px] py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all hover:brightness-110 active:scale-95"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af" }}
                    onClick={exitPedestalZoom}
                  >
                    ← Back
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Back button top — outside panel so backdrop click still works */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2" onClick={e => e.stopPropagation()}>
            <button
              onClick={exitPedestalZoom}
              className="bg-black/60 border border-white/20 hover:border-white/50 text-white text-sm font-mono px-5 py-2 rounded-lg transition-all hover:bg-black/80"
            >
              ← Back to Museum (ESC)
            </button>
          </div>
        </div>
      )}

      {zoomedPedestal && (
        <EscListener onEsc={exitPedestalZoom} />
      )}

      {/* ── Virtual joystick (touch only) ── */}
      {IS_TOUCH && locked && !zoomedFrame && !zoomedPartner && !zoomedPedestal && !receptionistOpen && (
        <VirtualJoystick
          onMove={handleJoystickMove}
          onBreakGuide={handleJoystickBreakGuide}
          joystickKnob={joystickKnob}
          setJoystickKnob={setJoystickKnob}
          joystickActiveRef={joystickActiveRef}
          joystickTouchIdRef={joystickTouchIdRef}
        />
      )}

      {/* ── Welcome message (first time crossing the entrance threshold) ── */}
      {welcomeVisible && locked && (
        <div className="absolute top-1/3 left-1/2 pointer-events-none select-none z-40"
             style={{ animation: "welcomeFadeInOut 5s ease forwards" }}>
          <div className="text-center px-10 py-6 rounded-2xl border"
               style={{
                 background: "rgba(8,8,14,0.90)",
                 backdropFilter: "blur(14px)",
                 borderColor: "#c9a84c66",
                 boxShadow: "0 0 40px rgba(201,168,76,0.15), 0 0 80px rgba(201,168,76,0.06)",
               }}>
            <p className="text-xs uppercase tracking-[0.3em] font-semibold mb-3"
               style={{ color: "#c9a84c" }}>◆ Museum Genesis ◆</p>
            <p className="text-white text-2xl font-bold tracking-wide leading-snug">
              Welcome to Museum Genesis
            </p>
            <p className="text-gray-400 text-sm mt-2 tracking-wide">
              3333 unique works await
            </p>
          </div>
        </div>
      )}

      {/* ── Teleport banner ── */}
      {teleportBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none select-none z-50"
             style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
          <div className="flex items-center gap-2 bg-black/80 border border-indigo-500/60 rounded-xl px-5 py-2.5 backdrop-blur-sm">
            <span className="text-indigo-400 text-sm">📍</span>
            <span className="text-white text-sm font-semibold">{teleportBanner}</span>
            <span className="text-gray-400 text-xs font-mono ml-1">Click to walk</span>
          </div>
        </div>
      )}

      {/* ── Receptionist proximity hint ── */}
      {!zoomedFrame && receptionistHint && !receptionistOpen && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 select-none z-30 cursor-pointer min-h-[44px]"
             style={{ animation: "fadeSlideIn 0.3s ease-out" }}
             onClick={() => {
               setReceptionistOpen(true);
               receptionistOpenRef.current = true;
               controlsRef.current && (controlsRef.current.suspended = true);
               receptionistRef.current?.setState("talk");
             }}>
          <div className="flex items-center gap-2 bg-black/75 border border-amber-400/50 rounded-xl px-5 py-2.5 backdrop-blur-sm min-h-[44px]"
               style={{ boxShadow: "0 0 20px rgba(251,191,36,0.12)" }}>
            <span className="text-amber-400 text-sm">👤</span>
            <span className="text-white text-sm font-semibold">Receptionist</span>
            {IS_TOUCH ? (
              <span className="ml-1 text-amber-300 text-xs font-mono">tap to talk</span>
            ) : (
              <>
                <kbd className="ml-1 bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-mono rounded px-2 py-0.5">E</kbd>
                <span className="text-gray-300 text-xs">to talk</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Receptionist interaction panel ── */}
      {receptionistOpen && (() => {
        const q = receptionistQuery.trim().toLowerCase();
        const recResults = q.length === 0
          ? []
          : allMeta.filter(m => m.token_id.toLowerCase().includes(q)).slice(0, 8);

        const ROOM_DESTINATIONS: Array<{ name: string; pos: [number, number, number]; yaw: number; room: number }> = [
          { name: "Common Gallery",  pos: [27.5, EYE_HEIGHT, 14.0], yaw: -Math.PI / 2, room: 1 },
          { name: "Uncommon Wing",   pos: [40.0, EYE_HEIGHT, 21.0], yaw:  0,           room: 2 },
          { name: "Rare Collection", pos: [64.0, EYE_HEIGHT, 21.0], yaw:  0,           room: 3 },
          { name: "Legendary Vault",  pos: [75.5, EYE_HEIGHT, 25.0], yaw:  Math.PI / 2, room: 4 },
        ];

        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto"
               style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
               onClick={e => { if (e.target === e.currentTarget) closeReceptionist(); }}>
            <div className="w-full max-w-md mx-4 rounded-2xl overflow-hidden border border-amber-400/30"
                 style={{ background: "rgba(8,8,20,0.97)", backdropFilter: "blur(16px)", boxShadow: "0 0 60px rgba(251,191,36,0.08)" }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8"
                   style={{ background: "rgba(251,191,36,0.06)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">👤</span>
                  <div>
                    <p className="text-amber-300 font-bold text-base leading-none">Receptionist</p>
                    <p className="text-gray-500 text-xs mt-0.5 font-mono">How can I help you?</p>
                  </div>
                </div>
                <button onClick={closeReceptionist}
                        className="text-gray-500 hover:text-white transition-colors text-xl leading-none px-1">✕</button>
              </div>

              <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">

                {/* ── Find an NFT ── */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 font-mono mb-2">🔍 Find an NFT — type to search</p>
                  <div className="flex items-center gap-2 bg-white/5 border border-amber-400/30 rounded-xl px-4 py-2.5 font-mono text-sm min-h-[44px] focus-within:border-amber-400/60 transition-colors">
                    <span className="text-gray-500 text-sm flex-shrink-0">🔍</span>
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 font-mono text-base caret-amber-400 min-w-0"
                      placeholder="Type NFT number…"
                      value={receptionistQuery}
                      onChange={e => setReceptionistQuery(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                    />
                    {receptionistQuery && (
                      <button className="ml-1 text-gray-500 hover:text-white text-xs flex-shrink-0" onClick={() => setReceptionistQuery("")}>✕</button>
                    )}
                  </div>

                  {recResults.length > 0 && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-white/10">
                      {recResults.map((entry, i) => {
                        const rr = ROOM_RARITY[entry.room] ?? ROOM_RARITY[1];
                        return (
                          <button key={entry.token_id + i}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                                  onClick={() => { teleportToNFT(entry); closeReceptionist(); }}>
                            <span className="text-white font-bold font-mono text-sm flex-shrink-0">#{entry.token_id}</span>
                            <span className="flex-1 text-gray-400 text-xs font-mono">{ROOM_NAMES[entry.room] ?? "Museum"}</span>
                            {entry.rarity_rank != null && (
                              <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">Rank #{entry.rarity_rank}</span>
                            )}
                            <span className="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                                  style={{ color: rr.color, borderColor: rr.color + "55", background: rr.color + "18" }}>
                              {rr.tier}
                            </span>
                            <span className="text-amber-400 text-xs flex-shrink-0">→</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {q.length > 0 && recResults.length === 0 && (
                    <p className="mt-2 text-gray-600 text-xs font-mono text-center py-2">No NFT found with that number</p>
                  )}
                </div>

                {/* ── Take me to… ── */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 font-mono mb-2">🚶 Take me to…</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ROOM_DESTINATIONS.map((dest, idx) => {
                      const rr = ROOM_RARITY[dest.room] ?? ROOM_RARITY[1];
                      return (
                        <button key={dest.name}
                                className="rounded-xl px-3 py-3 min-h-[44px] text-left transition-all hover:brightness-110 active:scale-95 border"
                                style={{ background: rr.color + "14", borderColor: rr.color + "40", color: rr.color }}
                                onClick={() => teleportToRoom(dest.name, dest.pos, dest.yaw)}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-bold text-sm leading-tight">{dest.name}</p>
                          </div>
                          <p className="text-[11px] opacity-60 font-mono uppercase tracking-wide">{rr.tier}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!IS_TOUCH && (
                  <p className="text-center text-gray-600 text-[11px] font-mono pt-1">
                    <kbd className="bg-white/10 rounded px-1">Enter</kbd> first result &nbsp;·&nbsp;
                    <kbd className="bg-white/10 rounded px-1">E</kbd>/<kbd className="bg-white/10 rounded px-1">ESC</kbd> close
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── NFT Search overlay ── */}
      {searchOpen && (() => {
        const q = searchQuery.trim().toLowerCase();
        const results = q.length === 0
          ? []
          : allMeta
              .filter(m => m.token_id.toLowerCase().includes(q))
              .slice(0, 8);
        return (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 pointer-events-auto"
               style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
               onClick={e => { if (e.target === e.currentTarget) { setSearchOpen(false); setSearchQuery(""); } }}>
            <div className="w-full max-w-md mx-4">
              {/* Input */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">🔍</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  placeholder="Search by NFT number (e.g. 2490)"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.code === "Escape") { setSearchOpen(false); setSearchQuery(""); }
                    if (e.code === "Enter" && results.length === 1) teleportToNFT(results[0]);
                  }}
                  className="w-full bg-[#0d0d1a] border border-indigo-500/60 focus:border-indigo-400 outline-none rounded-2xl pl-11 pr-5 py-3.5 text-white text-base font-mono placeholder-gray-600 transition-all"
                  style={{ boxShadow: "0 0 24px rgba(99,102,241,0.25)" }}
                />
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="mt-2 rounded-2xl overflow-hidden border border-white/10"
                     style={{ background: "rgba(8,8,20,0.97)", backdropFilter: "blur(16px)" }}>
                  {results.map((entry, i) => {
                    const rr = ROOM_RARITY[entry.room] ?? ROOM_RARITY[1];
                    return (
                      <button
                        key={entry.token_id + i}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                        onClick={() => teleportToNFT(entry)}
                      >
                        <span className="text-white font-bold font-mono text-sm flex-shrink-0">
                          #{entry.token_id}
                        </span>
                        <span className="flex-1 text-gray-400 text-xs font-mono">
                          {ROOM_NAMES[entry.room] ?? "Museum"}
                        </span>
                        {entry.rarity_rank != null && (
                          <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">
                            Rank #{entry.rarity_rank}
                          </span>
                        )}
                        <span className="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                              style={{ color: rr.color, borderColor: rr.color + "55", background: rr.color + "18" }}>
                          {rr.tier}
                        </span>
                        <span className="text-indigo-400 text-xs flex-shrink-0">→ Go</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {q.length > 0 && results.length === 0 && (
                <div className="mt-2 rounded-2xl border border-white/10 px-5 py-4 text-center"
                     style={{ background: "rgba(8,8,20,0.97)" }}>
                  <p className="text-gray-500 text-sm font-mono">No NFT found with that number</p>
                </div>
              )}

              {/* Hint */}
              {q.length === 0 && (
                <div className="mt-3 text-center">
                  <p className="text-gray-600 text-xs font-mono">
                    Type an NFT number · Press <kbd className="bg-white/10 rounded px-1">↵ Enter</kbd> for single match · <kbd className="bg-white/10 rounded px-1">ESC</kbd> to close
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
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

// ── Virtual Joystick (touch devices) ────────────────────────────────────────
const JOYSTICK_OUTER = 100; // px diameter of the outer ring
const JOYSTICK_RADIUS = 40; // max px the knob can travel from center

interface VirtualJoystickProps {
  onMove: (dx: number, dz: number) => void;
  onBreakGuide: () => void;
  joystickKnob: { x: number; y: number };
  setJoystickKnob: (k: { x: number; y: number }) => void;
  joystickActiveRef: MutableRefObject<boolean>;
  joystickTouchIdRef: MutableRefObject<number>;
}

function VirtualJoystick({
  onMove,
  onBreakGuide,
  joystickKnob,
  setJoystickKnob,
  joystickActiveRef,
  joystickTouchIdRef,
}: VirtualJoystickProps) {
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joystickActiveRef.current) return;
    const t = e.changedTouches[0];
    joystickActiveRef.current = true;
    joystickTouchIdRef.current = t.identifier;
    onBreakGuide();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const t = Array.from(e.changedTouches).find(
      t => t.identifier === joystickTouchIdRef.current,
    );
    if (!t) return;

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setJoystickKnob({ x: dx, y: dy });
    // dx/RADIUS = strafe, dy/RADIUS = forward (positive screen-y = backward)
    onMove(dx / JOYSTICK_RADIUS, dy / JOYSTICK_RADIUS);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const t = Array.from(e.changedTouches).find(
      t => t.identifier === joystickTouchIdRef.current,
    );
    if (!t) return;
    joystickActiveRef.current = false;
    joystickTouchIdRef.current = -1;
    setJoystickKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className="absolute bottom-6 left-6 z-20 select-none"
      style={{
        width: JOYSTICK_OUTER,
        height: JOYSTICK_OUTER,
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "2px solid rgba(255,255,255,0.22)",
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Inner knob */}
      <div
        className="absolute rounded-full"
        style={{
          width: 44,
          height: 44,
          left: "50%",
          top: "50%",
          background: "rgba(255,255,255,0.28)",
          border: "1.5px solid rgba(255,255,255,0.55)",
          transform: `translate(calc(-50% + ${joystickKnob.x}px), calc(-50% + ${joystickKnob.y}px))`,
          transition: joystickActiveRef.current ? "none" : "transform 0.12s ease-out",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}
