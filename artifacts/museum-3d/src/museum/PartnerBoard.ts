import * as THREE from "three";
import { partners, Partner } from "../data/partners";

// ── Layout constants ─────────────────────────────────────────────────────────
// East wall of Entrance Hall: x=48, inner face x≈47.875 (wall thickness=0.25)
const WALL_FACE_X  = 47.875;
const PANEL_DEPTH  = 0.10;
const PANEL_X      = WALL_FACE_X - PANEL_DEPTH / 2;   // 47.825
const PANEL_Z      = 40.5;                              // centre of z=35..46
const PANEL_WIDTH  = 9.4;                              // along Z
const PANEL_HEIGHT = 3.4;                              // along Y
const PANEL_Y      = PANEL_HEIGHT / 2 + 0.3;           // 2.0

// Frame slots — 6 top row + 5 bottom row
const FW  = 1.18;    // frame width  (along Z)
const FH  = 0.94;    // frame height (along Y)
const FD  = 0.07;    // frame depth
const AW  = FW - 0.16; // art plane width
const AH  = FH - 0.14; // art plane height
const HGAP = 0.20;   // horizontal gap between frames
const ROT_Y = Math.PI / 2; // east wall → faces west (-X) into the hall

// Art plane offset from the WALL face into the room
const ART_FACE_X = WALL_FACE_X - FD - 0.003;

// Row vertical centres
const Y_TOP = 2.78;
const Y_BOT = 1.28;

function rowCentres(count: number): number[] {
  const total = count * FW + (count - 1) * HGAP;
  const usable = PANEL_WIDTH - 0.4;  // 0.2 m margin each side
  const start = (PANEL_Z - PANEL_WIDTH / 2) + 0.2 + (usable - total) / 2 + FW / 2;
  return Array.from({ length: count }, (_, i) => start + i * (FW + HGAP));
}

function makePlaceholderTexture(index: number, name: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, size, size);

  // Subtle grid pattern
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0);   ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i);   ctx.lineTo(size, i); ctx.stroke();
  }

  // Badge
  const bx = size / 2, by = size / 2 - 24;
  ctx.beginPath();
  ctx.arc(bx, by, 28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(99,102,241,0.30)";
  ctx.fill();
  ctx.strokeStyle = "rgba(99,102,241,0.70)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#c7d2fe";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index + 1), bx, by);

  // Label
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "bold 13px Arial";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name.length > 16 ? name.slice(0, 14) + "…" : name, size / 2, size / 2 + 22);

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "10px Arial";
  ctx.fillText("NFT Partner", size / 2, size / 2 + 40);

  return new THREE.CanvasTexture(c);
}

export interface PartnerBoardResult {
  frameMeshes: THREE.Mesh[];
  lights: THREE.Object3D[];
}

export function buildPartnerBoard(scene: THREE.Scene): PartnerBoardResult {
  // ── Panel (dark wood-slate slab) ─────────────────────────────────────────
  const panelGeo = new THREE.BoxGeometry(PANEL_DEPTH, PANEL_HEIGHT, PANEL_WIDTH);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1410,
    roughness: 0.85,
    metalness: 0.05,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(PANEL_X, PANEL_Y, PANEL_Z);
  panel.castShadow = true;
  panel.receiveShadow = true;
  scene.add(panel);

  // ── Thin gold trim strip along the bottom edge of the board ─────────────
  const trimGeo = new THREE.BoxGeometry(PANEL_DEPTH + 0.002, 0.04, PANEL_WIDTH + 0.01);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.8, roughness: 0.25 });
  const trimBot = new THREE.Mesh(trimGeo, trimMat);
  trimBot.position.set(PANEL_X, 0.3 + 0.02, PANEL_Z);
  scene.add(trimBot);
  const trimTop = new THREE.Mesh(trimGeo, trimMat);
  trimTop.position.set(PANEL_X, 0.3 + PANEL_HEIGHT - 0.02, PANEL_Z);
  scene.add(trimTop);

  // ── Heading sign ─────────────────────────────────────────────────────────
  const signW = 3.2, signH = 0.38;
  const signGeo = new THREE.BoxGeometry(PANEL_DEPTH + 0.002, signH, signW);
  const signCanv = document.createElement("canvas");
  signCanv.width = 512; signCanv.height = 64;
  const sc = signCanv.getContext("2d")!;
  sc.fillStyle = "#0d1117";
  sc.fillRect(0, 0, 512, 64);
  sc.fillStyle = "#c9a84c";
  sc.font = "bold 28px Arial";
  sc.textAlign = "center";
  sc.textBaseline = "middle";
  sc.fillText("NFT PARTNERS", 256, 32);
  const signTex = new THREE.CanvasTexture(signCanv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.1 });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(PANEL_X, 0.3 + PANEL_HEIGHT + signH / 2 + 0.06, PANEL_Z);
  scene.add(sign);

  // ── Frame slots ──────────────────────────────────────────────────────────
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xc9a84c, metalness: 0.75, roughness: 0.28,
  });
  const borderGeo = new THREE.BoxGeometry(FD, FH, FW);

  const artGeo = new THREE.PlaneGeometry(AW, AH);

  const frameMeshes: THREE.Mesh[] = [];

  const topZs = rowCentres(6);
  const botZs = rowCentres(5);
  const slots: Array<{ z: number; y: number }> = [
    ...topZs.map(z => ({ z, y: Y_TOP })),
    ...botZs.map(z => ({ z, y: Y_BOT })),
  ];

  const loader = new THREE.TextureLoader();

  slots.forEach(({ z, y }, i) => {
    const partner: Partner = partners[i] ?? { id: i, name: `Partner ${i + 1}`, description: "", imageUrl: "" };

    // Gold border frame
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(WALL_FACE_X - FD / 2, y, z);
    border.castShadow = true;
    scene.add(border);

    // Start with placeholder; swap in real image if imageUrl is provided
    const placeholder = makePlaceholderTexture(i, partner.name);
    placeholder.colorSpace = THREE.SRGBColorSpace;
    const artMat = new THREE.MeshStandardMaterial({
      map: placeholder,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });

    if (partner.imageUrl) {
      loader.load(
        partner.imageUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          artMat.map = tex;
          artMat.needsUpdate = true;
          // Release the placeholder texture once the real one is in use
          placeholder.dispose();
        },
        undefined,
        () => {
          // Load failed — placeholder remains; no action needed
        },
      );
    }

    const art = new THREE.Mesh(artGeo, artMat);
    art.position.set(ART_FACE_X, y, z);
    art.rotation.y = ROT_Y;
    art.receiveShadow = true;
    art.userData = {
      isPartnerFrame: true,
      partnerIndex: i,
    };
    scene.add(art);
    frameMeshes.push(art);
  });

  // ── Spotlights aimed at the board (returned so MuseumScene can add them) ──
  const spot = new THREE.SpotLight(0xfff5e0, 6, 18, Math.PI / 6, 0.40);
  spot.position.set(43.5, 3.85, PANEL_Z);
  spot.target.position.set(PANEL_X, PANEL_Y, PANEL_Z);
  spot.castShadow = false;

  const accent1 = new THREE.SpotLight(0xffe8cc, 3.5, 10, Math.PI / 7, 0.50);
  accent1.position.set(44.5, 3.85, PANEL_Z - 2);
  accent1.target.position.set(PANEL_X, Y_TOP, PANEL_Z - 2);

  const accent2 = new THREE.SpotLight(0xffe8cc, 3.5, 10, Math.PI / 7, 0.50);
  accent2.position.set(44.5, 3.85, PANEL_Z + 2);
  accent2.target.position.set(PANEL_X, Y_BOT, PANEL_Z + 2);

  return {
    frameMeshes,
    lights: [spot, spot.target, accent1, accent1.target, accent2, accent2.target],
  };
}
