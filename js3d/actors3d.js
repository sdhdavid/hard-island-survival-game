// ------------------------------------------------------------
//  Things that move or change: the castaway, creatures, fires,
//  the backpack, the boat, pickups, the rescue
// ------------------------------------------------------------
import * as THREE from 'three';
import { groundY, XS, HS, M, placeM } from './world3d.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function backpackMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36, 2, 2, 2), lam(0x5d6b33));
  body.position.y = 0.39;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.24, 0.38), lam(0x75853f)); flap.position.y = 0.72;
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.1), lam(0x47522a)); pocket.position.set(0, 0.28, 0.21);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.66, 10), lam(0x9b3b2b)); roll.rotation.z = Math.PI / 2; roll.position.y = 0.9;
  [body, flap, pocket, roll].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
  return g;
}
function crabGeo() {
  const parts = [];
  const add = (geo, x, y, z, sx, sy, sz) => { geo.scale(sx, sy, sz); geo.translate(x, y, z); parts.push(geo); };
  add(new THREE.SphereGeometry(1, 10, 6), 0, 0.35, 0, 1, 0.45, 0.75);
  add(new THREE.SphereGeometry(1, 8, 6), -1.15, 0.45, 0.55, 0.42, 0.3, 0.3);
  add(new THREE.SphereGeometry(1, 8, 6), 1.15, 0.45, 0.55, 0.42, 0.3, 0.3);
  for (let k = -1; k <= 1; k++) { add(new THREE.BoxGeometry(1, 0.12, 0.12), -1.1, 0.18, k * 0.4, 1, 1, 1); add(new THREE.BoxGeometry(1, 0.12, 0.12), 1.1, 0.18, k * 0.4, 1, 1, 1); }
  add(new THREE.SphereGeometry(0.12, 6, 4), -0.3, 0.75, 0.55, 1, 1, 1); add(new THREE.SphereGeometry(0.12, 6, 4), 0.3, 0.75, 0.55, 1, 1, 1);
  return mergeGeos(parts);
}
function mergeGeos(list) {
  // tiny merge (positions + normals) to keep creatures to one draw call
  let n = 0; list.forEach(g => { g = g.index ? g.toNonIndexed() : g; n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  list.forEach(g0 => { const g = g0.index ? g0.toNonIndexed() : g0; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}
function glowSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}
function flameMesh() {
  const g = new THREE.Group();
  const mk = (c, r, h, y) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.y = y; g.add(m); return m; };
  g.userData.cones = [mk(0xff5a1e, 0.42, 1.2, 0.6), mk(0xffa83a, 0.3, 0.9, 0.5), mk(0xffe7a0, 0.16, 0.55, 0.36)];
  g.add(glowSprite(0xffa040, 3.2));
  return g;
}

export class Actors {
  constructor(loader, U) {
    this.loader = loader; this.U = U;
    this.outside = new THREE.Group();
    this.root = new THREE.Group(); // the player travels between the island and the cave
    this.fires = new Map();
    this.anim = null; this.yaw = 0; this.last = null; this.once = null;
  }
  async load(built) {
    const w = I.world, O = this.outside;
    this.built = built;
    // ---- the castaway (KayKit "Rogue", CC0)
    const g = await this.loader.loadAsync('assets/models/kaykit/Rogue.glb');
    const hero = g.scene;
    const hide = /Knife|Crossbow|Throwable/i;
    hero.traverse(o => { if (o.isMesh) { if (hide.test(o.name)) o.visible = false; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const box = new THREE.Box3();
    hero.traverse(o => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    const sc = 2.05 / Math.max(0.5, box.max.y - Math.max(0, box.min.y));
    hero.scale.setScalar(sc);
    this.hero = hero;
    this.heroG = new THREE.Group(); this.heroG.add(hero);
    this.root.add(this.heroG);
    this.mixer = new THREE.AnimationMixer(hero);
    this.actions = {};
    g.animations.forEach(a => { this.actions[a.name] = this.mixer.clipAction(a); });
    ['Interact', 'PickUp', 'Use_Item', 'Lie_Down', 'Sit_Floor_Down'].forEach(n => { const a = this.actions[n]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } });
    this.mixer.addEventListener('finished', () => { this.once = null; });
    let chest = null, hand = null;
    hero.traverse(o => { if (o.isBone) { const n = o.name.toLowerCase(); if (!chest && (n === 'chest' || n.includes('chest'))) chest = o; if (!hand && n.includes('handslot') && n.includes('r')) hand = o; } });
    // backpack worn on the back
    this.pack = backpackMesh();
    this.pack.scale.setScalar(0.85);
    this.pack.position.set(0, 0.95, -0.36);
    this.heroG.add(this.pack);
    // torch
    this.torch = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), lam(0x6b4a2a)); stick.position.y = 0.2; this.torch.add(stick);
    this.torchFlame = flameMesh(); this.torchFlame.scale.setScalar(0.45); this.torchFlame.position.y = 0.62; this.torch.add(this.torchFlame);
    this.torchLight = new THREE.PointLight(0xffa860, 0, 22, 1.4);
    this.torchLight.position.set(0.3, 2.3, 0.4);
    this.heroG.add(this.torchLight);
    if (hand) { this.torch.scale.setScalar(1 / sc); hand.add(this.torch); } else { this.torch.position.set(0.45, 1.1, 0.25); this.heroG.add(this.torch); }
    this.torch.visible = false;
    // ---- the backpack hanging from a leaning tree over the water
    const bp = w.find('backpack'), bt = w.find('bptree');
    const treeM = M['nature/tree_oak'];
    const tree = new THREE.Group();
    treeM.parts.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = m.receiveShadow = true; tree.add(m); });
    tree.applyMatrix4(placeM(treeM, bt.x, bt.y, { h: 5.6, rx: 0.42, yaw: 0.2 }));
    O.add(tree);
    const branchTop = new THREE.Vector3(bp.x * XS, groundY(bt.x, bt.y) + 4.1, bp.y * XS - 0.6);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 4.4, 6), lam(0x6e4c2e));
    branch.position.set((bt.x * XS + branchTop.x) / 2, branchTop.y - 0.3, (bt.y * XS + 1.2 + branchTop.z) / 2);
    branch.lookAt(branchTop); branch.rotateX(Math.PI / 2); branch.castShadow = true;
    O.add(branch);
    this.hang = new THREE.Group();
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), lam(0x2b2418)); strap.position.y = -0.45; this.hang.add(strap);
    const hb = backpackMesh(); hb.position.y = -1.7; this.hang.add(hb);
    this.hang.position.copy(branchTop);
    this.hangTop = branchTop.clone();
    O.add(this.hang);
    this.groundBag = backpackMesh(); this.groundBag.visible = false; this.groundBag.rotation.y = 0.5; O.add(this.groundBag);
    // ---- the boat stuck on the reef, its emergency crate, the rope
    const boatM = M['watercraft/boat-fishing-small'];
    this.boat = new THREE.Group();
    boatM.parts.forEach(p => { const mat = p.mat.clone(); mat.color = new THREE.Color(0.62, 0.8, 1.25); const m = new THREE.Mesh(p.geo, mat); m.castShadow = m.receiveShadow = true; this.boat.add(m); });
    this.boat.applyMatrix4(placeM(boatM, w.BOAT.x, w.BOAT.y, { len: 7.5, yaw: -2.0, rz: 0.16, rx: -0.06, y: -0.25 }));
    O.add(this.boat);
    const crateM = M['pirate/crate'];
    const mk = (model, opt) => { const gg = new THREE.Group(); model.parts.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = m.receiveShadow = true; gg.add(m); }); gg.applyMatrix4(placeM(model, opt.x, opt.y, Object.assign({}, opt, { y: opt.y3 }))); O.add(gg); return gg; };
    this.boatCrate = mk(crateM, { x: w.BOAT.x - 16, y: w.BOAT.y - 8, len: 1.1, yaw: 0.4, y3: 0.75 });
    this.rockCrate = mk(crateM, { x: 1846, y: 1792, len: 1.1, yaw: 0.2 });
    const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xc9a46a })); this.rope.frustumCulled = false; O.add(this.rope);
    // washed-up crate (closed / opened), buoy, the boat log page
    const deb = w.find('debris');
    this.debClosed = mk(crateM, { x: deb.x, y: deb.y, len: 1.6, yaw: 0.3 });
    this.debOpen = mk(M['survival/box-open'], { x: deb.x, y: deb.y, len: 1.6, yaw: 0.3 });
    const buoy = w.find('buoy');
    this.buoy = mk(M['watercraft/buoy'], { x: buoy.x, y: buoy.y, h: 1.3, yaw: 0 });
    this.buoyBase = this.buoy.position.y;
    const lp = w.find('logpage');
    this.page = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), lam(0xf6efdc, { side: THREE.DoubleSide }));
    this.page.rotation.x = -Math.PI / 2; this.page.rotation.z = 0.4;
    this.page.position.set(lp.x * XS, groundY(lp.x, lp.y) + 0.05, lp.y * XS); O.add(this.page);
    this.pageO = lp;
    const cc = w.find('campcrate');
    this.campClosed = mk(M['survival/chest'], { x: cc.x, y: cc.y, len: 1.5, yaw: 0.2 });
    this.campOpen = mk(M['survival/box-open'], { x: cc.x, y: cc.y, len: 1.5, yaw: 0.2 });
    // the paper pinned on the camp post
    const cn = w.find('campnote');
    this.note = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), lam(0xfbf3dc, { side: THREE.DoubleSide }));
    this.note.position.set(cn.x * XS, groundY(cn.x, cn.y) + 1.05, cn.y * XS + 0.09); O.add(this.note);
    // ---- small things that run out: coconuts, berries, resin, mussels
    const palms = w.objs.filter(o => o.type === 'palm'), berries = w.objs.filter(o => o.type === 'berry');
    const coco = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), lam(0x5b3a1c), palms.length * 2);
    coco.castShadow = true; coco.frustumCulled = false; O.add(coco);
    const berry = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), lam(0x7d3aa8), berries.length * 9);
    berry.frustumCulled = false; O.add(berry);
    const mussels = w.objs.filter(o => o.type === 'mussel');
    const mus = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), lam(0x1c2236), mussels.length * 7);
    mus.frustumCulled = false; O.add(mus);
    const resinO = w.objs.filter(o => o.type === 'pine');
    const resin = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), lam(0xf0a830, { emissive: 0x3a2000 }), resinO.length);
    resin.frustumCulled = false; O.add(resin);
    this.small = { palms, berries, mussels, resinO, coco, berry, mus, resin };
    // ---- crabs and gulls
    this.crabs = new THREE.InstancedMesh(crabGeo(), lam(0xd9583f), 32);
    this.crabs.castShadow = true; this.crabs.frustumCulled = false; O.add(this.crabs);
    this.gulls = [];
    for (let k = 0; k < 6; k++) {
      const gg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lam(0xf7f7f2)); body.scale.set(0.8, 0.7, 2); gg.add(body);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), lam(0xf2f2ee)); wl.position.x = -0.45; const wr = wl.clone(); wr.position.x = 0.45;
      const pl = new THREE.Group(); pl.add(wl); const pr = new THREE.Group(); pr.add(wr);
      gg.add(pl, pr); gg.userData = { pl, pr };
      gg.traverse(o => { if (o.isMesh) o.castShadow = true; });
      O.add(gg); this.gulls.push(gg);
    }
    // ---- glints, beacon, rescue boat
    this.glint = glowSprite(0xfff0c0, 1.2); O.add(this.glint);
    this.beacon = new THREE.PointLight(0xff3020, 0, 40, 1.2);
    this.beacon.position.set(built.tower.position.x, built.tower.position.y + built.tower.userData.top, built.tower.position.z);
    this.beaconGlow = glowSprite(0xff4030, 3); this.beaconGlow.position.copy(this.beacon.position); this.beaconGlow.visible = false;
    O.add(this.beacon, this.beaconGlow);
    this.rescue = new THREE.Group();
    const rb = M['watercraft/boat-speed-a'];
    rb.parts.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; this.rescue.add(m); });
    const s = 7 / Math.max(rb.size.x, rb.size.z); this.rescue.children.forEach(m => m.scale.setScalar(s));
    this.rescueLight = new THREE.SpotLight(0xfff4dc, 0, 120, 0.35, 0.5, 1); this.rescueLight.position.set(0, 3, 1);
    this.rescue.add(this.rescueLight, this.rescueLight.target);
    const nav = [[0xff2a2a, -1.2], [0x2aff6a, 1.2]].map(([c, x]) => { const sp = glowSprite(c, 1.4); sp.position.set(x, 1.6, 0.5); return sp; });
    this.rescue.add(...nav);
    this.strobe = glowSprite(0xffffff, 3); this.strobe.position.y = 4; this.rescue.add(this.strobe);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -20, 0); beam.rotation.x = -Math.PI / 2 + 0.25; beam.position.set(0, 3, 0.5);
    this.beam = beam; this.rescue.add(beam);
    this.rescue.visible = false;
    O.add(this.rescue);
    this.fireGroup = new THREE.Group(); this.root.add(this.fireGroup);
  }

  play(name, fade = 0.25) {
    const a = this.actions[name];
    if (!a || this.anim === name) return;
    const prev = this.actions[this.anim];
    a.reset().fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.anim = name;
  }
  oneShot(name) { if (this.actions[name]) { this.once = name; this.play(name, 0.15); } }

  titlePose(t) {
    const w = I.world;
    this.root.visible = true;
    this.heroG.position.set(w.START.x * XS, groundY(w.START.x, w.START.y), w.START.y * XS);
    this.heroG.rotation.y = 2.3;
    this.pack.visible = false; this.torch.visible = false; this.torchLight.intensity = 0;
    this.play('Lie_Idle', 0);
    this.mixer.update(1 / 60);
    this.swingBag(t, 0.7);
    this.animateGulls(t, 1, 0.016);
    this.updateFires(null, t, true);
  }
  swingBag(t, wind) {
    this.hang.rotation.z = Math.sin(t * 1.6) * 0.16 * (0.5 + wind);
    this.hang.rotation.x = Math.sin(t * 1.1 + 1) * 0.06;
  }
  animateGulls(t, day, dt) {
    const G = I.game;
    this.gulls.forEach((g, k) => {
      const b = G.birds[k];
      if (!b || day < 0.3) { g.visible = false; return; }
      g.visible = true;
      g.position.set(b.x * XS, 11 + k * 0.8 + Math.sin(t * 0.5 + k) * 0.6, b.y * XS);
      g.rotation.y = Math.atan2(b.vx, b.vy) + Math.PI;
      const f = Math.sin(t * b.fs + b.p) * 0.6;
      g.userData.pl.rotation.z = f; g.userData.pr.rotation.z = -f;
    });
  }
  updateFires(G, t, title) {
    const S = G && G.state;
    const list = S ? S.fires : [];
    const seen = new Set();
    for (const f of list) {
      seen.add(f.id);
      let e = this.fires.get(f.id);
      if (!e) {
        const g = new THREE.Group();
        if (!f.pit) { const pm = M['survival/campfire-pit']; pm.parts.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.receiveShadow = true; g.add(m); }); g.children.forEach(m => m.scale.setScalar(2.2 / Math.max(pm.size.x, pm.size.z))); }
        const lm = M['nature/campfire_logs']; const logs = new THREE.Group(); lm.parts.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; logs.add(m); }); logs.scale.setScalar(1.5 / Math.max(lm.size.x, lm.size.z)); g.add(logs);
        const fl = flameMesh(); g.add(fl);
        const light = new THREE.PointLight(0xff9a48, 0, 26, 1.3); light.position.y = 1.4; g.add(light);
        e = { g, fl, light, f }; this.fires.set(f.id, e);
        this.fireGroup.add(g);
      }
      e.f = f;
      const cave = f.map === 'cave';
      const base = cave ? 0 : groundY(f.x, f.y);
      e.g.position.set(f.x * XS, base, f.y * XS);
      e.g.visible = f.map === S.map;
      const lit = f.fuel > 0;
      const fl = 0.85 + 0.15 * Math.sin(t * 13 + f.x) * Math.sin(t * 7.3);
      const k = lit ? I.clamp(0.6 + f.fuel / 10, 0.6, 1.15) : 0;
      e.fl.visible = lit;
      e.fl.userData.cones.forEach((c, i) => { c.scale.set(k * (0.9 + 0.1 * Math.sin(t * 9 + i)), k * fl * (1 + 0.15 * Math.sin(t * 11 + i * 2)), k * 0.95); });
      e.light.intensity = lit ? 26 * fl * k : 1.5;
      e.light.color.setHex(lit ? 0xff9a48 : 0xff3010);
    }
    for (const [id, e] of this.fires) if (!seen.has(id)) { this.fireGroup.remove(e.g); this.fires.delete(id); }
  }

  update(G, dt, sky, cave) {
    const S = G.state, p = S.player, w = I.world, t = G.clock, F = S.flags;
    const inCave = !!cave;
    this.root.visible = true;
    // ---- the castaway
    const base = inCave ? cave.heightAt(p.x, p.y) : groundY(p.x, p.y);
    const pos = new THREE.Vector3(p.x * XS, base, p.y * XS);
    if (this.last) {
      const dx = pos.x - this.last.x, dz = pos.z - this.last.z;
      if (dx * dx + dz * dz > 1e-6) {
        const ty = Math.atan2(dx, dz);
        let d = ty - this.yaw; while (d > Math.PI) d -= I.TAU; while (d < -Math.PI) d += I.TAU;
        this.yaw += d * Math.min(1, dt * 12);
      }
    } else this.yaw = 0;
    this.last = pos.clone();
    this.heroG.position.copy(pos);
    this.heroG.rotation.y = this.yaw;
    const speed = p.moving ? 1 : 0;
    const run = (G.keys.ShiftLeft || G.keys.ShiftRight) && S.stats.energy > 8;
    let want;
    if (p.sleep) want = 'Lie_Idle';
    else if (G.ending && G.ending.t > 9) want = 'Cheer';
    else if (I.ui.open === 'fire') want = 'Sit_Floor_Idle';
    else if (this.once) want = this.once;
    else if (speed) want = run ? 'Running_A' : 'Walking_A';
    else if (G.cine || G.rope) want = 'Interact';
    else want = 'Idle';
    this.play(want);
    if (this.actions.Walking_A) this.actions.Walking_A.timeScale = G.playerDepth > 0.6 ? 0.7 : 1.1;
    this.mixer.update(dt);
    this.pack.visible = !!F.backpack && !G.bagDown && !p.sleep;
    this.torch.visible = !!p.torch && !p.sleep;
    const tf = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 6.1 + 2);
    this.torchLight.intensity = p.torch ? (inCave ? 60 : 30) * tf : 0;
    if (p.torch) this.torchFlame.userData.cones.forEach((c, i) => c.scale.set(1, tf * (1 + 0.2 * Math.sin(t * 12 + i)), 1));
    this.updateFires(G, t);
    if (inCave) return;
    // ---- hanging backpack, falling into the shallows
    const bp = w.find('backpack');
    this.hang.visible = !F.backpack;
    if (!F.backpack) {
      if (G.bpFall !== undefined) {
        const k = I.clamp(G.bpFall, 0, 1);
        this.hang.position.y = this.hangTop.y - k * k * 3.6;
        this.hang.rotation.z = k * 0.9;
      } else { this.hang.position.copy(this.hangTop); this.swingBag(t, G.wind); }
    }
    // backpack set down by the fire
    this.groundBag.visible = !!G.bagDown;
    if (G.bagDown) this.groundBag.position.set(S.campBag.x * XS, groundY(S.campBag.x, S.campBag.y), S.campBag.y * XS);
    // ---- boat crate and rope
    const bs = S.objState[w.find('boat').id] || {};
    this.boatCrate.visible = !F.crate;
    this.rockCrate.visible = !!F.crate;
    this.rope.visible = !!G.rope;
    if (G.rope) {
      const a = this.rope.geometry.attributes.position;
      const c = this.boatCrate.visible ? this.boatCrate.position : this.rockCrate.position;
      a.setXYZ(0, pos.x, pos.y + 1.1, pos.z); a.setXYZ(1, c.x, c.y + 0.6, c.z); a.needsUpdate = true;
    }
    // ---- set pieces that change
    const deb = S.objState[w.find('debris').id] || {};
    this.debClosed.visible = !deb.opened; this.debOpen.visible = !!deb.opened;
    const cc = S.objState[w.find('campcrate').id] || {};
    this.campClosed.visible = !cc.opened; this.campOpen.visible = !!cc.opened;
    this.page.visible = !(S.objState[this.pageO.id] || {}).taken;
    this.buoy.position.y = this.buoyBase + Math.sin(t * 1.4) * 0.08;
    this.buoy.rotation.z = Math.sin(t * 1.1) * 0.08;
    this.note.rotation.y = Math.sin(t * 2.4) * 0.12 * G.wind;
    // ---- coconuts, berries, mussels, resin (refreshed a few times a second)
    this.smallT = (this.smallT || 0) - dt;
    if (this.smallT <= 0) { this.smallT = 0.25; this.refreshSmall(S); }
    // ---- crabs
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.16, 0.16, 0.16), cp = new THREE.Vector3();
    G.crabs.forEach((c, k) => {
      if (c.hidden) { this.crabs.setMatrixAt(k, ZERO); return; }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (c.tx - c.x) * 0.02 + k);
      cp.set(c.x * XS, groundY(c.x, c.y) + (c.moving ? Math.abs(Math.sin(t * 30)) * 0.03 : 0), c.y * XS);
      this.crabs.setMatrixAt(k, m.compose(cp, q, sc));
    });
    this.crabs.count = G.crabs.length; this.crabs.instanceMatrix.needsUpdate = true;
    this.animateGulls(t, sky.day, dt);
    // ---- the glint deep in the cave mouth at low tide
    const show = G.tide < -0.5 && !F.fuse;
    const tw = Math.pow(Math.max(0, Math.sin(t * 2.2)), 18) + Math.pow(Math.max(0, Math.sin(t * 1.3 + 1)), 30) * 0.6;
    this.glint.visible = show && tw > 0.02;
    this.glint.position.set(w.MOUTH.x * XS, groundY(w.MOUTH.x, w.MOUTH.y) + 0.9, (w.MOUTH.y - 10) * XS);
    this.glint.scale.setScalar(0.6 + tw * 1.6);
    // ---- tower beacon once the radio works
    const on = F.powered && (t % 2.2) < 0.3;
    this.beacon.intensity = on ? 120 : 0;
    this.beaconGlow.visible = on;
    this.built.tower.userData.bulb.material.color.setHex(on ? 0xff4030 : 0x5a1a16);
    this.built.hut.userData.window.emissive.setHex(F.powered ? 0xffc870 : 0x000000);
    // ---- rescue
    const r = G.rescue;
    this.rescue.visible = !!r;
    if (r) {
      this.rescue.position.set(r.x * XS, (G.tide + 0.2) * HS, r.y * XS);
      this.rescue.rotation.y = Math.PI + Math.sin(t * 0.4) * 0.05;
      this.rescue.rotation.z = Math.sin(t * 1.3) * 0.04;
      const toP = Math.atan2(p.x * XS - this.rescue.position.x, p.y * XS - this.rescue.position.z);
      this.beam.rotation.set(-Math.PI / 2 + 0.22, 0, 0);
      this.beam.parent.updateMatrixWorld();
      this.rescueLight.intensity = 400;
      this.rescueLight.target.position.set(0, 0, -20);
      this.strobe.visible = (t % 1.2) < 0.15;
      this.rescue.userData.aim = toP;
    }
  }
  refreshSmall(S) {
    const { palms, berries, mussels, resinO, coco, berry, mus, resin } = this.small;
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    palms.forEach((o, k) => {
      const st = S.objState[o.id] || {};
      const n = st.coconuts !== undefined ? st.coconuts : o.coconuts;
      for (let j = 0; j < 2; j++) {
        if (j < n && o._crown) { v.copy(o._crown).add(new THREE.Vector3(j ? 0.22 : -0.18, -0.35, 0.15)); coco.setMatrixAt(k * 2 + j, m.compose(v, q, one)); }
        else coco.setMatrixAt(k * 2 + j, ZERO);
      }
    });
    coco.instanceMatrix.needsUpdate = true;
    berries.forEach((o, k) => {
      const st = S.objState[o.id] || {};
      const n = (st.berries !== undefined ? st.berries : o.berries) * 3;
      for (let j = 0; j < 9; j++) {
        if (j < n) { const a = j * 2.1 + o.x; v.set(o.x * XS + Math.cos(a) * 0.55, groundY(o.x, o.y) + 0.8 + Math.sin(j * 1.7) * 0.35, o.y * XS + Math.sin(a) * 0.5 + 0.2); berry.setMatrixAt(k * 9 + j, m.compose(v, q, one)); }
        else berry.setMatrixAt(k * 9 + j, ZERO);
      }
    });
    berry.instanceMatrix.needsUpdate = true;
    mussels.forEach((o, k) => {
      const st = S.objState[o.id] || {};
      const n = st.n !== undefined ? st.n : o.n;
      for (let j = 0; j < 7; j++) {
        if (n > 0) { const a = j * 1.1 + o.x, rr = 0.15 + (j % 3) * 0.15; v.set(o.x * XS + Math.cos(a) * rr, groundY(o.x, o.y) + 0.05, o.y * XS + Math.sin(a) * rr); mus.setMatrixAt(k * 7 + j, m.compose(v, q, new THREE.Vector3(0.8, 0.6, 1.5))); }
        else mus.setMatrixAt(k * 7 + j, ZERO);
      }
    });
    mus.instanceMatrix.needsUpdate = true;
    resinO.forEach((o, k) => {
      const st = S.objState[o.id] || {};
      const n = st.resin !== undefined ? st.resin : o.resin;
      if (n > 0) { v.set(o.x * XS + 0.25, groundY(o.x, o.y) + 1.0, o.y * XS + 0.25); resin.setMatrixAt(k, m.compose(v, q, new THREE.Vector3(1, 1.6, 1))); }
      else resin.setMatrixAt(k, ZERO);
    });
    resin.instanceMatrix.needsUpdate = true;
  }
}
