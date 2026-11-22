'use strict';
// ------------------------------------------------------------
//  Renderer: world, objects, player, effects, lighting
// ------------------------------------------------------------
(function () {
  const Rr = I.render = {};
  let cv, ctx, lightCv, lctx, cloudSpr, glowSpr;
  Rr.particles = [];

  Rr.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    lightCv = document.createElement('canvas'); lctx = lightCv.getContext('2d');
    // soft cloud blob
    cloudSpr = document.createElement('canvas'); cloudSpr.width = cloudSpr.height = 256;
    const c = cloudSpr.getContext('2d'), R = I.rng(9);
    for (let k = 0; k < 14; k++) {
      const a = R() * I.TAU, d = R() * 34, r = 34 + R() * 50;
      const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.8;
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, I.TAU); c.fill();
    }
    glowSpr = document.createElement('canvas'); glowSpr.width = glowSpr.height = 128;
    const gc = glowSpr.getContext('2d'); const gg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    gc.fillStyle = gg; gc.fillRect(0, 0, 128, 128);
    Rr.resize();
  };
  Rr.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    const maxW = 1920; if (w > maxW) { h = Math.floor(h * maxW / w); w = maxW; }
    cv.width = w; cv.height = h;
    lightCv.width = Math.ceil(w / 2); lightCv.height = Math.ceil(h / 2);
    Rr.baseZoom = Math.sqrt(w * h / (800 * 450));
  };
  Rr.size = () => [cv.width, cv.height];
  Rr.toScreen = function (cam, x, y) {
    const [w, h] = Rr.size();
    return [(x - cam.x) * cam.zoom + w / 2, (y - cam.y) * cam.zoom + h / 2];
  };

  // ---------- particles ----------
  Rr.emit = function (p) { if (Rr.particles.length < 600) Rr.particles.push(p); };
  function updateParticles(dt) {
    const ps = Rr.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.z !== undefined) { p.z += p.vz * dt; p.vz -= (p.g || 0) * dt; }
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
    }
  }
  function drawParticles(c, layer) {
    for (const p of Rr.particles) {
      if ((p.layer || 'top') !== layer) continue;
      const a = I.clamp(p.life / p.max, 0, 1);
      const y = p.y - (p.z || 0);
      if (p.kind === 'smoke') {
        c.fillStyle = `rgba(200,200,205,${0.18 * a})`;
        c.beginPath(); c.arc(p.x, y, p.r * (1.8 - a), 0, I.TAU); c.fill();
      } else if (p.kind === 'ember') {
        c.fillStyle = `rgba(255,${150 + 80 * a | 0},60,${a})`;
        c.fillRect(p.x - 0.7, y - 0.7, 1.4, 1.4);
      } else if (p.kind === 'spray') {
        c.fillStyle = `rgba(255,255,255,${0.75 * a})`;
        c.beginPath(); c.arc(p.x, y, p.r, 0, I.TAU); c.fill();
      } else if (p.kind === 'leaf') {
        c.save(); c.translate(p.x, y); c.rotate(p.rot + p.life * 3);
        c.fillStyle = p.col; c.globalAlpha = Math.min(1, a * 3);
        c.beginPath(); c.ellipse(0, 0, 2.6, 1.2, 0, 0, I.TAU); c.fill(); c.restore(); c.globalAlpha = 1;
      } else if (p.kind === 'ring') {
        c.strokeStyle = `rgba(255,255,255,${0.5 * a})`; c.lineWidth = 0.8;
        c.beginPath(); c.ellipse(p.x, p.y, p.r * (2 - a) * 1.4, p.r * (2 - a) * 0.6, 0, 0, I.TAU); c.stroke();
      } else if (p.kind === 'dust') {
        c.fillStyle = `rgba(220,200,160,${0.4 * a})`;
        c.beginPath(); c.arc(p.x, y, p.r * (1.5 - a * 0.5), 0, I.TAU); c.fill();
      } else if (p.kind === 'zzz') {
        c.fillStyle = `rgba(255,255,255,${a})`; c.font = 'bold 7px Heebo, Arial'; c.fillText('z', p.x, y);
      } else if (p.kind === 'sparkle') {
        c.fillStyle = `rgba(255,250,220,${a})`;
        c.beginPath(); c.arc(p.x, y, p.r, 0, I.TAU); c.fill();
      }
    }
  }

  // ---------- main frame ----------
  Rr.frame = function (G, dt) {
    const S = G.state, cam = G.cam, [W, H] = Rr.size();
    // at camp the backpack comes off and rests by the fire
    const cb = S.campBag;
    G.bagDown = !!(cb && cb.map === S.map && S.map === 'out' && Math.hypot(S.player.x - cb.x, S.player.y - cb.y) < 75);
    updateParticles(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const sky = I.sky(S.time, G.overcast);
    G.sky = sky;
    const vw = W / cam.zoom, vh = H / cam.zoom;
    const view = { x0: cam.x - vw / 2, y0: cam.y - vh / 2, x1: cam.x + vw / 2, y1: cam.y + vh / 2 };
    G.view = view;
    if (S.map === 'cave') { drawCave(G, view, sky, dt); }
    else drawOutside(G, view, sky, dt);
    // screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // rain
    if (G.rain > 0.01) {
      ctx.strokeStyle = `rgba(210,225,240,${0.35 * G.rain})`; ctx.lineWidth = 1.2 * Rr.baseZoom;
      ctx.beginPath();
      const n = Math.floor(260 * G.rain), tt = G.clock;
      for (let k = 0; k < n; k++) {
        const sx = ((k * 9301 + 49297) % 233280) / 233280, sy = ((k * 4271 + 1231) % 9973) / 9973;
        const x = (sx * W + tt * 180) % W, y = (sy * H + tt * 900 * (0.8 + sx * 0.4)) % H;
        ctx.moveTo(x, y); ctx.lineTo(x - 4 * Rr.baseZoom, y + 16 * Rr.baseZoom);
      }
      ctx.stroke();
    }
    // vignette + color grading
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(10,15,30,${0.32 + sky.night * 0.25 + G.hurt * 0.4})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (sky.dusk > 0.01 && S.map !== 'cave') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(255,140,60,${0.35 * sky.dusk})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (G.hurt > 0.01) {
      ctx.fillStyle = `rgba(120,20,10,${0.12 * G.hurt * (0.6 + 0.4 * Math.sin(G.clock * 3))})`; ctx.fillRect(0, 0, W, H);
    }
    if (G.fade > 0) { ctx.fillStyle = `rgba(${G.fadeCol || '0,0,0'},${I.clamp(G.fade, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
  };

  function worldTransform(cam) {
    const [W, H] = Rr.size();
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, W / 2 - cam.x * cam.zoom, H / 2 - cam.y * cam.zoom);
  }

  Rr.skip = {};
  Rr.prof = null;
  const PT = (k, t0) => { if (Rr.prof) Rr.prof[k] = (Rr.prof[k] || 0) + performance.now() - t0; return performance.now(); };
  function drawOutside(G, view, sky, dt) {
    const S = G.state, cam = G.cam, w = I.world, K = Rr.skip;
    let t0 = performance.now();
    ctx.fillStyle = '#2278b4'; ctx.fillRect(0, 0, cv.width, cv.height);
    worldTransform(cam);
    // terrain
    const sx = Math.max(0, Math.floor(view.x0) - 2), sy = Math.max(0, Math.floor(view.y0) - 2);
    const ex = Math.min(w.W, Math.ceil(view.x1) + 2), ey = Math.min(w.H, Math.ceil(view.y1) + 2);
    ctx.imageSmoothingEnabled = true;
    if (ex > sx && ey > sy && !K.terrain) ctx.drawImage(I.terrain.canvas, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    t0 = PT('terrain', t0);
    // footprints
    for (const f of G.footprints) {
      const a = I.clamp(1 - f.age / 90, 0, 1) * 0.28;
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(110,85,50,${a})`;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 1.4, 2.4, f.a, 0, I.TAU); ctx.fill();
    }
    // sea
    if (!K.water) I.water.render(ctx, view, G.clock, G.tide, dt);
    t0 = PT('water', t0);
    drawStream(G);
    t0 = PT('stream', t0);
    // ground layer objects
    const vis = w.near((view.x0 + view.x1) / 2, (view.y0 + view.y1) / 2, Math.max(view.x1 - view.x0, view.y1 - view.y0) / 2 + 160);
    const inView = o => o.x > view.x0 - 140 && o.x < view.x1 + 140 && o.y > view.y0 - 60 && o.y < view.y1 + 260;
    const list = vis.filter(inView);
    // shadows
    if (sky.day > 0.05 && !K.shadows) {
      const sa = 0.26 * sky.day * (1 - G.overcast * 0.8);
      const sd = sky.sunDir, sl = sky.shadowLen;
      ctx.globalAlpha = sa;
      for (const o of list) drawShadow(o, sd, sl, G);
      ctx.globalAlpha = 1;
    }
    t0 = PT('shadows', t0);
    for (const o of list) if (isFlat(o)) drawFlat(o, G);
    for (const f of S.fires) if (f.map === 'out') drawFireBase(f, G);
    drawParticles(ctx, 'ground');
    // y-sorted
    const sorted = list.filter(o => !isFlat(o));
    const ents = [];
    sorted.forEach(o => ents.push({ y: o.y + (o.ysort || 0), o }));
    ents.push({ y: S.player.y, player: true });
    for (const c of G.crabs) if (!c.hidden && c.x > view.x0 - 20 && c.x < view.x1 + 20 && c.y > view.y0 - 20 && c.y < view.y1 + 20) ents.push({ y: c.y, crab: c });
    for (const f of S.fires) if (f.map === 'out') ents.push({ y: f.y + 1, fire: f });
    if (G.bagDown) ents.push({ y: S.campBag.y, bag: S.campBag });
    if (G.rescue) ents.push({ y: G.rescue.y, rescue: G.rescue });
    ents.sort((a, b) => a.y - b.y);
    t0 = PT('flat', t0);
    if (!K.objs) for (const e of ents) {
      if (e.player) drawPlayer(G);
      else if (e.crab) drawCrab(e.crab, G);
      else if (e.fire) drawFlames(e.fire, G);
      else if (e.bag) drawBag(e.bag.x, e.bag.y, 0);
      else if (e.rescue) drawRescue(e.rescue, G);
      else drawObj(e.o, G);
    }
    t0 = PT('objs', t0);
    drawParticles(ctx, 'top');
    // birds
    for (const b of G.birds) drawBird(b, G, sky);
    // cloud shadows
    if (sky.day > 0.1) {
      ctx.globalAlpha = 0.16 * sky.day + G.overcast * 0.12;
      for (const c of G.clouds) {
        if (c.x + c.r < view.x0 || c.x - c.r > view.x1 || c.y + c.r < view.y0 || c.y - c.r > view.y1) continue;
        ctx.drawImage(cloudSpr, c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      }
      ctx.globalAlpha = 1;
    }
    t0 = PT('birds+clouds', t0);
    // lighting
    if (!K.light) lighting(G, sky, view, false);
    t0 = PT('light', t0);
    // additive glows
    worldTransform(cam);
    ctx.globalCompositeOperation = 'lighter';
    for (const f of S.fires) if (f.map === 'out' && f.fuel > 0) {
      const fl = 0.85 + 0.15 * Math.sin(G.clock * 13 + f.x) * Math.sin(G.clock * 7.3);
      glow(f.x, f.y - 6, 60 * fl, [255, 150, 60], 0.35 + sky.night * 0.25);
    }
    if (S.player.torch && S.map === 'out') glow(S.player.x + G.torchOff[0], S.player.y - 22, 40, [255, 160, 70], 0.3 + sky.night * 0.3);
    // cave mouth glint
    const mo = w.MOUTH;
    if (G.tide < -0.5 && !S.flags.fuse) {
      const tw = Math.pow(Math.max(0, Math.sin(G.clock * 2.2)), 18) + Math.pow(Math.max(0, Math.sin(G.clock * 1.3 + 1)), 30) * 0.6;
      if (tw > 0.02) {
        const gx = mo.x + 3, gy = mo.y - 14;
        glow(gx, gy, 10 + tw * 6, [255, 240, 190], 0.9 * tw);
        ctx.strokeStyle = `rgba(255,250,220,${tw})`; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(gx - 6 * tw, gy); ctx.lineTo(gx + 6 * tw, gy); ctx.moveTo(gx, gy - 6 * tw); ctx.lineTo(gx, gy + 6 * tw); ctx.stroke();
      }
    }
    // tower beacon
    if (S.flags.powered) {
      const on = (G.clock % 2.2) < 0.25;
      if (on) glow(w.TOWER.x, w.TOWER.y - 212, 30, [255, 60, 50], 0.5 + sky.night * 0.5);
    }
    // fireflies
    for (const f of G.flies) {
      const a = sky.night * (0.5 + 0.5 * Math.sin(G.clock * f.s + f.p));
      if (a > 0.05) glow(f.x, f.y, 5, [200, 255, 120], a * 0.9);
    }
    if (G.rescue) rescueGlow(G.rescue, G);
    ctx.globalCompositeOperation = 'source-over';
    PT('glow', t0);
  }

  function glow(x, y, r, col, a) {
    ctx.globalAlpha = I.clamp(a, 0, 1);
    // tint via filter-less trick: draw colored radial gradient
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`); g.addColorStop(0.3, `rgba(${col[0]},${col[1]},${col[2]},0.4)`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function lighting(G, sky, view, cave) {
    const S = G.state, [W, H] = Rr.size(), cam = G.cam;
    const lw = lightCv.width, lh = lightCv.height;
    const amb = cave ? [0.035, 0.035, 0.05] : sky.amb;
    if (!cave && amb[0] > 0.985 && amb[1] > 0.985 && amb[2] > 0.97) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = `rgb(${amb[0] * 255 | 0},${amb[1] * 255 | 0},${amb[2] * 255 | 0})`;
    lctx.fillRect(0, 0, lw, lh);
    const z = cam.zoom / 2;
    lctx.setTransform(z, 0, 0, z, lw / 2 - cam.x * z, lh / 2 - cam.y * z);
    lctx.globalCompositeOperation = 'lighter';
    const L = (x, y, r, c, a) => {
      if (x + r < view.x0 || x - r > view.x1 || y + r < view.y0 || y - r > view.y1) return;
      const g = lctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); g.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.45})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      lctx.fillStyle = g; lctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const flick = (s) => 0.88 + 0.12 * Math.sin(G.clock * 11 + s) * Math.sin(G.clock * 6.1 + s * 2);
    for (const f of S.fires) {
      if (f.map !== (cave ? 'cave' : 'out')) continue;
      const k = f.fuel > 0 ? I.clamp(0.55 + f.fuel / 8, 0.55, 1) : 0.15;
      const fl = flick(f.x);
      L(f.x, f.y - 4, 210 * k * fl, [255, 160, 80], 0.95);
      L(f.x, f.y - 4, 90 * k * fl, [255, 210, 140], 0.6);
    }
    const p = S.player;
    if (p.torch) {
      const fl = flick(3);
      L(p.x + G.torchOff[0], p.y - 18, (cave ? 230 : 170) * fl, [255, 170, 90], 0.95);
      L(p.x, p.y - 10, 70 * fl, [255, 220, 160], 0.5);
    }
    if (!cave) {
      // the player always sees a little around them (moonlight adaptation)
      L(p.x, p.y - 8, 95, [90, 105, 150], 0.45 * sky.night);
      if (S.flags.powered && (G.clock % 2.2) < 0.25) L(I.world.TOWER.x, I.world.TOWER.y - 212, 120, [255, 50, 40], 0.7);
      for (const f of G.flies) L(f.x, f.y, 16, [180, 255, 120], 0.5 * sky.night * (0.5 + 0.5 * Math.sin(G.clock * f.s + f.p)));
      if (G.rescue) {
        const r = G.rescue;
        L(r.x, r.y - 10, 160, [255, 250, 230], 0.8);
        // search beam
        const ang = r.beam, len = 520;
        lctx.save(); lctx.translate(r.x, r.y - 12); lctx.rotate(ang);
        const g = lctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,250,225,0.9)'); g.addColorStop(1, 'rgba(255,250,225,0)');
        lctx.fillStyle = g; lctx.beginPath(); lctx.moveTo(0, 0); lctx.lineTo(len, -70); lctx.lineTo(len, 70); lctx.closePath(); lctx.fill();
        lctx.restore();
      }
    } else {
      const c = I.cave;
      const day = sky.day;
      L(c.ENTRY.x + 40, c.ENTRY.y, 230, [170 + 80 * day, 190 + 60 * day, 230], 0.25 + 0.55 * day);
      if (day > 0.1) L(c.SKY.x, c.SKY.y, 110, [255, 245, 210], 0.6 * day);
      L(p.x, p.y - 8, 34, [120, 120, 140], 0.35);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCv, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- stream & spring ----------
  function drawStream(G) {
    const SA = I.world.STREAM, t = G.clock;
    // the stream ends where it meets the sea (which moves with the tide)
    let end = SA.length;
    while (end > 2 && I.world.hAt(SA[end - 1][0], SA[end - 1][1]) < G.tide + 0.8) end--;
    const S = end === SA.length ? SA : SA.slice(0, end);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(S[0][0], S[0][1]); for (const p of S) ctx.lineTo(p[0], p[1]); };
    path(); ctx.strokeStyle = 'rgba(64,140,150,0.85)'; ctx.lineWidth = 12; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(110,190,195,0.7)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.setLineDash([5, 17]); ctx.lineDashOffset = -t * 34;
    path(); ctx.strokeStyle = 'rgba(235,255,250,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.setLineDash([3, 23]); ctx.lineDashOffset = -t * 27 + 9;
    ctx.save(); ctx.translate(2.5, 1); path(); ctx.strokeStyle = 'rgba(235,255,250,0.35)'; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore();
    ctx.setLineDash([]);
    // spring pond
    const SP = I.world.SPRING;
    ctx.save(); ctx.translate(SP.x, SP.y);
    const g = ctx.createRadialGradient(-6, -4, 2, 0, 0, 32);
    g.addColorStop(0, '#5fb8b4'); g.addColorStop(0.7, '#2f7f86'); g.addColorStop(1, '#245f66');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 30, 21, 0.2, 0, I.TAU); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const ph = ((t * 0.35 + k / 3) % 1);
      ctx.strokeStyle = `rgba(230,255,250,${0.45 * (1 - ph)})`; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(-4, -2, 4 + ph * 20, 3 + ph * 13, 0.2, 0, I.TAU); ctx.stroke();
    }
    ctx.fillStyle = '#4f8f3a';
    [[14, 8, 4], [-16, 6, 3.4], [6, -12, 3]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0.4, I.TAU); ctx.lineTo(x, y); ctx.fill(); });
    ctx.fillStyle = '#f5d0e0'; ctx.beginPath(); ctx.arc(14, 7, 1.4, 0, I.TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- objects ----------
  const FLAT = { drift: 1, branch: 1, stone: 1, mussel: 1, plank: 1, logpage: 1, pit: 1, spring: 1, mouth: 1, grass: 0 };
  function isFlat(o) { return FLAT[o.type] === 1; }
  function os(G, o) { return G.state.objState[o.id] || {}; }

  // blurred shadow sprites carry padding around the silhouette
  function shd(spr, x, y, w, h) {
    const pf = (spr.pad || 0) / (spr.width - 2 * (spr.pad || 0));
    ctx.drawImage(spr, x - w * pf, y - h * pf, w * (1 + 2 * pf), h * (1 + 2 * pf));
  }
  function drawShadow(o, sd, sl, G) {
    const T = I.terrain, t = G.clock, wind = G.wind;
    const sway = Math.sin(t * 1.1 + (o.seed || o.x * 0.01)) * wind;
    if (o.type === 'tree' || o.type === 'fig') {
      const s = o.size, spr = o.type === 'fig' ? T.figShadow : T.canopyShadow[Math.floor(o.seed) % 8];
      const h = s * 0.9 * sl;
      const cx = o.x + sd[0] * h + sway * 2.5, cy = o.y + sd[1] * h * 0.6 + 4;
      shd(spr, cx - s * 1.2, cy - s * 0.9, s * 2.4, s * 1.9);
    } else if (o.type === 'palm') {
      const h = o.hgt * sl, k = Math.floor(o.seed) % 5;
      const tx = o.x + o.lean * o.hgt * 0.45 + sd[0] * h, ty = o.y + sd[1] * h * 0.55 + 3;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(tx, ty); ctx.stroke();
      const r = 30 * 1.3;
      shd(T.palmShadow[k], tx - r + sway * 3, ty - r * 0.75, r * 2, r * 1.5);
    } else if (o.type === 'bush' || o.type === 'berry') {
      const s = o.size || 13;
      shd(T.bushShadow[Math.floor(o.seed || 1) % 6], o.x - s * 1.1 + sd[0] * s * 0.5, o.y - s * 0.5 + sd[1] * s * 0.3, s * 2.4, s * 1.6);
    } else if (o.type === 'pine') {
      ctx.fillStyle = '#000';
      const h = 70 * sl;
      ctx.beginPath(); ctx.moveTo(o.x - 10, o.y); ctx.lineTo(o.x + sd[0] * h, o.y + sd[1] * h * 0.6); ctx.lineTo(o.x + 10, o.y); ctx.fill();
    } else if (o.type === 'tower') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      const h = 210 * sl;
      ctx.beginPath(); ctx.moveTo(o.x - 12, o.y); ctx.lineTo(o.x + sd[0] * h, o.y + sd[1] * h * 0.5); ctx.lineTo(o.x + 12, o.y); ctx.stroke();
    } else if (o.type === 'deadtree') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      const h = 60 * sl;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + sd[0] * h, o.y + sd[1] * h * 0.6); ctx.stroke();
    } else if (o.type === 'hut') {
      ctx.fillStyle = '#000';
      ctx.fillRect(o.x - o.w / 2 + sd[0] * 18, o.y - 8 + sd[1] * 10, o.w, 20);
    } else if (o.type === 'rock') {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(o.x + sd[0] * o.size * 0.4, o.y + 2, o.size * 1.05, o.size * 0.45, 0, 0, I.TAU); ctx.fill();
    } else if (o.type === 'boat') {
      ctx.fillStyle = '#000';
      ctx.save(); ctx.translate(o.x + sd[0] * 10, o.y + 8); ctx.rotate(-0.45); ctx.beginPath(); ctx.ellipse(0, 0, 44, 14, 0, 0, I.TAU); ctx.fill(); ctx.restore();
    }
  }

  function drawFlat(o, G) {
    const st = os(G, o);
    if (st.taken) return;
    switch (o.type) {
      case 'drift': case 'branch': case 'plank': {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.angle || 0);
        const L = o.type === 'plank' ? 22 : o.len;
        if (o.type === 'plank') {
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-L / 2 + 1, -2, L, 6);
          ctx.fillStyle = '#9c7a52'; ctx.fillRect(-L / 2, -3, L, 6);
          ctx.fillStyle = '#7d5e3c'; ctx.fillRect(-L / 2, 1, L, 1); ctx.fillStyle = '#56708a'; ctx.fillRect(-L / 2 + 3, -3, 5, 6);
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = o.type === 'drift' ? 5 : 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-L / 2 + 1, 2); ctx.lineTo(L / 2 + 1, 2); ctx.stroke();
          ctx.strokeStyle = o.type === 'drift' ? '#c9b89a' : '#7a5a36'; ctx.lineWidth = o.type === 'drift' ? 4.2 : 2.4;
          ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -2, L / 2, 0.5); ctx.stroke();
          ctx.strokeStyle = o.type === 'drift' ? '#e8dcc4' : '#9a7448'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-L / 2 + 2, -1); ctx.quadraticCurveTo(0, -2.6, L / 2 - 2, -0.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(L * 0.15, 0); ctx.lineTo(L * 0.3, -5); ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'stone': {
        const r = 2.6 + ((o.seed || 0) % 3) * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(o.x + 1, o.y + 1.5, r * 1.1, r * 0.6, 0, 0, I.TAU); ctx.fill();
        const g = ctx.createRadialGradient(o.x - 1, o.y - 1.5, 0.5, o.x, o.y, r * 1.3);
        g.addColorStop(0, '#e6e0d4'); g.addColorStop(1, '#8a837a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(o.x, o.y, r * 1.2, r * 0.85, 0.3, 0, I.TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(o.x + 4, o.y + 1, r * 0.8, r * 0.6, 0.3, 0, I.TAU); ctx.fill();
        break;
      }
      case 'mussel': {
        const n = st.n !== undefined ? st.n : o.n;
        if (n <= 0) return;
        for (let k = 0; k < 6; k++) {
          const a = k * 1.1 + o.x, rr = 2 + (k % 3) * 1.6;
          ctx.save(); ctx.translate(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.6); ctx.rotate(a);
          ctx.fillStyle = '#1e2436'; ctx.beginPath(); ctx.ellipse(0, 0, 1.4, 2.8, 0, 0, I.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(130,160,210,0.5)'; ctx.beginPath(); ctx.ellipse(-0.3, -0.6, 0.5, 1.6, 0, 0, I.TAU); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'logpage': {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(0.3 + Math.sin(G.clock * 3) * 0.05 * G.wind);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-4, -3, 10, 8);
        ctx.fillStyle = '#f2ead6'; ctx.fillRect(-5, -5, 10, 8);
        ctx.strokeStyle = '#7a8aa0'; ctx.lineWidth = 0.4; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-4, -3 + k * 2); ctx.lineTo(4, -3 + k * 2); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'pit': {
        if (G.state.fires.some(f => f.pit)) return;
        stoneRing(o.x, o.y, 11);
        ctx.fillStyle = '#3a332c'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 8, 5, 0, 0, I.TAU); ctx.fill();
        ctx.strokeStyle = '#1e1a16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x - 5, o.y - 1); ctx.lineTo(o.x + 4, o.y + 2); ctx.stroke();
        break;
      }
      case 'mouth': drawMouth(o, G); break;
    }
  }
  function stoneRing(x, y, r) {
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * I.TAU;
      const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.62;
      ctx.fillStyle = '#5c564f'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 3.4, 2.4, 0, 0, I.TAU); ctx.fill();
      ctx.fillStyle = '#a49c90'; ctx.beginPath(); ctx.ellipse(sx, sy, 3.2, 2.2, 0, 0, I.TAU); ctx.fill();
    }
  }
  function drawMouth(o, G) {
    // the dark opening in the cliff face, partly drowned at high tide
    const x = o.x, y = o.y - 10;
    ctx.save();
    ctx.fillStyle = '#4a443d';
    ctx.beginPath(); ctx.ellipse(x, y - 2, 25, 18, 0, Math.PI, 0); ctx.lineTo(x + 25, y + 8); ctx.lineTo(x - 25, y + 8); ctx.fill();
    const g = ctx.createRadialGradient(x, y + 4, 2, x, y, 22);
    g.addColorStop(0, '#050506'); g.addColorStop(1, '#1d1a18');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 15, 0, Math.PI, 0); ctx.lineTo(x + 17, y + 9); ctx.lineTo(x - 17, y + 9); ctx.fill();
    // algae line on the lip
    ctx.strokeStyle = 'rgba(48,70,30,0.9)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 20, 17, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // water inside the mouth
    const lvl = G.tide; // -5.5 .. 5.5
    const fill = I.clamp((lvl + 3.5) / 8, 0, 1);
    if (fill > 0) {
      const wy = y + 9 - fill * 20;
      ctx.beginPath(); ctx.rect(x - 18, wy, 36, y + 10 - wy); ctx.clip();
      ctx.fillStyle = 'rgba(30,90,110,0.92)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 15, 0, Math.PI, 0); ctx.lineTo(x + 17, y + 9); ctx.lineTo(x - 17, y + 9); ctx.fill();
      ctx.strokeStyle = 'rgba(230,250,250,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let s = -17; s <= 17; s += 2) ctx.lineTo(x + s, wy + Math.sin(s * 0.5 + G.clock * 3) * 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function drawObj(o, G) {
    const st = os(G, o), T = I.terrain, t = G.clock, wind = G.wind, P = G.state.player;
    switch (o.type) {
      case 'palm': {
        const k = Math.floor(o.seed) % 5;
        const sway = Math.sin(t * 1.05 + o.seed) * wind + Math.sin(t * 2.3 + o.seed * 2) * 0.25 * wind;
        const tx = o.x + o.lean * o.hgt * 0.45 + sway * 2.5, ty = o.y - o.hgt;
        const mx = o.x + o.lean * o.hgt * 0.1, my = o.y - o.hgt * 0.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#9a7448'; ctx.lineWidth = 5.4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
        ctx.strokeStyle = '#cfa874'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(o.x - 1, o.y); ctx.quadraticCurveTo(mx - 1, my, tx - 1, ty); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,88,52,0.6)'; ctx.lineWidth = 0.8;
        for (let s = 0.08; s < 0.95; s += 0.075) {
          const it = 1 - s, px = it * it * o.x + 2 * it * s * mx + s * s * tx, py = it * it * o.y + 2 * it * s * my + s * s * ty;
          ctx.beginPath(); ctx.moveTo(px - 2.6, py); ctx.lineTo(px + 2.6, py + 0.6); ctx.stroke();
        }
        const fade = canopyFade(P, tx, ty, 30, o.y);
        if ((st.coconuts !== undefined ? st.coconuts : o.coconuts) > 0) {
          const n = st.coconuts !== undefined ? st.coconuts : o.coconuts;
          for (let c = 0; c < n; c++) { ctx.fillStyle = '#5a3a1c'; ctx.beginPath(); ctx.arc(tx - 3 + c * 5, ty + 3, 2.6, 0, I.TAU); ctx.fill(); }
        }
        ctx.globalAlpha = fade;
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(sway * 0.05);
        const r = 30 * 1.3; ctx.drawImage(T.palm[k], -r, -r, r * 2, r * 2);
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'tree': case 'fig': {
        const s = o.size;
        const sway = Math.sin(t * 0.9 + o.seed) * wind;
        ctx.fillStyle = '#7d5636';
        ctx.beginPath(); ctx.moveTo(o.x - 5.5, o.y + 0.5); ctx.quadraticCurveTo(o.x - 2.2, o.y - 3, o.x - 2.2, o.y - s * 0.62); ctx.lineTo(o.x + 2.2, o.y - s * 0.62); ctx.quadraticCurveTo(o.x + 2.2, o.y - 3, o.x + 5.5, o.y + 0.5); ctx.fill();
        ctx.fillStyle = '#a27448'; ctx.fillRect(o.x - 1.6, o.y - s * 0.6, 1.3, s * 0.56);
        if (o.type === 'fig') {
          ctx.strokeStyle = '#6a5640'; ctx.lineWidth = 2;
          for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(o.x + k * 4, o.y - s * 0.45); ctx.quadraticCurveTo(o.x + k * 7, o.y - s * 0.2, o.x + k * 6, o.y + 2); ctx.stroke(); }
        }
        const spr = o.type === 'fig' ? T.fig : T.canopy[Math.floor(o.seed) % 8];
        const cx = o.x + sway * 1.6, cy = o.y - s * 0.78;
        ctx.globalAlpha = canopyFade(P, cx, cy, s * 0.95, o.y);
        ctx.drawImage(spr, cx - s * 1.2, cy - s * 1.2, s * 2.4, s * 2.4);
        ctx.globalAlpha = 1;
        break;
      }
      case 'bush': case 'berry': {
        const s = o.size || 13;
        const sway = Math.sin(t * 1.3 + (o.seed || o.x)) * wind * 0.8;
        ctx.drawImage(T.bush[Math.floor(o.seed || 2) % 6], o.x - s * 1.2 + sway, o.y - s * 1.65, s * 2.4, s * 2.4);
        if (o.type === 'berry') {
          const n = st.berries !== undefined ? st.berries : o.berries;
          for (let k = 0; k < n * 3; k++) {
            const a = k * 2.1 + o.x, rr = 3 + (k * 7 % 9);
            ctx.fillStyle = k % 2 ? '#6a2a8a' : '#8e44ad';
            ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * rr + sway, o.y - s * 0.45 + Math.sin(a) * rr * 0.7, 1.5, 0, I.TAU); ctx.fill();
          }
        }
        break;
      }
      case 'rock': {
        const s = o.size;
        ctx.drawImage(T.rocks[Math.floor(o.seed) % 8], o.x - s * 1.3, o.y - s * 1.0, s * 2.6, s * 2.2);
        break;
      }
      case 'fern': case 'grass': case 'dunegrass': {
        const s = o.size;
        const sway = Math.sin(t * 1.6 + o.seed) * wind * 0.12;
        if (o.type === 'fern') {
          ctx.save(); ctx.translate(o.x, o.y); ctx.transform(1, 0, sway, 1, 0, 0);
          ctx.drawImage(T.ferns[Math.floor(o.seed) % 6], -s * 1.2, -s * 1.4, s * 2.4, s * 2.4); ctx.restore();
        } else {
          ctx.strokeStyle = o.type === 'dunegrass' ? '#c9c486' : '#7fc457'; ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k - 2.5) * 0.28, L = s * (0.7 + (k % 3) * 0.15);
            ctx.moveTo(o.x + (k - 2.5) * 0.8, o.y);
            ctx.quadraticCurveTo(o.x + Math.sin(a) * L * 0.5, o.y - L * 0.6, o.x + Math.sin(a) * L + sway * L * 2, o.y - L);
          }
          ctx.stroke();
        }
        break;
      }
      case 'reed': {
        const sway = Math.sin(t * 1.7 + o.seed) * wind * 1.6;
        for (let k = 0; k < 4; k++) {
          const bx = o.x + (k - 1.5) * 2.2, L = o.size * (0.75 + (k % 2) * 0.3), sw = sway * (0.6 + k * 0.15);
          ctx.strokeStyle = '#6aa447'; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(bx, o.y); ctx.quadraticCurveTo(bx + sw * 0.3, o.y - L * 0.5, bx + sw, o.y - L); ctx.stroke();
          if (k !== 2) { ctx.fillStyle = '#8b5a2e'; ctx.beginPath(); ctx.ellipse(bx + sw * 0.95, o.y - L * 0.86, 1.2, 2.6, sw * 0.04, 0, I.TAU); ctx.fill(); }
        }
        ctx.strokeStyle = '#8fc664'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(o.x - 3, o.y); ctx.quadraticCurveTo(o.x - 6, o.y - 5, o.x - 8 + sway, o.y - 8); ctx.moveTo(o.x + 3, o.y); ctx.quadraticCurveTo(o.x + 6, o.y - 6, o.x + 7 + sway, o.y - 10); ctx.stroke();
        break;
      }
      case 'pine': {
        const sway = Math.sin(t * 0.8 + o.x) * wind;
        ctx.fillStyle = '#5a4030'; ctx.fillRect(o.x - 2.5, o.y - 22, 5, 22);
        if ((st.resin !== undefined ? st.resin : o.resin) > 0) {
          ctx.fillStyle = '#f0a830'; ctx.beginPath(); ctx.ellipse(o.x + 1, o.y - 10, 1.6, 3, 0, 0, I.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.fillRect(o.x + 0.5, o.y - 12, 0.8, 1.6);
        }
        ctx.globalAlpha = canopyFade(P, o.x, o.y - 50, 24, o.y);
        for (let k = 0; k < 5; k++) {
          const y = o.y - 18 - k * 13, wdt = 20 - k * 3.4, sx = sway * (k + 1) * 0.5;
          ctx.fillStyle = k % 2 ? '#2f5a3a' : '#264d33';
          ctx.beginPath(); ctx.moveTo(o.x - wdt + sx, y); ctx.lineTo(o.x + sx * 1.2, y - 22); ctx.lineTo(o.x + wdt + sx, y); ctx.quadraticCurveTo(o.x + sx, y + 5, o.x - wdt + sx, y); ctx.fill();
          ctx.fillStyle = 'rgba(140,190,120,0.35)';
          ctx.beginPath(); ctx.moveTo(o.x - wdt * 0.7 + sx, y - 2); ctx.lineTo(o.x + sx * 1.2, y - 20); ctx.lineTo(o.x - 2 + sx, y - 1); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'deadtree': {
        ctx.strokeStyle = '#cfc6b6'; ctx.lineCap = 'round';
        const br = (x, y, a, L, wdt, d) => {
          if (d > 4) return;
          const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
          ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
          br(ex, ey, a - 0.45 - d * 0.05, L * 0.68, wdt * 0.62, d + 1);
          br(ex, ey, a + 0.5, L * 0.6, wdt * 0.58, d + 1);
        };
        ctx.strokeStyle = '#8f877a'; br(o.x + 1, o.y, -Math.PI / 2, 30, 6, 0);
        ctx.strokeStyle = '#d8d0c0'; br(o.x, o.y, -Math.PI / 2, 30, 4.5, 0);
        break;
      }
      case 'cairn': {
        const cs = [[0, 0, 6], [0.5, -5, 5], [-0.4, -9.5, 4], [0.3, -13, 3]];
        cs.forEach(([dx, dy, r]) => {
          ctx.fillStyle = '#6d665c'; ctx.beginPath(); ctx.ellipse(o.x + dx, o.y + dy + 1, r, r * 0.6, 0, 0, I.TAU); ctx.fill();
          ctx.fillStyle = '#b3aa9b'; ctx.beginPath(); ctx.ellipse(o.x + dx, o.y + dy, r * 0.95, r * 0.55, 0, 0, I.TAU); ctx.fill();
        });
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#5c4430'; ctx.fillRect(o.x - 1.2, o.y - 18, 2.4, 18);
        ctx.fillStyle = '#9b7650'; ctx.beginPath(); ctx.moveTo(o.x - 13, o.y - 20); ctx.lineTo(o.x + 11, o.y - 20); ctx.lineTo(o.x + 15, o.y - 16.5); ctx.lineTo(o.x + 11, o.y - 13); ctx.lineTo(o.x - 13, o.y - 13); ctx.fill();
        ctx.fillStyle = '#5c4430'; ctx.fillRect(o.x - 10, o.y - 17.5, 18, 0.8); ctx.fillRect(o.x - 10, o.y - 15.5, 13, 0.8);
        break;
      }
      case 'bptree': {
        // leaning shore tree; its branch reaches out over the water
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(o.x - 6, o.y); ctx.quadraticCurveTo(o.x - 2, o.y - 26, o.x + 8, o.y - 40); ctx.stroke();
        ctx.strokeStyle = '#7a6046'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(o.x + 6, o.y - 36); ctx.quadraticCurveTo(o.x + 16, o.y - 30, o.x + 12, o.y + 30); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x + 12, o.y + 10); ctx.lineTo(o.x + 22, o.y + 18); ctx.stroke();
        const sway = Math.sin(t * 0.9) * wind;
        ctx.globalAlpha = canopyFade(P, o.x + 4, o.y - 50, 30, o.y);
        ctx.drawImage(T.canopy[3], o.x - 30 + sway, o.y - 80, 64, 64);
        ctx.drawImage(T.canopy[5], o.x - 6 + sway * 1.3, o.y - 28, 44, 44);
        ctx.globalAlpha = 1;
        break;
      }
      case 'backpack': {
        if (G.state.flags.backpack) return;
        const fall = G.bpFall;
        if (fall !== undefined) {
          const k = I.clamp(fall, 0, 1);
          drawBag(o.x, o.y - 28 * (1 - k * k) + 10 * k, k * 0.9);
          return;
        }
        const swing = Math.sin(t * 1.6) * 0.18 * (0.5 + wind);
        // strap
        ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - 52); ctx.lineTo(o.x + Math.sin(swing) * 12, o.y - 40); ctx.stroke();
        ctx.save(); ctx.translate(o.x, o.y - 52); ctx.rotate(swing); drawBag(0, 30, 0, true); ctx.restore();
        // reflection on water
        ctx.fillStyle = 'rgba(60,80,40,0.18)'; ctx.beginPath(); ctx.ellipse(o.x + 2, o.y + 6, 8, 3, 0, 0, I.TAU); ctx.fill();
        break;
      }
      case 'debris': {
        if (st.opened) {
          ctx.fillStyle = '#8a6a44'; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(0.15);
          ctx.fillRect(-10, -9, 20, 11); ctx.fillStyle = '#5e4530'; ctx.fillRect(-10, -9, 20, 2.5);
          ctx.fillStyle = '#3a2c1f'; ctx.fillRect(-8, -7, 16, 3); ctx.restore();
          return;
        }
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(0.15);
        ctx.fillStyle = '#6e5236'; ctx.fillRect(-10, -14, 20, 15);
        ctx.fillStyle = '#9c7a52'; ctx.fillRect(-10, -14, 20, 5);
        ctx.fillStyle = '#5a4430'; for (let k = -1; k <= 1; k++) ctx.fillRect(k * 7 - 1, -9, 1.5, 10);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(-4, -12, 8, 1.6);
        ctx.restore();
        break;
      }
      case 'buoy': {
        const bob = Math.sin(t * 1.4) * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(o.x + 2, o.y + 1, 7, 3, 0, 0, I.TAU); ctx.fill();
        const g = ctx.createRadialGradient(o.x - 2, o.y - 9 + bob, 1, o.x, o.y - 6 + bob, 7);
        g.addColorStop(0, '#ffb07a'); g.addColorStop(1, '#d35400');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y - 6 + bob, 6, 0, I.TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(o.x - 6, o.y - 7 + bob, 12, 1.6);
        ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(o.x + 5, o.y - 3); ctx.quadraticCurveTo(o.x + 14, o.y + 2, o.x + 18, o.y - 2); ctx.stroke();
        break;
      }
      case 'boat': drawBoat(o, G, st); break;
      case 'tarp': {
        // lean-to with a torn orange tarp
        ctx.strokeStyle = '#5c4430'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(o.x - 22, o.y + 6); ctx.lineTo(o.x - 20, o.y - 22); ctx.moveTo(o.x + 22, o.y + 6); ctx.lineTo(o.x + 20, o.y - 22); ctx.stroke();
        const fl = Math.sin(t * 2.4) * wind * 1.5;
        ctx.fillStyle = '#c4672c';
        ctx.beginPath(); ctx.moveTo(o.x - 22, o.y - 22); ctx.lineTo(o.x + 22, o.y - 22); ctx.lineTo(o.x + 26, o.y + 10 + fl); ctx.lineTo(o.x + 6, o.y + 6); ctx.lineTo(o.x + 2, o.y + 12 + fl); ctx.lineTo(o.x - 26, o.y + 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e0864a';
        ctx.beginPath(); ctx.moveTo(o.x - 22, o.y - 22); ctx.lineTo(o.x + 22, o.y - 22); ctx.lineTo(o.x + 24, o.y - 12); ctx.lineTo(o.x - 24, o.y - 12); ctx.fill();
        ctx.fillStyle = '#7a3a18'; ctx.beginPath(); ctx.moveTo(o.x + 6, o.y + 6); ctx.lineTo(o.x + 12, o.y - 4); ctx.lineTo(o.x + 15, o.y + 8); ctx.fill();
        ctx.strokeStyle = '#3a2c1f'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(o.x - 26, o.y - 22); ctx.lineTo(o.x + 26, o.y - 22); ctx.stroke();
        break;
      }
      case 'campcrate': {
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(o.x - 9, o.y - 13, 18, 14);
        ctx.fillStyle = '#a07a50'; ctx.fillRect(o.x - 9, o.y - 13, 18, 4);
        ctx.strokeStyle = '#4a3624'; ctx.lineWidth = 0.8; ctx.strokeRect(o.x - 9, o.y - 13, 18, 14);
        if (!st.opened) { ctx.fillStyle = '#c0392b'; ctx.fillRect(o.x - 3, o.y - 7, 6, 4); }
        break;
      }
      case 'campnote': {
        ctx.fillStyle = '#5c4430'; ctx.fillRect(o.x - 1, o.y - 16, 2, 16);
        ctx.save(); ctx.translate(o.x, o.y - 14); ctx.rotate(Math.sin(t * 2.6) * 0.08 * wind);
        ctx.fillStyle = st.read ? '#e8dcc0' : '#fbf3dc'; ctx.fillRect(-5, 0, 10, 12);
        ctx.strokeStyle = '#6a6a80'; ctx.lineWidth = 0.4; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-4, 3 + k * 2.2); ctx.lineTo(4, 3 + k * 2.2); ctx.stroke(); }
        ctx.restore();
        if (!st.read) sparkle(o.x, o.y - 10, t);
        break;
      }
      case 'rack': {
        ctx.strokeStyle = '#6a5038'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(o.x - 12, o.y); ctx.lineTo(o.x - 8, o.y - 18); ctx.lineTo(o.x - 4, o.y);
        ctx.moveTo(o.x + 4, o.y); ctx.lineTo(o.x + 8, o.y - 18); ctx.lineTo(o.x + 12, o.y); ctx.moveTo(o.x - 9, o.y - 15); ctx.lineTo(o.x + 9, o.y - 15); ctx.stroke();
        ctx.fillStyle = '#9aa0a8'; ctx.fillRect(o.x - 5, o.y - 15, 2, 6); ctx.fillRect(o.x + 2, o.y - 15, 2, 5);
        break;
      }
      case 'hut': drawHut(o, G); break;
      case 'tower': drawTower(o, G); break;
    }
  }
  function sparkle(x, y, t) {
    const a = Math.pow(Math.max(0, Math.sin(t * 2.6 + x)), 10);
    if (a < 0.05) return;
    ctx.strokeStyle = `rgba(255,255,230,${a})`; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x - 4 * a, y); ctx.lineTo(x + 4 * a, y); ctx.moveTo(x, y - 4 * a); ctx.lineTo(x, y + 4 * a); ctx.stroke();
  }
  function canopyFade(P, cx, cy, r, baseY) {
    if (P.y < baseY && Math.abs(P.x - cx) < r * 0.95 && P.y > cy - r * 0.9 && P.y < baseY + 2) return 0.42;
    return 1;
  }
  function drawBag(x, y, tilt, hanging) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
    if (!hanging) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 3, 0, 0, I.TAU); ctx.fill(); }
    ctx.fillStyle = '#4f5d2c'; ctx.beginPath(); ctx.roundRect(-7, -15, 14, 16, 4); ctx.fill();
    ctx.fillStyle = '#6b7a3a'; ctx.beginPath(); ctx.roundRect(-7, -15, 14, 7, 4); ctx.fill();
    ctx.fillStyle = '#3c4622'; ctx.beginPath(); ctx.roundRect(-5, -6, 10, 6, 2); ctx.fill();
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(-1, -9, 2, 3);
    ctx.strokeStyle = '#2e3519'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, -15, 3, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }
  function drawBoat(o, G, st) {
    const t = G.clock;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(-0.45);
    // foam around hull
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.5 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 4, 46 + ph * 12, 15 + ph * 6, 0, 0, I.TAU); ctx.stroke();
    }
    ctx.rotate(0.12);
    // hull
    ctx.fillStyle = '#1d4e89';
    ctx.beginPath(); ctx.moveTo(-42, -6); ctx.quadraticCurveTo(-30, 14, 20, 12); ctx.quadraticCurveTo(44, 8, 50, -4); ctx.quadraticCurveTo(40, -16, 20, -16); ctx.lineTo(-38, -16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e6fb7';
    ctx.beginPath(); ctx.moveTo(-42, -6); ctx.lineTo(-38, -16); ctx.lineTo(20, -16); ctx.quadraticCurveTo(40, -16, 50, -4); ctx.quadraticCurveTo(30, -4, -42, -6); ctx.fill();
    ctx.fillStyle = '#e8edf0'; ctx.fillRect(-36, -9, 70, 2);
    // deck
    ctx.fillStyle = '#d6cfc0';
    ctx.beginPath(); ctx.moveTo(-36, -14); ctx.lineTo(18, -14); ctx.quadraticCurveTo(36, -14, 44, -6); ctx.quadraticCurveTo(30, -8, -36, -8); ctx.fill();
    // cabin
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-8, -30, 24, 18);
    ctx.fillStyle = '#2a3b4a'; ctx.fillRect(-5, -27, 7, 6); ctx.fillRect(5, -27, 7, 6);
    ctx.fillStyle = '#c9d2d8'; ctx.fillRect(-10, -32, 28, 3);
    // name
    ctx.fillStyle = '#e8edf0'; ctx.font = '5px Heebo, Arial'; ctx.fillText('נוגה', -24, 2);
    // motor
    ctx.fillStyle = '#333a40'; ctx.fillRect(-48, -16, 7, 12);
    // crate wedged in the flooded stern
    if (!G.state.flags.crate) {
      ctx.fillStyle = '#8a6a44'; ctx.save(); ctx.translate(-26, -18); ctx.rotate(-0.25);
      ctx.fillRect(-7, -8, 14, 11); ctx.fillStyle = '#b08a5a'; ctx.fillRect(-7, -8, 14, 3);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-2, -4, 4, 4); ctx.restore();
      ctx.fillStyle = 'rgba(40,120,140,0.6)'; ctx.fillRect(-36, -14, 22, 6);
    }
    ctx.restore();
    if (G.state.flags.crate && st.crateX) {
      // crate hauled onto the rocks
      const x = st.crateX, y = st.crateY;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 8, y - 1, 18, 4);
      ctx.fillStyle = '#8a6a44'; ctx.fillRect(x - 9, y - 12, 18, 13);
      ctx.fillStyle = '#5e4530'; ctx.fillRect(x - 9, y - 12, 18, 3);
      ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 9, y - 6); ctx.quadraticCurveTo(x + 22, y - 2, x + 30, y - 12); ctx.stroke();
    }
    if (G.rope) {
      const r = G.rope, P = G.state.player;
      ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(P.x, P.y - 10); ctx.quadraticCurveTo((P.x + r.x) / 2, (P.y + r.y) / 2 + 8 * (1 - r.k), r.x, r.y); ctx.stroke();
    }
  }
  function drawHut(o, G) {
    const x = o.x, y = o.y, w2 = o.w / 2;
    ctx.fillStyle = '#7f8a8c'; ctx.fillRect(x - w2, y - 30, o.w, 30);
    ctx.fillStyle = '#6a7476'; for (let k = 0; k < o.w; k += 5) ctx.fillRect(x - w2 + k, y - 30, 1, 30);
    // roof
    ctx.fillStyle = '#8e4a2c';
    ctx.beginPath(); ctx.moveTo(x - w2 - 5, y - 28); ctx.lineTo(x + w2 + 5, y - 28); ctx.lineTo(x + w2 + 2, y - 56); ctx.lineTo(x - w2 - 2, y - 56); ctx.fill();
    ctx.fillStyle = '#a65a36'; for (let k = 0; k < o.w + 6; k += 6) ctx.fillRect(x - w2 - 3 + k, y - 56, 2.4, 28);
    ctx.fillStyle = 'rgba(60,30,15,0.5)'; ctx.fillRect(x - w2 + 10, y - 50, 14, 8);
    // door & window
    ctx.fillStyle = '#3e3a34'; ctx.fillRect(x - 7, y - 24, 14, 24);
    ctx.fillStyle = '#5c5a52'; ctx.fillRect(x - 6, y - 23, 12, 22);
    ctx.fillStyle = G.state.flags.powered ? '#ffd27a' : '#2a3540'; ctx.fillRect(x + 14, y - 22, 12, 9);
    ctx.strokeStyle = '#4a4a44'; ctx.lineWidth = 1; ctx.strokeRect(x + 14, y - 22, 12, 9);
    // cable to the tower
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x + w2, y - 34); ctx.quadraticCurveTo(x + w2 + 20, y - 20, I.world.TOWER.x - 6, I.world.TOWER.y - 60); ctx.stroke();
    // sign
    ctx.fillStyle = '#e9e2cf'; ctx.fillRect(x - 26, y - 21, 15, 8);
    ctx.fillStyle = '#b03a2e'; ctx.font = 'bold 4px Heebo, Arial'; ctx.fillText('רדיו', x - 23.5, y - 15.5);
    if (G.state.flags.powered) glow(x + 20, y - 18, 14, [255, 210, 120], 0.25);
  }
  function drawTower(o, G) {
    const x = o.x, y = o.y, H = 210;
    ctx.strokeStyle = '#8f969a'; ctx.lineWidth = 2;
    const L = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
    const wAt = h => 16 - h / H * 13;
    L(x - 16, y, x - 3, y - H); L(x + 16, y, x + 3, y - H);
    ctx.strokeStyle = '#b8bfc2'; L(x - 8, y + 4, x - 1.5, y - H); L(x + 8, y + 4, x + 1.5, y - H);
    ctx.lineWidth = 0.8; ctx.strokeStyle = '#a0a7ab';
    for (let h = 0; h < H - 10; h += 18) {
      const a = wAt(h), b = wAt(h + 18);
      L(x - a, y - h, x + b, y - h - 18); L(x + a, y - h, x - b, y - h - 18); L(x - a, y - h, x + a, y - h);
    }
    // antenna mast + light
    ctx.strokeStyle = '#d0d4d6'; ctx.lineWidth = 1.2; L(x, y - H, x, y - H - 14);
    L(x - 6, y - H + 4, x + 6, y - H + 4);
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x, y - H - 2, 2.2, 0, I.TAU); ctx.fill();
    // red & white top band
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 4, y - H + 16, 8, 6);
    ctx.fillStyle = '#ecf0f1'; ctx.fillRect(x - 4.5, y - H + 22, 9, 6);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 5, y - H + 28, 10, 6);
  }

  // ---------- fires ----------
  function drawFireBase(f, G) {
    stoneRing(f.x, f.y, 11);
    ctx.fillStyle = '#2a2520'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 8, 5, 0, 0, I.TAU); ctx.fill();
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.x - 7, f.y + 2); ctx.lineTo(f.x + 5, f.y - 3); ctx.moveTo(f.x + 7, f.y + 2); ctx.lineTo(f.x - 5, f.y - 3); ctx.stroke();
  }
  function drawFlames(f, G) {
    const t = G.clock;
    if (f.fuel <= 0) {
      for (let k = 0; k < 5; k++) { ctx.fillStyle = `rgba(255,${80 + k * 10},30,${0.35 + 0.3 * Math.sin(t * 2 + k)})`; ctx.beginPath(); ctx.arc(f.x - 4 + k * 2, f.y - 1 + (k % 2), 1.4, 0, I.TAU); ctx.fill(); }
      return;
    }
    const k = I.clamp(0.6 + f.fuel / 10, 0.6, 1.2);
    const layers = [['#c0392b', 1], ['#f39c12', 0.75], ['#ffe08a', 0.45]];
    layers.forEach(([col, s], li) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      const hgt = 18 * k * s * (0.9 + 0.1 * Math.sin(t * 9 + li));
      ctx.moveTo(f.x - 7 * s, f.y);
      for (let j = 0; j <= 6; j++) {
        const u = j / 6, xx = f.x - 7 * s + 14 * s * u;
        const tip = Math.sin(u * Math.PI) * hgt * (0.75 + 0.25 * Math.sin(t * 11 + j * 1.7 + li));
        ctx.lineTo(xx + Math.sin(t * 7 + j) * 1.2, f.y - tip);
      }
      ctx.closePath(); ctx.fill();
    });
    if (Math.random() < 0.3) Rr.emit({ kind: 'ember', x: f.x + (Math.random() - 0.5) * 8, y: f.y - 8, z: 0, vx: (Math.random() - 0.5) * 8 + G.wind * 6, vy: -18 - Math.random() * 20, vz: 0, life: 1.4, max: 1.4 });
    if (Math.random() < 0.12) Rr.emit({ kind: 'smoke', x: f.x, y: f.y - 18, vx: 6 + G.wind * 10, vy: -12, life: 3.5, max: 3.5, r: 4 });
  }

  // ---------- creatures ----------
  function drawCrab(c, G) {
    const t = G.clock;
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 1, 4.5, 1.8, 0, 0, I.TAU); ctx.fill();
    const leg = c.moving ? Math.sin(t * 30) * 0.8 : 0;
    ctx.strokeStyle = '#a4382a'; ctx.lineWidth = 0.7;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(-2, k); ctx.lineTo(-5, k + 1.6 + (k % 2 ? leg : -leg)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, k); ctx.lineTo(5, k + 1.6 + (k % 2 ? -leg : leg)); ctx.stroke();
    }
    ctx.fillStyle = '#d4553e'; ctx.beginPath(); ctx.ellipse(0, -1, 3.4, 2.4, 0, 0, I.TAU); ctx.fill();
    ctx.fillStyle = '#e8735a'; ctx.beginPath(); ctx.arc(-3.8, -2.6, 1.3, 0, I.TAU); ctx.arc(3.8, -2.6, 1.3, 0, I.TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-1.2, -3.6, 0.7, 0.7); ctx.fillRect(0.6, -3.6, 0.7, 0.7);
    ctx.restore();
  }
  function drawBird(b, G, sky) {
    const flap = Math.sin(G.clock * b.fs + b.p) * 0.6;
    // shadow
    if (sky.day > 0.2) {
      ctx.fillStyle = `rgba(0,0,0,${0.12 * sky.day})`;
      ctx.beginPath(); ctx.ellipse(b.x + 30, b.y + 60, 5, 2, 0, 0, I.TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -9 * Math.cos(flap)); ctx.quadraticCurveTo(-2, -3, 0, 0); ctx.quadraticCurveTo(-2, 3, -1, 9 * Math.cos(flap)); ctx.stroke();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-1, -9 * Math.cos(flap)); ctx.lineTo(-1.5, -6 * Math.cos(flap)); ctx.moveTo(-1, 9 * Math.cos(flap)); ctx.lineTo(-1.5, 6 * Math.cos(flap)); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.4, 0, 0, I.TAU); ctx.fill();
    ctx.restore();
  }
  function drawRescue(r, G) {
    ctx.save(); ctx.translate(r.x, r.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-40, 10); ctx.quadraticCurveTo(-10, 24, 30, 40); ctx.moveTo(40, 10); ctx.quadraticCurveTo(10, 24, -30, 40); ctx.stroke();
    ctx.fillStyle = '#e8e8e4';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(16, -10, 14, 18); ctx.lineTo(-14, 18); ctx.quadraticCurveTo(-16, -10, 0, -30); ctx.fill();
    ctx.fillStyle = '#e67e22'; ctx.fillRect(-14, 6, 28, 5);
    ctx.fillStyle = '#34495e'; ctx.fillRect(-8, -8, 16, 12);
    ctx.fillStyle = '#9ad'; ctx.fillRect(-6, -7, 12, 4);
    ctx.restore();
  }
  function rescueGlow(r, G) {
    const t = G.clock;
    glow(r.x - 14, r.y + 2, 14, [255, 40, 40], 0.9);
    glow(r.x + 14, r.y + 2, 14, [40, 255, 80], 0.9);
    if ((t % 1.2) < 0.15) glow(r.x, r.y - 22, 26, [255, 255, 255], 1);
    glow(r.x, r.y - 12, 34, [255, 250, 220], 0.6);
  }

  // ---------- player ----------
  function drawPlayer(G) {
    const S = G.state, p = S.player, t = G.clock;
    const depth = G.playerDepth;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.sleep) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 1, 13, 4, 0, 0, I.TAU); ctx.fill();
      ctx.rotate(-Math.PI / 2 + 0.1);
      ctx.translate(-3, -4);
      body(p, 0, 'down', true);
      ctx.restore();
      return;
    }
    const wade = depth > 0.4 ? I.clamp(depth * 2.2, 0, 9) : 0;
    ctx.fillStyle = `rgba(0,0,0,${wade > 0 ? 0.08 : 0.25})`; ctx.beginPath(); ctx.ellipse(0, 0.5, 7.5, 3.2, 0, 0, I.TAU); ctx.fill();
    if (wade > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-20, -40, 40, 40 - wade); ctx.clip(); }
    const bob = p.moving ? Math.abs(Math.sin(p.walk * 2)) * 1.2 : Math.sin(t * 2) * 0.35;
    body(p, bob, p.dir, false, G);
    if (wade > 0) {
      ctx.restore();
      const ph = (t * 1.5) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(0, -wade, 8 + ph * 6, 3 + ph * 2, 0, 0, I.TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(0, -wade, 7, 2.6, 0, 0, I.TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function body(p, bob, dir, lying, G) {
    const S = I.game.state;
    const wp = p.walk || 0, mv = p.moving && !lying;
    const legA = mv ? Math.sin(wp * 2) * 3 : 0;
    const side = dir === 'left' || dir === 'right';
    ctx.save();
    if (dir === 'left') ctx.scale(-1, 1);
    const y0 = -bob;
    const skin = '#e3a77c', shirt = '#d9694a', shirtD = '#b5523a', shorts = '#34506e', hair = '#3b2a1f';
    const pack = S.flags.backpack && !I.game.bagDown;
    // legs
    ctx.fillStyle = shorts;
    if (side) {
      ctx.fillStyle = skin; ctx.fillRect(-2 + legA * 0.6, -8 + y0 * 0.3, 3, 8); ctx.fillRect(-1 - legA * 0.6, -8 + y0 * 0.3, 3, 8);
      ctx.fillStyle = '#5a4030'; ctx.fillRect(-2 + legA * 0.6, -1.5, 4, 1.8); ctx.fillRect(-1 - legA * 0.6, -1.5, 4, 1.8);
    } else {
      ctx.fillStyle = skin; ctx.fillRect(-4.5, -8 - (legA > 0 ? legA * 0.4 : 0), 3.4, 8); ctx.fillRect(1.1, -8 - (legA < 0 ? -legA * 0.4 : 0), 3.4, 8);
      ctx.fillStyle = '#5a4030'; ctx.fillRect(-4.8, -1.6 - (legA > 0 ? legA * 0.4 : 0), 4, 1.8); ctx.fillRect(0.9, -1.6 - (legA < 0 ? -legA * 0.4 : 0), 4, 1.8);
    }
    ctx.fillStyle = shorts; ctx.beginPath(); ctx.roundRect(-5.5, -11 + y0, 11, 5, 1.5); ctx.fill();
    // pack behind when facing down / side
    if (pack && dir !== 'up') { ctx.fillStyle = '#4f5d2c'; ctx.beginPath(); ctx.roundRect(side ? -8.5 : -6, -20 + y0, side ? 5 : 12, 11, 3); ctx.fill(); }
    // torso
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(-6, -20 + y0, 12, 10.5, 3); ctx.fill();
    ctx.fillStyle = shirtD; ctx.fillRect(-6, -12 + y0, 12, 2);
    if (pack && dir === 'down') { ctx.fillStyle = '#3c4622'; ctx.fillRect(-4.5, -20 + y0, 1.8, 9); ctx.fillRect(2.7, -20 + y0, 1.8, 9); }
    // arms
    const armA = mv ? Math.sin(wp * 2) * 2.4 : 0;
    ctx.fillStyle = skin;
    if (side) { ctx.save(); ctx.translate(0.5, -18 + y0); ctx.rotate(-armA * 0.18 + (S.player.torch ? -0.9 : 0)); ctx.fillRect(-1.5, 0, 3, 8); ctx.restore(); }
    else { ctx.fillRect(-8, -19 + y0 + armA * 0.4, 2.6, 8); ctx.fillRect(5.4, -19 + y0 - armA * 0.4 - (S.player.torch ? 3 : 0), 2.6, 8); }
    // head
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -25 + y0, 5.2, 0, I.TAU); ctx.fill();
    ctx.fillStyle = hair;
    if (dir === 'up') { ctx.beginPath(); ctx.arc(0, -25.5 + y0, 5.4, 0, I.TAU); ctx.fill(); }
    else if (side) { ctx.beginPath(); ctx.arc(-1.2, -26.5 + y0, 5.2, Math.PI * 0.75, Math.PI * 2.05); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(2.6, -25.5 + y0, 1.2, 1.4); }
    else { ctx.beginPath(); ctx.arc(0, -26.5 + y0, 5.3, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); ctx.fillRect(-5.2, -27 + y0, 2, 4); ctx.fillStyle = '#222'; ctx.fillRect(-2.4, -25 + y0, 1.2, 1.4); ctx.fillRect(1.2, -25 + y0, 1.2, 1.4); }
    // red bandana
    ctx.fillStyle = '#b8332b'; ctx.fillRect(-5.2, -29 + y0, 10.4, 1.6);
    if (pack && dir === 'up') { ctx.fillStyle = '#4f5d2c'; ctx.beginPath(); ctx.roundRect(-6.5, -21 + y0, 13, 13, 3.5); ctx.fill(); ctx.fillStyle = '#6b7a3a'; ctx.beginPath(); ctx.roundRect(-6.5, -21 + y0, 13, 5, 3); ctx.fill(); ctx.fillStyle = '#3c4622'; ctx.fillRect(-4, -13 + y0, 8, 4); }
    // torch
    if (S.player.torch && !lying) {
      const tx = side ? 5 : 7, ty = -24 + y0;
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 9); ctx.lineTo(tx, ty); ctx.stroke();
      const tt = I.game.clock;
      ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.ellipse(tx, ty - 3, 2.6, 4 + Math.sin(tt * 14) * 0.8, Math.sin(tt * 5) * 0.2, 0, I.TAU); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(tx, ty - 2, 1.2, 2.2, 0, 0, I.TAU); ctx.fill();
      if (Math.random() < 0.25) Rr.emit({ kind: 'ember', x: p.x + (dir === 'left' ? -tx : tx), y: p.y + ty - 4, z: 0, vx: (Math.random() - 0.5) * 6, vy: -16, vz: 0, life: 0.9, max: 0.9 });
    }
    ctx.restore();
  }

  // ---------- cave ----------
  function drawCave(G, view, sky, dt) {
    const S = G.state, c = I.cave, cam = G.cam;
    ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, cv.width, cv.height);
    worldTransform(cam);
    ctx.drawImage(c.canvas, 0, 0);
    // tide water flooding the entrance tunnel
    const lv = G.tide;
    const fill = I.clamp((lv + 5.5) / 11, 0, 1);
    const xw = 960 - fill * 190;
    ctx.save();
    ctx.beginPath(); ctx.rect(xw, 520, 1000 - xw, 160); ctx.clip();
    const wg = ctx.createLinearGradient(xw, 0, xw + 60, 0);
    wg.addColorStop(0, 'rgba(60,120,135,0.55)'); wg.addColorStop(1, 'rgba(25,75,95,0.85)');
    ctx.fillStyle = wg; ctx.fillRect(xw, 520, 1000 - xw, 160);
    ctx.strokeStyle = 'rgba(200,240,240,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (let y = 540; y < 670; y += 3) ctx.lineTo(xw + Math.sin(y * 0.15 + G.clock * 2.5) * 2.5, y); ctx.stroke();
    ctx.restore();
    ctx.drawImage(c.wallCanvas, 0, 0);
    // skylight beam
    if (sky.day > 0.1) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(c.SKY.x - 30, c.SKY.y - 130, c.SKY.x, c.SKY.y);
      g.addColorStop(0, 'rgba(255,245,200,0)'); g.addColorStop(1, `rgba(255,245,200,${0.18 * sky.day})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c.SKY.x - 40, c.SKY.y - 150); ctx.lineTo(c.SKY.x - 20, c.SKY.y - 150); ctx.lineTo(c.SKY.x + 22, c.SKY.y + 8); ctx.lineTo(c.SKY.x - 22, c.SKY.y + 8); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 6; k++) {
        const ph = (G.clock * 0.07 + k / 6) % 1;
        ctx.fillStyle = `rgba(255,250,220,${0.5 * Math.sin(ph * Math.PI) * sky.day})`;
        ctx.fillRect(c.SKY.x - 30 + ph * 40 + Math.sin(k * 3 + G.clock) * 6, c.SKY.y - 120 + ph * 120, 1, 1);
      }
    }
    // tin box
    if (!S.flags.fuse) {
      const b = c.BOX;
      ctx.fillStyle = '#7d8a92'; ctx.fillRect(b.x - 8, b.y - 7, 16, 9);
      ctx.fillStyle = '#a9b6bd'; ctx.fillRect(b.x - 8, b.y - 9, 16, 3);
      ctx.fillStyle = '#b03a2e'; ctx.fillRect(b.x - 2, b.y - 5, 4, 3);
    }
    for (const f of S.fires) if (f.map === 'cave') { drawFireBase(f, G); drawFlames(f, G); }
    drawPlayer(G);
    drawParticles(ctx, 'ground'); drawParticles(ctx, 'top');
    lighting(G, sky, view, true);
    worldTransform(cam);
    ctx.globalCompositeOperation = 'lighter';
    if (!S.flags.fuse) {
      const b = c.BOX;
      const tw = Math.pow(Math.max(0, Math.sin(G.clock * 2.2)), 14);
      glow(b.x + 3, b.y - 8, 6 + tw * 8, [255, 240, 190], 0.3 + 0.7 * tw);
    }
    if (S.player.torch) glow(S.player.x + G.torchOff[0], S.player.y - 22, 46, [255, 160, 70], 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
})();
