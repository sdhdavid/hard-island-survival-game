// ------------------------------------------------------------
//  The tide cave in 3D
// ------------------------------------------------------------
import * as THREE from 'three';
import { XS, M, placeM, NOISE_GLSL } from './world3d.js';

export class CaveScene {
  constructor(U) { this.U = U; this.group = new THREE.Group(); this.group.visible = false; }
  build() {
    const c = I.cave, { GW, GH, CC } = c;
    // distance (in cells) from every wall cell to the nearest floor
    const out = new Float32Array(GW * GH);
    for (let i = 0; i < out.length; i++) out[i] = c.floor[i] ? 0 : 1e9;
    for (let pass = 0; pass < 2; pass++) {
      const ys = pass ? [GH - 1, -1, -1] : [0, GH, 1];
      for (let gy = ys[0]; gy !== ys[1]; gy += ys[2]) for (let k = 0; k < GW; k++) {
        const gx = pass ? GW - 1 - k : k, i = gy * GW + gx; let v = out[i];
        const nb = pass ? [[1, 0, 1], [0, 1, 1], [1, 1, 1.41], [-1, 1, 1.41]] : [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.41], [1, -1, 1.41]];
        for (const [ox, oy, w] of nb) { const x = gx + ox, y = gy + oy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue; v = Math.min(v, out[y * GW + x] + w); }
        out[i] = v;
      }
    }
    const H = this.H = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, x = (gx + 0.5) * CC, y = (gy + 0.5) * CC;
      const n = I.noise(x / 30, y / 30);
      H[i] = c.floor[i] ? 0.04 * n : Math.pow(Math.min(1, out[i] / 5), 0.55) * (4.6 + n * 1.2);
    }
    const pos = new Float32Array(GW * GH * 3), uv = new Float32Array(GW * GH * 2), idx = [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx;
      pos[i * 3] = (gx + 0.5) * CC * XS; pos[i * 3 + 1] = H[i]; pos[i * 3 + 2] = (gy + 0.5) * CC * XS;
      uv[i * 2] = (gx + 0.5) / GW; uv[i * 2 + 1] = 1 - (gy + 0.5) / GH;
      if (gx < GW - 1 && gy < GH - 1) idx.push(i, i + GW, i + 1, i + 1, i + GW, i + GW + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(c.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position;');
      sh.fragmentShader = 'varying vec3 vWp;\n' + NOISE_GLSL + '\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float wf = smoothstep(0.12, 0.9, vWp.y);
        float n = vnoise(vWp.xz * 1.3 + vWp.y * 0.7);
        vec3 rock = mix(vec3(0.33, 0.29, 0.25), vec3(0.47, 0.42, 0.36), n) * (0.85 + 0.15 * step(0.5, fract(vWp.y * 1.8)));
        diffuseColor.rgb = mix(diffuseColor.rgb, pow(rock, vec3(2.2)), wf);`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.pickMesh = this.mesh;
    this.group.add(this.mesh);
    // paintings, revealed by torchlight on the rock
    c.PAINTINGS.forEach(p => {
      const cv = c.paintingCanvas(p.id);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width / 2 * XS, cv.height / 2 * XS), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));
      const northWall = !c.floorAt(p.x, p.y - 26);
      m.position.set(p.x * XS, this.heightAt(p.x, p.y) + 0.9, p.y * XS);
      m.rotation.x = -0.75;
      m.renderOrder = 1;
      this.group.add(m);
    });
    // the tin box
    const chest = M['survival/chest'];
    this.box = new THREE.Group();
    chest.parts.forEach(p => this.box.add(new THREE.Mesh(p.geo, p.mat)));
    this.box.applyMatrix4(placeM(chest, c.BOX.x, c.BOX.y, { len: 1.2, yaw: 0.3, y: this.heightAt(c.BOX.x, c.BOX.y) + 0.2 }));
    this.group.add(this.box);
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gx = gc.getContext('2d'), gg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, '#fff'); gg.addColorStop(0.25, 'rgba(255,255,255,.5)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gg; gx.fillRect(0, 0, 64, 64);
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glint.position.set(c.BOX.x * XS + 0.3, 1.2, c.BOX.y * XS);
    this.group.add(this.glint);
    // light from the entrance and the crack in the ceiling
    this.entryLight = new THREE.PointLight(0xbfdcff, 0, 30, 1.2); this.entryLight.position.set(c.ENTRY.x * XS + 4, 3, c.ENTRY.y * XS);
    this.skyLight = new THREE.SpotLight(0xfff2cc, 0, 30, 0.35, 0.6, 1); this.skyLight.position.set(c.SKY.x * XS - 2, 14, c.SKY.y * XS - 6);
    this.skyLight.target.position.set(c.SKY.x * XS, 0, c.SKY.y * XS);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    shaft.position.set(c.SKY.x * XS - 1, 7, c.SKY.y * XS - 3); shaft.rotation.x = 0.4;
    this.shaft = shaft;
    this.group.add(this.entryLight, this.skyLight, this.skyLight.target, shaft);
    // tide water flooding the entrance tunnel
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 16 * 1), new THREE.MeshLambertMaterial({ color: 0x2f7e92, transparent: true, opacity: 0.8 }));
    this.water.rotation.x = -Math.PI / 2;
    this.group.add(this.water);
  }
  heightAt(x, y) {
    const c = I.cave, { GW, GH, CC } = c;
    const fx = I.clamp(x / CC - 0.5, 0, GW - 1.001), fy = I.clamp(y / CC - 0.5, 0, GH - 1.001);
    const gx = fx | 0, gy = fy | 0, tx = fx - gx, ty = fy - gy, i = gy * GW + gx, H = this.H;
    return H[i] * (1 - tx) * (1 - ty) + H[i + 1] * tx * (1 - ty) + H[i + GW] * (1 - tx) * ty + H[i + GW + 1] * tx * ty;
  }
  update(G, dt, sky) {
    const c = I.cave, S = G.state;
    const day = sky.day;
    this.entryLight.intensity = 20 + 60 * day;
    this.skyLight.intensity = 300 * day;
    this.shaft.visible = day > 0.1;
    this.box.visible = !S.flags.fuse;
    const tw = Math.pow(Math.max(0, Math.sin(G.clock * 2.2)), 14);
    this.glint.visible = !S.flags.fuse;
    this.glint.scale.setScalar(0.5 + tw * 1.4);
    const fill = I.clamp((G.tide + 5.5) / 11, 0, 1);
    const xw = 960 - fill * 190;
    this.water.scale.set((1000 - xw) * XS, 1, 1);
    this.water.position.set((xw + 1000) / 2 * XS, 0.25, 600 * XS);
  }
}
