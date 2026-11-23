// ------------------------------------------------------------
//  3D renderer (three.js) — same interface as the 2D renderer:
//  I.render.{load, init, resize, frame, size, toScreen, screenToWorld, emit}
// ------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildWorld, groundH, groundY, XS, HS } from './world3d.js';
import { Actors } from './actors3d.js';
import { CaveScene } from './cave3d.js';

// no WebGL? fall back to the 2D version of the game
{
  const t = document.createElement('canvas');
  if (!(t.getContext('webgl2') || t.getContext('webgl'))) location.replace('2d.html' + location.search);
}
const R = I.render = { is3D: true, particles: [], baseZoom: 1, skip: {} };
let renderer, canvas, camera, scene, fx, fxc;
let sun, hemi, moon, outside, actors, caveS, water, waterU;
let userZoom = 1, titleT = 0;
const lightU = { uTime: { value: 0 }, uWind: { value: 0.6 }, uPS: { value: new THREE.Vector3() }, uPZ: { value: 1 } };
R.shared = lightU;

// ---------------- loading ----------------
R.load = async function (progress) {
  const loader = new GLTFLoader();
  R.loader = loader;
  progress && progress(0.2);
  outside = new THREE.Group();
  const built = await buildWorld(loader, lightU, v => progress && progress(0.2 + v * 0.55));
  outside.add(built.group);
  water = built.water; waterU = built.waterU;
  R.world3d = built;
  progress && progress(0.8);
  actors = new Actors(loader, lightU);
  await actors.load(built);
  outside.add(actors.outside);
  progress && progress(0.9);
  caveS = new CaveScene(lightU);
  caveS.build();
  // the castaway reaches out whenever an action happens
  const G = I.game, orig = G.doAction;
  G.doAction = function (k) { const r = orig.call(G, k); if (r) actors.oneShot('Interact'); return r; };
  progress && progress(0.94);
};

R.init = function (cv) {
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3ef, 90, 260);
  camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
  hemi = new THREE.HemisphereLight(0xeaf6ff, 0x7a9a5a, 1.3);
  sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  scene.add(hemi, sun, sun.target, moon, moon.target);
  scene.add(outside, caveS.group, actors.root);
  // 2D overlay for rain, vignette and fades
  fx = document.createElement('canvas');
  fx.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  canvas.after(fx);
  fxc = fx.getContext('2d');
  R.resize();
};
R.resize = function () {
  if (!renderer) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  fx.width = Math.floor(innerWidth / 2); fx.height = Math.floor(innerHeight / 2);
};
R.size = () => [innerWidth, innerHeight];
R.onWheel = d => { userZoom = I.clamp(userZoom * (d > 0 ? 1.1 : 0.9), 0.55, 1.8); };

const V = new THREE.Vector3();
R.toScreen = function (cam, x, y) {
  const map = I.game.state ? I.game.state.map : 'out';
  const h = map === 'cave' ? caveS.heightAt(x, y) : groundY(x, y);
  V.set(x * XS, h + 1.6, y * XS).project(camera);
  return [(V.x * 0.5 + 0.5) * innerWidth, (-V.y * 0.5 + 0.5) * innerHeight];
};
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
R.screenToWorld = function (cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const map = I.game.state ? I.game.state.map : 'out';
  const target = map === 'cave' ? caveS.pickMesh : R.world3d.terrain;
  const hit = ray.intersectObject(target, false)[0];
  if (hit) return [hit.point.x / XS, hit.point.z / XS];
  // fall back to the sea plane
  const t = -ray.ray.origin.y / ray.ray.direction.y;
  if (t > 0) return [(ray.ray.origin.x + ray.ray.direction.x * t) / XS, (ray.ray.origin.z + ray.ray.direction.z * t) / XS];
  return null;
};

// ---------------- particles ----------------
R.emit = function (p) { if (R.particles.length < 700) R.particles.push(p); };
const PMAX = 700;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 4), 4));
pGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(PMAX), 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: `attribute vec4 color; attribute float size; varying vec4 vC;
    void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * 220. / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if (r > .5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(.5, .2, r)); }`,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
const PCOL = { smoke: [0.86, 0.86, 0.88], ember: [1, 0.62, 0.25], spray: [1, 1, 1], leaf: [0.6, 0.75, 0.3], ring: [1, 1, 1], dust: [0.9, 0.82, 0.65], zzz: [1, 1, 1], sparkle: [1, 0.97, 0.85] };
function updateParticles(dt, map) {
  const ps = R.particles, pos = pGeo.attributes.position.array, col = pGeo.attributes.color.array, siz = pGeo.attributes.size.array;
  let n = 0;
  for (let k = ps.length - 1; k >= 0; k--) {
    const p = ps[k];
    p.life -= dt;
    if (p.life <= 0) { ps.splice(k, 1); continue; }
    const rise = p.kind === 'smoke' || p.kind === 'ember' || p.kind === 'zzz' || p.kind === 'sparkle';
    if (p.h === undefined) p.h = (p.z || 0) + (rise ? 0 : 0.5) + (p.kind === 'smoke' ? 14 : 0);
    if (rise) { p.h += -p.vy * dt * 0.9; p.x += p.vx * dt; }
    else { p.x += p.vx * dt; p.y += p.vy * dt; if (p.vz !== undefined) { p.h += p.vz * dt; p.vz -= (p.g || 0) * dt; } }
    if (n >= PMAX) continue;
    const base = map === 'cave' ? caveS.heightAt(p.x, p.y) : groundY(p.x, p.y);
    pos[n * 3] = p.x * XS; pos[n * 3 + 1] = base + Math.max(0, p.h) * HS + (p.kind === 'ring' ? 0.15 : 0); pos[n * 3 + 2] = p.y * XS;
    const a = I.clamp(p.life / p.max, 0, 1), c = PCOL[p.kind] || [1, 1, 1];
    col[n * 4] = c[0]; col[n * 4 + 1] = c[1]; col[n * 4 + 2] = c[2];
    col[n * 4 + 3] = (p.kind === 'smoke' ? 0.35 : p.kind === 'ring' ? 0.4 : 0.9) * a;
    siz[n] = p.kind === 'smoke' ? 0.9 + (1 - a) * 1.6 : p.kind === 'ember' ? 0.12 : p.kind === 'ring' ? 0.5 + (1 - a) : p.kind === 'leaf' ? 0.22 : p.kind === 'zzz' ? 0.3 : 0.16;
    n++;
  }
  pGeo.setDrawRange(0, n);
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = true;
}

// ---------------- sky & lights ----------------
const C = (r, g, b) => new THREE.Color(r, g, b);
const FOG_DAY = C(0.74, 0.88, 0.95), FOG_DUSK = C(0.98, 0.74, 0.6), FOG_NIGHT = C(0.06, 0.08, 0.17), FOG_GREY = C(0.7, 0.75, 0.8);
const tmpC = new THREE.Color();
function lightsFor(time, overcast, target, inCave) {
  const sky = I.sky(time, overcast);
  const t = ((time % 24) + 24) % 24;
  const el = Math.sin(I.clamp((t - 5.8) / 13.4, 0, 1) * Math.PI);           // sun elevation 0..1
  const az = I.clamp((t - 5.8) / 13.4, 0, 1) * Math.PI;                       // east -> west
  const sd = new THREE.Vector3(Math.cos(az) * 0.9, 0.25 + el * 1.1, -0.35 + Math.sin(az) * 0.2).normalize();
  sun.position.copy(target).addScaledVector(sd, 110); sun.target.position.copy(target);
  moon.position.copy(target).add(new THREE.Vector3(-40, 80, 30)); moon.target.position.copy(target);
  const day = sky.day * (1 - overcast * 0.5);
  sun.intensity = inCave ? 0 : 1.55 * day;
  tmpC.setRGB(1, 0.95 - sky.dusk * 0.25, 0.86 - sky.dusk * 0.4); sun.color.copy(tmpC);
  sun.castShadow = day > 0.05 && !inCave;
  moon.intensity = inCave ? 0 : 0.55 * sky.night;
  hemi.intensity = inCave ? 0.05 : 0.5 + 1.0 * sky.day + 0.35 * sky.night;
  hemi.color.setRGB(sky.amb[0], sky.amb[1], sky.amb[2] * 1.02);
  hemi.groundColor.setRGB(0.42 * sky.amb[0], 0.5 * sky.amb[1], 0.36 * sky.amb[2]);
  // fog & background
  tmpC.copy(FOG_DAY).lerp(FOG_DUSK, sky.dusk * 0.8).lerp(FOG_NIGHT, sky.night).lerp(FOG_GREY, overcast * 0.6);
  if (inCave) tmpC.setRGB(0.01, 0.01, 0.015);
  scene.fog.color.copy(tmpC);
  scene.background = scene.fog.color;
  if (waterU) {
    waterU.uLight.value.set(sky.amb[0], sky.amb[1], sky.amb[2]).multiplyScalar(0.55 + 0.45 * sky.day).addScalar(0.04 * sky.night);
    waterU.uSunDir.value.copy(sd); waterU.uDay.value = day; waterU.uSunCol.value.copy(sun.color);
  }
  return sky;
}

// ---------------- frame ----------------
const camTarget = new THREE.Vector3();
function placeCamera(cx, cy, zr, map, pitch = 0.92, yaw = 0) {
  const base = map === 'cave' ? caveS.heightAt(cx, cy) : groundY(cx, cy);
  camTarget.set(cx * XS, Math.max(0, base) + 1.2, cy * XS);
  const D = 44 / zr * userZoom;
  camera.position.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * D, camTarget.y + Math.sin(pitch) * D, camTarget.z + Math.cos(yaw) * Math.cos(pitch) * D);
  camera.lookAt(camTarget);
  camera.far = Math.max(400, D * 6); camera.updateProjectionMatrix();
  scene.fog.near = D * 2.6; scene.fog.far = D * 9 + 120;
}

R.frame = function (G, dt) {
  const S = G.state;
  lightU.uTime.value = G.clock; lightU.uWind.value = G.wind;
  const inCave = S.map === 'cave';
  outside.visible = !inCave; caveS.group.visible = inCave;
  const cb = S.campBag;
  G.bagDown = !!(cb && cb.map === S.map && !inCave && Math.hypot(S.player.x - cb.x, S.player.y - cb.y) < 75);
  const zr = G.cam.zoom / R.baseZoom;
  placeCamera(G.cam.x, G.cam.y, zr, S.map);
  G.view = { x0: G.cam.x - 700 / zr, x1: G.cam.x + 700 / zr, y0: G.cam.y - 450 / zr, y1: G.cam.y + 450 / zr };
  const sky = lightsFor(S.time, G.overcast, camTarget, inCave);
  G.sky = sky;
  if (!inCave) {
    water.position.y = (G.tide + 2.2) * HS;
    waterU.uTime.value = G.clock; waterU.uTide.value = G.tide;
    R.world3d.update(G, dt, sky);
  } else caveS.update(G, dt, sky);
  actors.update(G, dt, sky, inCave ? caveS : null);
  updateParticles(dt, S.map);
  if (points.parent !== scene) scene.add(points);
  // where the castaway is on screen (foliage in front of them turns see-through)
  const p = S.player, ph = (inCave ? caveS.heightAt(p.x, p.y) : groundY(p.x, p.y)) + 1.1;
  V.set(p.x * XS, ph, p.y * XS).project(camera);
  const pr = renderer.getPixelRatio();
  lightU.uPS.value.set((V.x * 0.5 + 0.5) * innerWidth * pr, (V.y * 0.5 + 0.5) * innerHeight * pr, 95 * pr * zr / userZoom);
  lightU.uPZ.value = V.z * 0.5 + 0.5;
  renderer.render(scene, camera);
  overlay(G, sky, dt);
};

// title: a slow orbit around the island at golden morning light
R.titleFrame = function (dt) {
  titleT += dt;
  lightU.uTime.value = titleT; lightU.uWind.value = 0.7;
  outside.visible = true; caveS.group.visible = false;
  const a = -0.5 + Math.sin(titleT * 0.05) * 0.5;
  const c = new THREE.Vector3(1250 * XS, 2, 1150 * XS);
  camera.position.set(c.x + Math.sin(a) * 120, 70, c.z + Math.cos(a) * 120);
  camera.lookAt(c.x, 0, c.z - 10);
  camera.far = 900; camera.updateProjectionMatrix();
  scene.fog.near = 260; scene.fog.far = 760;
  lightsFor(7.9, 0, c, false);
  const tide = I.game.tideAt(9);
  water.position.y = (tide + 2.2) * HS;
  waterU.uTime.value = titleT; waterU.uTide.value = tide;
  R.world3d.update(null, dt, null);
  lightU.uPS.value.set(0, 0, 0);
  actors.titlePose(titleT);
  renderer.render(scene, camera);
  fxc.clearRect(0, 0, fx.width, fx.height);
};
I.title = {
  on: false,
  init() {}, resize() {},
  show() { this.on = true; document.getElementById('titleCv').style.display = 'none'; },
  hide() { this.on = false; },
};

function overlay(G, sky, dt) {
  const W = fx.width, H = fx.height, x = fxc;
  x.clearRect(0, 0, W, H);
  if (G.rain > 0.01 && G.state.map === 'out') {
    x.strokeStyle = `rgba(220,232,245,${0.4 * G.rain})`; x.lineWidth = 1;
    x.beginPath();
    const n = Math.floor(220 * G.rain), tt = G.clock;
    for (let k = 0; k < n; k++) {
      const sx = ((k * 9301 + 49297) % 233280) / 233280, sy = ((k * 4271 + 1231) % 9973) / 9973;
      const px = (sx * W + tt * 90) % W, py = (sy * H + tt * 450 * (0.8 + sx * 0.4)) % H;
      x.moveTo(px, py); x.lineTo(px - 2, py + 8);
    }
    x.stroke();
  }
  const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,25,40,${0.18 + sky.night * 0.25 + G.hurt * 0.4})`);
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  if (G.hurt > 0.01) { x.fillStyle = `rgba(120,20,10,${0.12 * G.hurt * (0.6 + 0.4 * Math.sin(G.clock * 3))})`; x.fillRect(0, 0, W, H); }
  if (G.fade > 0) { x.fillStyle = `rgba(${G.fadeCol || '0,0,0'},${I.clamp(G.fade, 0, 1)})`; x.fillRect(0, 0, W, H); }
}
