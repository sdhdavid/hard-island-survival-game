'use strict';
// ------------------------------------------------------------
//  Terrain painter + procedural sprites + item icons
// ------------------------------------------------------------
(function () {
  const T = I.terrain = {};
  // cozy diorama palette
  const C = {
    sand: [243, 226, 176], sandHi: [249, 236, 198], sandWet: [222, 200, 148], sandUnder: [222, 206, 158], deep: [70, 150, 168],
    grass: [143, 203, 94], forest: [118, 184, 80], dry: [196, 208, 118],
    rock: [222, 214, 198], rockDark: [196, 188, 172], algae: [96, 122, 58], wetRock: [160, 152, 138],
  };
  const FACE = { // [top, bottom] colours of the exposed terrace walls
    grass: [[190, 120, 66], [142, 82, 46]], sand: [[218, 190, 134], [184, 152, 102]], rock: [[184, 176, 160], [138, 130, 118]],
  };
  const TH = [11.5, 27, 45, 66, 88]; // terrace levels
  const F = 9;                         // wall height (px = world units)
  T.C = C; T.TH = TH;

  function makeTile(seed, blur) {
    const r = I.rng(seed), a = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) a[i] = r() * 2 - 1;
    for (let p = 0; p < blur; p++) {
      const b = new Float32Array(65536);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        let s = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) s += a[((y + oy) & 255) * 256 + ((x + ox) & 255)];
        b[y * 256 + x] = s / 9;
      }
      for (let i = 0; i < 65536; i++) a[i] = b[i];
    }
    let mx = 0; for (let i = 0; i < 65536; i++) mx = Math.max(mx, Math.abs(a[i]));
    for (let i = 0; i < 65536; i++) a[i] /= mx;
    return a;
  }
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  T.build = async function (progress) {
    const w = I.world, { GW, GH, CELL, W, H } = w;
    const N = GW * GH;
    // ---- pass 1: base colour and terrace height per cell
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), he = new Float32Array(N);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
      const v = w.h[i], m = w.mat[i];
      const gxh = (w.h[i + (gx < GW - 1 ? 1 : 0)] - w.h[i - (gx > 0 ? 1 : 0)]) / (2 * CELL);
      const gyh = (w.h[i + (gy < GH - 1 ? GW : 0)] - w.h[i - (gy > 0 ? GW : 0)]) / (2 * CELL);
      const n1 = I.fbm(x / 320, y / 320, 3);
      let c;
      if (m === 0) {
        c = I.mix3(C.sand, C.sandHi, I.clamp(0.5 + n1, 0, 1) * 0.7);
        c = I.mix3(C.sandWet, c, I.smooth(1, 7, v));
        if (v < 0) c = I.mix3(C.sandUnder, C.deep, I.smooth(-1, -28, v));
      } else if (m === 3) {
        c = I.mix3(C.rock, C.rockDark, I.clamp(0.5 + n1 * 1.2, 0, 1));
        if (v < 6.4 && v > 2.2) c = I.mix3(c, C.algae, 0.8 * I.smooth(2.2, 3.2, v) * I.smooth(6.4, 5.6, v));
        if (v <= 2.6 && v > -6) c = I.mix3(c, C.wetRock, 0.7);
        if (v < -6) c = I.mix3(c, C.deep, I.smooth(-6, -26, v));
      } else if (m === 4) {
        c = I.mix3(C.dry, C.grass, I.clamp(0.45 + n1, 0, 1) * 0.6);
      } else {
        c = I.mix3(C.grass, [154, 210, 102], I.clamp(0.5 + n1 * 1.4, 0, 1));
        c = I.mix3(c, C.forest, I.smooth(0.3, 0.8, w.forest[i]) * 0.8);
        if (v > 56) c = I.mix3(c, C.dry, I.smooth(56, 76, v) * 0.45);
      }
      // a whisper of hillshade so the land still reads as shaped
      const sh = I.clamp(1 + (gxh + gyh) * 0.707 * 0.3, 0.92, 1.08);
      const sd = w.streamD[i];
      if (sd < 20 && v > 0 && m !== 0) c = I.mix3(c, [110, 170, 86], I.smooth(20, 8, sd) * 0.5);
      cr[i] = c[0] * sh; cg[i] = c[1] * sh; cb[i] = c[2] * sh;
      he[i] = v + I.fbm(x / 230 + 11, y / 230, 2) * 5;
    }
    const tA = makeTile(11, 2);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const tier = new Uint8Array(W * H);
    const ROWS = 140;
    // ---- pass 2: per-pixel colour and terrace level
    for (let y0 = 0; y0 < H; y0 += ROWS) {
      for (let y = y0; y < Math.min(H, y0 + ROWS); y++) {
        let fy = y / CELL - 0.5; if (fy < 0) fy = 0; if (fy > GH - 1.001) fy = GH - 1.001;
        const gy = fy | 0, ty = fy - gy;
        for (let x = 0; x < W; x++) {
          let fx = x / CELL - 0.5; if (fx < 0) fx = 0; if (fx > GW - 1.001) fx = GW - 1.001;
          const gx = fx | 0, tx = fx - gx, i = gy * GW + gx;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const hh = he[i] * w00 + he[i + 1] * w10 + he[i + GW] * w01 + he[i + GW + 1] * w11;
          let t = 0; while (t < 5 && hh > TH[t]) t++;
          const p = y * W + x;
          tier[p] = t;
          const lift = 1 + (t > 1 ? (t - 1) * 0.022 : 0);
          const n = tA[(x & 255) | ((y & 255) << 8)] * 1.6;
          const o = p * 4;
          d[o] = (cr[i] * w00 + cr[i + 1] * w10 + cr[i + GW] * w01 + cr[i + GW + 1] * w11) * lift + n;
          d[o + 1] = (cg[i] * w00 + cg[i + 1] * w10 + cg[i + GW] * w01 + cg[i + GW + 1] * w11) * lift + n;
          d[o + 2] = (cb[i] * w00 + cb[i + 1] * w10 + cb[i + GW] * w01 + cb[i + GW + 1] * w11) * lift + n * 0.8;
          d[o + 3] = 255;
        }
      }
      if (progress) progress(0.15 + 0.4 * (y0 / H));
      await yieldUI();
    }
    // ---- pass 3: terrace walls (south-facing), grass lips, rims and contact shadows
    const lipAt = x => 2 + 1.7 * (0.5 + 0.5 * Math.sin(x * 0.45 + Math.sin(x * 0.11) * 2.5));
    for (let y0 = 0; y0 < H; y0 += ROWS) {
      for (let y = Math.max(1, y0); y < Math.min(H - 2, y0 + ROWS); y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x, t = tier[p], o = p * 4;
          // first higher terrace above this pixel
          let k = 0;
          for (let j = 1; j <= F + 6 && j <= y; j++) if (tier[p - j * W] > t) { k = j; break; }
          if (k && k <= F) {
            const mi = w.mat[w.idx(x, y - k)];
            const pair = mi === 3 ? FACE.rock : mi === 0 ? FACE.sand : FACE.grass;
            const f = (k - 1) / (F - 1);
            let r = I.lerp(pair[0][0], pair[1][0], f), g = I.lerp(pair[0][1], pair[1][1], f), b = I.lerp(pair[0][2], pair[1][2], f);
            if ((y & 3) === 0) { r *= 0.95; g *= 0.95; b *= 0.95; }
            const lip = lipAt(x);
            if (mi !== 3 && mi !== 0 && k <= lip) {
              const base = mi === 4 ? [176, 196, 104] : [122, 186, 80];
              const e = k > lip - 1 ? 0.8 : 1;
              r = base[0] * e; g = base[1] * e; b = base[2] * e;
            }
            d[o] = r; d[o + 1] = g; d[o + 2] = b;
            continue;
          }
          if (k > F) { // soft contact shadow at the foot of a wall
            const s = 1 - 0.2 * (1 - (k - F) / 7);
            d[o] *= s; d[o + 1] *= s; d[o + 2] *= s;
          }
          // crisp sunlit rim along the top edge of a terrace, soft outline on its back & sides
          if (tier[p + W] < t || tier[p + 2 * W] < t) { d[o] = Math.min(255, d[o] * 1.07 + 6); d[o + 1] = Math.min(255, d[o + 1] * 1.07 + 6); d[o + 2] = Math.min(255, d[o + 2] * 1.05 + 4); }
          else if (tier[p - W] < t || tier[p - 1] < t || tier[p + 1] < t) { d[o] *= 0.9; d[o + 1] *= 0.9; d[o + 2] *= 0.9; }
        }
      }
      if (progress) progress(0.55 + 0.2 * (y0 / H));
      await yieldUI();
    }
    ctx.putImageData(img, 0, 0);
    T.tier = (x, y) => tier[(I.clamp(y | 0, 0, H - 1)) * W + I.clamp(x | 0, 0, W - 1)];
    decorate(ctx);
    if (progress) progress(0.8);
    await yieldUI();
    T.canvas = cv;
    buildSprites();
    buildIcons();
    if (progress) progress(0.95);
  };

  function decorate(ctx) {
    const w = I.world, R = I.rng(99);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // --- wrack line of dried seaweed at the high-water mark (a quiet hint of the tide)
    for (let k = 0; k < 2600; k++) {
      const x = 400 + R() * 1700, y = 1300 + R() * 520;
      const v = w.hAt(x, y);
      if (w.matAt(x, y) !== 0 || v < 5.6 || v > 6.6) continue;
      ctx.fillStyle = R() < 0.5 ? 'rgba(120,128,72,0.5)' : 'rgba(150,130,84,0.45)';
      ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 3);
      ctx.beginPath(); ctx.ellipse(0, 0, 2 + R() * 3, 0.8, 0, 0, I.TAU); ctx.fill(); ctx.restore();
    }
    // --- sand ripples & shells
    for (let k = 0; k < 1800; k++) {
      const x = 380 + R() * 1750, y = 300 + R() * 1520;
      const v = w.hAt(x, y);
      if (w.matAt(x, y) !== 0 || v < 0.5 || v > 11) continue;
      if (R() < 0.75) {
        ctx.strokeStyle = 'rgba(255,250,232,0.4)';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x, y - 2 + R() * 4, x + 6 + R() * 4, y + R() * 2 - 1); ctx.stroke();
      } else {
        ctx.fillStyle = ['#fffaf0', '#f7d9c8', '#f2c6b4', '#fbeede'][Math.floor(R() * 4)];
        ctx.beginPath(); ctx.ellipse(x, y, 1.5 + R(), 1.1 + R() * 0.6, R() * 3, 0, I.TAU); ctx.fill();
      }
    }
    // --- little grass tufts (sparse, like a tidy diorama)
    for (let k = 0; k < 9000; k++) {
      const x = 360 + R() * 1760, y = 280 + R() * 1560;
      const m = w.matAt(x, y);
      if (m !== 1 && m !== 2 && m !== 4) continue;
      if (w.pathAt(x, y) < 10 || w.hAt(x, y) < 12) continue;
      const s = 2.2 + R() * 2;
      ctx.strokeStyle = m === 4 ? 'rgba(214,222,140,0.9)' : (m === 2 ? 'rgba(150,206,104,0.85)' : 'rgba(178,224,124,0.9)');
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, y); ctx.lineTo(x - 2.2, y - s * 0.8);
      ctx.moveTo(x, y); ctx.lineTo(x, y - s);
      ctx.moveTo(x + 1.4, y); ctx.lineTo(x + 2.4, y - s * 0.75);
      ctx.stroke();
    }
    // --- flowers
    for (let k = 0; k < 1500; k++) {
      const x = 400 + R() * 1700, y = 300 + R() * 1500;
      const m = w.matAt(x, y);
      if (m !== 1 || w.pathAt(x, y) < 10 || w.hAt(x, y) < 12) continue;
      if (I.fbm(x / 120, y / 120) < 0.05) continue;
      const col = ['#fffaf0', '#ffe27a', '#ffb3c7', '#d7b8ff'][Math.floor(R() * 4)];
      ctx.fillStyle = col;
      for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(x + Math.cos(q * 1.57) * 1.1, y + Math.sin(q * 1.57) * 1.1, 0.9, 0, I.TAU); ctx.fill(); }
      ctx.fillStyle = '#f4b03c'; ctx.beginPath(); ctx.arc(x, y, 0.7, 0, I.TAU); ctx.fill();
    }
    // --- soft rock speckles
    for (let k = 0; k < 3000; k++) {
      const x = 300 + R() * 2000, y = 250 + R() * 1700;
      if (w.matAt(x, y) !== 3) continue;
      const v = w.hAt(x, y);
      ctx.fillStyle = v < 3 && v > -5 ? 'rgba(245,242,232,0.55)' : 'rgba(176,168,154,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.2 + R() * 1.6, 0.9 + R(), R() * 3, 0, I.TAU); ctx.fill();
    }
    // --- stream bed
    let S = w.STREAM;
    { let e = S.length; while (e > 2 && w.hAt(S[e - 1][0], S[e - 1][1]) < 2) e--; S = S.slice(0, e); }
    const strokePoly = (pts, width, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
    };
    strokePoly(S, 28, 'rgba(110,170,86,0.45)');
    strokePoly(S, 19, 'rgba(214,196,150,1)');
    strokePoly(S, 14, 'rgba(176,160,122,1)');
    for (let k = 0; k < S.length; k++) {
      for (let s = 0; s < 3; s++) {
        const p = S[k], q = S[Math.min(S.length - 1, k + 1)];
        let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const side = R() < 0.5 ? -1 : 1, o = 9 + R() * 5;
        const sx = p[0] + nx * o * side, sy = p[1] + ny * o * side, rr = 1.6 + R() * 2.2;
        ctx.fillStyle = 'rgba(120,110,96,0.5)'; ctx.beginPath(); ctx.ellipse(sx, sy + 0.8, rr, rr * 0.75, 0, 0, I.TAU); ctx.fill();
        ctx.fillStyle = R() < 0.5 ? '#e9e3d6' : '#d2cbbd'; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.7, 0, 0, I.TAU); ctx.fill();
      }
    }
    // spring basin
    const SP = w.SPRING;
    ctx.fillStyle = 'rgba(150,130,96,1)';
    ctx.beginPath(); ctx.ellipse(SP.x, SP.y, 36, 27, 0.2, 0, I.TAU); ctx.fill();
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * I.TAU, rr = 34 + R() * 4;
      const sx = SP.x + Math.cos(a) * rr * 1.05, sy = SP.y + Math.sin(a) * rr * 0.78, r1 = 3.4 + R() * 2.6;
      ctx.fillStyle = '#a49c8c'; ctx.beginPath(); ctx.ellipse(sx, sy + 1.2, r1, r1 * 0.75, a, 0, I.TAU); ctx.fill();
      ctx.fillStyle = ['#ebe5d8', '#d9d2c4', '#f3eee4'][k % 3]; ctx.beginPath(); ctx.ellipse(sx, sy, r1, r1 * 0.72, a, 0, I.TAU); ctx.fill();
    }
    // --- soft sandy paths
    w.PATHS.forEach(pts => {
      strokePoly(pts, 17, 'rgba(160,130,86,0.22)');
      strokePoly(pts, 13, '#e6d2a2');
      strokePoly(pts, 6, 'rgba(248,236,204,0.75)');
      for (let k = 0; k < pts.length; k += 2) {
        if (R() < 0.5) continue;
        const p = pts[k];
        ctx.fillStyle = 'rgba(190,168,128,0.8)';
        ctx.beginPath(); ctx.arc(p[0] + (R() - 0.5) * 9, p[1] + (R() - 0.5) * 9, 0.8 + R() * 1, 0, I.TAU); ctx.fill();
      }
    });
    // trampled clearings
    [[w.CAMP.x, w.CAMP.y, 60], [w.HUT.x, w.HUT.y + 20, 55]].forEach(c => {
      const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], c[2]);
      g.addColorStop(0, 'rgba(230,210,162,0.9)'); g.addColorStop(0.6, 'rgba(230,210,162,0.5)'); g.addColorStop(1, 'rgba(230,210,162,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, I.TAU); ctx.fill();
    });
    // crab holes
    w.crabHoles.forEach(p => {
      ctx.fillStyle = 'rgba(150,120,80,0.75)';
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.2, 1.6, 0, 0, I.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,220,0.6)';
      ctx.beginPath(); ctx.ellipse(p[0] + 0.5, p[1] + 1.6, 2.6, 1, 0, 0, Math.PI); ctx.fill();
    });
    // algae streaks on the pool walls (high-water mark)
    const P = w.POOL;
    for (let k = 0; k < 900; k++) {
      const a = R() * I.TAU, rr = 54 + R() * 26;
      const x = P.x + Math.cos(a) * rr, y = P.y + Math.sin(a) * rr;
      const v = w.hAt(x, y);
      if (v < 3.6 || v > 6.4) continue;
      ctx.fillStyle = R() < 0.6 ? 'rgba(70,98,44,0.75)' : 'rgba(110,140,60,0.6)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.6 + R() * 2, 0.9, a + Math.PI / 2, 0, I.TAU); ctx.fill();
    }
  }

  // ---------------- sprites ----------------
  const SPR = 2; // sprite pixels per world unit
  T.SPR = SPR;
  function cv(wu, hu) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(wu * SPR); c.height = Math.ceil(hu * SPR);
    const x = c.getContext('2d'); x.scale(SPR, SPR); x.lineCap = 'round'; x.lineJoin = 'round';
    return [c, x];
  }
  // soft shadow from any silhouette (shadowBlur works everywhere, unlike ctx.filter)
  function softShadow(src, blur) {
    const c = document.createElement('canvas');
    c.width = src.width + blur * 4; c.height = src.height + blur * 4;
    const x = c.getContext('2d');
    x.shadowColor = '#000'; x.shadowBlur = blur; x.shadowOffsetX = 10000;
    x.drawImage(src, blur * 2 - 10000, blur * 2);
    c.pad = blur * 2;
    return c;
  }
  // toon-shaded round canopy: a lumpy cloud of circles with a lit top and a shaded belly
  function blobCanopy(R, rad, pal, shadowOnly) {
    const [c, x] = cv(rad * 2.4, rad * 2.4);
    const cx = rad * 1.2, cy = rad * 1.2;
    const blobs = [[cx, cy, rad * 0.64]];
    const n = 7 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = k / n * I.TAU + R() * 0.4, d = rad * (0.4 + R() * 0.1);
      blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.88, rad * (0.4 + R() * 0.1) * (Math.sin(a) > 0 ? 1.06 : 0.96)]);
    }
    const shape = new Path2D();
    blobs.forEach(b => { shape.moveTo(b[0] + b[2], b[1]); shape.arc(b[0], b[1], b[2], 0, I.TAU); });
    if (shadowOnly) { x.fillStyle = '#000'; x.fill(shape); return c; }
    // belly (dark) then body, lit cap clipped to the silhouette
    x.fillStyle = pal[0]; x.fill(shape);
    x.save(); x.clip(shape);
    x.fillStyle = pal[1];
    blobs.forEach(b => { x.beginPath(); x.arc(b[0] - b[2] * 0.06, b[1] - b[2] * 0.14, b[2] * 0.96, 0, I.TAU); x.fill(); });
    x.fillStyle = pal[2];
    blobs.forEach(b => { x.beginPath(); x.arc(b[0] - b[2] * 0.2, b[1] - b[2] * 0.32, b[2] * 0.72, 0, I.TAU); x.fill(); });
    x.fillStyle = pal[3];
    blobs.forEach((b, k) => { if (k % 2 === 0) { x.beginPath(); x.arc(b[0] - b[2] * 0.32, b[1] - b[2] * 0.46, b[2] * 0.36, 0, I.TAU); x.fill(); } });
    // a few soft leaf scallops for texture
    x.strokeStyle = pal[0]; x.globalAlpha = 0.28; x.lineWidth = 1.1;
    for (let k = 0; k < rad * 0.8; k++) {
      const a = R() * I.TAU, d = Math.sqrt(R()) * rad * 0.8;
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
      x.beginPath(); x.arc(px, py, 2.2 + R() * 2, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    }
    x.restore(); x.globalAlpha = 1;
    return c;
  }
  // palm crown with solid, softly serrated fronds
  function palmCrown(R, len, shadowOnly) {
    const [c, x] = cv(len * 2.6, len * 2.6);
    const cx = len * 1.3, cy = len * 1.3;
    const n = 8 + Math.floor(R() * 3);
    const fronds = [];
    for (let k = 0; k < n; k++) fronds.push([k / n * I.TAU + R() * 0.35, len * (0.82 + R() * 0.3), (R() - 0.5) * 0.6]);
    fronds.sort((a, b) => Math.sin(a[0]) - Math.sin(b[0]));
    fronds.forEach(([a, L, bend]) => {
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.85 + L * 0.2;
      const mx = cx + Math.cos(a + bend * 0.4) * L * 0.55, my = cy + Math.sin(a + bend * 0.4) * L * 0.45 - L * 0.1;
      const back = Math.sin(a) < -0.2, front = Math.sin(a) > 0.3;
      const pt = t => { const it = 1 - t; return [it * it * cx + 2 * it * t * mx + t * t * ex, it * it * cy + 2 * it * t * my + t * t * ey]; };
      const L1 = [], L2 = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14, [px, py] = pt(t), [qx, qy] = pt(Math.min(1, t + 0.01));
        let nx = -(qy - py), ny = qx - px; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const wdt = L * 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * (k % 2 ? 1 : 0.72);
        L1.push([px + nx * wdt, py + ny * wdt + wdt * 0.3]); L2.push([px - nx * wdt, py - ny * wdt + wdt * 0.3]);
      }
      x.fillStyle = shadowOnly ? '#000' : back ? '#4f8f3e' : front ? '#7cc157' : '#68ae4a';
      x.beginPath(); x.moveTo(cx, cy); L1.forEach(q => x.lineTo(q[0], q[1])); for (let k = L2.length - 1; k >= 0; k--) x.lineTo(L2[k][0], L2[k][1]); x.closePath(); x.fill();
      if (!shadowOnly) {
        x.strokeStyle = back ? '#6aa54f' : '#a6dc78'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
      }
    });
    if (!shadowOnly) { x.fillStyle = '#8a6a40'; x.beginPath(); x.arc(cx, cy, 3.6, 0, I.TAU); x.fill(); }
    return c;
  }
  // smooth pebble-like boulder
  function rockSprite(R, rad) {
    const [c, x] = cv(rad * 2.6, rad * 2.2);
    const cx = rad * 1.3, cy = rad * 1.2;
    const n = 7, pts = [];
    for (let k = 0; k < n; k++) { const a = k / n * I.TAU + R() * 0.3, rr = rad * (0.82 + R() * 0.2); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.72]); }
    const blob = dy => {
      const p = new Path2D();
      const mid = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy]; };
      const m0 = mid(n - 1); p.moveTo(m0[0], m0[1]);
      for (let k = 0; k < n; k++) { const m = mid(k); p.quadraticCurveTo(pts[k][0], pts[k][1] + dy, m[0], m[1]); }
      p.closePath(); return p;
    };
    x.fillStyle = '#a89f90'; x.fill(blob(rad * 0.22));
    x.fillStyle = '#d9d2c4'; x.fill(blob(0));
    x.save(); x.clip(blob(0));
    x.fillStyle = '#ece7dc'; x.beginPath(); x.ellipse(cx - rad * 0.2, cy - rad * 0.3, rad * 0.75, rad * 0.45, -0.2, 0, I.TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(cx - rad * 0.35, cy - rad * 0.38, rad * 0.25, rad * 0.12, -0.3, 0, I.TAU); x.fill();
    x.fillStyle = 'rgba(130,170,90,.45)';
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx + (R() - 0.5) * rad, cy - rad * 0.1 + (R() - 0.5) * rad * 0.4, 1.4 + R() * 2, 0, I.TAU); x.fill(); }
    x.restore();
    return c;
  }
  function fernSprite(R, rad, dry) {
    const [c, x] = cv(rad * 2.4, rad * 2.4);
    const cx = rad * 1.2, cy = rad * 1.4;
    const n = 6 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.6 + (R() - 0.5) * 0.3;
      const L = rad * (0.75 + R() * 0.3);
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.8;
      const col = dry ? '#c3b86e' : (k % 2 ? '#4f9a46' : '#66b552');
      x.fillStyle = col;
      x.beginPath(); x.moveTo(cx, cy);
      for (let s = 0; s <= 1.001; s += 0.125) {
        const px = cx + (ex - cx) * s, py = cy + (ey - cy) * s - Math.sin(s * Math.PI) * 2.5, w2 = (1 - s) * 3.4 * Math.sin(Math.min(1, s * 4) * 1.57);
        x.lineTo(px + Math.cos(a - 1.57) * w2 * (s * 8 % 2 < 1 ? 1 : 0.6), py + Math.sin(a - 1.57) * w2);
      }
      for (let s = 1; s >= 0; s -= 0.125) {
        const px = cx + (ex - cx) * s, py = cy + (ey - cy) * s - Math.sin(s * Math.PI) * 2.5, w2 = (1 - s) * 3.4 * Math.sin(Math.min(1, s * 4) * 1.57);
        x.lineTo(px + Math.cos(a + 1.57) * w2 * (s * 8 % 2 < 1 ? 1 : 0.6), py + Math.sin(a + 1.57) * w2);
      }
      x.fill();
      x.strokeStyle = dry ? '#e0d496' : '#8fd06c'; x.lineWidth = 0.7;
      x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo((cx + ex) / 2, (cy + ey) / 2 - 3, ex, ey); x.stroke();
    }
    return c;
  }
  function buildSprites() {
    const R = I.rng(77);
    const pals = [
      ['#3f7f3c', '#5da74a', '#7cc25a', '#a3db78'],
      ['#3d7a42', '#58a250', '#78bf64', '#a6dc8a'],
      ['#4a8a38', '#6cb346', '#8fcf5a', '#bde67e'],
      ['#36704a', '#4f9a5c', '#6db878', '#98d69a'],
    ];
    T.canopy = []; T.canopyShadow = [];
    for (let k = 0; k < 8; k++) {
      const s = Math.floor(R() * 1e6);
      T.canopy.push(blobCanopy(I.rng(s), 50, pals[k % 4]));
      T.canopyShadow.push(softShadow(blobCanopy(I.rng(s), 50, null, true), 10));
    }
    T.fig = blobCanopy(I.rng(5), 50, ['#2f6e3a', '#4b944c', '#6bb460', '#97d283']);
    T.figShadow = softShadow(blobCanopy(I.rng(5), 50, null, true), 12);
    T.bush = []; T.bushShadow = [];
    for (let k = 0; k < 6; k++) {
      const s = Math.floor(R() * 1e6);
      T.bush.push(blobCanopy(I.rng(s), 50, ['#4b8c3c', '#6bb34c', '#8ccc62', '#b6e483']));
      T.bushShadow.push(softShadow(blobCanopy(I.rng(s), 50, null, true), 10));
    }
    T.palm = []; T.palmShadow = [];
    for (let k = 0; k < 5; k++) {
      const s = Math.floor(R() * 1e6);
      T.palm.push(palmCrown(I.rng(s), 30));
      T.palmShadow.push(softShadow(palmCrown(I.rng(s), 30, true), 6));
    }
    T.rocks = [];
    for (let k = 0; k < 8; k++) T.rocks.push(rockSprite(I.rng(k * 31 + 7), 20));
    T.ferns = [];
    for (let k = 0; k < 6; k++) T.ferns.push(fernSprite(I.rng(k * 17 + 3), 12, false));
    T.dryFerns = [];
    for (let k = 0; k < 3; k++) T.dryFerns.push(fernSprite(I.rng(k * 13 + 5), 12, true));
  }

  // ---------------- icons ----------------
  T.icons = {};
  function icon(id, fn) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round';
    fn(x);
    T.icons[id] = c.toDataURL();
  }
  function buildIcons() {
    icon('wood', x => {
      [[14, 40, 50, 22, '#8a5a32'], [12, 28, 52, 38, '#a66f3e']].forEach(([a, b, c2, d, col]) => {
        x.strokeStyle = '#4a2e18'; x.lineWidth = 11; x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke();
        x.strokeStyle = col; x.lineWidth = 8; x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke();
        x.fillStyle = '#e0b27a'; x.beginPath(); x.arc(c2, d, 4, 0, I.TAU); x.fill();
      });
    });
    icon('stone', x => {
      [[22, 38, 13, '#9a9286'], [40, 30, 11, '#b7afa2'], [38, 44, 9, '#7d766c']].forEach(([a, b, r, c2]) => {
        const g = x.createRadialGradient(a - 4, b - 4, 1, a, b, r); g.addColorStop(0, '#e2dbcf'); g.addColorStop(1, c2);
        x.fillStyle = g; x.beginPath(); x.ellipse(a, b, r, r * 0.8, 0, 0, I.TAU); x.fill();
      });
    });
    icon('fiber', x => {
      x.strokeStyle = '#c9a46a'; x.lineWidth = 2;
      for (let k = 0; k < 9; k++) { x.beginPath(); x.moveTo(14 + k * 2, 52); x.bezierCurveTo(20 + k * 3, 30, 30 + k, 24, 46 + k * 1.2, 10 + k); x.stroke(); }
      x.strokeStyle = '#8f6c3c'; x.lineWidth = 5; x.beginPath(); x.moveTo(20, 40); x.lineTo(40, 36); x.stroke();
    });
    icon('resin', x => {
      const g = x.createRadialGradient(26, 26, 2, 32, 34, 20); g.addColorStop(0, '#ffe08a'); g.addColorStop(0.6, '#e09a2a'); g.addColorStop(1, '#8a4a10');
      x.fillStyle = g; x.beginPath(); x.moveTo(32, 8); x.bezierCurveTo(46, 26, 52, 36, 44, 48); x.bezierCurveTo(36, 58, 22, 56, 18, 46); x.bezierCurveTo(14, 34, 24, 22, 32, 8); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.ellipse(26, 34, 3, 6, -0.4, 0, I.TAU); x.fill();
    });
    icon('coconut', x => {
      const g = x.createRadialGradient(24, 24, 3, 32, 34, 22); g.addColorStop(0, '#a37446'); g.addColorStop(1, '#4b2e16');
      x.fillStyle = g; x.beginPath(); x.arc(32, 34, 20, 0, I.TAU); x.fill();
      x.fillStyle = '#2a190c'; [[27, 28], [36, 28], [31.5, 36]].forEach(p => { x.beginPath(); x.arc(p[0], p[1], 2.6, 0, I.TAU); x.fill(); });
      x.strokeStyle = 'rgba(30,18,8,0.5)'; x.lineWidth = 1; for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(16 + k * 4, 20); x.lineTo(14 + k * 5, 50); x.stroke(); }
    });
    icon('berries', x => {
      x.strokeStyle = '#3d6b2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 10); x.quadraticCurveTo(40, 20, 34, 28); x.stroke();
      x.fillStyle = '#5c9a3c'; x.beginPath(); x.ellipse(42, 16, 9, 4, -0.5, 0, I.TAU); x.fill();
      [[24, 36], [36, 34], [30, 46], [42, 44], [20, 48]].forEach(p => {
        const g = x.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], 8); g.addColorStop(0, '#c58ae0'); g.addColorStop(1, '#4a1f66');
        x.fillStyle = g; x.beginPath(); x.arc(p[0], p[1], 7.5, 0, I.TAU); x.fill();
      });
    });
    const shell = (x, cooked) => {
      [[22, 34, -0.5], [40, 34, 0.5]].forEach(([a, b, r]) => {
        x.save(); x.translate(a, b); x.rotate(r);
        const g = x.createLinearGradient(-8, -14, 8, 14);
        g.addColorStop(0, cooked ? '#e7a15c' : '#3a4a6a'); g.addColorStop(1, cooked ? '#8a4a1a' : '#12182a');
        x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 9, 17, 0, 0, I.TAU); x.fill();
        x.strokeStyle = cooked ? 'rgba(255,220,160,0.6)' : 'rgba(150,180,220,0.5)'; x.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) { x.beginPath(); x.ellipse(0, 4, 9 - Math.abs(k) * 2, 13, 0, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
        x.restore();
      });
      if (cooked) { x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(22 + k * 9, 14); x.bezierCurveTo(18 + k * 9, 8, 28 + k * 9, 6, 24 + k * 9, 0); x.stroke(); } }
    };
    icon('mussels', x => shell(x, false));
    icon('cooked', x => shell(x, true));
    icon('beans', x => {
      const g = x.createLinearGradient(14, 0, 50, 0); g.addColorStop(0, '#7d8a92'); g.addColorStop(0.4, '#e4ecef'); g.addColorStop(1, '#6b7880');
      x.fillStyle = g; x.fillRect(16, 14, 32, 38);
      x.fillStyle = '#c0392b'; x.fillRect(16, 22, 32, 20);
      x.fillStyle = '#f5d76e'; x.beginPath(); x.ellipse(32, 32, 9, 6, 0, 0, I.TAU); x.fill();
      x.fillStyle = '#aab6bc'; x.beginPath(); x.ellipse(32, 14, 16, 4, 0, 0, I.TAU); x.fill();
    });
    icon('bottle', x => {
      const g = x.createLinearGradient(20, 0, 44, 0); g.addColorStop(0, '#3a6f8f'); g.addColorStop(0.45, '#9fd3ec'); g.addColorStop(1, '#2a5470');
      x.fillStyle = g; x.beginPath(); x.roundRect(20, 18, 24, 38, 7); x.fill();
      x.fillStyle = '#2b3b45'; x.fillRect(26, 8, 12, 11);
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(24, 24, 3, 24);
    });
    icon('rope', x => {
      x.strokeStyle = '#6e4f28'; x.lineWidth = 7;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(32, 32 + k * 3 - 3, 20 - k * 3, 13 - k * 2, 0, 0, I.TAU); x.stroke(); }
      x.strokeStyle = '#c9a46a'; x.lineWidth = 4;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(32, 32 + k * 3 - 3, 20 - k * 3, 13 - k * 2, 0, 0, I.TAU); x.stroke(); }
      x.strokeStyle = '#c9a46a'; x.beginPath(); x.moveTo(48, 40); x.quadraticCurveTo(56, 50, 50, 58); x.stroke();
    });
    icon('torch', x => {
      x.strokeStyle = '#5a3a1e'; x.lineWidth = 7; x.beginPath(); x.moveTo(22, 58); x.lineTo(38, 24); x.stroke();
      x.fillStyle = '#c9a46a'; x.beginPath(); x.ellipse(38, 24, 7, 9, 0.4, 0, I.TAU); x.fill();
      const g = x.createRadialGradient(40, 16, 1, 40, 16, 16); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ffb030'); g.addColorStop(1, 'rgba(255,80,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(40, 16, 16, 0, I.TAU); x.fill();
    });
    icon('battery', x => {
      const g = x.createLinearGradient(0, 18, 0, 54); g.addColorStop(0, '#4a4f55'); g.addColorStop(1, '#1f2226');
      x.fillStyle = g; x.beginPath(); x.roundRect(10, 20, 44, 32, 4); x.fill();
      x.fillStyle = '#c0392b'; x.fillRect(16, 13, 9, 8); x.fillStyle = '#2c3e50'; x.fillRect(40, 13, 9, 8);
      x.fillStyle = '#f1c40f'; x.beginPath(); x.moveTo(34, 26); x.lineTo(26, 38); x.lineTo(32, 38); x.lineTo(29, 48); x.lineTo(38, 34); x.lineTo(32, 34); x.closePath(); x.fill();
    });
    icon('fuse', x => {
      x.save(); x.translate(32, 32); x.rotate(-0.6);
      x.fillStyle = '#c9cfd4'; x.fillRect(-24, -7, 10, 14); x.fillRect(14, -7, 10, 14);
      x.fillStyle = 'rgba(200,235,255,0.55)'; x.fillRect(-14, -6, 28, 12);
      x.strokeStyle = '#7a5a2a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-14, 0); x.bezierCurveTo(-4, -5, 4, 5, 14, 0); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(-12, -5, 24, 2);
      x.restore();
    });
    icon('lighter', x => {
      x.fillStyle = '#d35400'; x.beginPath(); x.roundRect(22, 22, 20, 34, 4); x.fill();
      x.fillStyle = '#bdc3c7'; x.fillRect(22, 14, 20, 9);
      x.fillStyle = '#ffcc33'; x.beginPath(); x.ellipse(34, 9, 3, 6, 0, 0, I.TAU); x.fill();
    });
    icon('knife', x => {
      x.save(); x.translate(32, 32); x.rotate(-0.7);
      x.fillStyle = '#c0392b'; x.beginPath(); x.roundRect(-4, 0, 8, 24, 3); x.fill();
      x.fillStyle = '#dfe6e9'; x.beginPath(); x.moveTo(-4, 0); x.lineTo(4, 0); x.lineTo(3, -24); x.lineTo(-4, -16); x.closePath(); x.fill();
      x.restore();
    });
    icon('notebook', x => {
      x.fillStyle = '#7a4a26'; x.beginPath(); x.roundRect(14, 10, 36, 46, 3); x.fill();
      x.fillStyle = '#f3e6c8'; x.fillRect(18, 13, 30, 40);
      x.strokeStyle = '#b9a27a'; x.lineWidth = 1; for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(21, 20 + k * 6); x.lineTo(45, 20 + k * 6); x.stroke(); }
      x.fillStyle = '#c0392b'; x.fillRect(40, 10, 4, 14);
    });
  }
})();
