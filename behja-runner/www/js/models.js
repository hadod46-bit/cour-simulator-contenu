// Modèles 3D construits par programme (primitives Three.js) : décor, obstacles, personnages.
import * as THREE from '../lib/three.module.min.js';
import * as T from './textures.js';
import { hash, pick } from './util.js';

// ------------------------------------------------------------------ matériaux
const cache = new Map();
const cached = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

let gradientMap = null;
export function toon(color) {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter; gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return cached('toon' + color, () => new THREE.MeshToonMaterial({ color, gradientMap }));
}
export const lam = (color, extra) => cached('lam' + color + (extra ? JSON.stringify(Object.keys(extra)) : ''), () => new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
const texMat = (key, tex, extra) => cached('tex' + key, () => new THREE.MeshLambertMaterial({ map: tex, ...(extra || {}) }));
const basic = color => cached('basic' + color, () => new THREE.MeshBasicMaterial({ color }));
const OUTLINE = new THREE.MeshBasicMaterial({ color: '#2a160b', side: THREE.BackSide });

// Halo lumineux partagé : son opacité suit le cycle jour/nuit.
export const glowMaterial = new THREE.SpriteMaterial({
  map: T.glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4
});
export function glowSprite(size) {
  const s = new THREE.Sprite(glowMaterial);
  s.scale.setScalar(size);
  return s;
}

// ------------------------------------------------------------------ géométries partagées
const G = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLow: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1)
};

function mesh(geo, mat, shadow) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow !== false;
  return m;
}
function prim(geo, mat, sx, sy, sz, x, y, z, shadow) {
  const m = mesh(geo, mat, shadow);
  m.scale.set(sx, sy, sz);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}
function outlined(geo, mat, r) {
  const m = mesh(geo, mat);
  const o = new THREE.Mesh(geo, OUTLINE);
  o.scale.setScalar(1 + 0.024 / r);
  o.castShadow = false;
  m.add(o);
  return m;
}
// Multiplie les coordonnées UV d'une face d'un BoxGeometry (0:+x 1:-x 2:+y 3:-y 4:+z 5:-z).
function scaleFaceUV(geo, face, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}
// Fusion simple de géométries (non indexées) avec position, normal et uv.
function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].count * size, 0));
    let off = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// Fusionne les maillages statiques d'un groupe par matériau (beaucoup moins d'appels de dessin).
// Les sous-groupes marqués userData.keep (pièces animées) sont laissés intacts.
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), removed = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material === OUTLINE) return;
    if (o.geometry.attributes.color || !o.geometry.attributes.uv || o.children.length) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.keep) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) g.setAttribute(n, src.attributes[n]);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let e = groups.get(o.material.uuid);
    if (!e) { e = { mat: o.material, geos: [], cast: false }; groups.set(o.material.uuid, e); }
    e.geos.push(g);
    if (o.castShadow) e.cast = true;
    removed.push(o);
  });
  for (const o of removed) o.parent.remove(o);
  const dispose = root.userData.dispose || (root.userData.dispose = []);
  for (const { mat, geos, cast } of groups.values()) {
    const g = merge(geos);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast; m.receiveShadow = true;
    root.add(m);
    dispose.push(g);
  }
  return root;
}

// Lanterne marocaine en laiton avec halo.
const lanternGlass = basic('#ffcf6b');
let lanternProto = null;
export function lantern(scale) {
  if (!lanternProto) lanternProto = bake(buildLantern());
  const l = lanternProto.clone();
  delete l.userData.dispose;
  l.scale.setScalar(scale || 1);
  return l;
}
function buildLantern() {
  const g = new THREE.Group();
  const brass = lam('#b8892b');
  g.add(prim(cached('lanternGeo', () => new THREE.CylinderGeometry(1, 0.8, 1, 6)), lanternGlass, 0.09, 0.2, 0.09, 0, 0, 0, false));
  g.add(prim(G.cone, brass, 0.11, 0.12, 0.11, 0, 0.16, 0, false));
  g.add(prim(G.cone, brass, 0.07, 0.1, 0.07, 0, -0.15, 0, false).rotateX(Math.PI));
  g.add(prim(G.cyl, brass, 0.008, 0.25, 0.008, 0, 0.33, 0, false));
  g.add(glowSprite(1.4));
  return g;
}

// ------------------------------------------------------------------ stands du souk
const STAND_W = 2.1, BODY_H = 2.3;
export function buildStall(o) {
  const L = o.z1 - o.z0, g = new THREE.Group(), dispose = [];
  const seed = Math.floor(o.seed) % 2;
  const v = o.variant === 'charrette' ? 'oranges' : o.variant;
  const wood = texMat('wood', T.woodTexture());
  const dark = lam('#4a2e18');

  if (o.variant === 'charrette') {
    // charrette de jus d'orange : plateau sur roues + auvent sur poteaux
    const bed = new THREE.BoxGeometry(2.0, 1.0, L - 0.4);
    scaleFaceUV(bed, 0, (L - 0.4) / 3, 1); scaleFaceUV(bed, 1, (L - 0.4) / 3, 1);
    bed.translate(0, 1.15, -L / 2);
    dispose.push(bed);
    const side = texMat('cartside', T.cartSideTexture());
    g.add(mesh(bed, [side, side, lam('#e8892b'), dark, texMat('front_oranges' + seed, T.standFrontTexture('oranges', seed)), dark]));
    const orange = new THREE.InstancedMesh(G.sphereLow, lam('#f39c12'), 40);
    const mtx = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 20 && k < 40; i++, k++) {
      mtx.makeScale(0.13, 0.13, 0.13);
      mtx.setPosition(-0.8 + (i % 5) * 0.4 + r * 0.2, 1.72 + r * 0.16, -0.5 - Math.floor(i / 5) * ((L - 1.2) / 4));
      orange.setMatrixAt(k, mtx);
    }
    orange.castShadow = true;
    g.add(orange);
    o.wheels = [];
    for (const wx of [-1.08, 1.08]) for (const wz of [-0.9, -L + 0.9]) {
      const wh = new THREE.Group();
      wh.userData.keep = true;
      wh.position.set(wx, 0.5, wz);
      const tire = prim(G.cyl, lam('#4a2e18'), 0.5, 0.12, 0.5);
      tire.rotation.z = Math.PI / 2;
      wh.add(tire);
      for (let s = 0; s < 3; s++) {
        const sp = prim(G.box, lam('#c9a23a'), 0.14, 0.86, 0.06);
        sp.rotation.x = (s * Math.PI) / 3;
        wh.add(sp);
      }
      g.add(wh);
      o.wheels.push(wh);
    }
    for (const px of [-0.95, 0.95]) for (const pz of [-0.25, -L + 0.25]) g.add(prim(G.cyl, dark, 0.045, 1.2, 0.045, px, 2.25, pz));
  } else {
    const body = new THREE.BoxGeometry(STAND_W, BODY_H, L);
    scaleFaceUV(body, 0, L / 3, 1); scaleFaceUV(body, 1, L / 3, 1);
    body.translate(0, BODY_H / 2, -L / 2);
    dispose.push(body);
    const side = texMat(`side_${v}${seed}`, T.standSideTexture(v, seed));
    const front = texMat(`front_${v}${seed}`, T.standFrontTexture(v, seed));
    const m = mesh(body, [side, side, dark, dark, front, dark]);
    m.receiveShadow = true;
    g.add(m);
    // rebord avec marchandises en relief
    g.add(prim(G.box, wood, 2.0, 0.08, 0.42, 0, 1.18, 0.2));
    addLedgeGoods(g, v, seed);
    // poteaux avant
    for (const px of [-1.1, 1.1]) g.add(prim(G.cyl, dark, 0.055, 2.75, 0.055, px, 1.37, 0.32));
  }
  // auvent rayé avec lambrequin festonné
  const aw = new THREE.BoxGeometry(2.45, 0.12, L + 0.4);
  scaleFaceUV(aw, 2, 1, L / 2.4);
  aw.translate(0, 2.74, -L / 2 + 0.2);
  dispose.push(aw);
  const awTex = texMat('awning' + o.aw, T.awningTexture(o.aw));
  const awSide = lam(T.PAL.awnings[o.aw][0]);
  const roof = mesh(aw, [awSide, awSide, awTex, awSide, awSide, awSide]);
  roof.receiveShadow = true;
  g.add(roof);
  const valMat = cached('val' + o.aw, () => new THREE.MeshLambertMaterial({ map: T.valanceTexture(o.aw), alphaTest: 0.5, side: THREE.DoubleSide }));
  const vf = mesh(new THREE.PlaneGeometry(2.45, 0.42), valMat);
  vf.position.set(0, 2.47, 0.4);
  g.add(vf);
  for (const sx of [-1, 1]) {
    const pg = new THREE.PlaneGeometry(L + 0.4, 0.42);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (L + 0.4) / 0.8);
    dispose.push(pg);
    const vs = mesh(pg, valMat);
    vs.rotation.y = Math.PI / 2;
    vs.position.set(sx * 1.225, 2.47, -L / 2 + 0.2);
    g.add(vs);
  }
  // lanterne suspendue à l'avant
  if (v === 'lanternes' || hash(o.seed) > 0.6) {
    const l = lantern(1.1);
    l.position.set(0.7, 2.05, 0.3);
    g.add(l);
  }
  g.userData.dispose = dispose;
  return bake(g);
}

function addLedgeGoods(g, v, seed) {
  if (v === 'epices') {
    for (let k = 0; k < 5; k++) {
      const x = -0.8 + k * 0.4, col = T.PAL.spices[(k + seed * 2) % T.PAL.spices.length];
      g.add(prim(G.cyl, lam('#c9a26b'), 0.17, 0.06, 0.17, x, 1.25, 0.22));
      g.add(prim(G.cone, toon(col), 0.15, 0.36, 0.15, x, 1.45, 0.22));
    }
  } else if (v === 'oranges') {
    const inst = new THREE.InstancedMesh(G.sphereLow, toon('#f39c12'), 30);
    const mtx = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 3; r++) for (let i = 0; i < 10 - r * 3 && k < 30; i++, k++) {
      mtx.makeScale(0.085, 0.085, 0.085);
      mtx.setPosition(-0.85 + i * 0.19 + r * 0.28, 1.3 + r * 0.13, 0.22 + (r % 2 ? 0.05 : -0.05));
      inst.setMatrixAt(k, mtx);
    }
    inst.count = k;
    inst.castShadow = true;
    g.add(inst);
  } else if (v === 'lanternes') {
    for (let k = 0; k < 3; k++) { const l = lantern(0.8); l.position.set(-0.65 + k * 0.65, 1.42, 0.22); g.add(l); }
  } else if (v === 'tapis') {
    for (let k = 0; k < 3; k++) {
      const m = prim(G.cyl, texMat('rug' + ((k + seed) % 4), T.rugTexture((k + seed) % 4)), 0.1, 1.8 - k * 0.3, 0.1, 0, 1.3 + k * 0.17, 0.22);
      m.rotation.z = Math.PI / 2;
      g.add(m);
    }
  } else if (v === 'babouches') {
    for (let k = 0; k < 6; k++) {
      const col = T.PAL.bright[(k + seed * 3) % T.PAL.bright.length];
      const s = prim(G.sphereLow, toon(col), 0.09, 0.06, 0.18, -0.8 + k * 0.32, 1.27, 0.22);
      s.rotation.x = 0.2;
      g.add(s);
    }
  } else if (v === 'poteries') {
    for (let k = 0; k < 3; k++) {
      const x = -0.65 + k * 0.65;
      g.add(tajine(['#1d6f8a', '#2f8f5b', '#c0602b'][(k + seed) % 3], x, 1.22, 0.22, 0.85));
    }
  }
}

function tajine(col, x, y, z, s) {
  const t = new THREE.Group();
  t.add(prim(G.cyl, toon(col), 0.32, 0.05, 0.32, 0, 0.025, 0));
  t.add(prim(G.cone, toon(col), 0.27, 0.42, 0.27, 0, 0.26, 0));
  t.add(prim(G.sphereLow, lam('#e9c46a'), 0.045, 0.045, 0.045, 0, 0.49, 0));
  t.position.set(x, y, z);
  t.scale.setScalar(s || 1);
  return t;
}

// ------------------------------------------------------------------ rampe en bois
function wedgeGeometry(w, h, L) {
  // Coin de bois : avant au sol (z = 0), arrière à la hauteur h (z = -L). Faces orientées vers l'extérieur.
  const A = [-w / 2, 0, 0], B = [w / 2, 0, 0], C = [w / 2, h, -L], D = [-w / 2, h, -L], E = [w / 2, 0, -L], F = [-w / 2, 0, -L];
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  const rep = Math.hypot(L, h);
  tri(A, B, C, [0, 0], [1, 0], [1, rep]); tri(A, C, D, [0, 0], [1, rep], [0, rep]);   // pente
  tri(E, F, D, [0, 0], [1, 0], [1, 1]); tri(E, D, C, [0, 0], [1, 1], [0, 1]);         // dos
  tri(B, E, C, [0, 0], [L / 3, 0], [L / 3, h / 3]);                                  // flanc droit
  tri(A, D, F, [0, 0], [L / 3, h / 3], [L / 3, 0]);                                  // flanc gauche
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
export function buildRamp(o) {
  const L = o.z1 - o.z0, g = new THREE.Group();
  const geo = wedgeGeometry(2.1, o.h, L);
  const m = mesh(geo, texMat('wood', T.woodTexture()));
  m.receiveShadow = true;
  g.add(m);
  const len = Math.hypot(L, o.h), ang = Math.atan2(o.h, L);
  for (const sx of [-1, 1]) {
    const rail = prim(G.box, lam('#5a3a1e'), 0.1, 0.12, len, sx * 1.0, o.h / 2 + 0.08, -L / 2);
    rail.rotation.x = ang;
    g.add(rail);
  }
  g.userData.dispose = [geo];
  return g;
}

// ------------------------------------------------------------------ obstacles bas (à sauter)
export function buildLow(o) {
  const g = new THREE.Group();
  if (o.variant === 'caisse') {
    const crate = texMat('crate', T.crateTexture());
    for (const x of [-0.58, 0.58]) g.add(prim(G.box, crate, 1.1, 0.75, 0.9, x, 0.375, 0));
    const inst = new THREE.InstancedMesh(G.sphereLow, toon('#f39c12'), 24);
    const mtx = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12 - r * 4; i++, k++) {
      mtx.makeScale(0.12, 0.12, 0.12);
      mtx.setPosition(-0.95 + (i % 6) * 0.38 + r * 0.19, 0.83 + r * 0.14, -0.2 + Math.floor(i / 6) * 0.38);
      inst.setMatrixAt(k, mtx);
    }
    inst.count = k;
    inst.castShadow = true;
    g.add(inst);
  } else if (o.variant === 'tapis') {
    const pos = [[-0.58, 0.25], [0.58, 0.25], [0, 0.7]];
    pos.forEach(([x, y], k) => {
      const i = Math.floor(hash(o.seed + k) * 4);
      const m = prim(G.cyl, texMat('rug' + i, T.rugTexture(i)), 0.25, 1.12, 0.25, x, y, 0);
      m.rotation.z = Math.PI / 2;
      g.add(m);
    });
  } else {
    const wood = texMat('wood', T.woodTexture());
    g.add(prim(G.box, wood, 2.3, 0.1, 0.8, 0, 0.42, 0));
    for (const x of [-1.0, 1.0]) for (const z of [-0.3, 0.3]) g.add(prim(G.box, lam('#5a3a1e'), 0.1, 0.4, 0.1, x, 0.2, z));
    for (let k = 0; k < 3; k++) g.add(tajine(['#1d6f8a', '#c0602b', '#2f8f5b'][Math.floor(hash(o.seed + k) * 3)], -0.75 + k * 0.75, 0.47, 0, 1.15));
  }
  return bake(g);
}

// ------------------------------------------------------------------ tapis suspendu (à franchir en glissant)
export function buildHigh(o) {
  const g = new THREE.Group();
  const dark = lam('#5a3a1e');
  for (const x of [-1.15, 1.15]) g.add(prim(G.cyl, dark, 0.07, 3.35, 0.07, x, 1.67, 0));
  const bar = prim(G.cyl, dark, 0.05, 2.5, 0.05, 0, 3.25, 0);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const x of [-1.15, 1.15]) g.add(prim(G.sphereLow, lam('#c9a23a'), 0.1, 0.1, 0.1, x, 3.35, 0));
  const sway = new THREE.Group();
  sway.userData.keep = true;
  sway.position.set(0, 3.2, 0);
  const mat = cached('rugHang' + o.rug, () => new THREE.MeshLambertMaterial({ map: T.rugTexture(o.rug), side: THREE.DoubleSide, alphaTest: 0.4 }));
  const rug = mesh(cached('rugPlane', () => new THREE.PlaneGeometry(2.0, 2.1)), mat);
  rug.position.y = -1.05;
  sway.add(rug);
  g.add(sway);
  bake(g);
  g.userData.sway = sway;
  return g;
}

// ------------------------------------------------------------------ pièces (dirhams)
export function buildCoins(max) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24);
  geo.rotateX(Math.PI / 2);
  const face = new THREE.MeshPhongMaterial({ map: T.coinTexture(), emissive: '#5a3c00', specular: '#fff2b0', shininess: 60 });
  const edge = new THREE.MeshPhongMaterial({ color: '#d9a52a', emissive: '#4a3000', specular: '#fff2b0', shininess: 60 });
  const inst = new THREE.InstancedMesh(geo, [edge, face, face], max);
  inst.castShadow = true;
  inst.count = 0;
  inst.frustumCulled = false;
  return inst;
}

// ------------------------------------------------------------------ bonus
export function buildPowerup(kind) {
  const g = new THREE.Group();
  const item = new THREE.Group();
  g.add(glowSprite(2.2));
  if (kind === 'aimant') {
    const u = mesh(cached('magnetGeo', () => new THREE.TorusGeometry(0.28, 0.1, 10, 24, Math.PI)), toon('#d63031'));
    u.rotation.z = Math.PI;
    item.add(u);
    for (const x of [-0.28, 0.28]) {
      item.add(prim(G.cyl, toon('#d63031'), 0.1, 0.18, 0.1, x, 0.09, 0));
      item.add(prim(G.cyl, toon('#ecf0f1'), 0.105, 0.14, 0.105, x, 0.25, 0));
    }
    item.position.y = -0.1;
  } else if (kind === 'babouches') {
    const s = prim(G.sphere, toon('#e9b824'), 0.2, 0.13, 0.42, 0, 0, 0);
    item.add(s);
    const tip = prim(G.cone, toon('#e9b824'), 0.1, 0.25, 0.1, 0, 0.08, -0.45);
    tip.rotation.x = -1.2;
    item.add(tip);
    item.add(prim(G.sphereLow, toon('#8a5a1a'), 0.13, 0.05, 0.2, 0, 0.1, 0.1));
  } else if (kind === 'tapis') {
    const pg = cached('rugPowGeo', () => {
      const geo = new THREE.PlaneGeometry(1.0, 0.7, 8, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 6) * 0.06);
      geo.computeVertexNormals();
      return geo;
    });
    const m = mesh(pg, cached('rugPow', () => new THREE.MeshLambertMaterial({ map: T.rugTexture(0), side: THREE.DoubleSide, alphaTest: 0.4 })));
    m.rotation.x = -0.9;
    item.add(m);
  } else {
    const sm = cached('x2mat', () => new THREE.SpriteMaterial({ map: T.textTexture('×2', '#f2b632', '#7d2a17'), transparent: true }));
    const sp = new THREE.Sprite(sm);
    sp.scale.set(1.2, 0.6, 1);
    item.add(sp);
  }
  g.add(item);
  g.userData.item = item;
  return g;
}

// ------------------------------------------------------------------ décor de rue
export function buildDecor(d) {
  const g = new THREE.Group();
  if (d.kind === 'pot') {
    g.add(prim(new THREE.CylinderGeometry(0.32, 0.22, 0.55, 14), toon('#b5532b'), 1, 1, 1, 0, 0.275, 0));
    g.add(prim(G.cyl, toon('#c8653a'), 0.36, 0.08, 0.36, 0, 0.55, 0));
    g.add(prim(G.sphereLow, toon('#3f7d3a'), 0.45, 0.4, 0.45, 0, 0.95, 0));
    g.add(prim(G.sphereLow, toon('#4f9a45'), 0.28, 0.25, 0.28, 0.2, 1.2, 0.1));
    if (d.c % 2) for (let k = 0; k < 6; k++) g.add(prim(G.sphereLow, toon('#e04f8f'), 0.08, 0.08, 0.08, Math.cos(k) * 0.38, 0.95 + Math.sin(k * 2) * 0.25, Math.sin(k) * 0.38, false));
  } else if (d.kind === 'sac') {
    g.add(prim(new THREE.CylinderGeometry(0.33, 0.38, 0.6, 14), toon('#b08a5a'), 1, 1, 1, 0, 0.3, 0));
    g.add(prim(G.cyl, toon('#c9a26b'), 0.36, 0.06, 0.36, 0, 0.6, 0));
    g.add(prim(G.cone, toon(T.PAL.spices[d.c % T.PAL.spices.length]), 0.32, 0.3, 0.32, 0, 0.75, 0));
  } else if (d.kind === 'pile') {
    for (let k = 0; k < 4; k++) {
      const r = T.PAL.rugs[(d.c + k) % 4];
      const b = prim(G.box, toon(k % 2 ? r.bg : r.bd), 1.0 - k * 0.06, 0.16, 0.7, 0, 0.08 + k * 0.17, 0);
      b.rotation.y = (k % 2 ? 0.08 : -0.06);
      g.add(b);
    }
  } else if (d.kind === 'chat') {
    const col = ['#e08a3a', '#7d7d7d', '#3a3a3a', '#e8dcc8', '#e08a3a', '#9a7a5a'][d.c];
    const m = toon(col);
    g.add(prim(G.sphereLow, m, 0.2, 0.22, 0.26, 0, 0.22, 0));
    g.add(prim(G.sphereLow, m, 0.15, 0.14, 0.14, 0, 0.5, -0.12));
    for (const x of [-0.08, 0.08]) g.add(prim(G.cone, m, 0.05, 0.1, 0.05, x, 0.64, -0.12));
    const tail = mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 12, Math.PI), m);
    tail.position.set(0, 0.2, 0.22); tail.rotation.y = Math.PI / 2;
    g.add(tail);
    g.rotation.y = d.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  return bake(g);
}

// Guirlande tendue au-dessus de la rue (fanions ou lanternes).
export function buildGarland(c, wallX) {
  const g = new THREE.Group();
  const pts = [];
  for (let k = 0; k <= 16; k++) { const x = -wallX + (2 * wallX * k) / 16, t = x / wallX; pts.push(new THREE.Vector3(x, 7.3 - 0.9 * (1 - t * t), 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 24, 0.025, 4, false);
  g.add(mesh(tube, lam('#4a3020'), false));
  const dispose = [tube];
  if (c === 1) {
    for (let k = 1; k < 16; k += 2) {
      const l = lantern(0.9);
      l.position.copy(pts[k]); l.position.y -= 0.3;
      g.add(l);
    }
  } else {
    const cols = ['#c0392b', '#2f8f5b', '#e9b824', '#f3e7cf'].map(h => new THREE.Color(h));
    const pos = [], col = [];
    for (let k = 1; k < 16; k++) {
      const p = pts[k], cc = cols[k % 4];
      pos.push(p.x - 0.22, p.y, 0, p.x + 0.22, p.y, 0, p.x, p.y - 0.55, 0);
      for (let i = 0; i < 3; i++) col.push(cc.r, cc.g, cc.b);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    fg.computeVertexNormals();
    dispose.push(fg);
    g.add(mesh(fg, cached('flags', () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), false));
  }
  g.userData.dispose = dispose;
  return bake(g);
}

// Palmier derrière les remparts.
const leafMat = () => cached('leaf', () => new THREE.MeshLambertMaterial({ map: T.leafTexture(), side: THREE.DoubleSide, alphaTest: 0.5 }));
let frondGeo = null;
export function buildPalm(h, lean) {
  const g = new THREE.Group();
  const bark = toon('#7a5532');
  let x = 0, y = 0;
  const seg = 6;
  for (let k = 0; k < seg; k++) {
    const r = 0.32 - k * 0.03;
    const s = prim(new THREE.CylinderGeometry(r * 0.85, r, h / seg + 0.05, 8), bark, 1, 1, 1, x, y + h / seg / 2, 0, false);
    s.rotation.z = -lean * 0.12;
    g.add(s);
    y += h / seg; x += lean * 0.12 * (h / seg) * (k / seg) * 2;
  }
  if (!frondGeo) {
    frondGeo = new THREE.PlaneGeometry(0.9, 4, 1, 8);
    frondGeo.translate(0, 2, 0);
    const p = frondGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 4; p.setZ(i, -t * t * 2.2); }
    frondGeo.rotateX(-Math.PI / 2 + 0.5);
    frondGeo.computeVertexNormals();
  }
  const crown = new THREE.Group();
  crown.position.set(x, y, 0);
  for (let k = 0; k < 9; k++) {
    const f = mesh(frondGeo, leafMat(), false);
    f.rotation.y = (k / 9) * Math.PI * 2;
    crown.add(f);
  }
  for (let k = 0; k < 3; k++) crown.add(prim(G.sphereLow, toon('#6b4a1a'), 0.16, 0.16, 0.16, Math.cos(k * 2) * 0.25, -0.2, Math.sin(k * 2) * 0.25, false));
  g.add(crown);
  return bake(g);
}

// ------------------------------------------------------------------ remparts
// Géométrie d'un segment (mur + créneaux) : seule la face intérieure reçoit la façade,
// les autres faces pointent vers une zone unie de la texture -> 1 seul appel de dessin.
const wallGeos = {};
function wallGeometry(side) {
  if (wallGeos[side]) return wallGeos[side];
  const box = new THREE.BoxGeometry(0.6, 8, 6).toNonIndexed();
  box.translate(0, 4, 0);
  const inner = side < 0 ? 0 : 1;
  const uv = box.attributes.uv;
  for (let i = 0; i < uv.count; i++) if (Math.floor(i / 6) !== inner) uv.setXY(i, 0.5, 0.975);
  const parts = [box];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.BoxGeometry(0.62, 0.7, 0.8).toNonIndexed();
    c.translate(0, 8.35, -2.25 + k * 1.5);
    const cu = c.attributes.uv;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, 0.5, 0.975);
    parts.push(c);
  }
  return (wallGeos[side] = merge(parts));
}
export function buildWallSegment(side) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(wallGeometry(side), lam('#c45f3d'));
  wall.receiveShadow = true;
  wall.castShadow = true;
  g.add(wall);
  const l = lantern(1.3);
  l.position.set(-side * 0.55, 3.6, 1.8);
  g.add(l);
  g.userData = { wall, lantern: l, side };
  return g;
}
export function setWallLook(seg, variant, colorIdx) {
  const { wall, lantern: l } = seg.userData;
  wall.material = texMat(`wall${variant}_${colorIdx}`, T.wallTexture(variant, colorIdx));
  l.visible = variant === 0 || variant === 5;
}

// ------------------------------------------------------------------ personnages
function capsule(r, len, mat, outline) {
  const geo = cached(`caps${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12));
  return outline ? outlined(geo, mat, r) : mesh(geo, mat);
}
function ball(r, mat, outline) {
  const geo = cached('ball' + r, () => new THREE.SphereGeometry(r, 18, 14));
  return outline ? outlined(geo, mat, r) : mesh(geo, mat);
}
function joint(parent, x, y, z) { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; }

// Le héros : un gamin de Marrakech en maillot vert n°10, jean et tarbouche.
export function buildRunner() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(0.88);
  root.add(body);
  const green = toon('#1f8a55'), skin = toon('#c98b5b'), jeans = toon('#2c4a7c'), red = toon('#c1272d'), hair = toon('#2a1a12');
  const r = {};
  r.hips = joint(body, 0, 0.98, 0);
  const pelvis = ball(0.17, jeans, true); pelvis.scale.set(1.3, 0.8, 0.95); r.hips.add(pelvis);
  r.torso = joint(r.hips, 0, 0.05, 0);
  const chest = capsule(0.23, 0.3, green, true); chest.scale.set(1.08, 1, 0.74); chest.position.y = 0.33; r.torso.add(chest);
  const band = prim(G.cyl, red, 0.245, 0.07, 0.18, 0, 0.1, 0); r.torso.add(band);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: T.jerseyTexture(), transparent: true }));
  num.position.set(0, 0.4, 0.176); r.torso.add(num);
  const bag = prim(G.box, toon('#9a6234'), 0.24, 0.2, 0.1, -0.24, 0.12, 0.12); r.torso.add(bag);
  r.torso.add(prim(G.cyl, skin, 0.075, 0.14, 0.075, 0, 0.64, 0));
  r.head = joint(r.torso, 0, 0.82, 0);
  r.head.add(ball(0.2, skin, true));
  const hr = ball(0.205, hair); hr.scale.set(1, 0.97, 1); hr.position.set(0, 0.02, 0.025); r.head.add(hr);
  for (const sx of [-1, 1]) r.head.add(prim(G.sphereLow, skin, 0.05, 0.06, 0.04, sx * 0.2, -0.01, 0));
  // tarbouche
  r.fez = joint(r.head, 0, 0.16, 0.01);
  r.fez.rotation.z = 0.08;
  r.fez.add(outlined(cached('fezGeo', () => new THREE.CylinderGeometry(0.12, 0.155, 0.24, 18)), red, 0.12));
  r.fez.children[0].position.y = 0.1;
  r.fez.add(prim(G.cyl, toon('#7a141b'), 0.121, 0.01, 0.121, 0, 0.225, 0));
  r.tassel = joint(r.fez, 0, 0.225, 0);
  r.tassel.add(prim(G.cyl, toon('#111111'), 0.012, 0.17, 0.012, 0, -0.085, 0));
  r.tassel.add(prim(G.sphereLow, toon('#111111'), 0.03, 0.045, 0.03, 0, -0.18, 0));
  // bras
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = r['sh' + k] = joint(r.torso, s * 0.3, 0.5, 0);
    const up = capsule(0.075, 0.17, green, true); up.position.y = -0.14; sh.add(up);
    const el = r['el' + k] = joint(sh, 0, -0.3, 0);
    const fo = capsule(0.062, 0.16, skin, true); fo.position.y = -0.12; el.add(fo);
    const hand = ball(0.07, skin, true); hand.position.y = -0.27; el.add(hand);
  }
  // jambes
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const th = r['th' + k] = joint(r.hips, s * 0.11, -0.05, 0);
    const thigh = capsule(0.1, 0.25, jeans, true); thigh.position.y = -0.2; th.add(thigh);
    const kn = r['kn' + k] = joint(th, 0, -0.43, 0);
    const shin = capsule(0.085, 0.25, jeans, true); shin.position.y = -0.19; kn.add(shin);
    const an = r['an' + k] = joint(kn, 0, -0.42, 0);
    const shoe = capsule(0.08, 0.16, toon('#f4f1ea'), true); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.02, -0.06); an.add(shoe);
    an.add(prim(G.box, toon('#c0392b'), 0.15, 0.035, 0.32, 0, -0.095, -0.06));
  }
  root.traverse(o => { if (o.isMesh && o.material !== OUTLINE) o.castShadow = true; });
  num.castShadow = false;
  root.userData.rig = r;
  return root;
}

// Pose cible du coureur, interpolée en douceur.
const POSE_KEYS = ['hipsY', 'torso', 'thL', 'knL', 'thR', 'knR', 'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR', 'anL', 'anR'];
export function animateRunner(root, mode, ph, dt, extra) {
  const r = root.userData.rig;
  const s = Math.sin(ph), c = Math.cos(ph);
  let t;
  if (mode === 'run') {
    t = {
      hipsY: 0.98 + Math.abs(c) * 0.05, torso: -0.14,
      thL: s * 0.85, knL: -(0.25 + 1.35 * Math.max(0, c)), thR: -s * 0.85, knR: -(0.25 + 1.35 * Math.max(0, -c)),
      shLx: -s * 0.8, shLz: -0.12, elL: 1.2, shRx: s * 0.8, shRz: 0.12, elR: 1.2, anL: 0.2, anR: 0.2
    };
  } else if (mode === 'jump') {
    t = { hipsY: 0.98, torso: -0.05, thL: 1.0, knL: -1.5, thR: 0.2, knR: -0.5, shLx: -2.5, shLz: -0.5, elL: 0.4, shRx: -2.5, shRz: 0.5, elR: 0.4, anL: 0.3, anR: 0 };
  } else if (mode === 'slide') {
    t = { hipsY: 0.45, torso: -0.95, thL: 1.6, knL: -2.4, thR: 1.5, knR: -2.3, shLx: 0.9, shLz: -0.3, elL: 1.4, shRx: 0.9, shRz: 0.3, elR: 1.4, anL: 0.5, anR: 0.5 };
  } else if (mode === 'fly') {
    t = { hipsY: 0.42, torso: -0.1, thL: 1.5, knL: -2.2, thR: 1.5, knR: -2.2, shLx: -0.4, shLz: -1.1, elL: 0.5, shRx: -0.4, shRz: 1.1, elR: 0.5, anL: 0, anR: 0 };
  } else if (mode === 'fall') {
    t = { hipsY: 0.85, torso: 0.45, thL: 0.6, knL: -0.6, thR: -0.2, knR: -0.3, shLx: -2.8, shLz: -0.7, elL: 0.3, shRx: -2.8, shRz: 0.7, elR: 0.3, anL: 0, anR: 0 };
  } else {
    t = { hipsY: 0.98, torso: 0, thL: 0, knL: 0, thR: 0, knR: 0, shLx: 0, shLz: -0.1, elL: 0.2, shRx: 0, shRz: 0.1, elR: 0.2, anL: 0, anR: 0 };
  }
  const cur = root.userData.pose || (root.userData.pose = { ...t });
  const k = Math.min(1, dt * (mode === 'run' ? 22 : 14));
  for (const key of POSE_KEYS) cur[key] += (t[key] - cur[key]) * k;
  r.hips.position.y = cur.hipsY; r.torso.rotation.x = cur.torso;
  r.thL.rotation.x = cur.thL; r.knL.rotation.x = cur.knL; r.thR.rotation.x = cur.thR; r.knR.rotation.x = cur.knR;
  r.shL.rotation.x = cur.shLx; r.shL.rotation.z = cur.shLz; r.elL.rotation.x = cur.elL;
  r.shR.rotation.x = cur.shRx; r.shR.rotation.z = cur.shRz; r.elR.rotation.x = cur.elR;
  r.anL.rotation.x = cur.anL; r.anR.rotation.x = cur.anR;
  r.tassel.rotation.x = 0.5 + Math.sin(ph * 0.5) * 0.35 + (extra && extra.vy > 0 ? -0.6 : 0);
  r.tassel.rotation.z = Math.sin(ph * 0.7) * 0.2;
}

// Le singe magot (sans queue, comme les vrais macaques de l'Atlas).
export function buildMonkey() {
  const root = new THREE.Group();
  root.scale.setScalar(0.85);
  const fur = toon('#9b7651'), dark = toon('#6e5034'), light = toon('#c09a6e'), skin = toon('#e0a08a');
  const r = {};
  r.body = joint(root, 0, 0.62, 0);
  const trunk = ball(0.3, fur, true); trunk.scale.set(1, 0.9, 1.35); r.body.add(trunk);
  const rump = ball(0.22, light); rump.position.set(0, 0.02, 0.28); rump.scale.set(1, 0.9, 0.6); r.body.add(rump);
  r.body.add(prim(G.sphereLow, dark, 0.06, 0.06, 0.06, 0, 0.12, 0.42));
  r.head = joint(r.body, 0, 0.2, -0.42);
  r.head.add(ball(0.21, fur, true));
  r.head.add(prim(G.cone, dark, 0.09, 0.14, 0.09, 0, 0.22, 0.02));
  for (const s of [-1, 1]) { r.head.add(prim(G.sphere, skin, 0.085, 0.1, 0.05, s * 0.22, 0.03, 0.02)); r.head.add(prim(G.sphereLow, toon('#c27b66'), 0.05, 0.065, 0.03, s * 0.225, 0.03, 0.045)); }
  const face = prim(G.sphere, skin, 0.15, 0.16, 0.08, 0, -0.03, -0.16); r.head.add(face);
  for (const s of [-1, 1]) r.head.add(prim(G.sphereLow, toon('#1a1008'), 0.03, 0.035, 0.02, s * 0.06, 0.03, -0.235));
  r.head.add(prim(G.sphereLow, toon('#c27b66'), 0.08, 0.06, 0.05, 0, -0.08, -0.22));
  // tarbouche volé, visible quand le singe attrape le joueur
  r.fez = joint(r.head, 0.03, 0.2, 0);
  r.fez.rotation.z = -0.25;
  r.fez.add(outlined(cached('fezGeo', () => new THREE.CylinderGeometry(0.12, 0.155, 0.24, 18)), toon('#c1272d'), 0.12));
  r.fez.children[0].position.y = 0.1;
  r.fez.visible = false;
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = r['ar' + k] = joint(r.body, s * 0.2, -0.05, -0.3);
    const up = capsule(0.07, 0.2, s < 0 ? dark : fur, true); up.position.y = -0.16; sh.add(up);
    const el = r['fo' + k] = joint(sh, 0, -0.32, 0);
    const fo = capsule(0.06, 0.18, s < 0 ? dark : fur, true); fo.position.y = -0.11; el.add(fo);
    const h = ball(0.065, skin, true); h.position.y = -0.24; el.add(h);
    const hp = r['hp' + k] = joint(r.body, s * 0.19, -0.05, 0.3);
    const th = capsule(0.09, 0.18, fur, true); th.position.y = -0.14; hp.add(th);
    const kn = r['kn' + k] = joint(hp, 0, -0.27, 0);
    const sn = capsule(0.07, 0.16, fur, true); sn.position.y = -0.1; kn.add(sn);
    const ft = prim(G.sphereLow, toon('#4a3220'), 0.07, 0.05, 0.12, 0, -0.22, -0.03); kn.add(ft);
  }
  root.traverse(o => { if (o.isMesh && o.material !== OUTLINE) o.castShadow = true; });
  root.userData.rig = r;
  return root;
}
export function animateMonkey(root, mode, ph, dt) {
  const r = root.userData.rig;
  const s = Math.sin(ph);
  let body, by, aL, aR, fL, fR, hL, hR, kL, kR, head;
  if (mode === 'gallop') {
    body = s * 0.12; by = 0.62 + Math.abs(s) * 0.12;
    aL = s * 0.9; aR = s * 0.9 + 0.3; fL = 0.3; fR = 0.3;
    hL = -s * 0.9; hR = -s * 0.9 - 0.3; kL = -0.6; kR = -0.6; head = -body;
  } else if (mode === 'chase') {
    body = 1.0; by = 0.82 + Math.abs(s) * 0.1;
    aL = 2.4 + s * 0.4; aR = 2.4 - s * 0.4; fL = -0.4; fR = -0.4;
    hL = -1.0 + s * 0.8; hR = -1.0 - s * 0.8; kL = -0.5 - Math.max(0, s); kR = -0.5 - Math.max(0, -s); head = -0.9;
  } else {
    // agrippé au dos du joueur, bras levés en triomphe
    body = 1.2; by = 0.8;
    aL = 2.9 + Math.sin(ph * 3) * 0.2; aR = 2.9 - Math.sin(ph * 3) * 0.2; fL = -0.3; fR = -0.3;
    hL = -1.4; hR = -1.4; kL = -1.2; kR = -1.2; head = -1.0;
  }
  const k = Math.min(1, dt * 14);
  const L = (o, v) => { o.rotation.x += (v - o.rotation.x) * k; };
  const spread = mode === 'gallop' ? 0 : mode === 'chase' ? 0.55 : 0.35;
  r.arL.rotation.z += (-spread - r.arL.rotation.z) * k;
  r.arR.rotation.z += (spread - r.arR.rotation.z) * k;
  L(r.body, body); r.body.position.y += (by - r.body.position.y) * k;
  L(r.arL, aL); L(r.arR, aR); L(r.foL, fL); L(r.foR, fR);
  L(r.hpL, hL); L(r.hpR, hR); L(r.knL, kL); L(r.knR, kR); L(r.head, head);
}

// Tapis volant sous le joueur.
export function buildFlyingCarpet() {
  const pg = new THREE.PlaneGeometry(1.5, 2.1, 10, 10);
  pg.rotateX(-Math.PI / 2);
  const m = mesh(pg, cached('flyRug', () => new THREE.MeshLambertMaterial({ map: T.rugTexture(1), side: THREE.DoubleSide, alphaTest: 0.4 })));
  m.userData.base = pg.attributes.position.array.slice();
  return m;
}
export function waveCarpet(m, t) {
  const p = m.geometry.attributes.position, b = m.userData.base;
  for (let i = 0; i < p.count; i++) p.setY(i, b[i * 3 + 1] + Math.sin(b[i * 3 + 2] * 3 + t * 8) * 0.06 + Math.sin(b[i * 3] * 2 + t * 5) * 0.03);
  p.needsUpdate = true;
}
