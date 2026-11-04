// Sons et musique synthétisés (Web Audio) : aucun fichier audio externe.
import { clamp, pick, store } from './util.js';

export const Sound = {
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
