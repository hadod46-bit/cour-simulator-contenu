// Textures dessinées par programme (canvas → texture WebGL). Aucune image externe.
import * as THREE from '../lib/three.module.min.js';
import { hash, clamp } from './util.js';

const cache = new Map();
let aniso = 4;
export function setAnisotropy(a) { aniso = a; }

export const PAL = {
  awnings: [
    ['#c8322b', '#f3e7cf'], ['#2f8f5b', '#f3e7cf'], ['#2b62a8', '#f7f1e3'],
    ['#e2892a', '#fbeed3'], ['#8e3b8a', '#f3e7cf'], ['#d4a017', '#7a2e1d']
  ],
  rugs: [
    { bg: '#a8262b', bd: '#1f3b6e', md: '#e9c46a' },
    { bg: '#1f4e79', bd: '#c0392b', md: '#f1e4c3' },
    { bg: '#7b3f1d', bd: '#e9c46a', md: '#2a9d8f' },
    { bg: '#2d6a4f', bd: '#f4a261', md: '#e9d8a6' }
  ],
  spices: ['#c0392b', '#e6a817', '#d35400', '#8e44ad', '#6b8e23', '#a0522d'],
  bright: ['#c0392b', '#e9b824', '#2b62a8', '#2f8f5b', '#8e3b8a', '#e2892a', '#f3e7cf'],
  walls: ['#c45f3d', '#c96a44', '#bd5a3a', '#cc6d47'],
  doors: ['#1f5e99', '#2e7d5b', '#a33b2b', '#2a7f8f'],
  zellige: ['#1d6f8a', '#f3ead6', '#2f8f5b', '#f3ead6']
};

function make(key, w, h, draw, repeat) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  cache.set(key, t);
  return t;
}

// Variation de teinte d'une couleur hex (f > 1 éclaircit).
function tint(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const gg = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${gg},${b})`;
}
function speckle(g, w, h, n, alpha, seed) {
  for (let i = 0; i < n; i++) {
    const v = hash(seed + i * 1.37);
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(60,20,0,${alpha})`;
    const s = 1 + hash(seed + i * 2.11) * 2.5;
    g.fillRect(hash(seed + i * 3.7) * w, hash(seed + i * 5.3) * h, s, s);
  }
}
function ell(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
function rr(g, x, y, w, h, r, col) { g.fillStyle = col; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); }

// ------------------------------------------------------------------ sol
export const ROAD_W = 8.8, ROAD_L = 4.4;
export function roadTexture() {
  return make('road', 1024, 512, (g, w, h) => {
    g.fillStyle = '#d29a62'; g.fillRect(0, 0, w, h);
    const rows = 4, rh = h / rows, bw = w / 12;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < 13; c++) {
        const x = c * bw + off, y = r * rh, k = hash(r * 31 + c * 7.7);
        const base = ['#d9a56d', '#d39c63', '#dcab74', '#cf965c'][Math.floor(k * 4)];
        const gr = g.createLinearGradient(x, y, x + bw, y + rh);
        gr.addColorStop(0, tint(base, 1.07)); gr.addColorStop(1, tint(base, 0.92));
        rr(g, x + 3, y + 3, bw - 6, rh - 6, 10, gr);
      }
    }
    speckle(g, w, h, 1600, 0.12, 3);
    // séparateurs de voies en zellige
    for (const fx of [(4.4 - 1.3) / 8.8, (4.4 + 1.3) / 8.8]) {
      const cx = fx * w, tw = 22;
      g.fillStyle = '#8f5532'; g.fillRect(cx - tw / 2 - 3, 0, tw + 6, h);
      for (let k = 0; k < h / 32; k++) {
        g.fillStyle = PAL.zellige[k % 4];
        g.fillRect(cx - tw / 2, k * 32 + 2, tw, 28);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - tw / 2, k * 32 + 2, tw, 4);
      }
    }
    // bordures
    const curb = g.createLinearGradient(0, 0, 30, 0);
    curb.addColorStop(0, '#7e4527'); curb.addColorStop(1, 'rgba(126,69,39,0)');
    g.fillStyle = curb; g.fillRect(0, 0, 30, h);
    const curb2 = g.createLinearGradient(w, 0, w - 30, 0);
    curb2.addColorStop(0, '#7e4527'); curb2.addColorStop(1, 'rgba(126,69,39,0)');
    g.fillStyle = curb2; g.fillRect(w - 30, 0, 30, h);
  }, true);
}
export function sidewalkTexture() {
  return make('sidewalk', 256, 256, (g, w, h) => {
    g.fillStyle = '#9c5534'; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = hash(r * 13 + c * 3.1);
      const base = ['#b9693f', '#b3623a', '#c07246', '#ad5f38'][Math.floor(k * 4)];
      const gr = g.createLinearGradient(c * s, r * s, c * s + s, r * s + s);
      gr.addColorStop(0, tint(base, 1.08)); gr.addColorStop(1, tint(base, 0.9));
      rr(g, c * s + 2, r * s + 2, s - 4, s - 4, 4, gr);
    }
    speckle(g, w, h, 500, 0.1, 9);
  }, true);
}

// ------------------------------------------------------------------ murs de la médina (6 m × 8 m)
const WU = 512 / 6;
function archPath(g, zc, hw, yb, ys) {
  const a = 0.35, r = hw / Math.cos(a);
  const X = z => z * WU, Y = y => (8 - y) * WU;
  g.beginPath();
  g.moveTo(X(zc - hw), Y(yb));
  for (let k = 0; k <= 16; k++) {
    const th = Math.PI + a - (k / 16) * (Math.PI + 2 * a);
    g.lineTo(X(zc + r * Math.cos(th)), Y(ys + r * Math.sin(th)));
  }
  g.lineTo(X(zc + hw), Y(yb));
  g.closePath();
}
function wrect(g, z0, y0, z1, y1, col) {
  g.fillStyle = col;
  g.fillRect(z0 * WU, (8 - y1) * WU, (z1 - z0) * WU, (y1 - y0) * WU);
}
export const WALL_VARIANTS = 6;
export function wallTexture(variant, colorIdx) {
  return make(`wall${variant}_${colorIdx}`, 512, 683, (g, w, h) => {
    const base = PAL.walls[colorIdx % PAL.walls.length];
    const seed = variant * 17 + colorIdx * 5;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, tint(base, 1.06)); gr.addColorStop(0.75, base); gr.addColorStop(1, tint(base, 0.82));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // enduit irrégulier
    for (let i = 0; i < 18; i++) {
      g.fillStyle = hash(seed + i) > 0.5 ? 'rgba(255,230,200,0.07)' : 'rgba(80,20,0,0.07)';
      g.beginPath();
      g.ellipse(hash(seed + i * 2.3) * w, hash(seed + i * 4.1) * h, 20 + hash(seed + i * 7.7) * 70, 12 + hash(seed + i * 3.3) * 40, 0, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, w, h, 2200, 0.08, seed);
    wrect(g, 0, 7.6, 6, 8, tint(base, 0.88));
    wrect(g, 0, 0, 6, 0.55, tint(base, 0.7));
    const zc = 3;
    if (variant === 0 || variant === 1) {
      // porte en arc outrepassé
      g.fillStyle = '#efe3c8'; archPath(g, zc, 1.0, 0, 2.45); g.fill();
      g.fillStyle = PAL.doors[(variant + colorIdx) % PAL.doors.length]; archPath(g, zc, 0.8, 0, 2.45); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect((zc - 0.03) * WU, (8 - 2.9) * WU, 0.06 * WU, 2.9 * WU);
      g.fillStyle = '#d8b25a';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ell(g, (zc - 0.45 + j * 0.9) * WU, (8 - 0.6 - i * 0.55) * WU, 3, 3, '#d8b25a');
      ell(g, (zc + 0.22) * WU, (8 - 1.3) * WU, 6, 6, '#d8b25a');
      wrect(g, zc - 1.25, 3.75, zc + 1.25, 3.95, '#efe3c8');
      // carreaux de zellige autour de la porte
      for (let k = 0; k < 10; k++) wrect(g, zc - 1.25 + k * 0.25, 3.55, zc - 1.25 + k * 0.25 + 0.23, 3.73, PAL.zellige[k % 4]);
      if (variant === 1) {
        // fenêtre à moucharabieh
        wrect(g, zc - 0.6, 5.0, zc + 0.6, 6.4, '#efe3c8');
        wrect(g, zc - 0.48, 5.12, zc + 0.48, 6.28, '#5a3a22');
        g.strokeStyle = '#8a6040'; g.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          g.beginPath(); g.moveTo((zc - 0.48 + k * 0.19) * WU, (8 - 5.12) * WU); g.lineTo((zc - 0.48 + k * 0.19) * WU, (8 - 6.28) * WU); g.stroke();
          g.beginPath(); g.moveTo((zc - 0.48) * WU, (8 - 5.12 - k * 0.22) * WU); g.lineTo((zc + 0.48) * WU, (8 - 5.12 - k * 0.22) * WU); g.stroke();
        }
      }
    } else if (variant === 2) {
      // échoppe ouverte, tapis accrochés au mur
      g.fillStyle = '#e9d6b0'; archPath(g, zc, 1.45, 0, 2.5); g.fill();
      g.fillStyle = '#3a2418'; archPath(g, zc, 1.3, 0, 2.5); g.fill();
      for (let k = 0; k < 4; k++) {
        const rz = zc - 0.9 + k * 0.6;
        wrect(g, rz - 0.22, 0.3, rz + 0.22, 1.5, PAL.bright[(k + colorIdx) % PAL.bright.length]);
        ell(g, rz * WU, (8 - 2.6) * WU, 9, 13, '#ffcf6b');
      }
      for (const dz of [-2.35, 2.35]) {
        const rug = PAL.rugs[(colorIdx + (dz > 0 ? 1 : 0)) % PAL.rugs.length];
        wrect(g, zc + dz - 0.5, 2.0, zc + dz + 0.5, 4.6, rug.bd);
        wrect(g, zc + dz - 0.38, 2.12, zc + dz + 0.38, 4.48, rug.bg);
        g.fillStyle = rug.md; g.beginPath();
        g.moveTo((zc + dz) * WU, (8 - 2.6) * WU); g.lineTo((zc + dz + 0.28) * WU, (8 - 3.3) * WU);
        g.lineTo((zc + dz) * WU, (8 - 4.0) * WU); g.lineTo((zc + dz - 0.28) * WU, (8 - 3.3) * WU); g.closePath(); g.fill();
      }
    } else if (variant === 3) {
      // fenêtres et bougainvilliers en cascade
      for (const dz of [-1.4, 1.4]) {
        wrect(g, zc + dz - 0.55, 4.0, zc + dz + 0.55, 5.6, '#efe3c8');
        wrect(g, zc + dz - 0.42, 4.12, zc + dz + 0.42, 5.48, '#2e5f7a');
        wrect(g, zc + dz - 0.42, 4.75, zc + dz + 0.42, 4.85, '#efe3c8');
        wrect(g, zc + dz - 0.03, 4.12, zc + dz + 0.03, 5.48, '#efe3c8');
      }
      for (let k = 0; k < 70; k++) {
        const bz = hash(seed + k * 3.3) * 6, by = 8 - Math.pow(hash(seed + k * 1.9), 1.6) * 3.2;
        ell(g, bz * WU, (8 - by) * WU, 10 + hash(k) * 12, 9 + hash(k * 2) * 10, k % 4 ? '#c2185b' : (k % 3 ? '#e04f8f' : '#3f7d3a'));
      }
    } else if (variant === 4) {
      // fontaine en zellige
      g.fillStyle = '#efe3c8'; archPath(g, zc, 1.2, 0.4, 2.4); g.fill();
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const tz = zc - 1.0 + c * 0.4, ty = 0.55 + r * 0.4;
        wrect(g, tz, ty, tz + 0.38, ty + 0.38, ['#1d6f8a', '#f3ead6', '#2f8f5b', '#e9b824'][(r + c) % 4]);
      }
      wrect(g, zc - 1.3, 0, zc + 1.3, 0.6, '#5c8f9c');
      wrect(g, zc - 1.3, 0.5, zc + 1.3, 0.6, '#cfe6ea');
    } else {
      // mur nu avec petites fenêtres
      wrect(g, zc - 1.6, 4.6, zc - 0.9, 5.5, '#5a3a22');
      wrect(g, zc + 0.9, 4.6, zc + 1.6, 5.5, '#5a3a22');
      wrect(g, zc - 1.7, 4.5, zc - 0.8, 4.6, '#efe3c8');
      wrect(g, zc + 0.8, 4.5, zc + 1.7, 4.6, '#efe3c8');
    }
  });
}

// ------------------------------------------------------------------ stands
export function awningTexture(i) {
  return make('awning' + i, 256, 256, (g, w, h) => {
    const [a, b] = PAL.awnings[i];
    const n = 6, sw = w / n;
    for (let k = 0; k < n; k++) {
      const gr = g.createLinearGradient(k * sw, 0, k * sw + sw, 0);
      const c = k % 2 ? b : a;
      gr.addColorStop(0, tint(c, 0.92)); gr.addColorStop(0.5, tint(c, 1.05)); gr.addColorStop(1, tint(c, 0.9));
      g.fillStyle = gr; g.fillRect(k * sw, 0, sw + 1, h);
    }
    for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, w, 1); }
  }, true);
}
export function valanceTexture(i) {
  return make('valance' + i, 256, 64, (g, w, h) => {
    const [a, b] = PAL.awnings[i];
    const n = 6, sw = w / n;
    for (let k = 0; k < n; k++) {
      g.fillStyle = k % 2 ? b : a;
      g.fillRect(k * sw, 0, sw + 1, h * 0.55);
      g.beginPath(); g.arc(k * sw + sw / 2, h * 0.55, sw / 2, 0, Math.PI); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 4, w, 4);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, w, 3);
  }, true);
}
export function woodTexture() {
  return make('wood', 256, 256, (g, w, h) => {
    const n = 5, ph = h / n;
    for (let k = 0; k < n; k++) {
      const base = ['#9a6a3c', '#8b5a2b', '#a06f40', '#93633a', '#8f5f33'][k];
      g.fillStyle = base; g.fillRect(0, k * ph, w, ph);
      g.strokeStyle = 'rgba(70,40,15,0.25)'; g.lineWidth = 1;
      for (let j = 0; j < 6; j++) {
        g.beginPath();
        const y = k * ph + 6 + j * (ph - 10) / 6;
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + k * 3 + j) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,20,5,0.55)'; g.fillRect(0, k * ph, w, 3);
      g.fillStyle = 'rgba(255,220,170,0.15)'; g.fillRect(0, k * ph + 3, w, 2);
    }
  }, true);
}
export function crateTexture() {
  return make('crate', 256, 256, (g, w, h) => {
    g.fillStyle = '#b07a45'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8b5a2b';
    for (const y of [0, 80, 168, 240]) g.fillRect(0, y, w, 16);
    g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
    g.strokeStyle = 'rgba(70,40,15,0.3)';
    for (let y = 20; y < h; y += 9) { g.beginPath(); g.moveTo(18, y); g.lineTo(w - 18, y + 3); g.stroke(); }
  });
}

// Façade et flancs des stands, dessinés en « unités » de 1 m.
function standGoods(g, v, seed, w, top, bottom) {
  const hs = k => hash(seed + k * 13.7);
  if (v === 'lanternes') {
    for (let k = 0; k < Math.round(w / 0.5); k++) {
      const lx = 0.3 + k * 0.5, ly = top + 0.25 + (k % 2) * 0.25;
      const gl = g.createRadialGradient(lx, ly + 0.15, 0, lx, ly + 0.15, 0.4);
      gl.addColorStop(0, 'rgba(255,210,110,0.75)'); gl.addColorStop(1, 'rgba(255,210,110,0)');
      g.fillStyle = gl; g.fillRect(lx - 0.4, ly - 0.25, 0.8, 0.8);
      g.strokeStyle = '#8a6a2a'; g.lineWidth = 0.02;
      g.beginPath(); g.moveTo(lx, top); g.lineTo(lx, ly); g.stroke();
      g.fillStyle = k % 2 ? '#ffcf6b' : '#ff9f43';
      g.beginPath(); g.moveTo(lx - 0.1, ly + 0.05); g.lineTo(lx + 0.1, ly + 0.05); g.lineTo(lx + 0.08, ly + 0.3);
      g.lineTo(lx, ly + 0.38); g.lineTo(lx - 0.08, ly + 0.3); g.closePath(); g.fill();
      g.fillStyle = '#b8892b';
      g.beginPath(); g.moveTo(lx - 0.12, ly + 0.06); g.lineTo(lx, ly - 0.06); g.lineTo(lx + 0.12, ly + 0.06); g.closePath(); g.fill();
    }
  } else if (v === 'tapis') {
    const n = Math.round(w / 0.68);
    for (let k = 0; k < n; k++) {
      const rug = PAL.rugs[Math.floor(hs(k) * PAL.rugs.length)], rx = 0.06 + k * 0.68;
      g.fillStyle = rug.bd; g.fillRect(rx, top + 0.05, 0.6, bottom - top - 0.1);
      g.fillStyle = rug.bg; g.fillRect(rx + 0.07, top + 0.12, 0.46, bottom - top - 0.24);
      g.fillStyle = rug.md; const my = (top + bottom) / 2;
      g.beginPath(); g.moveTo(rx + 0.3, my - 0.3); g.lineTo(rx + 0.48, my); g.lineTo(rx + 0.3, my + 0.3); g.lineTo(rx + 0.12, my); g.closePath(); g.fill();
    }
  } else if (v === 'babouches') {
    for (let r = 0; r < 2; r++) for (let c = 0; c < Math.round(w / 0.42); c++) {
      const bx = 0.22 + c * 0.42, by = top + 0.12 + r * 0.45;
      g.fillStyle = PAL.bright[Math.floor(hs(r * 9 + c) * PAL.bright.length)];
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + 0.14, by + 0.15, bx, by + 0.36);
      g.quadraticCurveTo(bx - 0.14, by + 0.15, bx, by); g.fill();
    }
  } else if (v === 'poteries') {
    for (let k = 0; k < Math.round(w / 0.52); k++) {
      const px = 0.3 + k * 0.52, py = top + 0.3 + (k % 2) * 0.32;
      ell(g, px, py, 0.2, 0.2, PAL.bright[Math.floor(hs(k) * 4)]);
      ell(g, px, py, 0.13, 0.13, '#f3e7cf');
      ell(g, px, py, 0.06, 0.06, '#1d6f8a');
    }
  } else if (v === 'epices') {
    for (let k = 0; k < Math.round(w / 0.5); k++) {
      const sx = 0.3 + k * 0.5;
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.02;
      g.beginPath(); g.moveTo(sx, top); g.lineTo(sx, top + 0.15); g.stroke();
      for (let j = 0; j < 5; j++) ell(g, sx + (j % 2 ? 0.05 : -0.05), top + 0.18 + j * 0.1, 0.05, 0.07, k % 2 ? '#c0392b' : '#e8d9b0');
    }
  } else if (v === 'oranges') {
    rr(g, w / 2 - 0.65, top + 0.1, 1.3, 0.45, 0.06, '#f3e7cf');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, top + 0.27); g.scale(0.01, 0.01);
    g.font = 'bold 22px "Noto Naskh Arabic", serif'; g.fillStyle = '#c0392b'; g.fillText('عصير', 0, 0);
    g.restore();
    g.save(); g.translate(w / 2, top + 0.46); g.scale(0.01, 0.01);
    g.font = 'bold 10px sans-serif'; g.fillStyle = '#2f8f5b'; g.fillText("JUS D'ORANGE", 0, 0);
    g.restore();
  }
}
function counter(g, w, cy, h, seed, v) {
  const hs = k => hash(seed + k * 13.7);
  // marchandises posées sur le comptoir
  if (v === 'epices') {
    for (let k = 0; k < Math.round(w / 0.4); k++) {
      const sx = 0.25 + k * 0.4;
      g.fillStyle = PAL.spices[Math.floor(hs(k + 9) * PAL.spices.length)];
      g.beginPath(); g.moveTo(sx - 0.17, cy); g.quadraticCurveTo(sx, cy - 0.6, sx + 0.17, cy); g.fill();
      ell(g, sx, cy, 0.19, 0.05, '#c9a26b');
    }
  } else if (v === 'oranges') {
    for (let r = 0; r < 4; r++) {
      const n = Math.floor(w / 0.18) - r * 2;
      for (let k = 0; k < n; k++) ell(g, 0.12 + (r + k) * 0.18, cy - 0.08 - r * 0.13, 0.085, 0.085, (k + r) % 3 ? '#f39c12' : '#e67e22');
    }
  } else if (v === 'lanternes') {
    for (let k = 0; k < Math.round(w / 0.65); k++) {
      const lx = 0.4 + k * 0.65;
      g.fillStyle = '#c9a23a'; g.fillRect(lx - 0.1, cy - 0.32, 0.2, 0.32);
      g.fillStyle = '#ffe3a0'; g.fillRect(lx - 0.06, cy - 0.28, 0.12, 0.22);
    }
  } else if (v === 'tapis') {
    for (let k = 0; k < 3; k++) {
      const col = PAL.rugs[Math.floor(hs(k + 4) * PAL.rugs.length)];
      rr(g, 0.1, cy - 0.14 - k * 0.13, w - 0.2 - k * 0.2, 0.12, 0.04, k % 2 ? col.bg : col.bd);
    }
  } else if (v === 'babouches') {
    for (let k = 0; k < Math.round(w / 0.32); k++) {
      const bx = 0.2 + k * 0.32;
      g.fillStyle = PAL.bright[Math.floor(hs(k + 20) * PAL.bright.length)];
      g.beginPath(); g.moveTo(bx - 0.13, cy); g.quadraticCurveTo(bx - 0.1, cy - 0.16, bx + 0.15, cy - 0.04);
      g.lineTo(bx + 0.15, cy); g.closePath(); g.fill();
    }
  } else if (v === 'poteries') {
    for (let k = 0; k < Math.round(w / 0.68); k++) {
      const tx = 0.38 + k * 0.68, col = ['#1d6f8a', '#2f8f5b', '#c0602b'][k % 3];
      g.fillStyle = tint(col, 0.8); g.fillRect(tx - 0.3, cy - 0.06, 0.6, 0.06);
      g.fillStyle = col;
      g.beginPath(); g.moveTo(tx - 0.26, cy - 0.06); g.quadraticCurveTo(tx - 0.05, cy - 0.12, tx, cy - 0.5);
      g.quadraticCurveTo(tx + 0.05, cy - 0.12, tx + 0.26, cy - 0.06); g.closePath(); g.fill();
    }
  }
  // comptoir en bois et frise de zellige
  g.fillStyle = '#8b5a2b'; g.fillRect(0, cy, w, h - cy);
  g.fillStyle = '#a8743f'; g.fillRect(0, cy - 0.02, w, 0.09);
  g.fillStyle = '#6f4521';
  for (let y = cy + 0.4; y < h; y += 0.3) g.fillRect(0, y, w, 0.025);
  for (let k = 0; k < Math.ceil(w / 0.19); k++) { g.fillStyle = PAL.zellige[k % 4]; g.fillRect(0.02 + k * 0.19, cy + 0.15, 0.17, 0.17); }
  const sh = g.createLinearGradient(0, cy, 0, h);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = sh; g.fillRect(0, cy, w, h - cy);
}
// Façade avant (2,1 m × 2,3 m).
export function standFrontTexture(v, seed) {
  return make(`front_${v}_${seed}`, 512, 560, (g, W, H) => {
    const w = 2.1, h = 2.3, u = W / w;
    g.save(); g.scale(u, H / h);
    g.fillStyle = '#2e1a10'; g.fillRect(0, 0, w, h);
    standGoods(g, v, seed, w, 0.05, 1.15);
    const sh = g.createLinearGradient(0, 0, 0, 0.7);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, 0.7);
    counter(g, w, 1.2, h, seed, v);
    g.fillStyle = '#6b4423'; g.fillRect(0, 0, 0.09, h); g.fillRect(w - 0.09, 0, 0.09, h);
    g.restore();
  });
}
// Flanc (3 m répétés × 2,3 m).
export function standSideTexture(v, seed) {
  return make(`side_${v}_${seed}`, 512, 392, (g, W, H) => {
    const w = 3, h = 2.3;
    g.save(); g.scale(W / w, H / h);
    g.fillStyle = '#2e1a10'; g.fillRect(0, 0, w, h);
    standGoods(g, v, seed + 3, w, 0.05, 1.15);
    const sh = g.createLinearGradient(0, 0, 0, 0.7);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, 0.7);
    counter(g, w, 1.2, h, seed + 3, v);
    g.fillStyle = '#6b4423'; g.fillRect(0, 0, 0.08, h); g.fillRect(w - 0.08, 0, 0.08, h);
    g.restore();
  }, true);
}
export function cartSideTexture() {
  return make('cartside', 512, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a4f2a';
    for (let y = 0; y < h; y += 42) g.fillRect(0, y, w, 6);
    g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    for (let k = 0; k < 16; k++) ell(g, 20 + k * 31, 22, 18, 18, k % 3 ? '#f39c12' : '#e67e22');
  }, true);
}

// ------------------------------------------------------------------ tapis
export function rugTexture(i) {
  return make('rug' + i, 256, 384, (g, w, h) => {
    const r = PAL.rugs[i % PAL.rugs.length];
    const fr = 18;
    g.clearRect(0, 0, w, h);
    g.fillStyle = r.bd; g.fillRect(0, fr, w, h - 2 * fr);
    g.fillStyle = r.bg; g.fillRect(22, fr + 22, w - 44, h - 2 * fr - 44);
    g.strokeStyle = r.md; g.lineWidth = 4; g.strokeRect(32, fr + 32, w - 64, h - 2 * fr - 64);
    // frise de losanges sur la bordure
    g.fillStyle = r.md;
    for (let y = fr + 12; y < h - fr; y += 24) for (const x of [11, w - 11]) {
      g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.fill();
    }
    const cx = w / 2, cy = h / 2;
    g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx + 80, cy); g.lineTo(cx, cy + 110); g.lineTo(cx - 80, cy); g.closePath(); g.fill();
    g.fillStyle = r.bd;
    g.beginPath(); g.moveTo(cx, cy - 62); g.lineTo(cx + 44, cy); g.lineTo(cx, cy + 62); g.lineTo(cx - 44, cy); g.closePath(); g.fill();
    g.fillStyle = r.md; ell(g, cx, cy, 12, 12, r.md);
    for (const [x, y] of [[60, fr + 60], [w - 60, fr + 60], [60, h - fr - 60], [w - 60, h - fr - 60]]) {
      g.fillStyle = r.md;
      g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 18, y); g.lineTo(x, y + 18); g.lineTo(x - 18, y); g.closePath(); g.fill();
    }
    speckle(g, w, h, 600, 0.08, i * 7);
    // franges
    g.strokeStyle = '#f1e4c3'; g.lineWidth = 3;
    for (let x = 6; x < w; x += 9) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, fr); g.stroke();
      g.beginPath(); g.moveTo(x, h - fr); g.lineTo(x, h); g.stroke();
    }
  });
}

// ------------------------------------------------------------------ divers
export function glowTexture() {
  return make('glow', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,0.6)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
export function softTexture() {
  return make('soft', 64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
export function cloudTexture() {
  return make('cloud', 512, 256, (g, w, h) => {
    const blobs = [[0.5, 0.58, 0.3], [0.3, 0.64, 0.2], [0.7, 0.64, 0.22], [0.42, 0.45, 0.2], [0.6, 0.47, 0.17], [0.18, 0.7, 0.12], [0.84, 0.7, 0.12]];
    for (const [x, y, r] of blobs) {
      const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
}
export function leafTexture() {
  return make('leaf', 64, 256, (g, w, h) => {
    g.strokeStyle = '#3f8a3e'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = 8; y < h - 6; y += 9) {
      const l = (w / 2 - 3) * Math.sin((y / h) * Math.PI) + 4;
      g.strokeStyle = y % 18 ? '#2f6d34' : '#4b9a46'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(w / 2, y + 6); g.lineTo(w / 2 - l, y); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y + 6); g.lineTo(w / 2 + l, y); g.stroke();
    }
  });
}
export function coinTexture() {
  return make('coin', 128, 128, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c * 0.7, c * 0.7, 4, c, c, c);
    gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.5, '#f6c94a'); gr.addColorStop(1, '#c99520');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#b8860b'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c - 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9a52a';
    g.save(); g.translate(c, c);
    for (let k = 0; k < 2; k++) { g.rotate(Math.PI / 4); g.fillRect(-26, -26, 52, 52); }
    g.restore();
    g.fillStyle = '#f6d05a';
    g.save(); g.translate(c, c);
    for (let k = 0; k < 2; k++) { g.rotate(Math.PI / 4); g.fillRect(-16, -16, 32, 32); }
    g.restore();
  });
}
export function jerseyTexture() {
  return make('jersey', 128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.font = 'bold 78px "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#0f4a2d'; g.strokeText('10', w / 2, w / 2 + 4);
    g.fillStyle = '#f3ead6'; g.fillText('10', w / 2, w / 2 + 4);
  });
}
export function textTexture(txt, color, outline) {
  return make('txt_' + txt, 256, 128, (g, w, h) => {
    g.font = 'bold 96px "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = outline; g.strokeText(txt, w / 2, h / 2 + 4);
    g.fillStyle = color; g.fillText(txt, w / 2, h / 2 + 4);
  });
}

// ------------------------------------------------------------------ toile de fond (ciel, Atlas, Koutoubia)
// Redessinée quand la lumière change. horizon = position verticale (0..1 depuis le haut) de la ligne d'horizon.
let backdropCanvas = null, backdropTex = null;
export function backdropTexture() {
  if (!backdropCanvas) {
    backdropCanvas = document.createElement('canvas');
    backdropCanvas.width = 1024; backdropCanvas.height = 1024;
    backdropTex = new THREE.CanvasTexture(backdropCanvas);
    backdropTex.colorSpace = THREE.SRGBColorSpace;
  }
  return backdropTex;
}
export function drawBackdrop(sky, light, horizon, time) {
  const g = backdropCanvas.getContext('2d'), w = 1024, h = 1024, hy = h * horizon;
  const { n, s } = light;
  const gr = g.createLinearGradient(0, 0, 0, hy);
  gr.addColorStop(0, sky[0]); gr.addColorStop(0.6, sky[1]); gr.addColorStop(1, sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, w, hy + 1);
  g.fillStyle = sky[2]; g.fillRect(0, hy, w, h - hy);

  if (n > 0.02) {
    g.fillStyle = '#fffbe8';
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = n * (0.5 + 0.5 * hash(i * 9.1));
      const sz = 1 + hash(i * 1.3) * 2.2;
      g.fillRect(hash(i * 3.1) * w, hash(i * 7.7 + 1) * hy * 0.92, sz, sz);
    }
    g.globalAlpha = n;
    const mx = w * 0.25, my = hy * 0.3, mr = 26;
    const mg = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    mg.addColorStop(0, 'rgba(220,230,255,0.5)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = mg; g.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    g.fillStyle = '#f6f2dc';
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2);
    g.moveTo(mx + mr * 1.3, my - mr * 0.2); g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2);
    g.fill('evenodd');
    g.globalAlpha = 1;
  }
  const down = clamp(s * 0.75 + n * 1.2, 0, 1);
  if (down < 0.98) {
    const sx = w * 0.74, sy = hy * (0.3 + 0.72 * down);
    const sc = s > 0.3 ? '255,160,70' : '255,245,210';
    const R = 260 + 120 * s;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, R);
    sg.addColorStop(0, `rgba(${sc},1)`); sg.addColorStop(0.08, `rgba(${sc},0.9)`); sg.addColorStop(0.3, `rgba(${sc},0.25)`); sg.addColorStop(1, `rgba(${sc},0)`);
    g.fillStyle = sg; g.fillRect(sx - R, sy - R, R * 2, R * 2);
  }
  // Atlas
  const mcol = sky[3], snow = sky[4];
  g.fillStyle = mcol;
  g.beginPath(); g.moveTo(0, hy);
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const x = (i / 32) * w;
    const m = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + 1.3)) * (0.6 + 0.4 * hash(i));
    pts.push([x, hy - m * 70]);
    g.lineTo(x, hy - m * 70);
  }
  g.lineTo(w, hy); g.closePath(); g.fill();
  g.fillStyle = snow;
  pts.forEach(([x, y], i) => {
    const m = (hy - y) / 70;
    if (m < 0.78 || i === 0 || i === 32) return;
    const c = (m - 0.62) * 70, st = w / 32;
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + st * 0.55, y + c * 0.9); g.lineTo(x + st * 0.2, y + c * 0.6);
    g.lineTo(x - st * 0.1, y + c); g.lineTo(x - st * 0.55, y + c * 0.85); g.closePath(); g.fill();
  });
  // silhouette de la ville (toits plats et palmiers)
  g.fillStyle = sky[5];
  for (let i = 0; i < 40; i++) {
    const x = hash(i * 2.7) * w, bw = 20 + hash(i * 5.1) * 50, bh = 8 + hash(i * 1.9) * 22;
    g.fillRect(x, hy - bh, bw, bh + 2);
  }
  for (let i = 0; i < 9; i++) {
    const x = hash(i * 8.3 + 4) * w, ph = 30 + hash(i * 3.3) * 25;
    g.fillRect(x - 1.5, hy - ph, 3, ph);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.beginPath(); g.ellipse(x + Math.cos(a) * 9, hy - ph + Math.sin(a) * 3, 11, 3, a, 0, Math.PI * 2); g.fill();
    }
  }
  // Koutoubia
  const kx = w * 0.6, tw = 46, th = tw * 4.4;
  const kc = sky[6], kd = sky[7];
  g.save(); g.translate(kx, hy + 1);
  g.fillStyle = kc; g.fillRect(-tw / 2, -th, tw, th);
  g.fillStyle = kd; g.fillRect(tw * 0.18, -th, tw * 0.32, th);
  for (let k = 0; k < 3; k++) {
    const y = -th * (0.3 + k * 0.22);
    g.beginPath(); g.moveTo(-tw * 0.22, y); g.lineTo(-tw * 0.22, y - tw * 0.35);
    g.arc(-tw * 0.02, y - tw * 0.35, tw * 0.2, Math.PI, 0); g.lineTo(tw * 0.18, y); g.closePath(); g.fill();
  }
  g.fillStyle = n > 0.5 ? '#1f6f66' : '#2a9d8f'; g.fillRect(-tw / 2, -th + tw * 0.06, tw, tw * 0.1);
  g.fillStyle = kc;
  for (let k = 0; k < 4; k++) g.fillRect(-tw / 2 + k * tw * 0.27, -th - tw * 0.12, tw * 0.17, tw * 0.13);
  const lw = tw * 0.42, lh = tw * 0.6;
  g.fillRect(-lw / 2, -th - lh, lw, lh);
  g.fillStyle = n > 0.5 ? '#2f7f72' : '#4caf9a';
  g.beginPath(); g.ellipse(0, -th - lh, lw * 0.4, lw * 0.3, 0, Math.PI, 0); g.fill();
  g.strokeStyle = '#c8a03a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -th - lh - lw * 0.3); g.lineTo(0, -th - lh - tw * 0.85); g.stroke();
  g.fillStyle = '#e8c04a';
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, -th - lh - tw * (0.42 + k * 0.13), tw * (0.07 - k * 0.012), 0, Math.PI * 2); g.fill(); }
  g.restore();
  // brume au pied
  const hz = g.createLinearGradient(0, hy - 60, 0, hy + 4);
  hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, sky[2]);
  g.fillStyle = hz; g.fillRect(0, hy - 60, w, 64);
  backdropTex.needsUpdate = true;
}
