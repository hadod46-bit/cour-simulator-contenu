# Behja Runner 🐒

Jeu de course infinie dans les souks de Marrakech. Un singe magot de Jemaa el-Fna veut voler
le tarbouche du héros : il faut fuir en esquivant les stands du souk.

## Jouer

| Geste | Action |
|---|---|
| Glisser ← / → | Changer de voie |
| Glisser ↑ | Sauter (caisses d'oranges, tapis roulés, tajines) |
| Glisser ↓ | Rouler sous les tapis suspendus |

- Les **stands** bloquent la voie, mais on peut grimper dessus par les **rampes en bois**.
- Les **charrettes** de jus d'orange roulent vers toi : une clochette prévient de leur arrivée.
- Si tu heurtes un obstacle par le côté, tu trébuches et le singe te rattrape presque.
  Une deuxième erreur dans les 5 secondes, et il t'attrape.
- Bonus : **Aimant** (attire les dirhams), **Babouches** (super saut, permet de sauter sur les stands),
  **Tapis volant** (vol au-dessus du souk), **×2** (score doublé).

Clavier (sur ordinateur) : flèches ou ZQSD, Échap pour la pause.

## Installer sur Android

Chaque modification envoyée sur GitHub lance l'action **« Behja Runner – APK Android »**, qui compile
l'application et la publie dans les *Releases* du dépôt :

1. Sur le téléphone, ouvrir la page **Releases** du dépôt et télécharger `behja-runner.apk`
   (lien direct : `https://github.com/hadod46-bit/cour-simulator-contenu/releases/latest/download/behja-runner.apk`).
2. Ouvrir le fichier et autoriser « l'installation d'applications inconnues » pour le navigateur.
3. Les versions suivantes s'installent par-dessus l'ancienne : record et dirhams sont conservés.

### Mises à jour automatiques

Une fois l'APK installé, **le jeu se met à jour tout seul** : au lancement, l'application regarde si une
version plus récente est publiée sur GitHub Pages
(`https://hadod46-bit.github.io/cour-simulator-contenu/behja-runner/www/`) et l'ouvre directement.
Hors connexion, elle lance la version incluse dans l'APK. Le menu affiche « Version … · en ligne » ou
« · intégrée ».

Pour publier une mise à jour du jeu : modifier `www/`, augmenter le numéro dans `www/version.json`, puis
fusionner dans `main` (GitHub Pages republie le site). Seules les modifications de la partie Android
(icône, permissions, configuration Capacitor) demandent de réinstaller un nouvel APK.

L'APK est signé avec une clé **publique** (`android/app/behja-debug.keystore`, mot de passe `android`)
qui sert uniquement à l'installation directe. Pour publier sur le Play Store, il faut créer sa propre clé
privée et ne jamais la mettre dans le dépôt.

## Structure

```
behja-runner/
├── www/                  le jeu (HTML + WebGL, fonctionne hors ligne)
│   ├── index.html        menus et affichage
│   ├── style.css
│   ├── js/main.js        logique (physique, génération du niveau), scène 3D, caméra, jour/nuit
│   ├── js/models.js      modèles 3D : stands, rampes, obstacles, décor, coureur et singe animés
│   ├── js/textures.js    textures dessinées par programme (façades, zellige, tapis, ciel…)
│   ├── js/audio.js       musique et bruitages synthétisés
│   ├── lib/              Three.js (moteur 3D, licence MIT), copié pour fonctionner sans réseau
│   └── icons/
├── android/              projet Android natif (Capacitor)
├── tools/                génération des icônes et de l'écran de démarrage
└── capacitor.config.json
```

Un cycle jour → coucher de soleil → nuit étoilée (lanternes allumées) se déroule pendant la partie.

Le rendu est en vraie 3D (Three.js / WebGL) : ombres douces, anticrénelage, personnages au style
dessin animé. Si le téléphone peine, la qualité baisse automatiquement (résolution, ombres).

Tout est créé par programme (aucune image ni aucun son externe) : la musique (darbouka,
qraqeb, guembri) est synthétisée en direct avec la Web Audio API.

## Développer

```bash
cd behja-runner
npx serve www              # un serveur est nécessaire (modules JavaScript), puis ouvrir le jeu dans le navigateur

npm install
npx cap sync android       # copie www/ dans le projet Android
cd android && ./gradlew assembleRelease   # nécessite le SDK Android (ou ouvrir le dossier dans Android Studio)

node tools/generer-icones.js   # régénère les icônes (nécessite playwright)
```
