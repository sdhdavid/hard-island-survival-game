'use strict';
// ------------------------------------------------------------
//  The island: heightmap, materials, paths, objects
// ------------------------------------------------------------
(function () {
  const W = 2400, H = 2200, CELL = 3;
  const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  const N = GW * GH;
  const world = I.world = { W, H, CELL, GW, GH };

  // ---------------- hand-placed geography ----------------
  const COAST = [[1050, 1775], [880, 1752], [720, 1712], [600, 1630], [500, 1500], [430, 1330], [385, 1150], [372, 1000], [375, 880],
    [392, 760], [440, 620], [530, 480], [660, 385], [820, 330], [1000, 305], [1200, 322], [1380, 300], [1560, 318], [1740, 350],
    [1900, 430], [2010, 560], [2070, 740], [2075, 930], [2030, 1130], [1950, 1320], [1830, 1480], [1720, 1590], [1580, 1680], [1400, 1742], [1220, 1772]];

  const P = world.POOL = { x: 475, y: 880, r: 55 };
  const MOUTH = world.MOUTH = { x: 475, y: 807 };
  world.START = { x: 1000, y: 1688 };
  world.SPRING = { x: 860, y: 905 };
  world.CAMP = { x: 1122, y: 1296 };
  world.HUT = { x: 1655, y: 556 };
  world.TOWER = { x: 1728, y: 528 };
  world.BOAT = { x: 1896, y: 1856 };
  world.DEADTREE = { x: 1300, y: 948 };

  const STREAM = I.spline([[860, 905], [890, 975], [930, 1050], [985, 1120], [1010, 1195], [1040, 1270], [1080, 1350], [1105, 1440], [1140, 1530], [1160, 1620], [1180, 1700], [1192, 1790]], 10);
  const PATH_B = I.spline([[1238, 1712], [1215, 1620], [1190, 1525], [1160, 1435], [1135, 1355], [1122, 1300], [1085, 1205], [1045, 1125], [995, 1045], [945, 975], [902, 930], [838, 872], [760, 860], [680, 866], [610, 876], [546, 880]], 8);
  const PATH_A = I.spline([[1330, 1722], [1392, 1630], [1462, 1540], [1510, 1450], [1470, 1365], [1500, 1280], [1590, 1215], [1600, 1120], [1545, 1040], [1580, 960], [1660, 900], [1700, 820], [1650, 742], [1600, 680], [1636, 622], [1655, 590]], 8);
  const PATH_C = I.spline([[902, 932], [990, 930], [1090, 946], [1190, 966], [1292, 990], [1400, 1012], [1490, 1036], [1545, 1040]], 8);
  const SPIT = I.spline([[1700, 1572], [1745, 1650], [1790, 1720], [1830, 1775], [1858, 1808]], 8);
  const REEF = I.spline([[1380, 1915], [1600, 1885], [1780, 1866], [1900, 1856], [2050, 1795], [2200, 1695], [2320, 1560]], 8);
  world.STREAM = STREAM; world.PATHS = [PATH_A, PATH_B, PATH_C]; world.SPIT = SPIT; world.REEF = REEF;
  world.PATH_A = PATH_A; world.PATH_B = PATH_B; world.PATH_C = PATH_C;

  // ---------------- grids ----------------
  const h = world.h = new Float32Array(N);
  const mat = world.mat = new Uint8Array(N);     // 0 sand 1 grass 2 forest 3 rock 4 dry
  const coastD = world.coastD = new Float32Array(N);
  const block = world.block = new Uint8Array(N);
  const expo = world.expo = new Float32Array(N);
  const phase = world.phase = new Float32Array(N);
  const wet = world.wet = new Float32Array(N);
  const forest = world.forest = new Float32Array(N);
  let pathD, streamD;

  function chamfer(mask) {
    const d = new Float32Array(N);
    for (let i = 0; i < N; i++) d[i] = mask[i] ? 0 : 1e9;
    const D = 1.4142;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x; let v = d[i];
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - GW] + 1 < v) v = d[i - GW] + 1;
        if (x > 0 && d[i - GW - 1] + D < v) v = d[i - GW - 1] + D;
        if (x < GW - 1 && d[i - GW + 1] + D < v) v = d[i - GW + 1] + D;
      }
      d[i] = v;
    }
    for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) {
      const i = y * GW + x; let v = d[i];
      if (x < GW - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < GH - 1) {
        if (d[i + GW] + 1 < v) v = d[i + GW] + 1;
        if (x < GW - 1 && d[i + GW + 1] + D < v) v = d[i + GW + 1] + D;
        if (x > 0 && d[i + GW - 1] + D < v) v = d[i + GW - 1] + D;
      }
      d[i] = v;
    }
    for (let i = 0; i < N; i++) d[i] *= CELL;
    return d;
  }
  function stampLine(mask, pts, rad) {
    const rc = Math.max(1, Math.round(rad / CELL));
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const L = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(L / CELL));
      for (let s = 0; s <= steps; s++) {
        const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps;
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        for (let oy = -rc + 1; oy < rc; oy++) for (let ox = -rc + 1; ox < rc; ox++) {
          const gx = cx + ox, gy = cy + oy;
          if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) mask[gy * GW + gx] = 1;
        }
      }
    }
  }

  world.generate = function () {
    // --- coastline polygon with natural wobble
    let poly = I.spline(COAST, 10, true);
    poly = poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length], o = poly[(i - 1 + poly.length) % poly.length];
      let nx = q[1] - o[1], ny = -(q[0] - o[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const amp = p[1] > 1650 ? 8 : 20;
      const off = I.fbm(p[0] / 170, p[1] / 170, 3) * amp;
      return [p[0] + nx * off, p[1] + ny * off];
    });
    world.coastPoly = poly;
    // scanline fill
    const land = new Uint8Array(N);
    for (let gy = 0; gy < GH; gy++) {
      const y = (gy + 0.5) * CELL, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), x1 = Math.min(GW - 1, Math.floor(xs[k + 1] / CELL - 0.5));
        for (let gx = x0; gx <= x1; gx++) land[gy * GW + gx] = 1;
      }
    }
    const sea = new Uint8Array(N);
    for (let i = 0; i < N; i++) sea[i] = land[i] ? 0 : 1;
    const dl = chamfer(sea), ds = chamfer(land);
    for (let i = 0; i < N; i++) coastD[i] = land[i] ? dl[i] : -ds[i];

    const pm = new Uint8Array(N);
    world.PATHS.forEach(p => stampLine(pm, p, 4));
    pathD = world.pathD = chamfer(pm);
    const sm = new Uint8Array(N);
    stampLine(sm, STREAM, 3);
    streamD = world.streamD = chamfer(sm);

    // --- heights
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
      const d = coastD[i];
      let k = 0.085 + 0.35 * I.smooth(660, 470, x) + 0.12 * I.smooth(560, 380, y) + 0.06 * I.smooth(1900, 2070, x);
      let v;
      if (d >= 0) {
        v = 28 * (1 - Math.exp(-d * k / 28));
        const inl = I.smooth(30, 230, d);
        const rh = Math.hypot(x - 1680, y - 560);
        v += 96 * Math.exp(-Math.pow(rh / 255, 2.3)) * I.smooth(10, 120, d);
        v += 22 * Math.exp(-Math.pow(Math.hypot(x - 1020, y - 1000) / 430, 2)) * inl;
        v += 26 * Math.exp(-Math.pow(Math.hypot(x - 560, y - 760) / 200, 2)) * I.smooth(10, 80, d);
        v += I.fbm(x / 210, y / 210, 4) * 9 * inl + I.fbm(x / 60, y / 60, 2) * 1.6 * inl;
        // stream valley
        const sd = streamD[i];
        v -= 6 * Math.exp(-Math.pow(sd / 34, 2)) * I.smooth(10, 120, d);
        // gentle path benches
        const pd = pathD[i];
        if (pd < 20) v = I.lerp(v, v - 0.6, 1 - pd / 20);
      } else {
        const ks = 0.09 + 0.25 * I.smooth(620, 450, x);
        v = d * ks + I.fbm(x / 120, y / 120, 3) * 1.6;
        if (v < -46) v = -46;
      }
      // reef
      const dr = (x > 1300 && y > 1480) ? I.polyDist(x, y, REEF) : 999;
      if (dr < 70) {
        const r = -2.4 - Math.pow(dr / 26, 2) * 9 + I.fbm(x / 40, y / 40, 3) * 4.5;
        if (r > v) v = r;
      }
      // spit (rock causeway to the boat)
      const dsp = (x > 1640 && x < 1920 && y > 1520 && y < 1870) ? I.polyDist(x, y, SPIT) : 999;
      if (dsp < 40) {
        const r = 8.5 - Math.pow(dsp / 15, 2) * 9 + I.fbm(x / 22, y / 22, 2) * 1.4;
        if (r > v) v = r;
      }
      // rock pool cove
      const rp = Math.hypot(x - P.x, y - P.y);
      if (rp < 135) {
        const a = Math.atan2(y - P.y, x - P.x);
        const east = I.smooth(0.75, 0.35, Math.abs(a));
        if (rp < 36) v = -11 + 6 * Math.pow(rp / 36, 2);
        else if (rp < 61) v = I.lerp(-5, -3.7, (rp - 36) / 25) + I.fbm(x / 16, y / 16, 2) * 0.35;
        else {
          const tEnd = I.lerp(73, 128, east);
          const t = I.smooth(61, tEnd, rp);
          v = I.lerp(-3.7, v, t);
        }
        // channel to the sea
        const dc = I.segDist(x, y, 280, 884, 440, 880);
        if (dc < 26) v = I.lerp(v, Math.min(v, -7.5), I.smooth(26, 10, dc));
        // cave corridor (shelf)
        const dm = I.segDist(x, y, P.x, P.y - 50, MOUTH.x, MOUTH.y + 2);
        if (dm < 16 && y < P.y - 40) v = I.lerp(v, -4.4, I.smooth(16, 9, dm));
      }
      h[i] = v;
    }

    // --- derived fields
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
      const gxh = (h[i + (gx < GW - 1 ? 1 : 0)] - h[i - (gx > 0 ? 1 : 0)]) / (2 * CELL);
      const gyh = (h[i + (gy < GH - 1 ? GW : 0)] - h[i - (gy > 0 ? GW : 0)]) / (2 * CELL);
      const slope = Math.hypot(gxh, gyh);
      const v = h[i], d = coastD[i];
      const rp = Math.hypot(x - P.x, y - P.y);
      if (slope > 0.95 && v > -6 && rp < 140) block[i] = 1;
      // rocky regions
      const dsp = (x > 1640 && x < 1920 && y > 1520 && y < 1870) ? I.polyDist(x, y, SPIT) : 999;
      const dr = (x > 1300 && y > 1480) ? I.polyDist(x, y, REEF) : 999;
      const nz = I.fbm(x / 160 + 3, y / 160, 3);
      const shoreBand = d > -22 + nz * 10;
      let rock = (x < 640 + nz * 150 && d < 110 + I.fbm(x / 80, y / 80) * 40 && shoreBand) || rp < 120 || dsp < 26 || dr < 50 ||
        (y < 430 + nz * 110 && d < 55 + I.fbm(x / 70, y / 70) * 30 && shoreBand) || slope > 0.6 || (v > 78 && I.fbm(x / 50, y / 50) > 0.05);
      if (x > 1880 + nz * 120 && d < 60 && shoreBand && I.fbm(x / 60, y / 60) > -0.1) rock = true;
      let m;
      if (rock) m = 3;
      else if (v < 11.5 + I.fbm(x / 90, y / 90) * 2.5) m = 0;
      else if (v > 66) m = 4;
      else m = 1;
      // forest density
      let fd = I.smooth(110, 240, d) * (0.62 + 0.7 * I.fbm(x / 230 + 9, y / 230, 3));
      const clear = [[world.CAMP.x, world.CAMP.y, 120], [world.SPRING.x, world.SPRING.y, 95], [world.DEADTREE.x, world.DEADTREE.y, 80], [1680, 560, 190], [P.x, P.y, 150]];
      for (const c of clear) fd *= I.smooth(c[2] * 0.6, c[2], Math.hypot(x - c[0], y - c[1]));
      fd *= I.smooth(10, 40, pathD[i]);
      fd *= 1 - I.smooth(50, 80, v);
      forest[i] = fd;
      if (m === 1 && fd > 0.5) m = 2;
      mat[i] = m;
      // wave exposure & phase
      expo[i] = 0.12 + 0.88 * I.smooth(60, 150, rp) * I.smooth(20, 70, I.segDist(x, y, 280, 884, 440, 880) + (rp < 140 ? 0 : 200));
      phase[i] = I.fbm(x / 260, y / 260, 2) * 7 + x * 0.0025 - y * 0.0012;
    }
    // trails are always walkable
    for (let i = 0; i < N; i++) if (pathD[i] < 9) block[i] = 0;
    // cliffs flagged around the cave mouth (only the shelf leads in)
    world.cellBlockCircle = function (cx, cy, r, val) {
      const g0x = Math.floor((cx - r) / CELL), g1x = Math.ceil((cx + r) / CELL);
      const g0y = Math.floor((cy - r) / CELL), g1y = Math.ceil((cy + r) / CELL);
      for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
        if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
        if (Math.hypot((gx + 0.5) * CELL - cx, (gy + 0.5) * CELL - cy) < r) block[gy * GW + gx] = val;
      }
    };
    placeObjects();
  };

  // ---------------- queries ----------------
  world.idx = (x, y) => {
    const gx = I.clamp(Math.floor(x / CELL), 0, GW - 1), gy = I.clamp(Math.floor(y / CELL), 0, GH - 1);
    return gy * GW + gx;
  };
  world.hAt = function (x, y) {
    const fx = I.clamp(x / CELL - 0.5, 0, GW - 1.001), fy = I.clamp(y / CELL - 0.5, 0, GH - 1.001);
    const gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy, i = gy * GW + gx;
    const a = h[i], b = h[i + 1], c = h[i + GW], d = h[i + GW + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  world.matAt = (x, y) => mat[world.idx(x, y)];
  world.coastAt = (x, y) => coastD[world.idx(x, y)];
  world.pathAt = (x, y) => pathD[world.idx(x, y)];
  world.streamAt = (x, y) => streamD[world.idx(x, y)];
  world.blockedAt = (x, y) => block[world.idx(x, y)] === 1;
  world.forestAt = (x, y) => forest[world.idx(x, y)];

  // ---------------- objects ----------------
  const objs = world.objs = [];
  let nextId = 1;
  function add(type, x, y, props) {
    const o = Object.assign({ id: type + '_' + (nextId++), type, x, y, r: 0 }, props || {});
    objs.push(o); return o;
  }
  world.add = add;

  function placeObjects() {
    const R = I.rng(4242);
    const spacing = [];
    const ok = (x, y, rad) => {
      for (const s of spacing) if (Math.hypot(s[0] - x, s[1] - y) < Math.max(rad, s[2])) return false;
      return true;
    };
    const reserve = (x, y, rad) => spacing.push([x, y, rad]);
    // keep special spots clear
    const keep = [[world.START.x, world.START.y, 70], [1080, 1712, 55], [world.CAMP.x, world.CAMP.y, 70], [world.SPRING.x, world.SPRING.y, 55],
      [world.HUT.x, world.HUT.y, 80], [world.TOWER.x, world.TOWER.y, 55], [P.x, P.y, 95], [world.DEADTREE.x, world.DEADTREE.y, 40], [905, 1712, 45]];
    keep.forEach(k => reserve(k[0], k[1], k[2]));

    // ---- special set pieces
    add('bptree', 905, 1716, { r: 9 });
    add('backpack', 912, 1772, { r: 0, reach: 40, hanging: true });
    add('debris', 1082, 1716, { r: 8, kind: 'crate', reach: 30 });
    add('plank', 1040, 1735, { r: 0, reach: 22, angle: 0.4 });
    add('buoy', 1132, 1728, { r: 6 });
    add('logpage', 1110, 1745, { r: 0, reach: 22 });
    add('boat', world.BOAT.x, world.BOAT.y, { r: 30, reach: 84 });
    add('tarp', world.CAMP.x + 30, world.CAMP.y - 34, { r: 20 });
    add('pit', world.CAMP.x - 8, world.CAMP.y + 6, { r: 0, reach: 30 });
    add('campcrate', world.CAMP.x + 62, world.CAMP.y + 8, { r: 9, reach: 28 });
    add('campnote', world.CAMP.x + 6, world.CAMP.y - 30, { r: 0, reach: 26 });
    add('rack', world.CAMP.x - 56, world.CAMP.y - 22, { r: 6 });
    add('spring', world.SPRING.x, world.SPRING.y, { r: 0, reach: 46, pr: 30 });
    add('fig', world.SPRING.x - 66, world.SPRING.y + 40, { r: 15, size: 92, shade: 150 });
    add('hut', world.HUT.x, world.HUT.y, { r: 0, reach: 46, w: 66, hgt: 46 });
    add('tower', world.TOWER.x, world.TOWER.y, { r: 16 });
    add('mouth', MOUTH.x, MOUTH.y, { r: 0, reach: 22 });
    add('deadtree', world.DEADTREE.x, world.DEADTREE.y, { r: 10 });
    add('sign', 1296, 1700, { r: 4, reach: 26, text: 'אל המגדל ⟵ / ⟶ אל המעיין' });
    add('sign', 1206, 1710, { r: 4, reach: 26, text: 'אל המעיין, לאורך הפלג' });
    add('sign', 560, 900, { r: 4, reach: 26, text: 'בריכת הסלע — רק בשפל!' });
    [[1452, 1505], [1505, 1340], [1625, 1165], [1580, 1012], [1712, 868], [1652, 702]].forEach(p => add('cairn', p[0], p[1], { r: 6 }));
    // resin trees (tall pines with weeping bark)
    [[1188, 1236], [1530, 1385], [1560, 760]].forEach(p => { add('pine', p[0], p[1], { r: 7, resin: 1, size: 40 }); reserve(p[0], p[1], 40); });
    // berry bushes
    [[1185, 1335], [1030, 1230], [940, 850], [800, 960], [1330, 1050], [1100, 1395]].forEach(p => { add('berry', p[0], p[1], { r: 10, berries: 3 }); reserve(p[0], p[1], 30); });
    // mussel clusters in the intertidal band
    // (snapped to the intertidal band so they are only reachable when the sea is out)
    [[1765, 1690], [1815, 1765], [512, 846], [514, 922], [420, 1020], [1745, 1625]].forEach(p => {
      let best = null;
      for (let r = 0; r < 60 && !best; r += 3) for (let a = 0; a < I.TAU && !best; a += 0.4) {
        const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r, v = world.hAt(x, y);
        if (v > -3.4 && v < 0.6) best = [x, y];
      }
      if (best) add('mussel', best[0], best[1], { r: 0, reach: 22, n: 2 });
    });

    // ---- palms along beaches
    let tries = 0, cnt = 0;
    while (cnt < 120 && tries < 20000) {
      tries++;
      const x = 380 + R() * 1700, y = 290 + R() * 1500;
      const i = world.idx(x, y), v = h[i], d = coastD[i];
      if (d < 0 || v < 7 || v > 26) continue;
      if (mat[i] === 3 && R() > 0.25) continue;
      if (pathD[i] < 14 || streamD[i] < 18) continue;
      const southBoost = y > 1550 ? 0.3 : 0.45;
      if (R() > southBoost) continue;
      const sp = y > 1550 ? 70 : 38;
      if (!ok(x, y, sp)) continue;
      add('palm', x, y, { r: 6, coconuts: 1 + Math.floor(R() * 2), fiber: 1, lean: (R() - 0.5) * 1.2 + (y > 1500 ? 0.3 : 0), hgt: 46 + R() * 22, seed: R() * 1000 });
      reserve(x, y, sp); cnt++;
    }
    // a couple of palms framing the opening scene
    [[958, 1640], [1140, 1655], [820, 1660], [1255, 1660]].forEach(p => { add('palm', p[0], p[1], { r: 6, coconuts: 2, fiber: 1, lean: 0.4, hgt: 58, seed: p[0] }); reserve(p[0], p[1], 30); });
    // ---- broadleaf trees in forest
    tries = 0; cnt = 0;
    while (cnt < 430 && tries < 40000) {
      tries++;
      const x = 380 + R() * 1700, y = 300 + R() * 1450;
      const i = world.idx(x, y);
      const fd = forest[i];
      if (h[i] < 13 || mat[i] === 3) continue;
      if (R() > fd * 1.25 + 0.04) continue;
      if (pathD[i] < 22 || streamD[i] < 20) continue;
      const size = 30 + R() * 26;
      if (!ok(x, y, size * 0.9)) continue;
      add('tree', x, y, { r: 9, size, seed: R() * 1000, hue: R() });
      reserve(x, y, size * 0.9); cnt++;
    }
    // ---- thickets (collidable bushes) in the jungle
    tries = 0; cnt = 0;
    while (cnt < 360 && tries < 30000) {
      tries++;
      const x = 380 + R() * 1700, y = 300 + R() * 1450;
      const i = world.idx(x, y);
      if (h[i] < 12 || mat[i] === 3) continue;
      if (R() > forest[i] * 1.1 + 0.03) continue;
      if (pathD[i] < 30 || streamD[i] < 22) continue;
      const size = 11 + R() * 9;
      if (!ok(x, y, size + 8)) continue;
      add('bush', x, y, { r: size * 0.8, size, seed: R() * 1000 });
      reserve(x, y, size + 6); cnt++;
    }
    // ---- boulders
    tries = 0; cnt = 0;
    while (cnt < 110 && tries < 20000) {
      tries++;
      const x = 330 + R() * 1800, y = 280 + R() * 1600;
      const i = world.idx(x, y);
      if (h[i] < 2 || pathD[i] < 14) continue;
      if (mat[i] !== 3 && R() > 0.06) continue;
      if (Math.hypot(x - P.x, y - P.y) < 72 || I.polyDist(x, y, SPIT) < 30) continue;
      const size = 7 + R() * 14;
      if (!ok(x, y, size + 6)) continue;
      add('rock', x, y, { r: size * 0.85, size, seed: R() * 1000 });
      reserve(x, y, size + 4); cnt++;
    }
    // ---- ferns / grass clumps (decor)
    tries = 0; cnt = 0;
    while (cnt < 900 && tries < 30000) {
      tries++;
      const x = 380 + R() * 1700, y = 300 + R() * 1500;
      const i = world.idx(x, y);
      if (h[i] < 10 || mat[i] === 3 || pathD[i] < 8) continue;
      const kind = mat[i] === 2 ? 'fern' : (mat[i] === 0 ? 'dunegrass' : 'grass');
      if (kind === 'dunegrass' && (h[i] < 9 || R() > 0.5)) continue;
      add(kind, x, y, { r: 0, seed: R() * 1000, size: 6 + R() * 7 });
      cnt++;
    }
    // ---- reeds & cattails along the stream, the spring and quiet water
    tries = 0; cnt = 0;
    while (cnt < 70 && tries < 6000) {
      tries++;
      let x, y;
      if (R() < 0.75) { const p = STREAM[Math.floor(R() * (STREAM.length - 12))]; const a = R() * I.TAU; x = p[0] + Math.cos(a) * (13 + R() * 6); y = p[1] + Math.sin(a) * (11 + R() * 5); }
      else { const a = R() * I.TAU; x = world.SPRING.x + Math.cos(a) * 40; y = world.SPRING.y + Math.sin(a) * 31; }
      const i = world.idx(x, y);
      if (h[i] < 7 || pathD[i] < 10 || streamD[i] < 9) continue;
      if (!ok(x, y, 9)) continue;
      add('reed', x, y, { r: 0, seed: R() * 100, size: 12 + R() * 7 });
      reserve(x, y, 7); cnt++;
    }
    // ---- driftwood on beaches
    const beachWood = [[860, 1702], [1180, 1722], [1290, 1735], [760, 1680], [1440, 1716], [1520, 1690], [690, 1640], [1000, 1736], [1600, 1650], [590, 1560]];
    beachWood.forEach((p, k) => add('drift', p[0], p[1], { r: 0, reach: 22, angle: R() * 3, len: 16 + R() * 12, beach: true, wid: k }));
    [[1930, 1240], [2000, 1010], [1880, 450], [700, 400], [1100, 340], [430, 1260]].forEach(p => add('drift', p[0], p[1], { r: 0, reach: 22, angle: R() * 3, len: 14 + R() * 10 }));
    // dry branches in the forest
    tries = 0; cnt = 0;
    while (cnt < 22 && tries < 8000) {
      tries++;
      const x = 450 + R() * 1550, y = 400 + R() * 1250;
      const i = world.idx(x, y);
      if (h[i] < 14 || pathD[i] > 60 || pathD[i] < 10 || mat[i] === 3) continue;
      if (!ok(x, y, 12)) continue;
      add('branch', x, y, { r: 0, reach: 22, angle: R() * 3, len: 14 + R() * 8 });
      reserve(x, y, 10); cnt++;
    }
    // stones along the stream and beaches
    for (let k = 0; k < 14; k++) {
      const p = STREAM[Math.floor(10 + R() * (STREAM.length - 25))];
      const x = p[0] + (R() - 0.5) * 60 + 18, y = p[1] + (R() - 0.5) * 30;
      if (I.world.streamAt(x, y) < 14) continue;
      add('stone', x, y, { r: 0, reach: 20, seed: R() * 1000 });
    }
    [[1060, 1670], [880, 1680], [1225, 1680], [1660, 1608], [600, 900], [1150, 1270], [1100, 1330]].forEach(p => add('stone', p[0], p[1], { r: 0, reach: 20, seed: R() * 1000 }));
    // crab holes on beaches
    world.crabHoles = [];
    tries = 0;
    while (world.crabHoles.length < 26 && tries < 6000) {
      tries++;
      const x = 450 + R() * 1500, y = 1450 + R() * 330;
      const i = world.idx(x, y);
      if (mat[i] !== 0 || h[i] < 6 || h[i] > 12) continue;
      world.crabHoles.push([x, y]);
    }
    // cliff collision around the cave mouth: only the shelf corridor is open
    world.cellBlockCircle(MOUTH.x, MOUTH.y - 14, 14, 1);

    // spatial hash
    world.grid = new Map();
    objs.forEach(o => world.hashAdd(o));
  }
  const BK = 80;
  world.hashAdd = function (o) {
    const k = Math.floor(o.x / BK) + ',' + Math.floor(o.y / BK);
    if (!world.grid.has(k)) world.grid.set(k, []);
    world.grid.get(k).push(o);
  };
  world.hashRemove = function (o) {
    const k = Math.floor(o.x / BK) + ',' + Math.floor(o.y / BK);
    const a = world.grid.get(k); if (!a) return;
    const j = a.indexOf(o); if (j >= 0) a.splice(j, 1);
    const g = objs.indexOf(o); if (g >= 0) objs.splice(g, 1);
  };
  world.near = function (x, y, rad, out) {
    out = out || [];
    const x0 = Math.floor((x - rad) / BK), x1 = Math.floor((x + rad) / BK);
    const y0 = Math.floor((y - rad) / BK), y1 = Math.floor((y + rad) / BK);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const a = world.grid.get(gx + ',' + gy);
      if (a) for (const o of a) out.push(o);
    }
    return out;
  };
  world.byId = id => objs.find(o => o.id === id);
  world.find = type => objs.find(o => o.type === type);
})();
