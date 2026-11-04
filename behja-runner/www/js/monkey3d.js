// Le singe magot en 3D animé, dans le même style que Yassine.
// Base : personnage « Barbarian » du pack KayKit Adventurers (Kay Lousberg, licence CC0),
// transformé en macaque : fourrure brune, visage rose, favoris clairs, oreilles et museau ajoutés.
// Sans queue, comme les vrais magots de l'Atlas.
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { recolor } from './recolor.js';
import { buildHat, attach } from './hero.js';

const SCALE = 0.5;
const FUR = ['#a67c52', '#6b4a2e'];
const COULEURS = { 0: ['#efb4a2', '#c98572'], 1: ['#dcbb93', '#a37c55'], 9: ['#c99079', '#93604c'] };
for (const c of [3, 6, 7, 8, 10, 15, 19, 23]) COULEURS[c] = FUR;

const std = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness: roughness || 0.8, metalness: 0 });

// Fourrure du crâne, oreilles rondes et museau, en coordonnées locales de la tête
// (+z = vers l'avant du visage, +y = vers le haut). r = demi-largeur de la tête.
function buildMonkeyHead(r) {
  const g = new THREE.Group();
  const fur = std('#8a6440'), dark = std('#5e4029'), pink = std('#d99a82', 0.6), inner = std('#d98d7d', 0.6);
  // calotte de fourrure : couvre le haut et l'arrière du crâne, laisse le visage rose
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.07, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), fur);
  cap.rotation.x = -0.75;
  cap.position.set(0, r * 0.05, -r * 0.05);
  g.add(cap);
  // petite houppe sur le dessus
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 0.4, 10), dark);
  tuft.position.set(0, r * 1.02, -r * 0.15);
  tuft.rotation.x = -0.3;
  g.add(tuft);
  // oreilles
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 16, 12), fur);
    ear.scale.set(0.4, 1, 0.95);
    ear.position.set(sx * r * 1.12, r * 0.18, -r * 0.08);
    g.add(ear);
    const ein = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 14, 10), inner);
    ein.scale.set(0.3, 1, 0.9);
    ein.position.set(sx * r * 1.2, r * 0.18, r * 0.02);
    g.add(ein);
  }
  // museau rose avec narines et bouche
  const snout = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 20, 14), pink);
  snout.scale.set(1.15, 0.78, 0.85);
  snout.position.set(0, -r * 0.4, r * 0.88);
  g.add(snout);
  for (const sx of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(r * 0.06, 8, 6), dark);
    n.position.set(sx * r * 0.13, -r * 0.24, r * 1.27);
    g.add(n);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(r * 0.18, r * 0.03, 6, 12, Math.PI), dark);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -r * 0.56, r * 1.22);
  g.add(mouth);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export async function loadMonkey(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  let base = null;
  model.traverse(o => { if (o.isMesh && !base) base = o.material; });
  const tex = new THREE.CanvasTexture(recolor(base.map.image, COULEURS));
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = base.clone();
  mat.map = tex;
  mat.roughness = 0.85;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = mat;
    o.castShadow = true;
    o.frustumCulled = false;
  });

  const root = new THREE.Group();
  const holder = new THREE.Group();
  root.add(holder);
  model.scale.setScalar(SCALE);
  model.rotation.y = Math.PI;          // regarde vers -z, comme Yassine
  holder.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const A = {};
  for (const clip of gltf.animations) A[clip.name] = mixer.clipAction(clip);

  // pose de repos pour placer la tête de singe et le tarbouche volé
  A.Idle.play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const headBone = model.getObjectByName('head');
  const box = new THREE.Box3().setFromObject(model.getObjectByName('Barbarian_Head'));
  const center = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.62, (box.min.z + box.max.z) / 2);
  const r = (box.max.x - box.min.x) / 2 / SCALE * 0.92;     // demi-largeur en unités du modèle
  const head = buildMonkeyHead(r);
  attach(headBone, head, center, model);
  // support du chapeau volé (son contenu change selon le personnage poursuivi)
  const fez = new THREE.Group();
  attach(headBone, fez, new THREE.Vector3(center.x, box.max.y - 0.02, center.z), model);
  fez.scale.multiplyScalar(0.85);
  fez.rotateZ(-0.3);
  fez.visible = false;
  let chapeau = null;
  function setHat(type) {
    if (chapeau === type) return;
    chapeau = type;
    fez.clear();
    fez.add(buildHat(type));
  }
  setHat('fez');
  A.Idle.stop();

  let current = null, mode = null;
  function play(name, fade, timeScale) {
    const a = A[name];
    if (!a) return;
    a.setEffectiveTimeScale(timeScale || 1);
    if (current === a) return;
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.setEffectiveWeight(1);
    a.play();
    if (current) current.crossFadeTo(a, fade, false);
    current = a;
  }

  function update(newMode, dt) {
    mode = newMode;
    switch (mode) {
      case 'sit': play('Sit_Floor_Idle', 0.3); break;
      case 'chase': play('Running_B', 0.15, 1.5); break;
      case 'gallop': play('Running_A', 0.15, 1.4); break;
      case 'leap': play('Jump_Idle', 0.1); break;
      case 'tug': play('Interact', 0.12, 2.2); break;     // tire sur le tarbouche
      case 'cheer': play('Cheer', 0.2, 1.3); break;       // brandit le tarbouche volé
      default: play('Idle', 0.3);
    }
    mixer.update(dt);
  }

  root.userData.rig = { fez };
  root.userData.update = update;
  root.userData.setHat = setHat;
  return root;
}
