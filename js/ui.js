'use strict';
// ------------------------------------------------------------
//  DOM user interface (Hebrew, RTL)
// ------------------------------------------------------------
(function () {
  const U = I.ui = { dirty: true, open: null };
  const $ = id => document.getElementById(id);
  const G = () => I.game;
  let thoughtT = 0, hintT = 0;

  U.init = function () {
    $('btnNote').onclick = () => U.toggle('note');
    $('btnCraft').onclick = () => U.toggle('craft');
    $('btnPause').onclick = () => U.toggle('pause');
    const bw = $('btnWait');
    const ws = e => { e.preventDefault(); if (!U.isOpen()) G().waiting = true; };
    const we = () => { G().waiting = false; };
    bw.addEventListener('pointerdown', ws); bw.addEventListener('pointerup', we); bw.addEventListener('pointerleave', we);
    $('modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && U.open !== 'end') U.closeAll(); });
  };
  U.isOpen = () => !!U.open;
  U.pulse = id => { const b = $(id); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); };
  U.showHint = function (on) { $('hint').classList.toggle('hidden', !on); hintT = 22; };

  // ---------------- thoughts & toasts ----------------
  U.thought = function (text, dur) {
    const el = $('thought');
    el.textContent = text;
    el.classList.add('on');
    thoughtT = dur || Math.max(3, 2 + text.length * 0.055);
  };
  U.toast = function (text, icon) {
    const box = $('toasts');
    const d = document.createElement('div'); d.className = 'toast';
    if (icon && I.terrain.icons[icon]) { const im = document.createElement('img'); im.src = I.terrain.icons[icon]; d.appendChild(im); }
    const s = document.createElement('span'); s.textContent = text; d.appendChild(s);
    box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 3800);
  };

  // ---------------- objectives ----------------
  U.objectives = function () {
    const g = G(), S = g.state, F = S.flags, L = [];
    L.push({ t: 'למשוך את התרמיל מהענף', done: F.backpack });
    L.push({ t: 'למצוא מים מתוקים', s: 'הפלג זורם אל החוף — אולי במעלה הזרם', done: F.foundWater });
    L.push({ t: 'למצוא משהו לאכול', s: 'קוקוסים, פירות בר, צדפות על הסלעים', done: F.ate });
    L.push({ t: 'להקים מחנה ולהדליק אש לפני הלילה', s: 'בחוף יש עצי סחף; ליד המעיין — מים וצל', done: F.madeFire });
    if (F.sawTower) L.push({ t: 'לטפס אל מגדל הרדיו', s: 'שביל עולה מהחוף המזרחי, מסומן בערימות אבנים', done: F.visitedHut });
    if (F.visitedHut || F.readLog || F.crate) L.push({ t: 'להביא את המצבר מהסירה', s: F.crate ? '' : 'ארגז החירום תקוע בירכתיים המוצפים — צריך חבל', done: F.batteryIn || g.count('battery') > 0 });
    if (F.visitedHut || F.readNote || F.fuse) L.push({ t: 'למצוא נתיך חלופי', s: F.readNote || F.enteredCave ? 'במערה שליד בריכת הסלע. נכנסים בשפל — ובפנים צריך אור.' : 'אולי מי שגר על האי השאיר חלקי חילוף', done: F.fuseIn || g.count('fuse') > 0 });
    if (F.visitedHut) L.push({ t: 'לתקן את מכשיר הקשר', s: 'מצבר ונתיך — בכל סדר', done: F.repaired });
    if (F.repaired) L.push({ t: 'למצוא את התדר ולקרוא לעזרה', s: 'לסובב את החוגה עד שקול אנושי יבקע מהרעש', done: F.called });
    if (F.called) L.push({ t: 'לחזור לחוף הדרומי ולחכות', s: 'מול השונית, איפה שהתעוררת', done: F.rescued });
    return L;
  };

  // ---------------- per-frame HUD ----------------
  let lastObj = '';
  U.update = function (dt) {
    const g = G(), S = g.state;
    if (!S) return;
    if (thoughtT > 0) { thoughtT -= dt; if (thoughtT <= 0) $('thought').classList.remove('on'); }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.add('hidden'); }
    // stats
    const st = S.stats;
    ring('st-water', st.water); ring('st-food', st.food); ring('st-energy', st.energy);
    const vg = $('st-vigor');
    vg.classList.toggle('hidden', st.vigor > 98);
    ring('st-vigor', st.vigor);
    // clock
    drawClock(S);
    $('clockTxt').textContent = 'יום ' + (Math.floor(S.time / 24) + 1) + ' · ' + I.fmtTime(S.time);
    const tt = $('tideTxt');
    if (S.flags.tideKnown) {
      tt.classList.remove('hidden');
      const rising = g.tideAt(S.time + 0.05) > g.tide;
      const nl = g.nextLowTide(S.time);
      tt.textContent = (g.caveOpen() ? 'שפל — הפתח חשוף' : (rising ? 'גאות עולה ↑' : 'מים יורדים ↓')) + ' · שפל הבא ' + I.fmtTime(nl);
    }
    // objective
    const obj = U.objectives().filter(o => !o.done);
    const h = obj.slice(0, 2).map((o, i) => `<div><span class="k">${i ? '·' : '◆'}</span>${o.t}${i === 0 && o.s ? `<span class="s">${o.s}</span>` : ''}</div>`).join('');
    if (h !== lastObj) { $('objective').innerHTML = h; lastObj = h; }
    // waiting badge
    $('waitBadge').classList.toggle('hidden', !(g.waiting && !g.busy));
    $('btnWait').classList.toggle('on', !!g.waiting);
    if (U.dirty) { renderInv(); U.dirty = false; if (U.open === 'craft') renderCraft(); }
    renderPrompt();
  };
  function ring(id, v) {
    const el = $(id), c = el.querySelector('.fg');
    c.style.strokeDashoffset = 113.1 * (1 - I.clamp(v, 0, 100) / 100);
    el.classList.toggle('low', v < 22);
    el.title = el.title.split(' ')[0] + ' ' + Math.round(v);
  }
  function drawClock(S) {
    const c = $('clockCv'), x = c.getContext('2d');
    const W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    const t = S.time % 24;
    const sky = I.sky(S.time, 0);
    const g = x.createLinearGradient(0, 0, 0, H);
    const top = I.mix3([20, 30, 60], [110, 170, 220], sky.day), bot = I.mix3([40, 40, 80], [255, 200, 150], Math.max(sky.day * 0.6, sky.dusk));
    g.addColorStop(0, I.rgb(top)); g.addColorStop(1, I.rgb(bot));
    x.save(); x.beginPath(); x.arc(W / 2, H - 6, 78, Math.PI, 0); x.closePath(); x.clip();
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (sky.night > 0.3) { x.fillStyle = `rgba(255,255,255,${sky.night * 0.8})`; for (let k = 0; k < 18; k++) x.fillRect((k * 53) % W, (k * 29) % (H - 20), 1.5, 1.5); }
    // sun / moon on an arc: 6:00 at right (east) ... 18:00 at left
    const day = t >= 5.5 && t <= 19.5;
    const u = day ? (t - 5.5) / 14 : ((t + 24 - 19.5) % 24) / 10;
    const a = u * Math.PI; // morning on the right (east), evening on the left
    const px = W / 2 + Math.cos(a) * 62, py = H - 6 - Math.sin(a) * 62;
    x.fillStyle = day ? '#ffe27a' : '#f2f2e8';
    x.shadowColor = day ? '#ffb030' : '#fff'; x.shadowBlur = 12;
    x.beginPath(); x.arc(px, py, day ? 9 : 7, 0, I.TAU); x.fill();
    x.shadowBlur = 0;
    if (!day) { x.fillStyle = I.rgb(top); x.beginPath(); x.arc(px + 3, py - 2, 6, 0, I.TAU); x.fill(); }
    x.restore();
    x.fillStyle = '#1b2a1e'; x.fillRect(0, H - 8, W, 8);
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.beginPath(); x.arc(W / 2, H - 6, 78, Math.PI, 0); x.stroke();
  }

  // ---------------- inventory ----------------
  function renderInv() {
    const g = G(), S = g.state, inv = $('inv');
    inv.innerHTML = '';
    let k = 1;
    const slots = [];
    if (S.flags.backpack) slots.push('bottle');
    for (const it of I.ITEM_ORDER) if (it !== 'bottle' && (S.inv[it] || 0) > 0) slots.push(it);
    U.slots = slots;
    for (const it of slots) {
      const d = document.createElement('div'); d.className = 'slot';
      if (it === 'torch' && S.player.torch) d.classList.add('lit');
      const im = document.createElement('img'); im.src = I.terrain.icons[it]; d.appendChild(im);
      const def = I.ITEMS[it];
      if (it === 'bottle') {
        const sp = document.createElement('div'); sp.className = 'sips';
        for (let j = 0; j < 3; j++) { const i = document.createElement('i'); if (j < S.bottle) i.className = 'f'; sp.appendChild(i); }
        d.appendChild(sp);
      } else {
        const n = document.createElement('div'); n.className = 'n'; n.textContent = S.inv[it]; d.appendChild(n);
      }
      const key = document.createElement('div'); key.className = 'key'; key.textContent = k <= 9 ? k : ''; d.appendChild(key);
      const tip = document.createElement('div'); tip.className = 'tip';
      let use = '';
      if (it === 'bottle') use = S.bottle ? 'לחץ כדי לשתות' : 'ריק — למלא במעיין או בפלג';
      else if (def.food) use = 'לחץ כדי לאכול';
      else if (it === 'torch') use = S.player.torch ? 'לחץ כדי לכבות ולהכניס לתרמיל' : 'לחץ כדי להחזיק ביד';
      else if (it === 'mussels') use = 'לבשל על מדורה';
      tip.innerHTML = `<b>${def.name}</b>${def.desc}${use ? `<i>${use}</i>` : ''}`;
      d.appendChild(tip);
      d.onclick = () => { g.useItem(it); U.dirty = true; };
      inv.appendChild(d);
      k++;
    }
  }
  U.useSlot = function (n) { const it = (U.slots || [])[n - 1]; if (it) { G().useItem(it); U.dirty = true; } };

  // ---------------- prompt ----------------
  let lastPromptKey = '';
  function renderPrompt() {
    const g = G(), pr = g.prompt, el = $('prompt');
    if (!pr || U.open) { el.classList.add('hidden'); lastPromptKey = ''; return; }
    const info = pr.info;
    const key = info.title + '|' + info.actions.map(a => a.key + a.label + a.enabled).join() + '|' + (info.needs || []).map(n => n.have).join() + (info.desc || '');
    if (key !== lastPromptKey) {
      lastPromptKey = key;
      let h = `<div class="pt">${info.title}</div>`;
      if (info.desc) h += `<div class="pd">${info.desc}</div>`;
      for (const a of info.actions) h += `<div class="pa ${a.enabled ? '' : 'off'}"><kbd>${a.key}</kbd><span>${a.label}</span></div>`;
      const needs = (info.needs || []).concat(...info.actions.filter(a => a.needs).map(a => a.needs));
      if (needs.length) {
        h += '<div class="needs">' + needs.map(n => `<div><span>${n.name}</span><span class="${n.ok ? 'ok' : 'no'}">${n.tool ? (n.ok ? '✓' : '✗') : n.have + '/' + n.need}</span></div>`).join('') + '</div>';
      }
      el.innerHTML = h;
    }
    el.classList.remove('hidden');
    const [sx, sy] = I.render.toScreen(g.cam, pr.x, pr.y);
    const k = innerWidth / I.render.size()[0];
    el.style.left = I.clamp(sx * k, 150, innerWidth - 150) + 'px';
    el.style.top = I.clamp(sy * k - 8, 120, innerHeight) + 'px';
  }

  // ---------------- modal helpers ----------------
  function openPanel(name, html, cls) {
    U.open = name;
    const p = $('panel');
    p.className = cls || '';
    p.innerHTML = html;
    $('modal').classList.remove('hidden');
    const x = p.querySelector('.x'); if (x) x.onclick = U.closeAll;
    G().waiting = false;
    return p;
  }
  U.closeAll = function () {
    if (U.open === 'radio') closeRadio();
    U.open = null;
    $('modal').classList.add('hidden');
  };
  U.toggle = function (name) {
    if (G().busy && name !== 'pause') return;
    if (U.open === name) { U.closeAll(); return; }
    if (U.open === 'end') return;
    if (name === 'note') U.openNotebook('tasks');
    if (name === 'craft') U.openCraft();
    if (name === 'pause') U.openPause();
  };
  U.note = function (title, body) {
    openPanel('noteR', `<button class="x">✕</button><h2>${title}</h2>${body}<div class="btns"><button class="btn primary" id="nOk">לסגור</button></div>`, 'paper');
    $('nOk').onclick = U.closeAll;
    U.dirty = true;
  };

  // ---------------- crafting ----------------
  U.openCraft = function () {
    openPanel('craft', '<div id="craftBody"></div>');
    renderCraft();
  };
  function renderCraft() {
    const g = G(), S = g.state, body = $('craftBody');
    if (!body) return;
    let h = '<button class="x">✕</button><h2>יצירה</h2><p class="sub">כל כלי פותח אפשרות חדשה באי.</p><div class="cards">';
    for (const r of I.RECIPES) {
      const c = g.canCraft(r);
      let ok = c.ok, extra = '';
      if (r.id === 'fire') {
        const err = g.canPlaceFire();
        const [x, y] = g.fireSpot();
        const tr = S.map === 'out' ? g.fireSite(x, y) : [];
        extra = `<div class="site"><b>המקום הזה:</b><br>${err ? `<span class="no">${err}</span>` : tr.map(t => `<span class="${t.bad ? 'no' : 'ok'}">${t.bad ? '✗' : '✓'}</span> ${t.t}`).join('<br>')}</div>`;
        if (err) ok = false;
      }
      if (r.id === 'torch') {
        const near = S.fires.some(f => f.fuel > 0 && f.map === S.map && Math.hypot(f.x - S.player.x, f.y - S.player.y) < 95);
        extra = `<div class="ing"><div><span>מדורה בוערת קרוב</span><span class="${near ? 'ok' : 'no'}">${near ? '✓' : '✗'}</span></div></div>`;
        if (!near) ok = false;
      }
      h += `<div class="card"><div class="h"><img src="${I.terrain.icons[r.id === 'fire' ? 'wood' : r.id]}"><b>${r.name}</b></div>
        <div class="ing">${c.list.map(n => `<div><span>${n.name}</span><span class="${n.ok ? 'ok' : 'no'}">${n.tool ? (n.ok ? '✓' : '✗') : n.have + '/' + n.need}</span></div>`).join('')}</div>
        ${extra}<div class="op">${r.opens}</div>
        <button class="btn ${ok ? 'primary' : ''}" data-r="${r.id}" ${ok ? '' : 'disabled'}>${r.id === 'fire' ? 'להדליק כאן' : 'להכין'}</button></div>`;
    }
    h += '</div>';
    body.innerHTML = h;
    body.querySelector('.x').onclick = U.closeAll;
    body.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => {
      const id = b.dataset.r;
      if (g.craft(id)) { if (id === 'fire' || id === 'torch') U.closeAll(); else renderCraft(); }
    });
  }

  // ---------------- fire menu ----------------
  U.openFire = function (f) {
    const g = G(), S = g.state;
    if (f.map === 'out') S.campBag = { x: f.x - 16, y: f.y + 9, map: f.map };
    const hr = S.time % 24;
    const canSleep = hr >= 17 || hr < 5;
    const lit = f.fuel > 0;
    const traits = f.traits || [];
    let h = `<button class="x">✕</button><h2>${lit ? 'ליד האש' : 'גחלים'}</h2>
      <p class="sub">${I.fmtTime(S.time)} · ${lit ? 'בוערת עוד ' + f.fuel.toFixed(1) + ' שעות' : 'המדורה כבתה'}</p>
      <div class="fuel"><i style="width:${I.clamp(f.fuel / 14 * 100, 0, 100)}%"></i></div>
      <div class="traits">${traits.map(t => `<span class="${t.bad ? 'no' : 'ok'}">${t.bad ? '✗' : '✓'}</span> ${t.t}`).join('<br>')}</div>
      <div class="btns">`;
    const B = (id, label, sm, en) => `<button class="btn ${id === 'sleep' || id === 'save' ? 'primary' : ''}" data-a="${id}" ${en ? '' : 'disabled'}>${label}${sm ? `<small>${sm}</small>` : ''}</button>`;
    if (lit) h += B('wood', 'להוסיף עצים', `+2.5 שעות · יש ${g.count('wood')}`, g.count('wood') > 0);
    else h += B('relight', 'להצית מחדש', `עצים ×1 · יש ${g.count('wood')}`, g.count('wood') > 0);
    h += B('cook', 'לבשל צדפות', `יש ${g.count('mussels')} צדפות`, lit && g.count('mussels') > 0);
    h += B('rest', 'לנוח שעה', 'אנרגיה, הזמן עובר · שומר', true);
    h += B('sleep', 'לישון עד הבוקר', canSleep ? `צריך בערך ${Math.ceil(((hr >= 6.5 ? 30.5 - hr : 6.5 - hr)) * (f.rate || 1))} שעות דלק · שומר` : 'אפשר רק בערב ובלילה', canSleep);
    h += B('save', 'לשמור את ההתקדמות', 'המחנה יהיה נקודת החזרה', true);
    h += '</div>';
    const p = openPanel('fire', h);
    p.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      g.fireAction(f, a);
      if (a === 'rest' || a === 'sleep') return;
      if (a === 'save') { U.closeAll(); return; }
      U.openFire(f);
    });
  };

  // ---------------- notebook ----------------
  U.openNotebook = function (tab) {
    const g = G(), S = g.state;
    if (!S.flags.notebook) { g.think('המחברת שלי בתרמיל. התרמיל — על הענף.'); return; }
    let h = `<button class="x">✕</button><h2>המחברת</h2><div class="tabs">
      <button class="tab ${tab === 'tasks' ? 'on' : ''}" data-t="tasks">משימות</button>
      <button class="tab ${tab === 'map' ? 'on' : ''}" data-t="map">מפה</button>
      <button class="tab ${tab === 'disc' ? 'on' : ''}" data-t="disc">גילויים</button></div><div id="nbBody"></div>`;
    const p = openPanel('note', h, 'paper');
    p.querySelectorAll('.tab').forEach(b => b.onclick = () => U.openNotebook(b.dataset.t));
    const body = $('nbBody');
    if (tab === 'tasks') {
      body.innerHTML = '<ul class="obj">' + U.objectives().map(o => `<li class="${o.done ? 'done' : ''}">${o.t}${o.s && !o.done ? `<small>${o.s}</small>` : ''}</li>`).join('') + '</ul>' +
        `<p class="dim" style="margin-top:12px">ליד מדורה אפשר לנוח ולשמור. החזק T כדי לתת לזמן לעבור.</p>`;
    } else if (tab === 'map') {
      body.innerHTML = '<canvas id="mapCv" width="600" height="550"></canvas><p class="dim" style="text-align:center">המפה מתמלאת במקומות שביקרת בהם.</p>';
      drawMap($('mapCv'));
    } else {
      const lm = g.LANDMARKS.map(L => `<div class="${S.landmarks[L.id] ? '' : 'no'}"><b>${S.landmarks[L.id] ? L.name : '???'}</b>${S.landmarks[L.id] ? 'ביקרת' : 'עוד לא נמצא'}</div>`).join('');
      const pt = I.cave.PAINTINGS.map(P => `<div class="${S.paintings[P.id] ? '' : 'no'}"><b>${S.paintings[P.id] ? P.title : 'ציור לא ידוע'}</b>${S.paintings[P.id] ? P.text : 'אולי בחושך של המערה...'}</div>`).join('');
      let tide = S.flags.tideKnown ? `<p>🌊 הים עולה ויורד כל שש שעות בערך. בשפל נחשף הפתח בבריכת הסלע. השפל הבא: <b>${I.fmtTime(g.nextLowTide(S.time))}</b>.</p>` : '';
      body.innerHTML = `<h3>נקודות ציון</h3><div class="disc">${lm}</div><h3>ציורי המערה (${Object.keys(S.paintings).length}/4)</h3><div class="disc">${pt}</div>${tide}`;
    }
  };
  // parchment map
  U.buildMap = function () {
    const w = I.world, MW = 600, MH = 550, sc = MW / w.W;
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const x = c.getContext('2d');
    const img = x.createImageData(MW, MH), d = img.data;
    const hs = new Float32Array(MW * MH);
    for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) hs[py * MW + px] = w.hAt(px / sc, py / sc);
    for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
      const i = py * MW + px, v = hs[i], o = i * 4;
      const n = I.noise(px / 6, py / 6) * 6;
      let r = 236 + n, g = 220 + n, b = 180 + n;
      if (v < 0) { const k = I.clamp(-v / 30, 0, 1); r -= 30 + 30 * k; g -= 18 + 22 * k; b -= 2 + 10 * k; if ((px + py * 2) % 9 === 0 && v < -4) { r -= 25; g -= 20; b -= 10; } }
      else { r -= v * 0.25; g -= v * 0.3; b -= v * 0.4; }
      const lvl = Math.floor(v / 18);
      if (v > 0 && px < MW - 1 && py < MH - 1 && (Math.floor(hs[i + 1] / 18) !== lvl || Math.floor(hs[i + MW] / 18) !== lvl)) { r = 160; g = 120; b = 80; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = '#4a3420'; x.lineWidth = 1.6;
    x.beginPath(); w.coastPoly.forEach((p, k) => k ? x.lineTo(p[0] * sc, p[1] * sc) : x.moveTo(p[0] * sc, p[1] * sc)); x.closePath(); x.stroke();
    x.strokeStyle = '#3d76a8'; x.lineWidth = 2;
    x.beginPath(); w.STREAM.forEach((p, k) => k ? x.lineTo(p[0] * sc, p[1] * sc) : x.moveTo(p[0] * sc, p[1] * sc)); x.stroke();
    x.setLineDash([3, 4]); x.strokeStyle = '#7a4a20'; x.lineWidth = 1.5;
    w.PATHS.forEach(P => { x.beginPath(); P.forEach((p, k) => k ? x.lineTo(p[0] * sc, p[1] * sc) : x.moveTo(p[0] * sc, p[1] * sc)); x.stroke(); });
    x.setLineDash([]);
    x.strokeStyle = 'rgba(80,60,40,.6)'; x.lineWidth = 1;
    x.beginPath(); w.REEF.forEach((p, k) => { const px = p[0] * sc, py = p[1] * sc; x.moveTo(px - 2, py); x.lineTo(px + 2, py + 1); }); x.stroke();
    // forest marks
    x.fillStyle = 'rgba(60,90,50,.45)';
    w.objs.forEach(o => { if (o.type === 'tree' && (o.x * 7 + o.y) % 3 < 1) { x.beginPath(); x.arc(o.x * sc, o.y * sc, 2.2, 0, I.TAU); x.fill(); } });
    U.mapBase = c; U.mapScale = sc;
  };
  function drawMap(cv) {
    const g = G(), S = g.state, x = cv.getContext('2d'), sc = U.mapScale, w = I.world;
    x.drawImage(U.mapBase, 0, 0);
    // fog of the unexplored
    const fog = document.createElement('canvas'); fog.width = cv.width; fog.height = cv.height;
    const f = fog.getContext('2d');
    f.fillStyle = '#efe2c1'; f.fillRect(0, 0, fog.width, fog.height);
    f.globalCompositeOperation = 'destination-out';
    const cs = 20 * sc;
    for (let y = 0; y < g.EXH; y++) for (let xx = 0; xx < g.EXW; xx++) {
      if (!g.explored[y * g.EXW + xx]) continue;
      const cx = (xx + 0.5) * cs, cy = (y + 0.5) * cs;
      const gr = f.createRadialGradient(cx, cy, 0, cx, cy, cs * 1.6);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = gr; f.fillRect(cx - cs * 1.6, cy - cs * 1.6, cs * 3.2, cs * 3.2);
    }
    x.drawImage(fog, 0, 0);
    // landmarks
    x.font = 'bold 22px "Amatic SC", Karantina, cursive'; x.textAlign = 'center';
    for (const L of g.LANDMARKS) {
      if (!S.landmarks[L.id]) continue;
      const px = L.x * sc, py = L.y * sc;
      x.fillStyle = '#7a2e1a'; x.beginPath(); x.arc(px, py, 4, 0, I.TAU); x.fill();
      x.fillStyle = '#3b2a1a'; x.fillText(L.name, px, py - 8);
    }
    S.fires.forEach(fi => { if (fi.map !== 'out') return; x.fillStyle = '#d35400'; x.beginPath(); x.moveTo(fi.x * sc, fi.y * sc - 7); x.lineTo(fi.x * sc + 4, fi.y * sc + 2); x.lineTo(fi.x * sc - 4, fi.y * sc + 2); x.fill(); });
    const p = S.map === 'out' ? S.player : { x: w.MOUTH.x, y: w.MOUTH.y };
    x.strokeStyle = '#b3261e'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(p.x * sc - 6, p.y * sc - 6); x.lineTo(p.x * sc + 6, p.y * sc + 6); x.moveTo(p.x * sc + 6, p.y * sc - 6); x.lineTo(p.x * sc - 6, p.y * sc + 6); x.stroke();
    x.fillStyle = '#b3261e'; x.fillText('אני', p.x * sc, p.y * sc + 22);
    // compass
    x.fillStyle = '#4a3420'; x.font = 'bold 26px "Amatic SC", cursive'; x.fillText('צ', 560, 40);
    x.beginPath(); x.moveTo(560, 46); x.lineTo(554, 70); x.lineTo(560, 64); x.lineTo(566, 70); x.fill();
  }

  // ---------------- pause & help ----------------
  U.openPause = function () {
    const g = G();
    const info = g.saveInfo();
    const h = `<button class="x">✕</button><h2>הפסקה</h2><p class="sub">${info ? 'שמירה אחרונה: יום ' + info.day + ', ' + I.fmtTime(info.time) : 'עוד אין שמירה — נוחו ליד מדורה כדי לשמור.'}</p>
      <div class="btns"><button class="btn primary" id="pRes">להמשיך</button>
      <button class="btn" id="pLoad" ${info ? '' : 'disabled'}>לטעון את השמירה האחרונה</button>
      <button class="btn" id="pHelp">איך משחקים</button>
      <button class="btn" id="pMute">${I.audio.muted ? 'להפעיל צליל' : 'להשתיק'}</button>
      <button class="btn" id="pTitle">למסך הפתיחה</button></div>`;
    openPanel('pause', h);
    $('pRes').onclick = U.closeAll;
    $('pLoad').onclick = () => { U.closeAll(); g.load(); };
    $('pHelp').onclick = () => U.openHelp();
    $('pMute').onclick = () => { I.audio.setMuted(!I.audio.muted); U.openPause(); };
    $('pTitle').onclick = () => { U.closeAll(); I.main.toTitle(); };
  };
  U.openHelp = function (fromTitle) {
    const h = `<button class="x">✕</button><h2>איך משחקים</h2><div class="help">
      <p>התעוררת על חוף אחרי סערה. המטרה: <b>לתקן את מכשיר הקשר במגדל ולהזעיק חילוץ</b>. בדרך — לשרוד: מים, אוכל, אנרגיה ומקום לישון.</p>
      <p><kbd>WASD</kbd>/<kbd>חצים</kbd> תנועה · <kbd>Shift</kbd> ריצה · <kbd>E</kbd> פעולה · <kbd>R</kbd> פעולה שנייה · אפשר גם ללחוץ על הקרקע כדי ללכת</p>
      <p><kbd>C</kbd> יצירה · <kbd>N</kbd> מחברת ומפה · <kbd>1–9</kbd> או לחיצה על חפץ — לאכול, לשתות, להחזיק לפיד · <kbd>T</kbd> (החזק) לתת לזמן לעבור · <kbd>Esc</kbd> תפריט</p>
      <p>כשמתקרבים לחפץ מופיע חלון קטן עם הפעולות האפשריות — ומה חסר כדי לבצע אותן.</p>
      <p><b>המדורה</b> היא הבית: מבשלים, נחים, ישנים עד הבוקר — וכל מנוחה <b>שומרת את המשחק</b>. בחרו היטב איפה להדליק אותה.</p>
      <p>הים חי: הוא עולה ויורד. שימו לב לקו האצות על הסלעים.</p></div>
      <div class="btns"><button class="btn primary" id="hOk">הבנתי</button></div>`;
    openPanel('help', h);
    $('hOk').onclick = () => { U.closeAll(); if (!fromTitle && G().running) U.openPause(); };
    if (fromTitle) $('panel').querySelector('.x').onclick = U.closeAll;
  };

  // ---------------- end ----------------
  U.showEnd = function () {
    const S = G().state;
    const days = Math.floor(S.time / 24) + 1;
    const steps = Math.round(S.tally.walked / 7);
    const h = `<h2>חולצת</h2>
      <p>אורות החילוץ חוצים את השונית. מאחוריך, על הגבעה, הנורה האדומה של המגדל ממשיכה להבהב — והגלים, כמו תמיד, ממשיכים לפרוש קצף על החול.</p>
      <div class="estats"><div><b>${days}</b>ימים על האי</div><div><b>${steps.toLocaleString('he')}</b>צעדים</div>
      <div><b>${Object.keys(S.paintings).length}/4</b>ציורים במערה</div><div><b>${S.tally.fires}</b>מדורות</div><div><b>${S.tally.crafted}</b>כלים שהכנת</div>
      <div><b>${Object.keys(S.landmarks).length}/${G().LANDMARKS.length}</b>נקודות ציון</div></div>
      <div class="btns" style="justify-content:center"><button class="btn primary" id="eNew">משחק חדש</button><button class="btn" id="eTitle">למסך הפתיחה</button></div>`;
    openPanel('end', h, 'end');
    $('eNew').onclick = () => { U.closeAll(); I.main.startNew(); };
    $('eTitle').onclick = () => { U.closeAll(); I.main.toTitle(); };
  };

  // ---------------- radio ----------------
  let rAnim = 0, rLast = 0, lockT = 0, speakT = 0, subLock = 0;
  const LINES = {
    call: 'כאן משמר החופים, תחנת החוף הדרומית. כל תחנה בערוץ שש־עשרה — אנחנו מאזינים. עבור.',
    me: 'מיידיי, מיידיי, מיידיי. כאן ניצול מהסירה "נוגה". נסחפתי בסערה לאי עם מגדל רדיו. הסירה שלי תקועה על השונית בדרום. עבור.',
    r1: '"נוגה", כאן משמר החופים. קולטים אותך — חלש, אבל ברור. איתרנו את המשדר של המגדל שלך.',
    r2: 'סירת חילוץ יוצאת אליך עכשיו. חזור לחוף הדרומי, מול השונית, וחכה שם. נגיע עם רדת החשכה. החזק מעמד. סוף.',
  };
  U.openRadio = function () {
    const g = G(), S = g.state, F = S.flags;
    const h = `<button class="x">✕</button><h2>מקלט־משדר ימי · RT-16</h2>
      <div class="rface"><div><canvas id="dial" width="760" height="150"></canvas><div id="meter"></div></div><canvas id="knob" width="280" height="280"></canvas></div>
      <div class="rpanel">
        <div class="rslot" id="rBat"></div>
        <div class="rslot" id="rFuse"></div>
        <div class="rslot" id="rPow"></div>
      </div>
      <div id="rsub"></div>
      <div class="btns" id="rAct"></div>
      <div class="rhint">חוגת התדר: גרירה בעכבר או באצבע, גלגלת, או ← →</div>`;
    openPanel('radio', h, 'radio');
    const m = $('meter'); for (let k = 0; k < 14; k++) { const i = document.createElement('i'); i.style.height = (6 + k * 1.7) + 'px'; m.appendChild(i); }
    radioSlots();
    if (!F.repaired) setSub(F.batteryIn || F.fuseIn ? 'המכשיר עדיין מת. חסר עוד חלק.' : 'המכשיר מת. בגב הלוח: תא מצבר ריק, ונתיך מפויח וסדוק.' + (g.count('battery') || g.count('fuse') ? '' : ' צריך מצבר תקין ונתיך חדש.'));
    else if (!F.powered) setSub('הכל מחובר. נשאר רק להדליק.');
    else if (F.called) setSub('<span class="me">"...החזק מעמד. סוף."</span><br>הם בדרך. צריך לחזור לחוף הדרומי.');
    else setSub('רעש לבן. לסובב את החוגה לאט...');
    // knob interaction
    const kn = $('knob');
    let drag = null;
    const ang = e => { const r = kn.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    kn.onpointerdown = e => { drag = ang(e); kn.setPointerCapture(e.pointerId); };
    kn.onpointermove = e => { if (drag === null) return; const a = ang(e); let d = a - drag; if (d > Math.PI) d -= I.TAU; if (d < -Math.PI) d += I.TAU; drag = a; tune(d / I.TAU * 1.6); };
    kn.onpointerup = () => drag = null;
    kn.onwheel = e => { e.preventDefault(); tune(Math.sign(e.deltaY) * -0.05); };
    $('dial').onwheel = kn.onwheel;
    rLast = performance.now(); lockT = 0;
    cancelAnimationFrame(rAnim);
    rAnim = requestAnimationFrame(radioLoop);
  };
  function tune(df) {
    const g = G(), S = g.state;
    if (!S.flags.powered) return;
    S.radio.freq = I.clamp(S.radio.freq + df, g.RADIO.min, g.RADIO.max);
  }
  U.radioKey = function (dir, dt) { tune(dir * dt * 0.7); };
  function setSub(h) { const el = $('rsub'); if (el) el.innerHTML = h; }
  function radioSlots() {
    const g = G(), F = g.state.flags;
    const slot = (id, name, item, inst) => {
      const el = $(id); if (!el) return;
      const have = g.count(item) > 0;
      el.innerHTML = `<span class="led ${inst ? 'on' : ''}"></span><b>${name}</b><br><small>${inst ? 'מותקן' : have ? 'יש לך אחד בתרמיל' : 'חסר'}</small>` +
        (!inst ? `<button class="btn ${have ? 'primary' : ''}" ${have ? '' : 'disabled'} data-i="${item}">להתקין</button>` : '');
      const b = el.querySelector('button'); if (b) b.onclick = () => { g.radioInstall(item); radioSlots(); if (F.repaired) setSub('הכל מחובר. נשאר רק להדליק.'); };
    };
    slot('rBat', 'מצבר', 'battery', F.batteryIn);
    slot('rFuse', 'נתיך 5A', 'fuse', F.fuseIn);
    const p = $('rPow');
    if (p) {
      p.innerHTML = `<span class="led ${F.powered ? 'on' : ''}"></span><b>הפעלה</b><br><small>${F.powered ? 'פועל' : F.repaired ? 'מוכן' : 'אין מתח'}</small>` +
        (!F.powered ? `<button class="btn ${F.repaired ? 'primary' : ''}" ${F.repaired ? '' : 'disabled'} id="pwrB">להדליק</button>` : '');
      const b = $('pwrB'); if (b) b.onclick = () => { g.radioPower(); radioSlots(); setSub('ששששש... רעש לבן. לסובב את החוגה לאט, ולהקשיב.'); };
    }
  }
  function garble(t, c) {
    let o = '';
    for (const ch of t) o += ch === ' ' ? ' ' : Math.random() < c * c * 1.1 ? ch : (Math.random() < 0.5 ? '·' : ' ');
    return o;
  }
  function radioLoop(now) {
    if (U.open !== 'radio') return;
    const g = G(), S = g.state, F = S.flags, R = S.radio;
    const dt = Math.min(0.1, (now - rLast) / 1000); rLast = now;
    if (g.keys.ArrowLeft || g.keys.KeyA) tune(dt * 0.7 * ((g.keys.ShiftLeft) ? 0.25 : 1));
    if (g.keys.ArrowRight || g.keys.KeyD) tune(-dt * 0.7 * ((g.keys.ShiftLeft) ? 0.25 : 1));
    drawDial(); drawKnob();
    const mix = F.powered ? g.radioMix() : { voice: 0, static: 0, music: 0, morse: 0, clarity: 0 };
    if (F.powered && F.called) { mix.static *= 0.5; }
    I.audio.radio(F.powered, mix);
    // meter
    const lv = F.powered ? Math.round(Math.max(mix.clarity, Math.sqrt(mix.music) * 0.6, Math.sqrt(mix.morse) * 0.6) * 14 + Math.random() * 1.5) : 0;
    $('meter').querySelectorAll('i').forEach((i, k) => i.classList.toggle('on', k < lv));
    // conversation
    if (F.powered && !F.called) {
      const phase = R.phase || 'scan';
      speakT -= dt;
      if (phase === 'scan') {
        if (mix.clarity > 0.88) lockT += dt; else lockT = Math.max(0, lockT - dt * 2);
        if (lockT > 1.2) {
          R.phase = 'heard'; speakT = I.audio.say(LINES.call, 122) + 0.3;
          setSub('"' + LINES.call + '"');
          I.audio.chord(false);
        } else if (speakT <= 0) {
          if (mix.clarity > 0.15) { speakT = 2.2 + I.audio.say('כאן משמר החופים כל תחנה', 122) ; setSub(garble('"...כאן משמר החופים... כל תחנה בערוץ שש־עשרה..."', mix.clarity)); }
          else if (mix.music > 0.25) { speakT = 2; setSub('♪ מנגינה רחוקה, חנוקה ברעש... תחנה מסחרית. לא זה.'); }
          else if (mix.morse > 0.25) { speakT = 2; setSub('· · · — צפצופי מורס של משואה אוטומטית. לא זה.'); }
          else { speakT = 1.5; setSub('ששששש... רעש לבן. ' + R.freq.toFixed(2) + ' MHz'); }
        }
      } else if (phase === 'heard') {
        if (speakT <= 0 && !$('txB')) {
          const a = $('rAct');
          a.innerHTML = '<button class="btn primary" id="txB">ללחוץ על המיקרופון ולשדר: מיידיי</button>';
          $('txB').onclick = () => {
            R.phase = 'sent'; a.innerHTML = '';
            setSub('<span class="me">אני: "' + LINES.me + '"</span>');
            I.audio.click();
            speakT = 5.5;
          };
        }
      } else if (phase === 'sent') {
        if (speakT <= 0 && !R.r1) {
          R.r1 = true; speakT = I.audio.say(LINES.r1, 122) + 0.4;
          setSub('"' + LINES.r1 + '"');
        } else if (speakT <= 0 && R.r1 && !R.r2) {
          R.r2 = true; speakT = I.audio.say(LINES.r2, 122) + 0.5;
          setSub('"' + LINES.r1 + '"<br>"' + LINES.r2 + '"');
        } else if (speakT <= 0 && R.r2) {
          F.called = true; R.phase = 'done';
          I.audio.chord(true);
          g.think('הם בדרך! עכשיו — לחזור לחוף הדרומי, מול השונית.', 6);
          $('rAct').innerHTML = '<button class="btn primary" id="rDone">לסגור ולחזור לחוף</button>';
          $('rDone').onclick = U.closeAll;
          U.dirty = true;
        }
      }
    }
    rAnim = requestAnimationFrame(radioLoop);
  }
  function closeRadio() { cancelAnimationFrame(rAnim); I.audio.radio(false); }
  function drawDial() {
    const g = G(), S = g.state, c = $('dial'); if (!c) return;
    const x = c.getContext('2d'), W = c.width, H = c.height, R = g.RADIO;
    const on = S.flags.powered;
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, on ? '#fff1c8' : '#cfc3a4'); bg.addColorStop(1, on ? '#f0d48a' : '#b5a988');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    if (on) { const gl = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2); gl.addColorStop(0, 'rgba(255,200,100,.35)'); gl.addColorStop(1, 'rgba(255,200,100,0)'); x.fillStyle = gl; x.fillRect(0, 0, W, H); }
    const X = f => 30 + (f - R.min) / (R.max - R.min) * (W - 60);
    x.strokeStyle = '#3b2a1a'; x.fillStyle = '#3b2a1a'; x.textAlign = 'center'; x.font = 'bold 20px Heebo, Arial';
    for (let f = R.min; f <= R.max + 0.001; f += 0.2) {
      const px = X(f), major = Math.abs(f - Math.round(f)) < 0.01;
      x.lineWidth = major ? 2 : 1;
      x.beginPath(); x.moveTo(px, 40); x.lineTo(px, major ? 76 : 60); x.stroke();
      if (major) x.fillText(Math.round(f), px, 100);
    }
    x.font = '14px Heebo, Arial'; x.fillText('MHz', W - 40, 130); x.fillText('VHF · ימי', 60, 130);
    x.fillStyle = 'rgba(59,42,26,.6)'; x.fillRect(30, 38, W - 60, 2);
    // needle
    const nx = X(S.radio.freq);
    x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.beginPath(); x.moveTo(nx, 10); x.lineTo(nx, H - 30); x.stroke();
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(nx, 10, 5, 0, I.TAU); x.fill();
    if (on) { x.fillStyle = '#3b2a1a'; x.font = 'bold 16px "Courier New", monospace'; x.fillText(S.radio.freq.toFixed(2), I.clamp(nx, 50, W - 50), 28); }
  }
  function drawKnob() {
    const g = G(), S = g.state, c = $('knob'); if (!c) return;
    const x = c.getContext('2d'), W = c.width;
    x.clearRect(0, 0, W, W);
    const a = (S.radio.freq - 150) / 1.6 * I.TAU;
    x.save(); x.translate(W / 2, W / 2);
    const gr = x.createRadialGradient(-30, -40, 10, 0, 0, 120);
    gr.addColorStop(0, '#6d757d'); gr.addColorStop(1, '#1c2025');
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 120, 0, I.TAU); x.fill();
    x.rotate(a);
    for (let k = 0; k < 36; k++) { x.rotate(I.TAU / 36); x.fillStyle = '#2a2f35'; x.fillRect(-4, -120, 8, 14); }
    const g2 = x.createRadialGradient(-20, -30, 5, 0, 0, 90); g2.addColorStop(0, '#9aa2aa'); g2.addColorStop(1, '#3a4047');
    x.fillStyle = g2; x.beginPath(); x.arc(0, 0, 92, 0, I.TAU); x.fill();
    x.fillStyle = '#f0a24a'; x.beginPath(); x.arc(0, -66, 10, 0, I.TAU); x.fill();
    x.restore();
  }
})();
