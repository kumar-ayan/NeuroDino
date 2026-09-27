import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CIRCUIT } from "../lib/connectome";
/** Every colored point is keyed to a simulated body ID; unmodeled atlas cells stay gray. */
export function BrainScene({
  activity,
  active,
}: {
  activity?: number[];
  active: boolean;
}) {
  const signal = useRef(activity),
    host = useRef<HTMLDivElement>(null),
    repaint = useRef<(() => void) | null>(null),
    resetView = useRef<((zoom: boolean) => void) | null>(null),
    orbit = useRef(false);
  const [state, setState] = useState("loading"),
    [orbiting, setOrbiting] = useState(false),
    [zoom, setZoom] = useState(false);
  useEffect(() => {
    signal.current = active ? activity : undefined;
    repaint.current?.();
  }, [activity, active]);
  useEffect(() => {
    const element = host.current!;
    let disposed = false,
      frame = 0;
    const controller = new AbortController();
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-3, 3, 2, -2, 0.01, 100),
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const anatomy = new THREE.Group();
    scene.add(anatomy);
    const disposables: Array<{ dispose: () => void }> = [];
    let size = new THREE.Vector3(5, 3, 2),
      focus = false,
      center = new THREE.Vector3(),
      circuitBounds = new THREE.Box3();
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      const aspect = Math.max(1, width) / Math.max(1, height),
        extent = focus ? circuitBounds.getSize(new THREE.Vector3()) : size;
      const half =
        Math.max(extent.y / 2, Math.hypot(extent.x, extent.z) / 2 / aspect) *
          1.22 || 2;
      camera.top = half;
      camera.bottom = -half;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      const target = focus
        ? circuitBounds.getCenter(new THREE.Vector3())
        : new THREE.Vector3();
      camera.position.set(target.x, target.y, 10);
      camera.lookAt(target.x, target.y, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resetView.current = (zoom) => {
      focus = zoom;
      anatomy.rotation.set(0, 0, 0);
      fit();
    };
    const load = async () => {
      const fetchFile = async (path: string) => {
        const r = await fetch("/data/brain-atlas/" + path, {
          signal: controller.signal,
        });
        if (!r.ok) throw Error("Atlas unavailable");
        return r;
      };
      const manifest = await (await fetchFile("manifest.json")).json();
      const [p, g] = await Promise.all([
        fetchFile(manifest.files.positions),
        fetchFile(manifest.files.groups),
      ]);
      const positions = new Float32Array(await p.arrayBuffer()),
        groups = new Uint8Array(await g.arrayBuffer());
      if (disposed) return;
      if (
        positions.length !== manifest.count * 3 ||
        groups.length !== manifest.count
      )
        throw Error("Atlas size mismatch");
      const xyz: number[] = [],
        bounds = new THREE.Box3();
      for (let i = 0; i < groups.length; i++) {
        if (groups[i] >= 3) continue;
        const v = new THREE.Vector3(
          positions[i * 3],
          -positions[i * 3 + 1],
          -positions[i * 3 + 2],
        );
        bounds.expandByPoint(v);
        xyz.push(v.x, v.y, v.z);
      }
      center = bounds.getCenter(new THREE.Vector3());
      size = bounds.getSize(new THREE.Vector3());
      const scale = 5 / Math.max(size.x, size.y, size.z);
      size.multiplyScalar(scale);
      const convert = (p: number[]) => [
        (p[0] - center.x) * scale,
        (-p[1] - center.y) * scale,
        (-p[2] - center.z) * scale,
      ];
      for (let i = 0; i < xyz.length; i += 3) {
        xyz[i] = (xyz[i] - center.x) * scale;
        xyz[i + 1] = (xyz[i + 1] - center.y) * scale;
        xyz[i + 2] = (xyz[i + 2] - center.z) * scale;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
      const mat = new THREE.PointsMaterial({
        color: "#b9ab9c",
        size: 0.009,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      anatomy.add(new THREE.Points(geo, mat));
      disposables.push(geo, mat);
      const circuitXYZ = CIRCUIT.nodes.flatMap((n) => convert(n.position));
      for (let i = 0; i < circuitXYZ.length; i += 3)
        circuitBounds.expandByPoint(
          new THREE.Vector3(...circuitXYZ.slice(i, i + 3)),
        );
      const cg = new THREE.BufferGeometry();
      cg.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(circuitXYZ, 3),
      );
      const values = new Float32Array(CIRCUIT.nodes.length);
      cg.setAttribute("activity", new THREE.BufferAttribute(values, 1));
      const cm = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        uniforms: { ratio: { value: Math.min(devicePixelRatio, 2) } },
        vertexShader: `attribute float activity; varying float value; uniform float ratio; void main(){value=activity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=(4.+abs(value)*5.)*ratio;}`,
        fragmentShader: `varying float value; void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.5)discard;vec3 c=value>=0.?vec3(.561,.722,.604):vec3(.851,.553,.463);float a=.25+.75*min(1.,abs(value));gl_FragColor=vec4(c,a*(1.-smoothstep(.3,.5,r)));}`,
      });
      anatomy.add(new THREE.Points(cg, cm));
      disposables.push(cg, cm);
      const lines = CIRCUIT.edges.flatMap(([a, b]) => [
          ...circuitXYZ.slice(a * 3, a * 3 + 3),
          ...circuitXYZ.slice(b * 3, b * 3 + 3),
        ]),
        lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
      const lm = new THREE.LineBasicMaterial({
        color: "#a5c0ad",
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
      });
      anatomy.add(new THREE.LineSegments(lg, lm));
      disposables.push(lg, lm);
      repaint.current = () => {
        values.set(signal.current ?? new Float32Array(values.length));
        cg.getAttribute("activity").needsUpdate = true;
      };
      repaint.current();
      fit();
      setState("ready");
    };
    void load().catch(() => {
      if (!disposed) setState("error");
    });
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    let held = false,
      lastX = 0,
      lastY = 0;
    const down = (e: PointerEvent) => {
      held = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (held) {
        anatomy.rotation.y += (e.clientX - lastX) * 0.006;
        anatomy.rotation.x += (e.clientY - lastY) * 0.006;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const up = () => {
      held = false;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let previous = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (orbit.current && !held && !reduced.matches && !document.hidden)
        anatomy.rotation.y += dt * 0.12;
      if (!document.hidden) renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      repaint.current = null;
      resetView.current = null;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <>
      <div className="brain-view-controls">
        <button
          aria-pressed={zoom}
          onClick={() => {
            setZoom(!zoom);
            orbit.current = false;
            setOrbiting(false);
            resetView.current?.(!zoom);
          }}
        >
          {zoom ? "Full atlas" : "Focus circuit"}
        </button>
        <button
          aria-pressed={orbiting}
          onClick={() => {
            orbit.current = !orbit.current;
            setOrbiting(orbit.current);
          }}
        >
          Orbit {orbiting ? "on" : "off"}
        </button>
      </div>
      <div className="activity-label">
        <span className={active ? "live-dot" : ""} />
        {active ? "Live" : "Idle"}
      </div>
      <div
        ref={host}
        className="three-viewport brain-viewport"
        aria-label="Measured MaleCNS anatomy with 80 simulated cell activities"
      >
        {state !== "ready" && (
          <span role="status" className="loading">
            {state === "error"
              ? "Atlas could not load. Reload to retry."
              : "Loading measured anatomy…"}
          </span>
        )}
      </div>
      <div className="brain-legend" aria-hidden="true" />
    </>
  );
}
