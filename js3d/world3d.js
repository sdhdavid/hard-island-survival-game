// ------------------------------------------------------------
//  The island in 3D: terraced terrain, sea, stream, Kenney models
// ------------------------------------------------------------
import * as THREE from 'three';

export const XS = 0.1;   // world units -> metres (horizontal)
export const HS = 0.075; // height units -> metres
const MS = 6;            // terrain mesh spacing (world units)
let MW, MH, VG;          // visual height grid (height units)

// terraces: flat grass levels separated by earth walls (like a diorama)
const TH = [11.5, 26, 42, 60, 80], WALL = 9, SLOPE = 0.3;
const LV = [];
{ let acc = TH[0] + WALL; for (let t = 0; t < TH.length; t++) { LV.push(acc); if (t < TH.length - 1) acc += (TH[t + 1] - TH[t]) * SLOPE + WALL; } }
function terrace(h) {
  if (h < TH[0]) return h;
  let t = 0; while (t < TH.length - 1 && h > TH[t + 1]) t++;
  return LV[t] + (h - TH[t]) * SLOPE;
}

export function groundH(x, y) {
  const fx = I.clamp(x / MS, 0, MW - 1.001), fy = I.clamp(y / MS, 0, MH - 1.001);
  const gx = fx | 0, gy = fy | 0, tx = fx - gx, ty = fy - gy, i = gy * MW + gx;
  const a = VG[i], b = VG[i + 1], c = VG[i + MW], d = VG[i + MW + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export const groundY = (x, y) => groundH(x, y) * HS;

function buildVisGrid() {
  const w = I.world;
  MW = Math.floor(w.W / MS) + 1; MH = Math.floor(w.H / MS) + 1;
  const V = new Float32Array(MW * MH), ramp = new Float32Array(MW * MH);
  for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) {
    const x = gx * MS, y = gy * MS, i = gy * MW + gx;
    const h = w.hAt(x, y);
    const he = h + I.fbm(x / 230 + 11, y / 230, 2) * 5;
    V[i] = he < TH[0] ? h : terrace(he);
    ramp[i] = Math.max(I.smooth(22, 7, w.pathAt(x, y)), I.smooth(24, 8, w.streamAt(x, y)));
  }
  // paths and the stream cut gentle ramps through the walls
  let B = V.slice();
  for (let pass = 0; pass < 3; pass++) {
    const N = new Float32Array(B.length);
    for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) {
      let s = 0, n = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const x = gx + ox, y = gy + oy; if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        s += B[y * MW + x]; n++;
      }
      N[gy * MW + gx] = s / n;
    }
    B = N;
  }
  VG = new Float32Array(MW * MH);
  for (let i = 0; i < VG.length; i++) VG[i] = I.lerp(V[i], B[i], ramp[i]);
}

// ---------------- shared shader bits ----------------
export const NOISE_GLSL = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }`;

// gentle wind sway for instanced foliage (also applied to the shadow pass)
export function addWind(mat, U, amp, localH, seeThrough) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    if (seeThrough) {
      // foliage between the camera and the castaway dissolves into a dither so they stay visible
      sh.uniforms.uPS = U.uPS; sh.uniforms.uPZ = U.uPZ;
      sh.fragmentShader = 'uniform vec3 uPS; uniform float uPZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {
        if (uPS.z > 0. && gl_FragCoord.z < uPZ - 0.002) {
          vec2 dd = gl_FragCoord.xy - uPS.xy;
          if (dot(dd, dd) < uPS.z * uPS.z && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
        }`);
    }
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.);
      #endif
      float hk = clamp(position.y / ${localH.toFixed(3)}, 0., 1.5);
      float ph = uTime * 1.3 + ip.x * 0.35 + ip.z * 0.27;
      float sw = (sin(ph) + 0.35 * sin(ph * 2.3 + 1.7)) * hk * hk * ${amp.toFixed(4)} * (0.4 + uWind);
      transformed.x += sw; transformed.z += sw * 0.45;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp.toFixed(4) + localH.toFixed(3) + (seeThrough ? 's' : '');
  return mat;
}

// ---------------- models ----------------
const matCache = new Map();
// Kenney's nature kit is turquoise by design; this island wants warm greens
const RECOLOR = { leafsGreen: '#5cad48', leafsDark: '#3f8b45', grass: '#78bf55', woodBark: '#93643f', woodInner: '#e6c79a', dirt: '#b99a78', stone: '#c9c3b8' };
function lambert(m) {
  if (matCache.has(m.uuid)) return matCache.get(m.uuid);
  const col = RECOLOR[m.name] ? new THREE.Color(RECOLOR[m.name]) : m.color;
  const l = new THREE.MeshLambertMaterial({ color: col, map: m.map || null, transparent: m.transparent, alphaTest: m.alphaTest || 0, side: m.side, vertexColors: !!m.vertexColors });
  l.name = m.name;
  matCache.set(m.uuid, l);
  return l;
}
export async function loadModel(loader, url) {
  const g = await loader.loadAsync(url);
  const root = g.scene;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    parts.push({ geo, mat: lambert(o.material), name: o.material.name });
  });
  const box = new THREE.Box3();
  parts.forEach(p => { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); });
  const size = box.getSize(new THREE.Vector3());
  // the crown: centroid of the highest vertices (where coconuts hang)
  let top = new THREE.Vector3(), n = 0;
  parts.forEach(p => {
    const a = p.geo.attributes.position;
    for (let i = 0; i < a.count; i++) if (a.getY(i) > box.max.y - size.y * 0.12) { top.x += a.getX(i); top.y += a.getY(i); top.z += a.getZ(i); n++; }
  });
  if (n) top.multiplyScalar(1 / n);
  return { parts, box, size, top, anims: g.animations, scene: g.scene };
}

// a set of instances of one model (one InstancedMesh per material part)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export class Batch {
  constructor(model, opts = {}) { this.model = model; this.items = []; this.opts = opts; }
  add(m, ref) { this.items.push({ m, ref, vis: true }); return this.items.length - 1; }
  build(parent, U) {
    const { model, opts } = this;
    this.meshes = model.parts.map(p => {
      let mat = p.mat;
      if (opts.tint) { mat = mat.clone(); mat.color = mat.color.clone().multiply(opts.tint); }
      if (opts.wind) { mat = addWind(mat.clone(), U, opts.wind * model.size.y, model.size.y, model.size.y > 0.8 || opts.see); }
      const im = new THREE.InstancedMesh(p.geo, mat, Math.max(1, this.items.length));
      im.count = this.items.length;
      this.items.forEach((it, k) => im.setMatrixAt(k, it.m));
      im.castShadow = opts.shadow !== false; im.receiveShadow = true;
      if (opts.wind) {
        const dm = addWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), U, opts.wind * model.size.y, model.size.y);
        im.customDepthMaterial = dm;
      }
      im.computeBoundingSphere();
      parent.add(im);
      return im;
    });
    return this;
  }
  setVisible(k, v) {
    const it = this.items[k];
    if (it.vis === v) return;
    it.vis = v;
    this.meshes.forEach(im => { im.setMatrixAt(k, v ? it.m : ZERO); im.instanceMatrix.needsUpdate = true; });
  }
}
// matrix for a model so that it stands at world (x,y) with a target size
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function placeM(model, x, y, opt = {}) {
  const sz = model.size;
  let k = opt.h ? opt.h / sz.y : opt.len ? opt.len / Math.max(sz.x, sz.z) : opt.scale || 1;
  _e.set(opt.rx || 0, opt.yaw || 0, opt.rz || 0);
  _q.setFromEuler(_e);
  _s.set(k * (opt.sx || 1), k * (opt.sy || 1), k * (opt.sz || 1));
  _p.set(x * XS, (opt.y !== undefined ? opt.y : groundY(x, y)) + (opt.dy || 0), y * XS);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// ---------------- ground texture ----------------
function paintGround() {
  const w = I.world, { GW, GH, CELL } = w;
  const TW = 1200, THh = 1100, sc = TW / w.W;
  const cv = document.createElement('canvas'); cv.width = TW; cv.height = THh;
  const x = cv.getContext('2d');
  const img = x.createImageData(TW, THh), d = img.data;
  const C = I.terrain.C || {};
  const sand = [243, 226, 176], sandWet = [222, 200, 148], under = [214, 200, 150], deep = [80, 150, 160];
  const grass = [138, 200, 90], grass2 = [154, 210, 102], forest = [112, 178, 76], dry = [196, 206, 118], rock = [214, 206, 190], rock2 = [186, 178, 162], algae = [96, 122, 58], wetRock = [150, 142, 128];
  for (let py = 0; py < THh; py++) for (let px = 0; px < TW; px++) {
    const wx = (px + 0.5) / sc, wy = (py + 0.5) / sc;
    const i = w.idx(wx, wy), v = w.hAt(wx, wy), m = w.mat[i];
    const n1 = I.fbm(wx / 320, wy / 320, 2);
    let c;
    if (m === 0) {
      c = I.mix3(sandWet, sand, I.smooth(1, 7, v));
      if (v < 0) c = I.mix3(under, deep, I.smooth(-1, -26, v));
    } else if (m === 3) {
      c = I.mix3(rock, rock2, I.clamp(0.5 + n1 * 1.2, 0, 1));
      if (v < 6.4 && v > 2.2) c = I.mix3(c, algae, 0.8 * I.smooth(2.2, 3.2, v) * I.smooth(6.4, 5.6, v));
      if (v <= 2.6 && v > -6) c = I.mix3(c, wetRock, 0.7);
      if (v < -6) c = I.mix3(c, deep, I.smooth(-6, -24, v));
    } else if (m === 4) c = I.mix3(dry, grass, I.clamp(0.45 + n1, 0, 1) * 0.6);
    else {
      c = I.mix3(grass, grass2, I.clamp(0.5 + n1 * 1.4, 0, 1));
      c = I.mix3(c, forest, I.smooth(0.3, 0.8, w.forest[i]) * 0.75);
      if (v > 56) c = I.mix3(c, dry, I.smooth(56, 76, v) * 0.45);
      if (v < 14) c = I.mix3(c, sand, I.smooth(14, 11.5, v + I.fbm(wx / 40, wy / 40) * 2) * 0.9);
    }
    const o = (py * TW + px) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.scale(sc, sc);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const R = I.rng(99);
  const stroke = (pts, wdt, col) => { x.strokeStyle = col; x.lineWidth = wdt; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts) x.lineTo(p[0], p[1]); x.stroke(); };
  // wrack line at the high-water mark
  for (let k = 0; k < 2200; k++) {
    const px = 400 + R() * 1700, py = 1300 + R() * 520, v = w.hAt(px, py);
    if (w.matAt(px, py) !== 0 || v < 5.6 || v > 6.6) continue;
    x.fillStyle = R() < 0.5 ? 'rgba(120,128,72,0.6)' : 'rgba(150,130,84,0.55)';
    x.beginPath(); x.ellipse(px, py, 3 + R() * 3, 1.4, R() * 3, 0, I.TAU); x.fill();
  }
  // stream bed
  let S = w.STREAM; { let e = S.length; while (e > 2 && w.hAt(S[e - 1][0], S[e - 1][1]) < 2) e--; S = S.slice(0, e); }
  stroke(S, 30, 'rgba(110,168,86,0.5)'); stroke(S, 20, '#d6c496'); stroke(S, 14, '#b4a27a');
  // spring basin
  const SP = w.SPRING;
  x.fillStyle = '#9c8a64'; x.beginPath(); x.ellipse(SP.x, SP.y, 37, 28, 0.2, 0, I.TAU); x.fill();
  // paths
  w.PATHS.forEach(pts => { stroke(pts, 18, 'rgba(160,130,86,0.3)'); stroke(pts, 14, '#e2cd9b'); stroke(pts, 6, 'rgba(246,234,200,0.8)'); });
  [[w.CAMP.x, w.CAMP.y, 62], [w.HUT.x, w.HUT.y + 20, 58]].forEach(c => {
    const g = x.createRadialGradient(c[0], c[1], 0, c[0], c[1], c[2]);
    g.addColorStop(0, 'rgba(226,205,158,0.95)'); g.addColorStop(0.6, 'rgba(226,205,158,0.55)'); g.addColorStop(1, 'rgba(226,205,158,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c[0], c[1], c[2], 0, I.TAU); x.fill();
  });
  // sand ripples and shells
  for (let k = 0; k < 1500; k++) {
    const px = 380 + R() * 1750, py = 300 + R() * 1520, v = w.hAt(px, py);
    if (w.matAt(px, py) !== 0 || v < 0.5 || v > 11) continue;
    if (R() < 0.75) { x.strokeStyle = 'rgba(255,250,232,0.5)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px - 8, py); x.quadraticCurveTo(px, py - 3 + R() * 6, px + 8, py); x.stroke(); }
    else { x.fillStyle = ['#fffaf0', '#f7d9c8', '#f2c6b4'][Math.floor(R() * 3)]; x.beginPath(); x.ellipse(px, py, 2.4, 1.8, R() * 3, 0, I.TAU); x.fill(); }
  }
  // crab holes, pool algae
  w.crabHoles.forEach(p => { x.fillStyle = 'rgba(120,96,60,0.85)'; x.beginPath(); x.ellipse(p[0], p[1], 3, 2.2, 0, 0, I.TAU); x.fill(); });
  for (let k = 0; k < 900; k++) {
    const a = R() * I.TAU, rr = 54 + R() * 26, px = w.POOL.x + Math.cos(a) * rr, py = w.POOL.y + Math.sin(a) * rr, v = w.hAt(px, py);
    if (v < 3.6 || v > 6.4) continue;
    x.fillStyle = 'rgba(70,98,44,0.8)'; x.beginPath(); x.ellipse(px, py, 2.4, 1.3, a + 1.57, 0, I.TAU); x.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------- terrain mesh ----------------
function terrainMesh(U) {
  const w = I.world;
  const pos = new Float32Array(MW * MH * 3), uv = new Float32Array(MW * MH * 2), wall = new Float32Array(MW * MH * 3);
  for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) {
    const i = gy * MW + gx, x = gx * MS, y = gy * MS;
    pos[i * 3] = x * XS; pos[i * 3 + 1] = VG[i] * HS; pos[i * 3 + 2] = y * XS;
    uv[i * 2] = x / w.W; uv[i * 2 + 1] = 1 - y / w.H;
    const rock = w.matAt(x, y) === 3 || w.matAt(x, y + 8) === 3;
    const c = rock ? [0.66, 0.62, 0.56] : [0.66, 0.4, 0.22];
    wall[i * 3] = c[0]; wall[i * 3 + 1] = c[1]; wall[i * 3 + 2] = c[2];
  }
  const idx = [];
  for (let gy = 0; gy < MH - 1; gy++) for (let gx = 0; gx < MW - 1; gx++) {
    const a = gy * MW + gx, b = a + 1, c = a + MW, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aWall', new THREE.BufferAttribute(wall, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: paintGround() });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'attribute vec3 aWall; varying vec3 vWall; varying vec3 vWp; varying float vSteep;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWall = aWall; vWp = (modelMatrix * vec4(position, 1.)).xyz; vSteep = 1. - normal.y;`);
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWall; varying vec3 vWp; varying float vSteep;\n' + NOISE_GLSL + '\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float wf = smoothstep(0.3, 0.52, vSteep);
      float strata = 0.86 + 0.14 * step(0.5, fract(vWp.y * 1.4 + vnoise(vWp.xz * 0.4) * 0.6));
      vec3 wc = pow(vWall * strata, vec3(2.2));
      diffuseColor.rgb = mix(diffuseColor.rgb, wc, wf);
      // a grass lip curling over the top of each wall
      float lip = smoothstep(0.22, 0.3, vSteep) * (1. - smoothstep(0.3, 0.4, vSteep));
      diffuseColor.rgb = mix(diffuseColor.rgb, pow(vec3(0.42, 0.66, 0.27), vec3(2.2)), lip * 0.6 * step(0.5, vWall.g));
      // drifting cloud shadows
      float cl = vnoise(vWp.xz * 0.016 + vec2(uTime * 0.012, uTime * 0.004));
      diffuseColor.rgb *= 1. - 0.12 * smoothstep(0.55, 0.8, cl);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------- sea ----------------
function seaMesh() {
  const w = I.world, { GW, GH } = w;
  const data = new Uint8Array(GW * GH * 4);
  let pmin = 1e9, pmax = -1e9;
  for (let i = 0; i < GW * GH; i++) { pmin = Math.min(pmin, w.phase[i]); pmax = Math.max(pmax, w.phase[i]); }
  for (let i = 0; i < GW * GH; i++) {
    const v = I.clamp(Math.round((w.h[i] + 50) / 100 * 65535), 0, 65535);
    data[i * 4] = v >> 8; data[i * 4 + 1] = v & 255;
    data[i * 4 + 2] = Math.round(w.expo[i] * 255);
    data[i * 4 + 3] = Math.round((w.phase[i] - pmin) / (pmax - pmin) * 255);
  }
  const tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uData: { value: null }, uSize: { value: new THREE.Vector2(w.W, w.H) }, uXS: { value: XS }, uTime: { value: 0 }, uTide: { value: 0 },
    uPhMin: { value: pmin }, uPhR: { value: pmax - pmin }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) }, uDay: { value: 1 },
  }]);
  U.uData.value = tex;
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uData; uniform vec2 uSize; uniform float uXS, uTime, uTide, uPhMin, uPhR, uDay; uniform vec3 uLight, uSunDir, uSunCol;
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      vec3 dcol(float d){
        vec3 c0=vec3(.89,.98,.95), c1=vec3(.66,.925,.886), c2=vec3(.41,.84,.84), c3=vec3(.24,.73,.815), c4=vec3(.17,.6,.776), c5=vec3(.13,.47,.70);
        if(d<1.2) return mix(c0,c1,d/1.2); if(d<3.5) return mix(c1,c2,(d-1.2)/2.3); if(d<8.) return mix(c2,c3,(d-3.5)/4.5);
        if(d<16.) return mix(c3,c4,(d-8.)/8.); return mix(c4,c5,clamp((d-16.)/16.,0.,1.)); }
      float dalpha(float d){
        if(d<1.2) return mix(.25,.45,d/1.2); if(d<3.5) return mix(.45,.66,(d-1.2)/2.3); if(d<8.) return mix(.66,.86,(d-3.5)/4.5);
        if(d<16.) return mix(.86,.96,(d-8.)/8.); return mix(.96,1.,clamp((d-16.)/16.,0.,1.)); }
      void main(){
        vec2 wp = vW.xz / uXS;
        vec4 t = texture2D(uData, wp / uSize);
        float h = (t.r * 255. * 256. + t.g * 255.) / 65535. * 100. - 50.;
        float expo = t.b, ph = t.a * uPhR + uPhMin;
        float s = .5 + .5 * sin(uTime * .85 + ph);
        float depth = uTide + expo * 2.1 * s * s * s - h;
        vec3 col; float a;
        float n1 = vnoise(wp * .045 + vec2(uTime * .15, uTime * .07)), n2 = vnoise(wp * .077 - vec2(uTime * .11, -uTime * .09));
        if (depth < 0.) {
          float fr = 1. + depth / 1.1;
          if (fr > 0.) { col = vec3(.97, .99, .98); a = fr * fr * (.5 + .35 * expo); }
          else {
            float reach = uTide + 2.2 * expo;
            float wet = smoothstep(reach + .3, reach - 1.6, h) * step(h, 12.);
            if (wet < .01) discard;
            col = vec3(.36, .27, .16); a = wet * .16;
          }
        } else {
          col = dcol(depth); a = dalpha(depth);
          float c = 1. - abs(n1 + n2 - 1.); c = pow(c, 6.);
          float shal = 1. - clamp(depth / 10., 0., 1.);
          col += c * (.05 + .08 * shal);
          float foam = 0.;
          if (depth < 6.) { float cr = sin(depth * 1.05 + uTime * 1.7 + ph * .6); if (cr > .84) foam = (cr - .84) * 3.2 * (1. - depth / 6.) * (.3 + .7 * expo); }
          if (depth > .8 && depth < 15.) {
            float q = depth * .34 - uTime * .12 + ph * .03;
            float tri = abs(fract(q) - .5) * 2.;
            float fw = fwidth(q) * 2.5 + .06;
            foam = max(foam, smoothstep(1. - fw, 1. - fw * .25, tri) * (1. - depth / 15.) * .65);
          }
          if (depth < 1.6) { float e = 1. - depth / 1.6; foam = max(foam, e * e * (.55 + .45 * expo) * (.7 + .3 * n1)); }
          foam = clamp(foam, 0., 1.);
          col = mix(col, vec3(1.), foam); a = mix(a, .96, foam);
          vec3 nrm = normalize(vec3((n1 - .5) * .3, 1., (n2 - .5) * .3));
          vec3 vd = normalize(cameraPosition - vW);
          float sp = pow(max(dot(reflect(-uSunDir, nrm), vd), 0.), 80.) * uDay;
          col += sp * .7 * uSunCol;
        }
        col = pow(col, vec3(2.2)) * uLight;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(w.W * XS + 900, w.H * XS + 900, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(w.W * XS / 2, 0, w.H * XS / 2);
  mesh.renderOrder = 2;
  return { mesh, U };
}

// ---------------- stream & spring ----------------
function streamMesh(U) {
  const w = I.world;
  let S = w.STREAM; { let e = S.length; while (e > 2 && w.hAt(S[e - 1][0], S[e - 1][1]) < 1.5) e--; S = S.slice(0, e); }
  const pos = [], uv = [], idx = [];
  let L = 0;
  for (let k = 0; k < S.length; k++) {
    const p = S[k], q = S[Math.min(S.length - 1, k + 1)], o = S[Math.max(0, k - 1)];
    let nx = -(q[1] - o[1]), ny = q[0] - o[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (k) L += Math.hypot(p[0] - S[k - 1][0], p[1] - S[k - 1][1]);
    const half = 6.5;
    for (const sgn of [-1, 1]) {
      const x = p[0] + nx * half * sgn, y = p[1] + ny * half * sgn;
      pos.push(x * XS, Math.min(groundY(x, y), groundY(p[0], p[1])) + 0.07, y * XS);
      uv.push(L * 0.05, sgn < 0 ? 0 : 1);
    }
    if (k < S.length - 1) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const SU = { uTime: U.uTime, uLight: { value: new THREE.Vector3(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uTime; uniform vec3 uLight; varying vec2 vUv; ${NOISE_GLSL}
      void main(){
        float edge = smoothstep(0., .25, vUv.y) * smoothstep(1., .75, vUv.y);
        float f = vnoise(vec2(vUv.x * 3. - uTime * 1.6, vUv.y * 4.)) + vnoise(vec2(vUv.x * 7. - uTime * 2.4, vUv.y * 9. + 3.)) * .5;
        vec3 col = mix(vec3(.33, .72, .76), vec3(.55, .86, .86), edge);
        col = mix(col, vec3(1.), smoothstep(1.05, 1.35, f) * .8);
        gl_FragColor = vec4(pow(col, vec3(2.2)) * uLight, .85 * (.35 + .65 * edge));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  // spring pond
  const SP = w.SPRING;
  const pg = new THREE.CircleGeometry(1, 40); pg.rotateX(-Math.PI / 2); pg.scale(3.1, 1, 2.2);
  const pm = new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uTime; uniform vec3 uLight; varying vec2 vP;
      void main(){
        float r = length(vP / vec2(3.1, 2.2));
        vec3 col = mix(vec3(.36, .74, .74), vec3(.2, .52, .58), r);
        float ring = 0.;
        for (int k = 0; k < 3; k++) { float ph = fract(uTime * .3 + float(k) / 3.); ring += smoothstep(.04, 0., abs(r - ph)) * (1. - ph); }
        col = mix(col, vec3(1.), ring * .5 + smoothstep(.85, 1., r) * .5);
        gl_FragColor = vec4(pow(col, vec3(2.2)) * uLight, .92);
        #include <colorspace_fragment>
      }`,
  });
  const pond = new THREE.Mesh(pg, pm);
  pond.position.set(SP.x * XS, groundY(SP.x, SP.y) + 0.12, SP.y * XS);
  pond.rotation.y = -0.2;
  return { mesh, pond, SU };
}

// ---------------- catalogue of Kenney models ----------------
const K = 'assets/models/kenney/';
const CAT = {
  tree: ['nature/tree_default', 'nature/tree_oak', 'nature/tree_detailed', 'nature/tree_fat', 'nature/tree_default_dark', 'nature/tree_oak_dark'],
  palm: ['pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-detailed-bend'],
  bush: ['nature/plant_bush', 'nature/plant_bushLarge', 'nature/plant_bushDetailed'],
  berry: ['nature/plant_bushDetailed'],
  rock: ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_largeC', 'nature/rock_largeD', 'nature/rock_largeE', 'nature/rock_largeF'],
  stoneRock: ['nature/stone_largeA', 'nature/stone_largeB', 'nature/stone_largeC', 'pirate/rocks-sand-a', 'pirate/rocks-sand-b', 'pirate/rocks-sand-c'],
  fern: ['nature/plant_flatTall', 'nature/plant_flatShort', 'nature/grass_leafs'],
  grass: ['nature/grass', 'nature/grass_large', 'nature/grass_leafsLarge'],
  flower: ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/flower_yellowB'],
  stone: ['nature/stone_smallA', 'nature/stone_smallB', 'nature/stone_smallC', 'nature/stone_smallD', 'nature/stone_smallE', 'nature/stone_smallF'],
  flat: ['nature/stone_smallFlatA', 'nature/stone_smallFlatB', 'nature/stone_smallFlatC'],
  one: ['nature/tree_pineDefaultA', 'nature/log', 'nature/log_large', 'nature/stump_oldTall', 'nature/sign', 'nature/lily_large', 'nature/lily_small', 'nature/mushroom_redGroup',
    'nature/cliff_cave_rock', 'nature/campfire_logs', 'survival/campfire-pit', 'survival/tent-canvas-half', 'survival/chest', 'survival/campfire-fishing-stand', 'survival/resource-planks',
    'survival/structure-metal-doorway', 'survival/structure-metal-roof', 'survival/signpost-single', 'survival/box-open', 'pirate/crate', 'watercraft/buoy', 'watercraft/boat-fishing-small',
    'watercraft/boat-speed-a', 'survival/bedroll-packed', 'survival/barrel', 'survival/resource-wood', 'nature/tree_palmBend'],
};
export const M = {};
async function loadAll(loader, progress) {
  const all = new Set();
  Object.values(CAT).forEach(l => l.forEach(n => all.add(n)));
  const list = [...all];
  let done = 0;
  await Promise.all(list.map(async n => {
    M[n] = await loadModel(loader, K + n + '.glb');
    done++; progress && progress(done / list.length * 0.7);
  }));
}

// ---------------- radio tower (built from beams) ----------------
function towerMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xb9c0c4 });
  const red = new THREE.MeshLambertMaterial({ color: 0xd2453a }), white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
  const H = 16, B = 1.3, T = 0.25;
  const beam = (a, b, r) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true; g.add(m);
  };
  const corner = (k, y) => { const w = I.lerp(B, T, y / H), a = k * Math.PI / 2 + Math.PI / 4; return new THREE.Vector3(Math.cos(a) * w, y, Math.sin(a) * w); };
  for (let k = 0; k < 4; k++) beam(corner(k, 0), corner(k, H), 0.07);
  for (let y = 0; y < H - 1; y += 1.6) for (let k = 0; k < 4; k++) {
    beam(corner(k, y), corner((k + 1) % 4, y + 1.6), 0.035);
    beam(corner(k, y), corner((k + 1) % 4, y), 0.035);
  }
  const band = (y, m) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 8), m); b.position.y = y; b.castShadow = true; g.add(b); };
  band(H - 3, red); band(H - 2.3, white); band(H - 1.6, red);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), mat); mast.position.y = H + 1.1; g.add(mast);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a1a16 }));
  bulb.position.y = H + 2.35; g.add(bulb);
  g.userData.bulb = bulb; g.userData.top = H + 2.35;
  return g;
}

function hutMesh() {
  const g = new THREE.Group();
  const W = 6.4, D = 4.4, Hh = 2.7;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 128; i += 8) { x.fillStyle = '#aab4b8'; x.fillRect(i, 0, 5, 64); x.fillStyle = '#8f9a9f'; x.fillRect(i + 5, 0, 3, 64); }
  x.fillStyle = 'rgba(150,90,50,.35)'; x.fillRect(0, 52, 128, 12);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const wallM = new THREE.MeshLambertMaterial({ map: tex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), wallM); body.position.y = Hh / 2;
  const roofM = new THREE.MeshLambertMaterial({ color: 0xa8542f });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.18, D + 1.2), roofM);
  roof.position.set(0, Hh + 0.35, 0.1); roof.rotation.x = -0.16;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0x7e3d22 })); ridge.position.set(0, Hh + 0.66, -D / 2 - 0.1);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a4f52 })); door.position.set(-0.6, 1.0, D / 2 + 0.03);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshLambertMaterial({ color: 0xd8c070 })); knob.position.set(-0.2, 1.0, D / 2 + 0.09);
  const winM = new THREE.MeshLambertMaterial({ color: 0x2c3a46, emissive: 0x000000 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.08), winM); win.position.set(1.6, 1.6, D / 2 + 0.03);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: 0xece4cf })); sign.position.set(-2.3, 1.9, D / 2 + 0.04);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.8), new THREE.MeshLambertMaterial({ color: 0x9c938a })); step.position.set(-0.6, 0.1, D / 2 + 0.4);
  [body, roof, ridge, door, knob, win, sign, step].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
  g.userData.window = winM;
  return g;
}

// ---------------- build ----------------
export async function buildWorld(loader, U, progress) {
  const w = I.world;
  buildVisGrid();
  const group = new THREE.Group();
  const terrain = terrainMesh(U);
  group.add(terrain);
  progress && progress(0.1);
  const sea = seaMesh();
  group.add(sea.mesh);
  const st = streamMesh(U);
  group.add(st.mesh, st.pond);
  await loadAll(loader, v => progress && progress(0.1 + v));
  const R = I.rng(808);
  const pick = (list, s) => M[list[Math.floor(Math.abs(s)) % list.length]];
  const batches = new Map();
  const batch = (model, opts, key) => {
    const k = key || model.parts[0].geo.uuid + JSON.stringify(opts);
    if (!batches.has(k)) batches.set(k, new Batch(model, opts));
    return batches.get(k);
  };
  const dyn = []; // dynamic instances that hide when taken / used up
  const rockish = (x, y) => w.matAt(x, y) === 3 || w.matAt(x, y) === 0;
  for (const o of w.objs) {
    const s = o.seed || (o.x * 7.31 + o.y * 3.17);
    const yaw = (s * 2.39) % I.TAU;
    switch (o.type) {
      case 'tree': { const m = pick(CAT.tree, s); batch(m, { wind: 0.04, see: true }).add(placeM(m, o.x, o.y, { h: 2.9 + o.size * 0.07, yaw })); break; }
      case 'fig': { const m = M['nature/tree_fat']; batch(m, { wind: 0.03, see: true }).add(placeM(m, o.x, o.y, { h: 10, yaw: 0.6 })); break; }
      case 'palm': {
        const m = pick(CAT.palm, s);
        const mx = placeM(m, o.x, o.y, { h: 4.4 + o.hgt * 0.04, yaw });
        batch(m, { wind: 0.05, see: true }).add(mx);
        o._crown = m.top.clone().applyMatrix4(mx);
        break;
      }
      case 'bush': { const m = pick(CAT.bush, s); batch(m, { wind: 0.05 }).add(placeM(m, o.x, o.y, { h: 0.6 + o.size * 0.06, yaw })); break; }
      case 'berry': { const m = M['nature/plant_bushDetailed']; batch(m, { wind: 0.05, tint: new THREE.Color(0.9, 1, 0.9) }).add(placeM(m, o.x, o.y, { h: 1.6, yaw })); break; }
      case 'rock': { const m = rockish(o.x, o.y) ? pick(CAT.stoneRock, s) : pick(CAT.rock, s); batch(m, {}).add(placeM(m, o.x, o.y, { len: o.size * 0.16, yaw, dy: -0.15 })); break; }
      case 'fern': { const m = pick(CAT.fern, s); batch(m, { wind: 0.12, shadow: false }).add(placeM(m, o.x, o.y, { h: 0.5 + o.size * 0.05, yaw })); break; }
      case 'grass': case 'dunegrass': {
        const m = pick(CAT.grass, s);
        batch(m, { wind: 0.15, shadow: false, tint: o.type === 'dunegrass' ? new THREE.Color(1.1, 1.05, 0.7) : null }).add(placeM(m, o.x, o.y, { h: 0.35 + o.size * 0.03, yaw }));
        break;
      }
      case 'pine': { const m = M['nature/tree_pineDefaultA']; batch(m, { wind: 0.03, see: true }).add(placeM(m, o.x, o.y, { h: 8.5, yaw })); break; }
      case 'deadtree': { const m = M['nature/stump_oldTall']; batch(m, { tint: new THREE.Color(1.5, 1.45, 1.35) }).add(placeM(m, o.x, o.y, { h: 6.5, yaw: 0.3, sx: 0.7, sz: 0.7 })); break; }
      case 'sign': { const m = M['nature/sign']; batch(m, {}).add(placeM(m, o.x, o.y, { h: 1.7, yaw: 0 })); break; }
      case 'cairn': {
        for (let k = 0; k < 4; k++) {
          const m = pick(CAT.flat, s + k);
          batch(m, {}).add(placeM(m, o.x, o.y, { len: 1.3 - k * 0.22, yaw: yaw + k, y: groundY(o.x, o.y) + k * 0.22 }));
        }
        break;
      }
      case 'drift': case 'branch': {
        const m = M['nature/log'];
        const tint = o.type === 'drift' ? new THREE.Color(1.35, 1.3, 1.2) : null;
        const b = batch(m, { tint }, 'log' + o.type);
        dyn.push({ o, b, k: b.add(placeM(m, o.x, o.y, { len: o.len * 0.09, yaw: o.angle || yaw, sx: o.type === 'drift' ? 1.3 : 0.8, sy: o.type === 'drift' ? 1.3 : 0.8 })) });
        break;
      }
      case 'plank': { const m = M['survival/resource-planks']; const b = batch(m, {}); dyn.push({ o, b, k: b.add(placeM(m, o.x, o.y, { len: 2.2, yaw: o.angle })) }); break; }
      case 'stone': { const m = pick(CAT.stone, s); const b = batch(m, {}); dyn.push({ o, b, k: b.add(placeM(m, o.x, o.y, { len: 0.75, yaw })) }); break; }
      case 'reed': {
        const m = pick(CAT.fern, s);
        batch(m, { wind: 0.14, shadow: false, tint: new THREE.Color(0.85, 1.05, 0.8) }, 'reed').add(placeM(m, o.x, o.y, { h: 1.4, yaw, sx: 0.6, sz: 0.6 }));
        break;
      }
      case 'tarp': { const m = M['survival/tent-canvas-half']; batch(m, {}).add(placeM(m, o.x, o.y + 10, { h: 2.6, yaw: Math.PI })); break; }
      case 'rack': { const m = M['survival/campfire-fishing-stand']; batch(m, {}).add(placeM(m, o.x, o.y, { h: 1.6, yaw: 0.4 })); break; }
      case 'pit': { const m = M['survival/campfire-pit']; batch(m, {}).add(placeM(m, o.x, o.y, { len: 2.2 })); break; }
      case 'campnote': { const m = M['survival/signpost-single']; batch(m, {}).add(placeM(m, o.x, o.y, { h: 1.7, yaw: 0 })); break; }
    }
  }
  // decorative flowers and mushrooms that only exist in 3D
  let fl = 0;
  for (let k = 0; k < 4000 && fl < 420; k++) {
    const x = 420 + R() * 1650, y = 320 + R() * 1450, i = w.idx(x, y);
    if (w.mat[i] !== 1 || w.h[i] < 14 || w.pathD[i] < 12 || w.streamD[i] < 14 || w.forest[i] > 0.6) continue;
    if (I.fbm(x / 140, y / 140) < 0) continue;
    const m = pick(CAT.flower, R() * 10);
    batch(m, { wind: 0.12, shadow: false }).add(placeM(m, x, y, { h: 0.45 + R() * 0.2, yaw: R() * 6 }));
    fl++;
  }
  for (let k = 0; k < 3000 && fl < 470; k++) {
    const x = 420 + R() * 1650, y = 320 + R() * 1450, i = w.idx(x, y);
    if (w.forest[i] < 0.7 || w.pathD[i] < 14) continue;
    const m = M['nature/mushroom_redGroup']; batch(m, { shadow: false }).add(placeM(m, x, y, { h: 0.5, yaw: R() * 6 })); fl++;
  }
  // stones around the spring and lilies on it
  const SP = w.SPRING;
  for (let k = 0; k < 18; k++) { const a = k / 18 * I.TAU, x = SP.x + Math.cos(a) * 37, y = SP.y + Math.sin(a) * 28; const m = pick(CAT.stone, k); batch(m, {}).add(placeM(m, x, y, { len: 1.1, yaw: a })); }
  [[14, 8], [-16, 6], [6, -12]].forEach(([ox, oy], k) => { const m = M[k ? 'nature/lily_small' : 'nature/lily_large']; batch(m, { shadow: false }).add(placeM(m, SP.x + ox, SP.y + oy, { len: 1.2, y: groundY(SP.x, SP.y) + 0.16, yaw: k })); });
  batches.forEach(b => b.build(group, U));
  progress && progress(0.9);

  // ---- single set pieces
  const single = (name, x, y, opt) => {
    const m = M[name], g = new THREE.Group();
    m.parts.forEach(p => { const mesh = new THREE.Mesh(p.geo, p.mat); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); });
    g.applyMatrix4(placeM(m, x, y, opt));
    group.add(g);
    return g;
  };
  const tower = towerMesh();
  tower.position.set(w.TOWER.x * XS, groundY(w.TOWER.x, w.TOWER.y), w.TOWER.y * XS);
  group.add(tower);
  // radio hut: a little corrugated-metal shed with a rusty roof
  const hut = hutMesh();
  hut.position.set(w.HUT.x * XS, groundY(w.HUT.x, w.HUT.y - 12), (w.HUT.y - 14) * XS);
  group.add(hut);
  const cliff = single('nature/cliff_cave_rock', w.MOUTH.x, w.MOUTH.y - 6, { len: 5, yaw: Math.PI, y: groundY(w.MOUTH.x, w.MOUTH.y) - 0.2 });

  const update = (G, dt, sky) => {
    st.SU.uLight.value.copy(waterU.uLight.value);
    if (!G) return;
    const S = G.state;
    for (const d of dyn) {
      const s = S.objState[d.o.id];
      d.b.setVisible(d.k, !(s && s.taken));
    }
  };
  const waterU = sea.U;
  return { group, terrain, water: sea.mesh, waterU, update, single, M, tower, hut, cliff };
}
