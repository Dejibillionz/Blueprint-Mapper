import * as THREE from "three";
import type { WallBox } from "./collision";

export function buildExterior(scene: THREE.Scene): WallBox[] {
  const extraBoxes: WallBox[] = [];

  // ── Sky dome ──────────────────────────────────────────────────────────────
  // Large inverted sphere with a GLSL gradient — dark indigo horizon → near-black zenith
  const skyGeo = new THREE.SphereGeometry(450, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y, 0.0, 1.0);
        // horizon → mid → zenith gradient
        vec3 hor = vec3(0.038, 0.026, 0.088);
        vec3 mid = vec3(0.018, 0.013, 0.052);
        vec3 top = vec3(0.005, 0.004, 0.018);
        vec3 col = h < 0.25
          ? mix(hor, mid, h / 0.25)
          : mix(mid, top, (h - 0.25) / 0.75);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.set(50, -10, 26);
  scene.add(skyDome);

  // ── Stars ─────────────────────────────────────────────────────────────────
  const STAR_COUNT = 2800;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(Math.random() * 0.9);   // upper ~90% of sphere
    const r     = 400;
    starPos[i * 3]     = 50  + r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = -10 + r * Math.cos(phi);
    starPos[i * 3 + 2] = 26  + r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xd8e8ff,
    size: 0.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Exterior stone ground (infinite dark plane) ───────────────────────────
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a1824,
    roughness: 0.97,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(50, 0, 26);
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Plaza paving tile pattern (x=25-57, z=52-90) ─────────────────────────
  // ShaderMaterial draws an alternating two-tone stone grid with grout lines.
  // UV coords from PlaneGeometry map directly to world-space tile counts.
  const PLAZA_W  = 32;   // x: 25 → 57
  const PLAZA_D  = 38;   // z: 52 → 90
  const TILE_SIZE = 1.6; // metres per tile
  const pavingMat = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: {
      uTilesX: { value: PLAZA_W / TILE_SIZE },
      uTilesZ: { value: PLAZA_D / TILE_SIZE },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTilesX;
      uniform float uTilesZ;
      varying vec2 vUv;
      void main() {
        vec2 tile = vUv * vec2(uTilesX, uTilesZ);
        vec2 tileId  = floor(tile);
        vec2 tileFrac = fract(tile);

        // Grout lines — 5% of tile width
        float grout = 0.055;
        bool isGrout = tileFrac.x < grout || tileFrac.x > (1.0 - grout)
                    || tileFrac.y < grout || tileFrac.y > (1.0 - grout);

        // Checkerboard-style alternating stone colours
        float checker = mod(tileId.x + tileId.y, 2.0);
        vec3 stoneA = vec3(0.145, 0.128, 0.172); // dark slate
        vec3 stoneB = vec3(0.172, 0.155, 0.205); // slightly lighter
        vec3 groutCol = vec3(0.08, 0.07, 0.11);  // near-black grout

        // Subtle inner bevel highlight along top/left edges of each tile
        float bevel = 0.08;
        bool isHighlight = (tileFrac.x < bevel && tileFrac.x > grout)
                        || (tileFrac.y < bevel && tileFrac.y > grout);

        vec3 col = isGrout
          ? groutCol
          : mix(stoneA, stoneB, checker);

        if (!isGrout && isHighlight) col = col * 1.22;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const plazaMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PLAZA_W, PLAZA_D),
    pavingMat,
  );
  plazaMesh.rotation.x = -Math.PI / 2;
  plazaMesh.position.set(41, 0.002, 71); // centre of x=25-57, z=52-90; y slightly above ground
  plazaMesh.receiveShadow = true;
  scene.add(plazaMesh);

  // ── Moonlight ─────────────────────────────────────────────────────────────
  const moon = new THREE.DirectionalLight(0x8899cc, 0.35);
  moon.position.set(60, 120, -80);
  scene.add(moon);

  // ── Stone / marble material shared by steps and columns ───────────────────
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xcec4b0,
    roughness: 0.82,
    metalness: 0.0,
  });

  // ── Entrance steps (south of grand entrance z=52, x=37–45) ───────────────
  // Three stepped platforms rising toward the entrance.
  // Outer/lowest (widest) → inner/highest (narrowest).
  const stepDefs: Array<[number, number, number, number, number]> = [
    // [centerX, centerZ, width, depth, height]
    [41, 57.5, 24, 5.0, 0.18],
    [41, 55.0, 18, 4.0, 0.34],
    [41, 53.0, 12, 2.0, 0.52],
  ];
  for (const [cx, cz, w, d, h] of stepDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    mesh.position.set(cx, h / 2, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }

  // ── Flanking columns (each is plinth + shaft + capital) ──────────────────
  const colPositions: Array<[number, number]> = [
    [32.5, 55.5],
    [49.5, 55.5],
  ];
  for (const [cx, cz] of colPositions) {
    // Plinth (base)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 2.4), stoneMat);
    plinth.position.set(cx, 0.225, cz);
    plinth.castShadow = true;
    scene.add(plinth);

    // Shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.7, 5.6, 1.7), stoneMat);
    shaft.position.set(cx, 0.45 + 2.8, cz);
    shaft.castShadow = true;
    scene.add(shaft);

    // Capital (cap)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.2), stoneMat);
    cap.position.set(cx, 0.45 + 5.6 + 0.225, cz);
    cap.castShadow = true;
    scene.add(cap);

    // Collision — block player from walking through column
    extraBoxes.push({
      minX: cx - 0.85, maxX: cx + 0.85,
      minZ: cz - 0.85, maxZ: cz + 0.85,
    });
  }

  // ── Lampposts with warm point lights ─────────────────────────────────────
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x1e1a16, roughness: 0.65, metalness: 0.5,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x7a6a40, roughness: 0.45, metalness: 0.3,
    emissive: new THREE.Color(0x553311), emissiveIntensity: 0.5,
  });

  // Four lampposts flanking the entrance path, symmetrical about x=41
  const lampDefs: Array<[number, number]> = [
    [28.5, 63],
    [53.5, 63],
    [28.5, 76],
    [53.5, 76],
  ];
  for (const [lx, lz] of lampDefs) {
    const armDir = lx < 41 ? 1 : -1; // arm extends toward center path

    // Post (tapered cylinder)
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.13, 5.5, 8),
      postMat,
    );
    post.position.set(lx, 2.75, lz);
    post.castShadow = true;
    scene.add(post);

    // Horizontal arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.09), postMat);
    arm.position.set(lx + armDir * 0.7, 5.5, lz);
    scene.add(arm);

    // Lamp head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.42), headMat);
    head.position.set(lx + armDir * 1.4, 5.5, lz);
    scene.add(head);

    // Point light beneath the lamp head
    const light = new THREE.PointLight(0xffe4bb, 7, 24);
    light.position.set(lx + armDir * 1.4, 5.1, lz);
    scene.add(light);

    // Narrow collision box for lamppost base
    extraBoxes.push({
      minX: lx - 0.2, maxX: lx + 0.2,
      minZ: lz - 0.2, maxZ: lz + 0.2,
    });
  }

  // ── Stone bollards lining the entrance path ──────────────────────────────
  // 8 bollards total: 4 per side at x≈24.5 (west) and x≈57.5 (east), z=62-84.
  // Each bollard: short cylinder shaft + domed cap, cast shadow, collision box.
  const bollardMat = new THREE.MeshStandardMaterial({
    color: 0xb0a898,
    roughness: 0.88,
    metalness: 0.04,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xc8bfae,
    roughness: 0.75,
    metalness: 0.06,
  });

  // 4 z positions per side, evenly spaced across z=62–84
  const bollardZs = [63, 69, 75, 83];
  const bollardXs: number[] = [24.5, 57.5];

  for (const bx of bollardXs) {
    for (const bz of bollardZs) {
      // Shaft: radius 0.18, height 0.95
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.95, 10),
        bollardMat,
      );
      shaft.position.set(bx, 0.475, bz);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      scene.add(shaft);

      // Domed cap
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        capMat,
      );
      cap.position.set(bx, 0.95, bz);
      cap.castShadow = true;
      scene.add(cap);

      // Collision box — slightly generous so player can't squeeze through
      extraBoxes.push({
        minX: bx - 0.28, maxX: bx + 0.28,
        minZ: bz - 0.28, maxZ: bz + 0.28,
      });
    }
  }

  // ── Decorative cornice along the top of the facade (south wall only) ──────
  // A thin horizontal band above the south outer wall, facing outward.
  const corniceMat = new THREE.MeshStandardMaterial({
    color: 0xddd4be, roughness: 0.78, metalness: 0,
  });
  // South wall segments: x=14–37 and x=45–62 (around entrance gap) and x=62–100
  const corniceSegs: Array<[number, number, number, number]> = [
    [14, 52, 37, 52],
    [45, 52, 62, 52],
    [62, 52, 100, 52],
  ];
  const CORNICE_H = 0.35;
  const CORNICE_D = 0.65;
  const WALL_TOP = 4;
  for (const [x1, z1, x2, z2] of corniceSegs) {
    const len = Math.abs(x2 - x1);
    const cx  = (x1 + x2) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len + CORNICE_D, CORNICE_H, CORNICE_D),
      corniceMat,
    );
    mesh.position.set(cx, WALL_TOP + CORNICE_H / 2, z1);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // East wall cornice: x=100, z=0–52
  const corniceE = new THREE.Mesh(
    new THREE.BoxGeometry(CORNICE_D, CORNICE_H, 52 + CORNICE_D),
    corniceMat,
  );
  corniceE.position.set(100, WALL_TOP + CORNICE_H / 2, 26);
  corniceE.castShadow = true;
  scene.add(corniceE);

  // ── Grand entrance arch + "MUSEUM GENESIS" sign ──────────────────────────
  // Entrance gap: z=52, x=37–45 (width=8, centred at x=41)
  // Players approach from z > 52, so signage faces the +z direction.

  const archMat = new THREE.MeshStandardMaterial({
    color: 0xd8cdb5,
    roughness: 0.75,
    metalness: 0.05,
  });

  // Pilasters flanking the entrance gap (taller decorative posts inside the gap edge)
  // Plinth 0.3 + shaft 3.42 + cap 0.28 = exactly WALL_HEIGHT=4
  const pilasterDefs: Array<[number]> = [[37], [45]];
  for (const [px] of pilasterDefs) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), archMat);
    plinth.position.set(px, 0.15, 52);
    plinth.castShadow = true;
    scene.add(plinth);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.42, 0.42), archMat);
    shaft.position.set(px, 0.3 + 1.71, 52);
    shaft.castShadow = true;
    scene.add(shaft);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.55), archMat);
    cap.position.set(px, 0.3 + 3.42 + 0.14, 52);
    cap.castShadow = true;
    scene.add(cap);
  }

  // Semi-circular arch spanning the doorway (half-torus, radius=4 = half the 8 m gap)
  // Center at y=0 (floor level) so crown lands exactly at y=4 = WALL_HEIGHT.
  // Arc=PI sweeps the top half: left foot (37,0) → crown (41,4) → right foot (45,0).
  // The tube bottom (y=-0.24) is hidden by the floor mesh.
  const archGeo = new THREE.TorusGeometry(4, 0.24, 10, 40, Math.PI);
  const archMesh = new THREE.Mesh(archGeo, archMat);
  archMesh.position.set(41, 0, 52);
  archMesh.castShadow = true;
  scene.add(archMesh);

  // Keystone at the crown of the arch (a slightly protruding block at y=4)
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.42), archMat);
  keystone.position.set(41, 4.25, 52);
  keystone.castShadow = true;
  scene.add(keystone);

  // Lintel / sign panel — flat box with canvas texture showing "MUSEUM GENESIS"
  // Strictly within the requested y=2.4–3.0 band: center=2.7, half-height=0.3
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 1024;
  signCanvas.height = 96;
  const signCtx = signCanvas.getContext("2d")!;

  // Background
  signCtx.fillStyle = "#140f1e";
  signCtx.fillRect(0, 0, 1024, 96);

  // Gold border
  signCtx.strokeStyle = "#c8a050";
  signCtx.lineWidth = 6;
  signCtx.strokeRect(5, 5, 1014, 86);

  // Inner thin accent line
  signCtx.strokeStyle = "#9a7030";
  signCtx.lineWidth = 2;
  signCtx.strokeRect(13, 13, 998, 70);

  // Main text (fits within 96 px canvas height)
  signCtx.fillStyle = "#e8c060";
  signCtx.font = "bold 52px Georgia, serif";
  signCtx.textAlign = "center";
  signCtx.textBaseline = "middle";
  signCtx.fillText("MUSEUM GENESIS", 512, 44);

  // Subtle sub-text
  signCtx.fillStyle = "#a07838";
  signCtx.font = "italic 16px Georgia, serif";
  signCtx.fillText("3333 NFT Collection", 512, 78);

  const signTex = new THREE.CanvasTexture(signCanvas);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: new THREE.Color(0x221100),
    emissiveIntensity: 0.35,
    roughness: 0.55,
    metalness: 0.1,
  });

  // Sign panel: 9.2 m wide × 0.6 m tall (y=2.4→3.0 exactly) × 0.16 m deep
  const signGeo = new THREE.BoxGeometry(9.2, 0.6, 0.16);
  const signMesh = new THREE.Mesh(signGeo, signMat);
  signMesh.position.set(41, 2.7, 52.09);   // center y=2.7 → bottom 2.4, top 3.0
  signMesh.castShadow = true;
  scene.add(signMesh);

  // Dedicated spotlight aimed at the sign from outside (south, above)
  const signSpot = new THREE.SpotLight(0xfff0cc, 12, 28, Math.PI / 9, 0.35, 1.2);
  signSpot.position.set(41, 10, 60);
  signSpot.target.position.set(41, 2.7, 52);
  signSpot.castShadow = false;
  scene.add(signSpot);
  scene.add(signSpot.target);

  // Two narrow fill lights hitting each side of the sign at low angle
  const fillL = new THREE.PointLight(0xffddaa, 5, 14);
  fillL.position.set(34, 5.5, 53.5);
  scene.add(fillL);

  const fillR = new THREE.PointLight(0xffddaa, 5, 14);
  fillR.position.set(48, 5.5, 53.5);
  scene.add(fillR);

  // ── Invisible exterior boundary walls ────────────────────────────────────
  // These AABB boxes have no geometry — they are purely collision barriers that
  // prevent the player from wandering into the infinite void beyond the plaza.
  //
  // Playable exterior footprint:
  //   West boundary  x = -12  (12 m west of building)
  //   East boundary  x = 112  (12 m east of building)
  //   South boundary z = 98   (~46 m south of grand entrance at z=52)
  //   North boundary handled by the building's own outer walls (z=0 wall)
  //
  // Each box is thick enough that even at max movement speed the player
  // cannot tunnel through it in one frame.

  // South invisible wall (spans across full width, z=98 outward)
  extraBoxes.push({ minX: -20, maxX: 120, minZ: 98, maxZ: 9999 });
  // East invisible wall
  extraBoxes.push({ minX: 112, maxX: 9999, minZ: -20, maxZ: 110 });
  // West invisible wall
  extraBoxes.push({ minX: -9999, maxX: -12, minZ: -20, maxZ: 110 });
  // North-exterior cap (prevents escaping behind the building via the notch area)
  extraBoxes.push({ minX: -20, maxX: 120, minZ: -9999, maxZ: -12 });

  return extraBoxes;
}
