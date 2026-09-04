/* ============================================================================
   sw.js — service worker do app instalável
   Guarda o "esqueleto" do site (HTML/CSS/JS/ícones) para abrir instantâneo e
   funcionar offline. Nunca intercepta /api/dados — a sincronização sempre
   fala direto com o servidor.
   ========================================================================== */
'use strict';

var CACHE = 'fin-sueli-shell-v3';
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

  /* --------------------------------------------------------------------------
     REDE PRIMEIRO, CACHE COMO REDE DE SEGURANÇA

     Antes era "cache primeiro, atualiza depois" (stale-while-revalidate): o
     app abria instantâneo, mas mostrava a versão ANTERIOR a cada publicação —
     e só trocava no segundo acesso. Isso faz parecer que um deploy não subiu.

     Agora o código do app (HTML/JS/CSS/JSON) tenta a rede primeiro e guarda a
     resposta; se a rede falhar ou demorar demais, entra o que está no cache.
     Resultado: sempre a versão publicada quando há internet, e o app continua
     abrindo offline. Imagens e ícones seguem vindo do cache primeiro, porque
     mudam raramente e são pesados.
  -------------------------------------------------------------------------- */
  var ehCodigo = /\.(?:html|js|css|json|webmanifest)$/.test(url.pathname) || url.pathname === '/';

  if (!ehCodigo) {                                   // imagens/ícones: cache primeiro
    ev.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (resp) {
          if (resp && resp.ok && url.origin === location.origin) {
            var copia = resp.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copia); });
          }
          return resp;
        });
      })
    );
    return;
  }

  ev.respondWith(
    new Promise(function (resolve) {
      var resolvido = false;
      var entregar = function (r) { if (!resolvido && r) { resolvido = true; resolve(r); } };

      // se a rede não responder em 4s, serve o cache e não deixa o app travado
      var relogio = setTimeout(function () {
        caches.match(req).then(function (c) { entregar(c); });
      }, 4000);

      fetch(req).then(function (resp) {
        clearTimeout(relogio);
        if (resp && resp.ok && url.origin === location.origin) {
          var copia = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        entregar(resp);
      }).catch(function () {
        clearTimeout(relogio);
        caches.match(req).then(function (c) {
          entregar(c || new Response('Sem conexão e sem cópia local deste arquivo.', {
            status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' }
          }));
        });
      });
    })
  );
});
