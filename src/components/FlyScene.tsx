import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

type FlybodyPart = {
  group: "body" | "front_left" | "front_right";
  material: string;
  positionByteOffset: number;
  positionCount: number;
  indexByteOffset: number;
  indexCount: number;
};

type FlybodyModel = {
  binary: string;
  outputTriangles: number;
  pivots: Record<FlybodyPart["group"], [number, number, number]>;
  parts: FlybodyPart[];
};

function keyLabel(letter: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#d6cfc4";
  context.font = "600 26px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function FlyScene({ controls }: { controls: RefObject<{ left: number; right: number }> }) {
  const host = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(3.6, 2.3, 5.0);
    camera.lookAt(0, -0.18, 0.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    element.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xb8b2a8, 2.6));
    const keyLight = new THREE.DirectionalLight(0xffe0c2, 4.2);
    keyLight.position.set(3.4, 5.2, 4.5);
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xdfe8f2, 1.7);
    fill.position.set(-4.2, 2.4, 2.2);
    scene.add(fill);
    const rim = new THREE.PointLight(0xf0a477, 14, 7);
    rim.position.set(-2.5, 1.2, -1.5);
    scene.add(rim);

    const rig = new THREE.Group();
    rig.rotation.set(-0.04, -0.08, -0.015);
    scene.add(rig);

    const modelRoot = new THREE.Group();
    modelRoot.position.set(0, 0.35, -0.02);
    modelRoot.scale.setScalar(5);
    rig.add(modelRoot);

    const bodyGroup = new THREE.Group();
    const frontLeft = new THREE.Group();
    const frontRight = new THREE.Group();
    let frontLeftRestY = 0;
    let frontRightRestY = 0;
    modelRoot.add(bodyGroup, frontLeft, frontRight);

    const materials: Record<string, THREE.Material> = {
      // Naturalistic house-fly palette: slate-gray chitin with a faint
      // metallic sheen, glossy brick-red compound eyes, clear wings.
      body: new THREE.MeshStandardMaterial({ color: 0x4d4d52, roughness: 0.48, metalness: 0.32 }),
      black: new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.55, metalness: 0.12 }),
      red: new THREE.MeshStandardMaterial({ color: 0xa8241a, emissive: 0x3d0a05, emissiveIntensity: 0.5, roughness: 0.22 }),
      ocelli: new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x5b3a05, emissiveIntensity: 0.45, roughness: 0.35 }),
      "bristle-brown": new THREE.MeshStandardMaterial({ color: 0x1a1611, roughness: 0.82 }),
      lower: new THREE.MeshStandardMaterial({ color: 0x5c5449, roughness: 0.66 }),
      brown: new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.65 }),
      membrane: new THREE.MeshPhysicalMaterial({ color: 0xe8e6ee, transparent: true, opacity: 0.22, roughness: 0.14, transmission: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    };

    let disposed = false;
    void (async () => {
      try {
        const metadataResponse = await fetch("/data/flybody/model.json");
        if (!metadataResponse.ok) throw new Error("Flybody metadata unavailable");
        const metadata = await metadataResponse.json() as FlybodyModel;
        const binaryResponse = await fetch(`/data/flybody/${metadata.binary}`);
        if (!binaryResponse.ok) throw new Error("Flybody mesh unavailable");
        const buffer = await binaryResponse.arrayBuffer();
        if (disposed) return;

        const groups = { body: bodyGroup, front_left: frontLeft, front_right: frontRight };
        (Object.keys(groups) as FlybodyPart["group"][]).forEach((groupName) => {
          groups[groupName].position.fromArray(metadata.pivots[groupName]);
        });
        frontLeftRestY = metadata.pivots.front_left[1];
        frontRightRestY = metadata.pivots.front_right[1];

        for (const part of metadata.parts) {
          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(buffer.slice(part.positionByteOffset, part.positionByteOffset + part.positionCount * 12));
          const indices = new Uint32Array(buffer.slice(part.indexByteOffset, part.indexByteOffset + part.indexCount * 4));
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          const mesh = new THREE.Mesh(geometry, materials[part.material] ?? materials.body);
          groups[part.group].add(mesh);
        }
        setLoadState("ready");
      } catch {
        if (!disposed) setLoadState("error");
      }
    })();

    const keyboard = new THREE.Group();
    keyboard.position.set(0, -0.48, 0.08);
    rig.add(keyboard);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x35363c, roughness: 0.55, metalness: 0.08 });
    const keyMaterial = new THREE.MeshStandardMaterial({ color: 0x42444c, roughness: 0.6, metalness: 0.04 });
    const activeKeyMaterial = new THREE.MeshStandardMaterial({ color: 0xf0a477, emissive: 0xd97f4d, emissiveIntensity: 0.5, roughness: 0.44 });
    const keyboardBase = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.16, 2.18), baseMaterial);
    keyboard.add(keyboardBase);

    let leftKey: THREE.Mesh | null = null;
    let rightKey: THREE.Mesh | null = null;
    const labelTextures: THREE.Texture[] = [];
    for(let row=0;row<4;row++)for(let col=0;col<11;col++){
      if(row===3&&col>=3&&col<=7)continue;
      const cap=new THREE.Mesh(new THREE.BoxGeometry(.32,.1,.3),keyMaterial);
      cap.position.set((col-5)*.4,.13,(row-2)*.38);keyboard.add(cap);
    }
    for(const [index,letter] of ['SPACE','↓'].entries()){
      const cap=new THREE.Mesh(new THREE.BoxGeometry(.62,.1,.34),keyMaterial);
      cap.position.set(index===0?-.34:.34,.13,.365);keyboard.add(cap);
      if(index===0)leftKey=cap;else rightKey=cap;
      const texture=keyLabel(letter);
      if(texture){labelTextures.push(texture);const label=new THREE.Mesh(new THREE.PlaneGeometry(.5,.22),new THREE.MeshBasicMaterial({map:texture,transparent:true}));label.rotation.x=-Math.PI/2;label.position.set(0,.056,0);cap.add(label);}
    }

    let pointerDown = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (event: PointerEvent) => {
      pointerDown = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      rig.rotation.y += (event.clientX - lastX) * 0.009;
      rig.rotation.x = THREE.MathUtils.clamp(rig.rotation.x + (event.clientY - lastY) * 0.006, -0.5, 0.5);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => { pointerDown = false; };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
      camera.aspect = Math.max(width, 1) / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let frame = 0;
    const animate = () => {
      const leftPress = controls.current.left;
      const rightPress = controls.current.right;
      if (leftKey) {leftKey.position.y = 0.13 - leftPress * 0.055;leftKey.material=leftPress?activeKeyMaterial:keyMaterial;}
      if (rightKey) {rightKey.position.y = 0.13 - rightPress * 0.055;rightKey.material=rightPress?activeKeyMaterial:keyMaterial;}
      // The forelegs visualize separate jump and duck commands.
      // Rotate around each shoulder so the distal toe follows the 55mm key travel.
      const toeY = -.1033, toeZ = .0615;
      const toeAngle = (press: number) => Math.asin((toeY - press * .055 / 5) / Math.hypot(toeY, toeZ)) - Math.atan2(toeY, toeZ);
      frontRight.rotation.x = -toeAngle(leftPress);
      frontLeft.rotation.x = -toeAngle(rightPress);
      frontLeft.position.y = frontLeftRestY;
      frontRight.position.y = frontRightRestY;
      renderer.domElement.dataset.leftPress = leftPress.toFixed(2);
      renderer.domElement.dataset.rightPress = rightPress.toFixed(2);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      Object.values(materials).forEach((material) => material.dispose());
      baseMaterial.dispose();
      keyMaterial.dispose();
      activeKeyMaterial.dispose();
      labelTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [controls]);

  return (
    <div ref={host} className="three-viewport fly-viewport" aria-label="Anatomically detailed flybody model pressing SPACE and Down keys on a keyboard">
      <div className={`fly-load ${loadState}`} aria-live="polite">
        {loadState === "loading" && <span>Loading…</span>}
        {loadState === "error" && <span>Body model unavailable</span>}
      </div>
    </div>
  );
}
