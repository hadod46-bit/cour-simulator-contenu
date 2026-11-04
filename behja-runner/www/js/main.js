/*
 * Behja Runner — course infinie en 3D dans les souks de Marrakech (Three.js / WebGL).
 *
 * Logique de jeu : x = latéral (voies -2.6 / 0 / +2.6), y = hauteur, z = distance parcourue (vers l'avant).
 * Rendu 3D : un point logique (x, y, z) est placé en (x, y, -z) dans la scène.
 */
import * as THREE from '../lib/three.module.min.js';
import { clamp, lerp, rand, randInt, pick, shuffle, hash, mod, smooth, hexRgb, mixRgb, rgbStr, store } from './util.js';
import { Sound } from './audio.js';
import * as T from './textures.js';
import * as M from './models.js';
import { loadHero } from './hero.js';
import { loadMonkey } from './monkey3d.js';
import { PERSOS, persoParId } from './persos.js';
import { eco, CHANCE_DIRHAM } from './eco.js';
import { initShop } from './shop.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- constantes de jeu
const LANE = 2.6, LANES = [-LANE, 0, LANE];
const ROAD = 4.4, WALL_X = 6.6;
const CAM_BACK = 5.0, CAM_H = 3.5, FAR = 200, BEHIND = 14;
const STALL_H = 2.8, RAMP_LEN = 8;
const GRAV = 42, JUMP_V = 13.5, SUPER_JUMP_V = 19.5;
const PH = 1.75, PH_SLIDE = 0.75;
const SPEED0 = 15, SPEED_MAX = 34;
const DUREES = { aimant: 10, babouches: 10, tapis: 7, x2: 15 };
const NOMS = { aimant: 'Aimant', babouches: 'Babouches', tapis: 'Tapis volant', x2: 'Score ×2' };
const GOODS = ['epices', 'oranges', 'lanternes', 'tapis', 'babouches', 'poteries'];
// Capture : bond du singe, bagarre sur le dos de Yassine, vol du tarbouche, puis écran de fin.
const BOND = 0.5, VOL = 2.1, FIN = 3.2;

// ---------------------------------------------------------------- moteur 3D
const canvas = $('jeu');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
T.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#f7dcaa', 50, 170);
const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 700);

const hemi = new THREE.HemisphereLight('#bfe0ff', '#c98a55', 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.castShadow = true;
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -16;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// Qualité adaptative : on baisse la résolution / les ombres si le téléphone peine.
let quality = store.get('qualite', 0);
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const ratio = [Math.min(dpr, 2), Math.min(dpr, 1.5), Math.min(dpr, 1.15), 0.9][quality];
  renderer.setPixelRatio(ratio);
  const shadows = quality < 2;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
  sun.shadow.mapSize.set(quality === 0 ? 2048 : 1024, quality === 0 ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize();
}

let W = 1, H = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // champ horizontal ~52° quelle que soit l'orientation de l'écran
  const vf = 2 * Math.atan(Math.tan((52 * Math.PI) / 360) / camera.aspect) * 180 / Math.PI;
  camera.fov = clamp(vf, 50, 80);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- décor permanent
// Ciel / Atlas / Koutoubia sur une grande toile lointaine.
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(620, 620),
  new THREE.MeshBasicMaterial({ map: T.backdropTexture(), fog: false, depthWrite: false })
);
backdrop.renderOrder = -1;
scene.add(backdrop);

const clouds = [];
for (let i = 0; i < 7; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloudTexture(), fog: false, transparent: true, depthWrite: false, opacity: 0.95 }));
  s.scale.set(45 + hash(i) * 40, 20 + hash(i * 2) * 12, 1);
  s.userData = { x: (hash(i * 5.3) - 0.5) * 360, y: 55 + hash(i * 2.9) * 120, v: 1 + hash(i * 4.4) * 2 };
  s.renderOrder = -1;
  clouds.push(s);
  scene.add(s);
}

// Chaussée et trottoirs : textures qui défilent pour suivre la distance parcourue.
const GROUND_L = 300;
const roadTex = T.roadTexture();
roadTex.repeat.set(1, GROUND_L / T.ROAD_L);
const road = new THREE.Mesh(new THREE.PlaneGeometry(T.ROAD_W, GROUND_L), new THREE.MeshLambertMaterial({ map: roadTex }));
road.rotation.x = -Math.PI / 2;
road.receiveShadow = true;
scene.add(road);
const swTex = T.sidewalkTexture();
const SW_W = WALL_X - ROAD;
swTex.repeat.set(1, GROUND_L / SW_W);
const sidewalks = [-1, 1].map(s => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(SW_W, GROUND_L), new THREE.MeshLambertMaterial({ map: swTex }));
  m.rotation.x = -Math.PI / 2;
  m.position.x = s * (ROAD + SW_W / 2);
  m.receiveShadow = true;
  scene.add(m);
  return m;
});

// Remparts : segments recyclés.
const SEG = 6, NSEG = Math.ceil((FAR + BEHIND) / SEG) + 2;
const walls = { '-1': [], '1': [] };
for (const side of [-1, 1]) {
  for (let k = 0; k < NSEG; k++) {
    const seg = M.buildWallSegment(side);
    seg.position.x = side * (WALL_X + 0.3);
    seg.userData.idx = null;
    walls[side].push(seg);
    scene.add(seg);
  }
}
function updateWalls(pz) {
  const i0 = Math.floor((pz - BEHIND) / SEG);
  for (const side of [-1, 1]) {
    for (let k = 0; k < NSEG; k++) {
      const idx = i0 + k, seg = walls[side][mod(idx, NSEG)];
      if (seg.userData.idx === idx) continue;
      seg.userData.idx = idx;
      seg.position.z = -(idx * SEG + SEG / 2);
      M.setWallLook(seg, Math.floor(hash(idx * 3.7 + side * 11.3) * T.WALL_VARIANTS), Math.floor(hash(idx * 7.31 + side * 3.17) * T.PAL.walls.length));
    }
  }
}

// Pièces (instanciées : un seul appel de dessin).
const coinMesh = M.buildCoins(400);
scene.add(coinMesh);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

// Personnages
let runner = M.buildRunner();   // personnage de secours, remplacé dès que le modèle animé est chargé
scene.add(runner);
const herosCharges = new Map();
let persoVoulu = null;
function chargerPerso(id) {
  if (!herosCharges.has(id)) herosCharges.set(id, loadHero(persoParId(id)));
  return herosCharges.get(id);
}
// Affiche un personnage (sélection ou aperçu dans la boutique).
function afficherPerso(id) {
  persoVoulu = id;
  chargerPerso(id).then(h => {
    if (persoVoulu !== id || runner === h) return;
    h.userData.rig.fez.visible = true;
    h.position.copy(runner.position);
    h.rotation.copy(runner.rotation);
    scene.remove(runner);
    runner = h;
    scene.add(runner);
    if (monkeyObj.userData.setHat) monkeyObj.userData.setHat(persoParId(id).chapeau);
  }).catch(e => console.warn('Modèle 3D indisponible, personnage de secours utilisé', e));
}
afficherPerso(eco.perso);
let monkeyObj = M.buildMonkey();   // singe de secours, remplacé par le modèle animé
monkeyObj.scale.setScalar(0.75);
const camDir = new THREE.Vector3();
scene.add(monkeyObj);
loadMonkey('models/singe.glb').then(m => {
  m.userData.rig.fez.visible = monkeyObj.userData.rig.fez.visible;
  m.userData.setHat(persoParId(eco.perso).chapeau);
  scene.remove(monkeyObj);
  monkeyObj = m;
  scene.add(monkeyObj);
}).catch(e => console.warn('Singe 3D indisponible, singe de secours utilisé', e));
const carpet = M.buildFlyingCarpet();
carpet.visible = false;
scene.add(carpet);

// Particules (poussière, étincelles)
const puffs = [];
for (let i = 0; i < 48; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.softTexture(), transparent: true, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  puffs.push(s);
}
let puffIdx = 0;
function puff(x, y, z, color, size, life, vx, vy, vz, follow) {
  const s = puffs[puffIdx++ % puffs.length];
  s.visible = true;
  s.material.color.set(color);
  s.userData = { x, y, z, vx, vy, vz, life, max: life, size, follow };
}

// Prototypes de décor clonés (géométries partagées).
const protos = new Map();
function proto(key, build) {
  let p = protos.get(key);
  if (!p) { p = build(); protos.set(key, p); }
  const c = p.clone();
  delete c.userData.dispose;   // les géométries restent partagées avec le prototype
  return c;
}

function removeObj(obj) {
  scene.remove(obj);
  obj.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  if (obj.userData.dispose) for (const g of obj.userData.dispose) if (g.dispose) g.dispose();
}

// ---------------------------------------------------------------- état du jeu
let state = 'menu';
let speed = SPEED0, score = 0, coinsRun = 0, dirhamsRun = 0, time = 0, shake = 0, dyingT = 0;
let best = store.get('record', 0);
let relances = 0, rialsComptes = 0, dirhamsComptes = 0;   // « Continuer » et gains déjà crédités
const powerMax = { aimant: 1, babouches: 1, tapis: 1, x2: 1 };
let gems = [];   // dirhams posés sur la piste
const p = {};
const monkey = { dist: 2.5, x: 0, y: 0, phase: 0, danger: 0, intro: 0 };
const power = { aimant: 0, babouches: 0, tapis: 0, x2: 0 };
let obstacles = [], coins = [], powerups = [], decor = [], palms = [];
let genZ = 0, lastPowerZ = 0, decorZ = 0, palmZ = 0, flyCoinZ = 0;
const cam = { x: 0, y: CAM_H };
let camIntro = 0, cadreBoutique = 0;

function resetWorld(withObstacles) {
  for (const arr of [obstacles, powerups, decor, palms]) for (const e of arr) if (e.obj) removeObj(e.obj);
  obstacles = []; coins = []; powerups = []; decor = []; palms = [];
  for (const s of puffs) s.visible = false;
  Object.assign(p, {
    lane: 1, laneFrom: 1, x: 0, y: 0, vy: 0, z: 0, ground: 0, slide: 0, onGround: true,
    phase: 0, ghost: 0, coyote: 0, jumpBuf: 0, slideQueued: false, ignore: null, ignoreT: 0, lastStep: 0
  });
  speed = withObstacles ? SPEED0 : 9; score = 0; coinsRun = 0; dirhamsRun = 0; time = 0; shake = 0; dyingT = 0;
  relances = 0; rialsComptes = 0; dirhamsComptes = 0;
  for (const g of gems) if (g.obj) scene.remove(g.obj);
  gems = [];
  for (const k in power) power[k] = 0;
  genZ = withObstacles ? 70 : Infinity; lastPowerZ = 0; decorZ = -BEHIND; palmZ = -BEHIND; flyCoinZ = 0;
  Object.assign(monkey, { dist: 2.4, x: 0, y: 0, danger: 0, intro: 2.8, lastStep: 0, wait: 0 });
  runner.userData.rig.fez.visible = true;
  monkeyObj.userData.rig.fez.visible = false;
  cam.x = 0; cam.y = CAM_H;
  if (withObstacles) coinLine(1, 18, 58);
}

// ---------------------------------------------------------------- génération du niveau
function addStall(lane, z0, len, opts) {
  opts = opts || {};
  const o = {
    type: 'stand', lane, x: LANES[lane], z0, z1: z0 + len, h: STALL_H, hw: 1.1,
    v: opts.v || 0, moving: !!opts.v, active: false,
    variant: opts.variant || pick(GOODS), aw: randInt(0, T.PAL.awnings.length - 1), seed: Math.random() * 1000
  };
  obstacles.push(o);
  return o;
}
function addRamp(lane, z0) { obstacles.push({ type: 'rampe', lane, x: LANES[lane], z0, z1: z0 + RAMP_LEN, h: STALL_H, hw: 1.1 }); }
function addLow(lane, z) {
  obstacles.push({ type: 'bas', lane, x: LANES[lane], z0: z - 0.45, z1: z + 0.45, h: 1.0, hw: 1.15,
    variant: pick(['caisse', 'tapis', 'poteries']), seed: Math.random() * 1000 });
}
function addHigh(lane, z) {
  obstacles.push({ type: 'haut', lane, x: LANES[lane], z0: z - 0.3, z1: z + 0.3, yb: 1.2, h: 3.2, hw: 1.15, rug: randInt(0, 3) });
}
function addCoin(x, y, z) {
  if (z > 300 && Math.random() < CHANCE_DIRHAM) gems.push({ x, y, z });
  else coins.push({ x, y, z });
}
function coinLine(lane, z0, z1, y, step) { for (let z = z0; z <= z1; z += step || 3) addCoin(LANES[lane], y || 0.9, z); }
function coinArc(lane, zc, base) {
  for (let i = -3; i <= 3; i++) { const t = i / 3.5; addCoin(LANES[lane], (base || 0) + 0.9 + 1.4 * (1 - t * t), zc + i * 2); }
}
function coinRamp(lane, z0, len) {
  for (let z = z0 + 1; z < z0 + RAMP_LEN; z += 2.5) addCoin(LANES[lane], STALL_H * (z - z0) / RAMP_LEN + 0.9, z);
  for (let z = z0 + RAMP_LEN + 1.5; z < z0 + RAMP_LEN + len; z += 3) addCoin(LANES[lane], STALL_H + 0.9, z);
}
function maybePower(lane, z) {
  if (z - lastPowerZ > 380 && Math.random() < 0.4) {
    lastPowerZ = z;
    powerups.push({ kind: pick(['aimant', 'babouches', 'tapis', 'x2']), x: LANES[lane], y: 1.1, z });
    return true;
  }
  return false;
}
function patStalls(z, diff) {
  const lanes = shuffle([0, 1, 2]);
  const n = Math.random() < 0.3 + 0.4 * diff ? 2 : 1;
  let end = z;
  for (let i = 0; i < n; i++) {
    const lane = lanes[i];
    let zz = z + (i ? rand(0, 8) : 0);
    const len = rand(10, 18 + 8 * diff);
    if (Math.random() < 0.45) { addRamp(lane, zz); if (Math.random() < 0.75) coinRamp(lane, zz, len); zz += RAMP_LEN; }
    addStall(lane, zz, len);
    end = Math.max(end, zz + len);
  }
  const fl = lanes[n];
  if (diff > 0.2 && Math.random() < 0.5) {
    const bz = z + rand(6, Math.max(8, end - z - 4));
    if (Math.random() < 0.5) { addLow(fl, bz); coinArc(fl, bz); } else { addHigh(fl, bz); coinLine(fl, bz - 6, bz + 6, 0.5, 2); }
  } else if (!maybePower(fl, z + 8)) coinLine(fl, z, end, 0.9, 3);
  return end;
}
function patWall(z) {
  const lanes = shuffle([0, 1, 2]);
  const len = rand(14, 22);
  addRamp(lanes[0], z); addStall(lanes[0], z + RAMP_LEN, len); coinRamp(lanes[0], z, len);
  let end = z + RAMP_LEN + len;
  for (const l of [lanes[1], lanes[2]]) { const s = addStall(l, z + RAMP_LEN - rand(1, 3), len + rand(2, 10)); end = Math.max(end, s.z1); }
  return end;
}
function patRow(z, diff) {
  let end = z;
  const rows = Math.random() < 0.3 + 0.4 * diff ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const zz = z + r * rand(16, 22);
    const types = [0, 1, 2].map(() => (Math.random() < 0.5 ? 'bas' : 'haut'));
    if (Math.random() < 0.6 - 0.4 * diff) types[randInt(0, 2)] = null;
    types.forEach((t, l) => { if (t === 'bas') addLow(l, zz); else if (t === 'haut') addHigh(l, zz); });
    const cl = randInt(0, 2);
    if (types[cl] === 'bas') coinArc(cl, zz); else coinLine(cl, zz - 6, zz + 6, 0.6, 2);
    end = zz + 1;
  }
  return end;
}
function patZigzag(z) {
  let l = randInt(0, 2), zz = z;
  const n = randInt(3, 5);
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.5) addLow(l, zz); else addHigh(l, zz);
    let nl;
    do { nl = randInt(0, 2); } while (nl === l);
    coinLine(nl, zz - 2, zz + 2, 0.9, 2);
    l = nl;
    zz += rand(10, 13) + speed * 0.2;
  }
  return zz;
}
function patCart(z, diff) {
  const lanes = shuffle([0, 1, 2]);
  const o = addStall(lanes[0], z + 45, rand(8, 10), { v: rand(6, 9) + 5 * diff, variant: 'charrette' });
  if (Math.random() < 0.5) { addStall(lanes[1], z + rand(10, 28), rand(10, 16)); coinLine(lanes[2], z, z + 45, 0.9, 3); }
  else coinLine(lanes[1], z, z + 45, 0.9, 3);
  return o.z1;
}
function patBreath(z) {
  const l = randInt(0, 2);
  if (!maybePower(l, z + 10)) coinLine(l, z, z + 30, 0.9, 3);
  return z + 30;
}
function generate() {
  while (genZ < p.z + FAR) {
    const diff = clamp((speed - SPEED0) / (SPEED_MAX - SPEED0), 0, 1);
    const pats = [[patBreath, 1.2 - diff], [patStalls, 3], [patRow, 2], [patZigzag, 0.8 + diff],
      [patWall, diff > 0.1 ? 1.2 : 0.3], [patCart, diff > 0.05 ? 1 + diff : 0.3]];
    let tot = 0;
    for (const q of pats) tot += q[1];
    let r = Math.random() * tot, fn = pats[0][0];
    for (const q of pats) { r -= q[1]; if (r <= 0) { fn = q[0]; break; } }
    genZ = fn(genZ, diff) + 14 + speed * 0.55;
  }
}
function genDecor() {
  while (decorZ < p.z + FAR) {
    decorZ += rand(5, 11);
    const side = Math.random() < 0.5 ? -1 : 1;
    decor.push({ kind: pick(['pot', 'sac', 'pot', 'pile', 'chat', 'sac']), x: side * rand(5.0, 5.9), z: decorZ, side, c: randInt(0, 5) });
    if (Math.random() < 0.16) decor.push({ kind: 'guirlande', x: 0, z: decorZ + 3, c: randInt(0, 2) });
  }
  while (palmZ < p.z + FAR) {
    palmZ += rand(14, 30);
    palms.push({ x: (Math.random() < 0.5 ? -1 : 1) * rand(WALL_X + 3, WALL_X + 9), z: palmZ, h: rand(10, 14), v: randInt(0, 3) });
  }
}

// ---------------------------------------------------------------- physique
function surfaceTop(o, z) { return o.type === 'rampe' ? o.h * clamp((z - o.z0) / (o.z1 - o.z0), 0, 1) : o.h; }
function groundAt(x, z, feet) {
  let g = 0;
  for (const o of obstacles) {
    if (o.type !== 'stand' && o.type !== 'rampe') continue;
    if (z < o.z0 - 0.3 || z > o.z1 + 0.3) continue;
    if (Math.abs(x - o.x) > o.hw + 0.1) continue;
    const top = surfaceTop(o, z), tol = o.type === 'rampe' ? 1.0 : 0.4;
    if (top <= feet + tol && top > g) g = top;
  }
  return g;
}
function insideStand() {
  for (const o of obstacles) {
    if (o.type === 'stand' && p.z > o.z0 - 0.4 && p.z < o.z1 + 0.4 && Math.abs(p.x - o.x) < o.hw + 0.3 && p.y < o.h - 0.4) return true;
  }
  return false;
}
function act(d) {
  if (state !== 'play') return;
  if (d === 'gauche' || d === 'droite') {
    const nl = clamp(p.lane + (d === 'gauche' ? -1 : 1), 0, 2);
    if (nl !== p.lane) { p.laneFrom = p.lane; p.lane = nl; Sound.swish(); } else shake = Math.max(shake, 0.12);
  } else if (d === 'haut') {
    if (power.tapis > 0) return;
    if (p.onGround || p.coyote > 0) doJump(); else p.jumpBuf = 0.18;
  } else if (d === 'bas') {
    if (power.tapis > 0) return;
    if (p.onGround) { p.slide = 0.7; Sound.slide(); } else { p.vy = Math.min(p.vy, -22); p.slideQueued = true; }
  }
}
function doJump() {
  p.vy = power.babouches > 0 ? SUPER_JUMP_V : JUMP_V;
  p.airT = 0;
  p.trick = power.babouches > 0 ? 'salto' : Math.random() < 0.3 ? 'vrille' : null;
  p.onGround = false; p.slide = 0; p.coyote = 0; p.jumpBuf = 0;
  Sound.jump();
}
const vibrate = pattern => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignoré */ } };
function stumble() {
  if (monkey.danger > 0) { crash(); return; }
  monkey.danger = 5; shake = 0.35;
  p.hitT = 0.45;
  Sound.bump(); Sound.monkey(); vibrate(70);
}
function crash() {
  if (state !== 'play') return;
  state = 'dying'; dyingT = 0; shake = 0.6;
  monkey.startDist = Math.min(monkey.dist, 3.4);   // le singe surgit dans le champ, jamais contre la caméra
  Sound.crash(); Sound.monkey(); Sound.stopMusic();
  vibrate([60, 40, 140]);
}
function onHit(o) {
  const changing = Math.abs(p.x - LANES[p.lane]) > 0.2;
  if (changing && o.lane === p.lane && p.lane !== p.laneFrom) {
    p.lane = p.laneFrom; p.ignore = o; p.ignoreT = 0.5;
    stumble();
  } else {
    if (p.z - o.z0 < 1.5) p.z = Math.min(p.z, o.z0 - 0.45);
    crash();
  }
}
function checkCollisions() {
  if (p.ghost > 0 || power.tapis > 0) return;
  const ph = p.slide > 0 ? PH_SLIDE : PH;
  for (const o of obstacles) {
    if (o === p.ignore && p.ignoreT > 0) continue;
    if (p.z + 0.35 < o.z0 || p.z - 0.35 > o.z1) continue;
    if (Math.abs(p.x - o.x) > o.hw + 0.3) continue;
    let hit;
    if (o.type === 'haut') hit = p.y + ph > o.yb && p.y < o.h;
    else if (o.type === 'rampe') hit = p.y < surfaceTop(o, p.z) - 1.0;
    else hit = p.y < o.h - 0.4;
    if (hit) { onHit(o); return; }
  }
}
function activatePower(kind, duree) {
  power[kind] = powerMax[kind] = duree || eco.duree(kind, DUREES[kind]);
  if (kind === 'tapis') { flyCoinZ = p.z + 20; p.slide = 0; }
  Sound.power(); toast(NOMS[kind] + ' !'); vibrate(30);
}

// ---------------------------------------------------------------- mise à jour de la logique
function prune(arr, keep) {
  const out = [];
  for (const e of arr) { if (keep(e)) out.push(e); else if (e.obj) removeObj(e.obj); }
  return out;
}
function update(dt) {
  time += dt;
  shake = Math.max(0, shake - dt * 1.5);
  if (state === 'pause') return;
  const playing = state === 'play';
  if (playing) speed = Math.min(SPEED_MAX, SPEED0 + time * 0.11);
  const sp = state === 'dying' || state === 'over' || state === 'menu' ? 0 : speed;

  p.z += sp * dt;
  p.phase += dt * (sp > 0 ? 5 + sp * 0.33 : 0);
  const tx = LANES[p.lane];
  p.x += (tx - p.x) * Math.min(1, dt * 15);
  if (Math.abs(tx - p.x) < 0.01) { p.x = tx; p.laneFrom = p.lane; }
  for (const k of ['slide', 'ghost', 'ignoreT', 'coyote', 'jumpBuf']) p[k] = Math.max(0, p[k] - dt);

  if (state === 'dying') {
    dyingT += dt;
    p.vy -= GRAV * dt; p.y = Math.max(p.ground, p.y + p.vy * dt);
  } else if (power.tapis > 0) {
    p.y += (6.5 - p.y) * Math.min(1, dt * 3);
    p.vy = 0; p.onGround = false;
    p.ground = groundAt(p.x, p.z, 99);
  } else {
    const prevY = p.y, wasGround = p.onGround;
    p.vy -= GRAV * dt; p.y += p.vy * dt;
    const g = groundAt(p.x, p.z, prevY);
    p.ground = g;
    if (p.y <= g) {
      if (!wasGround && p.vy < -8) { Sound.land(); for (let i = 0; i < 4; i++) puff(p.x + rand(-0.4, 0.4), g + 0.1, p.z, '#ead2a8', 0.5, 0.5, rand(-1, 1), rand(0.5, 1.2), 0, false); }
      p.y = g; p.vy = 0; p.onGround = true;
      if (p.slideQueued) { p.slideQueued = false; p.slide = 0.6; Sound.slide(); }
      if (p.jumpBuf > 0) doJump();
    } else {
      if (wasGround && p.vy <= 0) p.coyote = 0.1;
      p.onGround = false;
    }
  }
  p.airT = (p.airT || 0) + dt;
  // poussière pendant la glissade
  if (p.slide > 0 && p.onGround && sp > 0 && Math.random() < 0.6) puff(p.x + rand(-0.3, 0.3), p.ground + 0.1, p.z + 0.4, '#ead2a8', 0.5, 0.5, rand(-1, 1), rand(0.4, 1.2), 0, false);
  if (playing) checkCollisions();
  if (p.ghost > 0 && p.ghost < 0.15 && insideStand()) p.ghost = 0.15;

  if (playing) {
    for (const k in power) {
      if (power[k] <= 0) continue;
      power[k] = Math.max(0, power[k] - dt);
      if (k === 'tapis' && power[k] === 0) { p.ghost = 2; p.vy = 0; }
    }
    if (power.tapis > 1.2) {
      while (flyCoinZ < p.z + 60) {
        flyCoinZ += 2.5;
        coins.push({ x: LANES[clamp(Math.round(1 + Math.sin(flyCoinZ * 0.045) * 1.2), 0, 2)], y: 7.4, z: flyCoinZ });
      }
    }
    score += sp * dt * 0.5 * (power.x2 > 0 ? 2 : 1);
  }

  for (const o of obstacles) {
    if (!o.moving) continue;
    if (!o.active && o.z0 - p.z < 70 && playing) { o.active = true; Sound.bell(); }
    if (o.active && state !== 'over' && state !== 'dying') { o.z0 -= o.v * dt; o.z1 -= o.v * dt; o.rot = (o.rot || 0) + (o.v + sp) * dt / 0.5; }
  }

  const phh = p.slide > 0 ? PH_SLIDE : PH;
  for (const c of coins) {
    if (c.taken) continue;
    if (power.aimant > 0 && !c.mag && c.z - p.z < 28 && c.z > p.z - 2) c.mag = true;
    if (c.mag) { const k = Math.min(1, dt * 9); c.x += (p.x - c.x) * k; c.y += (p.y + 0.9 - c.y) * k; c.z += (p.z + 0.2 - c.z) * k; }
    if (playing && Math.abs(c.z - p.z) < 1.0 && Math.abs(c.x - p.x) < 1.0 && c.y > p.y - 0.4 && c.y < p.y + phh + 0.6) {
      c.taken = true; coinsRun++;
      Sound.coin();
      for (let i = 0; i < 3; i++) puff(c.x, c.y, c.z, '#ffd75e', 0.35, 0.35, rand(-2, 2), rand(1, 3), rand(-1, 1), true);
    }
  }
  for (const g of gems) {
    if (g.taken) continue;
    if (power.aimant > 0 && !g.mag && g.z - p.z < 28 && g.z > p.z - 2) g.mag = true;
    if (g.mag) { const k = Math.min(1, dt * 9); g.x += (p.x - g.x) * k; g.y += (p.y + 0.9 - g.y) * k; g.z += (p.z + 0.2 - g.z) * k; }
    if (playing && Math.abs(g.z - p.z) < 1.1 && Math.abs(g.x - p.x) < 1.1 && g.y > p.y - 0.5 && g.y < p.y + phh + 0.7) {
      g.taken = true; dirhamsRun++;
      Sound.power(); toast('+1 dirham !'); vibrate(40);
      for (let i = 0; i < 10; i++) puff(g.x, g.y, g.z, '#9dffd2', 0.5, 0.6, rand(-3, 3), rand(1, 4), rand(-1, 1), true);
    }
  }
  for (const u of powerups) {
    if (u.taken) continue;
    if (playing && Math.abs(u.z - p.z) < 1.1 && Math.abs(u.x - p.x) < 1.1 && u.y > p.y - 0.5 && u.y < p.y + phh + 0.6) {
      u.taken = true; activatePower(u.kind);
      for (let i = 0; i < 8; i++) puff(u.x, u.y, u.z, '#ffffff', 0.6, 0.5, rand(-3, 3), rand(1, 4), rand(-1, 1), true);
    }
  }

  // singe
  if (playing && monkey.wait > 0) {
    // au départ, le singe reste assis un instant pendant que Yassine s'élance, puis le poursuit
    monkey.wait -= dt;
    monkey.dist += sp * dt;
  } else if (playing) {
    monkey.danger = Math.max(0, monkey.danger - dt);
    monkey.intro = Math.max(0, monkey.intro - dt);
    const target = monkey.danger > 0 || monkey.intro > 0 ? 2.1 : 13;
    monkey.dist += (target - monkey.dist) * Math.min(1, dt * (target < monkey.dist ? 4 : 0.5));
  } else if (state === 'menu') {
    monkey.dist = -0.6;   // assis à côté de Yassine, l'air malicieux
  } else if (state === 'dying') {
    monkey.dist = lerp(monkey.startDist, 0.3, clamp(dyingT / BOND, 0, 1));
  }
  if (!(monkey.wait > 0)) monkey.x += ((state === 'menu' ? p.x + 1.45 : p.x) - monkey.x) * Math.min(1, dt * (state === 'play' ? 3 : 5));
  monkey.phase += dt * (sp > 0 ? 6 + sp * 0.3 : 12);
  const mg = groundAt(monkey.x, p.z - monkey.dist, 99);
  if (state === 'dying') {
    const k = clamp(dyingT / BOND, 0, 1);
    monkey.y = lerp(mg, p.y + 0.95, k) + Math.sin(k * Math.PI) * 1.2;
  } else monkey.y += (mg - monkey.y) * Math.min(1, dt * 10);
  if (state === 'dying' && dyingT > FIN) gameOver();

  // poussière sous les pas
  if (sp > 0 && p.onGround && p.slide <= 0) {
    const st = Math.floor(p.phase / Math.PI);
    if (st !== p.lastStep) { p.lastStep = st; puff(p.x + rand(-0.2, 0.2), p.ground + 0.1, p.z - 0.3, '#ead2a8', 0.45, 0.55, rand(-0.4, 0.4), rand(0.3, 0.7), 0, false); }
  }
  if (sp > 0 && monkey.dist < CAM_BACK) {
    const st = Math.floor(monkey.phase / Math.PI);
    if (st !== monkey.lastStep) { monkey.lastStep = st; puff(monkey.x + rand(-0.3, 0.3), monkey.y + 0.1, p.z - monkey.dist - 0.4, '#ead2a8', 0.4, 0.5, rand(-0.4, 0.4), rand(0.3, 0.6), 0, false); }
  }

  cam.x += (p.x * 0.7 - cam.x) * Math.min(1, dt * 6);
  const ty = CAM_H + (power.tapis > 0 || (p.ghost > 0 && p.y > 3.5) ? p.y * 0.8 : p.ground * 0.85);
  cam.y += (ty - cam.y) * Math.min(1, dt * 4);

  if (playing) generate();
  genDecor();
  const back = p.z - BEHIND;
  obstacles = prune(obstacles, o => o.z1 > back);
  coins = coins.filter(c => !c.taken && c.z > back);
  powerups = prune(powerups, u => !u.taken && u.z > back);
  gems = prune(gems, g => !g.taken && g.z > back);
  decor = prune(decor, d => d.z > back);
  palms = prune(palms, d => d.z > back);
}

// ---------------------------------------------------------------- jour / nuit
const CYCLE = 160;
const light = { n: 0, s: 0 };
// couleurs : haut du ciel, milieu, horizon, Atlas, neige, ville, Koutoubia, Koutoubia ombre
const SKY = {
  jour: ['#3a8fd0', '#8cc6e8', '#f5dcae', '#b7a2bd', '#f4f1f6', '#d9b08a', '#d29a6a', '#b77d52'],
  soir: ['#34407e', '#d9766a', '#ffbe6e', '#96698f', '#ffd0c0', '#b8705a', '#e0925e', '#a8603e'],
  nuit: ['#070d26', '#18214a', '#2e2a55', '#22203f', '#5a5f86', '#1f1c38', '#c99a5c', '#8a6236']
};
const SKYRGB = Object.fromEntries(Object.entries(SKY).map(([k, v]) => [k, v.map(hexRgb)]));
let lastBackdrop = { n: -1, s: -1 };
const col = new THREE.Color();
function updateLighting() {
  const c = time % CYCLE;
  light.n = smooth(62, 80, c) * (1 - smooth(122, 138, c));
  light.s = smooth(48, 64, c) * (1 - smooth(76, 90, c)) + smooth(118, 128, c) * (1 - smooth(132, 146, c));
  const { n, s } = light;
  const sky = SKYRGB.jour.map((d, i) => mixRgb(mixRgb(d, SKYRGB.soir[i], s), SKYRGB.nuit[i], n));
  if (Math.abs(n - lastBackdrop.n) > 0.015 || Math.abs(s - lastBackdrop.s) > 0.015) {
    T.drawBackdrop(sky.map(v => rgbStr(v)), light, 0.5, time);
    lastBackdrop = { n, s };
  }
  scene.fog.color.setRGB(sky[2][0] / 255, sky[2][1] / 255, sky[2][2] / 255, THREE.SRGBColorSpace);
  hemi.color.setRGB(sky[1][0] / 255, sky[1][1] / 255, sky[1][2] / 255, THREE.SRGBColorSpace);
  hemi.groundColor.set(n > 0.5 ? '#3a2a3a' : '#c98a55');
  hemi.intensity = lerp(lerp(1.45, 1.2, s), 0.75, n);
  col.set('#fff1d6').lerp(new THREE.Color('#ff9a50'), s).lerp(new THREE.Color('#7d8cff'), n);
  sun.color.copy(col);
  sun.intensity = lerp(lerp(2.9, 2.1, s), 0.7, n);
  M.glowMaterial.opacity = 0.12 + 0.88 * Math.max(n, s * 0.5);
  const cc = mixRgb(mixRgb([255, 255, 255], [255, 190, 165], s), [60, 70, 120], n);
  for (const cl of clouds) cl.material.color.setRGB(cc[0] / 255, cc[1] / 255, cc[2] / 255, THREE.SRGBColorSpace);
}

// ---------------------------------------------------------------- synchronisation logique → 3D
const BUILDERS = { stand: M.buildStall, rampe: M.buildRamp, bas: M.buildLow, haut: M.buildHigh };
function syncScene(dt) {
  const pz = p.z;
  const vis = z => z < pz + FAR - 5;

  // sol qui défile
  const c = pz + GROUND_L / 2 - BEHIND;
  road.position.z = -c;
  for (const s of sidewalks) s.position.z = -c;
  roadTex.offset.y = mod((c - GROUND_L / 2) / T.ROAD_L, 1);
  swTex.offset.y = mod((c - GROUND_L / 2) / SW_W, 1);
  updateWalls(pz);

  for (const o of obstacles) {
    if (!o.obj) { o.obj = BUILDERS[o.type](o); o.obj.position.x = o.x; scene.add(o.obj); }
    const zc = o.type === 'bas' || o.type === 'haut' ? (o.z0 + o.z1) / 2 : o.z0;
    o.obj.position.z = -zc;
    // un obstacle bas ou suspendu déjà dépassé disparaît (sinon il masque l'écran en passant sous la caméra)
    o.obj.visible = vis(o.z0) && !((o.type === 'haut' || o.type === 'bas') && o.z1 < pz - 1.5);
    if (o.wheels) for (const w of o.wheels) w.rotation.x = -(o.rot || 0);
    if (o.obj.userData.sway) o.obj.userData.sway.rotation.x = Math.sin(time * 1.8 + o.z0) * 0.06;
  }
  for (const u of powerups) {
    if (!u.obj) { u.obj = M.buildPowerup(u.kind); scene.add(u.obj); }
    u.obj.position.set(u.x, u.y + Math.sin(time * 3 + u.z) * 0.15, -u.z);
    u.obj.userData.item.rotation.y = time * 2;
    u.obj.visible = vis(u.z);
  }
  for (const d of decor) {
    if (!d.obj) {
      d.obj = d.kind === 'guirlande'
        ? proto('g' + d.c, () => M.buildGarland(d.c, WALL_X))
        : proto(d.kind + d.c + (d.kind === 'chat' ? d.side : ''), () => M.buildDecor(d));
      d.obj.position.set(d.x, 0, -d.z);
      scene.add(d.obj);
    }
    d.obj.visible = vis(d.z);
  }
  for (const t of palms) {
    if (!t.obj) {
      t.obj = proto('palm' + t.v, () => M.buildPalm(11 + t.v, (t.v - 1.5) * 0.4));
      t.obj.position.set(t.x, 0, -t.z);
      t.obj.rotation.y = t.z;
      scene.add(t.obj);
    }
  }

  // pièces
  let n = 0;
  for (const cn of coins) {
    if (cn.taken || !vis(cn.z) || n >= 400) continue;
    tmpE.set(0, time * 3 + cn.z * 0.4, 0);
    tmpQ.setFromEuler(tmpE);
    tmpV.set(cn.x, cn.y, -cn.z);
    tmpM.compose(tmpV, tmpQ, tmpS);
    coinMesh.setMatrixAt(n++, tmpM);
  }
  coinMesh.count = n;
  coinMesh.instanceMatrix.needsUpdate = true;
  for (const g of gems) {
    if (!g.obj) { g.obj = M.buildDirham(); scene.add(g.obj); }
    g.obj.position.set(g.x, g.y + Math.sin(time * 3 + g.z) * 0.12, -g.z);
    g.obj.userData.coin.rotation.y = time * 3.5;
    g.obj.visible = vis(g.z);
  }

  // joueur
  const flying = power.tapis > 0;
  const air = !flying && !p.onGround && p.y - p.ground > 0.2;
  let mode = 'run';
  if (state === 'menu') mode = 'idle';
  else if (state === 'dying' || state === 'over') mode = dyingT < BOND ? 'hit' : dyingT < VOL ? 'struggle' : 'sitdown';
  else if (flying) mode = 'fly';
  else if (p.slide > 0) mode = 'slide';
  else if (air) mode = 'jump';
  else if (p.hitT > 0) mode = 'hit';
  p.hitT = Math.max(0, (p.hitT || 0) - dt);
  runner.position.set(p.x, p.y + (flying ? 0.15 : 0), -p.z);
  runner.rotation.z = state === 'dying' ? 0 : -clamp((LANES[p.lane] - p.x) * 0.12, -0.25, 0.25);
  const animated = !!runner.userData.update;
  runner.rotation.x = mode === 'fall' && !animated ? 0.25 : 0;
  runner.visible = !(p.ghost > 0 && p.ghost < 1e8 && Math.floor(time * 12) % 2 === 0);
  if (animated) runner.userData.update(mode, dt, { speed: state === 'play' ? speed : 15, vy: p.vy, phase: p.phase, t: time });
  else M.animateRunner(runner, mode === 'hit' ? 'run' : mode === 'struggle' || mode === 'sitdown' ? 'fall' : mode, p.phase, dt, { vy: p.vy, time });
  // figures pendant le saut
  const pv = runner.userData.pivot;
  runner.rotation.y = Math.PI * (1 - smooth(0.1, 0.55, camIntro));   // de face au menu, demi-tour au départ
  if (state === 'dying' || state === 'over') {
    // il se débat (torsions à gauche et à droite), puis se retourne vers le singe qui lui a volé son tarbouche
    const lutte = smooth(BOND - 0.1, BOND + 0.2, dyingT) * (1 - smooth(VOL - 0.2, VOL, dyingT));
    runner.rotation.y = Math.sin(dyingT * 9) * 0.5 * lutte + Math.PI * 0.85 * smooth(VOL, VOL + 0.7, dyingT);
  }
  const prog = mode === 'jump' && p.trick ? clamp(p.airT / (p.trick === 'salto' ? 0.85 : 0.6), 0, 1) : 0;
  const eased = prog * prog * (3 - 2 * prog);
  pv.rotation.y = p.trick === 'vrille' ? eased * Math.PI * 2 : 0;
  pv.rotation.x = p.trick === 'salto' ? -eased * Math.PI * 2 : 0;
  carpet.visible = flying;
  if (flying) { carpet.position.set(p.x, p.y + 0.08, -p.z); M.waveCarpet(carpet, time); }

  // singe
  const mz = p.z - monkey.dist;
  const capture = state === 'dying' || state === 'over';
  const assis = state === 'menu' || monkey.wait > 0;
  let mmode = assis ? 'sit' : (monkey.danger > 0 || monkey.intro > 0) ? 'chase' : 'gallop';
  monkeyObj.rotation.y = assis ? Math.PI * 1.1 : 0;
  if (capture && dyingT >= BOND) {
    const yaw = runner.rotation.y;
    const dos = new THREE.Vector3(p.x + Math.sin(yaw) * 0.32, p.y + 0.95, -p.z + Math.cos(yaw) * 0.32);
    if (dyingT < VOL) {
      // agrippé au dos de Yassine, il tire sur le tarbouche
      monkeyObj.position.copy(dos);
      monkeyObj.position.y += Math.abs(Math.sin(dyingT * 14)) * 0.06;
      monkeyObj.rotation.y = yaw;
      mmode = 'tug';
    } else {
      // il a volé le tarbouche : il saute à terre et le brandit pour narguer Yassine
      runner.userData.rig.fez.visible = false;
      monkeyObj.userData.rig.fez.visible = true;
      const k = smooth(VOL, VOL + 0.45, dyingT);
      const sol = new THREE.Vector3(p.x + 1.3, p.ground, -p.z - 0.5);
      monkeyObj.position.lerpVectors(dos, sol, k);
      monkeyObj.position.y += Math.sin(k * Math.PI) * 0.9;
      monkeyObj.rotation.y = lerp(yaw, Math.PI * 0.8, k);
      mmode = k < 1 ? 'leap' : 'cheer';
    }
  } else if (capture) {
    monkeyObj.position.set(monkey.x, monkey.y, -mz);
    mmode = 'leap';
  } else {
    monkeyObj.position.set(monkey.x, monkey.y, -mz);
  }
  if (monkeyObj.userData.update) monkeyObj.userData.update(mmode, dt);
  else M.animateMonkey(monkeyObj, mmode === 'leap' ? 'chase' : mmode === 'tug' || mmode === 'cheer' ? 'grab' : mmode, monkey.phase, dt);
  // visible seulement s'il est bien devant la caméra (jamais collé à l'objectif)
  camera.getWorldDirection(camDir);
  monkeyObj.visible = tmpV.copy(monkeyObj.position).sub(camera.position).dot(camDir) > (camIntro < 1 ? 2.6 : 1.6);

  // particules
  const sp = state === 'play' || state === 'menu' ? speed : 0;
  for (const s of puffs) {
    if (!s.visible) continue;
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) { s.visible = false; continue; }
    u.x += u.vx * dt; u.y += u.vy * dt; u.z += (u.vz + (u.follow ? sp : 0)) * dt;
    if (u.follow) u.vy -= 6 * dt;
    const k = 1 - u.life / u.max;
    s.position.set(u.x, u.y, -u.z);
    s.scale.setScalar(u.size * (1 + k * (u.follow ? 0 : 2)));
    s.material.opacity = (1 - k) * (u.follow ? 1 : 0.55);
  }

  // caméra
  const sx = shake > 0 ? rand(-1, 1) * shake * 0.35 : 0, sy = shake > 0 ? rand(-1, 1) * shake * 0.35 : 0;
  const vue = state === 'dying' || state === 'over' ? smooth(0, 0.8, dyingT) : 0;   // caméra de 3/4 pour voir la bagarre
  camIntro = state === 'menu' ? 0 : Math.min(1, camIntro + dt / 1.0);
  const e = smooth(0, 1, camIntro);
  if (e < 1) {
    // menu : caméra face au héros (qui nous regarde), puis recul jusqu'à la vue de course
    const vitrine = boutique.ouverte ? 1 : 0;
    cadreBoutique += (vitrine - cadreBoutique) * Math.min(1, dt * 5);
    const mx = p.x - 0.25 * (1 - cadreBoutique), bh = cadreBoutique;
    camera.position.set(lerp(mx, cam.x, e), lerp(lerp(1.25, 1.1, bh), cam.y, e), -(pz - lerp(lerp(3.9, 3.5, bh), CAM_BACK, e)));
    camera.lookAt(lerp(mx, cam.x * 0.85, e), lerp(lerp(0.3, -0.75, bh), cam.y - 2.2, e), -(pz + lerp(0, 10, e)));
  } else {
    camera.position.set(lerp(cam.x, p.x + 2.3, vue) + sx, lerp(cam.y, p.y + 1.9, vue) + sy, -(pz - lerp(CAM_BACK, 3.3, vue)));
    camera.lookAt(lerp(cam.x * 0.85, p.x + 0.35, vue), lerp(cam.y - 2.2, p.y + 1.0, vue), -(pz + lerp(10, 0, vue)));
  }
  backdrop.position.set(camera.position.x, camera.position.y, camera.position.z - 420);
  for (const cl of clouds) {
    const u = cl.userData;
    const x = mod(u.x + time * u.v + 180, 360) - 180;
    cl.position.set(camera.position.x * 0.5 + x, camera.position.y + u.y, camera.position.z - 380);
  }
  // l'ombre portée suit le joueur
  sun.position.set(p.x + 9, 22, -(pz + 8) - 12);
  sun.target.position.set(p.x, 0, -(pz + 8));
}

// ---------------------------------------------------------------- interface
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), fin: $('fin'),
  pieces: $('h-pieces'), score: $('h-score'), mult: $('h-mult'), pouvoirs: $('h-pouvoirs'),
  singe: $('h-singe'), toast: $('h-toast'), danger: $('danger'), dirhams: $('h-dirhams'), dirhamsBox: $('h-dirhams-box')
};
let last = { score: -1, pieces: -1, dirhams: -1, pw: '' };
let toastTimer = null;
function toast(txt) {
  ui.toast.hidden = true; void ui.toast.offsetWidth;
  ui.toast.textContent = txt; ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 1600);
}
function updateHud() {
  const sc = Math.floor(score);
  if (sc !== last.score) { ui.score.textContent = sc; last.score = sc; }
  if (coinsRun !== last.pieces) { ui.pieces.textContent = coinsRun; last.pieces = coinsRun; }
  if (dirhamsRun !== last.dirhams) { ui.dirhams.textContent = dirhamsRun; ui.dirhamsBox.hidden = dirhamsRun === 0; last.dirhams = dirhamsRun; }
  ui.mult.hidden = !(power.x2 > 0);
  const danger = state === 'play' && monkey.danger > 0;
  ui.singe.hidden = !danger;
  ui.danger.classList.toggle('on', danger);
  let html = '';
  for (const k of ['aimant', 'babouches', 'tapis']) {
    if (power[k] > 0) html += `<div class="pouvoir"><span>${NOMS[k]}</span><span class="barre"><i style="width:${(power[k] / powerMax[k]) * 100}%"></i></span></div>`;
  }
  if (html !== last.pw) { ui.pouvoirs.innerHTML = html; last.pw = html; }
}
const BOOST_NOMS = { trombe: 'Départ en trombe', aimantDepart: 'Aimant de départ' };
function refreshMenu() {
  $('m-record').textContent = best;
  $('m-pieces').textContent = eco.rials;
  $('m-dirhams').textContent = eco.dirhams;
  const def = persoParId(eco.perso);
  $('m-accroche').textContent = `Un singe malicieux veut voler ${def.nomChapeau} de ${def.nom} !`;
  // boosts en stock : on peut les activer ou non pour la prochaine partie
  $('m-boosts').innerHTML = Object.keys(BOOST_NOMS).filter(k => eco.boosts[k] > 0)
    .map(k => `<button data-boost="${k}" class="${eco.armes[k] ? 'on' : ''}">${eco.armes[k] ? '✓ ' : ''}${BOOST_NOMS[k]} ×${eco.boosts[k]}</button>`).join('');
  $('b-son').textContent = Sound.on ? '🔊 Son activé' : '🔇 Son coupé';
}
function show(el) { for (const e of [ui.menu, ui.pause, ui.fin]) e.hidden = e !== el; }

// Boutique
const boutique = initShop({
  onPreview: id => afficherPerso(id),
  onChange: () => refreshMenu(),
  toast, son: Sound
});
function ouvrirBoutique() { Sound.init(); boutique.open(); ui.menu.hidden = true; }
$('b-boutique').addEventListener('click', ouvrirBoutique);
$('b-fermer').addEventListener('click', () => { boutique.close(); show(ui.menu); });
$('m-boosts').addEventListener('click', e => {
  const b = e.target.closest('[data-boost]');
  if (!b) return;
  eco.armes[b.dataset.boost] = !eco.armes[b.dataset.boost];
  eco.save();
  refreshMenu();
});

function startGame() {
  Sound.init();
  const fromMenu = state === 'menu';
  resetWorld(true);
  if (fromMenu) { monkey.dist = -0.6; monkey.x = p.x + 1.45; monkey.wait = 0.7; }   // le singe reste assis, le héros s'élance, puis il le rattrape hors champ
  afficherPerso(eco.perso);
  state = 'play';
  show(null);
  ui.hud.hidden = false;
  last = { score: -1, pieces: -1, dirhams: -1, pw: '' };
  Sound.startMusic();
  // boosts activés dans la boutique
  const boosts = eco.consommerBoosts();
  // le tapis volant décolle une fois la caméra placée derrière le héros
  if (boosts.includes('trombe')) setTimeout(() => { if (state === 'play') activatePower('tapis', 6); }, fromMenu ? 1100 : 200);
  if (boosts.includes('aimantDepart')) activatePower('aimant', 15);
  toast(boosts.length ? 'Boost activé !' : 'Fuis le singe !');
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  show(ui.pause);
  Sound.stopMusic();
  if (Sound.ac) Sound.ac.suspend();
}
function resumeGame() {
  if (state !== 'pause') return;
  state = 'play';
  show(null);
  if (Sound.ac) Sound.ac.resume();
  Sound.startMusic();
}
function toMenu() {
  Sound.stopMusic();
  if (Sound.ac && Sound.ac.state === 'suspended') Sound.ac.resume();
  state = 'menu';
  ui.hud.hidden = true;
  ui.danger.classList.remove('on');
  resetWorld(false);
  refreshMenu();
  show(ui.menu);
}
const coutRelance = () => 2 ** relances;   // 1, 2, 4… dirhams
function gameOver() {
  state = 'over';
  const sc = Math.floor(score);
  const rec = sc > best;
  if (rec) { best = sc; store.set('record', best); }
  // on crédite seulement ce qui n'a pas déjà été compté (en cas de « Continuer »)
  eco.gagner(coinsRun - rialsComptes, dirhamsRun - dirhamsComptes);
  rialsComptes = coinsRun; dirhamsComptes = dirhamsRun;
  $('f-score').textContent = sc;
  $('f-pieces').textContent = coinsRun;
  $('f-dirhams').textContent = dirhamsRun;
  $('f-dirhams-box').hidden = dirhamsRun === 0;
  $('f-meilleur').textContent = best;
  $('f-record').hidden = !rec;
  const cout = coutRelance();
  $('f-cout').textContent = cout;
  $('b-continuer').disabled = eco.dirhams < cout;
  $('f-continuer-info').hidden = eco.dirhams >= cout;
  $('f-continuer-info').textContent = `Il te faut ${cout} dirham${cout > 1 ? 's' : ''} pour continuer (tu en as ${eco.dirhams}).`;
  ui.hud.hidden = true;
  ui.danger.classList.remove('on');
  show(ui.fin);
}
// « Continuer » : on repart du même endroit, la voie devant est dégagée
function continuer() {
  if (state !== 'over' || !eco.depenserDirhams(coutRelance())) return;
  relances++;
  obstacles = prune(obstacles, o => o.z1 < p.z - 2 || o.z0 > p.z + 45);
  Object.assign(p, { y: p.ground, vy: 0, slide: 0, onGround: true, ghost: 2.5, hitT: 0 });
  Object.assign(monkey, { dist: 13, danger: 0, intro: 0, wait: 0 });
  runner.userData.rig.fez.visible = true;
  monkeyObj.userData.rig.fez.visible = false;
  dyingT = 0;
  state = 'play';
  show(null);
  ui.hud.hidden = false;
  Sound.startMusic();
  toast('C\'est reparti !');
}
$('b-continuer').addEventListener('click', continuer);

$('b-jouer').addEventListener('click', startGame);
$('b-rejouer').addEventListener('click', startGame);
$('b-menu').addEventListener('click', toMenu);
$('b-quitter').addEventListener('click', toMenu);
$('b-reprendre').addEventListener('click', resumeGame);
$('b-pause').addEventListener('click', pauseGame);
$('b-son').addEventListener('click', () => { Sound.init(); Sound.setOn(!Sound.on); refreshMenu(); });

// ---------------------------------------------------------------- contrôles (glissements + clavier)
let swipe = null;
canvas.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, used: false }; });
canvas.addEventListener('pointermove', e => {
  if (!swipe || swipe.used || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  const th = Math.max(22, Math.min(W, H) * 0.05);
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;
  swipe.used = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'droite' : 'gauche'); else act(dy > 0 ? 'bas' : 'haut');
});
const endSwipe = () => { swipe = null; };
canvas.addEventListener('pointerup', endSwipe);
canvas.addEventListener('pointercancel', endSwipe);
window.addEventListener('keydown', e => {
  const k = e.key;
  if (state === 'menu' && (k === 'Enter' || k === ' ')) { startGame(); e.preventDefault(); return; }
  if (state === 'over' && k === 'Enter') { startGame(); return; }
  if (k === 'Escape' || k === 'p' || k === 'P') { if (state === 'play') pauseGame(); else if (state === 'pause') resumeGame(); return; }
  const map = {
    ArrowLeft: 'gauche', q: 'gauche', a: 'gauche', Q: 'gauche', A: 'gauche',
    ArrowRight: 'droite', d: 'droite', D: 'droite',
    ArrowUp: 'haut', z: 'haut', w: 'haut', Z: 'haut', W: 'haut', ' ': 'haut',
    ArrowDown: 'bas', s: 'bas', S: 'bas'
  };
  if (map[k]) { act(map[k]); e.preventDefault(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);
window.addEventListener('pagehide', pauseGame);

// ---------------------------------------------------------------- boucle principale
let prev = performance.now(), perfAcc = 0, perfN = 0;
function frame(now) {
  const raw = (now - prev) / 1000;
  const dt = Math.min(0.033, Math.max(0, raw));
  prev = now;
  update(dt);
  updateLighting();
  syncScene(dt);
  renderer.render(scene, camera);
  if (state === 'play' || state === 'dying') updateHud();
  // qualité adaptative (mesurée pendant la partie)
  if (state === 'play' && raw < 0.5) {
    perfAcc += raw; perfN++;
    if (perfN >= 150) {
      if (perfAcc / perfN > 0.026 && quality < 3) { quality++; store.set('qualite', quality); applyQuality(); }
      perfAcc = 0; perfN = 0;
    }
  }
  requestAnimationFrame(frame);
}

applyQuality();
resetWorld(false);
refreshMenu();
if (eco.cadeauDuJour()) { refreshMenu(); setTimeout(() => toast('Cadeau du jour : +1 dirham !'), 600); }
requestAnimationFrame(frame);

// Cache hors ligne pour la version en ligne (navigateur ou application).
if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Numéro de version affiché dans le menu (« en ligne » = mise à jour automatique active).
fetch('version.json', { cache: 'no-store' }).then(r => r.json()).then(j => {
  $('m-version').textContent = `Version ${j.version} · ${location.hostname === 'localhost' ? 'intégrée' : 'en ligne'}`;
}).catch(() => {});

// Accès pour les tests automatisés.
window.BEHJA = {
  get state() { return state; }, get score() { return score; }, get coins() { return coinsRun; },
  get player() { return p; }, get obstacles() { return obstacles; }, act, startGame, power,
  step(dt) { update(dt); }, setInvincible(v) { p.ghost = v ? 1e9 : 0; }, setTime(t) { time = t; },
  get quality() { return quality; }, setQuality(q) { quality = q; applyQuality(); },
  get dyingT() { return dyingT; }, crash() { crash(); }, eco, continuer, boutique, afficherPerso,
  renderer
};
