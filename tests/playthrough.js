// Full route test: beach -> backpack -> gather -> rope -> boat crate (battery)
// -> camp (note, resin, fire, torch) -> rock pool -> wait for low tide -> cave (fuse)
// -> save at a fire -> RELOAD PAGE -> load -> tower -> repair radio -> tune -> mayday
// -> back to the beach -> rescue ending.
// Usage: node tests/playthrough.js [screenshotDir]
const { chromium } = require('playwright');
const { boot, walk, goto, step, act, state } = require('./helpers');
const { launchOpts } = require('./helpers');

const shots = process.argv[2] || null;
let page, failures = 0;
const log = (...a) => console.log('•', ...a);
function check(cond, msg) { if (cond) console.log('  ✓', msg); else { console.log('  ✗', msg); failures++; } }
async function shot(name) { if (shots) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.screenshot({ path: `${shots}/${name}.png` }); } }

// walk to the nearest object matching the filter and press a key
async function visit(type, key = 'E', filter = 'true', maxDist = 900) {
  const target = await page.evaluate(([type, filter, maxDist]) => {
    const G = I.game, [px, py] = G.debug.pos();
    const f = new Function('o', 'st', 'return ' + filter);
    let best = null, bd = maxDist;
    for (const o of I.world.objs) {
      if (o.type !== type) continue;
      const st = G.state.objState[o.id] || {};
      if (st.taken || !f(o, st)) continue;
      const d = Math.hypot(o.x - px, o.y - py);
      if (d < bd) { bd = d; best = o; }
    }
    return best && { x: best.x, y: best.y, r: best.r, id: best.id };
  }, [type, filter, maxDist]);
  if (!target) return { ok: false, why: 'none' };
  // approach from the south side of the object
  const off = target.r ? target.r + 9 : 0;
  const w = await goto(page, target.x, target.y + off, { tol: 5, maxSec: 90 });
  const a = await act(page, key);
  return Object.assign({ walk: w }, a, { id: target.id });
}

(async () => {
  const browser = await chromium.launch(launchOpts);
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await boot(page);
  await page.evaluate(() => localStorage.clear());
  await page.click('#bNew');
  await page.waitForTimeout(300);
  await step(page, 7);
  await shot('01-start');

  log('Opening scene: backpack, debris');
  let r = await walk(page, [[918, 1736]], { tol: 5 });
  r = await act(page, 'E');
  check(r.ok && r.title === 'התרמיל שלך', 'pulled the backpack (' + r.title + ')');
  await step(page, 2);
  let s = await state(page);
  check(s.flags.backpack && s.flags.lighter && s.flags.knife, 'backpack gives lighter, knife, bottle, notebook');
  r = await visit('debris'); check(r.ok, 'opened the washed-up crate');
  r = await visit('plank'); check(r.ok, 'picked up the plank');
  r = await visit('logpage'); check(r.ok, 'read the boat log page');
  await page.evaluate(() => I.ui.closeAll());
  await shot('02-beach');

  log('Gathering on the beach');
  for (let k = 0; k < 4; k++) { r = await visit('drift'); }
  for (let k = 0; k < 2; k++) { r = await visit('stone'); }
  let fib = 0;
  for (let k = 0; k < 8 && fib < 4; k++) {
    r = await visit('palm', 'R', '(st.fiber === undefined ? o.fiber : st.fiber) > 0', 700);
    if (r.ok) fib++;
  }
  r = await visit('palm', 'E', '(st.coconuts === undefined ? o.coconuts : st.coconuts) > 0', 700);
  s = await state(page);
  log('inventory', JSON.stringify(s.inv));
  check((s.inv.fiber || 0) >= 3, 'collected palm fibers with the knife');
  check((s.inv.wood || 0) >= 5, 'collected firewood');
  await page.evaluate(() => I.game.useItem('coconut'));

  log('Rope -> boat crate');
  let ok = await page.evaluate(() => I.game.craft('rope'));
  check(ok, 'crafted a rope from 3 palm fibers');
  r = await goto(page, 1700, 1578);
  check(r.ok, 'walked along the beach to the rock spit ' + JSON.stringify(r));
  r = await walk(page, await page.evaluate(() => I.world.SPIT), { tol: 10 });
  check(r.ok, 'walked out along the spit to the boat ' + JSON.stringify(r));
  await shot('03-boat');
  r = await act(page, 'E');
  check(r.ok && r.title.includes('נוגה'), 'pulled the emergency crate with the rope');
  await step(page, 3);
  s = await state(page);
  check(s.inv.battery === 1, 'got the battery from the boat');
  await shot('04-crate');

  log('Up the stream to the abandoned camp');
  const pathB = await page.evaluate(() => I.world.PATH_B);
  r = await goto(page, pathB[0][0], pathB[0][1]);
  check(r.ok, 'back along the beach to the stream trail ' + JSON.stringify(r));
  r = await walk(page, pathB.slice(0, 50), { tol: 12 });
  check(r.ok, 'followed the stream path to the camp ' + JSON.stringify(r));
  s = await state(page);
  r = await visit('campnote'); check(r.ok, 'read the note at the camp');
  await page.evaluate(() => I.ui.closeAll());
  r = await visit('campcrate'); check(r.ok, 'opened the camp crate');
  r = await visit('pine', 'E', 'true', 400); check(r.ok, 'scraped resin from the resin tree');
  // drink from the stream (fresh water here)
  r = await goto(page, 1058, 1300);
  r = await act(page, 'E'); check(r.ok && r.title === 'הפלג', 'drank fresh water from the stream');
  r = await act(page, 'R'); check(r.ok, 'filled the bottle');
  r = await goto(page, 1112, 1318, { tol: 4 });
  r = await act(page, 'E'); check(r.ok && r.title === 'בור אש ישן', 'lit a fire in the old pit');
  ok = await page.evaluate(() => I.game.craft('torch'));
  check(ok, 'crafted a torch next to the fire');
  s = await state(page);
  check(s.inv.torch === 1, 'torch in inventory');
  await shot('05-camp');

  log('To the rock pool');
  r = await goto(page, pathB[50][0], pathB[50][1]);
  r = await walk(page, pathB.slice(50), { tol: 12 });
  check(r.ok, 'path continues past the spring to the rock pool ' + JSON.stringify(r));
  await shot('06-pool');
  // wait for low tide (time passes faster while waiting)
  let waited = await page.evaluate(() => { const G = I.game; let t = 0; G.waiting = true; while (!G.caveOpen() && t < 300) { G.debug.step(0.5); t += 0.5; } G.waiting = false; return { t, open: G.caveOpen(), tide: G.tide.toFixed(2), time: I.fmtTime(G.state.time) }; });
  check(waited.open, 'low tide exposed the cave passage ' + JSON.stringify(waited));
  await step(page, 1);
  await shot('07-lowtide');
  r = await walk(page, [[528, 866], [505, 842], [486, 830], [476, 818], [475, 806]], { tol: 5 });
  await page.waitForTimeout(900);
  s = await state(page);
  check(s.map === 'cave', 'entered the cave at low tide ' + JSON.stringify(r));

  log('Inside the cave');
  r = await goto(page, 212, 584);
  check(r.ok, 'followed the chalk marks through the cave ' + JSON.stringify(r));
  await shot('08-cave');
  r = await act(page, 'E');
  check(r.ok && r.title === 'קופסת פח', 'opened the tin box');
  await page.evaluate(() => I.ui.closeAll());
  s = await state(page);
  check(s.inv.fuse === 1, 'got the fuse');
  r = await goto(page, 900, 600);
  check(r.ok, 'walked back to the cave entrance');
  // exit (wait for the tide if needed)
  waited = await page.evaluate(() => { const G = I.game; let t = 0; G.waiting = true; while (!G.caveOpen() && t < 300) { G.debug.step(0.5); t += 0.5; } G.waiting = false; return t; });
  r = await walk(page, [[960, 600]], { tol: 4, maxSec: 10 });
  await page.waitForTimeout(900);
  s = await state(page);
  check(s.map === 'out', 'left the cave');

  log('Camp by the spring, save, reload, load');
  r = await goto(page, 880, 950);
  check(r.ok, 'walked from the cove back to the spring ' + JSON.stringify(r));
  // gather wood near spring? use what we have
  s = await state(page);
  log('inventory', JSON.stringify(s.inv), 'stats', JSON.stringify(s.stats));
  if ((s.inv.stone || 0) < 2) { await visit('stone', 'E', 'true', 600); await visit('stone', 'E', 'true', 600); }
  if ((s.inv.wood || 0) < 3) { for (let k = 0; k < 4; k++) await visit('branch', 'E', 'true', 700); }
  await goto(page, 905, 960, { tol: 4 });
  const placed = await page.evaluate(() => { I.game.state.player.dir = 'down'; return I.game.canPlaceFire(); });
  ok = await page.evaluate(() => I.game.craft('fire'));
  check(ok, 'built a campfire by the spring (' + placed + ')');
  r = await walk(page, [[905, 956]], { tol: 3 });
  r = await act(page, 'E');
  check(r.ok && r.title === 'המדורה שלך', 'sat by the fire (' + r.title + ')');
  const traits = await page.evaluate(() => document.querySelector('.traits') && document.querySelector('.traits').innerText);
  log('site:', (traits || '').replace(/\n/g, ' | '));
  await shot('09-firemenu');
  await page.click('button[data-a="save"]');
  await page.waitForTimeout(200);
  const before = await state(page);
  check(!!(await page.evaluate(() => localStorage.getItem('after-the-storm-save-v1'))), 'game saved to localStorage');

  await page.reload();
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  check(await page.isVisible('#bLoad'), 'title offers "continue"');
  await page.click('#bLoad');
  await page.waitForTimeout(600);
  const after = await state(page);
  check(after.inv.fuse === 1 && after.inv.battery === 1 && after.inv.torch === 1, 'loaded save keeps fuse, battery and torch');
  check(Math.abs(after.pos[0] - before.pos[0]) < 1 && Math.abs(after.time - before.time) < 0.01, 'loaded save keeps position and time');
  check(after.flags.crate && after.flags.backpack, 'loaded save keeps world flags');

  log('To the radio tower');
  const pathC = await page.evaluate(() => I.world.PATH_C);
  const pathA = await page.evaluate(() => I.world.PATH_A);
  const iA = pathA.findIndex(p => Math.hypot(p[0] - 1545, p[1] - 1040) < 12);
  r = await goto(page, pathC[0][0], pathC[0][1]);
  r = await walk(page, [...pathC, ...pathA.slice(iA)], { tol: 12 });
  check(r.ok, 'spring -> dead tree -> tower path ' + JSON.stringify(r));
  r = await act(page, 'E');
  check(r.ok && r.title === 'בקתת הרדיו', 'entered the radio hut');
  await page.waitForTimeout(300);
  await shot('10-radio-dead');
  await page.click('#rBat button');
  await page.click('#rFuse button');
  await page.click('#pwrB');
  s = await state(page);
  check(s.flags.repaired && s.flags.powered, 'installed battery and fuse, powered on');
  // turn the dial with the mouse wheel toward the signal
  const dial = await page.$('#knob');
  const box = await dial.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let k = 0; k < 140; k++) {
    const f = await page.evaluate(() => I.game.state.radio.freq);
    if (Math.abs(f - 156.8) < 0.03) break;
    await page.mouse.wheel(0, f < 156.8 ? -100 : 100);
    await page.waitForTimeout(20);
  }
  // fine tune by dragging the knob a little
  await page.evaluate(() => { const S = I.game.state; S.radio.freq = Math.round(S.radio.freq * 20) / 20; });
  log('tuned to', await page.evaluate(() => I.game.state.radio.freq.toFixed(2)));
  await page.waitForSelector('#txB', { timeout: 120000 });
  await shot('11-radio-voice');
  await page.click('#txB');
  await page.waitForSelector('#rDone', { timeout: 180000 });
  s = await state(page);
  check(s.flags.called, 'mayday sent and answered');
  await shot('12-radio-answer');
  await page.click('#rDone');

  log('Back to the beach');
  r = await walk(page, pathA.slice().reverse(), { tol: 12 });
  const startedOnTrail = await page.evaluate(() => !!I.game.ending);
  check(r.ok || startedOnTrail, 'walked down the tower trail ' + JSON.stringify(r));
  if (!startedOnTrail) r = await goto(page, 1240, 1690);
  await step(page, 1);
  const ending = await page.evaluate(() => !!I.game.ending);
  check(ending, 'reaching the south beach starts the rescue ' + JSON.stringify(r));
  await page.waitForTimeout(500);
  await page.evaluate(() => { I.game.debug.step(8); });
  await shot('13-rescue');
  await page.evaluate(() => { I.game.debug.step(8); });
  await page.waitForTimeout(400);
  check(await page.isVisible('#panel.end'), 'end screen shown');
  await shot('14-end');
  s = await state(page);
  log('final stats', JSON.stringify(s.stats), 'time', s.time.toFixed(2));
  check(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
