/* ============================================================================
   ROTATING 3D ASCII SYMBOLS  — one per "What I do" block
   Adapted from "images for landing page/rotating-3d-shapes-ascii.html": the
   three communication symbols (rook, megaphone, rocket), rendered to text by
   three's AsciiEffect. Each instance is lazy-built when it nears the viewport
   and only animates while visible / the tab is focused.
   ========================================================================== */
import * as THREE from "three";
import { AsciiEffect } from "three/addons/effects/AsciiEffect.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  /(\?|&|#).*still/.test(location.href);

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---- shared treatment: shaded solids + physical edge strokes ------------- */
/* Near-white lit surfaces alone stop telling one turned section from the next
   at some angles, so every part carries a flat vertex tint the lighting
   multiplies into — brightness banding with a real gradient on top. */
const smoothMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0 });

function tinted(geo, value) {
  geo.setAttribute("color", new THREE.Float32BufferAttribute(
    new Float32Array(geo.getAttribute("position").count * 3).fill(value), 3));
  return geo;
}

function sharpParts(parts, scale = 1) {
  // Extruded fins are non-indexed; normalize the other primitives before merging.
  const normalized = parts.map(part => part.index ? part.toNonIndexed() : part);
  const geo = mergeGeometries(normalized);
  normalized.forEach((part, i) => { if (part !== parts[i]) part.dispose(); });
  parts.forEach(part => part.dispose());
  geo.center();
  geo.scale(scale, scale, scale);
  return sharpMesh(geo);
}

function sharpMesh(geo) {
  const mat = smoothMat();
  mat.flatShading = true;
  mat.roughness = 1;
  mat.vertexColors = true;
  mat.polygonOffset = true;      // push the fill back so coplanar rims don't z-fight
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;

  const mesh = new THREE.Mesh(geo, mat);
  // Real thickness survives ASCII downsampling; WebGL's one-pixel lines do not.
  // Keep depth testing so rear and buried edges remain occluded. 20 degrees is
  // the key threshold: the cylinders' radial seams fall below it and stay out,
  // while every cap-meets-wall rim and box edge is kept.
  const edgeGeo = new THREE.EdgesGeometry(geo, 20);
  const edgePositions = edgeGeo.getAttribute("position");
  const strokes = [];
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  for (let i = 0; i < edgePositions.count; i += 2) {
    start.fromBufferAttribute(edgePositions, i);
    end.fromBufferAttribute(edgePositions, i + 1);
    direction.subVectors(end, start);
    const length = direction.length();
    if (length < 1e-6) continue;
    orientation.setFromUnitVectors(axis, direction.divideScalar(length));
    const stroke = new THREE.CylinderGeometry(0.018, 0.018, length, 6);
    stroke.applyQuaternion(orientation);
    stroke.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    strokes.push(stroke);
  }
  const rims = new THREE.Mesh(mergeGeometries(strokes), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strokes.forEach(stroke => stroke.dispose());
  edgeGeo.dispose();
  rims.renderOrder = 1;
  mesh.add(rims);
  return mesh;
}

/* ---- the three symbols --------------------------------------------------- */
const SHAPES = {
  rook() {
    // Stacked turned sections (the lathe profile of a chess rook) plus a ring
    // of box merlons for the crenellated crown. Stacked neighbours alternate
    // bright/dark; the low tint stays high enough that a dark section's shadow
    // side still prints.
    const parts = [
      tinted(new THREE.CylinderGeometry(0.68, 0.74, 0.22, 28).translate(0, -1.14, 0), 0.62), // base
      tinted(new THREE.CylinderGeometry(0.52, 0.66, 0.24, 28).translate(0, -0.93, 0), 0.22), // base fillet
      tinted(new THREE.CylinderGeometry(0.42, 0.52, 1.10, 28).translate(0, -0.26, 0), 0.62), // shaft
      tinted(new THREE.CylinderGeometry(0.62, 0.44, 0.20, 28).translate(0,  0.39, 0), 0.22), // collar flare
      tinted(new THREE.CylinderGeometry(0.64, 0.64, 0.30, 28).translate(0,  0.64, 0), 0.62), // crown drum
    ];
    const MERLONS = 6;
    for (let i = 0; i < MERLONS; i++) {
      const a = (i / MERLONS) * Math.PI * 2;
      const m = new THREE.BoxGeometry(0.24, 0.32, 0.24);
      m.rotateY(-a);                                              // keep faces square-on to the rim
      m.translate(Math.cos(a) * 0.48, 0.93, Math.sin(a) * 0.48);
      parts.push(tinted(m, 0.46));
    }
    return sharpParts(parts, 1.15);   // narrowest shape here — fill the frame
  },
  megaphone() {
    // A hollow bell makes the mouth read as an opening, not a solid cone cap.
    // The closed lathe profile includes both the outer and inner walls.
    const profile = [
      V(0.25, -0.82, 0), V(0.98, 0.92, 0), V(0.88, 0.92, 0),
      V(0.17, -0.72, 0), V(0.17, -0.82, 0), V(0.25, -0.82, 0),
    ].map(p => new THREE.Vector2(p.x, p.y));
    const bell = new THREE.LatheGeometry(profile, 32).rotateX(Math.PI / 2);
    const colors = [], positions = bell.getAttribute("position");
    const normals = bell.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) {
      const radial = positions.getX(i) * normals.getX(i) + positions.getY(i) * normals.getY(i);
      const value = radial < 0 ? 0.16 : 0.62;
      colors.push(value, value, value);
    }
    bell.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mesh = sharpParts([
      bell,
      tinted(new THREE.CylinderGeometry(1.03, 1.03, 0.12, 32, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.92), 0.85),
      tinted(new THREE.CylinderGeometry(0.25, 0.25, 0.38, 24).rotateX(Math.PI / 2).translate(0, 0, -0.99), 0.30),
      tinted(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 24).rotateX(Math.PI / 2).translate(0, 0, -1.20), 0.65),
      tinted(new THREE.BoxGeometry(0.32, 0.82, 0.36).rotateX(-0.18).translate(0, -0.56, -0.65), 0.32),
      tinted(new THREE.BoxGeometry(0.42, 0.16, 0.44).translate(0, -0.96, -0.58), 0.65),
    ], 1.08);
    // Tilt the bell upward in local space so it stays raised while spinning.
    mesh.rotation.x = -0.28;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  },
  rocket() {
    // Broad fins and a pointed nose carry the silhouette through a full turn.
    const parts = [
      tinted(new THREE.CylinderGeometry(0.43, 0.43, 1.48, 32).translate(0, -0.02, 0), 0.62),
      tinted(new THREE.ConeGeometry(0.43, 0.72, 32).translate(0, 1.08, 0), 0.34),
      tinted(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 32).translate(0, 0.70, 0), 0.82),
      tinted(new THREE.CylinderGeometry(0.28, 0.36, 0.24, 24).translate(0, -0.86, 0), 0.26),
    ];
    const fin = new THREE.Shape();
    fin.moveTo(0.36, -0.18);
    fin.lineTo(0.84, -0.80);
    fin.lineTo(0.84, -1.12);
    fin.lineTo(0.36, -0.76);
    fin.closePath();
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false, steps: 1 });
      geo.translate(0, 0, -0.06);
      geo.rotateY(i * Math.PI / 2);
      parts.push(tinted(geo, i % 2 ? 0.32 : 0.48));
    }
    // A large dark porthole with a bright rim is legible in the character grid.
    // Repeat on the back so the symbol retains its detail as it rotates.
    for (const side of [-1, 1]) {
      parts.push(tinted(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 24)
        .rotateX(Math.PI / 2).translate(0, 0.23, side * 0.418), 0.08));
      parts.push(tinted(new THREE.TorusGeometry(0.20, 0.035, 8, 24)
        .translate(0, 0.23, side * 0.448), 0.92));
    }
    return sharpParts(parts, 1.12);
  },
};

/* A lean, in radians, set straight on the spinning mesh. Euler order is XYZ, so
   R = Rx·Ry·Rz — the Z lean is applied first, in the shape's own frame, and the
   Y spin then swings it around, so the shape stays tipped over while its high
   side travels around, like a wobbling top. */
const LEAN_Z = { rook: 0.36, megaphone: -0.12, rocket: -0.28 };
const TILT_X = 0.10;   // these all have a clear "up" — no end-over-end tumble

/* The megaphone is the bulkiest symbol side-on, so at the shared camera
   distance it reads noticeably larger than the other two. Hold the camera back
   a little for it alone. */
const CAM_PULL = { megaphone: 1.12 };

/* ---- one instance per [data-shape] element ------------------------------ */
class ShapeView {
  constructor(el, name) {
    this.el = el;
    this.name = SHAPES[name] ? name : "rook";
    this.ready = false;
    this.running = false;
    this.wantVisible = false;
    this.raf = null;
    this.t = 0;
    this.lastNow = 0;

    this.io = new IntersectionObserver((entries) => {
      this.wantVisible = entries[0].isIntersecting;
      if (this.wantVisible) { this.build(); this.start(); } else { this.stop(); }
    }, { rootMargin: "300px 0px" });
    this.io.observe(el);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop(); else if (this.wantVisible) this.start();
    });
  }

  build() {
    if (this.ready) return;
    this.ready = true;

    const box = this.el.getBoundingClientRect();
    const size = Math.max(220, Math.min(box.width || 360, box.height || 360, 560));
    this.size = size;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // Close enough that the symbols fill ~80% of the frame; any nearer and the
    // megaphone's bell and the rocket's fins clip at some point in the turn.
    const pull = CAM_PULL[this.name] || 1;
    this.camera.position.set(2.42 * pull, 1.95 * pull, 3.59 * pull);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0x000000, 1);   // pure black -> blank glyphs
    this.renderer.setSize(size, size);

    // Fine sampling preserves the symbols' small notches, openings and rims.
    this.effect = new AsciiEffect(this.renderer, " .:-=+*#%@", { invert: true, resolution: 0.26 });
    this.effect.setSize(size, size);
    this.effect.domElement.setAttribute("aria-hidden", "true");
    this.el.appendChild(this.effect.domElement);

    // Ground/ambient are kept off pure black so a dark side still prints glyphs.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.95));
    this.scene.add(new THREE.AmbientLight(0x333333));
    const dir = new THREE.DirectionalLight(0xffffff, 1.7);
    dir.position.set(4, 5, 3);
    this.scene.add(dir);

    this.object = SHAPES[this.name]();
    this.object.rotation.set(TILT_X, 0, LEAN_Z[this.name] || 0);
    this.scene.add(this.object);

    this.renderFrame();   // one static frame immediately
  }

  renderFrame() {
    this.object.rotation.y = this.t * 0.45;
    this.effect.render(this.scene, this.camera);
  }

  loop(now) {
    if (!this.running) return;
    const dt = this.lastNow ? (now - this.lastNow) / 1000 : 0;
    this.lastNow = now;
    this.t += Math.min(dt, 0.05);   // clamp so a background tab doesn't jump
    this.renderFrame();
    this.raf = requestAnimationFrame((n) => this.loop(n));
  }

  start() {
    if (this.running || REDUCED || document.hidden || !this.ready) return;
    this.running = true;
    this.lastNow = 0;
    this.raf = requestAnimationFrame((n) => this.loop(n));
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}

document.querySelectorAll("[data-shape]").forEach((el) => {
  el._shape = new ShapeView(el, el.dataset.shape);
});
