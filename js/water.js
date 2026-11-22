'use strict';
// ------------------------------------------------------------
//  Sea: tide, swash, breaking waves, foam, wet sand memory
// ------------------------------------------------------------
(function () {
  const Wt = I.water = {};
  const LUT_N = 260, LUT_STEP = 8; // 8 entries per unit depth
  const lut = new Float32Array(LUT_N * 4);
  const stops = [[0, [226, 250, 242], 0.25], [1.2, [168, 236, 226], 0.45], [3.5, [104, 214, 214], 0.66], [8, [62, 186, 208], 0.86], [16, [44, 152, 198], 0.96], [32, [34, 120, 180], 1]];
  for (let k = 0; k < LUT_N; k++) {
    const d = k / LUT_STEP;
    let j = 0; while (j < stops.length - 2 && d > stops[j + 1][0]) j++;
    const a = stops[j], b = stops[j + 1];
    const t = I.clamp((d - a[0]) / (b[0] - a[0]), 0, 1);
    const c = I.mix3(a[1], b[1], t);
    lut[k * 4] = c[0]; lut[k * 4 + 1] = c[1]; lut[k * 4 + 2] = c[2]; lut[k * 4 + 3] = I.lerp(a[2], b[2], t);
  }
  // caustic tiles
  const TS = 128;
  function tile(seed) {
    const a = new Float32Array(TS * TS);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const u = x / TS * 6, v = y / TS * 6;
      // periodic noise: sum of sines with random phases (cheap and tileable)
      a[y * TS + x] = 0;
    }
    const r = I.rng(seed);
    for (let k = 0; k < 7; k++) {
      const fx = 1 + Math.floor(r() * 4), fy = 1 + Math.floor(r() * 4) * (r() < 0.5 ? -1 : 1), ph = r() * I.TAU, am = 1 / (1 + k * 0.4);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) a[y * TS + x] += Math.sin((x * fx + y * fy) / TS * I.TAU + ph) * am;
    }
    let mx = 0; for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i]));
    for (let i = 0; i < a.length; i++) a[i] /= mx;
    return a;
  }
  const tA = tile(3), tB = tile(8);
  let cv = null, cx = null, img = null, iw = 0, ih = 0;

  Wt.SWASH = 2.1;
  Wt.pulse = x => { const s = 0.5 + 0.5 * Math.sin(x); return s * s * s; };
  Wt.swashAt = function (x, y, t) {
    const w = I.world, i = w.idx(x, y);
    return w.expo[i] * Wt.SWASH * Wt.pulse(t * 0.85 + w.phase[i]);
  };
  Wt.depthAt = function (x, y, level, t, swashFactor = 1) {
    return level + Wt.swashAt(x, y, t) * swashFactor - I.world.hAt(x, y);
  };

  // view: {x0,y0,x1,y1} world rect
  Wt.render = function (ctx, view, t, level, dt) {
    const w = I.world, { GW, GH, CELL } = w;
    let gx0 = Math.max(0, Math.floor(view.x0 / CELL) - 1), gy0 = Math.max(0, Math.floor(view.y0 / CELL) - 1);
    let gx1 = Math.min(GW - 1, Math.ceil(view.x1 / CELL) + 1), gy1 = Math.min(GH - 1, Math.ceil(view.y1 / CELL) + 1);
    const total = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
    const step = Math.max(1, Math.ceil(Math.sqrt(total / 110000)));
    const cols = Math.floor((gx1 - gx0) / step) + 1, rows = Math.floor((gy1 - gy0) / step) + 1;
    if (!cv || cols > iw || rows > ih) {
      iw = Math.max(cols, iw); ih = Math.max(rows, ih);
      cv = document.createElement('canvas'); cv.width = iw; cv.height = ih;
      cx = cv.getContext('2d'); img = cx.createImageData(iw, ih);
    }
    const d = img.data;
    const hA = w.h, ex = w.expo, ph = w.phase, wet = w.wet, mat = w.mat;
    const sw = Wt.SWASH, tw = t * 0.85, tc = t * 1.7;
    const o1 = (t * 3.1) | 0, o2 = (t * 2.3) | 0;
    const dry = dt * 0.075;
    for (let ry = 0; ry < rows; ry++) {
      const gy = gy0 + ry * step;
      let o = ry * iw * 4;
      for (let rx = 0; rx < cols; rx++, o += 4) {
        const gx = gx0 + rx * step;
        const i = gy * GW + gx;
        const v = hA[i];
        const s = 0.5 + 0.5 * Math.sin(tw + ph[i]);
        const lev = level + ex[i] * sw * s * s * s;
        const depth = lev - v;
        if (depth <= 0) {
          let wv = wet[i];
          if (wv > 0) { wv -= dry; if (wv < 0) wv = 0; wet[i] = wv; }
          // anti-aliased fringe: a thin film of foam fading out just above the waterline
          if (depth > -1.1) {
            const f = 1 + depth / 1.1;
            d[o] = 246; d[o + 1] = 251; d[o + 2] = 248; d[o + 3] = f * f * (150 + 70 * ex[i]);
            continue;
          }
          if (wv > 0.01 && v < 13 && (mat[i] === 0 || mat[i] === 3)) {
            if (wv > 0.8 && mat[i] === 0) {
              const n = tA[((gx * 2) & 127) | (((gy * 2) & 127) << 7)];
              const lace = (wv - 0.8) / 0.2 * (0.12 + 0.3 * (n > 0 ? n : 0));
              d[o] = 236; d[o + 1] = 242; d[o + 2] = 236; d[o + 3] = lace * 255;
            } else {
              d[o] = 92; d[o + 1] = 70; d[o + 2] = 42; d[o + 3] = wv * (mat[i] === 3 ? 70 : 52);
            }
          } else d[o + 3] = 0;
          continue;
        }
        wet[i] = 1;
        let k = (depth * LUT_STEP) | 0; if (k >= LUT_N) k = LUT_N - 1;
        k *= 4;
        let r = lut[k], g = lut[k + 1], b = lut[k + 2], a = lut[k + 3];
        // caustics / shimmer
        const n1 = tA[((gx + o1) & 127) | (((gy) & 127) << 7)];
        const n2 = tB[((gx) & 127) | (((gy + o2) & 127) << 7)];
        let c = 1 - Math.abs(n1 + n2); c = c * c * c * c * c * c;
        const shallow = depth < 10 ? 1 - depth / 10 : 0;
        const lift = c * (10 + 16 * shallow) + n1 * 4;
        r += lift; g += lift; b += lift * 0.9;
        // gentle breaking crests moving toward the shore
        let foam = 0;
        if (depth < 6) {
          const crest = Math.sin(depth * 1.05 + tc + ph[i] * 0.6);
          if (crest > 0.84) foam = (crest - 0.84) * 3.2 * (1 - depth / 6) * (0.3 + 0.7 * ex[i]);
        }
        // clean outline ripples that ring the island and drift slowly outward
        if (depth > 0.8 && depth < 15) {
          const q = depth * 0.34 - t * 0.12 + ph[i] * 0.03;
          const tri = Math.abs(q - Math.floor(q) - 0.5) * 2;
          if (tri > 0.8) {
            const line = (tri - 0.8) * 5 * (1 - depth / 15) * 0.55;
            if (line > foam) foam = line;
          }
        }
        // edge foam
        if (depth < 1.6) {
          const e = 1 - depth / 1.6;
          foam = Math.max(foam, e * e * (0.55 + 0.45 * ex[i]) * (0.65 + 0.35 * n1));
        }
        if (foam > 0) {
          if (foam > 1) foam = 1;
          r += (250 - r) * foam; g += (253 - g) * foam; b += (250 - b) * foam;
          a = a + (0.92 - a) * foam;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255;
      }
    }
    cx.putImageData(img, 0, 0, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, 0, 0, cols, rows, gx0 * CELL, gy0 * CELL, cols * step * CELL, rows * step * CELL);
    ctx.imageSmoothingQuality = 'low';
  };
})();
