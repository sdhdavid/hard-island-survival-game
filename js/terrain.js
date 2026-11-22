'use strict';
// ------------------------------------------------------------
//  Terrain painter + procedural sprites + item icons
// ------------------------------------------------------------
(function () {
  const T = I.terrain = {};
  const C = {
    sand: I.hex('#ecdcaa'), sandHi: I.hex('#f5e8c0'), sandWet: I.hex('#c8ad78'), sandUnder: I.hex('#c4ac78'),
    grass: I.hex('#8fb257'), grassLush: I.hex('#6c9d4a'), forest: I.hex('#48793f'), dry: I.hex('#b5a866'),
    rock: I.hex('#958c7e'), rockDark: I.hex('#6b655d'), algae: I.hex('#4a5a2c'), deep: I.hex('#2c5560'),
  };
  T.C = C;

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

  T.build = async function (progress) {
    const w = I.world, { GW, GH, CELL, W, H } = w;
    const N = GW * GH;
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), amp = new Float32Array(N);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
      const v = w.h[i], m = w.mat[i];
      const gxh = (w.h[i + (gx < GW - 1 ? 1 : 0)] - w.h[i - (gx > 0 ? 1 : 0)]) / (2 * CELL);
      const gyh = (w.h[i + (gy < GH - 1 ? GW : 0)] - w.h[i - (gy > 0 ? GW : 0)]) / (2 * CELL);
      const n1 = I.fbm(x / 140, y / 140, 3), n2 = I.fbm(x / 35 + 7, y / 35, 2);
      let c, a = 7;
      if (m === 0) {
        c = I.mix3(C.sand, C.sandHi, I.clamp(0.5 + n1, 0, 1) * 0.6);
        c = I.mix3(C.sandWet, c, I.smooth(1, 7.5, v));
        if (v < 0) c = I.mix3(C.sandUnder, C.deep, I.smooth(-2, -30, v));
        // sand blends into grass
        const gt = I.smooth(9.5, 13.5, v + n2 * 2);
        if (gt > 0) c = I.mix3(c, C.grass, gt * 0.85);
        a = 5;
      } else if (m === 3) {
        c = I.mix3(C.rock, C.rockDark, I.clamp(0.45 + n1 * 0.9 + n2 * 0.5, 0, 1));
        // high-water mark: a band of dark algae, wet dark rock with pale barnacles below it
        if (v < 6.4 && v > 2.2) c = I.mix3(c, C.algae, 0.85 * I.smooth(2.2, 3.2, v) * I.smooth(6.4, 5.6, v));
        if (v <= 2.6 && v > -6) c = I.mix3(c, [74, 70, 62], 0.5 + 0.2 * I.clamp(n2 + 0.5, 0, 1));
        if (v < -6) c = I.mix3(c, C.deep, I.smooth(-6, -26, v));
        if (v > 12 && v < 40 && w.coastD[i] > 70) c = I.mix3(c, C.grass, 0.25 * I.clamp(n2 + 0.4, 0, 1));
        a = 12;
      } else if (m === 4) {
        c = I.mix3(C.dry, C.grass, I.clamp(0.4 + n1, 0, 1) * 0.5);
        a = 9;
      } else {
        const f = w.forest[i];
        c = I.mix3(C.grass, C.grassLush, I.clamp(0.5 + n1 * 1.3, 0, 1));
        c = I.mix3(c, C.forest, I.smooth(0.3, 0.75, f));
        if (v > 52) c = I.mix3(c, C.dry, I.smooth(52, 68, v) * 0.6);
        a = 10;
      }
      // hillshade (light from the north-west)
      let sh = 1 + (gxh + gyh) * 0.707 * 1.35;
      sh = I.clamp(sh, 0.62, 1.28);
      if (v < -1) sh = I.lerp(sh, 1, 0.6);
      // wet line darkening near stream
      const sd = w.streamD[i];
      if (sd < 22 && v > 0) { const t = I.smooth(22, 8, sd); c = I.mix3(c, [70, 82, 52], t * 0.5); }
      cr[i] = c[0] * sh; cg[i] = c[1] * sh; cb[i] = c[2] * sh; amp[i] = a;
    }
    const tA = makeTile(11, 1), tB = makeTile(23, 4), tC = makeTile(41, 9);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const ROWS = 110;
    for (let y0 = 0; y0 < H; y0 += ROWS) {
      for (let y = y0; y < Math.min(H, y0 + ROWS); y++) {
        let fy = y / CELL - 0.5; if (fy < 0) fy = 0; if (fy > GH - 1.001) fy = GH - 1.001;
        const gy = fy | 0, ty = fy - gy;
        for (let x = 0; x < W; x++) {
          let fx = x / CELL - 0.5; if (fx < 0) fx = 0; if (fx > GW - 1.001) fx = GW - 1.001;
          const gx = fx | 0, tx = fx - gx, i = gy * GW + gx;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const r = cr[i] * w00 + cr[i + 1] * w10 + cr[i + GW] * w01 + cr[i + GW + 1] * w11;
          const g = cg[i] * w00 + cg[i + 1] * w10 + cg[i + GW] * w01 + cg[i + GW + 1] * w11;
          const b = cb[i] * w00 + cb[i + 1] * w10 + cb[i + GW] * w01 + cb[i + GW + 1] * w11;
          const am = amp[i];
          const n = tA[(x & 255) | ((y & 255) << 8)] * am * 0.45 + tB[(x & 255) | ((y & 255) << 8)] * am * 0.8 + tC[((x + 77) & 255) | (((y + 31) & 255) << 8)] * am * 0.5;
          const o = (y * W + x) * 4;
          d[o] = r + n; d[o + 1] = g + n; d[o + 2] = b + n * 0.8; d[o + 3] = 255;
        }
      }
      if (progress) progress(0.15 + 0.55 * (y0 / H));
      await new Promise(r => setTimeout(r, 0));
    }
    ctx.putImageData(img, 0, 0);
    decorate(ctx);
    if (progress) progress(0.8);
    await new Promise(r => setTimeout(r, 0));
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
      ctx.fillStyle = R() < 0.5 ? 'rgba(84,74,46,0.55)' : 'rgba(60,70,40,0.5)';
      ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 3);
      ctx.fillRect(-2 - R() * 3, -0.6, 4 + R() * 5, 1.3); ctx.restore();
    }
    // --- sand ripples & shells
    for (let k = 0; k < 2600; k++) {
      const x = 380 + R() * 1750, y = 300 + R() * 1520;
      const v = w.hAt(x, y);
      if (w.matAt(x, y) !== 0 || v < 0.5 || v > 11) continue;
      if (R() < 0.82) {
        ctx.strokeStyle = R() < 0.5 ? 'rgba(255,248,220,0.35)' : 'rgba(150,120,80,0.18)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x, y - 2 + R() * 4, x + 6 + R() * 4, y + R() * 2 - 1); ctx.stroke();
      } else {
        ctx.fillStyle = ['#f6efe0', '#e8c9b0', '#d9a88a', '#faf6ee'][Math.floor(R() * 4)];
        ctx.beginPath(); ctx.ellipse(x, y, 1.4 + R(), 1 + R() * 0.6, R() * 3, 0, I.TAU); ctx.fill();
      }
    }
    // --- grass strokes
    for (let k = 0; k < 70000; k++) {
      const x = 360 + R() * 1760, y = 280 + R() * 1560;
      const m = w.matAt(x, y);
      if (m !== 1 && m !== 2 && m !== 4) continue;
      if (w.pathAt(x, y) < 7) continue;
      const v = w.hAt(x, y);
      if (v < 11) continue;
      const len = 2 + R() * 4, a = -Math.PI / 2 + (R() - 0.5) * 0.9;
      const light = R() < 0.45;
      ctx.strokeStyle = m === 4 ? (light ? 'rgba(220,205,130,0.5)' : 'rgba(120,110,60,0.35)') :
        light ? (m === 2 ? 'rgba(110,160,80,0.35)' : 'rgba(180,210,110,0.4)') : (m === 2 ? 'rgba(25,55,30,0.35)' : 'rgba(60,100,45,0.35)');
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    // --- flowers
    for (let k = 0; k < 2400; k++) {
      const x = 400 + R() * 1700, y = 300 + R() * 1500;
      const m = w.matAt(x, y);
      if (m !== 1 || w.pathAt(x, y) < 9 || w.hAt(x, y) < 12) continue;
      if (I.fbm(x / 120, y / 120) < 0.05) continue;
      ctx.fillStyle = ['#fff6d8', '#ffd447', '#f29bb5', '#c9a3ff', '#ffffff'][Math.floor(R() * 5)];
      ctx.beginPath(); ctx.arc(x, y, 0.9 + R() * 0.8, 0, I.TAU); ctx.fill();
    }
    // --- rock cracks & speckles
    for (let k = 0; k < 9000; k++) {
      const x = 300 + R() * 2000, y = 250 + R() * 1700;
      if (w.matAt(x, y) !== 3) continue;
      if (R() < 0.6) {
        ctx.strokeStyle = 'rgba(40,36,32,0.28)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x, y);
        let px = x, py = y;
        for (let s = 0; s < 3; s++) { px += (R() - 0.5) * 9; py += (R() - 0.5) * 6; ctx.lineTo(px, py); }
        ctx.stroke();
      } else {
        const v = w.hAt(x, y);
        ctx.fillStyle = v < 3 && v > -5 ? 'rgba(235,230,215,0.55)' : 'rgba(210,200,185,0.35)';
        ctx.beginPath(); ctx.arc(x, y, 0.8 + R(), 0, I.TAU); ctx.fill();
      }
    }
    // --- stream bed
    const S = w.STREAM;
    const strokePoly = (pts, width, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
    };
    strokePoly(S, 30, 'rgba(70,74,48,0.35)');
    strokePoly(S, 21, 'rgba(92,84,60,0.8)');
    strokePoly(S, 15, 'rgba(70,64,48,0.9)');
    for (let k = 0; k < S.length; k++) {
      for (let s = 0; s < 3; s++) {
        const p = S[k], q = S[Math.min(S.length - 1, k + 1)];
        let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const side = R() < 0.5 ? -1 : 1, o = 9 + R() * 6;
        ctx.fillStyle = R() < 0.5 ? 'rgba(160,150,135,0.9)' : 'rgba(120,112,100,0.9)';
        ctx.beginPath(); ctx.ellipse(p[0] + nx * o * side, p[1] + ny * o * side, 1.5 + R() * 2.4, 1.2 + R() * 1.5, R() * 3, 0, I.TAU); ctx.fill();
      }
    }
    // spring basin
    const SP = w.SPRING;
    ctx.fillStyle = 'rgba(60,62,44,0.8)';
    ctx.beginPath(); ctx.ellipse(SP.x, SP.y, 36, 27, 0.2, 0, I.TAU); ctx.fill();
    for (let k = 0; k < 26; k++) {
      const a = k / 26 * I.TAU, rr = 34 + R() * 4;
      ctx.fillStyle = ['#9b9486', '#7f786c', '#aaa395'][k % 3];
      ctx.beginPath(); ctx.ellipse(SP.x + Math.cos(a) * rr * 1.05, SP.y + Math.sin(a) * rr * 0.78, 3 + R() * 3, 2.4 + R() * 2, a, 0, I.TAU); ctx.fill();
    }
    // --- dirt paths
    w.PATHS.forEach(pts => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        const L = Math.hypot(bx - ax, by - ay);
        for (let s = 0; s < L; s += 2.2) {
          const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L;
          const v = w.hAt(x, y);
          if (v < 1) continue;
          const rr = 6.5 + I.noise(x / 18, y / 18) * 2.6;
          const onRock = w.matAt(x, y) === 3;
          ctx.fillStyle = onRock ? 'rgba(150,135,110,0.13)' : 'rgba(176,146,98,0.16)';
          ctx.beginPath(); ctx.arc(x, y, rr, 0, I.TAU); ctx.fill();
          ctx.fillStyle = onRock ? 'rgba(180,165,140,0.12)' : 'rgba(196,168,118,0.18)';
          ctx.beginPath(); ctx.arc(x + (R() - 0.5) * 3, y + (R() - 0.5) * 3, rr * 0.6, 0, I.TAU); ctx.fill();
        }
      }
      for (let k = 0; k < pts.length; k++) {
        if (R() < 0.6) continue;
        const p = pts[k];
        ctx.fillStyle = 'rgba(120,105,80,0.6)';
        ctx.beginPath(); ctx.arc(p[0] + (R() - 0.5) * 16, p[1] + (R() - 0.5) * 16, 0.8 + R() * 1.4, 0, I.TAU); ctx.fill();
      }
    });
    // trampled clearings
    [[w.CAMP.x, w.CAMP.y, 60], [w.HUT.x, w.HUT.y + 20, 55]].forEach(c => {
      const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], c[2]);
      g.addColorStop(0, 'rgba(170,140,95,0.55)'); g.addColorStop(1, 'rgba(170,140,95,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, I.TAU); ctx.fill();
    });
    // crab holes
    w.crabHoles.forEach(p => {
      ctx.fillStyle = 'rgba(80,60,35,0.7)';
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.2, 1.6, 0, 0, I.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.4)';
      ctx.beginPath(); ctx.ellipse(p[0] + 0.5, p[1] + 1.6, 2.6, 1, 0, 0, Math.PI); ctx.fill();
    });
    // algae streaks on pool walls (high-water mark) – painted darker for readability
    const P = w.POOL;
    for (let k = 0; k < 900; k++) {
      const a = R() * I.TAU, rr = 54 + R() * 26;
      const x = P.x + Math.cos(a) * rr, y = P.y + Math.sin(a) * rr;
      const v = w.hAt(x, y);
      if (v < 3.6 || v > 6.4) continue;
      ctx.fillStyle = R() < 0.6 ? 'rgba(42,62,28,0.75)' : 'rgba(80,100,40,0.6)';
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
  function blobCanopy(R, rad, pal, shadowOnly) {
    const [c, x] = cv(rad * 2.4, rad * 2.4);
    const cx = rad * 1.2, cy = rad * 1.2;
    const blobs = [];
    const n = 9 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      const a = R() * I.TAU, d = Math.sqrt(R()) * rad * 0.58;
      blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, rad * (0.36 + R() * 0.2)]);
    }
    blobs.push([cx, cy, rad * 0.62]);
    if (shadowOnly) {
      x.fillStyle = '#000';
      blobs.forEach(b => { x.beginPath(); x.arc(b[0], b[1], b[2], 0, I.TAU); x.fill(); });
      return c;
    }
    // dark base
    blobs.forEach(b => { x.fillStyle = pal[0]; x.beginPath(); x.arc(b[0] + 1.5, b[1] + 2.5, b[2], 0, I.TAU); x.fill(); });
    blobs.forEach(b => {
      const g = x.createRadialGradient(b[0] - b[2] * 0.4, b[1] - b[2] * 0.45, b[2] * 0.1, b[0], b[1], b[2]);
      g.addColorStop(0, pal[3]); g.addColorStop(0.45, pal[2]); g.addColorStop(1, pal[1]);
      x.fillStyle = g; x.beginPath(); x.arc(b[0], b[1], b[2], 0, I.TAU); x.fill();
    });
    // leaf texture
    for (let k = 0; k < rad * 9; k++) {
      const a = R() * I.TAU, d = Math.sqrt(R()) * rad * 0.95;
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
      const up = (px - cx) + (py - cy) < 0;
      x.fillStyle = up ? (R() < 0.5 ? pal[4] : pal[3]) : (R() < 0.5 ? pal[0] : pal[1]);
      x.globalAlpha = 0.55;
      x.beginPath(); x.ellipse(px, py, 1.6 + R() * 1.6, 0.9 + R() * 0.7, R() * 3, 0, I.TAU); x.fill();
    }
    x.globalAlpha = 1;
    return c;
  }
  function palmCrown(R, len, shadowOnly) {
    const [c, x] = cv(len * 2.6, len * 2.6);
    const cx = len * 1.3, cy = len * 1.3;
    const n = 9 + Math.floor(R() * 3);
    const fronds = [];
    for (let k = 0; k < n; k++) fronds.push([k / n * I.TAU + R() * 0.4, len * (0.8 + R() * 0.35), (R() - 0.5) * 0.7]);
    fronds.sort((a, b) => Math.sin(a[0]) - Math.sin(b[0]));
    fronds.forEach(([a, L, bend], k) => {
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.85 + L * 0.18;
      const mx = cx + Math.cos(a + bend * 0.4) * L * 0.55, my = cy + Math.sin(a + bend * 0.4) * L * 0.45 - L * 0.08;
      const dark = Math.sin(a) > 0.2;
      const col = shadowOnly ? '#000' : (dark ? '#3f6b2e' : (k % 2 ? '#5c9a3c' : '#6fae45'));
      const hi = shadowOnly ? '#000' : (dark ? '#4f7f36' : '#9ccc5c');
      // leaflets
      for (let s = 0.12; s <= 1; s += 0.06) {
        const t = s, it = 1 - t;
        const px = it * it * cx + 2 * it * t * mx + t * t * ex, py = it * it * cy + 2 * it * t * my + t * t * ey;
        const tx = 2 * it * (mx - cx) + 2 * t * (ex - mx), ty = 2 * it * (my - cy) + 2 * t * (ey - my);
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        const ll = L * 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 1;
        x.strokeStyle = col; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + nx * ll + tx / tl * ll * 0.4, py + ny * ll + ty / tl * ll * 0.4 + ll * 0.25); x.stroke();
        x.beginPath(); x.moveTo(px, py); x.lineTo(px - nx * ll + tx / tl * ll * 0.4, py - ny * ll + ty / tl * ll * 0.4 + ll * 0.25); x.stroke();
      }
      x.strokeStyle = hi; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
    });
    if (!shadowOnly) {
      x.fillStyle = '#6b4f2a'; x.beginPath(); x.arc(cx, cy, 3.4, 0, I.TAU); x.fill();
    }
    return c;
  }
  function rockSprite(R, rad) {
    const [c, x] = cv(rad * 2.6, rad * 2.2);
    const cx = rad * 1.3, cy = rad * 1.25;
    const pts = [];
    const n = 7 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const a = k / n * I.TAU + R() * 0.3;
      const rr = rad * (0.75 + R() * 0.3);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.72]);
    }
    const path = (dy) => { x.beginPath(); pts.forEach((p, k) => k ? x.lineTo(p[0], p[1] + dy) : x.moveTo(p[0], p[1] + dy)); x.closePath(); };
    path(rad * 0.18); x.fillStyle = '#4b4640'; x.fill();
    path(0);
    const g = x.createLinearGradient(cx - rad, cy - rad, cx + rad * 0.6, cy + rad);
    g.addColorStop(0, '#c8beb0'); g.addColorStop(0.5, '#958c80'); g.addColorStop(1, '#5f5953');
    x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(40,35,30,0.35)'; x.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) {
      x.beginPath(); let px = cx + (R() - 0.5) * rad, py = cy + (R() - 0.5) * rad * 0.6; x.moveTo(px, py);
      for (let s = 0; s < 3; s++) { px += (R() - 0.5) * rad * 0.5; py += (R() - 0.5) * rad * 0.4; x.lineTo(px, py); }
      x.stroke();
    }
    x.fillStyle = 'rgba(110,140,70,0.45)';
    for (let k = 0; k < rad; k++) { x.beginPath(); x.arc(cx + (R() - 0.5) * rad * 1.3, cy - rad * 0.2 + (R() - 0.5) * rad * 0.5, 0.8 + R() * 1.2, 0, I.TAU); x.fill(); }
    return c;
  }
  function fernSprite(R, rad, dry) {
    const [c, x] = cv(rad * 2.4, rad * 2.4);
    const cx = rad * 1.2, cy = rad * 1.4;
    const n = 6 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.6 + (R() - 0.5) * 0.3;
      const L = rad * (0.7 + R() * 0.35);
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.8;
      x.strokeStyle = dry ? '#a99a5a' : (k % 2 ? '#3d7a35' : '#5a9a44'); x.lineWidth = 1.1;
      x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo((cx + ex) / 2, (cy + ey) / 2 - 3, ex, ey); x.stroke();
      for (let s = 0.2; s < 1; s += 0.14) {
        const px = cx + (ex - cx) * s, py = cy + (ey - cy) * s - Math.sin(s * Math.PI) * 2;
        const ll = (1 - s) * 3.4 + 0.8;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a - 1.2) * ll, py + Math.sin(a - 1.2) * ll); x.stroke();
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a + 1.2) * ll, py + Math.sin(a + 1.2) * ll); x.stroke();
      }
    }
    return c;
  }
  function buildSprites() {
    const R = I.rng(77);
    const pals = [
      ['#1f3d22', '#2f5a2c', '#4c8a3c', '#7fb855', '#a9d670'],
      ['#22401f', '#355f28', '#5b9338', '#8fc251', '#c0e07a'],
      ['#1a3524', '#28503a', '#3f7a4c', '#6aa66a', '#9fd08a'],
      ['#2a3f1c', '#43602a', '#6b8f36', '#a1bf55', '#d3e17f'],
    ];
    T.canopy = []; T.canopyShadow = [];
    for (let k = 0; k < 8; k++) {
      const s = Math.floor(R() * 1e6);
      T.canopy.push(blobCanopy(I.rng(s), 50, pals[k % 4]));
      T.canopyShadow.push(blobCanopy(I.rng(s), 50, null, true));
    }
    T.fig = blobCanopy(I.rng(5), 50, ['#193620', '#27502c', '#3d7a3a', '#64a456', '#93cc72']);
    T.figShadow = blobCanopy(I.rng(5), 50, null, true);
    T.bush = []; T.bushShadow = [];
    for (let k = 0; k < 6; k++) {
      const s = Math.floor(R() * 1e6);
      T.bush.push(blobCanopy(I.rng(s), 50, ['#203f1e', '#335e2a', '#4f8a3a', '#79b250', '#a6d46c']));
      T.bushShadow.push(blobCanopy(I.rng(s), 50, null, true));
    }
    T.palm = []; T.palmShadow = [];
    for (let k = 0; k < 5; k++) {
      const s = Math.floor(R() * 1e6);
      T.palm.push(palmCrown(I.rng(s), 30));
      T.palmShadow.push(palmCrown(I.rng(s), 30, true));
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
