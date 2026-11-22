'use strict';
// ------------------------------------------------------------
//  Core helpers shared by every module (global namespace "I")
// ------------------------------------------------------------
const I = window.I = {};

I.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
I.lerp = (a, b, t) => a + (b - a) * t;
I.smooth = (e0, e1, x) => { const t = I.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
I.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
I.TAU = Math.PI * 2;

I.rng = function (seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- value / gradient noise ----------
(function () {
  const r = I.rng(1337);
  const perm = new Uint8Array(512);
  const p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * I.TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  I.noise = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = perm[X + perm[Y]], b = perm[X + 1 + perm[Y]];
    const c = perm[X + perm[Y + 1]], d = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[a] * xf + gy[a] * yf;
    const n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1);
    const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    return (n00 + u * (n10 - n00) + v * (n01 - n00) + u * v * (n00 - n10 - n01 + n11)) * 1.4;
  };
  I.fbm = function (x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += I.noise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };
})();

// ---------- geometry ----------
I.segDist = function (px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = I.clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};
I.polyDist = function (px, py, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = I.segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
};
// Catmull-Rom spline -> dense point list
I.spline = function (pts, per = 8, closed = false) {
  const out = [];
  const n = pts.length;
  const get = i => closed ? pts[(i + n) % n] : pts[I.clamp(i, 0, n - 1)];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
};
I.polyLength = function (pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
};

I.hex = function (h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
I.mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
I.rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------- items ----------
I.ITEMS = {
  wood:    { name: 'עצים', desc: 'ענפים יבשים ועצי סחף. דלק למדורה.' },
  stone:   { name: 'אבנים', desc: 'אבנים חלקות. טובות למעגל מדורה.' },
  fiber:   { name: 'סיבי דקל', desc: 'סיבים קשוחים מגזע הדקל. אפשר לשזור מהם חבל.' },
  resin:   { name: 'שרף', desc: 'שרף דביק וריחני. בוער לאט.' },
  coconut: { name: 'קוקוס', desc: 'מים ובשר לבן. משביע ומרווה.', food: 16, water: 12 },
  berries: { name: 'פירות בר', desc: 'פירות סגולים וחמצמצים.', food: 9, water: 3 },
  mussels: { name: 'צדפות', desc: 'צדפות טריות מהסלעים. צריך לבשל אותן לפני שאוכלים.' },
  cooked:  { name: 'צדפות צלויות', desc: 'חמות ומלוחות. ארוחה של ממש.', food: 30 },
  beans:   { name: 'שימורי שעועית', desc: 'פחית מעוכה, אבל סגורה.', food: 34 },
  bottle:  { name: 'בקבוק מים', desc: 'בקבוק מתכת. אפשר למלא במעיין או בפלג.' },
  rope:    { name: 'חבל', desc: 'חבל שזור מסיבי דקל. חזק מספיק כדי למשוך משהו כבד.' },
  torch:   { name: 'לפיד', desc: 'ענף עטוף סיבים ושרף. מאיר את החשכה.' },
  battery: { name: 'מצבר', desc: 'המצבר של הסירה. עדיין טעון, אם מאמינים לנורית.' },
  fuse:    { name: 'נתיך', desc: 'נתיך זכוכית חדש, עטוף בבד שמן.' },
};
I.ITEM_ORDER = ['bottle', 'wood', 'stone', 'fiber', 'resin', 'coconut', 'berries', 'mussels', 'cooked', 'beans', 'rope', 'torch', 'battery', 'fuse'];

I.RECIPES = [
  { id: 'rope', name: 'חבל', needs: { fiber: 3 }, opens: 'אפשר למשוך את הארגז התקוע בסירה.' },
  { id: 'fire', name: 'מדורה', needs: { wood: 3, stone: 2 }, tool: 'lighter', opens: 'לבשל, לנוח ולשמור התקדמות. אור וחום בלילה.' },
  { id: 'torch', name: 'לפיד', needs: { wood: 1, fiber: 1, resin: 1 }, nearFire: true, opens: 'מאיר מערות ומגלה את מה שמסתתר בחושך.' },
];

I.fmtTime = function (t) {
  const h = Math.floor(t % 24), m = Math.floor((t % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

// ---------- time of day (shared by the 2D and 3D renderers) ----------
(function () {
  // ---------- sky & light ----------
  const KEYS = [[0, [0.15, 0.19, 0.36]], [4.6, [0.16, 0.2, 0.38]], [5.5, [0.42, 0.37, 0.52]], [6.3, [0.98, 0.72, 0.58]], [7.3, [1, 0.93, 0.83]],
    [8.6, [1, 1, 0.98]], [15.8, [1, 0.98, 0.93]], [17.4, [1, 0.87, 0.68]], [18.5, [0.98, 0.63, 0.46]], [19.3, [0.6, 0.4, 0.55]], [20.2, [0.21, 0.23, 0.42]], [24, [0.15, 0.19, 0.36]]];
  I.sky = function (time, overcast) {
    const t = ((time % 24) + 24) % 24;
    let k = 0; while (k < KEYS.length - 2 && t > KEYS[k + 1][0]) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    let c = I.mix3(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    if (overcast > 0) c = I.mix3(c, [0.72, 0.76, 0.82], overcast * 0.7);
    const day = I.smooth(5.2, 7, t) * (1 - I.smooth(18.3, 20.2, t));
    const night = 1 - I.smooth(4.8, 6.2, t) + I.smooth(19.2, 20.6, t);
    const sunA = I.clamp((t - 6) / 13, 0, 1) * Math.PI; // 0 east .. PI west
    const dusk = Math.max(I.smooth(16.8, 18.6, t) * (1 - I.smooth(19.2, 20.4, t)), I.smooth(5, 6.2, t) * (1 - I.smooth(6.8, 8, t)));
    return { amb: c, day, night: I.clamp(night, 0, 1), sunDir: [-Math.cos(sunA), 0.45 + 0.2 * (1 - Math.sin(sunA))], shadowLen: 0.35 + 0.9 * (1 - Math.sin(sunA)), dusk };
  };

})();
