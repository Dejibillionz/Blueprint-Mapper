import * as THREE from "three";
import type { WallBox } from "./collision";

export function buildExterior(scene: THREE.Scene): {
  boxes: WallBox[];
  tick: (t: number) => void;
} {
  const extraBoxes: WallBox[] = [];
  // Uniforms shared with the twinkling star shader — updated every frame by tick().
  const starUniforms  = { uTime: { value: 0.0 } };
  // Uniforms for the animated ocean wave shader — also driven by tick().
  const oceanUniforms = { uTime: { value: 0.0 } };

  // ── Terrain noise helpers (no external packages) ──────────────────────────
  const _hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const _sNoise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return _hash(ix,   iy)   * (1-ux) * (1-uy)
         + _hash(ix+1, iy)   * ux     * (1-uy)
         + _hash(ix,   iy+1) * (1-ux) * uy
         + _hash(ix+1, iy+1) * ux     * uy;
  };
  const _fbm = (x: number, y: number): number => {
    let v = 0, a = 0.5, f = 1.0;
    for (let i = 0; i < 5; i++) { v += a * _sNoise(x * f, y * f); a *= 0.5; f *= 2.1; }
    return v;
  };
  // Smooth-step helper (CPU side)
  const _ss = (e0: number, e1: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  // Terrain height at world (wx, wz).
  // fBm is offset so the result spans roughly −7 to +11 m.
  // Negative values fall below the ocean plane (y=−2) creating a real shoreline.
  // Inside the museum/plaza plateau (±55 units of centre 50,50) blend→0 → height=0.
  const terrainHeight = (wx: number, wz: number): number => {
    const dx = wx - 50, dz = wz - 50;
    const edgeDist = Math.max(Math.abs(dx) - 55, Math.abs(dz) - 55, 0);
    const blend = _ss(0, 45, edgeDist);
    // fBm ∈ [0,1] → shift so midpoint ≈ 0, giving negative coastal terrain
    const raw = (_fbm(wx * 0.012, wz * 0.012) - 0.42) * 18.0;
    return raw * blend;
  };

  // ── Sky dome ──────────────────────────────────────────────────────────────
  // Photo-textured sphere — deep blue twilight sky with natural stars.
  // Tiled 4×2 so it wraps smoothly and the star density looks uniform.
  const skyTex = new THREE.TextureLoader().load("/sky.png");
  skyTex.colorSpace  = THREE.SRGBColorSpace;
  skyTex.wrapS       = THREE.RepeatWrapping;
  skyTex.wrapT       = THREE.RepeatWrapping;
  skyTex.repeat.set(4, 2);

  const skyGeo = new THREE.SphereGeometry(450, 48, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.set(50, -10, 26);
  scene.add(skyDome);

  // ── Twinkling stars ────────────────────────────────────────────────────────
  // Shader-based particle system.  Each star has a unique random phase so they
  // sparkle independently.  uTime is driven every frame via tick().
  const STAR_COUNT = 700;
  const starPos    = new Float32Array(STAR_COUNT * 3);
  const starPhase  = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(Math.random() * 0.88);   // upper hemisphere only
    const r     = 420;
    starPos[i * 3]     = 50  + r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = -10 + r * Math.cos(phi);
    starPos[i * 3 + 2] = 26  + r * Math.sin(phi) * Math.sin(theta);
    starPhase[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos,   3));
  starGeo.setAttribute("aPhase",   new THREE.BufferAttribute(starPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      varying float vAlpha;
      void main() {
        float wave   = sin(uTime * 1.6 + aPhase);
        vAlpha       = 0.35 + 0.65 * (0.5 + 0.5 * wave);
        gl_PointSize = 1.1  + 1.3  * (0.5 + 0.5 * wave);
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        vec2  uv = gl_PointCoord - 0.5;
        float r  = length(uv) * 2.0;
        if (r > 1.0) discard;
        float a  = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha;
        gl_FragColor = vec4(0.88, 0.94, 1.0, a);
      }
    `,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Procedural coastal terrain ────────────────────────────────────────────
  // 128×128 segment plane displaced by layered noise (fBm).
  // The museum + plaza footprint sits on a flat plateau (blend=0 inside ±55 units
  // of world centre (50,50)); terrain rises freely beyond that zone.
  // Height-based GLSL shader blends: deep-sand → beach sand → dark grass → rock → cliff.
  {
    const SEGS = 128;
    const terrainGeo = new THREE.PlaneGeometry(700, 700, SEGS, SEGS);
    terrainGeo.rotateX(-Math.PI / 2); // bake rotation so position.y is world-up

    const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // local x/z relative to mesh origin (50,0,50)
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      pos.setY(i, terrainHeight(50 + lx, 50 + lz));
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.ShaderMaterial({
      side: THREE.FrontSide,
      vertexShader: `
        varying float vHeight;
        varying vec3  vNrm;
        varying vec2  vWXZ;   // world XZ for per-band noise variation
        void main() {
          vHeight = position.y;
          vNrm    = normalize(normalMatrix * normal);
          // mesh is centred at world (50,0,50), so world XZ = local XZ + 50
          vWXZ    = position.xz + vec2(50.0, 50.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vHeight;
        varying vec3  vNrm;
        varying vec2  vWXZ;

        // ── Noise helpers (GLSL) ─────────────────────────────────────
        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float smoothN(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i),               hash2(i + vec2(1.0, 0.0)), u.x),
                     mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbmN(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * smoothN(p); p *= 2.1; a *= 0.5; }
          return v;
        }

        void main() {
          // Per-band noise variation: medium + fine scale
          float nv = fbmN(vWXZ * 0.05);          // 0..1 low-freq shape
          nv = nv * 2.0 - 1.0;                   // remap → −1..1
          nv *= 0.18;                             // ±18 % variation

          // Night-tinted coastal colour bands (with noise warp applied per-band)
          vec3 deepSand = vec3(0.10, 0.075, 0.040) * (1.0 + nv * 0.6);
          vec3 sand     = vec3(0.36, 0.280, 0.165) * (1.0 + nv * 0.5);
          vec3 grass    = vec3(0.06, 0.160, 0.025) * (1.0 + nv * 0.8);
          vec3 rock     = vec3(0.17, 0.155, 0.130) * (1.0 + nv * 0.7);
          vec3 cliff    = vec3(0.27, 0.255, 0.240) * (1.0 + nv * 0.5);

          vec3 col = deepSand;
          col = mix(col, sand,  smoothstep(-1.8,  0.3, vHeight));
          col = mix(col, grass, smoothstep( 0.7,  2.5, vHeight));
          col = mix(col, rock,  smoothstep( 4.0,  7.5, vHeight));
          col = mix(col, cliff, smoothstep( 9.0, 12.5, vHeight));

          // Simple diffuse from moon direction (matches DirectionalLight above)
          float ndl = max(dot(vNrm, normalize(vec3(0.3, 1.0, -0.5))), 0.0);
          col *= 0.48 + 0.52 * ndl;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.set(50, 0, 50);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }

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

  // ── Ocean plane (animated wave shader) ───────────────────────────────────
  // Sits at y=−2.  Terrain dips below y=−2 in coastal areas, so the ocean
  // naturally covers those low spots creating a real shoreline.
  // polygonOffset pushes ocean fragments slightly behind terrain at the shore
  // edge to prevent z-fighting where terrain height ≈ −2.
  {
    const oceanGeo = new THREE.PlaneGeometry(1200, 1200, 80, 80);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      side: THREE.FrontSide,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      vertexShader: `
        uniform float uTime;
        varying float vWave;
        varying vec2  vPos;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.04  + uTime * 0.7)  * 0.15
                  + sin(p.z * 0.06  + uTime * 1.3)  * 0.10
                  + sin((p.x + p.z) * 0.022 + uTime * 0.5) * 0.08;
          p.y += w;
          vWave = w;
          vPos  = p.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vWave;
        varying vec2  vPos;

        /* Low-cost hash — returns pseudo-random float in [0,1) */
        float hash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 19.19);
          return fract(p.x * p.y);
        }

        /* Cellular sparkle grid.
           uv   — scaled world XZ (one cell ≈ 20 m of ocean)
           time — drives pulse; 2×2 neighbourhood, no drift trig in loop */
        float sparkle(vec2 uv, float time) {
          vec2 cell = floor(uv);
          vec2 frc  = fract(uv);
          float result = 0.0;
          for (int dy = 0; dy <= 1; dy++) {
            for (int dx = 0; dx <= 1; dx++) {
              vec2 nb = cell + vec2(float(dx), float(dy));
              float h1 = hash(nb);
              float h2 = hash(nb + 3.7);
              float h3 = hash(nb + 7.1);
              /* Fixed random position inside its cell — no trig drift needed */
              vec2 center = vec2(h1, h2);
              float dist  = length(frc - vec2(float(dx), float(dy)) - center);
              /* Each glint breathes at its own rate (one sin per cell) */
              float pulse = 0.5 + 0.5 * sin(time * (1.4 + h3 * 2.2) + h1 * 6.2832);
              result += pulse * smoothstep(0.13, 0.0, dist);
            }
          }
          return clamp(result, 0.0, 1.0);
        }

        void main() {
          vec3 deep   = vec3(0.012, 0.055, 0.140);
          vec3 crest  = vec3(0.028, 0.110, 0.240);
          vec3 silver = vec3(0.76, 0.86, 0.98);

          float t   = smoothstep(-0.12, 0.18, vWave);
          vec3  col = mix(deep, crest, t);

          /* Moonlight silver tint at wave crests */
          float crestGlint = smoothstep(0.07, 0.22, vWave);
          col = mix(col, silver, crestGlint * 0.32);

          /* Procedural sparkle grid — cells ~20 m across ocean */
          float sp = sparkle(vPos * 0.05 + uTime * vec2(0.010, 0.007), uTime);
          col = mix(col, silver, sp * 0.80);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(50, -2.0, 50);
    scene.add(oceanMesh);
  }

  // ── Stylised palm trees (InstancedMesh) ──────────────────────────────────
  // Trunk: one InstancedMesh (PALM_COUNT instances).
  // Fronds: one InstancedMesh (PALM_COUNT × 3 instances).
  // Positions are scatter-sampled in a ring outside the museum compound,
  // filtered to beach / low-grass terrain height (−0.5 … 2.8 m).
  {
    const PALM_TARGET = 40;
    const FRONDS_PER  = 3;

    // ── collect valid positions first ──
    type PalmInfo = { wx: number; wz: number; py: number; idx: number };
    const palms: PalmInfo[] = [];

    for (let i = 0; i < 600 && palms.length < PALM_TARGET; i++) {
      const angle = _hash(i * 1.137, 3.779) * Math.PI * 2;
      const dist  = 70 + _hash(7.531, i * 2.619) * 190;
      const wx = 50 + Math.cos(angle) * dist;
      const wz = 50 + Math.sin(angle) * dist;
      const py = terrainHeight(wx, wz);
      if (py < -0.5 || py > 2.8) continue;                   // ocean / steep hill
      if (wx > 22 && wx < 60 && wz > 50 && wz < 93) continue; // inside compound
      palms.push({ wx, wz, py, idx: i });
    }

    const count = palms.length;

    // ── trunk InstancedMesh ──
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 3.8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2208, roughness: 0.92, metalness: 0.0 });
    const trunkIM  = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    trunkIM.castShadow = true;

    // ── frond InstancedMesh ──
    const frondGeo = new THREE.ConeGeometry(1.5, 1.1, 6);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x0e3a04, roughness: 0.85, metalness: 0.0 });
    const frondIM  = new THREE.InstancedMesh(frondGeo, frondMat, count * FRONDS_PER);
    frondIM.castShadow = true;

    const dummy = new THREE.Object3D();

    palms.forEach(({ wx, wz, py, idx }, p) => {
      // Trunk
      dummy.position.set(wx, py + 1.9, wz);
      dummy.rotation.set(
        (_hash(wz, wx) - 0.5) * 0.15,  // slight fore-aft lean
        0,
        (_hash(wx, wz) - 0.5) * 0.25,  // slight side lean
      );
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      trunkIM.setMatrixAt(p, dummy.matrix);

      // 3 fronds around trunk crown
      for (let f = 0; f < FRONDS_PER; f++) {
        const fa = (f / FRONDS_PER) * Math.PI * 2 + _hash(idx, f) * 0.8;
        dummy.position.set(
          wx + Math.sin(fa) * 0.55,
          py + 3.8 + 0.35,
          wz + Math.cos(fa) * 0.55,
        );
        dummy.rotation.set(
          Math.cos(fa + Math.PI) * 0.65,
          0,
          Math.sin(fa + Math.PI) * 0.65,
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        frondIM.setMatrixAt(p * FRONDS_PER + f, dummy.matrix);
      }
    });

    trunkIM.instanceMatrix.needsUpdate = true;
    frondIM.instanceMatrix.needsUpdate = true;
    scene.add(trunkIM);
    scene.add(frondIM);
  }

  // ── Distant mountain ridge silhouettes ───────────────────────────────────
  // Low-poly BoxGeometry stacked shapes ~300 units north of world centre (50,0,50).
  // MeshBasicMaterial so they read as pure dark silhouettes unaffected by scene lights.
  {
    const mtMat = new THREE.MeshBasicMaterial({ color: 0x0b0f1a });

    // Each entry: [localX offset from 50, localZ offset from 50, boxW, boxD, boxH]
    // Positive Z = south, negative Z = north — mountains sit to the north.
    const ridgePeaks: Array<[number, number, number, number, number]> = [
      // Front ridge — z offset ~−300
      [-120, -295,  90, 35, 52],
      [ -50, -308,  80, 32, 68],
      [  15, -300,  72, 30, 50],
      [  80, -312,  85, 32, 64],
      [ 150, -298,  75, 30, 44],
      [ 210, -292,  80, 30, 36],
      // Back ridge — further and shorter for depth layering
      [-160, -345, 130, 45, 28],
      [  50, -352, 150, 45, 34],
      [ 220, -338, 110, 38, 26],
    ];

    for (const [lx, lz, w, d, h] of ridgePeaks) {
      const wx = 50 + lx;
      const wz = 50 + lz;

      // Main body
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtMat);
      body.position.set(wx, h / 2 - 6, wz);
      scene.add(body);

      // Narrower peak stacked on top for jagged silhouette
      const pkH = h * 0.52;
      const pkXOff = (_hash(lx * 0.1, lz * 0.1) - 0.5) * w * 0.28;
      const peak = new THREE.Mesh(new THREE.BoxGeometry(w * 0.48, pkH, d * 0.75), mtMat);
      peak.position.set(wx + pkXOff, h - 6 + pkH / 2, wz);
      scene.add(peak);
    }
  }

  // ── City lights on the horizon ────────────────────────────────────────────
  // Faint orange/amber horizon glow (breathing) + tiny window-light cubes
  // (flickering via per-instance phase ShaderMaterial) simulating a distant
  // city nestled against the northern mountain ridge.

  // Uniforms shared with tick() so the glow and windows animate every frame.
  const cityUniforms = { uTime: { value: 0.0 } };

  // Horizon glow band — large tilted plane, opacity breathes via tick()
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff7722,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowBand = new THREE.Mesh(new THREE.PlaneGeometry(320, 20), glowMat);
  glowBand.rotation.x = -Math.PI * 0.10;
  glowBand.position.set(90, 10, 50 - 285);
  scene.add(glowBand);

  // Warmer secondary glow blob (slightly different hue/position for depth)
  const glowMat2 = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowBand2 = new THREE.Mesh(new THREE.PlaneGeometry(180, 14), glowMat2);
  glowBand2.rotation.x = -Math.PI * 0.10;
  glowBand2.position.set(50 + 60, 8, 50 - 300);
  scene.add(glowBand2);

  // Ambient city-glow PointLights — kept very close to the mountain ridge so
  // they illuminate only the distant backdrop and cannot reach foreground assets.
  {
    const cityGlowDefs: Array<[number, number, number, number, number]> = [
      [50 - 50,  14, 50 - 275,  2.5, 80],
      [50 + 30,  12, 50 - 285,  2.0, 70],
      [50 + 110, 16, 50 - 268,  1.8, 70],
      [50 - 110, 13, 50 - 262,  1.8, 75],
    ];
    for (const [cx, cy, cz, intensity, dist] of cityGlowDefs) {
      const pl = new THREE.PointLight(0xff9944, intensity, dist);
      pl.position.set(cx, cy, cz);
      scene.add(pl);
    }
  }

  // Window-light cubes — two InstancedMeshes (orange / white) with a
  // ShaderMaterial that reads uTime + a per-instance aPhase attribute so
  // every window flickers at its own independent rate.
  {
    // Vertex shader: slow sine pulse + faster flicker combined.
    // instanceMatrix must be applied explicitly when using ShaderMaterial with
    // InstancedMesh — THREE.js does not inject it automatically.
    const winVert = `
      uniform float uTime;
      attribute float aPhase;
      varying float vBrightness;
      void main() {
        float slow   = sin(uTime * 0.85 + aPhase)             * 0.5 + 0.5;
        float fast   = sin(uTime * 6.10 + aPhase * 3.14159)   * 0.5 + 0.5;
        vBrightness  = 0.50 + 0.32 * slow + 0.18 * fast;
        vec4 worldPos = instanceMatrix * vec4(position, 1.0);
        gl_Position   = projectionMatrix * modelViewMatrix * worldPos;
      }
    `;

    // Helper: build one InstancedMesh for a colour group
    const buildWinIM = (
      positions: Array<{ wx: number; wy: number; wz: number }>,
      r: number, g: number, b: number,
    ): void => {
      const count = positions.length;
      if (count === 0) return;

      const geo = new THREE.BoxGeometry(1.2, 0.9, 0.4);

      // Per-instance random phase offset
      const phases = new Float32Array(count);
      for (let k = 0; k < count; k++) phases[k] = Math.random() * Math.PI * 2;
      geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: cityUniforms.uTime },
        vertexShader: winVert,
        fragmentShader: `
          varying float vBrightness;
          void main() {
            gl_FragColor = vec4(
              vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}) * vBrightness,
              1.0
            );
          }
        `,
      });

      const im = new THREE.InstancedMesh(geo, mat, count);
      const dummy = new THREE.Object3D();
      positions.forEach(({ wx, wy, wz }, idx) => {
        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();
        im.setMatrixAt(idx, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    };

    // Collect window positions, split by colour group
    const orangePos: Array<{ wx: number; wy: number; wz: number }> = [];
    const whitePos:  Array<{ wx: number; wy: number; wz: number }> = [];
    for (let i = 0; i < 80; i++) {
      const wx = 50 + (_hash(i * 3.13, 1.71) - 0.5) * 260;
      const wz = 50 - 248 - _hash(i * 1.97, 4.37) * 65;
      const wy = _hash(i * 2.73, 8.19) * 28 + 2;
      if (i % 3 === 0) whitePos.push({ wx, wy, wz });
      else             orangePos.push({ wx, wy, wz });
    }

    // Orange-amber windows  (0xffcc55 → r=1, g=0.8, b=0.333)
    buildWinIM(orangePos, 1.0, 0.8, 0.333);
    // Cool white / blue-white windows  (0xddeeff → r=0.867, g=0.933, b=1)
    buildWinIM(whitePos,  0.867, 0.933, 1.0);
  }

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

  // ── Entrance steps (south of grand entrance z=52, x=39–43) ───────────────
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
  // South wall segments: x=14–39 and x=43–62 (around 4 m entrance gap) and x=62–100
  const corniceSegs: Array<[number, number, number, number]> = [
    [14, 52, 39, 52],
    [43, 52, 62, 52],
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
  addPar(71.5, 52,    57,  PAR_W); // south-east  z=52, x=43-100
  addPar(26.5, 52,    25,  PAR_W); // south-west  z=52, x=14-39 (entrance gap skipped)
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
  // Entrance gap: z=52, x=39–43 (width=4, centred at x=41, matches door 1:1 ratio)
  // Players approach from z > 52, so signage faces the +z direction.

  const archMat = new THREE.MeshStandardMaterial({
    color: 0xd8cdb5,
    roughness: 0.75,
    metalness: 0.05,
  });

  // Pilasters flanking the 4 m entrance gap (x=39 and x=43)
  // The x=37–39 and x=43–45 wall slots are already rendered by the outerWalls loop in MuseumScene.
  // Plinth 0.3 + shaft 3.42 + cap 0.28 = exactly WALL_HEIGHT=4
  const pilasterDefs: Array<[number]> = [[39], [43]];
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

  // Elliptical arch spanning the 4 m doorway.
  // Torus radius=2 (half the 4 m gap), scaled y×2 so crown reaches y=4 = WALL_HEIGHT.
  // Result: 4 m wide × 4 m tall (1:1, matching the door GLB aspect ratio).
  // Arc=PI sweeps the top half: left foot (39,0) → crown (41,4) → right foot (43,0).
  // The tube bottom (y=-0.24) is hidden by the floor mesh.
  const archGeo = new THREE.TorusGeometry(2, 0.24, 10, 40, Math.PI);
  const archMesh = new THREE.Mesh(archGeo, archMat);
  archMesh.position.set(41, 0, 52);
  archMesh.scale.y = 2;
  archMesh.castShadow = true;
  scene.add(archMesh);

  // Keystone at the crown of the arch (a slightly protruding block at y=4)
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.42), archMat);
  keystone.position.set(41, 4.25, 52);
  keystone.castShadow = true;
  scene.add(keystone);

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
  mc.font = "bold 82px Georgia, serif";
  mc.textAlign = "center";
  mc.textBaseline = "middle";
  mc.fillText("10KSQUAD MUSEUM", 512, 215, 960);

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

  const tick = (t: number) => {
    starUniforms.uTime.value  = t;
    oceanUniforms.uTime.value = t;
    cityUniforms.uTime.value  = t;

    // Horizon glow bands breathe slowly — two different frequencies so they
    // never pulse perfectly in sync, giving a more organic city-atmosphere feel.
    glowMat.opacity  = 0.055 + 0.022 * Math.sin(t * 0.31);
    glowMat2.opacity = 0.038 + 0.018 * Math.sin(t * 0.47 + 1.2);
  };

  return { boxes: extraBoxes, tick };
}
