/* ===========================================================================
   KRONOS CENTRAL — Service Worker
   Objetivo: PWA "sempre vivo" E sempre atualizado.

   Estratégia para arquivos do próprio app (mesma origem, GET): NETWORK-FIRST.
   - Online: busca sempre a versão mais nova na rede (então todo deploy aparece
     na hora, sem rebuild). Atualiza o cache em segundo plano.
   - Offline / rede caiu: cai para o cache (app abre mesmo sem internet).
   As chamadas à API da Anthropic NUNCA passam por aqui (sempre rede direta).
   =========================================================================== */

const CACHE = "kronos-v65";

// Caminhos relativos ao escopo — funcionam em localhost (Electron) e na
// subpasta do GitHub Pages (/kronos-central/).
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/vendor/qrcode.js",
  "./js/auth.js",
  "./js/agents.js",
  "./js/sync.js",
  "./js/api.js",
  "./js/cost.js",
  "./js/chat.js",
  "./js/delfos.js",
  "./js/costs-view.js",
  "./js/settings.js",
  "./js/nucleo-view.js",
  "./js/context.js",
  "./js/app.js",
  "./vault.enc",
  "./assets/logo-kronos.png",
  "./assets/logo-mark.png",
  "./assets/icons/ponteiro-areia.png",
  "./assets/agents/iara.jpg",
  "./assets/agents/iara-full.jpg",
  "./assets/agents/tiago.jpg",
  "./assets/agents/matias.jpg",
  "./assets/agents/fabiana.jpg",
  "./assets/agents/damiano.jpg",
  "./assets/agents/iago.jpg",
  "./assets/agents/tobias.jpg",
  "./assets/agents/elias.jpg",
  "./assets/agents/hilario.jpg",
  "./assets/agents/tatiana.jpg",
  "./assets/areia-sepia.png",
  "./assets/areia-onix.png",
  "./assets/textures/core-cracks.svg",
  "./assets/textures/briefing-nature.svg",
  "./assets/feixe-luz.jpg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // cache:"reload" => ignora o cache HTTP e baixa o arquivo realmente novo.
      Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" }))))
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

  // Só tratamos GET de mesma origem. API da Anthropic, fontes e POST passam
  // direto pela rede — jamais por aqui.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // network-first: versão nova quando online; cache como rede de segurança.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
