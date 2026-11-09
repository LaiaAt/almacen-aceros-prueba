/* Almacén de aceros (prueba) — service worker. Autor: Carlos Eduardo Bermúdez Castro
 * Guarda la app para abrirla sin señal. Las llamadas al servidor (Apps Script) nunca se guardan aquí.
 * Cambie VERSION cada vez que publique una versión nueva para que los celulares la actualicen. */
var VERSION = 'aceros-v4';
var ARCHIVOS = ['./', 'index.html', 'style.css', 'core.js', 'config.js', 'api.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Primero la red (para recibir versiones nuevas); si no hay señal, lo guardado.
  e.respondWith(fetch(req).then(function (res) {
    var copia = res.clone();
    caches.open(VERSION).then(function (c) { c.put(req, copia); });
    return res;
  }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
});
