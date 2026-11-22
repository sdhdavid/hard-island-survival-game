// Shared Playwright helpers for driving the game through its debug API.
const BASE = process.env.GAME_URL || 'http://localhost:8123/index.html';
// software WebGL so the 3D version runs in headless Chromium too
const launchOpts = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
async function boot(page) {
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
}
// Walk along waypoints using the real movement & collision code.
async function walk(page, pts, opts = {}) {
  return page.evaluate(([pts, tol, maxSec]) => {
    const G = I.game;
    G.debug.walk(pts, tol || 10);
    let t = 0; const map = G.state.map;
    while (G.auto && !G.auto.stuck && t < maxSec && G.state.map === map && !G.busy) { G.debug.step(0.5); t += 0.5; }
    const res = { ok: !G.auto, stuck: !!(G.auto && G.auto.stuck), at: G.debug.pos().map(Math.round), i: G.auto ? G.auto.i : -1, n: pts.length, t };
    G.auto = null;
    return res;
  }, [pts, opts.tol, opts.maxSec || 400]);
}
// Pathfind to a point (A* through the real walkability rules) and walk there.
async function goto(page, x, y, opts = {}) {
  return page.evaluate(([x, y, tol, maxSec]) => {
    const G = I.game;
    if (!G.debug.goto(x, y, tol || 6)) return { ok: false, why: 'no path', at: G.debug.pos().map(Math.round) };
    let t = 0;
    while (G.auto && !G.auto.stuck && t < maxSec) { G.debug.step(0.5); t += 0.5; }
    const [px, py] = G.debug.pos();
    const res = { ok: !G.auto && Math.hypot(px - x, py - y) < 30, at: [Math.round(px), Math.round(py)], t };
    G.auto = null;
    return res;
  }, [x, y, opts.tol, opts.maxSec || 400]);
}
async function step(page, sec) { await page.evaluate(s => I.game.debug.step(s), sec); }
async function act(page, key = 'E') {
  return page.evaluate(k => { const G = I.game; G.promptT = 0; G.debug.step(0.1); const title = G.prompt && G.prompt.info.title; const ok = G.doAction(k); return { ok, title }; }, key);
}
async function state(page) { return page.evaluate(() => JSON.parse(JSON.stringify({ inv: I.game.state.inv, flags: I.game.state.flags, stats: I.game.state.stats, time: I.game.state.time, map: I.game.state.map, pos: I.game.debug.pos(), bottle: I.game.state.bottle }))); }
module.exports = { BASE, launchOpts, boot, walk, goto, step, act, state };
