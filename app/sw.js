/* O build substitui a versão pelo hash dos arquivos publicados. */
const CACHE_NAME = 'gestor-shell-development-v1';
const PRECACHE = [
  './', './index.html', './styles.css', './core.js', './data.js', './app.js', './pwa.js',
  './manifest.webmanifest', './vendor/sql-wasm.js', './vendor/sql-wasm.wasm',
  './vendor/fonts.css', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './vendor/font-1.ttf', './vendor/font-2.ttf', './vendor/font-3.ttf',
  './vendor/font-4.ttf', './vendor/font-5.ttf', './vendor/font-6.ttf',
  './vendor/font-7.ttf', './vendor/font-8.ttf', './vendor/font-9.ttf',
];
const scope = self.registration.scope;
const assetUrls = new Set(PRECACHE.map(asset => new URL(asset, scope).href));

self.addEventListener('install', event => {
  // Se algum arquivo falhar, a instalação inteira falha e a versão anterior permanece.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('gestor-shell-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(scope).origin) return;

  const isHome = request.mode === 'navigate' &&
    [new URL('./', scope).pathname, new URL('./index.html', scope).pathname].includes(url.pathname);
  if (!isHome && !assetUrls.has(url.href)) return;

  // Cache apenas do aplicativo. O banco pessoal nunca é enviado nem incluído aqui.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = isHome ? new URL('./index.html', scope).href : url.href;
    const cached = await cache.match(key);
    return cached || fetch(request);
  })());
});
