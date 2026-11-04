// Recolore des cellules (8 x 4) de la palette KayKit : chaque cellule est un dégradé vertical.
export function recolor(img, map) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const SW = img.width / 8, SH = img.height / 4;   // cellules de 128 x 256 px
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  for (const [cell, [hi, lo]] of Object.entries(map)) {
    const r = Math.floor(cell / 8), col = cell % 8;
    const d = g.getImageData(col * SW, r * SH, SW, SH), p = d.data;
    let lmin = 255, lmax = 0;
    for (let i = 0; i < p.length; i += 4) { const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; if (l < lmin) lmin = l; if (l > lmax) lmax = l; }
    const H = hex(hi), L = hex(lo);
    for (let i = 0; i < p.length; i += 4) {
      const t = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] - lmin) / Math.max(1, lmax - lmin);
      for (let k = 0; k < 3; k++) p[i + k] = L[k] + (H[k] - L[k]) * t;
    }
    g.putImageData(d, col * SW, r * SH);
  }
  return c;
}
