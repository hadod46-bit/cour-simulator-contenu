/*
 * Behja Runner — un jeu de course infinie dans les souks de Marrakech.
 * Rendu pseudo-3D sur Canvas 2D, sans aucune dépendance (fonctionne hors ligne).
 *
 * Repère du monde : x = latéral (voies à -2.6 / 0 / +2.6), y = hauteur, z = profondeur (vers l'avant).
 */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const canvas = $('jeu');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ---------------------------------------------------------------- utilitaires
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const mod = (a, n) => ((a % n) + n) % n;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('behja.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('behja.' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  const shadeCache = new Map();
  function shade(hex, f) {
    const k = hex + '|' + f;
    let v = shadeCache.get(k);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    const b = clamp(Math.round((n & 255) * f), 0, 255);
    v = `rgb(${r},${g},${b})`;
    shadeCache.set(k, v);
    return v;
  }

  // ---------------------------------------------------------------- constantes
  const LANE = 2.6, LANES = [-LANE, 0, LANE];
  const ROAD = LANE * 1.5 + 0.5;          // demi-largeur de la chaussée
  const WALL_X = 6.6, WALL_H = 8;          // remparts de la médina
  const CAM_BACK = 6.2, CAM_H = 4.0, NEAR = 0.5, FAR = 240;
  const STALL_H = 2.8, RAMP_LEN = 8;
  const GRAV = 42, JUMP_V = 13.5, SUPER_JUMP_V = 19.5;
  const PH = 1.75, PH_SLIDE = 0.75;        // hauteur du joueur debout / en glissade
  const SPEED0 = 15, SPEED_MAX = 34;
  const DUREES = { aimant: 10, babouches: 10, tapis: 7, x2: 15 };
  const NOMS = { aimant: 'Aimant', babouches: 'Babouches', tapis: 'Tapis volant', x2: 'Score ×2' };

  const AWNINGS = [
    ['#c8322b', '#f3e7cf'], ['#2f8f5b', '#f3e7cf'], ['#2b62a8', '#f7f1e3'],
    ['#e2892a', '#fbeed3'], ['#8e3b8a', '#f3e7cf'], ['#d4a017', '#7a2e1d']
  ];
  const GOODS = ['epices', 'oranges', 'lanternes', 'tapis', 'babouches', 'poteries'];
  const RUGS = [
    { bg: '#a8262b', bd: '#1f3b6e', md: '#e9c46a' },
    { bg: '#1f4e79', bd: '#c0392b', md: '#f1e4c3' },
    { bg: '#7b3f1d', bd: '#e9c46a', md: '#2a9d8f' },
    { bg: '#2d6a4f', bd: '#f4a261', md: '#e9d8a6' }
  ];
  const SPICES = ['#c0392b', '#e6a817', '#d35400', '#8e44ad', '#6b8e23', '#a0522d'];
  const BRIGHT = ['#c0392b', '#e9b824', '#2b62a8', '#2f8f5b', '#8e3b8a', '#e2892a', '#f3e7cf'];
  const WALL_COLS = ['#c45f3d', '#c96a44', '#bd5a3a', '#cc6d47'];
  const DOORS = ['#1f5e99', '#2e7d5b', '#a33b2b', '#2a7f8f'];

  // ---------------------------------------------------------------- écran / caméra
  let W = 0, H = 0, DPR = 1, F = 300, Y0 = 200, CX = 0;
  let mountains = [];
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    F = Math.min(W * 0.86, H * 0.58);
    Y0 = H * (W > H ? 0.36 : 0.4);
    CX = W / 2;
    mountains = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const hgt = 0.35 + 0.65 * Math.abs(Math.sin(t * 9.1 + 1.3)) * (0.6 + 0.4 * hash(i));
      mountains.push(hgt);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  const cam = { x: 0, y: CAM_H, z: -CAM_BACK };
  function P(x, y, z) {
    const d = z - cam.z;
    if (d < NEAR) return null;
    const s = F / d;
    return { x: CX + (x - cam.x) * s, y: Y0 + (cam.y - y) * s, s };
  }
  // Trace un polygone 3D (tableau plat x,y,z,...). Les points doivent être devant la caméra.
  function path3(pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 3) {
      const d = pts[i + 2] - cam.z;
      if (d < NEAR * 0.98) return false;
      const s = F / d, sx = CX + (pts[i] - cam.x) * s, sy = Y0 + (cam.y - pts[i + 1]) * s;
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
    return true;
  }
  function poly(fill, pts) { if (path3(pts)) { ctx.fillStyle = fill; ctx.fill(); } }
  const fade = z => clamp((cam.z + FAR - z) / 40, 0, 1);

  // ---------------------------------------------------------------- son (synthétisé)
  const Sound = {
    ac: null, master: null, sfx: null, music: null, noiseBuf: null,
    on: store.get('son', true), timer: null, nextNote: 0, step: 0, mel: 4,
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ac = new AC(); } catch (e) { return; }
      this.master = this.ac.createGain();
      this.master.gain.value = this.on ? 0.8 : 0;
      this.master.connect(this.ac.destination);
      this.sfx = this.ac.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.music = this.ac.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    setOn(v) {
      this.on = v; store.set('son', v);
      if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ac.currentTime, 0.05);
    },
    toneAt(t, f, dur, type, vol, f2, dest) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.03);
    },
    noiseAt(t, dur, vol, freq, type, dest, q) {
      const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      const g = this.ac.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
    },
    tone(f, dur, type, vol, f2, delay) { if (this.ac) this.toneAt(this.ac.currentTime + (delay || 0), f, dur, type, vol, f2); },
    noise(dur, vol, freq, type, delay, q) { if (this.ac) this.noiseAt(this.ac.currentTime + (delay || 0), dur, vol, freq, type, null, q); },
    coin() { this.tone(1320, 0.07, 'square', 0.05); this.tone(1980, 0.14, 'square', 0.05, null, 0.05); },
    jump() { this.tone(260, 0.2, 'triangle', 0.18, 620); },
    swish() { this.noise(0.12, 0.12, 1800, 'bandpass', 0, 0.8); },
    slide() { this.noise(0.3, 0.18, 700, 'lowpass'); },
    land() { this.noise(0.08, 0.15, 300, 'lowpass'); },
    bump() { this.tone(160, 0.25, 'sawtooth', 0.16, 70); this.noise(0.15, 0.25, 400, 'lowpass'); },
    crash() { this.noise(0.6, 0.5, 250, 'lowpass'); this.tone(120, 0.5, 'square', 0.14, 40); },
    monkey() {
      for (let i = 0; i < 3; i++) this.tone(900 + i * 120, 0.12, 'sawtooth', 0.08, 1500 + i * 100, i * 0.11);
    },
    power() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.12, null, i * 0.06)); },
    bell() { this.tone(1760, 0.5, 'sine', 0.06); this.tone(2637, 0.4, 'sine', 0.03, null, 0.02); },

    // Musique : darbouka (rythme maqsoum), qraqeb gnaoua, basse de guembri et mélodie en mode hijaz.
    startMusic() {
      if (!this.ac || this.timer) return;
      this.nextNote = this.ac.currentTime + 0.1; this.step = 0;
      this.timer = setInterval(() => this.schedule(), 40);
    },
    stopMusic() { clearInterval(this.timer); this.timer = null; },
    schedule() {
      const dt = 60 / 116 / 2; // une croche
      const HIJAZ = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33, 622.25, 739.99];
      while (this.nextNote < this.ac.currentTime + 0.25) {
        const t = this.nextNote, s = this.step % 16, m = this.music;
        const r = 'DT.TD.T.'[s % 8];
        if (r === 'D') { this.toneAt(t, 110, 0.22, 'sine', 0.5, 55, m); }
        else if (r === 'T') { this.noiseAt(t, 0.07, 0.35, 3200, 'bandpass', m, 2); }
        // qraqeb : petits claquements métalliques
        this.noiseAt(t, 0.03, s % 2 ? 0.08 : 0.14, 7000, 'highpass', m);
        if (s % 4 === 3) this.noiseAt(t + dt / 2, 0.03, 0.08, 7000, 'highpass', m);
        // guembri
        const bass = { 0: 73.42, 3: 73.42, 6: 87.31, 8: 55.0, 11: 65.41, 14: 73.42 }[s];
        if (bass) { this.toneAt(t, bass, 0.35, 'triangle', 0.45, null, m); this.toneAt(t, bass * 2, 0.12, 'square', 0.04, null, m); }
        // mélodie (marche aléatoire)
        if (this.step % 2 === 0 && Math.random() < 0.7) {
          this.mel = clamp(this.mel + pick([-2, -1, -1, 1, 1, 2, 0]), 0, HIJAZ.length - 1);
          this.toneAt(t, HIJAZ[this.mel], 0.28, 'triangle', 0.16, null, m);
          this.toneAt(t, HIJAZ[this.mel] * 2, 0.08, 'sawtooth', 0.02, null, m);
        }
        this.nextNote += dt; this.step++;
      }
    }
  };

  const vibrate = pattern => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignoré */ } };

  // ---------------------------------------------------------------- état du jeu
  let state = 'menu';
  let speed = SPEED0, score = 0, coinsRun = 0, time = 0, shake = 0, dyingT = 0;
  let best = store.get('record', 0), bank = store.get('pieces', 0);
  const p = {};
  const monkey = { dist: 2.5, x: 0, y: 0, phase: 0, danger: 0, intro: 0 };
  const power = { aimant: 0, babouches: 0, tapis: 0, x2: 0 };
  let obstacles = [], coins = [], powerups = [], decor = [], palms = [], particles = [];
  let genZ = 0, lastPowerZ = 0, decorZ = 0, palmZ = 0, flyCoinZ = 0;

  function resetWorld(withObstacles) {
    obstacles = []; coins = []; powerups = []; decor = []; palms = []; particles = [];
    Object.assign(p, {
      lane: 1, laneFrom: 1, x: 0, y: 0, vy: 0, z: 0, ground: 0, slide: 0, onGround: true,
      phase: 0, ghost: 0, coyote: 0, jumpBuf: 0, slideQueued: false, ignore: null, ignoreT: 0
    });
    speed = withObstacles ? SPEED0 : 9; score = 0; coinsRun = 0; time = 0; shake = 0; dyingT = 0;
    for (const k in power) power[k] = 0;
    genZ = withObstacles ? 70 : Infinity; lastPowerZ = 0; decorZ = -10; palmZ = -10; flyCoinZ = 0;
    Object.assign(monkey, { dist: 2.4, x: 0, y: 0, danger: 0, intro: 2.8 });
    cam.x = 0; cam.y = CAM_H; cam.z = -CAM_BACK;
    if (withObstacles) coinLine(1, 18, 58);
  }

  // ---------------------------------------------------------------- génération du niveau
  function addStall(lane, z0, len, opts) {
    opts = opts || {};
    const o = {
      type: 'stand', lane, x: LANES[lane], z0, z1: z0 + len, h: STALL_H, hw: 1.1,
      v: opts.v || 0, moving: !!opts.v, active: false, rot: 0,
      variant: opts.variant || pick(GOODS), aw: randInt(0, AWNINGS.length - 1), seed: Math.random() * 1000
    };
    obstacles.push(o);
    return o;
  }
  function addRamp(lane, z0) {
    obstacles.push({ type: 'rampe', lane, x: LANES[lane], z0, z1: z0 + RAMP_LEN, h: STALL_H, hw: 1.1 });
  }
  function addLow(lane, z) {
    obstacles.push({ type: 'bas', lane, x: LANES[lane], z0: z - 0.45, z1: z + 0.45, h: 1.0, hw: 1.15,
      variant: pick(['caisse', 'tapis', 'poteries']), seed: Math.random() * 1000 });
  }
  function addHigh(lane, z) {
    obstacles.push({ type: 'haut', lane, x: LANES[lane], z0: z - 0.3, z1: z + 0.3, yb: 1.2, h: 3.2, hw: 1.15,
      rug: randInt(0, RUGS.length - 1) });
  }
  function coinLine(lane, z0, z1, y, step) {
    for (let z = z0; z <= z1; z += step || 3) coins.push({ x: LANES[lane], y: y || 0.9, z });
  }
  function coinArc(lane, zc, base) {
    for (let i = -3; i <= 3; i++) {
      const t = i / 3.5;
      coins.push({ x: LANES[lane], y: (base || 0) + 0.9 + 1.4 * (1 - t * t), z: zc + i * 2 });
    }
  }
  function coinRamp(lane, z0, len) {
    for (let z = z0 + 1; z < z0 + RAMP_LEN; z += 2.5) coins.push({ x: LANES[lane], y: STALL_H * (z - z0) / RAMP_LEN + 0.9, z });
    for (let z = z0 + RAMP_LEN + 1.5; z < z0 + RAMP_LEN + len; z += 3) coins.push({ x: LANES[lane], y: STALL_H + 0.9, z });
  }
  function maybePower(lane, z) {
    if (z - lastPowerZ > 380 && Math.random() < 0.4) {
      lastPowerZ = z;
      powerups.push({ kind: pick(['aimant', 'babouches', 'tapis', 'x2']), x: LANES[lane], y: 1.1, z });
      return true;
    }
    return false;
  }

  // Motifs : chacun reçoit le z de départ et renvoie le z de fin.
  function patStalls(z, diff) {
    const lanes = shuffle([0, 1, 2]);
    const n = Math.random() < 0.3 + 0.4 * diff ? 2 : 1;
    let end = z;
    for (let i = 0; i < n; i++) {
      const lane = lanes[i];
      let zz = z + (i ? rand(0, 8) : 0);
      const len = rand(10, 18 + 8 * diff);
      if (Math.random() < 0.45) {
        addRamp(lane, zz);
        if (Math.random() < 0.75) coinRamp(lane, zz, len);
        zz += RAMP_LEN;
      }
      addStall(lane, zz, len);
      end = Math.max(end, zz + len);
    }
    const fl = lanes[n];
    if (diff > 0.2 && Math.random() < 0.5) {
      const bz = z + rand(6, Math.max(8, end - z - 4));
      if (Math.random() < 0.5) { addLow(fl, bz); coinArc(fl, bz); }
      else { addHigh(fl, bz); coinLine(fl, bz - 6, bz + 6, 0.5, 2); }
    } else if (!maybePower(fl, z + 8)) {
      coinLine(fl, z, end, 0.9, 3);
    }
    return end;
  }
  function patWall(z) {
    const lanes = shuffle([0, 1, 2]);
    const len = rand(14, 22);
    addRamp(lanes[0], z);
    addStall(lanes[0], z + RAMP_LEN, len);
    coinRamp(lanes[0], z, len);
    let end = z + RAMP_LEN + len;
    for (const l of [lanes[1], lanes[2]]) {
      const s = addStall(l, z + RAMP_LEN - rand(1, 3), len + rand(2, 10));
      end = Math.max(end, s.z1);
    }
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
    if (Math.random() < 0.5) {
      addStall(lanes[1], z + rand(10, 28), rand(10, 16));
      coinLine(lanes[2], z, z + 45, 0.9, 3);
    } else {
      coinLine(lanes[1], z, z + 45, 0.9, 3);
    }
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
      const pats = [
        [patBreath, 1.2 - diff],
        [patStalls, 3],
        [patRow, 2],
        [patZigzag, 0.8 + diff],
        [patWall, diff > 0.1 ? 1.2 : 0.3],
        [patCart, diff > 0.05 ? 1 + diff : 0.3]
      ];
      let tot = 0;
      for (const q of pats) tot += q[1];
      let r = Math.random() * tot, fn = pats[0][0];
      for (const q of pats) { r -= q[1]; if (r <= 0) { fn = q[0]; break; } }
      const end = fn(genZ, diff);
      genZ = end + 14 + speed * 0.55;
    }
  }

  function genDecor() {
    while (decorZ < p.z + FAR) {
      decorZ += rand(5, 11);
      const side = Math.random() < 0.5 ? -1 : 1;
      decor.push({ kind: pick(['pot', 'sac', 'pot', 'pile', 'chat', 'sac']), x: side * rand(5.0, 5.9), z: decorZ, side, c: randInt(0, 5) });
      if (Math.random() < 0.16) decor.push({ kind: 'guirlande', z: decorZ + 3, c: randInt(0, 2) });
    }
    while (palmZ < p.z + FAR) {
      palmZ += rand(14, 30);
      palms.push({ x: (Math.random() < 0.5 ? -1 : 1) * rand(WALL_X + 3, WALL_X + 9), z: palmZ, h: rand(10, 14), lean: rand(-0.6, 0.6) });
    }
  }

  // ---------------------------------------------------------------- physique
  function surfaceTop(o, z) {
    if (o.type === 'rampe') return o.h * clamp((z - o.z0) / (o.z1 - o.z0), 0, 1);
    return o.h;
  }
  function groundAt(x, z, feet) {
    let g = 0;
    for (const o of obstacles) {
      if (o.type !== 'stand' && o.type !== 'rampe') continue;
      if (z < o.z0 - 0.3 || z > o.z1 + 0.3) continue;
      if (Math.abs(x - o.x) > o.hw + 0.1) continue;
      const top = surfaceTop(o, z);
      const tol = o.type === 'rampe' ? 1.0 : 0.4;
      if (top <= feet + tol && top > g) g = top;
    }
    return g;
  }
  function insideStand() {
    for (const o of obstacles) {
      if (o.type !== 'stand') continue;
      if (p.z > o.z0 - 0.4 && p.z < o.z1 + 0.4 && Math.abs(p.x - o.x) < o.hw + 0.3 && p.y < o.h - 0.4) return true;
    }
    return false;
  }

  function act(d) {
    if (state !== 'play') return;
    if (d === 'gauche' || d === 'droite') {
      const nl = clamp(p.lane + (d === 'gauche' ? -1 : 1), 0, 2);
      if (nl !== p.lane) { p.laneFrom = p.lane; p.lane = nl; Sound.swish(); }
      else shake = Math.max(shake, 0.12);
    } else if (d === 'haut') {
      if (power.tapis > 0) return;
      if (p.onGround || p.coyote > 0) doJump();
      else p.jumpBuf = 0.18;
    } else if (d === 'bas') {
      if (power.tapis > 0) return;
      if (p.onGround) { p.slide = 0.7; Sound.slide(); }
      else { p.vy = Math.min(p.vy, -22); p.slideQueued = true; }
    }
  }
  function doJump() {
    p.vy = power.babouches > 0 ? SUPER_JUMP_V : JUMP_V;
    p.onGround = false; p.slide = 0; p.coyote = 0; p.jumpBuf = 0;
    Sound.jump();
  }

  function stumble() {
    if (monkey.danger > 0) { crash(); return; }
    monkey.danger = 5;
    shake = 0.35;
    Sound.bump(); Sound.monkey();
    vibrate(70);
  }
  function crash() {
    if (state !== 'play') return;
    state = 'dying'; dyingT = 0;
    shake = 0.6;
    monkey.startDist = monkey.dist;
    Sound.crash(); Sound.monkey(); Sound.stopMusic();
    vibrate([60, 40, 140]);
  }
  function onHit(o) {
    const changing = Math.abs(p.x - LANES[p.lane]) > 0.2;
    if (changing && o.lane === p.lane && p.lane !== p.laneFrom) {
      p.lane = p.laneFrom;            // choc latéral : on rebondit et on trébuche
      p.ignore = o; p.ignoreT = 0.5;
      stumble();
    } else {
      // collision frontale : on recule le joueur juste devant l'obstacle pour que l'impact soit lisible
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

  function activatePower(kind) {
    power[kind] = DUREES[kind];
    if (kind === 'tapis') { flyCoinZ = p.z + 20; p.slide = 0; }
    Sound.power();
    toast(NOMS[kind] + ' !');
    vibrate(30);
  }

  function burst(x, y, z, col, n, spd) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, z, vx: rand(-1, 1) * spd, vy: rand(0.3, 1.2) * spd, vz: rand(-0.5, 1) * spd,
        life: rand(0.35, 0.7), max: 0.7, col, size: rand(0.06, 0.12) });
    }
  }

  // ---------------------------------------------------------------- mise à jour
  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt * 1.5);
    if (state === 'pause') return;

    const playing = state === 'play';
    if (playing) speed = Math.min(SPEED_MAX, SPEED0 + time * 0.11);
    const sp = state === 'dying' || state === 'over' ? 0 : speed;

    // --- joueur
    p.z += sp * dt;
    p.phase += dt * (sp > 0 ? 5 + sp * 0.33 : 0);
    const tx = LANES[p.lane];
    p.x += (tx - p.x) * Math.min(1, dt * 15);
    if (Math.abs(tx - p.x) < 0.01) { p.x = tx; p.laneFrom = p.lane; }
    p.slide = Math.max(0, p.slide - dt);
    p.ghost = Math.max(0, p.ghost - dt);
    p.ignoreT = Math.max(0, p.ignoreT - dt);
    p.coyote = Math.max(0, p.coyote - dt);
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);

    if (state === 'dying') {
      dyingT += dt;
      p.vy -= GRAV * dt; p.y = Math.max(p.ground, p.y + p.vy * dt);
    } else if (power.tapis > 0) {
      p.y += (6.5 - p.y) * Math.min(1, dt * 3);
      p.vy = 0; p.onGround = false;
      p.ground = groundAt(p.x, p.z, 99);
    } else {
      const prevY = p.y, wasGround = p.onGround;
      p.vy -= GRAV * dt;
      p.y += p.vy * dt;
      const g = groundAt(p.x, p.z, prevY);
      p.ground = g;
      if (p.y <= g) {
        if (!wasGround && p.vy < -8) { Sound.land(); burst(p.x, g, p.z, '#e8cfa4', 6, 2); }
        p.y = g; p.vy = 0; p.onGround = true;
        if (p.slideQueued) { p.slideQueued = false; p.slide = 0.6; Sound.slide(); }
        if (p.jumpBuf > 0) doJump();
      } else {
        if (wasGround && p.vy <= 0) p.coyote = 0.1;
        p.onGround = false;
      }
    }
    if (playing) checkCollisions();
    if (p.ghost > 0 && p.ghost < 0.15 && insideStand()) p.ghost = 0.15;

    // --- pouvoirs
    if (playing) {
      for (const k in power) {
        if (power[k] <= 0) continue;
        power[k] = Math.max(0, power[k] - dt);
        if (k === 'tapis' && power[k] === 0) { p.ghost = 2; p.vy = 0; }
      }
      if (power.tapis > 1.2) {
        while (flyCoinZ < p.z + 60) {
          flyCoinZ += 2.5;
          const l = Math.round(1 + Math.sin(flyCoinZ * 0.045) * 1.2);
          coins.push({ x: LANES[clamp(l, 0, 2)], y: 7.4, z: flyCoinZ });
        }
      }
      score += sp * dt * 0.5 * (power.x2 > 0 ? 2 : 1);
    }

    // --- obstacles mobiles (charrettes)
    for (const o of obstacles) {
      if (!o.moving) continue;
      if (!o.active && o.z0 - p.z < 70 && playing) { o.active = true; Sound.bell(); }
      if (o.active && state !== 'over' && state !== 'dying') { o.z0 -= o.v * dt; o.z1 -= o.v * dt; o.rot += o.v * dt / 0.38; }
    }

    // --- pièces et bonus
    const phh = p.slide > 0 ? PH_SLIDE : PH;
    for (const c of coins) {
      if (c.taken) continue;
      if (power.aimant > 0 && !c.mag && c.z - p.z < 28 && c.z > p.z - 2) c.mag = true;
      if (c.mag) {
        const k = Math.min(1, dt * 9);
        c.x += (p.x - c.x) * k; c.y += (p.y + 0.9 - c.y) * k; c.z += (p.z + 0.2 - c.z) * k;
      }
      if (playing && Math.abs(c.z - p.z) < 1.0 && Math.abs(c.x - p.x) < 1.0 && c.y > p.y - 0.4 && c.y < p.y + phh + 0.6) {
        c.taken = true; coinsRun++;
        Sound.coin();
        burst(c.x, c.y, c.z, '#ffd75e', 4, 2.5);
      }
    }
    for (const u of powerups) {
      if (u.taken) continue;
      if (playing && Math.abs(u.z - p.z) < 1.1 && Math.abs(u.x - p.x) < 1.1 && u.y > p.y - 0.5 && u.y < p.y + phh + 0.6) {
        u.taken = true; activatePower(u.kind);
        burst(u.x, u.y, u.z, '#ffffff', 12, 3);
      }
    }

    // --- singe
    if (playing) {
      monkey.danger = Math.max(0, monkey.danger - dt);
      monkey.intro = Math.max(0, monkey.intro - dt);
      const target = monkey.danger > 0 || monkey.intro > 0 ? 2.3 : 12;
      monkey.dist += (target - monkey.dist) * Math.min(1, dt * (target < monkey.dist ? 4 : 0.5));
    } else if (state === 'menu') {
      monkey.dist = 2.6 + Math.sin(time * 0.8) * 0.4;
    } else if (state === 'dying') {
      const k = clamp(dyingT / 0.55, 0, 1);
      monkey.dist = lerp(monkey.startDist, 0.25, k);
    }
    monkey.x += (p.x - monkey.x) * Math.min(1, dt * 5);
    monkey.phase += dt * (sp > 0 ? 6 + sp * 0.3 : 12);
    const mg = groundAt(monkey.x, p.z - monkey.dist, 99);
    if (state === 'dying') {
      const k = clamp(dyingT / 0.55, 0, 1);
      monkey.y = k < 1 ? lerp(mg, p.y + 1.0, k) + Math.sin(k * Math.PI) * 1.6 : p.y + 1.0;
    } else {
      monkey.y += (mg - monkey.y) * Math.min(1, dt * 10);
    }
    if (state === 'dying' && dyingT > 1.5) gameOver();

    // --- particules
    for (const q of particles) {
      q.life -= dt; q.vy -= 9 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += (q.vz + sp) * dt;
    }

    // --- caméra
    cam.x += (p.x * 0.75 - cam.x) * Math.min(1, dt * 6);
    const ty = CAM_H + (power.tapis > 0 || (p.ghost > 0 && p.y > 3.5) ? p.y * 0.8 : p.ground * 0.85);
    cam.y += (ty - cam.y) * Math.min(1, dt * 4);
    cam.z = p.z - CAM_BACK;

    // --- génération et nettoyage
    if (playing) generate();
    genDecor();
    const back = p.z - CAM_BACK - 2;
    obstacles = obstacles.filter(o => o.z1 > back);
    coins = coins.filter(c => !c.taken && c.z > back);
    powerups = powerups.filter(u => !u.taken && u.z > back);
    decor = decor.filter(d => d.z > back);
    palms = palms.filter(d => d.z > back);
    particles = particles.filter(q => q.life > 0);
  }

  // ---------------------------------------------------------------- rendu : décor
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, Y0);
    g.addColorStop(0, '#2f86c9'); g.addColorStop(0.55, '#86c1e4'); g.addColorStop(1, '#f7dcaa');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Y0 + 1);
    ctx.fillStyle = '#c98a55'; ctx.fillRect(0, Y0, W, H - Y0);

    // soleil
    const sx = W * 0.8 - cam.x * 3, sy = Y0 * 0.32;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.25);
    sg.addColorStop(0, 'rgba(255,250,220,0.95)'); sg.addColorStop(0.12, 'rgba(255,240,190,0.8)'); sg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - W * 0.25, sy - W * 0.25, W * 0.5, W * 0.5);

    // Atlas enneigé
    const off = -cam.x * 2, mh = H * 0.07, step = (W + 120) / (mountains.length - 1);
    ctx.fillStyle = '#b7a2bd';
    ctx.beginPath(); ctx.moveTo(-60 + off, Y0);
    mountains.forEach((m, i) => ctx.lineTo(-60 + off + i * step, Y0 - m * mh));
    ctx.lineTo(W + 60 + off, Y0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f1f6';
    mountains.forEach((m, i) => {
      if (m < 0.75 || i === 0 || i === mountains.length - 1) return;
      const x = -60 + off + i * step, y = Y0 - m * mh, c = (m - 0.62) * mh;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + step * 0.55, y + c * 0.9); ctx.lineTo(x + step * 0.2, y + c * 0.6);
      ctx.lineTo(x - step * 0.1, y + c); ctx.lineTo(x - step * 0.55, y + c * 0.85); ctx.closePath(); ctx.fill();
    });

    drawKoutoubia(CX + W * 0.13 - cam.x * 4, Y0 + 2, H * 0.048);
  }

  function drawKoutoubia(x, base, tw) {
    const th = tw * 4.6;
    ctx.save();
    ctx.translate(x, base);
    ctx.fillStyle = '#d29a6a'; ctx.fillRect(-tw / 2, -th, tw, th);
    ctx.fillStyle = '#b77d52'; ctx.fillRect(tw * 0.18, -th, tw * 0.32, th);
    // panneaux décoratifs (arcs)
    ctx.fillStyle = '#9c6440';
    for (let k = 0; k < 3; k++) {
      const y = -th * (0.3 + k * 0.22);
      ctx.beginPath();
      ctx.moveTo(-tw * 0.22, y); ctx.lineTo(-tw * 0.22, y - tw * 0.35);
      ctx.arc(-tw * 0.02, y - tw * 0.35, tw * 0.2, Math.PI, 0);
      ctx.lineTo(tw * 0.18, y); ctx.closePath(); ctx.fill();
    }
    // bande de zellige turquoise et créneaux
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(-tw / 2, -th + tw * 0.06, tw, tw * 0.1);
    ctx.fillStyle = '#d29a6a';
    for (let k = 0; k < 4; k++) ctx.fillRect(-tw / 2 + k * tw * 0.27, -th - tw * 0.12, tw * 0.17, tw * 0.13);
    // lanterne sommitale
    const lw = tw * 0.42, lh = tw * 0.6;
    ctx.fillStyle = '#d29a6a'; ctx.fillRect(-lw / 2, -th - lh, lw, lh);
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(-lw / 2, -th - lh, lw, lh * 0.12);
    ctx.fillStyle = '#9c6440'; ctx.fillRect(-lw * 0.15, -th - lh * 0.75, lw * 0.3, lh * 0.45);
    ctx.fillStyle = '#4caf9a';
    ctx.beginPath(); ctx.ellipse(0, -th - lh, lw * 0.4, lw * 0.3, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#c8a03a'; ctx.lineWidth = Math.max(1, tw * 0.04);
    ctx.beginPath(); ctx.moveTo(0, -th - lh - lw * 0.3); ctx.lineTo(0, -th - lh - tw * 0.85); ctx.stroke();
    ctx.fillStyle = '#e8c04a';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.arc(0, -th - lh - tw * (0.42 + k * 0.13), tw * (0.07 - k * 0.012), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGround() {
    const zn = cam.z + NEAR + 0.01, zf = cam.z + FAR;
    poly('#d6a069', [-ROAD, 0, zn, ROAD, 0, zn, ROAD, 0, zf, -ROAD, 0, zf]);
    poly('#b9693f', [-WALL_X, 0, zn, -ROAD, 0, zn, -ROAD, 0, zf, -WALL_X, 0, zf]);
    poly('#b9693f', [ROAD, 0, zn, WALL_X, 0, zn, WALL_X, 0, zf, ROAD, 0, zf]);
    // dalles (bandes qui défilent)
    const zlim = cam.z + 150;
    for (let z = Math.floor(zn / 3) * 3; z < zlim; z += 3) {
      if (mod(Math.round(z / 3), 2)) continue;
      const a = Math.max(z, zn), b = z + 1.5;
      if (b <= a) continue;
      poly('#cf9760', [-ROAD, 0, a, ROAD, 0, a, ROAD, 0, b, -ROAD, 0, b]);
      poly('#ad613a', [-WALL_X, 0, a, -ROAD, 0, a, -ROAD, 0, b, -WALL_X, 0, b]);
      poly('#ad613a', [ROAD, 0, a, WALL_X, 0, a, WALL_X, 0, b, ROAD, 0, b]);
    }
    // bordures
    for (const s of [-1, 1]) {
      const x = s * ROAD;
      poly('#8f4f2e', [x - 0.15, 0, zn, x + 0.15, 0, zn, x + 0.15, 0, zf, x - 0.15, 0, zf]);
    }
    // séparateurs de voies en zellige
    const tiles = ['#1d6f8a', '#f3ead6', '#2f8f5b', '#f3ead6'];
    for (const bx of [-LANE / 2, LANE / 2]) {
      for (let z = Math.floor(zn); z < cam.z + 90; z++) {
        const a = Math.max(z, zn);
        poly(tiles[mod(z, 4)], [bx - 0.08, 0, a, bx + 0.08, 0, a, bx + 0.08, 0, z + 0.9, bx - 0.08, 0, z + 0.9]);
      }
    }
    // brume à l'horizon
    const hz = ctx.createLinearGradient(0, Y0 - 2, 0, Y0 + H * 0.05);
    hz.addColorStop(0, 'rgba(247,220,170,1)'); hz.addColorStop(1, 'rgba(247,220,170,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, Y0 - 2, W, H * 0.05 + 2);
  }

  function drawPalms() {
    for (let i = palms.length - 1; i >= 0; i--) {
      const t = palms[i];
      if (t.z - cam.z < 2) continue;
      ctx.globalAlpha = fade(t.z);
      const b = P(t.x, 0, t.z), top = P(t.x + t.lean, t.h, t.z);
      if (!b || !top) continue;
      const s = b.s;
      ctx.strokeStyle = '#7a5532'; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, 0.45 * s);
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo(lerp(b.x, top.x, 0.3), lerp(b.y, top.y, 0.5), top.x, top.y); ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.3;
        const ex = top.x + Math.cos(a) * 3.2 * s, ey = top.y + Math.sin(a) * 1.2 * s + 1.4 * s;
        ctx.strokeStyle = k % 2 ? '#2f6d34' : '#3f8a3e';
        ctx.lineWidth = Math.max(1, 0.35 * s);
        ctx.beginPath(); ctx.moveTo(top.x, top.y);
        ctx.quadraticCurveTo(top.x + Math.cos(a) * 1.8 * s, top.y - 1.0 * s, ex, ey); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  const SEG = 6;
  function drawWalls() {
    const zn = cam.z + NEAR + 0.01;
    const first = Math.floor(zn / SEG), last = Math.floor((cam.z + FAR) / SEG);
    for (let i = last; i >= first; i--) {
      const z0 = i * SEG, za = Math.max(z0, zn), zb = z0 + SEG;
      ctx.globalAlpha = fade(za);
      drawWallSeg(-1, i, za, zb, za > z0);
      drawWallSeg(1, i, za, zb, za > z0);
    }
    ctx.globalAlpha = 1;
  }
  function wpoly(side, fill, pts) {
    const out = [];
    for (let i = 0; i < pts.length; i += 2) out.push(side * WALL_X, pts[i + 1], pts[i]);
    poly(fill, out);
  }
  function archPts(zc, hw, yb, ys) {
    // Arc outrepassé (en fer à cheval) : le cercle déborde des piédroits.
    const a = 0.35, r = hw / Math.cos(a), pts = [zc - hw, yb];
    for (let k = 0; k <= 12; k++) {
      const th = Math.PI + a - (k / 12) * (Math.PI + 2 * a);
      pts.push(zc + r * Math.cos(th), ys + r * Math.sin(th));
    }
    pts.push(zc + hw, yb);
    return pts;
  }
  function drawWallSeg(side, i, za, zb, clipped) {
    const z0 = i * SEG, x = side * WALL_X;
    const base = WALL_COLS[Math.floor(hash(i * 7.31 + side * 3.17) * WALL_COLS.length)];
    const lit = side > 0 ? 1.04 : 0.86;
    poly(shade(base, lit), [x, 0, za, x, WALL_H, za, x, WALL_H, zb, x, 0, zb]);
    poly(shade(base, lit * 0.78), [x, 0, za, x, 0.5, za, x, 0.5, zb, x, 0, zb]);
    const d = za - cam.z;
    if (d > 150) return;
    for (let k = 0; k < 4; k++) {
      const m0 = z0 + k * 1.5, m1 = m0 + 0.8;
      if (m0 < za) continue;
      poly(shade(base, lit), [x, WALL_H, m0, x, WALL_H + 0.6, m0, x, WALL_H + 0.6, m1, x, WALL_H, m1]);
    }
    poly(shade(base, lit * 0.9), [x, WALL_H - 0.35, za, x, WALL_H, za, x, WALL_H, zb, x, WALL_H - 0.35, zb]);
    if (clipped || d > 110) return;

    const type = Math.floor(hash(i * 3.7 + side * 11.3) * 7);
    const zc = z0 + SEG / 2, hc = hash(i * 1.91 + side);
    if (type === 1 || type === 4) {
      // porte en arc outrepassé
      wpoly(side, '#efe3c8', archPts(zc, 0.98, 0, 2.45));
      wpoly(side, DOORS[Math.floor(hc * DOORS.length)], archPts(zc, 0.78, 0, 2.45));
      wpoly(side, 'rgba(0,0,0,0.25)', [zc - 0.03, 0, zc + 0.03, 0, zc + 0.03, 2.9, zc - 0.03, 2.9]);
      wpoly(side, '#efe3c8', [zc - 1.2, 3.75, zc + 1.2, 3.75, zc + 1.2, 3.95, zc - 1.2, 3.95]);
      if (type === 4) drawWallLantern(side, zc + 1.6, 3.4);
    } else if (type === 2) {
      // échoppe ouverte avec tapis accrochés
      wpoly(side, '#e9d6b0', archPts(zc, 1.45, 0, 2.5));
      wpoly(side, '#3a2418', archPts(zc, 1.3, 0, 2.5));
      for (let k = 0; k < 3; k++) {
        const rz = zc - 0.8 + k * 0.8, col = BRIGHT[Math.floor(hash(i + k * 5.1) * BRIGHT.length)];
        wpoly(side, '#ffcf6b', [rz - 0.12, 2.6, rz + 0.12, 2.6, rz + 0.12, 2.9, rz - 0.12, 2.9]);
        wpoly(side, col, [rz - 0.25, 0.3, rz + 0.25, 0.3, rz + 0.25, 1.4, rz - 0.25, 1.4]);
      }
      for (const dz of [-2.35, 2.35]) {
        const rug = RUGS[Math.floor(hash(i + dz) * RUGS.length)];
        wpoly(side, rug.bd, [zc + dz - 0.5, 2.0, zc + dz + 0.5, 2.0, zc + dz + 0.5, 4.6, zc + dz - 0.5, 4.6]);
        wpoly(side, rug.bg, [zc + dz - 0.38, 2.12, zc + dz + 0.38, 2.12, zc + dz + 0.38, 4.48, zc + dz - 0.38, 4.48]);
        wpoly(side, rug.md, [zc + dz, 2.6, zc + dz + 0.28, 3.3, zc + dz, 4.0, zc + dz - 0.28, 3.3]);
      }
    } else if (type === 3) {
      // fenêtres en moucharabieh et bougainvilliers
      for (const dz of [-1.4, 1.4]) {
        wpoly(side, '#efe3c8', [zc + dz - 0.55, 4.0, zc + dz + 0.55, 4.0, zc + dz + 0.55, 5.6, zc + dz - 0.55, 5.6]);
        wpoly(side, '#5a3a22', [zc + dz - 0.42, 4.12, zc + dz + 0.42, 4.12, zc + dz + 0.42, 5.48, zc + dz - 0.42, 5.48]);
        wpoly(side, '#8a6040', [zc + dz - 0.42, 4.75, zc + dz + 0.42, 4.75, zc + dz + 0.42, 4.85, zc + dz - 0.42, 4.85]);
      }
      for (let k = 0; k < 9; k++) {
        const bz = z0 + 0.4 + k * 0.62, by = WALL_H - 0.4 - hash(i * 3 + k) * 1.6;
        const q = P(x, by, bz);
        if (!q) continue;
        ctx.fillStyle = k % 3 ? '#c2185b' : '#e04f8f';
        ctx.beginPath(); ctx.arc(q.x, q.y, 0.5 * q.s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3f7d3a';
        ctx.beginPath(); ctx.arc(q.x + 0.3 * q.s, q.y + 0.3 * q.s, 0.22 * q.s, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 5) {
      // fontaine en zellige
      const cols = ['#1d6f8a', '#f3ead6', '#2f8f5b', '#e9b824'];
      wpoly(side, '#efe3c8', archPts(zc, 1.15, 0.4, 2.4));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const tz = zc - 0.9 + c * 0.45, ty = 0.6 + r * 0.45;
        wpoly(side, cols[(r + c) % 4], [tz, ty, tz + 0.43, ty, tz + 0.43, ty + 0.43, tz, ty + 0.43]);
      }
      wpoly(side, '#5c8f9c', [zc - 1.2, 0, zc + 1.2, 0, zc + 1.2, 0.55, zc - 1.2, 0.55]);
    } else {
      wpoly(side, '#5a3a22', [zc - 0.4, 4.6, zc + 0.4, 4.6, zc + 0.4, 5.5, zc - 0.4, 5.5]);
      if (type === 6) drawWallLantern(side, zc, 3.4);
    }
  }
  function drawWallLantern(side, z, y) {
    const q = P(side * (WALL_X - 0.35), y, z);
    if (!q) return;
    const s = q.s;
    const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 0.9 * s);
    g.addColorStop(0, 'rgba(255,214,120,0.6)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.fillRect(q.x - s, q.y - s, 2 * s, 2 * s);
    ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = Math.max(1, 0.05 * s);
    ctx.beginPath(); ctx.moveTo(q.x - side * 0.35 * s, q.y - 0.45 * s); ctx.lineTo(q.x, q.y - 0.45 * s); ctx.lineTo(q.x, q.y - 0.3 * s); ctx.stroke();
    ctx.fillStyle = '#ffcf6b';
    ctx.beginPath(); ctx.moveTo(q.x - 0.15 * s, q.y - 0.2 * s); ctx.lineTo(q.x + 0.15 * s, q.y - 0.2 * s);
    ctx.lineTo(q.x + 0.12 * s, q.y + 0.2 * s); ctx.lineTo(q.x, q.y + 0.32 * s); ctx.lineTo(q.x - 0.12 * s, q.y + 0.2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a6a2a';
    ctx.beginPath(); ctx.moveTo(q.x - 0.18 * s, q.y - 0.2 * s); ctx.lineTo(q.x, q.y - 0.36 * s); ctx.lineTo(q.x + 0.18 * s, q.y - 0.2 * s); ctx.closePath(); ctx.fill();
  }

  // ---------------------------------------------------------------- rendu : objets
  function textU(str, x, y, size, color, align) {
    ctx.save(); ctx.translate(x, y); ctx.scale(0.01, 0.01);
    ctx.font = `bold ${Math.round(size * 100)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  function ell(x, y, rx, ry, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), 0, 0, Math.PI * 2); ctx.fill();
  }
  function rr(x, y, w, h, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function drawStand(o) {
    const zn = Math.max(o.z0, cam.z + NEAR + 0.02);
    if (zn >= o.z1) return;
    const x0 = o.x - o.hw, x1 = o.x + o.hw, h = o.h, yb = h - 0.5, aw = AWNINGS[o.aw];
    for (const sx of [x0, x1]) {
      if ((sx === x0 && cam.x < x0) || (sx === x1 && cam.x > x1)) {
        const f = sx === x0 ? 0.72 : 0.84;
        poly(shade('#8b5a2b', f), [sx, 0, zn, sx, 1.1, zn, sx, 1.1, o.z1, sx, 0, o.z1]);
        poly(shade(aw[1] === '#7a2e1d' ? '#d9c8a5' : aw[1], f * 0.9), [sx, 1.1, zn, sx, yb, zn, sx, yb, o.z1, sx, 1.1, o.z1]);
        poly(shade(aw[0], f), [sx, yb, zn, sx, h, zn, sx, h, o.z1, sx, yb, o.z1]);
        if (o.moving) {
          for (const wz of [o.z0 + 1.2, o.z1 - 1.2]) {
            const q = P(sx, 0.4, wz);
            if (q) { ell(q.x, q.y, 0.14 * q.s, 0.4 * q.s, '#3b2416'); ell(q.x, q.y, 0.07 * q.s, 0.2 * q.s, '#8b5a2b'); }
          }
        }
      }
    }
    if (cam.y > h) {
      const n = 5, ws = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        poly(k & 1 ? aw[1] : aw[0], [x0 + k * ws, h, zn, x0 + (k + 1) * ws, h, zn, x0 + (k + 1) * ws, h, o.z1, x0 + k * ws, h, o.z1]);
      }
      for (let z = Math.ceil(o.z0 / 3) * 3; z < o.z1; z += 3) {
        if (z < zn) continue;
        poly('rgba(60,30,10,0.18)', [x0, h, z, x1, h, z, x1, h, z + 0.15, x0, h, z + 0.15]);
      }
    }
    const a = P(x0, h, zn), b = P(x1, 0, zn);
    if (!a || !b) return;
    if (zn > o.z0) { ctx.fillStyle = '#3b2416'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); return; }
    drawStandFront(o, a.x, a.y, (b.x - a.x) / (x1 - x0));
  }

  function drawStandFront(o, X, Yt, u) {
    const w = o.hw * 2, h = o.h, aw = AWNINGS[o.aw], detail = u > 20;
    const hs = k => hash(o.seed + k * 13.7);
    ctx.save(); ctx.translate(X, Yt); ctx.scale(u, u);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // intérieur sombre
    ctx.fillStyle = '#2e1a10'; ctx.fillRect(0, 0.4, w, h - 0.4);
    const cart = o.variant === 'charrette';
    const v = cart ? 'oranges' : o.variant;
    if (detail) {
      if (v === 'lanternes') {
        for (let k = 0; k < 4; k++) {
          const lx = 0.35 + k * 0.5, ly = 0.75 + (k % 2) * 0.25;
          const g = ctx.createRadialGradient(lx, ly + 0.15, 0, lx, ly + 0.15, 0.35);
          g.addColorStop(0, 'rgba(255,210,110,0.7)'); g.addColorStop(1, 'rgba(255,210,110,0)');
          ctx.fillStyle = g; ctx.fillRect(lx - 0.35, ly - 0.2, 0.7, 0.7);
          ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 0.02;
          ctx.beginPath(); ctx.moveTo(lx, 0.5); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.fillStyle = k % 2 ? '#ffcf6b' : '#ff9f43';
          ctx.beginPath(); ctx.moveTo(lx - 0.1, ly + 0.05); ctx.lineTo(lx + 0.1, ly + 0.05); ctx.lineTo(lx + 0.08, ly + 0.3);
          ctx.lineTo(lx, ly + 0.38); ctx.lineTo(lx - 0.08, ly + 0.3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#b8892b';
          ctx.beginPath(); ctx.moveTo(lx - 0.12, ly + 0.06); ctx.lineTo(lx, ly - 0.06); ctx.lineTo(lx + 0.12, ly + 0.06); ctx.closePath(); ctx.fill();
        }
      } else if (v === 'tapis') {
        for (let k = 0; k < 3; k++) {
          const rug = RUGS[Math.floor(hs(k) * RUGS.length)], rx = 0.12 + k * 0.68;
          ctx.fillStyle = rug.bd; ctx.fillRect(rx, 0.5, 0.6, 1.15);
          ctx.fillStyle = rug.bg; ctx.fillRect(rx + 0.07, 0.57, 0.46, 1.01);
          ctx.fillStyle = rug.md;
          ctx.beginPath(); ctx.moveTo(rx + 0.3, 0.75); ctx.lineTo(rx + 0.48, 1.07); ctx.lineTo(rx + 0.3, 1.4); ctx.lineTo(rx + 0.12, 1.07); ctx.closePath(); ctx.fill();
        }
      } else if (v === 'babouches') {
        for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
          const bx = 0.25 + c * 0.42, by = 0.62 + r * 0.45;
          ctx.fillStyle = BRIGHT[Math.floor(hs(r * 5 + c) * BRIGHT.length)];
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 0.14, by + 0.15, bx, by + 0.36);
          ctx.quadraticCurveTo(bx - 0.14, by + 0.15, bx, by); ctx.fill();
        }
      } else if (v === 'poteries') {
        for (let k = 0; k < 4; k++) {
          const px = 0.32 + k * 0.52, py = 0.82 + (k % 2) * 0.32;
          ell(px, py, 0.2, 0.2, BRIGHT[Math.floor(hs(k) * 4)]);
          ell(px, py, 0.13, 0.13, '#f3e7cf');
          ell(px, py, 0.06, 0.06, '#1d6f8a');
        }
      } else if (v === 'epices') {
        for (let k = 0; k < 4; k++) {
          const sx = 0.35 + k * 0.5;
          ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 0.02;
          ctx.beginPath(); ctx.moveTo(sx, 0.45); ctx.lineTo(sx, 0.62); ctx.stroke();
          for (let j = 0; j < 5; j++) ell(sx + (j % 2 ? 0.05 : -0.05), 0.65 + j * 0.1, 0.05, 0.07, k % 2 ? '#c0392b' : '#e8d9b0');
        }
      } else if (v === 'oranges') {
        rr(0.45, 0.6, 1.3, 0.42, 0.06, '#f3e7cf');
        textU('عصير', 1.1, 0.74, 0.2, '#c0392b');
        textU('JUS D\'ORANGE', 1.1, 0.92, 0.09, '#2f8f5b');
      }
    }
    // montants
    ctx.fillStyle = '#6b4423'; ctx.fillRect(0, 0.4, 0.1, h - 0.4); ctx.fillRect(w - 0.1, 0.4, 0.1, h - 0.4);

    // marchandises sur le comptoir
    const cy = cart ? 1.75 : 1.7;
    if (detail) {
      if (v === 'epices') {
        for (let k = 0; k < 5; k++) {
          const sx = 0.3 + k * 0.4;
          ctx.fillStyle = SPICES[Math.floor(hs(k + 9) * SPICES.length)];
          ctx.beginPath(); ctx.moveTo(sx - 0.17, cy); ctx.quadraticCurveTo(sx, cy - 0.6, sx + 0.17, cy); ctx.fill();
          ell(sx, cy, 0.19, 0.05, '#c9a26b');
        }
      } else if (v === 'oranges') {
        for (let r = 0; r < 4; r++) {
          const n = 11 - r * 2;
          for (let k = 0; k < n; k++) ell(0.2 + (r + k) * 0.18 + 0.02, cy - 0.08 - r * 0.13, 0.085, 0.085, (k + r) % 3 ? '#f39c12' : '#e67e22');
        }
      } else if (v === 'lanternes') {
        for (let k = 0; k < 3; k++) {
          const lx = 0.45 + k * 0.65;
          ctx.fillStyle = '#c9a23a'; ctx.fillRect(lx - 0.1, cy - 0.32, 0.2, 0.32);
          ctx.fillStyle = '#ffe3a0'; ctx.fillRect(lx - 0.06, cy - 0.28, 0.12, 0.22);
          ctx.fillStyle = '#c9a23a';
          ctx.beginPath(); ctx.moveTo(lx - 0.13, cy - 0.32); ctx.lineTo(lx, cy - 0.5); ctx.lineTo(lx + 0.13, cy - 0.32); ctx.closePath(); ctx.fill();
        }
      } else if (v === 'tapis') {
        for (let k = 0; k < 3; k++) {
          const col = RUGS[Math.floor(hs(k + 4) * RUGS.length)];
          rr(0.18, cy - 0.14 - k * 0.13, 1.84 - k * 0.2, 0.12, 0.04, k % 2 ? col.bg : col.bd);
        }
      } else if (v === 'babouches') {
        for (let k = 0; k < 6; k++) {
          const bx = 0.3 + k * 0.32;
          ctx.fillStyle = BRIGHT[Math.floor(hs(k + 20) * BRIGHT.length)];
          ctx.beginPath(); ctx.moveTo(bx - 0.13, cy); ctx.quadraticCurveTo(bx - 0.1, cy - 0.16, bx + 0.15, cy - 0.04);
          ctx.lineTo(bx + 0.15, cy); ctx.closePath(); ctx.fill();
        }
      } else if (v === 'poteries') {
        for (let k = 0; k < 3; k++) {
          const tx = 0.42 + k * 0.68, col = ['#1d6f8a', '#2f8f5b', '#c0602b'][k];
          ctx.fillStyle = shade(col, 0.8); ctx.fillRect(tx - 0.3, cy - 0.06, 0.6, 0.06);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(tx - 0.26, cy - 0.06); ctx.quadraticCurveTo(tx - 0.05, cy - 0.12, tx, cy - 0.5);
          ctx.quadraticCurveTo(tx + 0.05, cy - 0.12, tx + 0.26, cy - 0.06); ctx.closePath(); ctx.fill();
          ell(tx, cy - 0.52, 0.04, 0.04, '#e9c46a');
        }
      }
    } else {
      ctx.fillStyle = v === 'oranges' ? '#f39c12' : SPICES[Math.floor(hs(1) * SPICES.length)];
      ctx.fillRect(0.2, cy - 0.3, w - 0.4, 0.3);
    }

    if (cart) {
      // charrette : caisse + roues
      ctx.fillStyle = '#9a6a3c'; ctx.fillRect(0.05, cy, w - 0.1, 0.6);
      ctx.fillStyle = '#7a4f2a'; ctx.fillRect(0.05, cy + 0.27, w - 0.1, 0.05);
      ctx.fillStyle = '#2e1a10'; ctx.fillRect(0.3, cy + 0.6, w - 0.6, h - cy - 0.6);
      for (const wx of [0.45, w - 0.45]) {
        ell(wx, h - 0.4, 0.38, 0.38, '#4a2e18');
        ell(wx, h - 0.4, 0.3, 0.3, '#2e1a10');
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 0.05;
        for (let k = 0; k < 6; k++) {
          const a = o.rot + (k * Math.PI) / 3;
          ctx.beginPath(); ctx.moveTo(wx, h - 0.4); ctx.lineTo(wx + Math.cos(a) * 0.3, h - 0.4 + Math.sin(a) * 0.3); ctx.stroke();
        }
        ell(wx, h - 0.4, 0.07, 0.07, '#c9a23a');
      }
    } else {
      // comptoir en bois et frise de zellige
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, cy, w, h - cy);
      ctx.fillStyle = '#a8743f'; ctx.fillRect(-0.04, cy - 0.02, w + 0.08, 0.09);
      if (detail) {
        ctx.fillStyle = '#6f4521';
        for (let y = cy + 0.38; y < h; y += 0.3) ctx.fillRect(0, y, w, 0.025);
        const zc = ['#1d6f8a', '#f3ead6', '#2f8f5b', '#f3ead6'];
        for (let k = 0; k < 11; k++) { ctx.fillStyle = zc[k % 4]; ctx.fillRect(0.05 + k * 0.19, cy + 0.15, 0.17, 0.17); }
      }
    }

    // lambrequin de l'auvent
    const n = 6, sw = w / n;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = k & 1 ? aw[1] : aw[0];
      ctx.fillRect(k * sw, 0, sw + 0.005, 0.42);
      ctx.beginPath(); ctx.arc(k * sw + sw / 2, 0.42, sw / 2, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 0, w, 0.06);
    ctx.restore();
  }

  function drawRamp(o) {
    const zn = Math.max(o.z0, cam.z + NEAR + 0.02);
    if (zn >= o.z1) return;
    const x0 = o.x - o.hw, x1 = o.x + o.hw, ha = surfaceTop(o, zn);
    for (const sx of [x0, x1]) {
      if ((sx === x0 && cam.x < x0) || (sx === x1 && cam.x > x1)) {
        poly(sx === x0 ? '#6b4423' : '#7d5230', [sx, 0, zn, sx, ha, zn, sx, o.h, o.z1, sx, 0, o.z1]);
      }
    }
    poly('#b07a45', [x0, ha, zn, x1, ha, zn, x1, o.h, o.z1, x0, o.h, o.z1]);
    // planches
    ctx.strokeStyle = '#7d5230';
    for (let z = Math.ceil(o.z0 / 0.8) * 0.8; z < o.z1; z += 0.8) {
      if (z <= zn) continue;
      const hz = surfaceTop(o, z), a = P(x0, hz, z), b = P(x1, hz, z);
      if (!a || !b) continue;
      ctx.lineWidth = Math.max(1, 0.05 * a.s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // rails latéraux
    for (const sx of [x0 + 0.08, x1 - 0.08]) {
      const a = P(sx, ha + 0.05, zn), b = P(sx, o.h + 0.05, o.z1);
      if (!a || !b) continue;
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = Math.max(1, 0.12 * b.s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawLow(o) {
    if (o.z0 - cam.z < NEAR + 0.05) return;
    const x0 = o.x - o.hw, x1 = o.x + o.hw;
    const hs = k => hash(o.seed + k * 7.3);
    if (o.variant === 'caisse') {
      const hh = 0.75;
      if (cam.x < x0) poly('#7d5230', [x0, 0, o.z0, x0, hh, o.z0, x0, hh, o.z1, x0, 0, o.z1]);
      if (cam.x > x1) poly('#8b5a2b', [x1, 0, o.z0, x1, hh, o.z0, x1, hh, o.z1, x1, 0, o.z1]);
      poly('#e8892b', [x0, hh, o.z0, x1, hh, o.z0, x1, hh, o.z1, x0, hh, o.z1]);
      const a = P(x0, hh, o.z0), b = P(x1, 0, o.z0);
      if (!a || !b) return;
      const u = (b.x - a.x) / (x1 - x0);
      ctx.save(); ctx.translate(a.x, a.y); ctx.scale(u, u);
      for (let k = 0; k < 2; k++) {
        const bx = k * 1.17;
        ctx.fillStyle = '#b07a45'; ctx.fillRect(bx, 0, 1.13, hh);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(bx, 0.24, 1.13, 0.05); ctx.fillRect(bx, 0.5, 1.13, 0.05);
        ctx.fillRect(bx, 0, 0.08, hh); ctx.fillRect(bx + 1.05, 0, 0.08, hh);
      }
      for (let k = 0; k < 11; k++) ell(0.12 + k * 0.21, -0.04, 0.12, 0.12, k % 3 ? '#f39c12' : '#e67e22');
      ctx.restore();
    } else if (o.variant === 'tapis') {
      const a = P(x0, 1.0, o.z0), b = P(x1, 0, o.z0);
      if (!a || !b) return;
      const u = (b.x - a.x) / (x1 - x0);
      ctx.save(); ctx.translate(a.x, a.y); ctx.scale(u, u);
      const rolls = [[0, 0.55, 1.15], [1.15, 0.55, 1.15], [0.5, 0.08, 1.3]];
      rolls.forEach((r, k) => {
        const rug = RUGS[Math.floor(hs(k) * RUGS.length)];
        rr(r[0], r[1], r[2], 0.45, 0.22, rug.bg);
        ctx.fillStyle = rug.bd;
        for (let j = 1; j < 5; j++) ctx.fillRect(r[0] + j * r[2] / 5, r[1] + 0.03, 0.06, 0.39);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(r[0] + 0.1, r[1] + 0.08, r[2] - 0.2, 0.07);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(r[0] + 0.1, r[1] + 0.33, r[2] - 0.2, 0.07);
      });
      ctx.restore();
    } else {
      const hh = 0.45;
      if (cam.x < x0) poly('#6b4423', [x0, 0, o.z0, x0, hh, o.z0, x0, hh, o.z1, x0, 0, o.z1]);
      if (cam.x > x1) poly('#7d5230', [x1, 0, o.z0, x1, hh, o.z0, x1, hh, o.z1, x1, 0, o.z1]);
      poly('#a8743f', [x0, hh, o.z0, x1, hh, o.z0, x1, hh, o.z1, x0, hh, o.z1]);
      const a = P(x0, hh, o.z0), b = P(x1, 0, o.z0);
      if (!a || !b) return;
      const u = (b.x - a.x) / (x1 - x0);
      ctx.save(); ctx.translate(a.x, a.y); ctx.scale(u, u);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, 0, 2.3, 0.14);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(0.1, 0.14, 0.15, hh - 0.14); ctx.fillRect(2.05, 0.14, 0.15, hh - 0.14);
      for (let k = 0; k < 3; k++) {
        const tx = 0.4 + k * 0.75, col = ['#1d6f8a', '#c0602b', '#2f8f5b'][Math.floor(hs(k) * 3)];
        ell(tx, -0.04, 0.33, 0.06, shade(col, 0.75));
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(tx - 0.3, -0.06); ctx.quadraticCurveTo(tx - 0.06, -0.15, tx, -0.55);
        ctx.quadraticCurveTo(tx + 0.06, -0.15, tx + 0.3, -0.06); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(tx - 0.2, -0.1); ctx.quadraticCurveTo(tx - 0.05, -0.2, tx - 0.03, -0.42); ctx.lineTo(tx - 0.08, -0.12); ctx.closePath(); ctx.fill();
        ell(tx, -0.57, 0.05, 0.05, '#e9c46a');
      }
      ctx.restore();
    }
  }

  function drawHigh(o) {
    const zc = (o.z0 + o.z1) / 2;
    if (zc - cam.z < NEAR + 0.05) return;
    const x0 = o.x - o.hw, x1 = o.x + o.hw;
    const a = P(x0, o.h, zc), b = P(x1, 0, zc);
    if (!a || !b) return;
    const u = (b.x - a.x) / (x1 - x0);
    ctx.save(); ctx.translate(a.x, a.y); ctx.scale(u, u);
    const w = o.hw * 2, rug = RUGS[o.rug];
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(-0.05, -0.1, 0.12, o.h + 0.1); ctx.fillRect(w - 0.07, -0.1, 0.12, o.h + 0.1);
    ctx.fillRect(-0.1, -0.12, w + 0.2, 0.12);
    ell(0.01, -0.12, 0.09, 0.07, '#c9a23a'); ell(w + 0.01, -0.12, 0.09, 0.07, '#c9a23a');
    const top = 0.1, bot = o.h - o.yb, rx = 0.15, rw = w - 0.3;
    ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 0.025;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(rx + k * rw / 4, 0); ctx.lineTo(rx + k * rw / 4, top); ctx.stroke(); }
    ctx.fillStyle = rug.bd; ctx.fillRect(rx, top, rw, bot - top);
    ctx.fillStyle = rug.bg; ctx.fillRect(rx + 0.12, top + 0.12, rw - 0.24, bot - top - 0.24);
    ctx.fillStyle = rug.md;
    const mx = rx + rw / 2, my = (top + bot) / 2;
    ctx.beginPath(); ctx.moveTo(mx, my - 0.6); ctx.lineTo(mx + 0.5, my); ctx.lineTo(mx, my + 0.6); ctx.lineTo(mx - 0.5, my); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rug.bd;
    ctx.beginPath(); ctx.moveTo(mx, my - 0.3); ctx.lineTo(mx + 0.25, my); ctx.lineTo(mx, my + 0.3); ctx.lineTo(mx - 0.25, my); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rug.md;
    for (const [cx, cy] of [[rx + 0.32, top + 0.32], [rx + rw - 0.32, top + 0.32], [rx + 0.32, bot - 0.32], [rx + rw - 0.32, bot - 0.32]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy - 0.12); ctx.lineTo(cx + 0.12, cy); ctx.lineTo(cx, cy + 0.12); ctx.lineTo(cx - 0.12, cy); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#f1e4c3'; ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (let fx = rx + 0.04; fx < rx + rw; fx += 0.08) { ctx.moveTo(fx, bot); ctx.lineTo(fx, bot + 0.12); }
    ctx.stroke();
    ctx.restore();
  }

  function drawCoin(c) {
    const q = P(c.x, c.y, c.z);
    if (!q) return;
    const r = 0.3 * q.s;
    if (r < 0.6) return;
    const spin = Math.cos(time * 5 + c.z * 0.4);
    const rx = Math.max(r * 0.12, Math.abs(spin) * r);
    ell(q.x, q.y, rx, r, '#b8860b');
    ell(q.x, q.y, rx * 0.86, r * 0.86, spin > 0 ? '#f6c94a' : '#e8b330');
    if (rx > r * 0.5 && r > 3) {
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(rx / r, 1);
      ctx.fillStyle = '#c99520';
      ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
      ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
      ctx.restore();
    }
    ell(q.x - rx * 0.3, q.y - r * 0.35, rx * 0.2, r * 0.15, 'rgba(255,255,255,0.6)');
  }

  function drawPowerup(u) {
    const q = P(u.x, u.y + Math.sin(time * 3 + u.z) * 0.15, u.z);
    if (!q) return;
    const r = 0.55 * q.s;
    const g = ctx.createRadialGradient(q.x, q.y, r * 0.2, q.x, q.y, r * 1.4);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,240,180,0.55)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 1.4, 0, Math.PI * 2); ctx.fill();
    drawPowerIcon(u.kind, q.x, q.y, r);
  }
  function drawPowerIcon(kind, x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
    ctx.lineCap = 'butt';
    if (kind === 'aimant') {
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 0.32;
      ctx.beginPath(); ctx.arc(0, -0.05, 0.38, Math.PI, 0); ctx.lineTo(0.38, 0.45); ctx.moveTo(-0.38, -0.05); ctx.lineTo(-0.38, 0.45); ctx.stroke();
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(-0.54, 0.3, 0.32, 0.22); ctx.fillRect(0.22, 0.3, 0.32, 0.22);
    } else if (kind === 'babouches') {
      ctx.fillStyle = '#e9b824';
      ctx.beginPath(); ctx.moveTo(-0.6, 0.25); ctx.quadraticCurveTo(-0.5, -0.3, 0.1, -0.2); ctx.quadraticCurveTo(0.5, -0.15, 0.7, -0.45);
      ctx.quadraticCurveTo(0.65, 0.2, 0.3, 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a5a1a'; ell(-0.25, -0.05, 0.25, 0.1, '#8a5a1a');
      ctx.fillStyle = '#fff'; ctx.fillRect(-0.62, 0.22, 0.95, 0.08);
    } else if (kind === 'tapis') {
      ctx.rotate(-0.25);
      ctx.fillStyle = '#1f3b6e'; ctx.fillRect(-0.62, -0.32, 1.24, 0.64);
      ctx.fillStyle = '#a8262b'; ctx.fillRect(-0.5, -0.22, 1.0, 0.44);
      ctx.fillStyle = '#e9c46a';
      ctx.beginPath(); ctx.moveTo(0, -0.18); ctx.lineTo(0.25, 0); ctx.lineTo(0, 0.18); ctx.lineTo(-0.25, 0); ctx.closePath(); ctx.fill();
      ctx.fillRect(-0.72, -0.3, 0.1, 0.6); ctx.fillRect(0.62, -0.3, 0.1, 0.6);
    } else {
      textU('×2', 0.03, 0.05, 0.85, '#7d2a17');
      textU('×2', 0, 0, 0.85, '#f2b632');
    }
    ctx.restore();
  }

  function drawDecor(d) {
    if (d.kind === 'guirlande') { drawGarland(d); return; }
    const q = P(d.x, 0, d.z);
    if (!q) return;
    const s = q.s;
    if (s < 1.2) return;
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s);
    if (d.kind === 'pot') {
      ell(0, -0.95, 0.42, 0.38, '#3f7d3a'); ell(-0.2, -0.75, 0.25, 0.22, '#4f9a45'); ell(0.22, -0.8, 0.22, 0.2, '#2f6d34');
      if (d.c % 2) for (let k = 0; k < 5; k++) ell(-0.3 + k * 0.15, -1.05 + (k % 2) * 0.25, 0.06, 0.06, '#e04f8f');
      ctx.fillStyle = '#b5532b';
      ctx.beginPath(); ctx.moveTo(-0.32, -0.55); ctx.lineTo(0.32, -0.55); ctx.lineTo(0.22, 0); ctx.lineTo(-0.22, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8653a'; ctx.fillRect(-0.36, -0.6, 0.72, 0.1);
    } else if (d.kind === 'sac') {
      ctx.fillStyle = '#b08a5a';
      ctx.beginPath(); ctx.moveTo(-0.35, 0); ctx.quadraticCurveTo(-0.45, -0.35, -0.33, -0.55); ctx.lineTo(0.33, -0.55);
      ctx.quadraticCurveTo(0.45, -0.35, 0.35, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9a26b'; ctx.fillRect(-0.38, -0.6, 0.76, 0.1);
      ctx.fillStyle = SPICES[d.c % SPICES.length];
      ctx.beginPath(); ctx.moveTo(-0.33, -0.58); ctx.quadraticCurveTo(0, -0.95, 0.33, -0.58); ctx.closePath(); ctx.fill();
    } else if (d.kind === 'pile') {
      for (let k = 0; k < 4; k++) {
        const rug = RUGS[(d.c + k) % RUGS.length];
        rr(-0.5 + k * 0.03, -0.18 - k * 0.17, 1.0 - k * 0.06, 0.16, 0.03, k % 2 ? rug.bg : rug.bd);
      }
    } else if (d.kind === 'chat') {
      const col = ['#e08a3a', '#7d7d7d', '#3a3a3a', '#e8dcc8', '#e08a3a', '#9a7a5a'][d.c];
      const tail = Math.sin(time * 2 + d.z) * 0.1;
      ctx.strokeStyle = col; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0.18 * -d.side, -0.05); ctx.quadraticCurveTo(0.4 * -d.side, -0.1, (0.35 + tail) * -d.side, -0.35); ctx.stroke();
      ell(0, -0.2, 0.2, 0.22, col);
      ell(0, -0.48, 0.14, 0.13, col);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-0.13, -0.52); ctx.lineTo(-0.1, -0.68); ctx.lineTo(-0.02, -0.58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.13, -0.52); ctx.lineTo(0.1, -0.68); ctx.lineTo(0.02, -0.58); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawGarland(d) {
    const n = 16, pts = [];
    for (let k = 0; k <= n; k++) {
      const x = -WALL_X + (2 * WALL_X * k) / n, t = x / WALL_X;
      const q = P(x, 7.3 - 0.9 * (1 - t * t), d.z);
      if (!q) return;
      pts.push(q);
    }
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = Math.max(1, 0.04 * pts[0].s);
    ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    const cols = d.c === 1 ? ['#ffcf6b', '#ff9f43'] : ['#c0392b', '#2f8f5b', '#e9b824', '#f3e7cf'];
    for (let k = 1; k < n; k++) {
      const q = pts[k], s = q.s;
      ctx.fillStyle = cols[k % cols.length];
      if (d.c === 1) {
        ell(q.x, q.y + 0.25 * s, 0.13 * s, 0.2 * s, ctx.fillStyle);
      } else {
        ctx.beginPath(); ctx.moveTo(q.x - 0.22 * s, q.y); ctx.lineTo(q.x + 0.22 * s, q.y); ctx.lineTo(q.x, q.y + 0.55 * s); ctx.closePath(); ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------- personnages
  function drawShadow(x, gy, z, w) {
    const q = P(x, gy, z);
    if (!q) return;
    ell(q.x, q.y, w * q.s, w * 0.3 * q.s, 'rgba(60,30,10,0.28)');
  }

  function drawRunner() {
    const q = P(p.x, p.y, p.z);
    if (!q) return;
    if (p.ghost > 0 && Math.floor(time * 12) % 2 === 0) return;
    const s = q.s, ph = p.phase;
    const flying = power.tapis > 0;
    const air = !flying && !p.onGround && p.y - p.ground > 0.2;
    let tilt = clamp((LANES[p.lane] - p.x) * 0.12, -0.25, 0.25);
    if (state === 'dying') tilt = -0.25;
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s); ctx.rotate(tilt);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (flying) drawCarpet(0, 0.02);
    if (p.slide > 0 && !flying) { drawRunnerSlide(); ctx.restore(); return; }

    const bob = air || flying ? 0 : -Math.abs(Math.sin(ph)) * 0.06;
    ctx.translate(0, bob + (flying ? -0.12 : 0));
    // jambes
    for (const side of [-1, 1]) {
      const sw = Math.sin(ph) * side;
      const hipX = side * 0.11, hipY = -0.86;
      let kx, ky, fx, fy, lifted;
      if (flying) { kx = side * 0.2; ky = -0.45; fx = side * 0.24; fy = -0.08; lifted = false; }
      else if (air) { kx = side * 0.22; ky = -0.55; fx = side * 0.18; fy = -0.38; lifted = true; }
      else if (sw > 0) { const l = sw; kx = side * 0.15; ky = -0.42 + l * 0.05; fx = side * 0.13; fy = -0.08 - l * 0.45; lifted = l > 0.35; }
      else { kx = side * 0.15; ky = -0.45; fx = side * 0.14; fy = 0; lifted = false; }
      ctx.strokeStyle = '#2c4a7c'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ell(fx, fy - 0.02, 0.11, lifted ? 0.1 : 0.07, '#f4f1ea');
      if (lifted) ell(fx, fy, 0.09, 0.06, '#c0392b');
    }
    // bras
    for (const side of [-1, 1]) {
      const a = Math.sin(ph) * side;
      const sx = side * 0.27, sy = -1.36;
      let ex, ey, hx, hy;
      if (air || state === 'dying') { ex = side * 0.48; ey = -1.5; hx = side * 0.55; hy = -1.78; }
      else if (flying) { ex = side * 0.42; ey = -1.15; hx = side * 0.36; hy = -0.95; }
      else { ex = side * 0.4; ey = -1.12 + a * 0.06; hx = side * (0.36 - Math.max(0, a) * 0.08); hy = -0.92 - Math.max(0, a) * 0.22; }
      ctx.strokeStyle = '#1f7a4d'; ctx.lineWidth = 0.15;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#c98b5b'; ctx.lineWidth = 0.11;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    }
    // torse (maillot vert, numéro 10)
    rr(-0.28, -1.47, 0.56, 0.68, 0.12, '#1f7a4d');
    ctx.fillStyle = '#c1272d'; ctx.fillRect(-0.28, -0.86, 0.56, 0.07);
    textU('10', 0, -1.12, 0.26, '#f3ead6');
    // cou et tête
    ctx.fillStyle = '#b97a4c'; ctx.fillRect(-0.06, -1.55, 0.12, 0.1);
    ell(-0.17, -1.62, 0.045, 0.06, '#c98b5b'); ell(0.17, -1.62, 0.045, 0.06, '#c98b5b');
    ell(0, -1.63, 0.17, 0.17, '#2a1a12');
    // tarbouche
    ctx.fillStyle = '#b3202a';
    ctx.beginPath(); ctx.moveTo(-0.15, -1.72); ctx.lineTo(0.15, -1.72); ctx.lineTo(0.12, -1.94); ctx.lineTo(-0.12, -1.94); ctx.closePath(); ctx.fill();
    ell(0, -1.94, 0.12, 0.03, '#8e1820');
    const ta = Math.sin(ph * 0.5) * 0.5 + (p.vy > 0 ? 0.6 : 0);
    const tex = Math.sin(ta) * 0.16, tey = -1.94 + Math.cos(ta) * 0.16;
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(0, -1.95); ctx.lineTo(tex, tey); ctx.stroke();
    ell(tex, tey, 0.03, 0.04, '#111');
    ctx.restore();
  }
  function drawRunnerSlide() {
    ell(-0.16, -0.14, 0.15, 0.13, '#2c4a7c'); ell(0.16, -0.14, 0.15, 0.13, '#2c4a7c');
    ell(-0.2, -0.04, 0.11, 0.07, '#f4f1ea'); ell(0.2, -0.04, 0.11, 0.07, '#f4f1ea');
    ell(0, -0.42, 0.3, 0.27, '#1f7a4d');
    ell(-0.3, -0.35, 0.07, 0.07, '#c98b5b'); ell(0.3, -0.35, 0.07, 0.07, '#c98b5b');
    ell(0, -0.7, 0.16, 0.15, '#2a1a12');
    ctx.save(); ctx.translate(0, -0.78); ctx.rotate(0.35);
    ctx.fillStyle = '#b3202a';
    ctx.beginPath(); ctx.moveTo(-0.14, 0); ctx.lineTo(0.14, 0); ctx.lineTo(0.11, -0.2); ctx.lineTo(-0.11, -0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawCarpet(x, y) {
    const wv = Math.sin(time * 6) * 0.04;
    ctx.fillStyle = '#1f3b6e';
    ctx.beginPath(); ctx.moveTo(x - 0.7, y - 0.05 + wv); ctx.lineTo(x + 0.7, y - 0.05 - wv); ctx.lineTo(x + 0.75, y + 0.12 - wv); ctx.lineTo(x - 0.75, y + 0.12 + wv); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a8262b';
    ctx.beginPath(); ctx.moveTo(x - 0.6, y - 0.02 + wv); ctx.lineTo(x + 0.6, y - 0.02 - wv); ctx.lineTo(x + 0.63, y + 0.08 - wv); ctx.lineTo(x - 0.63, y + 0.08 + wv); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let k = -7; k <= 7; k++) { ctx.moveTo(x + k * 0.1, y + 0.12); ctx.lineTo(x + k * 0.1, y + 0.2 + Math.sin(time * 9 + k) * 0.03); }
    ctx.stroke();
  }

  function drawMonkey() {
    const mz = p.z - monkey.dist;
    const q = P(monkey.x, monkey.y, mz);
    if (!q || mz - cam.z < 1.0) return;
    const s = q.s, ph = monkey.phase;
    const grab = state === 'dying' && dyingT > 0.5;
    const fur = '#9b7651', dark = '#76583a', skin = '#e0a08a';
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s);
    ctx.lineCap = 'round';
    const g = Math.sin(ph), bob = grab ? 0 : -Math.abs(g) * 0.12;
    // pattes arrière
    for (const side of [-1, 1]) {
      const l = Math.max(0, g * side);
      ctx.strokeStyle = fur; ctx.lineWidth = 0.13;
      ctx.beginPath(); ctx.moveTo(side * 0.15, -0.4 + bob); ctx.lineTo(side * 0.22, -0.2 + bob); ctx.lineTo(side * 0.18, -l * 0.3); ctx.stroke();
      ell(side * 0.18, -l * 0.3, 0.07, 0.05, dark);
    }
    // corps
    ell(0, -0.55 + bob, 0.3, 0.34, fur);
    ell(0, -0.6 + bob, 0.12, 0.24, dark);
    // bras
    for (const side of [-1, 1]) {
      let hx, hy;
      if (grab) { hx = side * 0.32; hy = -1.25 + Math.sin(time * 20 + side) * 0.05; }
      else if (state === 'dying' || monkey.danger > 0) { hx = side * 0.42; hy = -1.15 + Math.sin(ph + side) * 0.18 + bob; }
      else { hx = side * 0.36; hy = -0.85 + g * side * 0.15 + bob; }
      ctx.strokeStyle = fur; ctx.lineWidth = 0.11;
      ctx.beginPath(); ctx.moveTo(side * 0.22, -0.74 + bob); ctx.lineTo(side * 0.36, -0.82 + bob); ctx.lineTo(hx, hy); ctx.stroke();
      ell(hx, hy, 0.06, 0.06, skin);
    }
    // tête
    ell(0, -0.98 + bob, 0.2, 0.19, fur);
    ell(-0.18, -1.0 + bob, 0.06, 0.07, skin); ell(0.18, -1.0 + bob, 0.06, 0.07, skin);
    ell(0, -1.12 + bob, 0.1, 0.05, dark);
    ctx.restore();
  }

  function drawParticles() {
    for (const q0 of particles) {
      const q = P(q0.x, q0.y, q0.z);
      if (!q) continue;
      ctx.globalAlpha = clamp(q0.life / 0.4, 0, 1);
      const r = q0.size * q.s;
      ctx.fillStyle = q0.col; ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
    drawSky();
    drawGround();
    drawPalms();
    drawWalls();

    // tri des objets du plus loin au plus proche
    const items = [];
    const pz = p.z;
    for (const o of obstacles) {
      if (o.z0 - cam.z > FAR) continue;
      const key = o.z1 < pz ? o.z1 : Math.max(o.z0, pz + 0.01);
      items.push([key, o.type === 'stand' ? 1 : o.type === 'rampe' ? 2 : o.type === 'bas' ? 3 : 4, o]);
    }
    for (const c of coins) if (c.z - cam.z < FAR * 0.7) items.push([c.z, 5, c]);
    for (const u of powerups) if (u.z - cam.z < FAR) items.push([u.z, 6, u]);
    for (const d of decor) if (d.z - cam.z < FAR * 0.8) items.push([d.z, 7, d]);
    items.push([pz, 8, null]);
    items.push([pz - monkey.dist, 9, null]);
    items.sort((a, b) => b[0] - a[0]);

    for (const it of items) {
      const o = it[2];
      ctx.globalAlpha = o && it[1] !== 7 ? fade(it[0]) : 1;
      switch (it[1]) {
        case 1: drawStand(o); break;
        case 2: drawRamp(o); break;
        case 3: drawLow(o); break;
        case 4: drawHigh(o); break;
        case 5: drawCoin(o); break;
        case 6: drawPowerup(o); break;
        case 7: ctx.globalAlpha = fade(o.z); drawDecor(o); break;
        case 8:
          ctx.globalAlpha = 1;
          drawShadow(p.x, p.ground, p.z, 0.45);
          drawRunner();
          break;
        case 9:
          ctx.globalAlpha = 1;
          if (monkey.dist < CAM_BACK - 1) { drawShadow(monkey.x, groundAt(monkey.x, p.z - monkey.dist, 99), p.z - monkey.dist, 0.4); drawMonkey(); }
          break;
      }
    }
    ctx.globalAlpha = 1;
    drawParticles();
    ctx.restore();

    // vignette quand le singe est tout près
    if (state === 'play' && monkey.danger > 0) {
      const a = 0.25 + Math.sin(time * 10) * 0.08;
      const g = ctx.createRadialGradient(CX, H / 2, Math.min(W, H) * 0.35, CX, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(176,32,42,0)'); g.addColorStop(1, `rgba(176,32,42,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- interface
  const ui = {
    hud: $('hud'), menu: $('menu'), pause: $('pause'), fin: $('fin'),
    pieces: $('h-pieces'), score: $('h-score'), mult: $('h-mult'), pouvoirs: $('h-pouvoirs'),
    singe: $('h-singe'), toast: $('h-toast')
  };
  let last = { score: -1, pieces: -1, pw: '' };
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
    ui.mult.hidden = !(power.x2 > 0);
    ui.singe.hidden = !(state === 'play' && monkey.danger > 0);
    let html = '';
    for (const k of ['aimant', 'babouches', 'tapis']) {
      if (power[k] > 0) html += `<div class="pouvoir"><span>${NOMS[k]}</span><span class="barre"><i style="width:${(power[k] / DUREES[k]) * 100}%"></i></span></div>`;
    }
    if (html !== last.pw) { ui.pouvoirs.innerHTML = html; last.pw = html; }
  }
  function refreshMenu() {
    $('m-record').textContent = best;
    $('m-pieces').textContent = bank;
    $('b-son').textContent = Sound.on ? '🔊 Son activé' : '🔇 Son coupé';
  }
  function show(el) { for (const e of [ui.menu, ui.pause, ui.fin]) e.hidden = e !== el; }

  function startGame() {
    Sound.init();
    resetWorld(true);
    state = 'play';
    show(null);
    ui.hud.hidden = false;
    last = { score: -1, pieces: -1, pw: '' };
    Sound.startMusic();
    toast('Fuis le singe !');
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
    resetWorld(false);
    refreshMenu();
    show(ui.menu);
  }
  function gameOver() {
    state = 'over';
    const sc = Math.floor(score);
    const rec = sc > best;
    if (rec) { best = sc; store.set('record', best); }
    bank += coinsRun; store.set('pieces', bank);
    $('f-score').textContent = sc;
    $('f-pieces').textContent = coinsRun;
    $('f-meilleur').textContent = best;
    $('f-record').hidden = !rec;
    ui.hud.hidden = true;
    show(ui.fin);
  }

  $('b-jouer').addEventListener('click', startGame);
  $('b-rejouer').addEventListener('click', startGame);
  $('b-menu').addEventListener('click', toMenu);
  $('b-quitter').addEventListener('click', toMenu);
  $('b-reprendre').addEventListener('click', resumeGame);
  $('b-pause').addEventListener('click', pauseGame);
  $('b-son').addEventListener('click', () => { Sound.init(); Sound.setOn(!Sound.on); refreshMenu(); });

  // ---------------------------------------------------------------- contrôles
  let swipe = null;
  canvas.addEventListener('pointerdown', e => {
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, used: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (!swipe || swipe.used || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    const th = Math.max(22, Math.min(W, H) * 0.05);
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    swipe.used = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'droite' : 'gauche');
    else act(dy > 0 ? 'bas' : 'haut');
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
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - prev) / 1000));
    prev = now;
    update(dt);
    render();
    if (state === 'play' || state === 'dying') updateHud();
    requestAnimationFrame(frame);
  }

  resetWorld(false);
  refreshMenu();
  requestAnimationFrame(frame);

  // Application installable (PWA) quand le jeu est servi en HTTPS hors de l'appli Android.
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Petit accès pour les tests automatisés.
  window.BEHJA = {
    get state() { return state; }, get score() { return score; }, get coins() { return coinsRun; },
    get player() { return p; }, get obstacles() { return obstacles; }, act, startGame, power,
    step(dt) { update(dt); }, setInvincible(v) { p.ghost = v ? 1e9 : 0; }
  };
})();
