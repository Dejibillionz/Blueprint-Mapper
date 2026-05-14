import * as THREE from "three";

const DISCORD_URL   = "https://discord.com/invite/the10ksquad";
const DISCORD_COLOR = 0x5865f2;

export const PORTAL_X = 57;
export const PORTAL_Z = 46;
export const PORTAL_HINT_RADIUS     = 4.5;
export const PORTAL_ACTIVATE_RADIUS = 1.4;

export class DiscordPortal {
  private group:         THREE.Group;
  private outerRing:     THREE.Mesh;
  private innerDisc:     THREE.Mesh;
  private innerDiscMat:  THREE.MeshBasicMaterial;
  private particles:     THREE.Points;
  private partPositions: Float32Array;
  private partPhases:    Float32Array;
  private portalLight:   THREE.PointLight;
  private signMesh:      THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.position.set(PORTAL_X, 0, PORTAL_Z);

    // ── Outer glowing torus ring ──────────────────────────────────────────────
    const torusMat = new THREE.MeshStandardMaterial({
      color:            DISCORD_COLOR,
      emissive:         DISCORD_COLOR,
      emissiveIntensity: 3.5,
      metalness:        0.3,
      roughness:        0.2,
    });
    this.outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.11, 16, 64),
      torusMat,
    );
    this.outerRing.position.set(0, 1.2, 0);
    // TorusGeometry is in the XY plane by default → faces Z axis, perfect for
    // a wall at z=46 that the player walks through along Z.
    this.group.add(this.outerRing);

    // ── Inner swirling disc ───────────────────────────────────────────────────
    this.innerDiscMat = new THREE.MeshBasicMaterial({
      color:       DISCORD_COLOR,
      transparent: true,
      opacity:     0.35,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    this.innerDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.84, 48),
      this.innerDiscMat,
    );
    this.innerDisc.position.set(0, 1.2, 0);
    this.group.add(this.innerDisc);

    // ── Secondary (larger) translucent halo ring ──────────────────────────────
    const haloMat = new THREE.MeshBasicMaterial({
      color:       DISCORD_COLOR,
      transparent: true,
      opacity:     0.08,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), haloMat);
    halo.position.set(0, 1.2, 0);
    this.group.add(halo);

    // ── Orbiting particles ────────────────────────────────────────────────────
    const COUNT = 90;
    this.partPositions = new Float32Array(COUNT * 3);
    this.partPhases    = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.partPhases[i] = Math.random() * Math.PI * 2;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(this.partPositions, 3));
    this.particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
      color:      0x8899ff,
      size:       0.055,
      transparent: true,
      opacity:    0.9,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.particles.position.set(0, 1.2, 0);
    this.group.add(this.particles);

    // ── Point light for the glow ──────────────────────────────────────────────
    this.portalLight = new THREE.PointLight(DISCORD_COLOR, 4.5, 9);
    this.portalLight.position.set(0, 1.2, 0.5);
    this.group.add(this.portalLight);

    // ── "Discord" sign above portal ───────────────────────────────────────────
    const canvas = document.createElement("canvas");
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle   = "rgba(88,101,242,0.85)";
    ctx.roundRect(0, 4, 256, 56, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font      = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔗 Join Discord", 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    this.signMesh.position.set(0, 2.55, 0.05);
    this.group.add(this.signMesh);

    scene.add(this.group);
  }

  update(elapsed: number) {
    // Spin the torus ring
    this.outerRing.rotation.z = elapsed * 0.7;

    // Pulse inner disc opacity
    this.innerDiscMat.opacity = 0.22 + Math.sin(elapsed * 2.8) * 0.13;

    // Pulse portal light
    this.portalLight.intensity = 4.0 + Math.sin(elapsed * 3.3) * 0.9;

    // Gently bob the sign
    this.signMesh.position.y = 2.55 + Math.sin(elapsed * 1.5) * 0.04;

    // Animate orbiting particles
    const COUNT = this.partPhases.length;
    for (let i = 0; i < COUNT; i++) {
      const phase = this.partPhases[i] + elapsed * 1.3;
      const r = 0.82 + Math.sin(this.partPhases[i] * 4.1 + elapsed * 0.9) * 0.09;
      this.partPositions[i * 3]     = Math.cos(phase) * r;
      this.partPositions[i * 3 + 1] = Math.sin(phase) * r;
      this.partPositions[i * 3 + 2] = Math.sin(elapsed * 0.8 + this.partPhases[i]) * 0.05;
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
  }

  static open() {
    window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
  }
}
