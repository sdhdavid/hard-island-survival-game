'use strict';
// ------------------------------------------------------------
//  Game state, simulation, interactions, crafting, save/load
// ------------------------------------------------------------
(function () {
  const G = I.game = {
    state: null, cam: { x: 1200, y: 1200, zoom: 1 }, clock: 0, tide: 0, wind: 0.6, overcast: 1, rain: 0, hurt: 0, fade: 0,
    footprints: [], crabs: [], birds: [], flies: [], clouds: [], keys: {}, prompt: null, running: false, torchOff: [7, 0],
    playerDepth: 0, timeScale: 1, waiting: false, auto: null, ending: null, rescue: null,
  };
  const SAVE_KEY = 'after-the-storm-save-v1';
  const HOUR = 40; // real seconds per game hour
  G.HOUR = HOUR;
  const TIDE_AMP = 5.5, TIDE_PERIOD = 6, T0 = 7.4;
  const PASS_DEPTH = 2.6;
  G.tideAt = t => TIDE_AMP * Math.sin(I.TAU * (t - T0) / TIDE_PERIOD + Math.PI);
  G.nextLowTide = function (t) {
    // time of next tide minimum after t
    let k = Math.ceil((t - (T0 + TIDE_PERIOD * 0.25)) / TIDE_PERIOD);
    let tl = T0 + TIDE_PERIOD * 0.25 + k * TIDE_PERIOD;
    if (tl < t) tl += TIDE_PERIOD;
    return tl;
  };

  const LANDMARKS = [
    { id: 'beach', name: 'חוף ההתעוררות', x: 1000, y: 1700, r: 150 },
    { id: 'boat', name: 'הסירה על השונית', x: 1880, y: 1830, r: 330 },
    { id: 'camp', name: 'המחנה הנטוש', x: 1122, y: 1296, r: 120 },
    { id: 'spring', name: 'המעיין', x: 860, y: 905, r: 120 },
    { id: 'pool', name: 'בריכת הסלע', x: 475, y: 880, r: 140 },
    { id: 'deadtree', name: 'העץ המת', x: 1300, y: 948, r: 140 },
    { id: 'hut', name: 'מגדל הרדיו', x: 1690, y: 540, r: 150 },
  ];
  G.LANDMARKS = LANDMARKS;

  function newState() {
    const w = I.world;
    return {
      v: 1, map: 'out', time: T0, regrowDay: 1,
      player: { x: w.START.x, y: w.START.y, dir: 'down', walk: 0, moving: false, torch: false, sleep: false },
      stats: { water: 62, food: 55, energy: 78, vigor: 100 },
      inv: {}, bottle: 0,
      flags: {}, objState: {}, fires: [], campBag: null, lastCamp: null,
      paintings: {}, landmarks: {}, seen: {}, explored: '',
      radio: { freq: 151.2 },
      tally: { walked: 0, crafted: 0, fires: 0 },
    };
  }
  G.EXW = 120; G.EXH = 110;

  // ---------------- lifecycle ----------------
  G.newGame = function () {
    G.state = newState();
    G.explored = new Uint8Array(G.EXW * G.EXH);
    resetTransient();
    G.intro = { t: 0, dur: 7 };
    const p = G.state.player;
    G.cam.x = 1330; G.cam.y = 1010; G.cam.zoom = I.render.baseZoom * 0.3;
    G.thoughtQueue = [];
    queueThought('...הגלים. הסערה נגמרה. אני על חוף.', 1.2);
    queueThought('התרמיל שלי — תלוי על הענף שמעל המים.', 2.6);
    queueThought('והסירה... "נוגה" תקועה על השונית.', 2.8);
    G.running = true;
    I.ui.showHint(true);
  };
  function resetTransient() {
    const w = I.world, R = I.rng(321);
    G.footprints = []; G.ending = null; G.rescue = null; G.rope = null; G.bpFall = undefined;
    G.fade = 0; G.hurt = 0; G.waiting = false; G.timeScale = 1; G.busy = false; G.auto = null;
    G.thoughtQueue = [];
    G.crabs = [];
    for (let k = 0; k < 16; k++) {
      const h = w.crabHoles[(k * 5) % w.crabHoles.length];
      G.crabs.push({ hx: h[0], hy: h[1], x: h[0] + (R() - 0.5) * 30, y: h[1] + (R() - 0.5) * 20, tx: h[0], ty: h[1], wait: R() * 3, hidden: false, hideT: 0, moving: false });
    }
    G.birds = [];
    for (let k = 0; k < 5; k++) G.birds.push({ cx: 900 + R() * 900, cy: 1550 + R() * 300, R: 90 + R() * 140, a: R() * 6, sp: (0.25 + R() * 0.2) * (R() < 0.5 ? 1 : -1), fs: 6 + R() * 3, p: R() * 6, x: 0, y: 0, vx: 1, vy: 0 });
    G.flies = [];
    for (let k = 0; k < 30; k++) {
      const base = [[860, 905], [1122, 1296], [1000, 1160], [1080, 1400]][k % 4];
      G.flies.push({ bx: base[0] + (R() - 0.5) * 160, by: base[1] + (R() - 0.5) * 120, x: 0, y: 0, s: 1.5 + R() * 2, p: R() * 6 });
    }
    G.clouds = [];
    for (let k = 0; k < 12; k++) G.clouds.push({ x: R() * 2600 - 100, y: R() * 2300 - 50, r: 260 + R() * 260 });
  }

  // ---------------- save / load ----------------
  function packExplored() {
    let s = '';
    for (let i = 0; i < G.explored.length; i += 4) s += ((G.explored[i] | (G.explored[i + 1] << 1) | (G.explored[i + 2] << 2) | (G.explored[i + 3] << 3))).toString(16);
    return s;
  }
  function unpackExplored(s) {
    const a = new Uint8Array(G.EXW * G.EXH);
    for (let k = 0; k < s.length; k++) { const v = parseInt(s[k], 16); for (let b = 0; b < 4; b++) a[k * 4 + b] = (v >> b) & 1; }
    return a;
  }
  G.save = function (silent) {
    try {
      G.state.explored = packExplored();
      G.state.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(G.state));
      if (!silent) I.ui.toast('ההתקדמות נשמרה', 'notebook');
      return true;
    } catch (e) { I.ui.toast('השמירה נכשלה: ' + e.message); return false; }
  };
  G.saveInfo = function () {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (!s) return null; return { day: Math.floor(s.time / 24) + 1, time: s.time, at: s.savedAt }; } catch (e) { return null; }
  };
  G.load = function () {
    let s;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
    if (!s) return false;
    const base = newState();
    G.state = Object.assign(base, s);
    G.state.player = Object.assign(base.player, s.player, { sleep: false, moving: false });
    G.explored = unpackExplored(s.explored || '');
    resetTransient();
    G.intro = null;
    const p = G.state.player;
    G.cam.zoom = I.render.baseZoom; G.cam.x = p.x; G.cam.y = p.y;
    G.fade = 1; G.fadeTarget = 0;
    G.running = true;
    I.ui.dirty = true;
    I.ui.toast('המשחק נטען — יום ' + (Math.floor(G.state.time / 24) + 1) + ', ' + I.fmtTime(G.state.time), 'notebook');
    return true;
  };
  G.hasSave = () => !!localStorage.getItem(SAVE_KEY);

  // ---------------- thoughts ----------------
  function queueThought(text, delay = 0, dur) { G.thoughtQueue.push({ text, delay, dur }); }
  G.think = function (text, dur) { I.ui.thought(text, dur); };
  function once(key, text, dur) {
    const S = G.state;
    if (S.seen[key]) return false;
    S.seen[key] = 1; G.think(text, dur); return true;
  }
  G.once = once;

  // ---------------- inventory ----------------
  const TOOLS = { lighter: 'מצית', knife: 'סכין' };
  G.count = function (item) {
    const S = G.state;
    if (TOOLS[item]) return S.flags[item] ? 1 : 0;
    return S.inv[item] || 0;
  };
  G.give = function (item, n = 1, silent) {
    const S = G.state;
    S.inv[item] = (S.inv[item] || 0) + n;
    I.ui.dirty = true;
    if (!silent) { I.ui.toast('+' + n + ' ' + I.ITEMS[item].name, item); I.audio.pickup(); }
  };
  G.take = function (item, n = 1) {
    const S = G.state;
    S.inv[item] = Math.max(0, (S.inv[item] || 0) - n);
    if (!S.inv[item]) delete S.inv[item];
    I.ui.dirty = true;
  };
  function need(item, n) {
    const have = G.count(item);
    return { name: TOOLS[item] || I.ITEMS[item].name, have, need: n, ok: have >= n, tool: !!TOOLS[item] };
  }
  G.need = need;
  G.canCraft = function (r) {
    const list = Object.entries(r.needs).map(([k, n]) => need(k, n));
    if (r.tool) list.push(need(r.tool, 1));
    return { list, ok: list.every(x => x.ok) };
  };
  G.useItem = function (item) {
    const S = G.state, st = S.stats, def = I.ITEMS[item];
    if (G.busy) return;
    if (item === 'bottle') {
      if (S.bottle <= 0) { G.think('הבקבוק ריק. אפשר למלא אותו במעיין או במעלה הפלג.'); I.audio.fail(); return; }
      S.bottle--; st.water = Math.min(100, st.water + 28); I.audio.splash(); I.ui.dirty = true;
      S.flags.foundWater = true;
      I.ui.toast('שתית מהבקבוק', 'bottle');
      return;
    }
    if (item === 'torch') {
      S.player.torch = !S.player.torch;
      I.audio.ignite();
      I.ui.toast(S.player.torch ? 'הלפיד דולק ביד' : 'הלפיד בתרמיל', 'torch');
      return;
    }
    if (item === 'mussels') { G.think('צדפות נאות? לא. צריך לבשל אותן על אש.'); I.audio.fail(); return; }
    if (def && def.food) {
      if (st.food > 96) { G.think('אני שבע. אשמור את זה לאחר כך.'); return; }
      G.take(item, 1);
      st.food = Math.min(100, st.food + def.food);
      if (def.water) st.water = Math.min(100, st.water + def.water);
      S.flags.ate = true;
      I.audio.pickup();
      I.ui.toast('אכלת: ' + def.name, item);
      if (item === 'coconut') once('coco', 'מים מתוקים ובשר לבן. הקוקוס מציל.');
      return;
    }
    if (def) G.think(def.desc);
  };

  // ---------------- world helpers ----------------
  const os = o => (G.state.objState[o.id] = G.state.objState[o.id] || {});
  G.os = os;
  function depthHere(x, y) {
    return G.tide + I.water.swashAt(x, y, G.clock) * 0.4 - I.world.hAt(x, y);
  }
  G.depthAt = depthHere;
  G.caveOpen = () => G.tide + 0.4 <= -4.4 + PASS_DEPTH;
  function circleFree(x, y, r, map) {
    if (map === 'cave') {
      const c = I.cave;
      for (let k = 0; k < 6; k++) { const a = k / 6 * I.TAU; if (!c.floorAt(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.6)) return false; }
      if (!c.floorAt(x, y)) return false;
      return true;
    }
    const w = I.world;
    if (x < 10 || y < 10 || x > w.W - 10 || y > w.H - 10) return false;
    if (w.blockedAt(x, y)) return false;
    const near = w.near(x, y, 50);
    for (const o of near) {
      if (o.r <= 0) continue;
      const st = G.state.objState[o.id];
      if (st && st.taken) continue;
      if (o.type === 'boat') { // elongated hull
        const dx = x - o.x, dy = y - o.y, ca = Math.cos(0.33), sa = Math.sin(0.33);
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if ((u * u) / (50 * 50) + (v * v) / (18 * 18) < 1) return false;
        continue;
      }
      if (Math.hypot(o.x - x, o.y - y) < o.r + r) return false;
    }
    if (blockHut(x, y)) return false;
    return true;
  }
  function blockHut(x, y) {
    const h = I.world.HUT;
    return x > h.x - 36 && x < h.x + 36 && y > h.y - 34 && y < h.y + 3;
  }
  G.walkable = function (x, y, fromDepth) {
    const S = G.state;
    if (!circleFree(x, y, 6, S.map)) return false;
    if (S.map === 'cave') {
      if (!G.caveOpen()) { const xw = 960 - I.clamp((G.tide + 5.5) / 11, 0, 1) * 190; if (x > xw + 18) return false; }
      return true;
    }
    const d = depthHere(x, y);
    if (d > PASS_DEPTH && !(fromDepth !== undefined && d < fromDepth)) return false;
    return true;
  };

  // ---------------- update ----------------
  G.update = function (dt) {
    const S = G.state;
    if (!S) return;
    dt = Math.min(dt, 0.1);
    G.clock += dt;
    // time
    let ts = G.timeScale;
    if (G.waiting && !G.busy && !G.ending) ts = 26;
    const dh = dt * ts / HOUR;
    const prevT = S.time;
    S.time += dh;
    G.tide = G.tideAt(S.time);
    G.wind = 0.55 + 0.3 * Math.sin(G.clock * 0.07) + 0.18 * Math.max(0, Math.sin(G.clock * 0.43) * Math.sin(G.clock * 0.17)) + (S.time < 9 ? 0.3 : 0);
    const day1 = S.time < 24;
    G.overcast = day1 ? I.clamp(1 - (S.time - T0) / 2.4, 0, 1) : 0;
    G.rain = day1 ? I.clamp(1 - (S.time - T0) / 0.7, 0, 1) * 0.8 : 0;
    G.sky = I.sky(S.time, G.overcast);
    // morning regrowth
    const dayNo = Math.floor((S.time - 6) / 24) + 1;
    if (dayNo > S.regrowDay) { S.regrowDay = dayNo; regrow(); }
    // fade
    if (G.fadeTarget !== undefined) {
      G.fade += (G.fadeTarget - G.fade) * Math.min(1, dt * 2.5);
      if (Math.abs(G.fade - G.fadeTarget) < 0.01) { G.fade = G.fadeTarget; G.fadeTarget = undefined; }
    }
    // thoughts
    if (G.thoughtQueue.length) {
      const q = G.thoughtQueue[0];
      q.delay -= dt;
      if (q.delay <= 0) { G.thoughtQueue.shift(); G.think(q.text, q.dur); }
    }
    if (G.cine) G.cine(dt);
    if (!G.busy && !G.ending) movePlayer(dt);
    else S.player.moving = false;
    survival(dh, dt);
    fires(dh);
    creatures(dt);
    explore(dt);
    triggers(dt);
    if (G.ending) updateEnding(dt); else G.checkEnding();
    camera(dt);
    // ambience
    envAudio(dt);
    G.promptT = (G.promptT || 0) - dt;
    if (G.promptT <= 0) { G.promptT = 0.08; G.prompt = computePrompt(); }
  };

  function movePlayer(dt) {
    const S = G.state, p = S.player;
    let ix = 0, iy = 0;
    const k = G.keys;
    if (k.ArrowLeft || k.KeyA) ix -= 1;
    if (k.ArrowRight || k.KeyD) ix += 1;
    if (k.ArrowUp || k.KeyW) iy -= 1;
    if (k.ArrowDown || k.KeyS) iy += 1;
    if (G.joy && (Math.abs(G.joy.x) > 0.15 || Math.abs(G.joy.y) > 0.15)) { ix = G.joy.x; iy = G.joy.y; }
    if (ix || iy) { G.target = null; G.auto = null; }
    let tgt = null;
    if (G.auto) {
      const a = G.auto;
      const pt = a.pts[a.i];
      if (!pt) { G.auto = null; }
      else {
        if (Math.hypot(pt[0] - p.x, pt[1] - p.y) < (a.tol || 9)) { a.i++; a.stuckT = 0; }
        else tgt = pt;
      }
    } else if (G.target) {
      if (Math.hypot(G.target[0] - p.x, G.target[1] - p.y) < 6) G.target = null; else tgt = G.target;
    }
    if (tgt) { ix = tgt[0] - p.x; iy = tgt[1] - p.y; }
    const len = Math.hypot(ix, iy);
    p.moving = false;
    if (S.map === 'out') G.playerDepth = depthHere(p.x, p.y); else G.playerDepth = 0;
    if (len < 0.01) return;
    ix /= len; iy /= len;
    const st = S.stats;
    let sp = 80;
    const sprint = (k.ShiftLeft || k.ShiftRight) && st.energy > 8;
    if (sprint) { sp *= 1.45; st.energy = Math.max(0, st.energy - dt * 0.35); }
    if (st.energy < 12) sp *= 0.7;
    if (G.playerDepth > 0.6) sp *= 0.62;
    else if (S.map === 'out' && I.world.streamAt(p.x, p.y) < 7) sp *= 0.8;
    const step = sp * dt;
    const d0 = G.playerDepth;
    const ox = p.x, oy = p.y;
    let nx = p.x + ix * step, ny = p.y + iy * step;
    if (G.walkable(nx, ny, d0)) { p.x = nx; p.y = ny; }
    else if (G.walkable(nx, p.y, d0)) p.x = nx;
    else if (G.walkable(p.x, ny, d0)) p.y = ny;
    else {
      // slide along obstacles by trying angled directions
      for (const a of [0.6, -0.6, 1.2, -1.2]) {
        const c = Math.cos(a), s = Math.sin(a);
        const dx = (ix * c - iy * s) * step, dy = (ix * s + iy * c) * step;
        if (G.walkable(p.x + dx, p.y + dy, d0)) { p.x += dx; p.y += dy; break; }
      }
    }
    // cave darkness limit
    if (S.map === 'cave' && !p.torch) {
      const c = I.cave;
      if (Math.hypot(p.x - c.ENTRY.x, p.y - c.ENTRY.y) > 175) {
        p.x = ox; p.y = oy;
        once('darkcave', 'חשוך מדי. אני לא רואה את הרגליים שלי. בלי אור אני עלול ליפול — צריך לפיד.', 5);
        if (G.clock - (G.darkT || 0) > 6) { G.darkT = G.clock; if (S.seen.darkcave) G.think('צריך לפיד כדי להמשיך פנימה.'); }
      }
    }
    const moved = Math.hypot(p.x - ox, p.y - oy);
    if (moved > 0.01) {
      p.moving = true;
      p.walk += moved * 0.12;
      S.tally.walked += moved;
      if (Math.abs(ix) > Math.abs(iy)) p.dir = ix > 0 ? 'right' : 'left'; else p.dir = iy > 0 ? 'down' : 'up';
      G.torchOff = [p.dir === 'left' ? -5 : 5, 0];
      // footsteps
      G.stepAcc = (G.stepAcc || 0) + moved;
      if (G.stepAcc > 13) {
        G.stepAcc = 0;
        let surf = 'grass';
        if (S.map === 'cave') surf = 'rock';
        else if (G.playerDepth > 0.2) surf = 'water';
        else { const m = I.world.matAt(p.x, p.y); surf = m === 0 ? 'sand' : m === 3 ? 'rock' : 'grass'; }
        I.audio.step(surf, sprint ? 1.3 : 1);
        if (surf === 'sand') {
          G.footprints.push({ x: p.x + (G.footAlt ? 2.5 : -2.5) * Math.abs(iy), y: p.y + (G.footAlt ? 2 : -2) * Math.abs(ix), a: Math.atan2(iy, ix) + Math.PI / 2, age: 0 });
          G.footAlt = !G.footAlt;
          if (G.footprints.length > 260) G.footprints.shift();
        }
        if (surf === 'water') I.render.emit({ kind: 'ring', x: p.x, y: p.y - 1, vx: 0, vy: 0, life: 1, max: 1, r: 4, layer: 'ground' });
        if (surf === 'sand' && sprint) I.render.emit({ kind: 'dust', x: p.x, y: p.y, vx: -ix * 10, vy: -iy * 10, life: 0.6, max: 0.6, r: 2, layer: 'ground' });
      }
      if (G.auto) G.auto.stuckT = 0;
    } else if (G.auto) {
      const a = G.auto;
      a.stuckT = (a.stuckT || 0) + dt;
      // the tide or a wave may have cut the planned route: plan again
      if (a.stuckT > 0.7 && a.final && (a.replans || 0) < 6) {
        const fin = a.final, rp = (a.replans || 0) + 1;
        if (G.goTo(fin[0], fin[1], a.tol)) G.auto.replans = rp; else a.stuck = true;
      } else if (a.stuckT > 2) a.stuck = true;
    }
    // cave transitions
    if (S.map === 'cave' && p.x > I.cave.EXIT_X) exitCave();
    if (S.map === 'out' && Math.hypot(p.x - I.world.MOUTH.x, p.y - I.world.MOUTH.y) < 10 && G.caveOpen() && iy < 0) enterCave();
  }

  function survival(dh, dt) {
    const S = G.state, st = S.stats, p = S.player, sky = G.sky || I.sky(S.time, 0);
    if (G.ending || dh <= 0) return;
    const shade = S.map === 'cave' || inShade(p.x, p.y);
    const sleep = p.sleep;
    const nearFire = S.fires.some(f => f.fuel > 0 && f.map === S.map && Math.hypot(f.x - p.x, f.y - p.y) < 130);
    G.nearFire = nearFire;
    st.water = Math.max(0, st.water - dh * (sleep ? 2.5 : shade && sky.day > 0.5 ? 5 : 8));
    st.food = Math.max(0, st.food - dh * (sleep ? 1.6 : 4.4));
    let en = sky.night > 0.5 ? 5 : 3.2;
    if (sky.night > 0.5 && !nearFire && S.map !== 'cave') en += 4;
    if (nearFire) en = Math.min(en, 1.5);
    if (!sleep) st.energy = Math.max(0, st.energy - dh * en);
    let vg = 0;
    if (st.water <= 0 || st.food <= 0) vg -= 12;
    else if (st.energy <= 0) vg -= 6;
    else vg += 4;
    st.vigor = I.clamp(st.vigor + vg * dh, 0, 100);
    G.hurt += ((st.vigor < 60 || st.water < 12 || st.food < 8 ? 1 - st.vigor / 100 + 0.2 : 0) - G.hurt) * Math.min(1, dt);
    if (st.water < 28) once('thirst', 'הגרון יבש. צריך מים מתוקים — אולי במעלה הפלג.');
    if (st.food < 28) once('hunger', 'הבטן מקרקרת. משהו לאכול... קוקוס? פירות?');
    if (st.energy < 20) once('tired', 'אני מותש. מדורה ושינה יעשו לי טוב.');
    if (st.vigor <= 0 && !G.busy) faint();
  }
  function inShade(x, y) {
    if (I.world.forestAt(x, y) > 0.35) return true;
    const f = I.world.find('fig');
    return Math.hypot(f.x - x, f.y - y) < 120;
  }
  G.inShade = inShade;

  function fires(dh) {
    for (const f of G.state.fires) {
      if (f.fuel > 0) {
        f.fuel = Math.max(0, f.fuel - dh * (f.rate || 1));
        if (f.fuel === 0 && f.map === G.state.map && Math.hypot(f.x - G.state.player.x, f.y - G.state.player.y) < 300) G.think('המדורה דעכה לגחלים. צריך עוד עצים.');
      }
    }
  }

  function regrow() {
    const S = G.state, w = I.world;
    let wood = 0;
    for (const o of w.objs) {
      const st = S.objState[o.id];
      if (!st) continue;
      if (o.type === 'drift' && o.beach && st.taken && wood < 4) { st.taken = false; wood++; }
      if (o.type === 'palm' && st.coconuts !== undefined) st.coconuts = Math.min(2, st.coconuts + 1);
      if (o.type === 'berry') st.berries = 3;
      if (o.type === 'mussel') st.n = o.n;
    }
  }

  function creatures(dt) {
    const S = G.state, p = S.player;
    if (S.map !== 'out') return;
    for (const c of G.crabs) {
      if (Math.abs(c.hx - p.x) > 900 || Math.abs(c.hy - p.y) > 700) continue;
      const dp = Math.hypot(c.x - p.x, c.y - p.y);
      if (c.hidden) {
        c.hideT -= dt;
        if (c.hideT <= 0 && Math.hypot(c.hx - p.x, c.hy - p.y) > 110) { c.hidden = false; c.x = c.hx; c.y = c.hy; c.wait = 2; }
        continue;
      }
      c.moving = false;
      if (dp < 62 || c.fleeing) {
        c.fleeing = true;
        const dx = c.hx - c.x, dy = c.hy - c.y, d = Math.hypot(dx, dy);
        if (d < 3) { c.hidden = true; c.fleeing = false; c.hideT = 5 + Math.random() * 6; I.render.emit({ kind: 'dust', x: c.x, y: c.y, vx: 0, vy: -4, life: 0.5, max: 0.5, r: 1.5, layer: 'ground' }); continue; }
        c.x += dx / d * 75 * dt; c.y += dy / d * 75 * dt; c.moving = true;
        continue;
      }
      c.wait -= dt;
      if (c.wait <= 0) {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 2) { c.wait = 1 + Math.random() * 4; c.tx = c.hx + (Math.random() - 0.5) * 70; c.ty = c.hy + (Math.random() - 0.5) * 40; }
        else { c.x += dx / d * 16 * dt; c.y += dy / d * 16 * dt; c.moving = true; }
      }
    }
    const day = (G.sky || { day: 1 }).day;
    for (const b of G.birds) {
      b.a += b.sp * dt;
      b.cx += Math.sin(G.clock * 0.05 + b.p) * 6 * dt;
      const nx = b.cx + Math.cos(b.a) * b.R, ny = b.cy + Math.sin(b.a) * b.R * 0.6 - (day < 0.3 ? 4000 : 0);
      b.vx = nx - b.x; b.vy = ny - b.y; b.x = nx; b.y = ny;
    }
    for (const f of G.flies) {
      f.x = f.bx + Math.sin(G.clock * 0.3 * f.s + f.p) * 30 + Math.sin(G.clock * 0.9 + f.p * 2) * 8;
      f.y = f.by + Math.cos(G.clock * 0.25 * f.s + f.p) * 20 - 8;
    }
    for (const c of G.clouds) {
      c.x += (10 + G.wind * 14) * dt; c.y += 2 * dt;
      if (c.x - c.r > 2500) { c.x = -c.r - 200; c.y = Math.random() * 2300; }
    }
    // footprints age & wash away
    const w = I.world;
    for (let k = G.footprints.length - 1; k >= 0; k--) {
      const f = G.footprints[k];
      f.age += dt;
      if (f.age > 90 || w.wet[w.idx(f.x, f.y)] > 0.95) G.footprints.splice(k, 1);
    }
    // sea spray at the reef & falling leaves
    G.sprayT = (G.sprayT || 0) - dt;
    if (G.sprayT <= 0 && G.view) {
      G.sprayT = 0.05;
      const R = w.REEF[Math.floor(Math.random() * w.REEF.length)];
      if (R[0] > G.view.x0 && R[0] < G.view.x1 && R[1] > G.view.y0 && R[1] < G.view.y1 + 50) {
        const s = I.water.pulse(G.clock * 0.85 + w.phase[w.idx(R[0], R[1])]);
        if (s > 0.5) for (let k = 0; k < 3; k++) I.render.emit({ kind: 'spray', x: R[0] + (Math.random() - 0.5) * 30, y: R[1], z: 0, vx: (Math.random() - 0.5) * 20, vy: -8, vz: 20 + Math.random() * 25, g: 60, life: 0.9, max: 0.9, r: 0.8 + Math.random() * 1.2 });
      }
      if (Math.random() < 0.12 * G.wind) {
        const near = w.near(p.x, p.y, 260).filter(o => o.type === 'tree');
        const t = near[Math.floor(Math.random() * near.length)];
        if (t) I.render.emit({ kind: 'leaf', x: t.x + (Math.random() - 0.5) * t.size, y: t.y - t.size * 0.5, z: t.size * 0.6, vx: 14 + G.wind * 16, vy: 3, vz: -4, g: 3, drag: 0.3, life: 5, max: 5, rot: Math.random() * 6, col: Math.random() < 0.5 ? '#c9a640' : '#8fb84e' });
      }
    }
  }

  function explore(dt) {
    const S = G.state, p = S.player;
    G.exT = (G.exT || 0) - dt;
    if (G.exT > 0 || S.map !== 'out') return;
    G.exT = 0.4;
    const cx = Math.floor(p.x / 20), cy = Math.floor(p.y / 20), R = 9;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= G.EXW || y >= G.EXH) continue;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= R * R) G.explored[y * G.EXW + x] = 1;
    }
  }

  function triggers(dt) {
    const S = G.state, p = S.player, w = I.world, F = S.flags;
    if (S.map === 'out') {
      for (const L of LANDMARKS) {
        if (!S.landmarks[L.id] && Math.hypot(p.x - L.x, p.y - L.y) < L.r) { S.landmarks[L.id] = 1; I.ui.dirty = true; if (L.id !== 'beach') I.ui.toast('נקודת ציון חדשה: ' + L.name, 'notebook'); }
      }
      const dT = Math.hypot(p.x - w.TOWER.x, p.y - w.TOWER.y);
      if (!F.sawTower && (dT < 760 || p.y < 1350)) { F.sawTower = true; G.think('אנטנה — מבצבצת מעל הצמרות, על ראש הגבעה. אם יש שם רדיו...', 5); }
      const dP = Math.hypot(p.x - w.POOL.x, p.y - w.POOL.y);
      if (dP < 150) {
        if (G.tide > 1.5 && !F.poolHigh) { F.poolHigh = true; G.think('בריכת סלע עמוקה. קו כהה של אצות מקיף את הסלעים — ממש בגובה המים.', 5); }
        if (G.tide < -1.8 && !F.poolLow) { F.poolLow = true; G.think(F.poolHigh ? 'המים בבריכה ירדו! קו האצות נשאר גבוה על הסלע... ויש פתח בקיר הצפוני.' : 'המים בבריכה נמוכים. על הסלעים, הרבה מעליי — קו כהה של אצות. כאן הים היה לא מזמן.', 6); }
        if (F.poolLow && F.poolHigh && !F.tideKnown) { F.tideKnown = true; queueThought('הים עולה ויורד. כשהוא בשפל — הפתח נחשף. אפשר לחכות לשפל.', 3, 6); I.ui.toast('למדת לקרוא את הגאות והשפל', 'notebook'); }
        if (G.caveOpen() && dP < 110 && !F.fuse) once('glint', 'משהו נוצץ שם — עמוק בתוך החושך של המערה.', 5);
      }
      if (G.tide > 2.5 && Math.hypot(p.x - 1050, p.y - 1700) < 400 && S.time > 10) once('hightide', 'הגלים הגיעו כמעט לעקבות שלי. הים עלה.', 4);
      if (Math.hypot(p.x - w.BOAT.x, p.y - w.BOAT.y) < 160) once('boatnear', 'הסירה שלי. החרטום על השונית, הירכתיים מוצפים. ארגז החירום עדיין שם.');
      const sky = G.sky;
      if (sky) {
        const hr = S.time % 24;
        if (hr > 17.2 && hr < 20 && !S.fires.some(f => f.fuel > 0)) once('dusk' + Math.floor(S.time / 24), 'השמש מתחילה לרדת. כדאי להקים מחנה ולהדליק אש לפני שיחשיך.', 5);
        if (sky.night > 0.7 && !G.nearFire && S.map === 'out') once('nightcold' + Math.floor((S.time + 6) / 24), 'חושך. רק הגלים נשמעים. בלי אש יהיה קר — והעייפות גוברת.', 5);
      }
      if (G.playerDepth > 0.8 && S.stats.water < 60) once('seawater', 'מי ים. לשתות אותם רק יצמיא אותי יותר.');
      if (!F.backpack && G.clock > 40) once('bpremind', 'הסכין, המצית, הבקבוק — הכל בתרמיל שעל הענף.');
    } else {
      const c = I.cave;
      if (p.torch) {
        for (const pt of c.PAINTINGS) {
          if (!S.paintings[pt.id] && Math.hypot(p.x - pt.x, p.y - pt.y) < 95) {
            S.paintings[pt.id] = 1; I.ui.dirty = true;
            I.ui.toast('ציור במערה: ' + pt.title + ' (' + Object.keys(S.paintings).length + '/4)', 'torch');
            if (!S.seen.firstPaint) { S.seen.firstPaint = 1; G.think('ציורים! הלפיד חושף אותם על הקירות. אפשר להתקרב ולהתבונן.', 5); }
          }
        }
        for (const m of c.MARKS) if (Math.hypot(p.x - m.x, p.y - m.y) < 80) {
          if (m.cross) once('markx', 'איקס בגיר לבן. לשם לא.');
          else once('mark', 'חץ בגיר לבן על הסלע. מישהו סימן את הדרך — טרי יותר מהציורים.');
        }
      }
      if (!G.caveOpen() && p.x > 760) once('flood' + Math.floor(S.time / 6), 'המים עולים בפתח המערה. אצטרך לחכות לשפל הבא כדי לצאת.', 5);
    }
  }

  function envAudio(dt) {
    const S = G.state, p = S.player, w = I.world;
    if (!I.audio.ready) return;
    const sky = G.sky || I.sky(S.time, 0);
    let coast = 9999, stream = 9999, fireD = 9999, trees = 0, swash = 0, elev = 0;
    if (S.map === 'out') {
      coast = Math.max(0, w.coastAt(p.x, p.y)); stream = w.streamAt(p.x, p.y);
      trees = I.clamp(w.forestAt(p.x, p.y) * 1.3, 0, 1);
      elev = I.clamp((w.hAt(p.x, p.y) - 40) / 70, 0, 1);
      // swash pulse at the nearest beach in front of the player
      swash = I.water.pulse(G.clock * 0.85 + w.phase[w.idx(p.x, Math.min(w.H - 5, p.y + 60))]);
      if (Math.hypot(p.x - w.POOL.x, p.y - w.POOL.y) < 200) coast = Math.min(coast, 60);
    } else coast = 300;
    for (const f of S.fires) if (f.map === S.map && f.fuel > 0) fireD = Math.min(fireD, Math.hypot(f.x - p.x, f.y - p.y));
    I.audio.update(dt, { coast, stream, fire: fireD, trees, night: sky.night, cave: S.map === 'cave', wind: G.wind, swash, rain: G.rain, elev, dusk: sky.dusk });
  }

  function camera(dt) {
    const S = G.state, p = S.player, cam = G.cam;
    const bz = I.render.baseZoom;
    let tx = p.x, ty = p.y - 10, tz = bz;
    if (G.intro) {
      G.intro.t += dt;
      const k = I.smooth(0, G.intro.dur, G.intro.t);
      const e = k * k * (3 - 2 * k);
      tx = I.lerp(1330, p.x, e); ty = I.lerp(1010, p.y - 10, e); tz = I.lerp(bz * 0.3, bz, e);
      cam.x = tx; cam.y = ty; cam.zoom = tz;
      if (G.intro.t >= G.intro.dur) G.intro = null;
    } else {
      if (G.camTarget) { tx = G.camTarget.x; ty = G.camTarget.y; tz = bz * (G.camTarget.z || 1); }
      const k = Math.min(1, dt * 3.5);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 2);
    }
    // clamp
    const [W, H] = I.render.size();
    const vw = W / cam.zoom / 2, vh = H / cam.zoom / 2;
    const MW = S.map === 'cave' ? I.cave.W : I.world.W, MH = S.map === 'cave' ? I.cave.H : I.world.H;
    if (vw * 2 < MW) cam.x = I.clamp(cam.x, vw, MW - vw); else cam.x = MW / 2;
    if (vh * 2 < MH) cam.y = I.clamp(cam.y, vh, MH - vh); else cam.y = MH / 2;
  }

  // ---------------- caves ----------------
  function enterCave() {
    const S = G.state;
    G.auto = null; G.target = null;
    G.busy = true; G.fadeTarget = 1;
    setTimeout(() => {
      S.map = 'cave'; S.player.x = I.cave.ENTRY.x; S.player.y = I.cave.ENTRY.y; S.player.dir = 'left';
      G.cam.x = S.player.x; G.cam.y = S.player.y;
      G.fadeTarget = 0; G.busy = false;
      S.flags.enteredCave = true;
      if (!S.player.torch) once('caveIn', 'קר ולח. האור מהפתח נגמר אחרי כמה צעדים. משהו נוצץ שם בעומק...', 5);
      else once('caveInT', 'הלפיד מרצד על הקירות הרטובים. מישהו היה כאן לפניי.', 4);
    }, 450);
  }
  function exitCave() {
    const S = G.state;
    if (!G.caveOpen()) return;
    G.auto = null; G.target = null;
    G.busy = true; G.fadeTarget = 1;
    setTimeout(() => {
      S.map = 'out'; S.player.x = I.world.MOUTH.x; S.player.y = I.world.MOUTH.y + 20; S.player.dir = 'down';
      G.cam.x = S.player.x; G.cam.y = S.player.y;
      G.fadeTarget = 0; G.busy = false;
    }, 450);
  }

  // ---------------- faint / sleep ----------------
  function faint() {
    const S = G.state;
    G.busy = true; G.fadeTarget = 1;
    G.think('הראייה מיטשטשת...', 3);
    setTimeout(() => {
      const hr = S.time % 24;
      S.time += hr > 16 || hr < 5 ? ((30.5 - hr) % 24) : 5;
      const camp = S.lastCamp;
      S.map = camp ? camp.map : 'out';
      S.player.x = camp ? camp.x + 18 : I.world.START.x; S.player.y = camp ? camp.y + 10 : I.world.START.y;
      Object.assign(S.stats, { water: Math.max(S.stats.water, 40), food: Math.max(S.stats.food, 40), energy: 60, vigor: 55 });
      G.cam.x = S.player.x; G.cam.y = S.player.y;
      G.fadeTarget = 0; G.busy = false;
      G.think(camp ? 'התעוררתי ליד המחנה. מישהו... לא, רק אני. צריך לשמור על עצמי.' : 'התעוררתי שוב על החוף. כמעט איבדתי את עצמי. מים, אוכל, מנוחה.', 6);
    }, 1600);
  }

  // ---------------- fire & crafting ----------------
  function fireSite(x, y) {
    const w = I.world, S = G.state;
    const traits = [];
    const nearSpring = Math.hypot(x - w.SPRING.x, y - w.SPRING.y) < 170;
    const nearStream = w.streamAt(x, y) < 70 && y < 1600;
    if (nearSpring || nearStream) traits.push({ k: 'water', t: 'מים מתוקים קרובים — שותים לפני השינה ואחריה' });
    if (inShade(x, y)) traits.push({ k: 'shade', t: 'צל — פחות צמא בשעות החום' });
    const beach = w.matAt(x, y) === 0 || w.coastAt(x, y) < 170;
    if (beach) { traits.push({ k: 'wood', t: 'עצי סחף בשפע — הים מביא חדשים כל בוקר' }); traits.push({ k: 'wind', t: 'רוח מהים — האש אוכלת עצים מהר יותר', bad: true }); }
    const tarp = w.find('tarp');
    if (Math.hypot(x - tarp.x, y - tarp.y) < 90) traits.push({ k: 'shelter', t: 'מחסה מתחת ליריעה — שינה טובה, האש מוגנת' });
    const db = Math.hypot(x - w.BOAT.x, y - w.BOAT.y);
    traits.push({ k: 'boat', t: db < 600 ? 'קרוב לסירה ולחוף' : 'רחוק מהסירה — הדרך חזרה ארוכה', bad: db >= 600 });
    return traits;
  }
  G.fireSite = fireSite;
  G.fireSpot = function () {
    const p = G.state.player;
    const off = { down: [0, 16], up: [0, -16], left: [-16, 0], right: [16, 0] }[p.dir];
    return [p.x + off[0], p.y + off[1]];
  };
  G.canPlaceFire = function () {
    const S = G.state;
    if (S.map === 'cave') return 'הקרקע כאן רטובה מדי, והעשן לא יצא.';
    const [x, y] = G.fireSpot();
    if (G.depthAt(x, y) > -0.5 || I.world.hAt(x, y) < 5) return 'קרוב מדי למים — הגאות תכבה את האש.';
    if (!circleFree(x, y, 8, 'out')) return 'אין כאן מקום פנוי למדורה.';
    if (S.fires.some(f => Math.hypot(f.x - x, f.y - y) < 60)) return 'כבר יש מדורה ממש כאן.';
    return null;
  };
  G.craft = function (id) {
    const S = G.state, r = I.RECIPES.find(r => r.id === id);
    const c = G.canCraft(r);
    if (!c.ok) { I.audio.fail(); return false; }
    if (id === 'fire') {
      const err = G.canPlaceFire();
      if (err) { G.think(err); I.audio.fail(); return false; }
      const [x, y] = G.fireSpot();
      for (const [k, n] of Object.entries(r.needs)) G.take(k, n);
      makeFire(x, y, false);
    } else if (id === 'torch') {
      if (!S.fires.some(f => f.fuel > 0 && f.map === S.map && Math.hypot(f.x - S.player.x, f.y - S.player.y) < 95)) { G.think('צריך להדליק את הלפיד באש — ליד מדורה בוערת.'); I.audio.fail(); return false; }
      for (const [k, n] of Object.entries(r.needs)) G.take(k, n);
      G.give('torch', 1, true); S.player.torch = true;
      I.audio.ignite(); I.audio.craft();
      I.ui.toast('הכנת לפיד — הוא דולק ביד', 'torch');
      once('torchmade', 'אור חם ורועד. עכשיו אפשר להיכנס לחושך.');
    } else {
      for (const [k, n] of Object.entries(r.needs)) G.take(k, n);
      G.give(id, 1, true);
      I.audio.craft();
      I.ui.toast('הכנת ' + r.name, id);
      if (id === 'rope') once('ropemade', 'חבל חזק. עכשיו אפשר למשוך את ארגז החירום מהסירה.');
    }
    S.tally.crafted++;
    I.ui.dirty = true;
    return true;
  };
  function makeFire(x, y, pit) {
    const S = G.state;
    const traits = fireSite(x, y);
    let rate = 1;
    if (traits.some(t => t.k === 'wind')) rate = 1.35;
    if (traits.some(t => t.k === 'shelter')) rate = 0.7;
    const f = { id: 'fire' + Date.now() % 100000 + S.fires.length, x, y, fuel: 3.5, map: 'out', pit, traits, rate };
    S.fires.push(f);
    S.flags.madeFire = true;
    S.tally.fires++;
    I.audio.ignite(); I.audio.craft();
    I.ui.toast('הדלקת מדורה', 'wood');
    once('firemade', 'אש! חום ואור. כאן אפשר לבשל, לנוח — ולשמור את מה שהשגתי.', 5);
    return f;
  }
  G.nearestFire = function (r = 34) {
    const S = G.state, p = S.player;
    let best = null, bd = r;
    for (const f of S.fires) { if (f.map !== S.map) continue; const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { bd = d; best = f; } }
    return best;
  };
  G.fireAction = function (f, act) {
    const S = G.state, st = S.stats;
    if (act === 'wood') { if (!G.count('wood')) return; G.take('wood'); f.fuel = Math.min(14, f.fuel + 2.5); I.audio.ignite(); I.ui.toast('הוספת עצים למדורה (' + f.fuel.toFixed(1) + ' שעות)', 'wood'); }
    if (act === 'relight') { if (!G.count('wood') || !S.flags.lighter) return; G.take('wood'); f.fuel = 2.5; I.audio.ignite(); I.ui.toast('המדורה בוערת שוב', 'wood'); }
    if (act === 'cook') { const n = G.count('mussels'); if (!n || f.fuel <= 0) return; G.take('mussels', n); G.give('cooked', n, true); I.audio.ignite(); I.ui.toast('צלית ' + n + ' צדפות', 'cooked'); once('cooked1', 'הריח של צדפות צלויות על האש... ארוחה אמיתית.'); }
    if (act === 'rest') rest(f, 1);
    if (act === 'sleep') sleep(f);
    if (act === 'save') { setCamp(f); G.save(); }
    I.ui.dirty = true;
  };
  function setCamp(f) {
    const S = G.state;
    S.lastCamp = { x: f.x, y: f.y, map: f.map };
    S.campBag = { x: f.x - 16, y: f.y + 9, map: f.map };
  }
  function rest(f, hours) {
    const S = G.state, st = S.stats;
    G.busy = true; G.fadeTarget = 0.75;
    S.player.sleep = true;
    setCamp(f);
    I.ui.closeAll();
    setTimeout(() => {
      S.time += hours;
      f.fuel = Math.max(0, f.fuel - hours * (f.rate || 1));
      st.energy = Math.min(100, st.energy + (f.fuel > 0 ? 18 : 10) * hours);
      st.water = Math.max(0, st.water - 3 * hours); st.food = Math.max(0, st.food - 2 * hours);
      S.player.sleep = false; G.busy = false; G.fadeTarget = 0;
      G.save(true);
      I.ui.toast('נחת שעה ליד האש — ההתקדמות נשמרה', 'notebook');
    }, 1400);
  }
  function sleep(f) {
    const S = G.state, st = S.stats;
    const hr = S.time % 24;
    const hours = hr >= 6.5 ? 30.5 - hr : 6.5 - hr;
    G.busy = true; G.fadeTarget = 1;
    S.player.sleep = true;
    setCamp(f);
    I.ui.closeAll();
    const traits = f.traits || [];
    for (let k = 0; k < 6; k++) setTimeout(() => I.render.emit({ kind: 'zzz', x: S.player.x + 4 + k, y: S.player.y - 16, z: 0, vx: 4, vy: -8, vz: 0, life: 2, max: 2 }), k * 300);
    setTimeout(() => {
      const fuelNeed = hours * (f.rate || 1);
      const enough = f.fuel >= fuelNeed;
      f.fuel = Math.max(0, f.fuel - fuelNeed);
      S.time += hours;
      const shelter = traits.some(t => t.k === 'shelter');
      st.energy = enough ? (shelter ? 100 : 92) : (shelter ? 75 : 62);
      st.water = Math.max(0, st.water - hours * 2.4); st.food = Math.max(0, st.food - hours * 1.5);
      if (traits.some(t => t.k === 'water')) st.water = Math.max(st.water, 85);
      st.vigor = Math.min(100, st.vigor + 30);
      S.player.sleep = false;
      G.save(true);
      G.fadeTarget = 0;
      setTimeout(() => { G.busy = false; }, 600);
      const day = Math.floor(S.time / 24) + 1;
      let msg = 'בוקר. יום ' + day + ' על האי.';
      if (!enough) msg += ' המדורה כבתה באמצע הלילה — התעוררתי רועד.';
      else if (shelter) msg += ' היריעה עצרה את הרוח. ישנתי כמו תינוק.';
      if (traits.some(t => t.k === 'water')) msg += ' שתיתי מהמעיין לפני שקמתי.';
      G.think(msg, 6);
      I.ui.toast('ישנת עד הבוקר — ההתקדמות נשמרה', 'notebook');
    }, 2600);
  }

  // ---------------- interactions ----------------
  const act = (key, label, run, opt = {}) => Object.assign({ key, label, run, enabled: true }, opt);
  function interactionsFor(o) {
    const S = G.state, st = os(o), F = S.flags;
    switch (o.type) {
      case 'backpack':
        if (F.backpack) return null;
        return { title: 'התרמיל שלך', desc: 'תלוי על הענף מעל המים, מתנדנד ברוח.', actions: [act('E', 'למשוך את התרמיל מהענף', pullBackpack)] };
      case 'debris':
        if (st.opened) return null;
        return { title: 'ארגז שנסחף לחוף', desc: 'ארגז עץ מהסירה, חצי קבור בחול.', actions: [act('E', 'לפתוח את הארגז', () => { st.opened = true; G.give('beans', 1); G.give('stone', 1, true); G.think('פחית שעועית ואבן חלקה שנתקעה בין הקרשים. מתחילים.'); })] };
      case 'plank':
        if (st.taken) return null;
        return { title: 'קרש מהסירה', actions: [act('E', 'לאסוף (עצים ×2)', () => { st.taken = true; G.give('wood', 2); })] };
      case 'logpage':
        if (st.taken) return null;
        return { title: 'דף רטוב', desc: 'דף שנתלש מיומן הסירה.', actions: [act('E', 'לקרוא', () => { st.taken = true; F.readLog = true; I.ui.note('דף מיומן הסירה', LOG_TEXT); })] };
      case 'buoy':
        return { title: 'מצוף כתום', actions: [act('E', 'לבדוק', () => G.think('המצוף של "נוגה". החבל נקרע — הסערה גררה אותי מהעוגן.'))] };
      case 'drift': case 'branch':
        if (st.taken) return null;
        return { title: o.type === 'drift' ? 'עץ סחף' : 'ענף יבש', actions: [act('E', 'לאסוף עצים', () => { st.taken = true; G.give('wood', 1); })] };
      case 'stone':
        if (st.taken) return null;
        return { title: 'אבן חלקה', actions: [act('E', 'לאסוף אבן', () => { st.taken = true; G.give('stone', 1); })] };
      case 'mussel': {
        const n = st.n !== undefined ? st.n : o.n;
        if (n <= 0) return null;
        const dry = G.depthAt(o.x, o.y) < 0.9;
        return { title: 'מושבת צדפות', desc: dry ? 'צדפות שחורות נצמדות לסלע הרטוב.' : 'צדפות מתחת למים, מעבר להישג יד.', actions: [act('E', dry ? 'לתלוש צדפות' : 'מכוסה במים — אולי בשפל', () => { st.n = 0; G.give('mussels', n); once('mus', 'צדפות טריות. חייבים לבשל אותן לפני שאוכלים.'); }, { enabled: dry })] };
      }
      case 'palm': {
        const coco = st.coconuts !== undefined ? st.coconuts : o.coconuts;
        const fib = st.fiber !== undefined ? st.fiber : o.fiber;
        const a = [];
        a.push(act('E', coco > 0 ? 'לנער את הדקל (קוקוס)' : 'אין קוקוסים — אולי מחר', () => {
          st.coconuts = coco - 1; G.give('coconut', 1); I.audio.thud();
          I.render.emit({ kind: 'leaf', x: o.x, y: o.y - 4, z: 30, vx: 6, vy: 2, vz: -10, g: 20, life: 2, max: 2, rot: 0, col: '#7fb048' });
        }, { enabled: coco > 0 }));
        a.push(act('R', fib > 0 ? 'לחתוך סיבים מהגזע' : 'הסיבים כבר נחתכו', () => { st.fiber = fib - 1; G.give('fiber', 1); }, { enabled: fib > 0 && F.knife, needs: fib > 0 ? [need('knife', 1)] : null }));
        return { title: 'דקל קוקוס', actions: a };
      }
      case 'pine': {
        const rs = st.resin !== undefined ? st.resin : o.resin;
        return { title: 'עץ שרף', desc: rs > 0 ? 'טיפות ענבר דביקות נוטפות מהקליפה.' : 'הקליפה כבר גורדה.', actions: [act('E', rs > 0 ? 'לגרד שרף' : 'אין עוד שרף', () => { st.resin = 0; G.give('resin', 1); once('resin1', 'שרף דביק וריחני. בוער לאט — טוב ללפיד.'); }, { enabled: rs > 0 && F.knife, needs: rs > 0 ? [need('knife', 1)] : null })] };
      }
      case 'berry': {
        const n = st.berries !== undefined ? st.berries : o.berries;
        return { title: 'שיח פירות בר', actions: [act('E', n > 0 ? 'לקטוף פירות' : 'השיח ריק — יתמלא מחר', () => { st.berries = 0; G.give('berries', n); }, { enabled: n > 0 })] };
      }
      case 'spring':
        return { title: 'המעיין', desc: 'מים צלולים וקרים מבעבעים מבין הסלעים.', actions: [
          act('E', 'לשתות', () => drink(40, 'מים מתוקים וקרים. החיים חוזרים.')),
          act('R', 'למלא את הבקבוק', () => { S.bottle = 3; I.audio.splash(); I.ui.toast('הבקבוק מלא (3 לגימות)', 'bottle'); I.ui.dirty = true; }, { enabled: F.backpack && S.bottle < 3, needs: F.backpack ? null : [{ name: 'בקבוק (בתרמיל)', have: 0, need: 1, ok: false }] })] };
      case 'campnote':
        return { title: 'פתק על המוט', desc: st.read ? 'כבר קראת.' : 'כתב יד צפוף, מוגן בשקית ניילון.', actions: [act('E', 'לקרוא את הפתק', () => { st.read = true; F.readNote = true; I.ui.note('פתק במחנה הנטוש', NOTE_TEXT); I.ui.dirty = true; })] };
      case 'campcrate':
        if (st.opened) return { title: 'ארגז ריק', actions: [act('E', 'לבדוק', () => G.think('ריק. רק ריח של מלח ושמן.'))] };
        return { title: 'ארגז במחנה', actions: [act('E', 'לפתוח', () => { st.opened = true; G.give('beans', 1); G.give('fiber', 1, true); G.think('פחית שימורים וצרור סיבי דקל. מי שגר כאן התכונן.'); })] };
      case 'pit': {
        if (S.fires.some(f => f.pit)) return null;
        const nd = [need('wood', 2), need('lighter', 1)];
        return { title: 'בור אש ישן', desc: 'מעגל אבנים מוכן מתחת ליריעה.', needs: nd, actions: [act('E', 'להדליק מדורה בבור (עצים ×2)', () => { G.take('wood', 2); makeFire(o.x, o.y, true); }, { enabled: nd.every(n => n.ok) })] };
      }
      case 'tarp': return { title: 'יריעה קרועה', actions: [act('E', 'לבדוק', () => G.think('יריעה כתומה על שני מוטות. מחסה לא רע מפני הרוח — מקום טוב למחנה.'))] };
      case 'rack': return { title: 'מתקן ייבוש', actions: [act('E', 'לבדוק', () => G.think('מקלות קשורים בחבל. מישהו ייבש כאן דגים. החבל עשוי סיבי דקל.'))] };
      case 'fig': return { title: 'פיקוס ענק', actions: [act('E', 'לבדוק', () => G.think('עץ ענק עם שורשים תלויים. בצל שלו קריר בהרבה.'))] };
      case 'deadtree': return { title: 'העץ המת', actions: [act('E', 'לבדוק', () => G.think('עץ לבן ומת, גבוה מכל מה שסביבו. רואים אותו מרחוק — נקודת ציון טובה.'))] };
      case 'cairn': return { title: 'ערימת אבנים', actions: [act('E', 'לבדוק', () => G.think('אבנים מסודרות זו על זו. מישהו סימן כאן את השביל אל הגבעה.'))] };
      case 'sign': return { title: 'שלט עץ', actions: [act('E', 'לקרוא', () => G.think('כתוב בסכין: "' + o.text + '"', 4))] };
      case 'tower': return { title: 'מגדל הרדיו', actions: [act('E', 'לבדוק', () => G.think(F.powered ? 'הנורה האדומה מהבהבת בראש המגדל. האי שוב מדבר.' : 'מגדל פלדה מחליד. כבל עבה יורד ממנו אל הבקתה.'))] };
      case 'hut':
        return { title: 'בקתת הרדיו', desc: F.powered ? 'המכשיר מזמזם.' : 'דלת פח חורקת.', actions: [act('E', 'להיכנס למכשיר הקשר', () => { F.visitedHut = true; I.ui.openRadio(); I.ui.dirty = true; })] };
      case 'mouth': {
        const open = G.caveOpen();
        return { title: 'פתח בקיר הסלע', desc: open ? 'המים נסוגו. מדף סלע רטוב מוביל פנימה.' : 'המים מכסים את הפתח.', actions: [act('E', open ? 'להיכנס למערה' : 'המים עמוקים מדי', enterCave, { enabled: open })] };
      }
      case 'boat': {
        if (F.crate) return { title: 'הסירה "נוגה"', actions: [act('E', 'לבדוק את הסירה', () => G.think('החרטום סדוק לכל אורכו. היא לא תשוט שוב בלי מספנה.'))] };
        const hasRope = G.count('rope') > 0;
        const a = [act('E', 'לקשור חבל ולמשוך את הארגז', pullCrate, { enabled: hasRope })];
        let needs = [need('rope', 1)];
        if (!hasRope) {
          const fn = need('fiber', 3);
          needs = [{ name: 'חבל', have: 0, need: 1, ok: false }, Object.assign(fn, { name: '↳ סיבי דקל לחבל' })];
          if (fn.ok) a.push(act('R', 'לשזור חבל מ-3 סיבים', () => G.craft('rope')));
        }
        return { title: 'הסירה "נוגה"', desc: 'ארגז החירום תקוע בירכתיים המוצפים. כבד מדי למשוך ביד.', needs, actions: a };
      }
    }
    return null;
  }
  function drink(n, text) {
    const S = G.state;
    S.stats.water = Math.min(100, S.stats.water + n);
    S.flags.foundWater = true;
    I.audio.splash();
    once('drink1', text);
    I.ui.dirty = true;
  }
  function pullBackpack() {
    const S = G.state;
    G.busy = true; G.bpFall = 0;
    const o = I.world.find('backpack');
    const t0 = G.clock;
    G.cine = (dt) => {
      G.bpFall = (G.clock - t0) / 0.7;
      if (G.bpFall >= 1 && !G._bpSplash) { G._bpSplash = true; I.audio.splash(); for (let k = 0; k < 10; k++) I.render.emit({ kind: 'spray', x: o.x, y: o.y, z: 0, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 10, vz: 30 + Math.random() * 30, g: 90, life: 0.8, max: 0.8, r: 1 }); }
      if (G.clock - t0 > 1.3) {
        G.cine = null; G.busy = false; G.bpFall = undefined;
        S.flags.backpack = S.flags.lighter = S.flags.knife = S.flags.notebook = true;
        S.bottle = 0;
        I.ui.dirty = true;
        I.audio.pickup();
        I.ui.toast('התרמיל! בפנים: בקבוק, מצית, סכין מתקפלת ומחברת', 'notebook');
        G.think('הכל רטוב, אבל המצית עוד מצית והסכין חדה. ובמחברת אפשר לרשום מה מצאתי.', 6);
        setTimeout(() => I.ui.pulse('btnNote'), 500);
      }
    };
  }
  function pullCrate() {
    const S = G.state, w = I.world, b = w.find('boat');
    G.busy = true;
    const t0 = G.clock;
    const st = os(b);
    st.crateX = 1846; st.crateY = 1792;
    G.rope = { x: b.x - 24, y: b.y - 6, k: 0 };
    I.audio.thud();
    G.cine = () => {
      const k = (G.clock - t0) / 2;
      G.rope.k = Math.min(1, k);
      if (k > 0.3 && k < 0.95 && Math.random() < 0.15) I.audio.step('water', 0.8);
      if (k >= 1) {
        G.cine = null; G.busy = false; G.rope = null;
        S.flags.crate = true;
        I.audio.splash(); I.audio.thud();
        G.give('battery', 1); G.give('beans', 2, true);
        I.ui.toast('ארגז החירום: מצבר, ושתי פחיות שימורים', 'battery');
        G.think('הארגז על הסלעים! המצבר של הסירה — הנורית עוד ירוקה.', 5);
        I.ui.dirty = true;
      }
    };
  }

  const LOG_TEXT = `<p class="hand">יומן "נוגה" — עמוד 41</p>
<p>הותקן מצבר חדש. אוחסן בארגז החירום בירכתיים, יחד עם מנות חירום.</p>
<p>הערה לעצמי: לבדוק את חבל העוגן לפני הסערה. ערוץ החירום הימי — 16. משמר החופים מאזין תמיד.</p>
<p class="dim">...השאר נמחק במים.</p>`;
  const NOTE_TEXT = `<p class="hand">יום 23.</p>
<p>הסופה לקחה את הסירה שלי. הרדיו במגדל שותק מאז שהנתיך נשרף, והמצבר הישן מת.</p>
<p>את הנתיך החלופי שמרתי בקופסת פח <b>במערה שליד בריכת הסלע</b>, מערבה לאורך השביל. נכנסים רק <b>כשהים בשפל</b> — שים לב לקו האצות על הסלעים. בפנים חושך מוחלט; סימנתי את הדרך בגיר.</p>
<p>המעיין שמעל הפלג מתוק. הדקלים נותנים סיבים לחבל, ועץ השרף שליד המחנה נותן דלק ללפיד.</p>
<p class="dim">אם מישהו קורא את זה — אל תוותר. — ד.</p>`;
  const BOX_TEXT = `<p class="hand">בתוך קופסת הפח, עטוף בבד שמן:</p>
<p>נתיך זכוכית חדש, ופתק קטן:</p>
<p class="hand">"נתיך 5A למקלט־משדר. לכוון לערוץ 16 — 156.8. בהצלחה. — ד."</p>`;
  G.texts = { LOG_TEXT, NOTE_TEXT, BOX_TEXT };

  function zoneInteractions() {
    const S = G.state, p = S.player, w = I.world, out = [];
    if (S.map === 'cave') {
      const c = I.cave;
      if (!S.flags.fuse && Math.hypot(p.x - c.BOX.x, p.y - c.BOX.y) < 32) {
        out.push({ x: c.BOX.x, y: c.BOX.y, d: Math.hypot(p.x - c.BOX.x, p.y - c.BOX.y), info: { title: 'קופסת פח', desc: 'על מדף סלע יבש, מעל קו המים.', actions: [act('E', 'לפתוח את הקופסה', () => { S.flags.fuse = true; G.give('fuse', 1); I.ui.note('קופסת הפח', BOX_TEXT); })] } });
      }
      const dEntry = Math.hypot(p.x - c.ENTRY.x, p.y - c.ENTRY.y);
      if (!p.torch && dEntry > 130) {
        const has = G.count('torch') > 0;
        out.push({ x: p.x - 30, y: p.y - 20, d: 30, info: { title: 'חושך מוחלט', desc: has ? 'הלפיד בתרמיל — צריך להחזיק אותו ביד.' : 'בלי אור אי אפשר להמשיך. לפיד נדלק ליד מדורה.',
          needs: has ? null : [need('wood', 1), need('fiber', 1), need('resin', 1)],
          actions: has ? [act('E', 'להדליק את הלפיד', () => G.useItem('torch'))] : [act('E', 'לחזור אל האור שבפתח', () => G.goTo(c.ENTRY.x, c.ENTRY.y))] } });
      }
      if (p.torch) for (const pt of c.PAINTINGS) {
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < 60) out.push({ x: pt.x, y: pt.y, d, info: { title: 'ציור: ' + pt.title, actions: [act('E', 'להתבונן בציור', () => I.ui.note(pt.title, '<p>' + pt.text + '</p>'))] } });
      }
      return out;
    }
    // fresh water in the stream
    const sd = w.streamAt(p.x, p.y);
    if (sd < 16) {
      const salty = p.y > 1600;
      out.push({ x: p.x, y: p.y + 4, d: sd + 8, info: { title: 'הפלג', desc: salty ? 'כאן הפלג פוגש את הים.' : 'מים צלולים זורמים על חלוקי אבן.', actions: salty ? [act('E', 'לטעום', () => G.think('מלוח מדי — הים מתערבב בפלג. כדאי לעלות במעלה הזרם, אל תוך האי.'))] : [
        act('E', 'לשתות מהפלג', () => drink(30, 'מים מתוקים! קצת טעם של אדמה, אבל מתוקים.')),
        act('R', 'למלא את הבקבוק', () => { S.bottle = 3; I.audio.splash(); I.ui.toast('הבקבוק מלא (3 לגימות)', 'bottle'); I.ui.dirty = true; }, { enabled: S.flags.backpack && S.bottle < 3 })] } });
    }
    return out;
  }

  function computePrompt() {
    const S = G.state, p = S.player;
    if (G.busy || G.ending || I.ui.isOpen()) return null;
    let best = null, bd = 1e9;
    const f = G.nearestFire(34);
    if (f) {
      let d = Math.hypot(f.x - p.x, f.y - p.y);
      d -= 20;
      best = { x: f.x, y: f.y - 14, info: { title: f.fuel > 0 ? 'המדורה שלך' : 'גחלים', desc: f.fuel > 0 ? 'בוערת עוד ' + f.fuel.toFixed(1) + ' שעות' : 'צריך עצים כדי להצית מחדש', actions: [act('E', 'לשבת ליד האש (בישול, מנוחה, שמירה)', () => I.ui.openFire(f))] } };
      bd = d;
    }
    if (S.map === 'out') {
      const near = I.world.near(p.x, p.y, 70);
      for (const o of near) {
        const reach = o.reach || (o.r ? o.r + 22 : 0);
        if (!reach) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d > reach) continue;
        const sc = d - reach * 0.3;
        if (sc >= bd) continue;
        const info = interactionsFor(o);
        if (!info) continue;
        best = { x: o.x, y: o.y - (o.type === 'palm' ? 30 : o.type === 'hut' ? 60 : o.type === 'tower' ? 60 : 18), info, o }; bd = sc;
      }
    }
    for (const z of zoneInteractions()) if (z.d < bd) { best = { x: z.x, y: z.y - 16, info: z.info }; bd = z.d; }
    return best;
  }
  G.doAction = function (key) {
    const pr = G.prompt;
    if (!pr || G.busy) return false;
    const a = pr.info.actions.find(a => a.key === key) || (key === 'E' ? pr.info.actions[0] : null);
    if (!a) return false;
    if (!a.enabled) { I.audio.fail(); if (pr.info.needs || a.needs) G.think('חסר לי משהו בשביל זה.'); return false; }
    a.run();
    G.prompt = null; G.promptT = 0.15;
    I.ui.dirty = true;
    return true;
  };

  // ---------------- radio ----------------
  G.RADIO = { min: 150, max: 162, target: 156.8, music: 153.3, morse: 160.4 };
  G.radioInstall = function (item) {
    const S = G.state;
    if (!G.count(item)) return;
    G.take(item);
    S.flags[item === 'battery' ? 'batteryIn' : 'fuseIn'] = true;
    I.audio.thud(); I.audio.click();
    if (S.flags.batteryIn && S.flags.fuseIn) { S.flags.repaired = true; G.think('המצבר מחובר, הנתיך במקום. עכשיו — להדליק.', 4); }
    I.ui.dirty = true;
  };
  G.radioPower = function () {
    const S = G.state;
    if (!S.flags.repaired) return;
    S.flags.powered = true;
    I.audio.click();
    once('powered', 'המכשיר מתעורר! רק רעש לבן... צריך לסובב את החוגה עד שיישמע קול.', 5);
  };
  G.radioMix = function () {
    const f = G.state.radio.freq, R = G.RADIO;
    const clar = I.clamp(1 - Math.abs(f - R.target) / 0.9, 0, 1);
    const mus = I.clamp(1 - Math.abs(f - R.music) / 0.6, 0, 1);
    const mor = I.clamp(1 - Math.abs(f - R.morse) / 0.5, 0, 1);
    return { voice: clar * clar, static: 1 - Math.max(clar * 0.85, mus * 0.7, mor * 0.7), music: mus * mus, morse: mor * mor, clarity: clar };
  };

  // ---------------- ending ----------------
  function updateEnding(dt) {
    const S = G.state, E = G.ending, w = I.world;
    E.t += dt;
    const hr = S.time % 24;
    if (hr < 18.9 && hr > 6) G.timeScale = 30; else G.timeScale = 1;
    const p = S.player;
    p.dir = 'down';
    if (!G.rescue) G.rescue = { x: 1240, y: 2150, beam: -Math.PI / 2 };
    const r = G.rescue;
    const k = I.smooth(1.5, 12, E.t);
    r.x = I.lerp(1240, 1330, k); r.y = I.lerp(2160, 1975, k);
    r.beam = -Math.PI / 2 + Math.sin(E.t * 0.6) * 0.5 + (E.t > 9 ? (Math.atan2(p.y - r.y, p.x - r.x) + Math.PI / 2) * I.smooth(9, 12, E.t) : 0);
    G.camTarget = { x: I.lerp(p.x, p.x * 0.45 + r.x * 0.55, I.smooth(0, 5, E.t)), y: I.lerp(p.y, p.y * 0.42 + r.y * 0.58, I.smooth(0, 5, E.t)), z: 0.72 };
    if (E.t > 6.5 && !E.horn) { E.horn = true; I.audio.horn(); }
    if (E.t > 9 && !E.waved) { E.waved = true; G.think('אורות! מעבר לשונית — סירת חילוץ. הם ראו אותי.', 6); I.audio.chord(true); }
    if (E.t > 15 && !E.shown) { E.shown = true; G.timeScale = 1; S.flags.rescued = true; I.ui.showEnd(); }
  }
  G.startEnding = function () {
    if (G.ending) return;
    G.ending = { t: 0 };
    G.busy = true;
    G.waiting = false;
    I.ui.closeAll();
    G.think('החוף. השונית. ועכשיו — לחכות.', 4);
  };
  G.checkEnding = function () {
    const S = G.state, p = S.player;
    if (S.flags.called && !G.ending && S.map === 'out' && p.y > 1560 && p.x > 650 && p.x < 1750) G.startEnding();
  };

  // ---------------- pathfinding (click-to-move & tests) ----------------
  G.findPath = function (sx, sy, tx, ty, maxNodes = 90000) {
    const S = G.state, C = 8;
    const MW = S.map === 'cave' ? I.cave.W : I.world.W, MH = S.map === 'cave' ? I.cave.H : I.world.H;
    const pad = 500;
    const x0 = Math.max(0, Math.floor((Math.min(sx, tx) - pad) / C)), y0 = Math.max(0, Math.floor((Math.min(sy, ty) - pad) / C));
    const x1 = Math.min(Math.floor(MW / C) - 1, Math.ceil((Math.max(sx, tx) + pad) / C)), y1 = Math.min(Math.floor(MH / C) - 1, Math.ceil((Math.max(sy, ty) + pad) / C));
    const gw = x1 - x0 + 1, gh = y1 - y0 + 1, n = gw * gh;
    const walk = new Int8Array(n); // 0 unknown, 1 ok, -1 blocked
    const ok = i => { if (!walk[i]) walk[i] = G.walkable(((i % gw) + x0 + 0.5) * C, (((i / gw) | 0) + y0 + 0.5) * C) ? 1 : -1; return walk[i] === 1; };
    const toI = (x, y) => { const gx = Math.floor(x / C) - x0, gy = Math.floor(y / C) - y0; if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return -1; return gy * gw + gx; };
    let si = toI(sx, sy), ti = toI(tx, ty);
    if (si < 0 || ti < 0) return null;
    // snap the goal to the nearest walkable cell
    if (!ok(ti)) {
      let best = -1, bd = 1e9; const tgx = ti % gw, tgy = (ti / gw) | 0;
      for (let r = 1; r < 6 && best < 0; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        const gx = tgx + ox, gy = tgy + oy; if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const i = gy * gw + gx; if (ok(i)) { const d = ox * ox + oy * oy; if (d < bd) { bd = d; best = i; } }
      }
      if (best < 0) return null; ti = best;
    }
    walk[si] = 1;
    const g = new Float32Array(n).fill(1e9), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], hf = [];
    const push = (i, f) => { heap.push(i); hf.push(f); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; [hf[p], hf[c]] = [hf[c], hf[p]]; c = p; } };
    const pop = () => { const top = heap[0]; const li = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = li; hf[0] = lf; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; [hf[m], hf[c]] = [hf[c], hf[m]]; c = m; } } return top; };
    const tgx = ti % gw, tgy = (ti / gw) | 0;
    const hh = i => { const dx = Math.abs(i % gw - tgx), dy = Math.abs(((i / gw) | 0) - tgy); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
    g[si] = 0; push(si, hh(si));
    let visited = 0;
    const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const c = pop();
      if (closed[c]) continue;
      if (c === ti) break;
      closed[c] = 1;
      if (++visited > maxNodes) return null;
      const cx = c % gw, cy = (c / gw) | 0;
      for (const [ox, oy, w] of N8) {
        const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx; if (closed[ni] || !ok(ni)) continue;
        if (ox && oy && (!ok(cy * gw + nx) || !ok(ny * gw + cx))) continue;
        const ng = g[c] + w; if (ng < g[ni]) { g[ni] = ng; from[ni] = c; push(ni, ng + hh(ni)); }
      }
    }
    if (from[ti] < 0 && ti !== si) return null;
    const cells = []; for (let i = ti; i >= 0; i = from[i]) { cells.push(i); if (i === si) break; }
    cells.reverse();
    const pts = cells.map(i => [((i % gw) + x0 + 0.5) * C, (((i / gw) | 0) + y0 + 0.5) * C]);
    if (ok(toI(tx, ty))) pts.push([tx, ty]);
    // string pulling
    const los = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 4; d < L; d += 4) { const x = a[0] + (b[0] - a[0]) * d / L, y = a[1] + (b[1] - a[1]) * d / L; if (!G.walkable(x, y)) return false; } return true; };
    const out = [[sx, sy]];
    let k = 0;
    while (k < pts.length - 1) {
      let j = pts.length - 1;
      while (j > k + 1 && !los(out[out.length - 1], pts[j])) j--;
      out.push(pts[j]); k = j;
    }
    out.shift();
    return out;
  };
  G.goTo = function (x, y, tol) {
    const p = G.state.player;
    const path = G.findPath(p.x, p.y, x, y);
    if (!path || !path.length) return false;
    G.auto = { pts: path, i: 0, tol: tol || 6, final: [x, y] };
    return true;
  };

  // ---------------- debug / test API ----------------
  G.debug = {
    step(sec, dt = 1 / 30) { const n = Math.ceil(sec / dt); for (let k = 0; k < n; k++) G.update(dt); },
    walk(pts, tol) { G.auto = { pts: pts.map(p => p.slice()), i: 0, tol }; },
    goto(x, y, tol) { return G.goTo(x, y, tol); },
    autoDone() { return !G.auto; },
    stuck() { return G.auto && G.auto.stuck; },
    pos() { return [G.state.player.x, G.state.player.y]; },
  };
})();
