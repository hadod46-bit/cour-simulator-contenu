// Boutique : personnages (dirhams), améliorations et boosts (rials), dirhams (packs et échange).
import { eco, AMELIORATIONS, NIVEAU_MAX, BOOSTS, PACKS, ECHANGE, BONUS_PAR_NIVEAU, MOTO } from './eco.js';
import { PERSOS } from './persos.js';

const R = n => `<span class="m-rial">${n}</span>`;
const D = n => `<span class="m-dirham">${n}</span>`;

export function initShop({ onPreview, onChange, toast, son }) {
  const el = document.getElementById('boutique');
  const contenu = document.getElementById('boutique-contenu');
  let onglet = 'persos', apercu = eco.perso;

  function persos() {
    return `<p class="b-intro">Touche un personnage pour le voir en 3D.</p><div class="cartes">` + PERSOS.map(p => {
      const possede = eco.possede(p.id), choisi = eco.perso === p.id;
      let bouton;
      if (choisi) bouton = `<span class="etiquette">Choisi</span>`;
      else if (possede) bouton = `<button class="btn-petit" data-action="choisir" data-id="${p.id}">Choisir</button>`;
      else if (eco.dirhams >= p.prix) bouton = `<button class="btn-petit btn-dirham" data-action="acheter" data-id="${p.id}">Acheter ${D(p.prix)}</button>`;
      else bouton = `<button class="btn-petit" disabled>${D(p.prix)} · il manque ${p.prix - eco.dirhams}</button>`;
      return `<div class="carte-perso${apercu === p.id ? ' apercu' : ''}" data-action="voir" data-id="${p.id}">
        <b>${p.nom}</b><small>${p.desc}</small>${bouton}</div>`;
    }).join('') + '</div>';
  }

  function ameliorations() {
    return AMELIORATIONS.map(a => {
      const n = eco.niveaux[a.id], cout = eco.coutNiveau(a.id);
      const pips = Array.from({ length: NIVEAU_MAX }, (_, i) => `<i class="${i < n ? 'plein' : ''}"></i>`).join('');
      const bouton = cout === null ? `<span class="etiquette">Niveau max</span>`
        : `<button class="btn-petit" data-action="ameliorer" data-id="${a.id}" ${eco.rials < cout ? 'disabled' : ''}>Améliorer ${R(cout)}</button>`;
      return `<div class="ligne"><div><b>${a.nom}</b><small>${a.desc} Durée +${Math.round(n * BONUS_PAR_NIVEAU * 100)} %</small>
        <span class="pips">${pips}</span></div>${bouton}</div>`;
    }).join('');
  }

  function boosts() {
    const moto = `<div class="ligne ligne-moto"><div><b>La 103</b> <span class="stock">×${eco.motos}</span>
        <small>Tape 2 fois sur l'écran pendant la course pour l'enfourcher : ${MOTO.duree} s plus vite, et elle te protège d'une chute.</small></div>
        <button class="btn-petit" data-action="moto" ${eco.rials < MOTO.prix ? 'disabled' : ''}>Acheter ${R(MOTO.prix)}</button></div>`;
    return moto + `<p class="b-intro">Les boosts activés sont utilisés au début de la prochaine partie.</p>` + BOOSTS.map(b => {
      const stock = eco.boosts[b.id];
      const actif = stock > 0 ? `<label class="interrupteur"><input type="checkbox" data-action="armer" data-id="${b.id}" ${eco.armes[b.id] ? 'checked' : ''}> activé</label>` : '';
      return `<div class="ligne"><div><b>${b.nom}</b> <span class="stock">×${stock}</span><small>${b.desc}</small>${actif}</div>
        <button class="btn-petit" data-action="boost" data-id="${b.id}" ${eco.rials < b.prix ? 'disabled' : ''}>Acheter ${R(b.prix)}</button></div>`;
    }).join('');
  }

  function dirhams() {
    return `<div class="ligne echange"><div><b>Échange à la banque du souk</b><small>${ECHANGE.rials} rials contre ${ECHANGE.dirhams} dirham.</small></div>
        <button class="btn-petit btn-dirham" data-action="echanger" ${eco.rials < ECHANGE.rials ? 'disabled' : ''}>${R(ECHANGE.rials)} → ${D(ECHANGE.dirhams)}</button></div>` +
      PACKS.map(p => `<div class="ligne"><div><b>${p.nom}</b> ${p.bonus ? `<span class="bonus">${p.bonus}</span>` : ''}<small>${D(p.dirhams)}</small></div>
        <button class="btn-petit" disabled>${p.prix}</button></div>`).join('') +
      `<p class="note">Les achats avec de l'argent réel seront disponibles quand le jeu sera publié sur le Play Store.<br>
        En attendant : trouve les dirhams rares sur la piste, reçois 1 dirham offert chaque jour, ou échange tes rials.</p>`;
  }

  function render() {
    el.querySelector('.b-rials').textContent = eco.rials;
    el.querySelector('.b-dirhams').textContent = eco.dirhams;
    for (const b of el.querySelectorAll('[data-onglet]')) b.classList.toggle('actif', b.dataset.onglet === onglet);
    contenu.innerHTML = { persos, ameliorations, boosts, dirhams }[onglet]();
  }

  el.querySelector('.onglets').addEventListener('click', e => {
    const b = e.target.closest('[data-onglet]');
    if (!b) return;
    onglet = b.dataset.onglet;
    render();
  });
  contenu.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t || t.disabled) return;
    const id = t.dataset.id;
    let ok = true;
    switch (t.dataset.action) {
      case 'voir': apercu = id; onPreview(id); render(); return;
      case 'choisir': eco.choisirPerso(id); apercu = id; onPreview(id); break;
      case 'acheter':
        ok = eco.acheterPerso(id);
        if (ok) { apercu = id; onPreview(id); toast(`${PERSOS.find(p => p.id === id).nom} débloqué !`); }
        break;
      case 'ameliorer': ok = eco.ameliorer(id); if (ok) toast('Amélioration achetée !'); break;
      case 'boost': ok = eco.acheterBoost(id); if (ok) toast('Boost acheté !'); break;
      case 'echanger': ok = eco.echanger(); if (ok) toast('+1 dirham !'); break;
      case 'moto': ok = eco.acheterMoto(); if (ok) toast('Une 103 de plus !'); break;
      case 'armer': eco.armes[id] = t.checked; eco.save(); onChange(); return;
      default: return;
    }
    if (ok) son.power(); else son.bump();
    e.stopPropagation();
    render();
    onChange();
  });

  return {
    get ouverte() { return !el.hidden; },
    open() { onglet = 'persos'; apercu = eco.perso; el.hidden = false; render(); },
    close() { el.hidden = true; apercu = eco.perso; onPreview(eco.perso); onChange(); },
    render
  };
}
