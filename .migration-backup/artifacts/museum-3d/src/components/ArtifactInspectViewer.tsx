import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

interface Props {
  modelUrl: string;
  height?: number;
}

export default function ArtifactInspectViewer({ modelUrl, height = 220 }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const w = container.clientWidth || 320;
    const h = height;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(0, 0.5, 2.8);
    camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffd580, 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x6080ff, 0.8);
    fill.position.set(-3, 1, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xf77f00, 1.0);
    rim.position.set(0, -2, -3);
    scene.add(rim);

    let modelGroup: THREE.Group | null = null;
    let rafId = 0;
    let alive = true;

    const base = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
    const resolved = modelUrl.startsWith("/") ? `${base}${modelUrl}` : modelUrl;

    gltfLoader.load(
      resolved,
      (gltf) => {
        if (!alive) return;
        const model = gltf.scene;
        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 1.6 / maxDim : 1;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        model.position.set(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        scene.add(wrapper);
        modelGroup = wrapper;
      },
      undefined,
      (err) => {
        console.warn("[ArtifactInspectViewer] Failed to load:", resolved, err);
      },
    );

    const clock = new THREE.Clock();

    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (modelGroup) {
        modelGroup.rotation.y = t * 0.6;
        modelGroup.position.y = Math.sin(t * 0.9) * 0.06;
      }
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth || 320;
      renderer.setSize(nw, h);
      camera.aspect = nw / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl, height]);

  return (
    <div
      ref={canvasRef}
      style={{
        width: "100%",
        height,
        background: "linear-gradient(160deg, #0d0a00 0%, #1a0e00 50%, #0d0800 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Radial glow behind the model */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(247,127,0,0.18) 0%, transparent 70%)",
          }}
        />
      </div>
    </div>
  );
}
