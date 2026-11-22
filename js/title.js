'use strict';
// ------------------------------------------------------------
//  Title: a painted side view of the opening scene
// ------------------------------------------------------------
(function () {
  const T = I.title = { on: false };
  let cv, x, W, H, t = 0, mx = 0, my = 0, raf = 0, last = 0;
  const R = I.rng(2024);
  const canopy = [], clouds = [], palms = [];
  for (let k = 0; k < 60; k++) canopy.push([R(), R(), R()]);
  for (let k = 0; k < 9; k++) clouds.push([R() * 1.4, R() * 0.32, 0.12 + R() * 0.2, R()]);
  for (let k = 0; k < 4; k++) palms.push([0.06 + k * 0.11 + R() * 0.04, 0.2 + R() * 0.1, R() * 6, (R() - 0.3) * 0.25]);

  T.init = function (canvas) {
    cv = canvas; x = cv.getContext('2d');
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
    T.resize();
  };
  T.resize = function () {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = Math.floor(innerWidth * dpr); H = cv.height = Math.floor(innerHeight * dpr);
  };
  T.show = function () {
    T.on = true; cv.style.display = 'block'; cv.style.opacity = 1;
    last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  T.hide = function () {
    T.on = false;
    cv.style.transition = 'opacity .9s'; cv.style.opacity = 0;
    setTimeout(() => { if (!T.on) { cv.style.display = 'none'; cancelAnimationFrame(raf); } }, 950);
  };
  function loop(now) {
    t += Math.min(0.05, (now - last) / 1000); last = now;
    draw();
    if (T.on || cv.style.opacity !== '0') raf = requestAnimationFrame(loop);
  }

  function draw() {
    const s = Math.min(W, H * 1.8) / 1000; // scale unit
    const hz = H * 0.56; // horizon
    const px = mx * 20 * s, py = my * 10 * s;
    // ---- sky
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#2d4560'); g.addColorStop(0.45, '#7d8aa0'); g.addColorStop(0.78, '#e7b49a'); g.addColorStop(1, '#ffd9a8');
    x.fillStyle = g; x.fillRect(0, 0, W, hz + 2);
    // sun and rays
    const sx = W * 0.78 + px * 0.2, sy = hz - 70 * s;
    g = x.createRadialGradient(sx, sy, 5, sx, sy, 420 * s);
    g.addColorStop(0, 'rgba(255,245,210,1)'); g.addColorStop(0.1, 'rgba(255,220,160,.7)'); g.addColorStop(1, 'rgba(255,200,150,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 - 0.9 + k * 0.22 + Math.sin(t * 0.1 + k) * 0.02;
      x.fillStyle = `rgba(255,230,180,${0.05 + 0.03 * Math.sin(t * 0.4 + k * 2)})`;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a - 0.04) * W, sy + Math.sin(a - 0.04) * W); x.lineTo(sx + Math.cos(a + 0.04) * W, sy + Math.sin(a + 0.04) * W); x.fill();
    }
    x.restore();
    // storm clouds drifting away
    for (const c of clouds) {
      const cx = (((c[0] - t * 0.006 * (0.5 + c[3])) % 1.5 + 1.5) % 1.5 - 0.25) * W + px * 0.3, cy = c[1] * hz + 20 * s, r = c[2] * W * 0.5;
      for (let k = 0; k < 7; k++) {
        const ox = (k - 3) * r * 0.32, oy = Math.sin(k * 1.7 + c[3] * 5) * r * 0.1, rr = r * (0.35 + 0.15 * Math.sin(k * 2.3 + c[3] * 9));
        g = x.createRadialGradient(cx + ox, cy + oy - rr * 0.3, rr * 0.1, cx + ox, cy + oy, rr);
        g.addColorStop(0, `rgba(${150 + c[3] * 60},${150 + c[3] * 50},${170 + c[3] * 40},.9)`); g.addColorStop(1, 'rgba(70,80,100,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy + oy, rr, 0, I.TAU); x.fill();
      }
    }
    // ---- sea
    g = x.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#7fb4c4'); g.addColorStop(0.25, '#3c9fc0'); g.addColorStop(0.6, '#3dbcc6'); g.addColorStop(1, '#86e0d2');
    x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
    // sun glitter
    for (let k = 0; k < 90; k++) {
      const gx = sx + (Math.sin(k * 12.9898) * 0.5) * 260 * s * (1 + k / 60), gy = hz + 4 + (k / 90) * (H * 0.18);
      const a = Math.max(0, Math.sin(t * 3 + k * 1.7)) * 0.8;
      x.fillStyle = `rgba(255,245,215,${a})`; x.fillRect(gx, gy, 6 * s * (1 + k / 50), 1.5 * s);
    }
    // swell lines
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1.5 * s;
    for (let k = 0; k < 14; k++) {
      const yy = hz + 10 * s + k * k * 2.2 * s + ((t * 6 * s) % (8 * s));
      x.beginPath();
      for (let xx = 0; xx <= W; xx += 20 * s) x.lineTo(xx, yy + Math.sin(xx / (60 * s) + t + k) * 2 * s);
      x.stroke();
    }
    // ---- reef & boat
    const ry = hz + 46 * s + py * 0.3;
    for (let k = 0; k < 26; k++) {
      const rx = W * 0.48 + k * W * 0.022 + px * 0.4;
      x.fillStyle = '#3b4a4a'; x.beginPath(); x.ellipse(rx, ry + Math.sin(k * 3) * 3 * s, (8 + (k * 7) % 9) * s, 4 * s, 0, Math.PI, 0); x.fill();
      const burst = Math.pow(Math.max(0, Math.sin(t * 0.9 - k * 0.45)), 6);
      if (burst > 0.05) { x.fillStyle = `rgba(255,255,255,${burst * 0.85})`; x.beginPath(); x.ellipse(rx, ry - 4 * s * burst, 16 * s * burst + 4 * s, 9 * s * burst, 0, 0, I.TAU); x.fill(); }
    }
    boat(W * 0.84 + px * 0.4, ry - 4 * s, s);
    // ---- island: hill, jungle, antenna peeking
    const ix = px * 0.6, iy = py * 0.5;
    x.fillStyle = '#5f7a5a';
    x.beginPath(); x.moveTo(-10, hz - 60 * s); x.bezierCurveTo(W * 0.04, hz - 200 * s, W * 0.1 + ix, hz - 250 * s + iy, W * 0.17 + ix, hz - 250 * s + iy);
    x.bezierCurveTo(W * 0.28 + ix, hz - 245 * s, W * 0.4, hz - 60 * s, W * 0.62, hz + 30 * s); x.lineTo(-10, hz + 40 * s); x.fill();
    // antenna (behind the canopy line)
    const ax = W * 0.17 + ix, ay = hz - 232 * s + iy;
    x.strokeStyle = '#3d4a52'; x.lineWidth = 2 * s;
    x.beginPath(); x.moveTo(ax - 10 * s, ay + 20 * s); x.lineTo(ax - 1.5 * s, ay - 92 * s); x.lineTo(ax + 1.5 * s, ay - 92 * s); x.lineTo(ax + 10 * s, ay + 20 * s); x.stroke();
    x.lineWidth = 0.8 * s;
    for (let k = 0; k < 7; k++) { const yy = ay + 20 * s - k * 16 * s, w1 = 10 - k * 1.2, w2 = 10 - (k + 1) * 1.2; x.beginPath(); x.moveTo(ax - w1 * s, yy); x.lineTo(ax + w2 * s, yy - 16 * s); x.moveTo(ax + w1 * s, yy); x.lineTo(ax - w2 * s, yy - 16 * s); x.stroke(); }
    x.beginPath(); x.moveTo(ax, ay - 92 * s); x.lineTo(ax, ay - 108 * s); x.stroke();
    const blink = (t % 2.4) < 0.3;
    x.fillStyle = blink ? '#ff4a3a' : '#7a2a22'; x.beginPath(); x.arc(ax, ay - 108 * s, 2.5 * s, 0, I.TAU); x.fill();
    if (blink) { g = x.createRadialGradient(ax, ay - 108 * s, 0, ax, ay - 108 * s, 18 * s); g.addColorStop(0, 'rgba(255,80,60,.7)'); g.addColorStop(1, 'rgba(255,80,60,0)'); x.fillStyle = g; x.fillRect(ax - 20 * s, ay - 128 * s, 40 * s, 40 * s); }
    // jungle canopy layers
    const layers = [['#3f6145', -150, 0.7], ['#36583c', -80, 0.85], ['#2c4a32', -10, 1]];
    layers.forEach(([col, off, par], li) => {
      x.fillStyle = col;
      x.beginPath(); x.moveTo(-20, H);
      for (let k = 0; k <= 40; k++) {
        const u = k / 40, xx = u * W * 0.66 - 20 + px * par;
        const hill = Math.sin(u * Math.PI * 0.95) * (li === 0 ? 120 : li === 1 ? 70 : 30) * s;
        const bump = (Math.sin(k * 1.9 + li * 3) * 0.5 + 0.5) * 22 * s + Math.sin(t * 0.8 + k + li) * 1.5 * s;
        x.lineTo(xx, hz + off * s - hill - bump + 40 * s + I.smooth(0.7, 1, u) * (190 + li * 30) * s);
      }
      x.lineTo(W * 0.66 + px, H); x.fill();
      // highlights
      x.fillStyle = `rgba(150,200,120,${0.12 + li * 0.04})`;
      for (let k = 0; k < 18; k++) {
        const u = canopy[k + li * 18][0], xx = u * W * 0.6 + px * par, yy = hz + off * s + 40 * s - Math.sin(u * Math.PI * 0.95) * (li === 0 ? 120 : li === 1 ? 70 : 30) * s - 8 * s;
        x.beginPath(); x.arc(xx, yy, (8 + canopy[k][1] * 10) * s, Math.PI, 0); x.fill();
      }
    });
    // ---- beach foreground
    const by = H * 0.8 + py;
    g = x.createLinearGradient(0, by - 60 * s, 0, H);
    g.addColorStop(0, '#e9d4a2'); g.addColorStop(1, '#f6e8c4');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(-10, H); x.lineTo(-10, by - 70 * s);
    x.quadraticCurveTo(W * 0.25, by - 72 * s, W * 0.4, by - 38 * s);
    for (let k = 0; k <= 40; k++) { const xx = W * 0.4 + k / 40 * W * 0.62, v = k / 40; x.lineTo(xx, by - 38 * s + v * 82 * s + Math.sin(v * 5) * 6 * s); }
    x.lineTo(W + 10, H); x.fill();
    // wet sand & swash along the shoreline
    const sw = (Math.sin(t * 0.85) * 0.5 + 0.5), swe = sw * sw * sw;
    const shore = u => { const xx = W * 0.4 + u * (W * 0.62); const v = (xx - W * 0.4) / (W * 0.62); return [xx, by - 38 * s + v * 82 * s + Math.sin(v * 5) * 6 * s]; };
    const band = (k0, k1, col) => {
      x.fillStyle = col; x.beginPath();
      for (let k = 0; k <= 40; k++) { const [xx, yy] = shore(k / 40); x.lineTo(xx, yy + k0 * s * (0.4 + k / 40)); }
      for (let k = 40; k >= 0; k--) { const [xx, yy] = shore(k / 40); x.lineTo(xx, yy + k1 * s * (0.4 + k / 40) + Math.sin(k * 0.9 + t * 2) * 1.5 * s); }
      x.fill();
    };
    band(0, 46, 'rgba(170,140,95,.32)');
    band(-8, 6 + swe * 36, 'rgba(110,215,212,.6)');
    x.strokeStyle = 'rgba(255,255,255,.92)'; x.lineWidth = 3 * s; x.beginPath();
    for (let k = 0; k <= 40; k++) { const [xx, yy] = shore(k / 40); x.lineTo(xx, yy + (6 + swe * 36) * s * (0.4 + k / 40) + Math.sin(k * 0.9 + t * 2) * 1.5 * s); }
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2 * s; x.beginPath();
    for (let k = 0; k <= 40; k++) { const [xx, yy] = shore(k / 40); x.lineTo(xx, yy - (14 + (1 - swe) * 20) * s); }
    x.stroke();
    // palms on the beach
    palms.forEach((p, k) => palm(p[0] * W + px * 1.1, by - 50 * s + k * 12 * s, (220 + k * 30) * s * 0.7, p[2], p[3]));
    // driftwood & crate
    x.fillStyle = '#c9b89a'; x.save(); x.translate(W * 0.3 + px, by + 30 * s); x.rotate(-0.1); x.fillRect(-60 * s, -5 * s, 120 * s, 10 * s); x.restore();
    x.fillStyle = '#7a5a3a'; x.save(); x.translate(W * 0.42 + px, by + 5 * s); x.rotate(0.12); x.fillRect(-22 * s, -30 * s, 44 * s, 30 * s); x.fillStyle = '#a07a50'; x.fillRect(-22 * s, -30 * s, 44 * s, 8 * s); x.restore();
    // leaning tree with the backpack over the water
    leanTree(W * 0.47 + px * 1.2, by - 30 * s, s);
    // gulls
    for (let k = 0; k < 4; k++) {
      const gx = ((t * 30 * s * (1 + k * 0.2) + k * W * 0.3) % (W + 200)) - 100, gy = hz * 0.4 + k * 40 * s + Math.sin(t + k) * 20 * s;
      const f = Math.sin(t * 7 + k) * 8 * s;
      x.strokeStyle = '#2a3440'; x.lineWidth = 2 * s;
      x.beginPath(); x.moveTo(gx - 12 * s, gy - f); x.quadraticCurveTo(gx - 5 * s, gy - 5 * s, gx, gy); x.quadraticCurveTo(gx + 5 * s, gy - 5 * s, gx + 12 * s, gy - f); x.stroke();
    }
    // light drizzle
    x.strokeStyle = 'rgba(220,230,240,.18)'; x.lineWidth = 1;
    x.beginPath();
    for (let k = 0; k < 80; k++) { const rx = ((k * 997 + t * 200) % W), ryy = ((k * 571 + t * 700) % H); x.moveTo(rx, ryy); x.lineTo(rx - 3, ryy + 14); }
    x.stroke();
    // vignette
    g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,15,30,.5)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  function palm(bx, by, h, seed, lean) {
    const sway = Math.sin(t * 0.9 + seed) * 0.04;
    const tx = bx + (lean + sway) * h, ty = by - h;
    x.strokeStyle = '#5a4630'; x.lineWidth = h * 0.05; x.lineCap = 'round';
    x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + lean * h * 0.2, by - h * 0.5, tx, ty); x.stroke();
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * 0.42 + sway * 3 + Math.sin(t * 1.3 + k + seed) * 0.03;
      const L = h * (0.42 + (k % 3) * 0.05);
      const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.5 + L * 0.35 * Math.abs(Math.cos(a));
      x.strokeStyle = k % 2 ? '#2f5a2c' : '#3e7034'; x.lineWidth = h * 0.012;
      for (let j = 1; j < 12; j++) {
        const u = j / 12, qx = tx + (ex - tx) * u, qy = ty + (ey - ty) * u - Math.sin(u * Math.PI) * L * 0.18;
        const ll = L * 0.16 * Math.sin(u * Math.PI);
        x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + ll * 0.3, qy + ll); x.stroke();
        x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx - ll * 0.3, qy + ll); x.stroke();
      }
      x.lineWidth = h * 0.008; x.strokeStyle = '#5a8a3c';
      x.beginPath(); x.moveTo(tx, ty); x.quadraticCurveTo((tx + ex) / 2, (ty + ey) / 2 - L * 0.18, ex, ey); x.stroke();
    }
    x.fillStyle = '#4a3018'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(tx - h * 0.02 + k * h * 0.02, ty + h * 0.03, h * 0.018, 0, I.TAU); x.fill(); }
  }
  function leanTree(bx, by, s) {
    x.lineCap = 'round';
    x.strokeStyle = '#3e2f22'; x.lineWidth = 20 * s;
    x.beginPath(); x.moveTo(bx, by); x.bezierCurveTo(bx + 10 * s, by - 80 * s, bx + 50 * s, by - 150 * s, bx + 110 * s, by - 185 * s); x.stroke();
    x.strokeStyle = '#5a4532'; x.lineWidth = 7 * s;
    x.beginPath(); x.moveTo(bx - 4 * s, by - 10 * s); x.bezierCurveTo(bx + 4 * s, by - 80 * s, bx + 44 * s, by - 148 * s, bx + 104 * s, by - 182 * s); x.stroke();
    const ex = bx + 230 * s, ey = by - 120 * s + Math.sin(t * 0.8) * 2 * s;
    x.strokeStyle = '#3e2f22'; x.lineWidth = 9 * s;
    x.beginPath(); x.moveTo(bx + 95 * s, by - 178 * s); x.quadraticCurveTo(bx + 170 * s, by - 175 * s, ex, ey); x.stroke();
    x.lineWidth = 4 * s; x.beginPath(); x.moveTo(bx + 170 * s, by - 160 * s); x.lineTo(bx + 200 * s, by - 190 * s); x.stroke();
    // foliage clusters
    const pal = ['#1f3d22', '#2f5a2c', '#4c8a3c', '#7fb855'];
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 26; k++) {
      const u = canopy[k][0], v = canopy[k][1], w2 = canopy[k + 26][2];
      const cx = bx + 30 * s + u * 190 * s + Math.sin(t * 0.7 + k) * 1.5 * s - pass * 3 * s, cy = by - 250 * s + v * 75 * s - Math.sin(u * Math.PI) * 25 * s - pass * 6 * s;
      const r = (12 + w2 * 13) * s * (1 - pass * 0.25);
      x.fillStyle = pal[pass + (k % 2)];
      x.beginPath(); x.arc(cx, cy, r, 0, I.TAU); x.fill();
    }
    // the backpack swinging from the branch tip, over the shallows
    const sw = Math.sin(t * 1.5) * 0.15;
    const hx = ex - 8 * s, hy = ey + 2 * s;
    x.save(); x.translate(hx, hy); x.rotate(sw);
    x.strokeStyle = '#2b241a'; x.lineWidth = 2.5 * s; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 30 * s); x.stroke();
    x.fillStyle = '#4f5d2c'; x.beginPath(); x.roundRect(-17 * s, 26 * s, 34 * s, 42 * s, 9 * s); x.fill();
    x.fillStyle = '#6b7a3a'; x.beginPath(); x.roundRect(-17 * s, 26 * s, 34 * s, 15 * s, 8 * s); x.fill();
    x.fillStyle = '#3c4622'; x.beginPath(); x.roundRect(-12 * s, 48 * s, 24 * s, 15 * s, 4 * s); x.fill();
    x.fillStyle = '#c9a66b'; x.fillRect(-2 * s, 40 * s, 4 * s, 7 * s);
    x.restore();
    x.fillStyle = 'rgba(40,70,40,.25)'; x.beginPath(); x.ellipse(hx, hy + 120 * s, 22 * s, 5 * s, 0, 0, I.TAU); x.fill();
  }
  function boat(bx, by, s) {
    x.save(); x.translate(bx, by); x.rotate(-0.16 + Math.sin(t * 0.6) * 0.01);
    x.fillStyle = '#163f73';
    x.beginPath(); x.moveTo(-70 * s, -10 * s); x.quadraticCurveTo(-60 * s, 14 * s, 0, 14 * s); x.quadraticCurveTo(60 * s, 12 * s, 80 * s, -14 * s); x.lineTo(-70 * s, -14 * s); x.fill();
    x.fillStyle = '#2e6fb7'; x.fillRect(-70 * s, -18 * s, 150 * s, 7 * s);
    x.fillStyle = '#f2f2ee'; x.fillRect(-10 * s, -44 * s, 40 * s, 26 * s);
    x.fillStyle = '#2a3b4a'; x.fillRect(-5 * s, -38 * s, 12 * s, 9 * s); x.fillRect(12 * s, -38 * s, 12 * s, 9 * s);
    x.strokeStyle = '#ddd'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(10 * s, -44 * s); x.lineTo(10 * s, -80 * s); x.stroke();
    x.restore();
    const f = Math.pow(Math.max(0, Math.sin(t * 0.9 - 2)), 4);
    x.fillStyle = `rgba(255,255,255,${0.5 + f * 0.4})`; x.beginPath(); x.ellipse(bx, by + 10 * s, (80 + f * 30) * s, (6 + f * 6) * s, 0, 0, I.TAU); x.fill();
  }
})();
