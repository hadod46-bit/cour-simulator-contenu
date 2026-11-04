// Personnages jouables en 3D animé (squelette + animations professionnelles).
// Modèles de base : « KayKit Adventurers » de Kay Lousberg (licence CC0), recolorés et accessoirisés.
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { recolor } from './recolor.js';

const SCALE = 0.8;

function std(color, roughness) { return new THREE.MeshStandardMaterial({ color, roughness: roughness || 0.6, metalness: 0 }); }

export function buildFez() {
  const g = new THREE.Group();
  const red = std('#c1272d', 0.5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.37, 0.5, 32), red);
  body.position.y = 0.25;
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.301, 0.301, 0.02, 32), std('#8e1820', 0.5));
  top.position.y = 0.5;
  g.add(top);
  const tassel = new THREE.Group();
  tassel.position.set(0, 0.5, 0);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6), std('#141414', 0.6));
  cord.position.y = -0.18;
  tassel.add(cord);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std('#141414', 0.6));
  pom.scale.y = 1.5;
  pom.position.y = -0.38;
  tassel.add(pom);
  g.add(tassel);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.tassel = tassel;
  return g;
}

// Diadème doré (Salma)
function buildDiademe() {
  const g = new THREE.Group();
  const or = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.3, metalness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 40), or);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 1.05, 1);
  g.add(ring);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), std('#2a9d8f', 0.2));
  gem.position.set(0, 0.06, 0.52);
  g.add(gem);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std('#e0457b', 0.3));
    p.position.set(sx * 0.3, 0.04, 0.42);
    g.add(p);
  }
  return g;
}
// Casquette rouge portée à l'envers (Mehdi)
function buildCasquette() {
  const g = new THREE.Group();
  const rouge = std('#d62828', 0.55);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.47, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), rouge);
  dome.scale.set(1, 0.75, 1.05);
  g.add(dome);
  // visière tournée vers l'arrière (demi-disque du côté -z, l'avant du visage étant +z)
  const visiere = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 24, 1, false, Math.PI / 2, Math.PI), std('#1f7a4d', 0.5));
  visiere.position.set(0, 0.0, -0.3);
  g.add(visiere);
  const bouton = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std('#1f7a4d', 0.5));
  bouton.position.y = 0.36;
  g.add(bouton);
  return g;
}
// Chéchia blanche brodée (Hajj Brahim)
function buildKufi() {
  const g = new THREE.Group();
  const blanc = std('#f5f2ea', 0.8);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.3, 28), blanc);
  cap.position.y = 0.12;
  g.add(cap);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), blanc);
  top.scale.y = 0.35;
  top.position.y = 0.27;
  g.add(top);
  const brod = new THREE.Mesh(new THREE.CylinderGeometry(0.462, 0.462, 0.06, 28, 1, true), std('#2a9d8f', 0.6));
  brod.position.y = 0.04;
  g.add(brod);
  return g;
}
export function buildHat(type) {
  const g = type === 'diademe' ? buildDiademe() : type === 'casquette' ? buildCasquette() : type === 'kufi' ? buildKufi() : buildFez();
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildBackpack() {
  const g = new THREE.Group();
  const leather = std('#9a5a2a', 0.55);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.2), leather);
  g.add(bag);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.06), std('#7a4220', 0.55));
  flap.position.set(0, 0.16, 0.12);
  g.add(flap);
  // étoile de zellige sur le rabat
  for (let k = 0; k < 2; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), std('#2a9d8f', 0.4));
    b.rotation.z = (k * Math.PI) / 4;
    b.position.set(0, -0.05, 0.11);
    g.add(b);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Place un accessoire sur un os, orienté selon la verticale du personnage au repos.
export function attach(bone, obj, worldPoint, model) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  obj.position.copy(worldPoint.clone().applyMatrix4(inv));
  const boneQ = new THREE.Quaternion();
  bone.matrixWorld.decompose(new THREE.Vector3(), boneQ, new THREE.Vector3());
  const modelQ = new THREE.Quaternion();
  model.matrixWorld.decompose(new THREE.Vector3(), modelQ, new THREE.Vector3());
  obj.quaternion.copy(boneQ.invert().multiply(modelQ));
  // compense l'échelle héritée de l'os pour garder des dimensions en mètres du modèle
  const s = new THREE.Vector3();
  bone.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  const ms = new THREE.Vector3();
  model.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ms);
  obj.scale.set(ms.x / s.x, ms.y / s.y, ms.z / s.z);
  bone.add(obj);
}

export async function loadHero(def) {
  const gltf = await new GLTFLoader().loadAsync(def.url);
  const model = gltf.scene;

  // Deux variantes de texture : corps (peau hâlée, cheveux noirs) et jambes (jean, baskets blanches).
  let base = null;
  model.traverse(o => { if (o.isMesh && !base) base = o.material; });
  const make = cols => {
    const t = new THREE.CanvasTexture(recolor(base.map.image, cols));
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    const m = base.clone();
    m.map = t;
    m.roughness = 0.65;
    return m;
  };
  const corps = make(def.corps), jambes = def.jambes ? make(def.jambes) : corps;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = /Leg/.test(o.name) ? jambes : corps;
    o.castShadow = true;
    o.frustumCulled = false;
  });

  const root = new THREE.Group();
  const pivot = new THREE.Group();     // centre du corps, pour les vrilles et saltos
  pivot.position.y = 0.85;
  root.add(pivot);
  const holder = new THREE.Group();
  holder.position.y = -0.85;
  pivot.add(holder);
  model.scale.setScalar(SCALE);
  model.rotation.y = Math.PI;          // le modèle regarde vers +z ; le coureur doit regarder vers -z
  holder.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const A = {};
  for (const clip of gltf.animations) A[clip.name] = mixer.clipAction(clip);

  // Pose de repos pour placer le tarbouche et le sac.
  A.Idle.play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const headMesh = model.getObjectByName(def.prefixe + '_Head');
  const box = new THREE.Box3().setFromObject(headMesh);
  const head = model.getObjectByName('head'), chest = model.getObjectByName('chest');
  const fez = buildHat(def.chapeau);
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - (def.hauteurChapeau || 0.22), (box.min.z + box.max.z) / 2);
  attach(head, fez, top, model);
  if (def.chapeau === 'fez') fez.rotateZ(0.12);
  if (def.sac) {
    const bag = buildBackpack();
    const chestPos = new THREE.Vector3();
    chest.getWorldPosition(chestPos);
    const bodyBox = new THREE.Box3().setFromObject(model.getObjectByName(def.prefixe + '_Body'));
    // le dos est du côté +z du monde (le modèle est tourné vers -z)
    attach(chest, bag, new THREE.Vector3(chestPos.x, chestPos.y + 0.02, bodyBox.max.z + 0.04), model);
  }
  A.Idle.stop();

  // os des bras et du buste, pour la bagarre avec le singe
  const os = {};
  for (const n of ['upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'spine']) os[n] = model.getObjectByName(n);
  const fezBase = { rz: fez.rotation.z, rx: fez.rotation.x, y: fez.position.y };
  let lutte = 0;

  let current = null, mode = null, modeT = 0;
  function play(name, fade, once, timeScale) {
    const a = A[name];
    if (!a) return;
    a.setEffectiveTimeScale(timeScale || 1);
    if (current === a) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!once;
    a.setEffectiveWeight(1);
    a.play();
    if (current) current.crossFadeTo(a, fade, false);
    current = a;
  }

  function update(newMode, dt, info) {
    if (newMode !== mode) { mode = newMode; modeT = 0; } else modeT += dt;
    const runScale = Math.min(1.7, Math.max(1.0, (info.speed || 15) / 14));
    switch (mode) {
      case 'idle': play('Idle', 0.3); break;
      case 'run': play('Running_A', 0.12, false, runScale); break;
      case 'hit': play('Hit_A', 0.08, true, 1.6); break;
      case 'jump':
        // impulsion puis suspension en l'air
        if (modeT < 0.12) play('Jump_Start', 0.06, true, 3);
        else play('Jump_Idle', 0.12);
        break;
      case 'slide': play('Sit_Floor_Pose', 0.08); break;
      case 'fly': play('Sit_Floor_Idle', 0.25); break;
      case 'fall': play('Death_A', 0.1, true, 1.3); break;
      case 'struggle': play('Idle', 0.15, false, 2); break;
      case 'sitdown': play('Sit_Floor_Idle', 0.3); break;
      default: play('Idle', 0.3);
    }
    mixer.update(dt);
    // bagarre : les mains montent sur la tête pour retenir le tarbouche, le buste se tord
    lutte += ((mode === 'struggle' ? 1 : 0) - lutte) * Math.min(1, dt * 10);
    const t = info.t || 0;
    if (lutte > 0.01 && os.upperarml) {
      const w = lutte, a = Math.sin(t * 14) * 0.25, b = Math.sin(t * 14 + 1.3) * 0.3;
      os.upperarml.rotation.y += (-2.1 + a) * w; os.lowerarml.rotation.y += (1.8 + b) * w;
      os.upperarmr.rotation.y += (2.1 - a) * w;  os.lowerarmr.rotation.y += (-1.8 - b) * w;
      if (os.spine) os.spine.rotation.y += Math.sin(t * 9) * 0.25 * w;
    }
    // le tarbouche est tiré dans tous les sens
    fez.rotation.z = fezBase.rz + Math.sin(t * 16) * 0.35 * lutte;
    fez.rotation.x = fezBase.rx + Math.sin(t * 11) * 0.25 * lutte;
    fez.position.y = fezBase.y + Math.abs(Math.sin(t * 16)) * 0.08 * lutte;
    // le pompon du tarbouche se balance avec la course
    const pompon = fez.userData.tassel;
    if (pompon) {
      pompon.rotation.x = 0.4 + Math.sin(info.phase * 0.5) * 0.3 + (info.vy > 0 ? -0.5 : 0) + Math.sin(t * 20) * 0.6 * lutte;
      pompon.rotation.z = Math.sin(info.phase * 0.7) * 0.2;
    }
  }

  root.userData.rig = { fez };
  root.userData.perso = def.id;
  root.userData.pivot = pivot;
  root.userData.update = update;
  return root;
}
