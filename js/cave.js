'use strict';
// ------------------------------------------------------------
//  The tide cave: tunnels, paintings, chalk waymarks, the tin box
// ------------------------------------------------------------
(function () {
  const CW = 1000, CH = 760, CC = 4;
  const GW = CW / CC, GH = CH / CC;
  const cave = I.cave = { W: CW, H: CH, CC, GW, GH };
  cave.ENTRY = { x: 905, y: 600 };
  cave.EXIT_X = 948;
  const TUN = [
    { p: [[985, 602], [930, 600], [840, 592], [760, 585]], r: 30 },
    { p: [[760, 585], [690, 570], [640, 562]], r: 62 },
    { p: [[690, 600], [700, 660], [705, 700]], r: 30 },
    { p: [[620, 560], [596, 470], [575, 380], [556, 320]], r: 25 },
    { p: [[556, 320], [520, 250], [500, 210]], r: 78 },
    { p: [[620, 560], [540, 606], [450, 630], [380, 638]], r: 24 },
    { p: [[380, 638], [290, 606], [230, 590], [200, 580]], r: 86 },
  ];
  cave.PAINTINGS = [
    { id: 'hands', x: 690, y: 516, title: 'כפות ידיים', text: 'עשרות כפות ידיים באוכרה אדומה, קטנות וגדולות, כאילו משפחה שלמה חתמה כאן את שמה.' },
    { id: 'tide', x: 708, y: 724, title: 'הירח והגלים', text: 'ירח, ומתחתיו קווי גלים. מתחת לגלים — קשת שחורה, פתח המערה. בציור השני הגלים נמוכים והקשת פתוחה. הם ידעו לחכות לשפל.' },
    { id: 'canoe', x: 506, y: 150, title: 'סירת החותרים', text: 'סירה ארוכה עם שמונה חותרים ודגים גדולים סביבה. מישהו הגיע לאי הזה מזמן, מעבר לשונית — והצליח לחזור.' },
    { id: 'map', x: 262, y: 512, title: 'מפת האי', text: 'קו החוף של האי, הר, ופלג שיורד ממנו. ליד ראש ההר מישהו הוסיף בגיר לבן קו זקוף ומילה אחת: "המגדל".' },
  ];
  cave.MARKS = [
    { x: 640, y: 590, a: Math.PI * 0.85 },
    { x: 520, y: 640, a: Math.PI * 0.98 },
    { x: 410, y: 662, a: Math.PI * 1.05 },
    { x: 610, y: 505, a: -Math.PI / 2, cross: true },
  ];
  cave.BOX = { x: 196, y: 566 };
  cave.SKY = { x: 268, y: 586 };

  cave.generate = function () {
    const floor = cave.floor = new Uint8Array(GW * GH);
    for (const t of TUN) {
      for (let k = 0; k < t.p.length - 1; k++) {
        const [ax, ay] = t.p[k], [bx, by] = t.p[k + 1];
        const L = Math.hypot(bx - ax, by - ay);
        for (let s = 0; s <= L; s += 3) {
          const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L;
          const rr = t.r * (0.82 + 0.3 * (I.noise(x / 40, y / 40) + 0.5));
          const g0x = Math.floor((x - rr) / CC), g1x = Math.ceil((x + rr) / CC), g0y = Math.floor((y - rr) / CC), g1y = Math.ceil((y + rr) / CC);
          for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
            if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
            const cx = (gx + 0.5) * CC, cy = (gy + 0.5) * CC;
            const dd = Math.hypot(cx - x, cy - y) + I.noise(cx / 14, cy / 14) * 7;
            if (dd < rr) floor[gy * GW + gx] = 1;
          }
        }
      }
    }
    // distance to wall for shading
    const dist = cave.dist = new Float32Array(GW * GH);
    for (let i = 0; i < dist.length; i++) dist[i] = floor[i] ? 1e9 : 0;
    for (let pass = 0; pass < 2; pass++) {
      const rng = pass === 0 ? [0, GH, 1] : [GH - 1, -1, -1];
      for (let gy = rng[0]; gy !== rng[1]; gy += rng[2]) for (let gx = pass === 0 ? 0 : GW - 1; pass === 0 ? gx < GW : gx >= 0; gx += pass === 0 ? 1 : -1) {
        const i = gy * GW + gx; let v = dist[i];
        const nb = pass === 0 ? [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]] : [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]];
        for (const [ox, oy, c] of nb) {
          const x = gx + ox, y = gy + oy;
          if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
          const u = dist[y * GW + x] + c; if (u < v) v = u;
        }
        dist[i] = v;
      }
    }
    paint();
  };
  cave.floorAt = function (x, y) {
    const gx = Math.floor(x / CC), gy = Math.floor(y / CC);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return false;
    return cave.floor[gy * GW + gx] === 1;
  };
  cave.wallDist = function (x, y) {
    const gx = I.clamp(Math.floor(x / CC), 0, GW - 1), gy = I.clamp(Math.floor(y / CC), 0, GH - 1);
    return cave.dist[gy * GW + gx] * CC;
  };

  function paint() {
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const x = c.getContext('2d');
    const img = x.createImageData(CW, CH), d = img.data;
    for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) {
      const fx = I.clamp(px / CC - 0.5, 0, GW - 1.001), fy = I.clamp(py / CC - 0.5, 0, GH - 1.001);
      const gx = fx | 0, gy = fy | 0, tx = fx - gx, ty = fy - gy, D = cave.dist, i0 = gy * GW + gx;
      const dd = D[i0] * (1 - tx) * (1 - ty) + D[i0 + 1] * tx * (1 - ty) + D[i0 + GW] * (1 - tx) * ty + D[i0 + GW + 1] * tx * ty;
      const wd = (dd - 0.5) * CC + I.noise(px / 7, py / 7) * 1.5;
      const n = I.noise(px / 9, py / 9) * 10 + I.noise(px / 40, py / 40) * 14;
      const o = (py * CW + px) * 4;
      let r, g, b;
      if (wd > 0) {
        const t = I.clamp(wd / 40, 0, 1);
        const rim = wd < 2 ? wd / 2 : 1;
        r = 92 + t * 30 + n; g = 82 + t * 24 + n; b = 70 + t * 18 + n;
        if (wd < 7) { r -= 30 * (1 - wd / 7); g -= 30 * (1 - wd / 7); b -= 26 * (1 - wd / 7); }
        r = I.lerp(52, r, rim); g = I.lerp(46, g, rim); b = I.lerp(42, b, rim);
      } else {
        // rock wall, lit rim facing the floor
        r = 52 + n * 0.8; g = 46 + n * 0.8; b = 42 + n * 0.7;
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // walls-only layer (floor transparent) so tide water can sit under the rock
    const wc = document.createElement('canvas'); wc.width = CW; wc.height = CH;
    const wimg = x.createImageData(CW, CH);
    for (let i = 0; i < d.length; i += 4) {
      const px = (i >> 2) % CW, py = ((i >> 2) / CW) | 0;
      const fx = I.clamp(px / CC - 0.5, 0, GW - 1.001), fy = I.clamp(py / CC - 0.5, 0, GH - 1.001);
      const gx = fx | 0, gy = fy | 0, tx = fx - gx, ty = fy - gy, D = cave.dist, i0 = gy * GW + gx;
      const dd = D[i0] * (1 - tx) * (1 - ty) + D[i0 + 1] * tx * (1 - ty) + D[i0 + GW] * (1 - tx) * ty + D[i0 + GW + 1] * tx * ty;
      const a = I.clamp(1 - ((dd - 0.5) * CC + 1) / 2.5, 0, 1);
      wimg.data[i] = d[i]; wimg.data[i + 1] = d[i + 1]; wimg.data[i + 2] = d[i + 2]; wimg.data[i + 3] = a * 255;
    }
    wc.getContext('2d').putImageData(wimg, 0, 0);
    cave.wallCanvas = wc;
    const R = I.rng(55);
    // wall rims
    for (let k = 0; k < 7000; k++) {
      const px = R() * CW, py = R() * CH;
      if (cave.floorAt(px, py)) continue;
      const near = cave.floorAt(px, py + 6) || cave.floorAt(px + 5, py) || cave.floorAt(px - 5, py) || cave.floorAt(px, py - 5);
      if (!near) continue;
      x.fillStyle = cave.floorAt(px, py + 6) ? 'rgba(150,135,115,0.35)' : 'rgba(25,20,18,0.4)';
      x.beginPath(); x.ellipse(px, py, 2 + R() * 3, 1 + R() * 2, R() * 3, 0, I.TAU); x.fill();
    }
    // floor pebbles, puddles, stalagmites
    for (let k = 0; k < 2200; k++) {
      const px = R() * CW, py = R() * CH;
      if (!cave.floorAt(px, py)) continue;
      const roll = R();
      if (roll < 0.04) {
        x.fillStyle = 'rgba(40,60,70,0.55)';
        x.beginPath(); x.ellipse(px, py, 6 + R() * 10, 3 + R() * 5, R() * 3, 0, I.TAU); x.fill();
        x.fillStyle = 'rgba(160,190,200,0.18)';
        x.beginPath(); x.ellipse(px - 2, py - 1, 3 + R() * 4, 1 + R() * 2, 0, 0, I.TAU); x.fill();
      } else if (roll < 0.1 && cave.wallDist(px, py) < 22) {
        const g = x.createRadialGradient(px - 1, py - 2, 0, px, py, 5);
        g.addColorStop(0, '#c4b49a'); g.addColorStop(1, '#5b5044');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, 3 + R() * 3, 0, I.TAU); x.fill();
      } else {
        x.fillStyle = R() < 0.5 ? 'rgba(60,52,44,0.5)' : 'rgba(170,155,130,0.3)';
        x.beginPath(); x.arc(px, py, 0.8 + R() * 1.6, 0, I.TAU); x.fill();
      }
    }
    // ---- paintings (ochre & charcoal on the walls)
    const ochre = 'rgba(176,64,34,0.85)', soot = 'rgba(25,18,14,0.8)', chalk = 'rgba(240,236,220,0.9)';
    const P = {};
    cave.PAINTINGS.forEach(p => P[p.id] = p);
    // hands
    (function () {
      const p = P.hands;
      for (let k = 0; k < 11; k++) {
        const hx = p.x - 55 + k * 11 + R() * 4, hy = p.y - 14 + Math.sin(k) * 9, s = 0.6 + R() * 0.5;
        x.save(); x.translate(hx, hy); x.rotate((R() - 0.5) * 0.6); x.scale(s, s);
        x.fillStyle = k % 3 === 0 ? soot : ochre;
        x.beginPath(); x.ellipse(0, 4, 5, 6, 0, 0, I.TAU); x.fill();
        for (let f = 0; f < 5; f++) { const a = -2.4 + f * 0.42; x.beginPath(); x.ellipse(Math.cos(a) * 7, 2 + Math.sin(a) * 8, 1.4, 3.4, a + Math.PI / 2, 0, I.TAU); x.fill(); }
        x.restore();
      }
    })();
    // tide
    (function () {
      const p = P.tide;
      [[-26, 1], [26, 0]].forEach(([ox, low]) => {
        const cx = p.x + ox, cy = p.y - 6;
        x.strokeStyle = ochre; x.lineWidth = 2;
        x.beginPath(); x.arc(cx, cy - 16, 6, 0.6, Math.PI * 2 - 0.6); x.stroke();
        x.fillStyle = soot; x.beginPath(); x.arc(cx, cy + 12, 8, Math.PI, 0); x.fill();
        x.strokeStyle = ochre; x.lineWidth = 1.6;
        const wy = low ? cy + 14 : cy + 2;
        for (let r2 = 0; r2 < 2; r2++) {
          x.beginPath();
          for (let s = -14; s <= 14; s += 2) x.lineTo(cx + s, wy + r2 * 4 + Math.sin(s * 0.6) * 1.6);
          x.stroke();
        }
      });
    })();
    // canoe
    (function () {
      const p = P.canoe;
      x.strokeStyle = ochre; x.lineWidth = 3;
      x.beginPath(); x.moveTo(p.x - 50, p.y - 4); x.quadraticCurveTo(p.x, p.y + 14, p.x + 50, p.y - 6); x.stroke();
      for (let k = 0; k < 8; k++) {
        const px = p.x - 35 + k * 10;
        x.fillStyle = soot; x.beginPath(); x.arc(px, p.y - 6, 2.2, 0, I.TAU); x.fill();
        x.strokeStyle = soot; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, p.y - 4); x.lineTo(px - 6, p.y + 10); x.stroke();
      }
      x.fillStyle = ochre;
      [[-60, 22], [40, 24], [-10, 30]].forEach(([ox, oy]) => {
        x.beginPath(); x.ellipse(p.x + ox, p.y + oy, 10, 4, 0, 0, I.TAU); x.fill();
        x.beginPath(); x.moveTo(p.x + ox + 9, p.y + oy); x.lineTo(p.x + ox + 15, p.y + oy - 4); x.lineTo(p.x + ox + 15, p.y + oy + 4); x.fill();
      });
    })();
    // island map
    (function () {
      const p = P.map;
      x.strokeStyle = ochre; x.lineWidth = 2;
      x.beginPath();
      for (let k = 0; k <= 24; k++) { const a = k / 24 * I.TAU, rr = 26 + Math.sin(a * 3) * 4; x.lineTo(p.x + Math.cos(a) * rr * 1.2, p.y + Math.sin(a) * rr * 0.8); }
      x.stroke();
      x.fillStyle = soot; x.beginPath(); x.moveTo(p.x + 8, p.y - 2); x.lineTo(p.x + 16, p.y - 16); x.lineTo(p.x + 24, p.y - 2); x.fill();
      x.strokeStyle = 'rgba(60,110,160,0.8)'; x.beginPath(); x.moveTo(p.x - 6, p.y - 6); x.quadraticCurveTo(p.x - 2, p.y + 8, p.x + 2, p.y + 20); x.stroke();
      x.strokeStyle = chalk; x.lineWidth = 1.6; x.beginPath(); x.moveTo(p.x + 16, p.y - 16); x.lineTo(p.x + 16, p.y - 30); x.stroke();
      x.fillStyle = chalk; x.font = 'bold 7px Heebo, Arial'; x.textAlign = 'center'; x.fillText('המגדל', p.x + 16, p.y - 33);
    })();
    // chalk waymarks
    cave.MARKS.forEach(m => {
      x.save(); x.translate(m.x, m.y); x.rotate(m.a);
      x.strokeStyle = chalk; x.lineWidth = 2.2;
      if (m.cross) { x.beginPath(); x.moveTo(-7, -7); x.lineTo(7, 7); x.moveTo(7, -7); x.lineTo(-7, 7); x.stroke(); }
      else { x.beginPath(); x.moveTo(-12, 0); x.lineTo(10, 0); x.moveTo(3, -6); x.lineTo(10, 0); x.lineTo(3, 6); x.stroke(); }
      x.restore();
    });
    // ledge for the box
    x.fillStyle = 'rgba(130,118,100,0.9)';
    x.beginPath(); x.ellipse(cave.BOX.x, cave.BOX.y + 6, 22, 10, 0, 0, I.TAU); x.fill();
    cave.canvas = c;
  }
})();
