/* ============================================================================
   SPLIT-FLAP BOARD - behaviour
   1. SplitFlap  - one orchestrated character settle (load + on-enter)
   2. AsciiField - bounded monospace field: image halftone or rolling swell
                   (adapted from asciiswell.html: FPS cap + visibility gating)
   3. Deck       - keyboard nav, progress, deep links (deck.html only)
   Everything degrades to settled/static under prefers-reduced-motion.
   ========================================================================== */
"use strict";

// "?still" or "#still" freezes every entrance effect for screenshots / audits;
// prefers-reduced-motion does the same for real users.
const REDUCED =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  /(\?|&|#).*still/.test(location.href);

/* ---- 1. SplitFlap ------------------------------------------------------- */

const FLAP_POOL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ0123456789+-/.·%~→";

class SplitFlap {
  constructor(el) {
    this.el = el;
    this.target = (el.dataset.flap != null ? el.dataset.flap : el.textContent).toUpperCase();
    this.settled = false;
    this.el.textContent = "";
    this.el.setAttribute("aria-label", this.target);
    if (el.dataset.space !== undefined) el.setAttribute("data-space", "");

    // group cells into per-word spans so a wrap only breaks at a space
    let word = null;
    this.cells = Array.from(this.target).map((ch) => {
      if (ch === " " || !word) {
        word = document.createElement("span");
        word.className = "flap__word";
        this.el.appendChild(word);
      }
      const cell = document.createElement("span");
      cell.className = "flap__cell" + (ch === " " ? " flap__cell--space" : "");
      cell.setAttribute("aria-hidden", "true");
      cell.textContent = ch === " " ? " " : ch;
      word.appendChild(cell);
      if (ch === " ") word = null;
      return { node: cell, ch };
    });

    if (REDUCED) {
      this.settled = true;
    } else {
      for (const c of this.cells) if (c.ch !== " ") c.node.textContent = " ";
    }
  }

  settle(baseDelay = 0) {
    if (this.settled) return;
    this.settled = true;
    const stepMs = 30;
    this.cells.forEach((c, i) => {
      if (c.ch === " ") return;
      const ticks = 6 + ((i * 3) % 11);
      const startAt = baseDelay + i * 45;
      let n = 0;
      const tick = () => {
        if (n < ticks) {
          c.node.textContent = FLAP_POOL[(Math.random() * FLAP_POOL.length) | 0];
          c.node.classList.add("is-stepping");
          n++;
          setTimeout(tick, stepMs);
        } else {
          c.node.textContent = c.ch;
          c.node.classList.remove("is-stepping");
        }
      };
      setTimeout(tick, startAt);
    });
  }

  snap() {
    if (this.settled) return;
    this.settled = true;
    for (const c of this.cells) {
      c.node.textContent = c.ch;
      c.node.classList.remove("is-stepping");
    }
  }
}

function initFlaps() {
  const groups = new Map();
  const all = [];
  document.querySelectorAll(".flap").forEach((el) => {
    const flap = new SplitFlap(el);
    el._flap = flap;
    all.push(flap);
    const key = el.closest("[data-flap-group]") || document.body;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flap);
  });
  if (REDUCED) return;

  const run = (flaps) => {
    let d = 0;
    for (const f of flaps) { f.settle(d); d += 120; }
  };

  const heroGroup = document.querySelector('[data-flap-group="hero"]');
  if (heroGroup && groups.has(heroGroup)) {
    setTimeout(() => run(groups.get(heroGroup)), 240);
  }

  // trigger as a group's top edge enters; threshold 0 so a section taller
  // than the viewport still fires (0.35 never would)
  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (groups.has(e.target)) run(groups.get(e.target));
      obs.unobserve(e.target);
    }
  }, { threshold: 0, rootMargin: "0px 0px -18% 0px" });
  groups.forEach((_, id) => {
    if (id !== document.body && id !== heroGroup) io.observe(id);
  });

  // safety net: nothing stays invisible if an observer never fires
  setTimeout(() => { for (const f of all) f.snap(); }, 4000);
}

/* ---- 2. AsciiField --------------------------------------------------------- */

const RAMP = " .:-=+*#%@";

/* Compact 3D simplex noise (public-domain, after Stefan Gustavson) — the one
   dependency the "noise" field mode needs; every other mode is plain sines. */
const Simplex = (function () {
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],
    [1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
  ];
  const perm = new Uint8Array(512);
  (function seed(s) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let n = s >>> 0;
    const rnd = () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; };
    for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })(1337);
  const F3 = 1 / 3, G3 = 1 / 6;
  const dot3 = (g, x, y, z) => g[0] * x + g[1] * y + g[2] * z;
  function noise3(xin, yin, zin) {
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
      else               { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0)       { i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
      else if (x0 < z0)  { i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
      else               { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot3(grad3[perm[ii + perm[jj + perm[kk]]] % 12], x0, y0, z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot3(grad3[perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12], x1, y1, z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot3(grad3[perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12], x2, y2, z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * dot3(grad3[perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12], x3, y3, z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  return { noise3 };
})();

// data-ascii="cycle": loop these on a timer.  data-ascii="scroll": the mode is
// set from outside (initStage) as sections scroll past.  Either way a mode
// change value-crossfades over BLEND_MS (smoothstep), tunable via the Fade
// control.
const CYCLE_MODES = ["plasma", "drift", "swell"];
const CYCLE_MS = 5000;
const BLEND_MS = 1400;

class AsciiField {
  constructor(el) {
    this.el = el;
    this.mode = el.dataset.ascii || "swell";
    this.src = el.dataset.asciiSrc || null;
    this.cellW = +el.dataset.cellW || 8;
    this.cellH = +el.dataset.cellH || 15;
    this.fps = +el.dataset.fps || 24;
    this.speed = +el.dataset.speed || 0.32;
    this.cols = 0; this.rows = 0;
    this.clock = 0; this.last = 0; this.raf = null;
    this.cycleMs = 0; this.cycleIdx = 0; this.cycleDur = CYCLE_MS;
    this.activeMode = this.mode === "cycle" ? CYCLE_MODES[0]
      : (this.mode === "scroll" ? (el.dataset.animStart || "noise") : this.mode);
    this.fromMode = null; this.blendMs = 0; this.blendBase = BLEND_MS; this.blendDur = BLEND_MS;
    this.running = false; this.visible = true; this.tab = true;
    this.img = null; this.lum = null;

    const probe = document.createElement("canvas").getContext("2d");
    probe.font = this.cellH + "px " + getComputedStyle(el).fontFamily;
    this.advance = probe.measureText("M").width || this.cellW * 0.6;

    this.el.style.fontSize = this.cellH + "px";
    this.el.style.lineHeight = this.cellH + "px";
    this.el.style.letterSpacing = (this.cellW - this.advance) + "px";

    this.resize();
    if (this.src) {
      this.loadImage(this.src).then(() => { this.draw(); this.start(); });
    } else {
      this.draw();
      this.start();
    }
    this.bind();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    this.cols = Math.max(4, Math.ceil((r.width || window.innerWidth) / this.cellW) + 1);
    this.rows = Math.max(3, Math.ceil((r.height || 200) / this.cellH) + 1);
    if (this.img) this.rasterize();
  }

  loadImage(src) {
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => { this.img = im; this.rasterize(); res(); };
      im.onerror = () => res();
      im.src = src;
    });
  }

  rasterize() {
    if (!this.img) return;
    const c = document.createElement("canvas");
    c.width = this.cols; c.height = this.rows;
    const x = c.getContext("2d");
    const ir = this.img.width / this.img.height;
    const gr = this.cols / this.rows;
    let dw = this.cols, dh = this.rows, dx = 0, dy = 0;
    if (ir > gr) { dw = this.rows * ir; dx = (this.cols - dw) / 2; }
    else { dh = this.cols / ir; dy = (this.rows - dh) / 2; }
    x.drawImage(this.img, dx, dy, dw, dh);
    const d = x.getImageData(0, 0, this.cols, this.rows).data;
    this.lum = new Float32Array(this.cols * this.rows);
    for (let i = 0; i < this.cols * this.rows; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      // gamma-lift so mid-tones read as glyphs, not a grey wash
      let v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      v = Math.pow(v, 0.78);
      this.lum[i] = v;
    }
  }

  // Start a crossfade from the current mode to `name` (no-op if unchanged).
  setMode(name) {
    if (!name || name === this.activeMode) return;
    this.fromMode = this.activeMode;
    this.activeMode = name;
    this.blendMs = 0;
    this.blendDur = this.mode === "cycle"
      ? Math.min(this.blendBase, this.cycleDur * 0.6)
      : this.blendBase;
    if (REDUCED) { this.fromMode = null; this.draw(); }
  }

  sampleMode(mode, gx, gy) {
    switch (mode) {
      case "noise":   return this._noise(gx, gy);
      case "plasma":  return this._plasma(gx, gy);
      case "drift":   return this._drift(gx, gy);
      case "aurora":  return this._aurora(gx, gy);
      case "contour": return this._contour(gx, gy);
      default:        return this._swell(gx, gy);
    }
  }

  sample(gx, gy) {
    if (this.mode === "image" && this.lum) {
      const v = this.lum[gy * this.cols + gx] || 0;
      const s = 0.05 * Math.sin(gx * 0.4 + gy * 0.22 + this.clock * 1.6);
      return Math.min(1, Math.max(0, v + s));
    }
    const cur = this.sampleMode(this.activeMode, gx, gy);
    if (this.fromMode === null) return cur;
    const prev = this.sampleMode(this.fromMode, gx, gy);
    let k = this.blendMs / this.blendDur;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    k = k * k * (3 - 2 * k);           // smoothstep
    return prev + (cur - prev) * k;
  }

  // fractal Brownian motion over 3D simplex noise, time on the z axis
  _noise(gx, gy) {
    let freq = 0.055, amp = 1, sum = 0, norm = 0;
    const z = this.clock * 0.15;
    for (let o = 0; o < 3; o++) {
      sum += amp * Simplex.noise3(gx * freq, gy * freq, z);
      norm += amp; freq *= 2; amp *= 0.55;
    }
    return (sum / norm) * 0.5 + 0.5;
  }

  // classic demoscene plasma: summed offset sine waves
  _plasma(gx, gy) {
    const t = this.clock * 1.6;
    const cx = this.cols * 0.5, cy = this.rows * 0.5;
    const dist = Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy));
    let v = Math.sin(gx * 0.14 + t)
          + Math.sin(gy * 0.11 + t)
          + Math.sin((gx + gy) * 0.09 + t * 0.5)
          + Math.sin(dist * 0.16 - t);
    return v / 8 + 0.5;
  }

  // drift: two scrolling low-frequency sines multiplied -> soft clouds
  _drift(gx, gy) {
    const f = 0.04, s = this.clock * 0.4;
    const a = Math.sin(gx * f + s);
    const b = Math.sin(gy * f * 1.3 - s * 0.7);
    const c = Math.sin((gx + gy) * f * 0.5 + s * 0.4);
    return (a * b + c) * 0.35 + 0.5;
  }

  // swell: horizontal bands rolling upward, distorted by a slow wave
  _swell(gx, gy) {
    const y = gy * 0.10
      + Math.sin(gx * 0.035 + this.clock * 0.6) * 2.2
      + this.clock * 0.3;
    return 0.5 + 0.5 * Math.sin(y);
  }

  // aurora: vertical light curtains weaving slowly side to side
  _aurora(gx, gy) {
    const F = 0.05, SP = 0.5, t = this.clock;
    const weave = Math.sin(gx * F + t * SP) + Math.sin(gx * F * 0.5 - t * SP * 0.6);
    const band = gx / this.cols + weave * 0.06;
    return 0.5 + 0.5 * Math.sin(band * Math.PI * 5 - t * 0.3);
  }

  // contour: sum a few sines into a height field, glow its level lines
  _contour(gx, gy) {
    const f = 0.045, s = this.clock * 0.15;
    const h = Math.sin(gx * f + s)
      + Math.sin(gy * f * 1.1 - s * 0.8)
      + Math.sin((gx + gy) * f * 0.6 + s * 0.5);
    const band = h * 6;
    return 1 - Math.abs(band - Math.round(band)) * 2;
  }

  draw() {
    const max = RAMP.length - 1;
    const lines = new Array(this.rows);
    for (let gy = 0; gy < this.rows; gy++) {
      let line = "";
      for (let gx = 0; gx < this.cols; gx++) {
        let v = this.sample(gx, gy);
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        line += RAMP[(v * max + 0.5) | 0];
      }
      lines[gy] = line;
    }
    this.el.textContent = lines.join("\n");
  }

  loop(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = now - this.last;
    if (dt < 1000 / this.fps) return;
    this.last = now - (dt % (1000 / this.fps));
    this.clock += (dt / 1000) * this.speed;
    if (this.mode === "cycle") {
      this.cycleMs += dt;
      if (this.cycleMs >= this.cycleDur) {
        this.cycleMs = 0;
        this.cycleIdx = (this.cycleIdx + 1) % CYCLE_MODES.length;
        this.setMode(CYCLE_MODES[this.cycleIdx]);
      }
    }
    if (this.fromMode !== null) {
      this.blendMs += dt;
      if (this.blendMs >= this.blendDur) this.fromMode = null;
    }
    this.draw();
  }

  start() {
    if (this.running || REDUCED || !this.tab || !this.visible) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  bind() {
    document.addEventListener("visibilitychange", () => {
      this.tab = !document.hidden;
      this.tab ? this.start() : this.stop();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((e) => {
        this.visible = e[0].isIntersecting;
        this.visible ? this.start() : this.stop();
      }, { threshold: 0 }).observe(this.el);
    }
    let q = false;
    window.addEventListener("resize", () => {
      if (q) return; q = true;
      requestAnimationFrame(() => { q = false; this.resize(); this.draw(); });
    });
  }
}

function initAscii() {
  document.querySelectorAll(".ascii-field").forEach((el) => { el._ascii = new AsciiField(el); });
}

/* ---- 2b. Preview controls (index only) ----------------------------------- */

function initControls() {
  const bar = document.querySelector(".controls");
  if (!bar) return;
  const root = document.documentElement;

  const applySelect = (sel) => {
    if (sel.dataset.ctl === "accent" && sel.value) {
      root.style.setProperty("--live", sel.value);
      root.style.setProperty("--live-hover", `color-mix(in oklab, ${sel.value} 88%, #fff)`);
    }
  };

  bar.addEventListener("change", (e) => {
    const sel = e.target.closest("select");
    if (sel) applySelect(sel);
  });

  // honour whatever the markup marks as selected, on load
  bar.querySelectorAll("select").forEach(applySelect);
}

/* ---- 3. Deck ---------------------------------------------------------------- */

function initDeck() {
  const deck = document.querySelector(".deck");
  if (!deck) return;
  const slides = Array.from(deck.querySelectorAll(".slide"));
  const progress = document.querySelector(".deck-progress");
  const counters = document.querySelectorAll("[data-deck-counter]");
  let idx = 0;

  const clamp = (n) => Math.max(0, Math.min(slides.length - 1, n));
  const paint = () => {
    if (progress) progress.style.transform = "scaleX(" + ((idx + 1) / slides.length) + ")";
    const label = String(idx + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    counters.forEach((c) => { c.textContent = label; });
  };
  const go = (n, push = true) => {
    idx = clamp(n);
    // slides are cards with margins, so measure the real offset rather than
    // assuming a uniform slide height
    const top = deck.scrollTop
      + slides[idx].getBoundingClientRect().top
      - deck.getBoundingClientRect().top;
    deck.scrollTo({ top, behavior: REDUCED ? "auto" : "smooth" });
    paint();
    if (push && slides[idx].id) history.replaceState(null, "", "#" + slides[idx].id);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      idx = slides.indexOf(e.target);
      paint();
    }
  }, { threshold: 0.6 });
  slides.forEach((s) => io.observe(s));

  window.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(idx + 1); }
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(idx - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(slides.length - 1); }
  });

  const prev = document.querySelector("[data-deck-prev]");
  const next = document.querySelector("[data-deck-next]");
  if (prev) prev.addEventListener("click", () => go(idx - 1));
  if (next) next.addEventListener("click", () => go(idx + 1));

  if (location.hash) {
    const t = slides.findIndex((s) => "#" + s.id === location.hash);
    if (t >= 0) { idx = t; requestAnimationFrame(() => go(t, false)); return; }
  }
  paint();
}

/* ---- boot ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  initFlaps();
  initAscii();
  initControls();
  initDeck();
});
