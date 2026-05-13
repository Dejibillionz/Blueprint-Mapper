import * as THREE from "three";

// ── Layout constants ─────────────────────────────────────────────────────────
// West wall of Entrance Hall: x=33, inner face x=33.125 (wall thickness=0.25)
const WALL_FACE_X  = 33.125;
const PANEL_DEPTH  = 0.10;
const PANEL_X      = WALL_FACE_X + PANEL_DEPTH / 2;   // 33.175
const PANEL_Z      = 40.5;                              // centre of z=35..46
const PANEL_WIDTH  = 9.4;                               // along Z
const PANEL_HEIGHT = 3.4;                               // along Y
const PANEL_Y      = PANEL_HEIGHT / 2 + 0.3;           // 2.0 m centre

// Panel front face protrudes into the room toward +X
const PANEL_FRONT_X = WALL_FACE_X + PANEL_DEPTH;       // 33.225

// West wall faces EAST (+X) — player approaches from +X side.
// rotation.y = -π/2 makes the plane normal point toward +X (correct).
// scale.x = -1 is applied to each art plane to un-mirror the texture,
// because a -π/2 Y-rotation flips the local X-axis relative to world Z.
const ROT_Y = -Math.PI / 2;

// ── Team member data ─────────────────────────────────────────────────────────
interface TeamMember {
  name: string;
  role: string;
  // UV crop within the team photo (3 col × 2 row grid)
  // u0/v0 = bottom-left corner, u1/v1 = top-right corner (Three.js UV convention)
  u0: number; u1: number;
  v0: number; v1: number;
}

// The screenshot is a 3×2 grid: top row = Puresoul/KarateKid/Uday, bottom = Sirenia/Oscar/Casper.
// In Three.js UVs, V=1 is the top of the image, V=0 is the bottom.
// The image has a ~12% header ("Meet the team" bar) at the top.
// Approximate portrait crops — each column is 1/3 wide, each row is ~44% of image height.
const TEAM: TeamMember[] = [
  { name: "Puresoul",   role: "Founder",      u0: 0.00, u1: 0.333, v0: 0.44, v1: 0.88 },
  { name: "Karate Kid", role: "Dev",           u0: 0.333, u1: 0.666, v0: 0.44, v1: 0.88 },
  { name: "Uday",       role: "Dev",           u0: 0.666, u1: 1.00, v0: 0.44, v1: 0.88 },
  { name: "Sirenia",    role: "Lead Artist",   u0: 0.00, u1: 0.333, v0: 0.00, v1: 0.44 },
  { name: "Oscar",      role: "Lead Artist",   u0: 0.333, u1: 0.666, v0: 0.00, v1: 0.44 },
  { name: "Casper",     role: "Lead Artist",   u0: 0.666, u1: 1.00, v0: 0.00, v1: 0.44 },
];

// ── Frame layout — 3 top, 3 bottom ──────────────────────────────────────────
const FW   = 1.30;   // frame width  (along Z)
const FH   = 1.10;   // frame height (along Y)
const FD   = 0.07;   // frame depth  (into room, along X)
const AW   = FW - 0.12;
const AH   = FH - 0.10;
const HGAP = 0.22;

const SIGN_H = 0.36;
const Y_TOP  = 2.72;
const Y_BOT  = 1.28;

// Borders and art planes protrude into the hall (toward +X)
const BORDER_X   = PANEL_FRONT_X + FD / 2;       // 33.260
const ART_FACE_X = PANEL_FRONT_X + FD + 0.005;   // 33.300

function rowCentres(count: number): number[] {
  const total  = count * FW + (count - 1) * HGAP;
  const usable = PANEL_WIDTH - 0.4;
  const start  = (PANEL_Z - PANEL_WIDTH / 2) + 0.2 + (usable - total) / 2 + FW / 2;
  return Array.from({ length: count }, (_, i) => start + i * (FW + HGAP));
}

// Build a PlaneGeometry whose UV coords are clamped to a sub-region of a texture atlas.
function croppedPlane(aw: number, ah: number, u0: number, u1: number, v0: number, v1: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(aw, ah);
  const uv  = geo.attributes.uv as THREE.BufferAttribute;
  // PlaneGeometry UV order: TL, TR, BL, BR  (index 0,1,2,3)
  // After cropping, remap [0..1] → [u0..u1] / [v0..v1]
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

// ── Build function ────────────────────────────────────────────────────────────
export function buildTeamBoard(scene: THREE.Scene): void {

  // ── Background panel (dark purple-slate slab) ────────────────────────────
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x120820, roughness: 0.85, metalness: 0.05 });
  const panel    = new THREE.Mesh(new THREE.BoxGeometry(PANEL_DEPTH, PANEL_HEIGHT, PANEL_WIDTH), panelMat);
  panel.position.set(PANEL_X, PANEL_Y, PANEL_Z);
  panel.castShadow = panel.receiveShadow = true;
  scene.add(panel);

  // ── Purple trim strips ───────────────────────────────────────────────────
  const trimGeo = new THREE.BoxGeometry(PANEL_DEPTH + 0.002, 0.04, PANEL_WIDTH + 0.01);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.8, roughness: 0.25 });
  const trimBot = new THREE.Mesh(trimGeo, trimMat);
  trimBot.position.set(PANEL_X, 0.3 + 0.02, PANEL_Z);
  scene.add(trimBot);
  const trimTop = new THREE.Mesh(trimGeo, trimMat);
  trimTop.position.set(PANEL_X, 0.3 + PANEL_HEIGHT - 0.02, PANEL_Z);
  scene.add(trimTop);

  // ── Heading sign ─────────────────────────────────────────────────────────
  const signW    = 5.0;
  const signCanv = document.createElement("canvas");
  signCanv.width = 800; signCanv.height = 64;
  const sc       = signCanv.getContext("2d")!;
  const signGrad = sc.createLinearGradient(0, 0, 800, 0);
  signGrad.addColorStop(0,   "#0d0718");
  signGrad.addColorStop(0.5, "#1a0d2e");
  signGrad.addColorStop(1,   "#0d0718");
  sc.fillStyle = signGrad;
  sc.fillRect(0, 0, 800, 64);
  sc.fillStyle = "#c9a8ff";
  sc.font      = "bold 26px Arial";
  sc.textAlign = "center";
  sc.textBaseline = "middle";
  sc.fillText("🦜  MEET THE TEAM  🦜", 400, 32);
  const signTex      = new THREE.CanvasTexture(signCanv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_DEPTH + 0.002, SIGN_H, signW),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.1 }),
  );
  sign.position.set(PANEL_X, 0.3 + PANEL_HEIGHT - SIGN_H / 2 - 0.04, PANEL_Z);
  scene.add(sign);

  // ── Load the shared team photo ────────────────────────────────────────────
  const loader  = new THREE.TextureLoader();
  const baseUrl = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
  const imgUrl  = `${baseUrl}/images/meet-the-team.png`;

  // Shared material array — one entry per frame; we'll update maps once loaded.
  const artMaterials: THREE.MeshStandardMaterial[] = [];

  // Purple-glow placeholder shown until the image loads
  function makePlaceholder(name: string): THREE.CanvasTexture {
    const c   = document.createElement("canvas");
    c.width = c.height = 128;
    const cx  = c.getContext("2d")!;
    cx.fillStyle = "#1a0d2e";
    cx.fillRect(0, 0, 128, 128);
    cx.fillStyle = "rgba(180,80,255,0.15)";
    cx.fillRect(0, 0, 128, 128);
    cx.fillStyle = "#c9a8ff";
    cx.font = "bold 11px Arial";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(name, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ── Frame slots (3 top, 3 bottom) ────────────────────────────────────────
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.75, roughness: 0.28 });
  const borderGeo = new THREE.BoxGeometry(FD, FH, FW);

  const topZs = rowCentres(3);
  const botZs = rowCentres(3);
  const slots: Array<{ z: number; y: number; idx: number }> = [
    ...topZs.map((z, i) => ({ z, y: Y_TOP, idx: i })),
    ...botZs.map((z, i) => ({ z, y: Y_BOT, idx: i + 3 })),
  ];

  slots.forEach(({ z, y, idx }) => {
    const member = TEAM[idx];
    if (!member) return;

    // Gold border frame
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(BORDER_X, y, z);
    border.castShadow = true;
    scene.add(border);

    // Art plane with cropped UV to show this member's portrait from the photo
    const geo    = croppedPlane(AW, AH, member.u0, member.u1, member.v0, member.v1);
    const artMat = new THREE.MeshStandardMaterial({
      map:       makePlaceholder(member.name),
      roughness: 0.75,
      side:      THREE.FrontSide,
    });
    artMaterials.push(artMat);

    const art = new THREE.Mesh(geo, artMat);
    art.position.set(ART_FACE_X, y, z);
    art.rotation.y = ROT_Y;
    art.scale.x    = -1;   // un-mirror: -π/2 Y-rotation flips local X; this restores it
    art.receiveShadow = true;
    scene.add(art);
  });

  // Load image once; when ready swap all placeholder maps
  loader.load(
    imgUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // Each material already has its own UV-cropped geometry.
      // All frames share the SAME texture object (one GPU upload), just different UVs.
      for (const mat of artMaterials) {
        mat.map!.dispose();   // drop placeholder
        mat.map = tex;
        mat.needsUpdate = true;
      }
    },
    undefined,
    (err) => {
      console.warn("[TeamBoard] Could not load team photo:", imgUrl, err);
    },
  );

  // ── Spotlights ────────────────────────────────────────────────────────────
  const spot = new THREE.SpotLight(0xd5aaff, 5, 18, Math.PI / 6, 0.40);
  spot.position.set(38, 3.85, PANEL_Z);
  spot.target.position.set(PANEL_FRONT_X, PANEL_Y, PANEL_Z);
  spot.castShadow = false;
  scene.add(spot);
  scene.add(spot.target);

  const acc1 = new THREE.SpotLight(0xc084fc, 3.0, 10, Math.PI / 7, 0.50);
  acc1.position.set(37, 3.85, PANEL_Z - 2.5);
  acc1.target.position.set(PANEL_FRONT_X, Y_TOP, PANEL_Z - 2.5);
  scene.add(acc1);
  scene.add(acc1.target);

  const acc2 = new THREE.SpotLight(0xc084fc, 3.0, 10, Math.PI / 7, 0.50);
  acc2.position.set(37, 3.85, PANEL_Z + 2.5);
  acc2.target.position.set(PANEL_FRONT_X, Y_BOT, PANEL_Z + 2.5);
  scene.add(acc2);
  scene.add(acc2.target);
}
