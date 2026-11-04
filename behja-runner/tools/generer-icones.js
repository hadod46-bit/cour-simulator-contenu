// Génère toutes les icônes (web + Android) et les écrans de démarrage.
// Usage : node tools/generer-icones.js   (nécessite le paquet « playwright »)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const racine = path.resolve(__dirname, '..');
const res = path.join(racine, 'android/app/src/main/res');
const code = fs.readFileSync(path.join(__dirname, 'icone.js'), 'utf8');

const cibles = [
  ['www/icons/icon-192.png', 192, 192, 'plein'],
  ['www/icons/icon-512.png', 512, 512, 'plein'],
  ['www/icons/icon-maskable-512.png', 512, 512, 'masquable'],
];
const densites = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densites)) {
  cibles.push([`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, 48 * k, 48 * k, 'plein']);
  cibles.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, 48 * k, 48 * k, 'rond']);
  cibles.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, 108 * k, 108 * k, 'premier-plan']);
}
const splash = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(splash)) {
  cibles.push([`android/app/src/main/res/drawable-port-${d}/splash.png`, w, h, 'splash']);
  cibles.push([`android/app/src/main/res/drawable-land-${d}/splash.png`, h, w, 'splash']);
}
cibles.push(['android/app/src/main/res/drawable/splash.png', 480, 320, 'splash']);

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent('<canvas id="c"></canvas>');
  await pg.addScriptTag({ content: code });
  for (const [fichier, w, h, mode] of cibles) {
    const data = await pg.evaluate(([w, h, mode]) => {
      const c = document.getElementById('c'); c.width = w; c.height = h;
      dessinerIcone(c.getContext('2d'), w, h, mode);
      return c.toDataURL('image/png').split(',')[1];
    }, [Math.round(w), Math.round(h), mode]);
    const dest = path.join(racine, fichier);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    console.log('✔', fichier);
  }
  await b.close();
})();
