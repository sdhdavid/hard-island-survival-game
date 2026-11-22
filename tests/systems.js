// Systems test: sleeping by a fire saves & advances to morning, morning regrowth,
// fainting returns you to camp, crabs hide, the tide uncovers mussels, waiting (T).
const { chromium } = require('playwright');
const { boot, goto, step, act, state } = require('./helpers');
let failures = 0;
function check(c, m) { console.log(c ? '  ✓' : '  ✗', m); if (!c) failures++; }
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await page.evaluate(() => localStorage.clear());
  await page.click('#bNew'); await page.waitForTimeout(200);
  await step(page, 7);
  // give the basics as if gathered
  await page.evaluate(() => { const S = I.game.state; Object.assign(S.flags, { backpack: true, lighter: true, knife: true, notebook: true }); S.inv = { wood: 9, stone: 2, mussels: 2 }; I.ui.dirty = true; });

  console.log('• Crabs hide when you come close');
  const crab = await page.evaluate(() => { const c = I.game.crabs[0]; return { x: c.x, y: c.y }; });
  await page.evaluate(c => { const p = I.game.state.player; p.x = c.x + 80; p.y = c.y; }, crab);
  await goto(page, crab.x + 20, crab.y, { tol: 4, maxSec: 20 });
  await step(page, 2);
  check(await page.evaluate(() => I.game.crabs[0].hidden), 'crab ran into its hole');

  console.log('• Building camp on the beach at dusk');
  await page.evaluate(() => { const G = I.game; G.state.time = 19.2; G.state.player.x = 1040; G.state.player.y = 1660; G.state.player.dir = 'down'; G.debug.step(0.1); });
  check(await page.evaluate(() => I.game.craft('fire')), 'campfire built');
  const traits = await page.evaluate(() => I.game.state.fires[0].traits.map(t => t.k).join(','));
  check(traits.includes('wood') && traits.includes('wind'), 'beach site: plenty of driftwood but windy (' + traits + ')');
  await page.evaluate(() => { const G = I.game; const f = G.state.fires[0]; G.fireAction(f, 'cook'); G.fireAction(f, 'wood'); G.fireAction(f, 'wood'); G.fireAction(f, 'wood'); G.fireAction(f, 'wood'); });
  let s = await state(page);
  check(s.inv.cooked === 2, 'cooked the mussels');
  // take some driftwood so we can see it wash back in the morning
  const takenBefore = await page.evaluate(() => { const G = I.game; let n = 0; for (const o of I.world.objs) if (o.type === 'drift' && o.beach && n < 3) { G.os(o).taken = true; n++; } return n; });
  await page.evaluate(() => { const G = I.game; G.state.stats.energy = 20; I.ui.openFire(G.state.fires[0]); });
  await page.click('button[data-a="sleep"]');
  await page.waitForTimeout(3600);
  s = await state(page);
  const hr = s.time % 24;
  check(hr > 6.3 && hr < 6.8 && s.time > 24, 'slept until morning of day 2 (' + hr.toFixed(2) + ')');
  check(s.stats.energy >= 60, 'energy restored (' + Math.round(s.stats.energy) + ')');
  check(!!(await page.evaluate(() => localStorage.getItem('after-the-storm-save-v1'))), 'sleeping saved the game');
  const regrown = await page.evaluate(() => I.world.objs.filter(o => o.type === 'drift' && o.beach && (I.game.state.objState[o.id] || {}).taken).length);
  check(regrown === 0, 'the sea washed new driftwood onto the beach overnight');
  await page.evaluate(() => { const G = I.game; G.state.player.x = 1040; G.state.player.y = 1640; });

  console.log('• Mussels are only reachable at low tide');
  const mus = await page.evaluate(() => { const o = I.world.objs.find(o => o.type === 'mussel' && o.x < 600); return { x: o.x, y: o.y, h: I.world.hAt(o.x, o.y) }; });
  check(mus.h < 1 && mus.h > -4, 'mussels sit in the intertidal band (h=' + mus.h.toFixed(1) + ')');

  console.log('• Waiting (T) makes the tide move');
  const t0 = await page.evaluate(() => I.game.state.time);
  await page.keyboard.down('KeyT'); await page.waitForTimeout(1200); await page.keyboard.up('KeyT');
  const t1 = await page.evaluate(() => I.game.state.time);
  check(t1 - t0 > 0.3, 'holding T fast-forwards time (' + (t1 - t0).toFixed(2) + 'h)');

  console.log('• Fainting');
  await page.evaluate(() => { const G = I.game; G.state.player.x = 1500; G.state.player.y = 1000; G.state.stats.water = 0; G.state.stats.vigor = 0.5; });
  await step(page, 2);
  await page.waitForTimeout(2200);
  s = await state(page);
  check(Math.hypot(s.pos[0] - 1040, s.pos[1] - 1662) < 60, 'woke up back at the camp (' + s.pos.map(Math.round) + ')');
  check(s.stats.water >= 35 && s.stats.vigor > 40, 'stats recovered after fainting');

  check(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await b.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
