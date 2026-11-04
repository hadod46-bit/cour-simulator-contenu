// Dessin de l'icône et de l'écran de démarrage de Behja Runner (utilisé par generer-icones.js).
// mode : 'plein' (fond + singe), 'rond' (disque), 'premier-plan' (singe seul, transparent), 'splash'.
function dessinerIcone(ctx, w, h, mode) {
  const s = Math.min(w, h);
  ctx.clearRect(0, 0, w, h);
  const fond = () => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e2733f'); g.addColorStop(1, '#a63c22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // étoiles de zellige discrètes
    ctx.fillStyle = 'rgba(255,240,210,0.10)';
    const pas = s / 5;
    for (let y = pas / 2; y < h + pas; y += pas) for (let x = pas / 2; x < w + pas; x += pas) {
      ctx.save(); ctx.translate(x, y);
      for (let k = 0; k < 2; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-pas * 0.18, -pas * 0.18, pas * 0.36, pas * 0.36); }
      ctx.restore();
    }
  };
  if (mode === 'rond') {
    ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, s / 2, 0, Math.PI * 2); ctx.clip(); fond(); ctx.restore();
  } else if (mode !== 'premier-plan') {
    fond();
  }
  // arc outrepassé
  const echelle = mode === 'premier-plan' ? 0.62 : mode === 'splash' ? 0.42 : mode === 'masquable' ? 0.72 : 0.86;
  const R = s * 0.5 * echelle;
  const cx = w / 2, cy = mode === 'splash' ? h * 0.44 : h / 2;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#f6e7c8';
  ctx.beginPath(); ctx.moveTo(-R * 0.78, R * 0.95); ctx.lineTo(-R * 0.78, 0);
  ctx.arc(0, -R * 0.05, R * 0.83, Math.PI + 0.35, -0.35); ctx.lineTo(R * 0.78, R * 0.95); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d6f8a';
  ctx.beginPath(); ctx.moveTo(-R * 0.66, R * 0.95); ctx.lineTo(-R * 0.66, 0);
  ctx.arc(0, -R * 0.05, R * 0.7, Math.PI + 0.35, -0.35); ctx.lineTo(R * 0.66, R * 0.95); ctx.closePath(); ctx.fill();

  // singe magot (face) coiffé du tarbouche volé
  const u = R * 0.9;
  const e = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x * u, y * u, rx * u, ry * u, 0, 0, Math.PI * 2); ctx.fill(); };
  e(0, 0.62, 0.55, 0.38, '#8a6743');          // épaules
  e(-0.5, 0.05, 0.16, 0.18, '#8a6743'); e(0.5, 0.05, 0.16, 0.18, '#8a6743');
  e(-0.5, 0.05, 0.09, 0.11, '#e0a08a'); e(0.5, 0.05, 0.09, 0.11, '#e0a08a');
  e(0, 0.08, 0.48, 0.5, '#9b7651');           // tête
  e(0, 0.18, 0.34, 0.33, '#e9b8a0');          // visage
  e(-0.14, 0.02, 0.13, 0.11, '#e9b8a0'); e(0.14, 0.02, 0.13, 0.11, '#e9b8a0');
  e(-0.13, 0.04, 0.075, 0.08, '#fff'); e(0.13, 0.04, 0.075, 0.08, '#fff');
  e(-0.11, 0.05, 0.045, 0.055, '#2a1a12'); e(0.15, 0.05, 0.045, 0.055, '#2a1a12');
  e(-0.1, 0.03, 0.015, 0.015, '#fff'); e(0.16, 0.03, 0.015, 0.015, '#fff');
  e(-0.05, 0.2, 0.025, 0.02, '#7a4a3a'); e(0.05, 0.2, 0.025, 0.02, '#7a4a3a');
  ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = u * 0.035; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0.27 * u, 0.13 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = u * 0.03;
  ctx.beginPath(); ctx.moveTo(-0.24 * u, -0.1 * u); ctx.lineTo(-0.05 * u, -0.07 * u); ctx.moveTo(0.24 * u, -0.12 * u); ctx.lineTo(0.06 * u, -0.07 * u); ctx.stroke();
  // tarbouche
  ctx.save(); ctx.translate(0.08 * u, -0.38 * u); ctx.rotate(0.22);
  ctx.fillStyle = '#c1272d';
  ctx.beginPath(); ctx.moveTo(-0.27 * u, 0.06 * u); ctx.lineTo(0.27 * u, 0.06 * u); ctx.lineTo(0.2 * u, -0.34 * u); ctx.lineTo(-0.2 * u, -0.34 * u); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8e1820'; ctx.beginPath(); ctx.ellipse(0, -0.34 * u, 0.2 * u, 0.05 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = u * 0.03;
  ctx.beginPath(); ctx.moveTo(0, -0.35 * u); ctx.quadraticCurveTo(0.28 * u, -0.38 * u, 0.3 * u, -0.08 * u); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(0.3 * u, -0.05 * u, 0.04 * u, 0.07 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();

  if (mode === 'splash') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2b632';
    ctx.font = `900 ${Math.round(s * 0.13)}px "Trebuchet MS", sans-serif`;
    ctx.fillText('BEHJA', w / 2 + s * 0.006, h * 0.72 + s * 0.008);
    ctx.fillStyle = '#fff8ea'; ctx.fillText('BEHJA', w / 2, h * 0.72);
    ctx.font = `800 ${Math.round(s * 0.07)}px "Trebuchet MS", sans-serif`;
    ctx.fillText('RUNNER', w / 2, h * 0.72 + s * 0.11);
  }
}
if (typeof module !== 'undefined') module.exports = { dessinerIcone };
