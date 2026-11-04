// Cache hors ligne pour la version web (PWA) de Behja Runner.
const CACHE = 'behja-runner-v8';
const FICHIERS = ['./', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/models.js', './js/textures.js', './js/audio.js', './js/util.js', './js/hero.js', './js/recolor.js', './js/monkey3d.js', './models/singe.glb', './js/persos.js', './js/eco.js', './js/shop.js',
  './models/salma.glb', './models/mehdi.glb', './models/brahim.glb',
  './lib/GLTFLoader.js', './lib/BufferGeometryUtils.js', './models/yassine.glb',
  './lib/three.module.min.js', './lib/three.core.min.js',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); return r; })
      .catch(() => caches.match(e.request))
  );
});
