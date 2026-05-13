import * as THREE from "three";

// ── Layout constants ─────────────────────────────────────────────────────────
// West wall of Entrance Hall: x=33, inner face x=33.125 (wall thickness=0.25)
const WALL_FACE_X  = 33.125;
const PANEL_DEPTH  = 0.10;
const PANEL_X      = WALL_FACE_X + PANEL_DEPTH / 2;  // 33.175 — sits against wall
const PANEL_Z      = 40.5;                             // centre of z=35..46
const PANEL_WIDTH  = 9.4;                              // along Z axis
const PANEL_HEIGHT = 3.4;                              // along Y axis
const PANEL_Y      = PANEL_HEIGHT / 2 + 0.3;          // 2.0 m centre height

// The panel front face is at x = 33.125 + PANEL_DEPTH = 33.225 (into room, +X)
const PANEL_FRONT_X = WALL_FACE_X + PANEL_DEPTH;     // 33.225

// West wall faces east (+X), so artwork planes face the player coming from the east
const ROT_Y = -Math.PI / 2;  // face toward +X (east)

// ── Team member data ─────────────────────────────────────────────────────────
interface TeamMember {
  name: string;
  role: string;
  color: number;
}

const TEAM: TeamMember[] = [
  { name: "Puresoul",   role: "Founder",      color: 0x9b59b6 },
  { name: "Karate Kid", role: "Dev",           color: 0x8e44ad },
  { name: "Uday",       role: "Dev",           color: 0x7d3c98 },
  { name: "Sirenia",    role: "Lead Artist",   color: 0x6c3483 },
  { name: "Oscar",      role: "Lead Artist",   color: 0x5b2c6f },
  { name: "Casper",     role: "Lead Artist",   color: 0x4a235a },
];

// ── Frame layout — 3 top, 3 bottom ──────────────────────────────────────────
const FW   = 1.30;   // frame width  (along Z)
const FH   = 1.00;   // frame height (along Y)
const FD   = 0.07;   // frame depth  (protrudes into room, along X)
const AW   = FW - 0.16;
const AH   = FH - 0.14;
const HGAP = 0.22;

const SIGN_H   = 0.36;
const Y_TOP    = 2.68;
const Y_BOT    = 1.28;

// Border frame sticks out proud of the panel front face
const BORDER_X  = PANEL_FRONT_X + FD / 2;    // 33.260
const ART_FACE_X = PANEL_FRONT_X + FD + 0.005; // 33.300

function rowCentres(count: number): number[] {
  const total  = count * FW + (count - 1) * HGAP;
  const usable = PANEL_WIDTH - 0.4;
  const start  = (PANEL_Z - PANEL_WIDTH / 2) + 0.2 + (usable - total) / 2 + FW / 2;
  return Array.from({ length: count }, (_, i) => start + i * (FW + HGAP));
}

// ── Canvas texture per team member ───────────────────────────────────────────
function makeMemberTexture(member: TeamMember): THREE.CanvasTexture {
  const size = 256;
  const c    = document.createElement("canvas");
  c.width = c.height = size;
  const ctx  = c.getContext("2d")!;

  // Deep purple background
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#1a0d2e");
  grad.addColorStop(1, "#0d0718");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle dot grid
  ctx.fillStyle = "rgba(180,130,255,0.07)";
  for (let x = 8; x < size; x += 16) {
    for (let y = 8; y < size; y += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Glowing circle badge
  const bx = size / 2, by = size / 2 - 28;
  const badge = ctx.createRadialGradient(bx, by, 0, bx, by, 38);
  badge.addColorStop(0, "rgba(180,80,255,0.55)");
  badge.addColorStop(1, "rgba(100,20,180,0.10)");
  ctx.beginPath();
  ctx.arc(bx, by, 38, 0, Math.PI * 2);
  ctx.fillStyle = badge;
  ctx.fill();
  ctx.strokeStyle = "rgba(200,120,255,0.80)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Parrot icon (simple emoji fallback)
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🦜", bx, by);

  // Name
  ctx.fillStyle = "#f0d9ff";
  ctx.font      = "bold 17px Arial";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(member.name, size / 2, size / 2 + 20);

  // Role
  ctx.fillStyle = "rgba(200,160,255,0.70)";
  ctx.font      = "13px Arial";
  ctx.fillText(member.role, size / 2, size / 2 + 40);

  // Thin bottom accent line
  ctx.strokeStyle = "rgba(180,80,255,0.45)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size - 12);
  ctx.lineTo(size * 0.8, size - 12);
  ctx.stroke();

  const tex          = new THREE.CanvasTexture(c);
  tex.colorSpace     = THREE.SRGBColorSpace;
  return tex;
}

// ── Build function ────────────────────────────────────────────────────────────
export function buildTeamBoard(scene: THREE.Scene): void {

  // ── Background panel (dark purple-slate slab) ────────────────────────────
  const panelGeo = new THREE.BoxGeometry(PANEL_DEPTH, PANEL_HEIGHT, PANEL_WIDTH);
  const panelMat = new THREE.MeshStandardMaterial({
    color:     0x120820,
    roughness: 0.85,
    metalness: 0.05,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(PANEL_X, PANEL_Y, PANEL_Z);
  panel.castShadow    = true;
  panel.receiveShadow = true;
  scene.add(panel);

  // ── Trim strips (purple-gold) ────────────────────────────────────────────
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
  const signGeo  = new THREE.BoxGeometry(PANEL_DEPTH + 0.002, SIGN_H, signW);
  const signCanv = document.createElement("canvas");
  signCanv.width = 800; signCanv.height = 64;
  const sc       = signCanv.getContext("2d")!;

  const signGrad = sc.createLinearGradient(0, 0, 800, 0);
  signGrad.addColorStop(0,   "#0d0718");
  signGrad.addColorStop(0.5, "#1a0d2e");
  signGrad.addColorStop(1,   "#0d0718");
  sc.fillStyle = signGrad;
  sc.fillRect(0, 0, 800, 64);

  sc.fillStyle  = "#c9a8ff";
  sc.font       = "bold 26px Arial";
  sc.textAlign  = "center";
  sc.textBaseline = "middle";
  sc.fillText("🦜  MEET THE TEAM  🦜", 400, 32);

  const signTex        = new THREE.CanvasTexture(signCanv);
  signTex.colorSpace   = THREE.SRGBColorSpace;
  const signMat        = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.1 });
  const sign           = new THREE.Mesh(signGeo, signMat);
  sign.position.set(PANEL_X, 0.3 + PANEL_HEIGHT - SIGN_H / 2 - 0.04, PANEL_Z);
  scene.add(sign);

  // ── Frame slots (3 top, 3 bottom) ────────────────────────────────────────
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.75, roughness: 0.28 });
  const borderGeo = new THREE.BoxGeometry(FD, FH, FW);
  const artGeo    = new THREE.PlaneGeometry(AW, AH);

  const topZs  = rowCentres(3);
  const botZs  = rowCentres(3);
  const slots: Array<{ z: number; y: number; idx: number }> = [
    ...topZs.map((z, i) => ({ z, y: Y_TOP, idx: i })),
    ...botZs.map((z, i) => ({ z, y: Y_BOT, idx: i + 3 })),
  ];

  slots.forEach(({ z, y, idx }) => {
    const member = TEAM[idx];
    if (!member) return;

    // Border frame
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(BORDER_X, y, z);
    border.castShadow = true;
    scene.add(border);

    // Art plane with canvas texture
    const tex    = makeMemberTexture(member);
    const artMat = new THREE.MeshStandardMaterial({
      map:       tex,
      roughness: 0.82,
      side:      THREE.DoubleSide,
    });
    const art = new THREE.Mesh(artGeo, artMat);
    art.position.set(ART_FACE_X, y, z);
    art.rotation.y = ROT_Y;
    art.receiveShadow = true;
    scene.add(art);
  });

  // ── Spotlights aimed at the board ────────────────────────────────────────
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
