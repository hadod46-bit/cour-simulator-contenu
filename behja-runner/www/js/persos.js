// Personnages jouables (modèles KayKit Adventurers, licence CC0, recolorés pour Marrakech).
// Couleurs : cellules de la palette 8 x 4 -> [teinte claire, teinte sombre].
const PEAU = ['#c98a5c', '#a06438'];
const CHEVEUX = ['#3a2618', '#140b06'];

export const PERSOS = [
  {
    id: 'yassine', nom: 'Yassine', prix: 0, url: 'models/yassine.glb', prefixe: 'Rogue',
    chapeau: 'fez', nomChapeau: 'le tarbouche', sac: true, hauteurChapeau: 0.22,
    desc: 'Le gamin de la médina, rapide et malin.',
    corps: { 1: CHEVEUX, 0: PEAU },
    jambes: { 1: CHEVEUX, 0: PEAU, 19: ['#ffffff', '#cfc6b8'], 15: ['#4a6da8', '#253d66'] }
  },
  {
    id: 'salma', nom: 'Salma', prix: 20, url: 'models/salma.glb', prefixe: 'Mage',
    chapeau: 'diademe', nomChapeau: 'le diadème', hauteurChapeau: 0.3,
    desc: 'Caftan rose et or : elle file entre les étals comme le vent.',
    corps: {
      1: ['#2a1a12', '#0e0805'], 0: ['#d39a6e', '#a8683f'],
      8: ['#e0457b', '#8e1f4f'], 5: ['#c43a6e', '#6e1638'], 3: ['#f2c14e', '#a87a22'], 4: ['#f2c14e', '#a87a22'],
      16: ['#f2c14e', '#a87a22'], 23: ['#f2c14e', '#a87a22'], 18: ['#2a9d8f', '#155e57'], 15: ['#2a9d8f', '#155e57'],
      19: ['#f2c94c', '#b5892a']
    }
  },
  {
    id: 'mehdi', nom: 'Mehdi', prix: 35, url: 'models/mehdi.glb', prefixe: 'Knight',
    chapeau: 'casquette', nomChapeau: 'la casquette', hauteurChapeau: 0.24,
    desc: 'Maillot rouge et vert des Lions de l\'Atlas, roi du dribble entre les stands.',
    corps: {
      1: CHEVEUX, 0: ['#b97a4e', '#8a5232'],
      3: ['#e03131', '#8c1515'], 7: ['#2f9e5a', '#14552f'], 6: ['#ffffff', '#cfc8bc'], 4: ['#ffffff', '#cfc8bc'],
      15: ['#1f2a44', '#0e1426'], 8: ['#2f9e5a', '#14552f'], 10: ['#ffffff', '#cfc8bc'], 9: ['#e03131', '#8c1515']
    }
  },
  {
    id: 'brahim', nom: 'Hajj Brahim', prix: 60, url: 'models/brahim.glb', prefixe: 'Barbarian',
    chapeau: 'kufi', nomChapeau: 'la chéchia', hauteurChapeau: 0.2,
    desc: 'Le grand-père du souk, en djellaba… bien plus agile qu\'il n\'en a l\'air !',
    corps: {
      0: ['#b98058', '#8a5534'], 1: ['#f5f2ea', '#c9c3b6'],
      6: ['#efe4cf', '#bfae8f'], 23: ['#efe4cf', '#bfae8f'], 3: ['#efe4cf', '#bfae8f'], 8: ['#efe4cf', '#bfae8f'],
      7: ['#d9c7a5', '#a8946f'], 10: ['#8a5a32', '#5a3a1e'], 15: ['#8a5a32', '#5a3a1e'], 9: ['#b98058', '#8a5534'],
      19: ['#f2c94c', '#b5892a']
    }
  }
];

export const persoParId = id => PERSOS.find(p => p.id === id) || PERSOS[0];
