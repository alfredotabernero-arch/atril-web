/* Atril — service worker: funciona sin conexión cuando se sirve por http(s) */
const CACHE = 'atril-v2.0.0';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/vendor/capacitor.js', 'js/nativo.js', 'js/util.js', 'js/zip.js', 'js/anotaciones.js', 'js/relax.js', 'js/voz.js', 'js/ayuda.js', 'js/views/relajacion.js', 'js/fotos.js', 'js/views/seccion.js', 'js/views/atril.js', 'fonts/nunito-latin-wght-normal.woff2', 'fonts/nunito-latin-ext-wght-normal.woff2', 'js/iconos.js', 'js/db.js', 'js/pitch.js', 'js/audio.js', 'js/modelo.js', 'js/app.js',
  'js/views/hoy.js', 'js/views/obras.js', 'js/views/herramientas.js', 'js/views/afinador.js',
  'js/views/otras.js', 'js/views/estadisticas.js', 'js/views/ajustes.js',
  'icons/icono.svg', 'icons/icono-192.png', 'icons/icono-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
