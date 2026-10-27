import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Blueprint } from "../../../packages/shared-types";

function blockColor(name: string) {
  if (/glass|ice/.test(name)) return "#8cb8c3";
  if (/leav|moss|grass/.test(name)) return "#628450";
  if (/spruce|dark_oak/.test(name)) return "#735036";
  if (/oak|wood|log|chest/.test(name)) return "#b18a53";
  if (/brick|granite|terracotta/.test(name)) return "#a96c57";
  if (/sand|birch/.test(name)) return "#d5caa0";
  if (/torch|lantern|light/.test(name)) return "#e2b55b";
  if (/wool|quartz|snow/.test(name)) return "#deddd2";
  return "#8a9399";
}
export default function BuildPreview({
  blueprint,
  checkpoint,
}: {
  blueprint: Blueprint;
  checkpoint?: any;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [floor, setFloor] = useState(blueprint.dimensions.y);
  const [roof, setRoof] = useState(true);
  const [section, setSection] = useState("all");
  const [progress, setProgress] = useState("all");
  const [error, setError] = useState("");
  const checkpointKey = JSON.stringify(checkpoint?.verified || []);
  const sections = Array.from(
    new Set(blueprint.blocks.map((b) => b.section).filter(Boolean)),
  );
  useEffect(() => {
    setFloor(blueprint.dimensions.y);
    setSection("all");
  }, [blueprint]);
  useEffect(() => {
    if (!mount.current) return;
    const container = mount.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "3D preview needs WebGL. The blueprint and exact materials remain available below.",
      );
      return;
    }
    setError("");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    const { x, y, z } = blueprint.dimensions;
    const size = Math.max(x, y, z, 4);
    camera.position.set(size * 1.5, size * 1.1, size * 1.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(x / 2, y / 3, z / 2);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xe8f5fa, 0x343d31, 2.8));
    const light = new THREE.DirectionalLight(0xffebc4, 3);
    light.position.set(20, 35, 15);
    scene.add(light);
    const grid = new THREE.GridHelper(
      Math.max(x, z) + 8,
      Math.max(x, z) + 8,
      0x4d685f,
      0x25352f,
    );
    grid.position.set(x / 2, -0.51, z / 2);
    scene.add(grid);
    const geometry = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const groups = new Map<string, typeof blueprint.blocks>();
    const verified = new Set(checkpoint?.verified || []);
    for (const [index, block] of blueprint.blocks.entries()) {
      if (
        block.y >= floor ||
        (!roof && block.section?.toLowerCase().includes("roof")) ||
        (section !== "all" && block.section !== section) ||
        (progress === "verified" && !verified.has(index)) ||
        (progress === "unbuilt" && verified.has(index))
      )
        continue;
      const list = groups.get(block.name) || [];
      list.push(block);
      groups.set(block.name, list);
    }
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const matrix = new THREE.Matrix4();
    let disposed = false;
    const textureLoader = new THREE.TextureLoader();
    for (const [name, blocks] of groups) {
      const material = new THREE.MeshStandardMaterial({
        color: blockColor(name),
        roughness: 0.95,
        transparent: /glass/.test(name),
        opacity: /glass/.test(name) ? 0.45 : 1,
      });
      materials.push(material);
      textureLoader.load(
        `/api/assets/block/${encodeURIComponent(name)}`,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace;
          textures.push(texture);
          material.map = texture;
          material.color.set("#ffffff");
          material.needsUpdate = true;
        },
        undefined,
        () => {},
      );
      const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
      blocks.forEach((b, i) => {
        matrix.makeTranslation(b.x, b.y, b.z);
        mesh.setMatrixAt(i, matrix);
      });
      scene.add(mesh);
    }
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      controls.update();
      renderer.render(scene, camera);
    };
    draw();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [blueprint, floor, roof, section, progress, checkpointKey]);
  return (
    <div className="preview-wrap">
      <div className="preview-toolbar">
        <label>
          Layers{" "}
          <input
            aria-label="Visible layers"
            type="range"
            min="1"
            max={blueprint.dimensions.y}
            value={floor}
            onChange={(e) => setFloor(Number(e.target.value))}
          />
          <span>
            {floor}/{blueprint.dimensions.y}
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={roof}
            onChange={(e) => setRoof(e.target.checked)}
          />
          Roof
        </label>
        <select
          aria-label="Isolate section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="all">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {checkpoint ? (
          <select
            aria-label="Construction checkpoint filter"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          >
            <option value="all">All placements</option>
            <option value="verified">Checkpoint verified</option>
            <option value="unbuilt">Not verified</option>
          </select>
        ) : null}
      </div>
      <div ref={mount} className="voxel-view">
        {error ? <p className="preview-error">{error}</p> : null}
      </div>
      <div className="preview-caption">
        <span>Drag to orbit · Scroll to zoom · Right-drag to pan</span>
        <span>
          Cube preview · {blueprint.dimensions.x} × {blueprint.dimensions.y} ×{" "}
          {blueprint.dimensions.z} blocks
        </span>
      </div>
    </div>
  );
}
