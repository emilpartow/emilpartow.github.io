/* ==========================================================================
   Small, dependency-free canvas visualizations.
   - #flow, #flow-end         a Gaussian mixture density behind the hero, and again behind contact and footer
   - [data-viz="engression"]  a generative model of p(y | x), as in engression
   - [data-viz="kernel"]      Gaussian kernel score landscape over (μ, σ)
   - [data-viz="space"]       a spacecraft planning with and without its own uncertainty, 24 noisy flights each
   - [data-viz="autoresearch"] many agents around a shared memory, with and without context management
   Each canvas only animates while it is on screen.
   ========================================================================== */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const TAU = Math.PI * 2;

  /* ---------- colors from CSS custom properties ----------
     If this runs before the stylesheet has applied (it can happen on a quick reload when one
     file comes from the cache), the variables read as empty. Then fall back to the light
     palette and read again on load, so the drawings never end up in black and grey. */
  let C = {};
  const FALLBACK = { ink: "#111214", soft: "#4f525a", muted: "#6b6e75", line: "#e6e5e1", accent: "#0a7c5a", surface: "#ffffff" };
  let colorsReady = false;
  function readColors() {
    const s = getComputedStyle(root);
    const v = (n, k) => s.getPropertyValue(n).trim() || FALLBACK[k];
    colorsReady = s.getPropertyValue("--accent").trim() !== "";
    C = {
      ink: v("--ink", "ink"), soft: v("--ink-soft", "soft"), muted: v("--muted", "muted"), line: v("--line", "line"),
      accent: v("--accent", "accent"), surface: v("--surface", "surface"),
      font: getComputedStyle(document.body).fontFamily,
    };
  }
  readColors();

  /* ---------- tiny framework ---------- */
  const vizzes = [];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target.__viz;
      v.visible = e.isIntersecting;
      if (v.visible) v.dirty = true;
    }
  }, { rootMargin: "80px" });

  function makeViz(canvas, impl, target = canvas) {
    const v = {
      canvas, ctx: canvas.getContext("2d"), w: 0, h: 0,
      visible: false, dirty: true, hover: false, mx: 0.5, my: 0.5, lastInput: -1e9,
    };
    canvas.__viz = v;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      v.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      v.w = r.width; v.h = r.height; v.dpr = dpr;
      v.onResize && v.onResize();
      v.dirty = true;
    };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      v.mx = (e.clientX - r.left) / r.width;
      v.my = (e.clientY - r.top) / r.height;
      v.lastInput = performance.now() / 1000;
    };
    target.addEventListener("pointermove", (e) => { pos(e); v.hover = true; v.dirty = true; });
    target.addEventListener("pointerleave", () => { v.hover = false; v.dirty = true; });
    target.addEventListener("click", (e) => {
      if (target !== canvas && e.target.closest("a, button")) return;
      pos(e); v.onClick && v.onClick(v.mx, v.my); v.dirty = true;
    });

    impl(v);
    new ResizeObserver(resize).observe(canvas);
    io.observe(canvas);
    vizzes.push(v);
    return v;
  }

  function text(ctx, str, x, y, color, size = 11, align = "left") {
    ctx.font = `500 ${size}px ${C.font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randnFrom = (rnd) => () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(TAU * rnd());
  const randn = randnFrom(Math.random);

  // Marching squares: adds the level-L segments of a (nx+1)×(ny+1) grid to the current path
  function marching(ctx, vals, nx, ny, x0, y0, w, h, L) {
    const cw = w / nx, ch = h / ny, row = nx + 1;
    const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = vals[j * row + i], b = vals[j * row + i + 1];
      const d = vals[(j + 1) * row + i], c = vals[(j + 1) * row + i + 1];
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = x0 + i * cw, Y = y0 + j * ch;
      const top = [X + cw * (L - a) / (b - a), Y];
      const right = [X + cw, Y + ch * (L - b) / (c - b)];
      const bottom = [X + cw * (L - d) / (c - d), Y + ch];
      const left = [X, Y + ch * (L - a) / (d - a)];
      switch (idx) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 5: seg(top, right); seg(left, bottom); break;
        case 10: seg(left, top); seg(bottom, right); break;
      }
    }
  }


  /* ======================================================================
     HERO · a Gaussian mixture density behind the intro card
        f(x) = Σ_k w_k exp(−|x − μ_k(t)|² / 2σ_k²), the means on slow Lissajous orbits.
        It is computed once per grid cell into a tiny canvas, shown twice: scaled up smoothly
        (#flow) and pixelated (#flow-sharp). Scrolling (--p on .hero, set in main.js) shrinks
        the σ_k and quantizes the levels, and main.js cross-fades to the sharp copy, so the
        uncertainty contracts as you read on. A click pulls the components towards it;
        they swing back like damped springs.
        The same field closes the page behind contact and footer, already converged
        (sharp, p = 1) and with its own seed: makeField({ seed, p, sharp }).
     ====================================================================== */
  const makeField = ({ seed = 7, p: fixedP = null, sharp = null } = {}) => (v) => field(v, seed, fixedP, sharp);
  function field(v, seed, fixedP, sharp) {
    const CELL = 24, LEVELS = 5, FPS = 30;
    const rnd = mulberry32(seed);
    const comps = Array.from({ length: 8 }, (_, k) => {
      const ang = (k / 8) * TAU + rnd() * 0.5, r = 0.38 + rnd() * 0.2;
      return {
        cx: Math.cos(ang) * r * 1.25, cy: Math.sin(ang) * r * 0.8,
        rx: 0.05 + rnd() * 0.08, ry: 0.04 + rnd() * 0.06,
        fx: 0.04 + rnd() * 0.05, fy: 0.03 + rnd() * 0.05, ph: rnd() * TAU,
        s: 0.08 + rnd() * 0.06, w: 0.6 + rnd() * 0.4,
        ox: 0, oy: 0, vx: 0, vy: 0, // displacement from the orbit, and its velocity
      };
    });
    let nx = 1, ny = 1, img = null, heatT0 = -1e9, clock = 0, last = null, lastDraw = -1, lastP = -1;
    const hero = v.canvas.closest(".hero");
    const sctx = sharp && sharp.getContext("2d");
    const rgb = () => {
      const hx = C.accent.replace("#", ""), n = parseInt(hx.length === 3 ? hx.replace(/./g, "$&$&") : hx, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    let col = rgb();

    v.onResize = () => {
      nx = Math.max(8, Math.round(v.w / CELL)); ny = Math.max(6, Math.round(v.h / CELL));
      v.canvas.width = nx; v.canvas.height = ny; // one canvas pixel per cell
      if (sharp) { sharp.width = nx; sharp.height = ny; }
      img = v.ctx.createImageData(nx, ny);
      v.dirty = true;
    };
    v.onTheme = () => { col = rgb(); v.dirty = true; };
    v.heat = () => { heatT0 = v.t || 0; };
    v.onClick = (mx, my) => {
      const D = Math.max(v.w, v.h) / 2, x = (mx * v.w - v.w / 2) / D, y = (my * v.h - v.h / 2) / D;
      for (const c of comps) {
        const dx = x - (c.cx + c.ox), dy = y - (c.cy + c.oy), g = Math.exp(-(dx * dx + dy * dy) / 0.6);
        c.vx += 1.6 * dx * g; c.vy += 1.6 * dy * g;
      }
    };

    v.frame = (t) => {
      if (!img) return;
      const p = fixedP !== null ? fixedP : hero ? parseFloat(hero.style.getPropertyValue("--p")) || 0 : 0;
      if (p !== lastP) { v.dirty = true; lastP = p; }
      if (reduced && !v.dirty) return;
      if (!reduced && !v.dirty && t - lastDraw < 1 / FPS) return;
      const dt = last === null ? 0 : Math.min(0.1, t - last);
      last = t; lastDraw = t; v.dirty = false;
      const T = 1 + 5 * Math.exp(-(t - heatT0) / 2.2); // the Konami code heats the system, then it cools
      if (!reduced) clock += dt * T;

      const W = v.w, H = v.h, D = Math.max(W, H) / 2, spread = (1 + 0.35 * (T - 1)) * (1.9 - 0.9 * p);
      const mus = comps.map((c) => {
        c.vx += (-7 * c.ox - 3.2 * c.vx) * dt; c.vy += (-7 * c.oy - 3.2 * c.vy) * dt; // damped spring back to the orbit
        c.ox += c.vx * dt; c.oy += c.vy * dt;
        return [
          c.cx + c.ox + c.rx * Math.sin(TAU * c.fx * clock + c.ph),
          c.cy + c.oy + c.ry * Math.sin(TAU * c.fy * clock + 2 * c.ph),
          2 * (c.s * spread) ** 2, c.w,
        ];
      });
      const d = img.data, [r, g, b] = col;
      for (let j = 0; j < ny; j++) {
        const y = (((j + 0.5) / ny) * H - H / 2) / D;
        for (let i = 0; i < nx; i++) {
          const x = (((i + 0.5) / nx) * W - W / 2) / D;
          let f = 0;
          for (const [mx, my, s2, wk] of mus) { const dx = x - mx, dy = y - my; f += wk * Math.exp(-(dx * dx + dy * dy) / s2); }
          const fc = Math.min(1, f / 1.2), fq = Math.min(LEVELS, Math.floor(f * 5)) / LEVELS; // soft and stepped
          const o = (j * nx + i) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round((fc + (fq - fc) * p) * 0.42 * 255);
        }
      }
      v.ctx.putImageData(img, 0, 0);
      if (sctx) sctx.putImageData(img, 0, 0);
    };
  }

  /* ======================================================================
     01 · PROBABILISTIC REGRESSION · a generative model of p(y | x)
        As in engression: a model y = g(x, ε) turns noise ε ~ N(0, 1) into samples from the
        conditional distribution, which may be skewed and change shape with x (here
        g(x, ε) = f(x) + s(x)(ε + a(x)(ε² − 1)/√2)). Shown plainly: the data, the prediction
        (conditional median) and its 90% range (5% to 95% quantiles); on hover, the whole
        predicted distribution p(y | x) at that point.
     ====================================================================== */
  function engression(v) {
    const f = (x) => 0.55 * Math.sin(TAU * 0.85 * x + 0.3) + 0.25 * x;
    const s = (x) => 0.07 + 0.26 * x * x;
    const a = (x) => 0.42 * x;
    const g = (x, e) => f(x) + s(x) * (e + (a(x) * (e * e - 1)) / Math.SQRT2);
    const rnd = mulberry32(21), rn = randnFrom(rnd);
    const data = Array.from({ length: 110 }, () => { const x = rnd(); return [x, g(x, rn())]; });

    // conditional quantiles and densities by Monte Carlo, once
    const NX = 60, MC = 1500, eps = Float64Array.from({ length: MC }, rn);
    const grid = Array.from({ length: NX + 1 }, (_, i) => {
      const x = i / NX, ys = Float64Array.from(eps, (e) => g(x, e)).sort();
      return { x, ys, q: [0.05, 0.5, 0.95].map((p) => ys[Math.floor(p * (MC - 1))]) };
    });
    let lo = Infinity, hi = -Infinity;
    for (const c of grid) { lo = Math.min(lo, c.ys[Math.floor(0.01 * MC)]); hi = Math.max(hi, c.ys[Math.floor(0.985 * MC)]); }
    const span = hi - lo; lo -= 0.08 * span; hi += 0.08 * span;
    let pin = null; // on a touch screen there is no hover: a tap pins the predicted distribution there
    v.onClick = (mx) => { pin = pin !== null && Math.abs(pin - mx) < 0.04 ? null : mx; v.dirty = true; };

    v.frame = (t) => {
      if (reduced && !v.dirty) return;
      v.dirty = false;
      const { ctx, w, h } = v, pad = 18, top = pad + 16, bot = h - pad;
      const X = (x) => pad + x * (w - 2 * pad);
      const Y = (y) => bot - ((y - lo) / (hi - lo)) * (bot - top);
      ctx.clearRect(0, 0, w, h);

      // the 90% range, then the prediction itself
      ctx.beginPath();
      for (const c of grid) ctx.lineTo(X(c.x), Y(c.q[2]));
      for (let i = grid.length - 1; i >= 0; i--) ctx.lineTo(X(grid[i].x), Y(grid[i].q[0]));
      ctx.closePath(); ctx.fillStyle = C.accent; ctx.globalAlpha = 0.13; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink; ctx.globalAlpha = 0.6;
      for (const [x, y] of data) { ctx.beginPath(); ctx.arc(X(x), Y(y), 2.1, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      ctx.beginPath(); for (const c of grid) ctx.lineTo(X(c.x), Y(c.q[1])); ctx.stroke();

      // the conditional density at the pointer
      // legend
      const lgx = pad;
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(lgx, pad + 1); ctx.lineTo(lgx + 16, pad + 1); ctx.stroke();
      text(ctx, "prediction", lgx + 22, pad + 5, C.muted, 10);
      ctx.fillStyle = C.accent; ctx.globalAlpha = 0.18; ctx.fillRect(lgx + 86, pad - 4, 16, 10); ctx.globalAlpha = 1;
      text(ctx, "90% range", lgx + 108, pad + 5, C.muted, 10);
      ctx.fillStyle = C.ink; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(lgx + 173, pad + 1, 2.1, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      text(ctx, "data", lgx + 180, pad + 5, C.muted, 10);
      let label = "";
      const hx = v.hover ? v.mx : pin;
      if (hx !== null) {
        const c = grid[Math.round(Math.max(0, Math.min(1, (hx * w - pad) / (w - 2 * pad))) * NX)];
        const bw = 0.045 * span, NY = 70, dens = [];
        let mx = 0;
        for (let j = 0; j <= NY; j++) {
          const yv = lo + (j / NY) * (hi - lo);
          let d = 0;
          for (let k = 0; k < MC; k += 3) { const u = (yv - c.ys[k]) / bw; d += Math.exp(-0.5 * u * u); }
          dens.push([yv, d]); mx = Math.max(mx, d);
        }
        const x0 = X(c.x), W = Math.min(70, w * 0.16);
        ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0, bot); ctx.stroke();
        const body = dens.filter(([, d]) => d > 0.02 * mx); // leave out the tails that hug the axis
        const curve = () => { for (const [yv, d] of body) ctx.lineTo(x0 + (d / mx) * W, Y(yv)); };
        ctx.beginPath(); ctx.moveTo(x0, Y(body[0][0])); curve(); ctx.lineTo(x0, Y(body[body.length - 1][0])); ctx.closePath();
        ctx.globalAlpha = 0.18; ctx.fillStyle = C.accent; ctx.fill();
        ctx.beginPath(); curve(); // outline the density only, not the closing edge
        ctx.globalAlpha = 0.9; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.globalAlpha = 1;
        label = "predicted distribution here";
        text(ctx, label, Math.min(x0 + 6, w - pad - 150), top + 2, C.muted, 10);
      }
    };
  }

  /* ======================================================================
     02 · KERNEL SCORES · expected Gaussian kernel score of N(μ, σ²) vs. N(0, 1)
        D(μ,σ) = ½E k(X,X′) + ½E k(Y,Y′) − E k(X,Y)  (= ½ MMD², zero iff F = G)
     ====================================================================== */
  function kernel(v) {
    const G2 = 1; // squared kernel bandwidth γ²
    const D = (mu, s) => {
      const g = Math.sqrt(G2);
      return 0.5 * g / Math.sqrt(G2 + 2 * s * s) + 0.5 * g / Math.sqrt(G2 + 2)
        - (g / Math.sqrt(G2 + s * s + 1)) * Math.exp(-(mu * mu) / (2 * (G2 + s * s + 1)));
    };
    const MU = 2, SLO = 0.05, SHI = 2.5;
    const out = document.querySelector('[data-out="kernel"]');
    const rug = Array.from({ length: 36 }, randn);
    let rugT = 0, mu = 0.8, sig = 1.5;
    const pdf = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(TAU));

    // landscape values (μ horizontal, σ vertical, σ grows upwards)
    const NX = 60, NY = 50, vals = new Float32Array((NX + 1) * (NY + 1));
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      vals[j * (NX + 1) + i] = D(-MU + (2 * MU * i) / NX, SHI - ((SHI - SLO) * j) / NY);
    }
    const LEVELS = Array.from({ length: 10 }, (_, i) => 0.002 * Math.pow(1.75, i));

    v.frame = (t) => {
      if (v.hover) { mu = (v.mx - 0.5) * 2 * MU; sig = SLO + (1 - v.my) * (SHI - SLO); }
      else if (!reduced) { // a loop that passes the truth when wide and the far corners when narrow
        const a = t * 0.29 + 1.2;
        sig = Math.max(SLO, 1.05 + 1.0 * Math.sin(a)); mu = 2 * Math.sin(a / 2 - Math.PI / 4);
      }
      else if (!v.dirty) return;
      v.dirty = false;
      if (!reduced && t - rugT > 0.12) { rugT = t; rug[Math.floor(Math.random() * rug.length)] = randn(); }

      const { ctx, w, h } = v, pad = 18;
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 480, split = narrow ? w : w * 0.56; // on a phone: densities and bars only, full width

      // left: densities
      const lx = pad, lw = split - 2 * pad, base = h - pad - 8, top = pad + 44;
      const X = (x) => lx + ((x + 4) / 8) * lw;
      const peak = Math.max(pdf(0, 0, 1), pdf(mu, mu, sig));
      const Y = (p) => base - (p / Math.max(peak, 0.42)) * (base - top);
      ctx.beginPath(); ctx.moveTo(X(-4), base);
      for (let i = 0; i <= 160; i++) { const x = -4 + i / 20; ctx.lineTo(X(x), Y(pdf(x, 0, 1))); }
      ctx.lineTo(X(4), base); ctx.closePath();
      ctx.fillStyle = C.muted; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1.2; ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const x = -4 + i / 20; ctx.lineTo(X(x), Y(pdf(x, mu, sig))); }
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();

      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.55; ctx.beginPath();
      for (const y of rug) { if (Math.abs(y) < 4) { ctx.moveTo(X(y), base + 3); ctx.lineTo(X(y), base + 9); } }
      ctx.stroke(); ctx.globalAlpha = 1;
      text(ctx, "truth", X(0), Y(pdf(0, 0, 1)) - 6, C.muted, 10, "center");

      // right: score landscape (not on narrow canvases)
      const side = narrow ? 0 : Math.min(h - 2 * pad - 12, w - split - pad);
      const rx = w - pad - side, ry = pad;
      if (side > 0) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(rx, ry, side, side);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
      LEVELS.forEach((L, i) => {
        ctx.globalAlpha = 0.6 - i * 0.045;
        ctx.beginPath(); marching(ctx, vals, NX, NY, rx, ry, side, side, L); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      const PX = (m) => rx + ((m + MU) / (2 * MU)) * side;
      const PY = (s) => ry + ((SHI - s) / (SHI - SLO)) * side;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      const tx = PX(0), ty = PY(1);
      ctx.beginPath(); ctx.moveTo(tx - 4, ty); ctx.lineTo(tx + 4, ty); ctx.moveTo(tx, ty - 4); ctx.lineTo(tx, ty + 4); ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(PX(Math.max(-MU, Math.min(MU, mu))), PY(Math.max(SLO, Math.min(SHI, sig))), 4, 0, TAU); ctx.fill();
      text(ctx, "μ", rx + side / 2, ry + side + 12, C.muted, 10, "center");
      text(ctx, "σ", rx - 6, ry + side / 2 + 3, C.muted, 10, "right");
      }
      // the same forecast, two losses: the excess kernel score is bounded; the excess log-likelihood,
      // KL(N(0,1) ‖ N(μ,σ²)) = log σ + (1 + μ²)/(2σ²) − ½, grows without bound as σ → 0
      const kl = Math.log(sig) + (1 + mu * mu) / (2 * sig * sig) - 0.5, ks = D(mu, sig);
      const bx = lx + 88, B = Math.max(40, Math.min(220, lw - 88 - 52));
      const bar = (y, label, val, frac, col) => {
        text(ctx, label, lx, y + 8, C.muted, 10);
        ctx.fillStyle = C.line; ctx.fillRect(bx, y, B, 8);
        ctx.fillStyle = col; ctx.fillRect(bx, y, B * Math.min(1, frac), 8);
        if (frac > 1) { // off the scale
          ctx.beginPath(); ctx.moveTo(bx + B + 2, y - 2); ctx.lineTo(bx + B + 9, y + 4); ctx.lineTo(bx + B + 2, y + 10); ctx.fill();
        }
        text(ctx, val, bx + B + (frac > 1 ? 14 : 6), y + 8, col, 10);
      };
      bar(pad, "kernel score", `+${ks.toFixed(2)}`, ks / 0.6, C.accent);
      bar(pad + 18, "log-likelihood", `+${kl >= 100 ? kl.toFixed(0) : kl.toFixed(1)}`, kl / 6, kl > 6 ? C.ink : C.soft);

      if (out) out.textContent = `μ = ${mu.toFixed(2)}, σ = ${sig.toFixed(2)}`;
    };
  }

  /* ======================================================================
     03 · ROBUST APPLICATIONS · a spacecraft that plans with its own uncertainty
        Seen from above: a probe leaves Earth for a target past three asteroids. The ground
        station tracks it, less precisely the further away it is, so its position uncertainty
        σ grows along the way (small navigation errors add up). The naive route ignores σ and
        passes close; the robust route keeps about 3σ of clearance. Each route is flown 24
        times with smooth random deviations of spread σ; flights that touch a rock crash.
     ====================================================================== */
  function space(v) {
    const K = 24, SIGMAX = 0.024, R = 0.012, DUR = 6.5, H = 0.5625, NP = 140;
    const AST = [[0.40, 0.10, 0.075], [0.41, 0.46, 0.075], [0.66, 0.255, 0.07]]; // [x, y, radius]
    const EARTH = [0.0, 0.28, 0.085], PLANET = [0.947, 0.28, 0.02], ORBIT = 0.047; // the routes end on the orbit's left point
    const naivePlan = [[0.1, 0.28], [0.4, 0.28], [0.585, 0.34], [0.73, 0.345], [0.9, 0.28]];
    const robustPlan = [[0.1, 0.28], [0.4, 0.28], [0.52, 0.33], [0.62, 0.4], [0.74, 0.4], [0.9, 0.28]];
    const hit = (x, y) => y < -R || y > H + R || AST.some(([a, b, r]) => Math.hypot(x - a, y - b) < r + R);
    const resample = (plan, n) => { // points evenly spaced along the polyline, with unit normals
      const seg = plan.slice(1).map((p, i) => Math.hypot(p[0] - plan[i][0], p[1] - plan[i][1]));
      const L = seg.reduce((s, x) => s + x, 0), out = [];
      for (let k = 0; k <= n; k++) {
        let s = (k / n) * L, i = 0;
        while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
        const f = Math.min(1, s / seg[i]), a = plan[i], b = plan[i + 1];
        out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), (b[1] - a[1]) / seg[i], -(b[0] - a[0]) / seg[i]]);
      }
      return out;
    };
    const sigAt = (s) => SIGMAX * Math.pow(s, 0.85);
    const paths = [resample(naivePlan, NP), resample(robustPlan, NP)];
    const srnd = mulberry32(3);
    const stars = Array.from({ length: 90 }, () => ({ x: srnd(), y: srnd() * H, r: 0.5 + 1.3 * srnd() ** 2, a: 0.25 + 0.4 * srnd(), f: 0.6 + 1.8 * srnd(), ph: srnd() * TAU, bright: srnd() < 0.08 }));
    const rock = AST.map(() => Array.from({ length: 12 }, () => 0.85 + 0.3 * srnd())); // jagged outlines
    let runs = null, heroes = [], debris = [], t0 = null, seed = 100, crashT = null, arriveT = null, prevK = 0;

    function newRuns() {
      const rnd = mulberry32(seed++), rn = randnFrom(rnd);
      runs = paths.map((path) => Array.from({ length: K }, () => {
        const a = [rn(), rn(), rn()], f = [1 + rnd(), 2 + 2 * rnd(), 4 + 3 * rnd()], ph = [rnd(), rnd(), rnd()].map((x) => x * TAU);
        let crash = -1;
        const pts = path.map(([x, y, nx, ny], k) => {
          const s = k / NP;
          const off = (sigAt(s) / Math.sqrt(0.4525)) * (a[0] * Math.sin(f[0] * s * Math.PI + ph[0]) * 0.8 + a[1] * Math.sin(f[1] * s * Math.PI + ph[1]) * 0.45 + a[2] * Math.sin(f[2] * s * Math.PI + ph[2]) * 0.25) * Math.sin(Math.PI * Math.min(1, s * 1.15));
          const q = [x + nx * off, y + ny * off];
          if (crash < 0 && hit(q[0], q[1])) crash = k;
          return q;
        });
        return { pts, crash };
      }));
      // the two probes we follow: a naive flight that ends on a rock, a robust one that arrives
      heroes = [runs[0].find((r) => r.crash >= 0) || runs[0][0], runs[1].find((r) => r.crash < 0) || runs[1][0]];
      // pieces that fly off in the crash: [direction, speed (px/s), spin, length, width]
      debris = Array.from({ length: 9 }, (_, i) => [((i + rnd()) / 9) * TAU, 22 + 30 * rnd(), (rnd() - 0.5) * 9, 2 + 4 * rnd(), 1.2 + 1.3 * rnd()]);
      t0 = null; crashT = arriveT = null;
    }
    newRuns();
    v.onClick = () => { newRuns(); v.dirty = true; };

    v.frame = (t) => {
      if (t0 === null) t0 = t;
      const prog = reduced ? 1 : Math.min(1, ((t - t0) % (DUR + 2.5)) / DUR);
      const kk = Math.round(prog * NP);
      if (reduced && !v.dirty) return;
      if (!reduced && !v.dirty && t - (v.lastDraw || 0) < 1 / 30) return;
      v.lastDraw = t; v.dirty = false;
      if (kk < prevK) { crashT = arriveT = null; } // the flight starts over
      prevK = kk;

      const { ctx, w, h } = v, pad = 16;
      const S = Math.min(w - 2 * pad, (h - 2 * pad - 14) / H), ox = (w - S) / 2, oy = pad + 14 + (h - 2 * pad - 14 - H * S) / 2;
      const P = ([x, y]) => [ox + x * S, oy + y * S];
      ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, S, H * S); ctx.clip();

      // stars, twinkling; a few brighter ones as small crosses
      ctx.fillStyle = C.muted; ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
      for (const st of stars) {
        const [px, py] = P([st.x, st.y]);
        ctx.globalAlpha = st.a * (reduced ? 1 : 0.6 + 0.4 * Math.sin(t * st.f + st.ph));
        if (st.bright) { ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py); ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(px, py, st.r, 0, TAU); ctx.fill(); }
      }

      // bodies as pixel discs: Earth, the target, and the asteroids with jagged rims
      const cell = 1 / 64, cs = cell * S;
      const disc = (cx, cy, r, inside, col, alpha) => {
        ctx.fillStyle = col;
        for (let x = Math.floor((cx - r) / cell) * cell; x < cx + r; x += cell) for (let y = Math.floor((cy - r) / cell) * cell; y < cy + r; y += cell) {
          const mx = x + cell / 2, my = y + cell / 2;
          if (!inside(mx - cx, my - cy)) continue;
          ctx.globalAlpha = alpha(mx - cx, my - cy);
          const [px, py] = P([x, y]); ctx.fillRect(px + 0.6, py + 0.6, cs - 1.2, cs - 1.2);
        }
      };
      disc(EARTH[0], EARTH[1], EARTH[2], (dx, dy) => Math.hypot(dx, dy) < EARTH[2], C.accent,
        (dx, dy) => 0.22 + 0.25 * (Math.sin(dx * 60) * Math.cos(dy * 45 + 1) > 0.15 ? 1 : 0));
      disc(PLANET[0], PLANET[1], PLANET[2], (dx, dy) => Math.hypot(dx, dy) < PLANET[2], C.ink, () => 0.22);
      { // the target orbit
        const [cx, cy] = P(PLANET);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(cx, cy, ORBIT * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      AST.forEach(([ax, ay, r], i) => {
        const rim = (dx, dy) => { const ang = (Math.atan2(dy, dx) + Math.PI) / TAU * 12, j = Math.floor(ang) % 12, f = ang - Math.floor(ang);
          return r * (rock[i][j] * (1 - f) + rock[i][(j + 1) % 12] * f); };
        disc(ax, ay, r * 1.2, (dx, dy) => Math.hypot(dx, dy) < rim(dx, dy), C.ink, (dx, dy) => (Math.hypot(dx, dy) < 0.55 * r ? 0.26 : 0.16));
      });
      ctx.globalAlpha = 1;

      // the ground station and its signal
      const [gx, gy] = P([EARTH[0] + EARTH[2], EARTH[1]]);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(gx - 4, gy + 4); ctx.lineTo(gx + 4, gy + 4); ctx.lineTo(gx, gy - 5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
      for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.5 - i * 0.12; ctx.beginPath(); ctx.arc(gx, gy - 2, 7 * i, -0.6, 0.6); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // error propagation: the 2σ position uncertainty along the robust route
      ctx.fillStyle = C.accent; ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
      for (let k = 0; k <= NP; k += 7) {
        const [cx, cy] = P(paths[1][k]), r = Math.max(R, 2 * sigAt(k / NP)) * S;
        ctx.globalAlpha = 0.045; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.16; ctx.stroke();
      }

      // planned routes
      [[naivePlan, C.muted], [robustPlan, C.accent]].forEach(([plan, col]) => {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
        ctx.beginPath(); plan.forEach((p) => ctx.lineTo(...P(p))); ctx.stroke();
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      // all flights so far, their crashes, and the two probes we follow
      runs.forEach((set, m) => {
        const col = m ? C.accent : C.muted;
        for (const { pts, crash } of set) { // the other flights, faint; the ones that hit a rock simply end there
          const end = crash >= 0 ? Math.min(kk, crash) : kk;
          ctx.strokeStyle = col; ctx.globalAlpha = m ? 0.28 : 0.35; ctx.lineWidth = 1;
          ctx.beginPath(); for (let k = 0; k <= end; k++) ctx.lineTo(...P(pts[k])); ctx.stroke();
        }
        const hero = heroes[m], crashed = hero.crash >= 0 && kk >= hero.crash, arrived = !crashed && kk >= NP;
        if (crashed && crashT === null) crashT = t;
        if (arrived && arriveT === null) arriveT = t;
        const kh = crashed ? hero.crash : Math.min(kk, NP);
        let [rx, ry] = P(hero.pts[kh]);
        const [qx, qy] = P(hero.pts[Math.max(0, kh - 2)]);
        let ang = Math.atan2(ry - qy, rx - qx);
        if (arrived) { // in orbit: circle the planet, starting from the insertion point on the left
          const th = Math.PI + (reduced ? 0.6 : (t - arriveT) * 1.1), [cx, cy] = P(PLANET);
          rx = cx + Math.cos(th) * ORBIT * S; ry = cy + Math.sin(th) * ORBIT * S;
        }
        const b = R * S;
        ctx.globalAlpha = arrived ? 0.06 : 0.14; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rx, ry, Math.max(R, 2 * sigAt(kh / NP)) * (arrived ? 0.5 : 1) * S, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;

        if (crashed) {
          const age = reduced ? 1.2 : t - crashT;
          // flash
          if (age < 0.5) {
            ctx.globalAlpha = 1 - age / 0.5; ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(rx, ry, b * (1.5 + 6 * age), 0, TAU); ctx.fill(); ctx.stroke();
          }
          // debris flying apart and fading
          ctx.fillStyle = C.ink;
          for (const [dir, sp, spin, len, wid] of debris) {
            const d = sp * age * (1 - 0.25 * Math.min(age, 1.6));
            ctx.globalAlpha = Math.max(0, 1 - age / 2.2);
            ctx.save(); ctx.translate(rx + Math.cos(dir) * d, ry + Math.sin(dir) * d); ctx.rotate(spin * age);
            ctx.fillRect(-len / 2, -wid / 2, len, wid); ctx.restore();
          }
          // the broken body tumbles on, slowing down
          const drift = 10 * (1 - Math.exp(-age));
          ctx.globalAlpha = 1; ctx.save(); ctx.translate(rx + Math.cos(ang) * drift, ry + Math.sin(ang) * drift); ctx.rotate(ang + 4 * (1 - Math.exp(-age)));
          ctx.fillStyle = C.ink; ctx.fillRect(-b * 0.7, -b * 0.7, b * 1.4, b * 1.4);
          ctx.fillRect(-b * 0.25, b * 0.7, b * 0.5, b * 0.6); // a stub of one panel
          ctx.restore();
          if (age > 0.25) text(ctx, "crash", rx + b * 2.7, ry - b * 1.8, C.ink, 11);
          return;
        }

        // in orbit: unfold the panels, raise the antenna (pointing at the planet), and fly along the orbit
        let span = 1, dish = 0;
        if (arrived) {
          const u = reduced ? 1 : Math.min(1, (t - arriveT) / 0.9), e = 1 - (1 - u) ** 3;
          const [cx, cy] = P(PLANET);
          ang = Math.atan2(cy - ry, cx - rx); // antenna faces the planet, panels along the orbit
          span = 1 + 1.4 * e; dish = e;
          const pu = reduced ? 1 : Math.min(1, (t - arriveT) / 1.2);
          ctx.globalAlpha = 0.5 * (1 - pu); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, (ORBIT + 0.06 * pu) * S, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(ang);
        ctx.fillStyle = col; ctx.globalAlpha = 0.85;
        const pl = b * 1.2 * span;
        ctx.fillRect(-b * 0.35, -b * 0.7 - pl, b * 0.7, pl); ctx.fillRect(-b * 0.35, b * 0.7, b * 0.7, pl);
        if (span > 1.05) { // panel segments, visible once they unfold
          ctx.globalAlpha = 1; ctx.strokeStyle = C.surface; ctx.lineWidth = 1;
          for (let k = 1; k < 3; k++) {
            const o = b * 0.7 + (pl * k) / 3;
            ctx.beginPath(); ctx.moveTo(-b * 0.35, -o); ctx.lineTo(b * 0.35, -o); ctx.moveTo(-b * 0.35, o); ctx.lineTo(b * 0.35, o); ctx.stroke();
          }
        }
        if (dish > 0) { // antenna
          ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(b * 0.7, 0); ctx.lineTo(b * (0.7 + 1.1 * dish), 0); ctx.stroke();
          ctx.beginPath(); ctx.arc(b * (0.95 + 1.1 * dish), 0, b * 0.55 * dish, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = C.surface; ctx.strokeStyle = col; ctx.lineWidth = 1.8;
        ctx.fillRect(-b * 0.7, -b * 0.7, b * 1.4, b * 1.4); ctx.strokeRect(-b * 0.7, -b * 0.7, b * 1.4, b * 1.4);
        ctx.restore();
      });
      ctx.restore();
      ctx.globalAlpha = 1;

      const [tx, ty] = P([PLANET[0], PLANET[1] + ORBIT]);
      text(ctx, "ground station", gx - 2, gy + 18, C.muted, 10);
      text(ctx, "target orbit", tx, ty + 14, C.muted, 10, "center");
      // legend
      [[C.muted, "naive route"], [C.accent, "robust route"]].forEach(([col, label], i) => {
        const lx = 18 + i * 112;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(lx, 19); ctx.lineTo(lx + 18, 19); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, label, lx + 24, 23, C.muted, 10);
      });
    };
  }

  /* ======================================================================
     04 · AUTORESEARCH · many agents, with and without context management
     ====================================================================== */
  function autoresearch(v) {
    // A schematic of many agents around a shared memory, run twice. Each round, the agents send
    // their results to the middle and get context back. Without context management everything
    // is kept and handed to everyone: the memory overflows, every agent's context fills up with
    // noise, and the best result stalls. With it, an orchestrator keeps a few good results,
    // drops the rest, and hands each agent a short, relevant context: progress continues.
    const NA = 8, ROUND = 2.2, ROUNDS = 12;
    let t0 = null;
    v.onClick = () => { t0 = null; v.dirty = true; };
    const best = (managed, r) => (managed ? 0.95 * (1 - Math.exp(-r / 5)) : 0.2 * (1 - Math.exp(-r / 1.5)));

    v.frame = (t) => {
      if (t0 === null) t0 = t;
      if (reduced && !v.dirty) return;
      if (!reduced && !v.dirty && t - (v.lastDraw || 0) < 1 / 30) return;
      v.lastDraw = t; v.dirty = false;
      const el = reduced ? ROUND * 9.5 : (t - t0) % (ROUND * (ROUNDS + 1));
      const r = Math.min(ROUNDS, Math.floor(el / ROUND)), ph = (el % ROUND) / ROUND;

      const { ctx, w, h } = v, pad = 14, top = pad + 18, gap = 18;
      const side = Math.min(h - top - pad - 26, (w - 2 * pad - gap) / 2);
      const x0s = [(w - 2 * side - gap) / 2, (w - 2 * side - gap) / 2 + side + gap];
      ctx.clearRect(0, 0, w, h);

      [false, true].forEach((managed, k) => {
        const cx = x0s[k] + side / 2, cy = top + side / 2, ring = side * 0.34;
        const col = managed ? C.accent : C.muted;
        // how full and how relevant each agent's context is after r rounds
        const fill = managed ? 0.45 : Math.min(1, 0.12 + r / 6);
        const useful = managed ? 0.9 : Math.max(0.08, 1 / (1 + 0.7 * r));
        const lost = !managed && fill >= 1; // context full of noise: the agents go in circles
        const notes = managed ? Math.min(5, r) : 6 * r; // what the shared memory holds

        // spokes first, so the memory box sits on top of them
        ctx.strokeStyle = C.line; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
        for (let a = 0; a < NA; a++) {
          const an = (a / NA) * TAU - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * ring, cy + Math.sin(an) * ring); ctx.lineTo(cx, cy); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // the shared memory in the middle
        const bw = side * 0.26, bh = side * 0.2;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.surface;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 4); else ctx.rect(cx - bw / 2, cy - bh / 2, bw, bh); ctx.fill(); ctx.stroke();
        const lineGap = 3.2, fit = Math.floor((bh - 6) / lineGap);
        for (let i = 0; i < notes; i++) {
          const inside = i < fit, y = inside ? cy + bh / 2 - 4 - i * lineGap : cy - bh / 2 - 3 - (i - fit) * 2.2;
          const wid = (bw - 10) * (0.55 + 0.45 * ((i * 37) % 10) / 10);
          ctx.globalAlpha = inside ? 0.9 : Math.max(0.15, 0.6 - (i - fit) * 0.02);
          ctx.fillStyle = managed ? C.accent : C.muted;
          if (y > top - 4) ctx.fillRect(cx - wid / 2, y, wid, 1.6);
        }
        ctx.globalAlpha = 1;
        text(ctx, "memory", cx, cy + bh / 2 + 11, C.muted, 9, "center");

        // agents in a ring, each with a context bar
        for (let a = 0; a < NA; a++) {
          const an = (a / NA) * TAU - Math.PI / 2, ax = cx + Math.cos(an) * ring, ay = cy + Math.sin(an) * ring;
          // messages: results inward in the first half of a round, context outward in the second
          if (!reduced && r < ROUNDS) {
            const inward = ph < 0.45, u = inward ? ph / 0.45 : ph > 0.55 ? (ph - 0.55) / 0.45 : null;
            if (u !== null) {
              const e = u * u * (3 - 2 * u), fx = inward ? ax : cx, fy = inward ? ay : cy, tx = inward ? cx : ax, ty = inward ? cy : ay;
              const kept = managed ? (a + r) % 3 === 0 : true; // the orchestrator keeps only some results
              const good = managed && (inward ? kept : true);
              ctx.fillStyle = good ? C.accent : C.muted;
              ctx.globalAlpha = inward && !kept && u > 0.7 ? (1 - u) / 0.3 : lost ? 0.5 : 0.9;
              const size = !inward && !managed ? 1.8 + 2.2 * fill : 2.2;
              ctx.beginPath(); ctx.arc(fx + (tx - fx) * e, fy + (ty - fy) * e, size, 0, TAU); ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
          ctx.fillStyle = C.surface; ctx.strokeStyle = lost ? C.muted : col; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(ax, ay, 6, 0, TAU); ctx.fill(); ctx.stroke();
          if (lost) { ctx.fillStyle = C.muted; ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, TAU); ctx.fill(); }
          // context bar, outside the ring
          const bx = cx + Math.cos(an) * (ring + 13) - 2.5, by = cy + Math.sin(an) * (ring + 13) - 8, H = 16;
          ctx.strokeStyle = lost ? C.ink : C.line; ctx.lineWidth = 1; ctx.strokeRect(bx, by, 5, H);
          const fu = fill * useful, fn = fill - fu;
          ctx.fillStyle = C.accent; ctx.fillRect(bx, by + H * (1 - fu), 5, H * fu);
          ctx.fillStyle = C.muted; ctx.globalAlpha = 0.7; ctx.fillRect(bx, by + H * (1 - fu - fn), 5, H * fn); ctx.globalAlpha = 1;
        }

        text(ctx, managed ? "managed context" : "no context management", x0s[k], 23, col, 10);
        const b = best(managed, r);
        text(ctx, `best result +${b.toFixed(2)}${!managed && r > 4 ? ", stuck" : ""}`, x0s[k], top + side + 20, managed ? C.accent : C.muted, 10);
      });
      text(ctx, `round ${r}`, w - 18, 23, C.muted, 10, "right");
    };
  }

  /* ---------- boot ---------- */
  const flow = document.getElementById("flow"), flowEnd = document.getElementById("flow-end");
  const hero = flow ? makeViz(flow, makeField({ seed: 7, sharp: document.getElementById("flow-sharp") }), flow.closest(".hero")) : null;
  if (flowEnd) makeViz(flowEnd, makeField({ seed: 19, p: 1 }), flowEnd.closest(".outro"));
  const kinds = { engression, kernel, space, autoresearch };
  document.querySelectorAll("canvas[data-viz]").forEach((c) => kinds[c.dataset.viz] && makeViz(c, kinds[c.dataset.viz]));

  const recolor = () => {
    readColors();
    for (const v of vizzes) { v.dirty = true; v.onTheme && v.onTheme(); }
  };
  window.addEventListener("themechange", recolor);
  window.addEventListener("load", recolor); // the stylesheet has certainly applied by now
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", recolor);

  function loop(now) {
    requestAnimationFrame(loop);
    const t = now / 1000;
    if (!colorsReady) recolor();
    for (const v of vizzes) {
      v.t = t;
      if (!v.visible || !v.w) continue;
      try { v.frame(t); } catch (err) { v.visible = false; console.error(err); } // one broken canvas must not stop the rest
    }
  }
  requestAnimationFrame(loop);

  // hooks for the easter eggs in main.js
  window.EP = { heat: () => hero && hero.heat && hero.heat() };
})();
