'use strict';
// ------------------------------------------------------------
//  Boot, input and the main loop
// ------------------------------------------------------------
(function () {
  const M = I.main = {};
  const G = I.game;
  const $ = id => document.getElementById(id);
  const tick = () => new Promise(r => setTimeout(r, 20));
  const prog = (v, msg) => { $('lfill').style.width = Math.round(v * 100) + '%'; if (msg) $('lmsg').textContent = msg; };

  M.boot = async function () {
    prog(0.03, 'מעצב את קו החוף...');
    await tick();
    I.world.generate();
    prog(0.12, 'חוצב מערה...');
    await tick();
    I.cave.generate();
    prog(0.15, 'צובע חול, סלע ודשא...');
    await I.terrain.build(v => prog(v));
    prog(0.96, 'משרטט מפה...');
    await tick();
    I.ui.buildMap();
    I.render.init($('game'));
    I.title.init($('titleCv'));
    I.ui.init();
    setupInput();
    prog(1, 'מוכן');
    await tick();
    $('loading').style.transition = 'opacity .6s'; $('loading').style.opacity = 0;
    setTimeout(() => $('loading').classList.add('hidden'), 650);
    M.toTitle();
    requestAnimationFrame(loop);
    window.__ready = true;
  };

  M.toTitle = function () {
    G.running = false;
    G.state = null;
    $('hud').classList.add('hidden');
    $('title').classList.remove('hidden');
    const info = G.saveInfo();
    const bl = $('bLoad');
    if (info) { bl.classList.remove('hidden'); bl.innerHTML = 'להמשיך<span class="small">יום ' + info.day + ' · ' + I.fmtTime(info.time) + '</span>'; }
    else bl.classList.add('hidden');
    I.title.show();
    if (I.audio.ready) I.audio.radio(false);
  };
  function enterGame() {
    I.audio.init();
    $('title').classList.add('hidden');
    I.title.hide();
    $('hud').classList.remove('hidden');
    I.ui.dirty = true;
  }
  M.startNew = function () { enterGame(); G.newGame(); };
  M.continueGame = function () { enterGame(); if (!G.load()) G.newGame(); };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.running && G.state) {
      if (!I.ui.open || I.ui.open === 'end') G.update(dt);
      else G.clock += dt;
      I.render.frame(G, dt);
      I.ui.update(dt);
    }
    requestAnimationFrame(loop);
  }

  function setupInput() {
    $('bNew').onclick = M.startNew;
    $('bLoad').onclick = M.continueGame;
    $('bHelp').onclick = () => I.ui.openHelp(true);
    addEventListener('resize', () => { I.render.resize(); I.title.resize(); });
    addEventListener('keydown', e => {
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (!G.running) { if (k === 'Enter' && !I.ui.open) M.startNew(); return; }
      if (e.repeat && !k.startsWith('Arrow') && !'KeyWKeyAKeySKeyD'.includes(k)) { G.keys[k] = true; return; }
      G.keys[k] = true;
      const open = I.ui.open;
      if (k === 'Escape') { if (open && open !== 'end') I.ui.closeAll(); else if (!open) I.ui.openPause(); return; }
      if (open) {
        if ((k === 'KeyE' || k === 'Space' || k === 'Enter') && open === 'noteR') I.ui.closeAll();
        else if (k === 'KeyC' && open === 'craft') I.ui.closeAll();
        else if ((k === 'KeyN' || k === 'KeyJ' || k === 'KeyM') && open === 'note') I.ui.closeAll();
        return;
      }
      if (k === 'KeyE' || k === 'Space' || k === 'Enter') G.doAction('E');
      else if (k === 'KeyR') G.doAction('R');
      else if (k === 'KeyC') I.ui.toggle('craft');
      else if (k === 'KeyN' || k === 'KeyJ') I.ui.toggle('note');
      else if (k === 'KeyM') { if (G.state.flags.notebook) I.ui.openNotebook('map'); }
      else if (k === 'KeyT') G.waiting = true;
      else if (k.startsWith('Digit')) I.ui.useSlot(+k.slice(5));
    });
    addEventListener('keyup', e => { G.keys[e.code] = false; if (e.code === 'KeyT') G.waiting = false; });
    addEventListener('blur', () => { G.keys = {}; G.waiting = false; });
    const cv = $('game');
    cv.addEventListener('pointerdown', e => {
      if (!G.running || I.ui.open || G.busy || e.pointerType === 'touch') return;
      const [W, H] = I.render.size(), k = W / innerWidth;
      const wx = (e.clientX * k - W / 2) / G.cam.zoom + G.cam.x, wy = (e.clientY * k - H / 2) / G.cam.zoom + G.cam.y;
      if (!G.goTo(wx, wy, 6)) G.target = [wx, wy];
    });
    // touch controls
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
      $('touch').classList.remove('hidden');
      const joy = $('joy'), knob = $('joyKnob');
      let id = null;
      const mv = e => {
        const r = joy.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const l = Math.hypot(dx, dy), m = r.width / 2;
        if (l > m) { dx *= m / l; dy *= m / l; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        G.joy = { x: dx / m, y: dy / m };
      };
      joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); mv(e); });
      joy.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
      const up = () => { id = null; knob.style.transform = ''; G.joy = null; };
      joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
      $('tA').addEventListener('pointerdown', e => { e.preventDefault(); if (!I.ui.open) G.doAction('E'); });
      $('tB').addEventListener('pointerdown', e => { e.preventDefault(); if (!I.ui.open) G.doAction('R'); });
    }
  }

  window.addEventListener('load', () => M.boot().catch(err => { console.error(err); $('lmsg').textContent = 'שגיאה: ' + err.message; }));
})();
