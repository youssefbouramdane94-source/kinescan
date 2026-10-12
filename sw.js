/* KinéScan — service worker : l'application fonctionne sans internet après la première visite.
   Rien n'est envoyé : il ne fait que garder en cache les fichiers de l'application. */
const SHELL_CACHE = 'ks-shell-v1';   // copie hors ligne de l'application (mise à jour à chaque visite en ligne)
const AI_CACHE = 'ks-ia-v1';         // MediaPipe + modèle (~24 Mo) : seulement si on change de version
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/style.css', 'css/patients.css',
  'js/angles.js', 'js/pose.js', 'js/report.js', 'js/feedback.js', 'js/db.js', 'js/patients.js', 'js/install.js', 'js/app.js',
  'fonts/Geist-Variable.woff2', 'fonts/GeistMono-Variable.woff2',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'mentions-legales.html', 'confidentialite.html', 'cgu.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== AI_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheable = (res) => res && res.ok && res.status === 200 && res.type === 'basic';

async function put(cacheName, req, res) {
  if (cacheable(res)) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // pages : réseau d'abord (mises à jour visibles), cache si hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => put(SHELL_CACHE, req, res))
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('index.html')));
    return;
  }

  // IA (bibliothèque + modèle) : cache d'abord, téléchargés une seule fois
  if (/\/(vendor|models)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(AI_CACHE, req, res))));
    return;
  }

  // reste de l'application : réseau d'abord (page et scripts toujours de la même version), cache si hors ligne
  e.respondWith(fetch(req).then((res) => put(SHELL_CACHE, req, res))
    .catch(() => caches.match(req, { ignoreSearch: true })));
});
