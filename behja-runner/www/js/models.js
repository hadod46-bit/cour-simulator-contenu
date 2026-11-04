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
// ------------------------------------------------------------------ personnages (style dessin animé lisse)
const std = (color, rough) => cached('std' + color + (rough || ''), () => new THREE.MeshStandardMaterial({ color, roughness: rough || 0.7, metalness: 0 }));
function capsule(r, len, mat) {
  return mesh(cached(`caps${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 16)), mat);
}
function ball(r, mat) {
  return mesh(cached('ball' + r, () => new THREE.SphereGeometry(r, 24, 18)), mat);
}
function lathe(points, mat, segs) {
  const key = 'lathe' + points.join('|');
  return mesh(cached(key, () => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs || 28)), mat);
}
function joint(parent, x, y, z) { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; }
function roundedBox(w, h, d, r) {
  return cached(`rbox${w}_${h}_${d}_${r}`, () => {
    const s = new THREE.Shape();
    const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
    s.lineTo(x + W + r, y + H); s.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
    s.lineTo(x, y + H + r); s.quadraticCurveTo(x - r, y + H + r, x - r, y + H);
    s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  });
}
// Basket épaisse : profil latéral extrudé avec arrondis (pointe vers -z = vers l'avant).
function sneakerGeos() {
  return cached('sneakerGeos', () => {
    const up = new THREE.Shape();
    up.moveTo(-0.09, 0.03); up.lineTo(0.15, 0.03); up.quadraticCurveTo(0.23, 0.03, 0.21, 0.08);
    up.quadraticCurveTo(0.17, 0.12, 0.08, 0.12); up.lineTo(0.0, 0.17); up.lineTo(-0.08, 0.18);
    up.quadraticCurveTo(-0.12, 0.13, -0.11, 0.07); up.quadraticCurveTo(-0.11, 0.03, -0.09, 0.03);
    const upper = new THREE.ExtrudeGeometry(up, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4, curveSegments: 10 });
    const so = new THREE.Shape();
    so.moveTo(-0.11, 0); so.lineTo(0.2, 0); so.quadraticCurveTo(0.26, 0, 0.25, 0.035); so.lineTo(-0.12, 0.045); so.quadraticCurveTo(-0.14, 0.02, -0.11, 0);
    const sole = new THREE.ExtrudeGeometry(so, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.015, bevelSegments: 3, curveSegments: 8 });
    for (const g of [upper, sole]) {
      g.translate(-0.02, 0, -0.05);
      g.rotateY(Math.PI / 2);
      g.computeVertexNormals();
    }
    return { upper, sole };
  });
}

// Le héros : Yassine, un ado de Marrakech (tee-shirt vert, bermuda cargo, baskets, sac en cuir et tarbouche).
export function buildRunner() {
  const root = new THREE.Group();
  const pivot = joint(root, 0, 0.85, 0);          // pivot au centre du corps (pour les figures)
  const body = joint(pivot, 0, -0.85, 0);
  body.scale.setScalar(0.86);
  const shirt = std('#1f9a5c'), skin = std('#b8784a', 0.6), shorts = std('#c9a46a'), hair = std('#1c120c', 0.5);
  const red = std('#c1272d', 0.55), white = std('#f5f2ea', 0.5), sock = std('#ffffff', 0.8), leather = std('#9a5a2a', 0.55);
  const r = {};
  r.hips = joint(body, 0, 0.98, 0);
  const pelvis = lathe([[0, -0.12], [0.15, -0.1], [0.17, 0], [0.16, 0.08], [0, 0.09]], shorts);
  pelvis.scale.set(1.15, 1, 0.78);
  r.hips.add(pelvis);
  // ceinture
  r.hips.add(prim(G.cyl, std('#5a3a1e', 0.5), 0.172 * 1.15, 0.035, 0.172 * 0.78, 0, 0.06, 0));
  r.torso = joint(r.hips, 0, 0.06, 0);
  const chest = lathe([[0, 0], [0.155, 0], [0.165, 0.1], [0.19, 0.26], [0.2, 0.36], [0.18, 0.44], [0.1, 0.5], [0, 0.51]], shirt);
  chest.scale.set(1.18, 1, 0.7);
  r.torso.add(chest);
  // col et petite étoile marocaine sur la poitrine (visible de face)
  r.torso.add(prim(new THREE.TorusGeometry(0.075, 0.018, 8, 20), std('#17804b'), 1, 1, 1, 0, 0.495, 0).rotateX(Math.PI / 2));
  const star = new THREE.Group();
  for (let k = 0; k < 2; k++) { const b = prim(G.box, std('#f2b632', 0.4), 0.07, 0.07, 0.01, 0, 0, 0, false); b.rotation.z = k * Math.PI / 4; star.add(b); }
  star.position.set(-0.08, 0.36, -0.14);
  r.torso.add(star);
  // sac à dos en cuir avec étoile de zellige
  const bag = mesh(roundedBox(0.3, 0.32, 0.13, 0.05), leather);
  bag.position.set(0, 0.27, 0.19);
  r.torso.add(bag);
  const flap = mesh(roundedBox(0.28, 0.13, 0.04, 0.018), std('#7a4220', 0.55));
  flap.position.set(0, 0.36, 0.26);
  r.torso.add(flap);
  const bstar = new THREE.Group();
  for (let k = 0; k < 2; k++) { const b = prim(G.box, std('#2a9d8f', 0.4), 0.06, 0.06, 0.012, 0, 0, 0, false); b.rotation.z = k * Math.PI / 4; bstar.add(b); }
  bstar.position.set(0, 0.2, 0.26);
  r.torso.add(bstar);
  for (const sx of [-1, 1]) {
    const strap = prim(G.box, std('#5a3a1e', 0.5), 0.04, 0.42, 0.025, sx * 0.11, 0.3, -0.13);
    strap.rotation.x = 0.12;
    r.torso.add(strap);
  }
  r.torso.add(prim(G.cyl, skin, 0.06, 0.12, 0.06, 0, 0.54, 0));
  // tête
  r.head = joint(r.torso, 0, 0.72, 0);
  const head = ball(0.2, skin); head.scale.set(1, 1.08, 1.02); r.head.add(head);
  for (const sx of [-1, 1]) {
    const ear = ball(0.05, skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.2, 0, 0.01); r.head.add(ear);
    const ew = ball(0.045, white); ew.scale.set(1, 1.15, 0.6); ew.position.set(sx * 0.072, 0.03, -0.178); r.head.add(ew);
    const iris = ball(0.026, std('#2b1a10', 0.3)); iris.scale.set(1, 1.15, 0.5); iris.position.set(sx * 0.07, 0.025, -0.2); r.head.add(iris);
    const shine = ball(0.008, std('#ffffff', 0.2)); shine.position.set(sx * 0.07 + 0.01, 0.04, -0.212); r.head.add(shine);
    const brow = prim(G.box, hair, 0.075, 0.018, 0.02, sx * 0.075, 0.105, -0.18, false); brow.rotation.z = -sx * 0.18; r.head.add(brow);
  }
  const nose = ball(0.032, std('#a86a40', 0.6)); nose.scale.set(1, 0.9, 1); nose.position.set(0, -0.02, -0.205); r.head.add(nose);
  const smile = mesh(cached('smile', () => new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI)), std('#6b2a1e', 0.5), false);
  smile.rotation.z = Math.PI; smile.position.set(0, -0.075, -0.188); smile.rotation.x = 0.25; r.head.add(smile);
  // cheveux bouclés sous le tarbouche
  const cap = ball(0.208, hair); cap.scale.set(1.02, 1.05, 1.02); cap.position.set(0, 0.025, 0.035); r.head.add(cap);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 11; k++) {
      const a = Math.PI * (0.3 + (k / 10) * 1.4) + (row % 2) * 0.12;
      const ca = Math.cos(a);
      if (row > 0 && ca > -0.1) continue;     // pas de boucles sur les joues : seulement derrière les oreilles
      if (row === 0 && ca > 0.45) continue;   // dégage le front
      const y = 0.12 - row * 0.065, rad = 0.2 - row * 0.01;
      const c = ball(0.05, hair);
      c.position.set(Math.sin(a) * rad, y, -ca * rad + 0.02);
      r.head.add(c);
    }
  }
  // tarbouche
  r.fez = joint(r.head, 0.01, 0.18, 0.015);
  r.fez.rotation.z = 0.1; r.fez.rotation.x = 0.06;
  r.fez.add(prim(cached('fezGeo2', () => new THREE.CylinderGeometry(0.125, 0.17, 0.23, 32)), red, 1, 1, 1, 0, 0.1, 0));
  r.fez.add(prim(cached('fezTop', () => new THREE.CylinderGeometry(0.126, 0.126, 0.012, 32)), std('#8e1820', 0.5), 1, 1, 1, 0, 0.22, 0));
  r.tassel = joint(r.fez, 0, 0.225, 0);
  r.tassel.add(prim(G.cyl, std('#141414', 0.6), 0.012, 0.17, 0.012, 0, -0.085, 0));
  r.tassel.add(prim(G.sphere, std('#141414', 0.6), 0.03, 0.05, 0.03, 0, -0.18, 0));
  // bras
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = r['sh' + k] = joint(r.torso, s * 0.235, 0.43, 0);
    sh.add(ball(0.085, shirt));
    const sleeve = prim(cached('sleeve', () => new THREE.CylinderGeometry(0.085, 0.078, 0.15, 20)), shirt, 1, 1, 1, 0, -0.07, 0);
    sh.add(sleeve);
    sh.add(prim(cached('uarm', () => new THREE.CylinderGeometry(0.058, 0.052, 0.18, 16)), skin, 1, 1, 1, 0, -0.18, 0));
    const el = r['el' + k] = joint(sh, 0, -0.27, 0);
    el.add(ball(0.052, skin));
    el.add(lathe([[0, -0.24], [0.04, -0.235], [0.047, -0.15], [0.054, -0.04], [0.05, 0], [0, 0.01]], skin, 16));
    const hand = ball(0.062, skin); hand.scale.set(0.85, 1.05, 0.95); hand.position.y = -0.28; el.add(hand);
  }
  // jambes
  const { upper, sole } = sneakerGeos();
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const th = r['th' + k] = joint(r.hips, s * 0.105, -0.02, 0);
    th.add(prim(cached('shortsLeg', () => new THREE.CylinderGeometry(0.115, 0.125, 0.36, 20)), shorts, 1, 1, 1, 0, -0.17, 0));
    th.add(prim(G.box, std('#b08c55'), 0.06, 0.09, 0.02, s * 0.11, -0.2, 0, false).rotateY(s * Math.PI / 2));   // poche cargo
    th.add(prim(G.cyl, skin, 0.065, 0.1, 0.065, 0, -0.38, 0));
    const kn = r['kn' + k] = joint(th, 0, -0.42, 0);
    kn.add(ball(0.066, skin));
    kn.add(lathe([[0, -0.3], [0.05, -0.3], [0.056, -0.2], [0.075, -0.1], [0.068, 0], [0, 0.01]], skin, 18));
    kn.add(prim(G.cyl, sock, 0.058, 0.08, 0.058, 0, -0.34, 0));
    const an = r['an' + k] = joint(kn, 0, -0.4, 0);
    const shoe = mesh(upper, white); shoe.position.y = -0.04; an.add(shoe);
    const so = mesh(sole, red); so.position.y = -0.06; an.add(so);
    an.add(prim(G.box, red, 0.012, 0.05, 0.12, s * 0.07, 0.03, -0.03, false));   // bande latérale
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData.rig = r;
  root.userData.pivot = pivot;
  return root;
}

// Pose cible du coureur, interpolée en douceur.
const POSE_KEYS = ['hipsY', 'hipsYaw', 'lean', 'twist', 'headYaw', 'headPitch', 'thL', 'thLz', 'knL', 'thR', 'thRz', 'knR',
  'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR', 'anL', 'anR', 'roll'];
export function animateRunner(root, mode, ph, dt, extra) {
  const r = root.userData.rig;
  const s = Math.sin(ph), c = Math.cos(ph), t = extra && extra.time || 0;
  const base = { hipsY: 0.98, hipsYaw: 0, lean: 0, twist: 0, headYaw: 0, headPitch: 0, thL: 0, thLz: 0, knL: 0, thR: 0, thRz: 0, knR: 0,
    shLx: 0, shLz: -0.12, elL: 0.2, shRx: 0, shRz: 0.12, elR: 0.2, anL: 0, anR: 0, roll: 0 };
  let p;
  if (mode === 'run') {
    p = {
      hipsY: 0.96 + Math.abs(c) * 0.07, hipsYaw: -s * 0.14, lean: -0.24, twist: s * 0.3, headYaw: -s * 0.2, headPitch: 0.12,
      thL: s * 1.0, knL: -(0.3 + 1.55 * Math.max(0, c)), thR: -s * 1.0, knR: -(0.3 + 1.55 * Math.max(0, -c)),
      shLx: -s * 1.05, shLz: -0.18, elL: 1.55 + s * 0.15, shRx: s * 1.05, shRz: 0.18, elR: 1.55 - s * 0.15,
      anL: 0.45 * Math.max(0, -s), anR: 0.45 * Math.max(0, s)
    };
  } else if (mode === 'jump') {
    p = { hipsY: 0.98, lean: -0.15, headPitch: 0.15, thL: 1.25, knL: -1.9, thR: 0.35, knR: -0.9, shLx: -2.5, shLz: -0.65, elL: 0.6, shRx: -2.3, shRz: 0.75, elR: 0.5, anL: 0.3, anR: 0.4 };
  } else if (mode === 'slide') {
    // glissade de baseball : buste en arrière, jambe tendue devant, une main qui frôle le sol
    p = { hipsY: 0.3, lean: 0.95, headPitch: -0.75, thL: 1.5, knL: -0.12, thR: 1.15, knR: -1.35, shLx: 0.75, shLz: -0.7, elL: 0.15,
      shRx: -1.3, shRz: 0.5, elR: 0.9, anL: -0.3, anR: 0.1, roll: 0.08 };
  } else if (mode === 'fly') {
    p = { hipsY: 0.38, lean: -0.05, thL: 1.45, thLz: -0.7, knL: -2.4, thR: 1.45, thRz: 0.7, knR: -2.4, shLx: -0.3, shLz: -1.2, elL: 0.4, shRx: -0.3, shRz: 1.2, elR: 0.4, headPitch: 0.1 };
  } else if (mode === 'fall') {
    p = { hipsY: 0.88, lean: 0.5, headPitch: -0.4, thL: 0.7, knL: -0.7, thR: -0.2, knR: -0.4, shLx: -2.8, shLz: -0.8, elL: 0.3, shRx: -2.8, shRz: 0.8, elR: 0.3 };
  } else {
    // repos (menu) : respiration, regard qui balaie le souk
    p = { hipsY: 0.98 + Math.sin(t * 2) * 0.008, headYaw: Math.sin(t * 0.6) * 0.45, headPitch: 0.05 + Math.sin(t * 0.9) * 0.05,
      shLz: -0.1 - Math.sin(t * 2) * 0.02, shRz: 0.1 + Math.sin(t * 2) * 0.02, elL: 0.25, elR: 0.25, twist: Math.sin(t * 0.6) * 0.08 };
  }
  const tgt = { ...base, ...p };
  const cur = root.userData.pose || (root.userData.pose = { ...tgt });
  const k = Math.min(1, dt * (mode === 'run' ? 24 : 13));
  for (const key of POSE_KEYS) cur[key] += (tgt[key] - cur[key]) * k;
  r.hips.position.y = cur.hipsY; r.hips.rotation.y = cur.hipsYaw;
  r.torso.rotation.x = cur.lean; r.torso.rotation.y = cur.twist;
  r.head.rotation.y = cur.headYaw - cur.twist * 0.6; r.head.rotation.x = cur.headPitch - cur.lean * 0.5;
  r.thL.rotation.x = cur.thL; r.thL.rotation.z = cur.thLz; r.knL.rotation.x = cur.knL;
  r.thR.rotation.x = cur.thR; r.thR.rotation.z = cur.thRz; r.knR.rotation.x = cur.knR;
  r.shL.rotation.x = cur.shLx; r.shL.rotation.z = cur.shLz; r.elL.rotation.x = cur.elL;
  r.shR.rotation.x = cur.shRx; r.shR.rotation.z = cur.shRz; r.elR.rotation.x = cur.elR;
  r.anL.rotation.x = cur.anL; r.anR.rotation.x = cur.anR;
  r.hips.rotation.z = cur.roll;
  r.tassel.rotation.x = 0.5 + Math.sin(ph * 0.5) * 0.35 + (extra && extra.vy > 0 ? -0.6 : 0) + (mode === 'slide' ? -0.8 : 0);
  r.tassel.rotation.z = Math.sin(ph * 0.7) * 0.2;
}

// Le singe magot (sans queue, comme les vrais macaques de l'Atlas).
export function buildMonkey() {
  const root = new THREE.Group();
  root.scale.setScalar(0.85);
  const fur = std('#9b7651', 0.85), dark = std('#6e5034', 0.85), light = std('#c09a6e', 0.85), skin = std('#e0a08a', 0.6);
  const r = {};
  r.body = joint(root, 0, 0.62, 0);
  const trunk = ball(0.3, fur); trunk.scale.set(1, 0.9, 1.35); r.body.add(trunk);
  const rump = ball(0.22, light); rump.position.set(0, 0.02, 0.28); rump.scale.set(1, 0.9, 0.6); r.body.add(rump);
  r.body.add(prim(G.sphereLow, dark, 0.06, 0.06, 0.06, 0, 0.12, 0.42));
  r.head = joint(r.body, 0, 0.2, -0.42);
  r.head.add(ball(0.21, fur));
  r.head.add(prim(G.cone, dark, 0.09, 0.14, 0.09, 0, 0.22, 0.02));
  for (const s of [-1, 1]) { r.head.add(prim(G.sphere, skin, 0.085, 0.1, 0.05, s * 0.22, 0.03, 0.02)); r.head.add(prim(G.sphereLow, std('#c27b66'), 0.05, 0.065, 0.03, s * 0.225, 0.03, 0.045)); }
  const face = prim(G.sphere, skin, 0.15, 0.16, 0.08, 0, -0.03, -0.16); r.head.add(face);
  for (const s of [-1, 1]) r.head.add(prim(G.sphereLow, std('#1a1008'), 0.03, 0.035, 0.02, s * 0.06, 0.03, -0.235));
  r.head.add(prim(G.sphereLow, std('#c27b66'), 0.08, 0.06, 0.05, 0, -0.08, -0.22));
  // tarbouche volé, visible quand le singe attrape le joueur
  r.fez = joint(r.head, 0.03, 0.2, 0);
  r.fez.rotation.z = -0.25;
  r.fez.add(mesh(cached('fezGeo2', () => new THREE.CylinderGeometry(0.125, 0.17, 0.23, 32)), std('#c1272d', 0.55)));
  r.fez.children[0].position.y = 0.1;
  r.fez.visible = false;
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = r['ar' + k] = joint(r.body, s * 0.2, -0.05, -0.3);
    const up = capsule(0.07, 0.2, s < 0 ? dark : fur); up.position.y = -0.16; sh.add(up);
    const el = r['fo' + k] = joint(sh, 0, -0.32, 0);
    const fo = capsule(0.06, 0.18, s < 0 ? dark : fur); fo.position.y = -0.11; el.add(fo);
    const h = ball(0.065, skin); h.position.y = -0.24; el.add(h);
    const hp = r['hp' + k] = joint(r.body, s * 0.19, -0.05, 0.3);
    const th = capsule(0.09, 0.18, fur); th.position.y = -0.14; hp.add(th);
    const kn = r['kn' + k] = joint(hp, 0, -0.27, 0);
    const sn = capsule(0.07, 0.16, fur); sn.position.y = -0.1; kn.add(sn);
    const ft = prim(G.sphereLow, std('#4a3220'), 0.07, 0.05, 0.12, 0, -0.22, -0.03); kn.add(ft);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
  } else if (mode === 'sit') {
    // assis, l'air malicieux, se gratte la tête
    body = 0.9; by = 0.42;
    aL = 0.6; aR = 3.0 + Math.sin(ph * 4) * 0.15; fL = 0.5; fR = 1.6;
    hL = 1.5; hR = 1.4; kL = -1.9; kR = -1.8; head = -0.75 + Math.sin(ph * 0.5) * 0.1;
  } else {
    // agrippé au dos du joueur, bras levés en triomphe
    body = 1.2; by = 0.8;
    aL = 2.9 + Math.sin(ph * 3) * 0.2; aR = 2.9 - Math.sin(ph * 3) * 0.2; fL = -0.3; fR = -0.3;
    hL = -1.4; hR = -1.4; kL = -1.2; kR = -1.2; head = -1.0;
  }
  const k = Math.min(1, dt * 14);
  const L = (o, v) => { o.rotation.x += (v - o.rotation.x) * k; };
  const spread = mode === 'gallop' ? 0 : mode === 'chase' ? 0.55 : mode === 'sit' ? 0.25 : 0.35;
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

// Pièce de dirham (monnaie premium, rare sur la piste) : argentée à étoile verte, avec halo.
let dirhamProto = null;
export function buildDirham() {
  if (!dirhamProto) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.09, 28);
    geo.rotateX(Math.PI / 2);
    const face = new THREE.MeshStandardMaterial({ map: T.coinTexture(), color: '#bfeedd', metalness: 0.6, roughness: 0.3, emissive: '#0c3d2a' });
    const edge = new THREE.MeshStandardMaterial({ color: '#d7efe6', metalness: 0.7, roughness: 0.25 });
    const coin = new THREE.Mesh(geo, [edge, face, face]);
    coin.castShadow = true;
    g.add(coin);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowTexture(), color: '#7dffc4', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    halo.scale.setScalar(2.2);
    g.add(halo);
    dirhamProto = g;
  }
  const c = dirhamProto.clone();
  c.userData.coin = c.children[0];
  return c;
}
