/* ============================================================================
   sw.js — service worker do app instalável
   Guarda o "esqueleto" do site (HTML/CSS/JS/ícones) para abrir instantâneo e
   funcionar offline. Nunca intercepta /api/dados — a sincronização sempre
   fala direto com o servidor.
   ========================================================================== */
'use strict';

var CACHE = 'fin-sueli-shell-v2';
var ARQUIVOS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/app.css',
  '/assets/store.js',
  '/assets/engine.js',
  '/assets/charts.js',
  '/assets/ui.js',
  '/assets/sync.js',
  '/assets/cripto.js',
  '/data/seed.enc.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ARQUIVOS).catch(function () { /* alguns podem não existir; ignora */ });
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;                          // nunca intercepta PUT/POST
  var url = new URL(req.url);
  if (url.pathname.indexOf('/api/') === 0) return;            // sincronização sempre vai direto à rede

  // stale-while-revalidate: responde do cache na hora, atualiza em segundo plano
  ev.respondWith(
    caches.match(req).then(function (cached) {
      var rede = fetch(req).then(function (resp) {
        if (resp && resp.ok && url.origin === location.origin) {
          caches.open(CACHE).then(function (c) { c.put(req, resp.clone()); });
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || rede;
    })
  );
});
