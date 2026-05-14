import * as THREE from "three";

/**
 * Builds a "Community Hub" wall sign mounted flush on the north wall of the
 * gift shop (z = 40), facing south so players see it when they enter through
 * the Discord portal.
 *
 * Key orientation note:
 *   - The wall is at z = 40 (horizontal wall, runs east-west).
 *   - "Facing south" means the sign normal points toward +Z.
 *   - THREE.PlaneGeometry default normal is +Z, so NO rotation is needed.
 *   - The canvas is drawn left-to-right normally; the player sees the front
 *     face → text is never mirrored.
 */
export function buildGiftShopSign(scene: THREE.Scene): void {
  const SIGN_W = 2.6;   // metres wide
  const SIGN_H = 0.95;  // metres tall
  const WALL_Z = 40;
  const PROTRUDE = 0.14; // how far the sign sticks out from the wall into the room
  const SIGN_X = 57;    // centre of gift-shop x=52–62
  const SIGN_Y = 2.1;   // vertical centre (above eye-level but easy to read)

  // ── Canvas texture ─────────────────────────────────────────────────────────
  const CW = 520, CH = 190;
  const cv = document.createElement("canvas");
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext("2d")!;

  // Background panel
  ctx.fillStyle = "#12122a";
  ctx.beginPath();
  ctx.roundRect(0, 0, CW, CH, 14);
  ctx.fill();

  // Inset border in Discord purple
  ctx.strokeStyle = "#5865f2";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(3, 3, CW - 6, CH - 6, 12);
  ctx.stroke();

  // Decorative top stripe
  ctx.fillStyle = "#5865f2";
  ctx.fillRect(16, 16, CW - 32, 6);

  // "COMMUNITY HUB" – main title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("COMMUNITY HUB", CW / 2, 34);

  // Subtitle
  ctx.fillStyle = "#99aaff";
  ctx.font = "24px Arial, sans-serif";
  ctx.fillText("Join the 10K Squad on Discord", CW / 2, 98);

  // Bottom decorative stripe
  ctx.fillStyle = "#5865f2";
  ctx.fillRect(16, CH - 22, CW - 32, 6);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  // ── Backing panel (thin box so it has visible depth) ──────────────────────
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d20,
    metalness: 0.3,
    roughness: 0.6,
  });
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(SIGN_W + 0.06, SIGN_H + 0.06, 0.07),
    backMat,
  );
  // Place with the back face flush against the wall, protruding into the room
  back.position.set(SIGN_X, SIGN_Y, WALL_Z + PROTRUDE / 2);
  scene.add(back);

  // ── Sign face — PlaneGeometry default normal is +Z (faces south) ──────────
  // Player enters from south (z > 40) and looks north (−Z), seeing the front
  // face of the plane → text is NOT mirrored.
  const faceMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), faceMat);
  face.position.set(SIGN_X, SIGN_Y, WALL_Z + PROTRUDE + 0.01);
  scene.add(face);

  // ── Mounting brackets (small dark cylinders at each corner) ───────────────
  const bracketMat = new THREE.MeshStandardMaterial({
    color: 0x888888, metalness: 0.8, roughness: 0.3,
  });
  const bracketGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8);
  for (const [bx, by] of [
    [SIGN_X - SIGN_W / 2 + 0.1, SIGN_Y + SIGN_H / 2 - 0.1],
    [SIGN_X + SIGN_W / 2 - 0.1, SIGN_Y + SIGN_H / 2 - 0.1],
    [SIGN_X - SIGN_W / 2 + 0.1, SIGN_Y - SIGN_H / 2 + 0.1],
    [SIGN_X + SIGN_W / 2 - 0.1, SIGN_Y - SIGN_H / 2 + 0.1],
  ] as [number, number][]) {
    const b = new THREE.Mesh(bracketGeo, bracketMat);
    b.rotation.x = Math.PI / 2; // orient cylinder along Z axis
    b.position.set(bx, by, WALL_Z + 0.05);
    scene.add(b);
  }

  // ── Soft spotlight aimed at the sign ──────────────────────────────────────
  const spot = new THREE.SpotLight(0x99aaff, 4, 6, Math.PI / 9, 0.5);
  spot.position.set(SIGN_X, 3.9, WALL_Z + 2.0);
  spot.target.position.set(SIGN_X, SIGN_Y, WALL_Z + PROTRUDE);
  spot.castShadow = false;
  scene.add(spot);
  scene.add(spot.target);
}
