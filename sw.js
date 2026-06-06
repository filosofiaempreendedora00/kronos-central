/* ===========================================================================
   KRONOS CENTRAL — Service Worker
   Deixa o PWA "sempre vivo": guarda o app-shell (HTML/CSS/JS/ícones) em cache,
   então a Central abre instantânea — mesmo com 5G ruim ou momentaneamente
   offline. As chamadas à API da Anthropic NUNCA são cacheadas (sempre rede).

   Estratégia para arquivos do próprio app (mesma origem, GET):
   stale-while-revalidate — serve o cache na hora e atualiza em segundo plano,
   garantindo abertura rápida sem travar em versão velha.
   =========================================================================== */

const CACHE = "kronos-v1";

// Caminhos relativos ao escopo do SW — funcionam tanto em localhost (Electron)
// quanto na subpasta do GitHub Pages (/kronos-central/).
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/vendor/qrcode.js",
  "./js/agents.js",
  "./js/api.js",
  "./js/cost.js",
  "./js/chat.js",
  "./js/delfos.js",
  "./js/costs-view.js",
  "./js/settings.js",
  "./js/app.js",
  "./assets/areia-sepia.png",
  "./assets/areia-onix.png",
  "./assets/feixe-luz.jpg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll falha se um único item falhar; usamos add individual tolerante.
      Promise.allSettled(PRECACHE.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só tratamos GET de mesma origem. Tudo o mais (API da Anthropic, fontes,
  // POST de streaming) passa direto pela rede — jamais cacheado.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // stale-while-revalidate: cache imediato + atualização em segundo plano.
      return cached || network || fetch(req);
    })
  );
});
