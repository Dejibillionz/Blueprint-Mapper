import * as THREE from "three";

// ── Layout constants ─────────────────────────────────────────────────────────
// West wall of Entrance Hall: x=33, inner face x=33.125 (wall thickness 0.25)
const WALL_FACE_X   = 33.125;
const PANEL_DEPTH   = 0.10;
const PANEL_X       = WALL_FACE_X + PANEL_DEPTH / 2;   // 33.175 — sits against wall
const PANEL_Z       = 40.5;                              // centre of z=35..46
const PANEL_WIDTH   = 9.4;                               // along Z
const PANEL_HEIGHT  = 3.4;                               // along Y
const PANEL_Y       = PANEL_HEIGHT / 2 + 0.3;           // 2.0 m centre

// Front face of the panel (protrudes into hall toward +X)
const PANEL_FRONT_X = WALL_FACE_X + PANEL_DEPTH;        // 33.225

// ── West-wall art-plane rotation ─────────────────────────────────────────────
// The west wall faces east into the hall (+X direction).  We use the same
// rotation as PartnerBoard (Math.PI/2) so the renderer is consistent, but
// we flip the UV U coordinate in the geometry so the image reads left-to-right
// correctly when viewed from the hall side (east).
const ROT_Y = Math.PI / 2;

// ── Image display dimensions — sized to the 520×570 source aspect ratio ──────
// Available height below the heading sign ≈ 2.85 m.
// 520/570 ≈ 0.912  →  height 2.7 m, width 2.7 × 0.912 ≈ 2.46 m
// Pad display frame with a small border.
const DISP_W  = 2.5;          // PlaneGeometry width  (along Z axis on the wall)
const DISP_H  = 2.74;         // PlaneGeometry height (along Y axis on the wall)
const FRAME_D = 0.08;         // frame border depth (protrudes into hall)
const FRAME_PAD = 0.08;       // padding between frame and image plane

// X positions — all proud of the panel front face into the hall
const FRAME_X   = PANEL_FRONT_X + FRAME_D / 2;              // 33.265
const IMAGE_X   = PANEL_FRONT_X + FRAME_D + FRAME_PAD;      // 33.345

// Vertical centre for the display (below heading sign)
const SIGN_H   = 0.36;
const SIGN_Y   = 0.3 + PANEL_HEIGHT - SIGN_H / 2 - 0.04;   // ≈ 3.52
const DISP_Y   = SIGN_Y - SIGN_H / 2 - 0.08 - DISP_H / 2; // ≈ 1.84

// ── Build function ────────────────────────────────────────────────────────────
export function buildTeamBoard(scene: THREE.Scene): void {

  // ── Background panel slab ────────────────────────────────────────────────
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_DEPTH, PANEL_HEIGHT, PANEL_WIDTH),
    new THREE.MeshStandardMaterial({ color: 0x120820, roughness: 0.85, metalness: 0.05 }),
  );
  panel.position.set(PANEL_X, PANEL_Y, PANEL_Z);
  panel.castShadow = panel.receiveShadow = true;
  scene.add(panel);

  // ── Purple trim strips ───────────────────────────────────────────────────
  const trimGeo = new THREE.BoxGeometry(PANEL_DEPTH + 0.002, 0.04, PANEL_WIDTH + 0.01);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.8, roughness: 0.25 });
  [-1, 1].forEach(side => {
    const t = new THREE.Mesh(trimGeo, trimMat);
    t.position.set(PANEL_X, side === -1 ? 0.3 + 0.02 : 0.3 + PANEL_HEIGHT - 0.02, PANEL_Z);
    scene.add(t);
  });

  // ── Heading sign ─────────────────────────────────────────────────────────
  const signCanv = document.createElement("canvas");
  signCanv.width = 800; signCanv.height = 64;
  const sc = signCanv.getContext("2d")!;
  const sg = sc.createLinearGradient(0, 0, 800, 0);
  sg.addColorStop(0, "#0d0718"); sg.addColorStop(0.5, "#1a0d2e"); sg.addColorStop(1, "#0d0718");
  sc.fillStyle = sg; sc.fillRect(0, 0, 800, 64);
  sc.fillStyle = "#c9a8ff"; sc.font = "bold 26px Arial";
  sc.textAlign = "center"; sc.textBaseline = "middle";
  sc.fillText("🦜  MEET THE TEAM  🦜", 400, 32);
  const signTex = new THREE.CanvasTexture(signCanv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_DEPTH + 0.002, SIGN_H, 5.0),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.1 }),
  );
  sign.position.set(PANEL_X, SIGN_Y, PANEL_Z);
  scene.add(sign);

  // ── Decorative gold/purple frame border around the image ─────────────────
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.75, roughness: 0.28 });
  const frameBorder = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_D, DISP_H + FRAME_PAD * 2, DISP_W + FRAME_PAD * 2),
    frameMat,
  );
  frameBorder.position.set(FRAME_X, DISP_Y, PANEL_Z);
  frameBorder.castShadow = true;
  scene.add(frameBorder);

  // ── Image plane with U-flipped UV ────────────────────────────────────────
  // West wall art planes use the same ROT_Y as the east wall PartnerBoard,
  // which means the texture's U axis runs right-to-left from the player's view.
  // We correct this by flipping U: u_new = 1 − u, making it read left-to-right.
  const imgGeo = new THREE.PlaneGeometry(DISP_W, DISP_H);
  const uvAttr = imgGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setX(i, 1 - uvAttr.getX(i));   // flip U only
  }
  uvAttr.needsUpdate = true;

  const imgMat = new THREE.MeshStandardMaterial({
    color: 0x888888,          // placeholder tint until texture loads
    roughness: 0.80,
    side: THREE.DoubleSide,
  });

  const imgPlane = new THREE.Mesh(imgGeo, imgMat);
  imgPlane.position.set(IMAGE_X, DISP_Y, PANEL_Z);
  imgPlane.rotation.y = ROT_Y;
  imgPlane.receiveShadow = true;
  scene.add(imgPlane);

  // Load the team photo
  const baseUrl = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
  const imgUrl  = `${baseUrl}/images/meet-the-team.png`;
  const loader  = new THREE.TextureLoader();
  loader.load(
    imgUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      imgMat.map   = tex;
      imgMat.color.set(0xffffff);   // remove tint once texture is ready
      imgMat.needsUpdate = true;
    },
    undefined,
    (err) => console.warn("[TeamBoard] Could not load team photo:", imgUrl, err),
  );

  // ── Spotlights ────────────────────────────────────────────────────────────
  const spot = new THREE.SpotLight(0xd5aaff, 5, 18, Math.PI / 6, 0.40);
  spot.position.set(38, 3.85, PANEL_Z);
  spot.target.position.set(IMAGE_X, DISP_Y, PANEL_Z);
  spot.castShadow = false;
  scene.add(spot); scene.add(spot.target);

  const acc1 = new THREE.SpotLight(0xc084fc, 3.0, 10, Math.PI / 7, 0.50);
  acc1.position.set(37, 3.85, PANEL_Z - 1.5);
  acc1.target.position.set(IMAGE_X, DISP_Y, PANEL_Z - 1.5);
  scene.add(acc1); scene.add(acc1.target);

  const acc2 = new THREE.SpotLight(0xc084fc, 3.0, 10, Math.PI / 7, 0.50);
  acc2.position.set(37, 3.85, PANEL_Z + 1.5);
  acc2.target.position.set(IMAGE_X, DISP_Y, PANEL_Z + 1.5);
  scene.add(acc2); scene.add(acc2.target);
}
