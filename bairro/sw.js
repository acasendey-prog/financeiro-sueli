/* ============================================================================
   sw.js — service worker do mural do bairro
   Guarda o esqueleto do app (HTML/CSS/JS/ícones) para abrir instantâneo e
   funcionar sem rede. Nunca intercepta /api/ — o mural sempre fala com o
   servidor direto.
   ========================================================================== */
'use strict';

var CACHE = 'bairro-shell-v1';
var ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/contas.js',
  './assets/dados.js',
  './assets/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ARQUIVOS).catch(function () { /* algum arquivo pode faltar; ignora */ });
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n !== CACHE; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.pathname.indexOf('/api/') === 0) return;

  // stale-while-revalidate: responde do cache na hora, atualiza por trás
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
