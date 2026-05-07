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

  // ── Exterior stone ground ─────────────────────────────────────────────────
  const plazaMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b2a,
    roughness: 0.95,
    metalness: 0.03,
  });
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(50, 0, 26);
  plaza.receiveShadow = true;
  scene.add(plaza);

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
