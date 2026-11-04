// Économie du jeu : rials (monnaie courante, les pièces jaunes) et dirhams (monnaie premium).
import { store } from './util.js';
import { PERSOS } from './persos.js';

export const AMELIORATIONS = [
  { id: 'aimant', nom: 'Aimant', desc: 'Attire les rials plus longtemps.' },
  { id: 'babouches', nom: 'Babouches magiques', desc: 'Super saut plus long.' },
  { id: 'tapis', nom: 'Tapis volant', desc: 'Vol plus long au-dessus du souk.' },
  { id: 'x2', nom: 'Score ×2', desc: 'Multiplicateur actif plus longtemps.' }
];
export const NIVEAU_MAX = 5;
export const COUT_NIVEAU = [300, 800, 1800, 4000, 8000];       // en rials
export const BONUS_PAR_NIVEAU = 0.25;                          // +25 % de durée par niveau

export const BOOSTS = [
  { id: 'trombe', nom: 'Départ en trombe', desc: 'Commence la partie sur le tapis volant.', prix: 500 },
  { id: 'aimantDepart', nom: 'Aimant de départ', desc: 'Démarre avec l\'aimant activé.', prix: 300 }
];

// Packs de dirhams payants : nécessitent Google Play Billing (application publiée sur le Play Store).
export const PACKS = [
  { id: 'poignee', nom: 'Poignée de dirhams', dirhams: 10, prix: '0,99 €' },
  { id: 'bourse', nom: 'Bourse de dirhams', dirhams: 60, prix: '4,99 €', bonus: '+20 %' },
  { id: 'coffre', nom: 'Coffre du souk', dirhams: 150, prix: '9,99 €', bonus: '+50 %' }
];
export const ECHANGE = { rials: 1500, dirhams: 1 };
export const MOTO = { prix: 250, duree: 30, offertes: 3 };   // la 103 : tape 2 fois pendant la course
export const CHANCE_DIRHAM = 0.008;   // probabilité qu'une pièce de la piste soit un dirham (rare)

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const eco = {
  // anciennes sauvegardes : les « pièces » deviennent des rials
  rials: store.get('rials', store.get('pieces', 0)),
  dirhams: store.get('dirhams', 0),
  persos: store.get('persos', ['yassine']),
  perso: store.get('perso', 'yassine'),
  niveaux: Object.assign({ aimant: 0, babouches: 0, tapis: 0, x2: 0 }, store.get('niveaux', {})),
  boosts: Object.assign({ trombe: 0, aimantDepart: 0 }, store.get('boosts', {})),
  armes: Object.assign({ trombe: false, aimantDepart: false }, store.get('armes', {})),
  cadeau: store.get('cadeau', ''),
  motos: store.get('motos', MOTO.offertes),

  save() {
    for (const k of ['rials', 'dirhams', 'persos', 'perso', 'niveaux', 'boosts', 'armes', 'cadeau', 'motos']) store.set(k, this[k]);
  },
  possede(id) { return this.persos.includes(id); },
  acheterPerso(id) {
    const p = PERSOS.find(x => x.id === id);
    if (!p || this.possede(id) || this.dirhams < p.prix) return false;
    this.dirhams -= p.prix;
    this.persos.push(id);
    this.perso = id;
    this.save();
    return true;
  },
  choisirPerso(id) { if (this.possede(id)) { this.perso = id; this.save(); } },
  coutNiveau(id) { const n = this.niveaux[id]; return n >= NIVEAU_MAX ? null : COUT_NIVEAU[n]; },
  ameliorer(id) {
    const c = this.coutNiveau(id);
    if (c === null || this.rials < c) return false;
    this.rials -= c;
    this.niveaux[id]++;
    this.save();
    return true;
  },
  duree(id, base) { return base * (1 + BONUS_PAR_NIVEAU * (this.niveaux[id] || 0)); },
  acheterBoost(id) {
    const b = BOOSTS.find(x => x.id === id);
    if (!b || this.rials < b.prix) return false;
    this.rials -= b.prix;
    this.boosts[id]++;
    this.armes[id] = true;
    this.save();
    return true;
  },
  // consomme les boosts activés au départ d'une partie
  consommerBoosts() {
    const utilises = [];
    for (const b of BOOSTS) {
      if (this.armes[b.id] && this.boosts[b.id] > 0) { this.boosts[b.id]--; utilises.push(b.id); }
      if (this.boosts[b.id] <= 0) this.armes[b.id] = false;
    }
    this.save();
    return utilises;
  },
  acheterMoto() {
    if (this.rials < MOTO.prix) return false;
    this.rials -= MOTO.prix;
    this.motos++;
    this.save();
    return true;
  },
  utiliserMoto() {
    if (this.motos <= 0) return false;
    this.motos--;
    this.save();
    return true;
  },
  echanger() {
    if (this.rials < ECHANGE.rials) return false;
    this.rials -= ECHANGE.rials;
    this.dirhams += ECHANGE.dirhams;
    this.save();
    return true;
  },
  depenserDirhams(n) {
    if (this.dirhams < n) return false;
    this.dirhams -= n;
    this.save();
    return true;
  },
  gagner(rials, dirhams) { this.rials += rials; this.dirhams += dirhams; this.save(); },
  // 1 dirham offert par jour de jeu
  cadeauDuJour() {
    const j = aujourdhui();
    if (this.cadeau === j) return false;
    this.cadeau = j;
    this.dirhams += 1;
    this.save();
    return true;
  }
};
