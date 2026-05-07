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

  // ── Flat roof: stone slab + parapet walls + entrance pediment ─────────────
  // The building has an L-shaped footprint (x=0-100, z=0-52 minus the
  // southwest notch x=0-14, z=35-52).  Two rectangular slabs cover it.
  //
  //  Roof slab (darker weathered stone, top surface visible from plaza)
  //  Parapet  (same stone as facade, raised edge running all the way round)
  //  Pediment (triangular gable above grand entrance, classical style)

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xA8A098, roughness: 0.92, metalness: 0.0,
  });
  const parMat = new THREE.MeshStandardMaterial({
    color: 0xD6CEBC, roughness: 0.82, metalness: 0.0,
  });

  const ROOF_Y = WALL_TOP;  // 4.0 m
  const SLAB_H = 0.26;      // roof slab thickness
  const PAR_H  = 0.52;      // parapet height above slab top
  const PAR_W  = 0.45;      // parapet wall thickness

  const addSlab = (cx: number, cz: number, sx: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, SLAB_H, sz), roofMat);
    m.position.set(cx, ROOF_Y + SLAB_H / 2, cz);
    m.receiveShadow = true;
    scene.add(m);
  };
  const rParY = ROOF_Y + SLAB_H + PAR_H / 2;
  const addPar = (cx: number, cz: number, sx: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, PAR_H, sz), parMat);
    m.position.set(cx, rParY, cz);
    m.castShadow = true;
    scene.add(m);
  };

  // Roof slabs — north body + south body (L-shape)
  addSlab(50,  17.5, 100, 35);  // x=0-100,  z=0-35
  addSlab(57,  43.5,  86, 17);  // x=14-100, z=35-52

  // Parapet walls around the outer perimeter
  addPar(50,    0,   100,  PAR_W); // north       z=0,  x=0-100
  addPar(100,  26,   PAR_W, 52);   // east        x=100, z=0-52
  addPar(72.5, 52,    55,  PAR_W); // south-east  z=52, x=45-100
  addPar(25.5, 52,    23,  PAR_W); // south-west  z=52, x=14-37 (entrance gap skipped)
  addPar(14,  43.5,  PAR_W, 17);   // notch-east  x=14, z=35-52
  addPar(7,    35,    14,  PAR_W); // notch-south z=35, x=0-14
  addPar(0,   17.5,  PAR_W, 35);   // west        x=0,  z=0-35

  // ── Entrance pediment ──────────────────────────────────────────────────
  // Classical triangular gable centred on the entrance (x=30-52, 22 m wide).
  // Protrudes 0.65 m south of the facade, sits on top of the parapet.
  const PED_HALF_W = 11;    // half-width  → 22 m total
  const PED_H      = 2.8;   // rise above parapet top
  const PED_DEPTH  = 0.65;  // southward protrusion
  const PED_BASE_Y = ROOF_Y + SLAB_H + PAR_H;  // ≈ 4.78 m

  const pedShape = new THREE.Shape();
  pedShape.moveTo(-PED_HALF_W, 0);
  pedShape.lineTo( PED_HALF_W, 0);
  pedShape.lineTo(0, PED_H);
  pedShape.closePath();

  const pedGeo = new THREE.ExtrudeGeometry(pedShape, {
    depth: PED_DEPTH,
    bevelEnabled: false,
  });
  const pedMesh = new THREE.Mesh(pedGeo, parMat);
  pedMesh.rotation.y = Math.PI;           // rotate so triangular face points south (+Z)
  pedMesh.position.set(41, PED_BASE_Y, 52.9);  // back face flush with facade at z=52.25
  pedMesh.castShadow = true;
  scene.add(pedMesh);

  // Raking cornices — slightly proud boxes along each sloped edge
  const SLOPE_ANGLE = Math.atan2(PED_H, PED_HALF_W);       // ≈ 14.3°
  const SLOPE_LEN   = Math.hypot(PED_HALF_W, PED_H);        // ≈ 11.35 m
  const rcGeo       = new THREE.BoxGeometry(SLOPE_LEN, 0.28, PED_DEPTH + 0.08);

  // West raking cornice: x=30 (corner) → x=41 (apex)
  const rcL = new THREE.Mesh(rcGeo, parMat);
  rcL.position.set(41 - PED_HALF_W / 2, PED_BASE_Y + PED_H / 2, 52.9);
  rcL.rotation.z = SLOPE_ANGLE;
  rcL.castShadow = true;
  scene.add(rcL);

  // East raking cornice: x=41 (apex) → x=52 (corner)
  const rcR = new THREE.Mesh(rcGeo, parMat);
  rcR.position.set(41 + PED_HALF_W / 2, PED_BASE_Y + PED_H / 2, 52.9);
  rcR.rotation.z = -SLOPE_ANGLE;
  rcR.castShadow = true;
  scene.add(rcR);

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

  // Entrance sign panel — squadmania banner image fills the arch opening.
  // Image aspect ratio ≈ 3.3 : 1  →  8 m wide × 2.4 m tall fits neatly.
  // Center y=1.9 (bottom y=0.7, top y=3.1), strictly inside the 4 m arch.
  const signTex = new THREE.TextureLoader().load("/squadmania.jpg");
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    roughness: 0.45,
    metalness: 0.05,
  });
  const signGeo = new THREE.BoxGeometry(8, 2.4, 0.16);
  const signMesh = new THREE.Mesh(signGeo, signMat);
  signMesh.position.set(41, 1.9, 52.09);
  signMesh.castShadow = true;
  scene.add(signMesh);

  // Dedicated spotlight aimed at the sign from outside (south, above)
  const signSpot = new THREE.SpotLight(0xfffaf0, 14, 30, Math.PI / 8, 0.3, 1.0);
  signSpot.position.set(41, 10, 62);
  signSpot.target.position.set(41, 1.9, 52);
  signSpot.castShadow = false;
  scene.add(signSpot);
  scene.add(signSpot.target);

  // Two fill lights flanking the sign for even illumination
  const fillL = new THREE.PointLight(0xffeedd, 5, 14);
  fillL.position.set(34, 4.5, 54);
  scene.add(fillL);

  const fillR = new THREE.PointLight(0xffeedd, 5, 14);
  fillR.position.set(48, 4.5, 54);
  scene.add(fillR);

  // ── Ground welcome marker — plaza inset slab ─────────────────────────────
  // A flat canvas-texture plane at x=41, z=63 (just in front of the outer
  // step front face at z=60), y=0.012 so it floats just above the paving tiles without z-fighting.
  // Displays "MUSEUM GENESIS" in an art-deco style matching the arch sign.
  const markerW = 10;   // world metres wide  (x direction)
  const markerD = 4.0;  // world metres deep  (z direction)

  const markerCanvas = document.createElement("canvas");
  markerCanvas.width  = 1024;
  markerCanvas.height = 430;
  const mc = markerCanvas.getContext("2d")!;

  // Dark stone background
  mc.fillStyle = "#10091a";
  mc.fillRect(0, 0, 1024, 430);

  // Outer gold border
  mc.strokeStyle = "#c8a050";
  mc.lineWidth = 8;
  mc.strokeRect(6, 6, 1012, 418);

  // Inner double-line accent
  mc.strokeStyle = "#9a7030";
  mc.lineWidth = 2.5;
  mc.strokeRect(18, 18, 988, 394);
  mc.strokeStyle = "#c8a050";
  mc.lineWidth = 1.2;
  mc.strokeRect(24, 24, 976, 382);

  // Corner diamond ornaments
  const drawDiamond = (x: number, y: number, r: number) => {
    mc.beginPath();
    mc.moveTo(x, y - r);
    mc.lineTo(x + r, y);
    mc.lineTo(x, y + r);
    mc.lineTo(x - r, y);
    mc.closePath();
    mc.fillStyle = "#c8a050";
    mc.fill();
  };
  for (const [dx, dy] of [[36, 36], [988, 36], [36, 394], [988, 394]] as [number, number][]) {
    drawDiamond(dx, dy, 9);
  }

  // Horizontal rule lines flanking text area
  mc.strokeStyle = "#c8a050";
  mc.lineWidth = 1.5;
  // Top rule pair
  mc.beginPath(); mc.moveTo(60, 100); mc.lineTo(964, 100); mc.stroke();
  mc.beginPath(); mc.moveTo(60, 107); mc.lineTo(964, 107); mc.stroke();
  // Bottom rule pair
  mc.beginPath(); mc.moveTo(60, 323); mc.lineTo(964, 323); mc.stroke();
  mc.beginPath(); mc.moveTo(60, 330); mc.lineTo(964, 330); mc.stroke();

  // Small centered ornament above title — a simple art-deco fan motif
  const fanCx = 512, fanCy = 80;
  mc.strokeStyle = "#c8a050";
  mc.lineWidth = 1.8;
  for (let a = -60; a <= 60; a += 15) {
    const rad = (a * Math.PI) / 180;
    mc.beginPath();
    mc.moveTo(fanCx, fanCy);
    mc.lineTo(fanCx + Math.sin(rad) * 36, fanCy - Math.cos(rad) * 36);
    mc.stroke();
  }
  // Fan arc
  mc.beginPath();
  mc.arc(fanCx, fanCy, 36, (-120 * Math.PI) / 180, (-60 * Math.PI) / 180);
  mc.stroke();

  // Main title
  mc.fillStyle = "#e8c060";
  mc.font = "bold 96px Georgia, serif";
  mc.textAlign = "center";
  mc.textBaseline = "middle";
  mc.fillText("MUSEUM GENESIS", 512, 215);

  // Subtitle
  mc.fillStyle = "#a07838";
  mc.font = "italic 30px Georgia, serif";
  mc.textBaseline = "middle";
  mc.fillText("3333 NFT Collection", 512, 295);

  // Mirrored fan ornament below subtitle
  mc.save();
  mc.translate(fanCx, 350);
  mc.scale(1, -1);
  mc.translate(-fanCx, -fanCy);
  mc.strokeStyle = "#c8a050";
  mc.lineWidth = 1.8;
  for (let a = -60; a <= 60; a += 15) {
    const rad = (a * Math.PI) / 180;
    mc.beginPath();
    mc.moveTo(fanCx, fanCy);
    mc.lineTo(fanCx + Math.sin(rad) * 36, fanCy - Math.cos(rad) * 36);
    mc.stroke();
  }
  mc.beginPath();
  mc.arc(fanCx, fanCy, 36, (-120 * Math.PI) / 180, (-60 * Math.PI) / 180);
  mc.stroke();
  mc.restore();

  const markerTex = new THREE.CanvasTexture(markerCanvas);
  const markerMat = new THREE.MeshStandardMaterial({
    map: markerTex,
    emissive: new THREE.Color(0x1a0e00),
    emissiveIntensity: 0.28,
    roughness: 0.62,
    metalness: 0.08,
    transparent: false,
  });

  const markerMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(markerW, markerD),
    markerMat,
  );
  markerMesh.rotation.x = -Math.PI / 2;
  // Rotate the canvas texture so text reads correctly when approaching from +z
  markerMesh.rotation.z = Math.PI;
  markerMesh.position.set(41, 0.012, 63);
  markerMesh.receiveShadow = true;
  scene.add(markerMesh);

  // Subtle warm fill light aimed at the ground marker from above
  const markerLight = new THREE.PointLight(0xffe8b0, 4, 16);
  markerLight.position.set(41, 4.5, 63);
  scene.add(markerLight);

  // ── Perimeter fence around the plaza compound ────────────────────────────
  // Wrought-iron style fence: dark metal posts + two horizontal rails.
  // Compound footprint: x=25-57, z=52.5-90 (building south wall is the north edge).
  //   West fence  : x=25,  z=52.5 → 90
  //   East fence  : x=57,  z=52.5 → 90
  //   South fence : z=90,  x=25   → 57

  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x1a1612, roughness: 0.58, metalness: 0.70,
  });

  const POST_H       = 1.55;
  const POST_W       = 0.12;
  const RAIL_THICK   = 0.07;
  const RAIL_Y_LOW   = 0.52;
  const RAIL_Y_HIGH  = 1.18;
  const POST_STEP    = 2.5;   // spacing between posts

  // Helper: vertical post
  const addPost = (px: number, pz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(POST_W, POST_H, POST_W), fenceMat);
    m.position.set(px, POST_H / 2, pz);
    m.castShadow = true;
    scene.add(m);
  };
  // Helper: horizontal rail along X (south fence)
  const addRailX = (x1: number, x2: number, rz: number, ry: number) => {
    const len = Math.abs(x2 - x1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL_THICK, RAIL_THICK), fenceMat);
    m.position.set((x1 + x2) / 2, ry, rz);
    scene.add(m);
  };
  // Helper: horizontal rail along Z (east/west fences)
  const addRailZ = (rx: number, z1: number, z2: number, ry: number) => {
    const len = Math.abs(z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(RAIL_THICK, RAIL_THICK, len), fenceMat);
    m.position.set(rx, ry, (z1 + z2) / 2);
    scene.add(m);
  };

  // West fence  x=25, z=52.5 → 90
  {
    const X = 25, Z0 = 52.5, Z1 = 90;
    for (let z = Z0; z <= Z1 + 0.01; z += POST_STEP) {
      addPost(X, Math.min(z, Z1));
    }
    addRailZ(X, Z0, Z1, RAIL_Y_LOW);
    addRailZ(X, Z0, Z1, RAIL_Y_HIGH);
  }

  // East fence  x=57, z=52.5 → 90
  {
    const X = 57, Z0 = 52.5, Z1 = 90;
    for (let z = Z0; z <= Z1 + 0.01; z += POST_STEP) {
      addPost(X, Math.min(z, Z1));
    }
    addRailZ(X, Z0, Z1, RAIL_Y_LOW);
    addRailZ(X, Z0, Z1, RAIL_Y_HIGH);
  }

  // South fence  z=90, x=25 → 57
  {
    const Z = 90, X0 = 25, X1 = 57;
    for (let x = X0; x <= X1 + 0.01; x += POST_STEP) {
      addPost(Math.min(x, X1), Z);
    }
    addRailX(X0, X1, Z, RAIL_Y_LOW);
    addRailX(X0, X1, Z, RAIL_Y_HIGH);
  }

  // ── Collision boundaries aligned to the fence ─────────────────────────────
  // The visible fence IS the hard boundary — collision boxes sit just behind
  // each fence face so the player stops at the fence line.

  // South fence at z=90
  extraBoxes.push({ minX: 20, maxX: 62, minZ: 89.8, maxZ: 9999 });
  // West fence at x=25
  extraBoxes.push({ minX: -9999, maxX: 25.2, minZ: 52, maxZ: 91 });
  // East fence at x=57
  extraBoxes.push({ minX: 56.8, maxX: 9999, minZ: 52, maxZ: 91 });
  // North-exterior safety cap (behind building, unreachable but kept for safety)
  extraBoxes.push({ minX: 20, maxX: 62, minZ: -9999, maxZ: -12 });

  return extraBoxes;
}
