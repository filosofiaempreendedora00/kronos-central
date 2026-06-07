/* ===========================================================================
   KRONOS CENTRAL — Sincronização de prompts via GitHub (cross-device)

   PROBLEMA: as mudanças que o IAgo propõe e o fundador aprova ficavam salvas
   só no aparelho (localStorage). Aprovar no celular não valia no Mac, e vice-versa.

   SOLUÇÃO: um arquivo compartilhado no repositório
       filosofiaempreendedora00/kronos-central → www/contexto/overrides.json
   guarda o prompt-escopo ajustado de cada agente. O app LÊ esse arquivo direto
   do GitHub (sempre a versão mais nova) e, quando o fundador aprova um ajuste,
   ESCREVE de volta — usando um token salvo só no aparelho.

   Resultado: você aprova pelo celular → publica → vale em TODOS os aparelhos,
   na hora, sem rebuild. (Independente do gh-pages/subtree: lemos do main direto.)

   Segurança: o token do GitHub fica apenas no localStorage deste dispositivo,
   nunca no código. Use um token com escrita SÓ neste repositório.
   =========================================================================== */

const Sync = (() => {
  const REPO = {
    owner: "filosofiaempreendedora00",
    name: "kronos-central",
    branch: "main",
    path: "www/contexto/overrides.json",
  };
  const LS_TOKEN = "kronos.ghToken";
  const LS_CACHE = "kronos.sync.overrides";
  const LS_SHA = "kronos.sync.sha";

  let overrides = {}; // { agentId: { escopo, resumo, updatedAt } }
  let sha = null;     // sha do arquivo (necessário para sobrescrever no GitHub)
  let readyPromise = null;
  let lastError = "";

  // bootstrap do cache local (vale offline / antes do 1º fetch)
  try { overrides = JSON.parse(localStorage.getItem(LS_CACHE)) || {}; } catch (_) { overrides = {}; }
  try { sha = localStorage.getItem(LS_SHA) || null; } catch (_) {}

  const token = () => { try { return localStorage.getItem(LS_TOKEN) || ""; } catch (_) { return ""; } };
  const configured = () => !!token();
  function setToken(v) {
    try { if (v) localStorage.setItem(LS_TOKEN, v); else localStorage.removeItem(LS_TOKEN); } catch (_) {}
  }

  // base64 seguro p/ UTF-8 (acentos, emoji nos prompts)
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob((b64 || "").replace(/\s/g, "")))); }

  const apiUrl = () => `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/${encodeURI(REPO.path)}`;
  const rawUrl = () => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${REPO.path}`;

  function persistCache() {
    try { localStorage.setItem(LS_CACHE, JSON.stringify(overrides)); } catch (_) {}
    try { if (sha) localStorage.setItem(LS_SHA, sha); else localStorage.removeItem(LS_SHA); } catch (_) {}
  }

  function parseDoc(text) {
    try {
      const j = JSON.parse(text);
      if (j && typeof j === "object" && j.overrides && typeof j.overrides === "object") return j.overrides;
      if (j && typeof j === "object") return j; // tolerância: mapa direto
    } catch (_) {}
    return {};
  }

  async function fetchRemote() {
    const tk = token();
    if (tk) {
      // com token: lê via API (funciona em repo público ou privado e já traz o sha)
      const r = await fetch(apiUrl() + "?ref=" + REPO.branch, {
        headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (r.status === 404) { sha = null; return {}; } // arquivo ainda não existe
      if (!r.ok) throw new Error("GitHub " + r.status);
      const j = await r.json();
      sha = j.sha || null;
      return parseDoc(b64decode(j.content || ""));
    }
    // sem token: tenta leitura pública (só funciona se o repo for público)
    const r = await fetch(rawUrl() + "?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) return {};
    if (!r.ok) throw new Error("raw " + r.status);
    return parseDoc(await r.text());
  }

  function load() {
    readyPromise = (async () => {
      try {
        overrides = await fetchRemote();
        lastError = "";
        persistCache();
      } catch (e) {
        lastError = e.message || String(e);
        // mantém o cache local que já estava carregado
      }
      return overrides;
    })();
    return readyPromise;
  }
  function ready() { return readyPromise || load(); }

  const getEscopo = (id) => { const o = overrides[id]; return o ? o.escopo : null; };
  const has = (id) => !!overrides[id];
  const all = () => overrides;

  async function putDoc(message) {
    const tk = token();
    if (!tk) return { ok: false, error: "Sem token do GitHub. Configure em Configurar." };
    const doc = { version: 1, updatedAt: new Date().toISOString(), overrides };
    const body = { message, content: b64encode(JSON.stringify(doc, null, 2)), branch: REPO.branch };
    if (sha) body.sha = sha;
    let r;
    try {
      r = await fetch(apiUrl(), {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + tk,
          Accept: "application/vnd.github+json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (_) {
      return { ok: false, error: "Falha de conexão com o GitHub." };
    }
    if (r.status === 409) {
      // sha desatualizado (outro aparelho publicou antes): recarrega
      try { await load(); } catch (_) {}
      return { ok: false, error: "Outra alteração chegou antes. Recarreguei — toque em aplicar de novo." };
    }
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: "Token sem permissão de escrita neste repositório (verifique em Configurar)." };
    }
    if (!r.ok) {
      let d = ""; try { d = (await r.json())?.message || ""; } catch (_) {}
      return { ok: false, error: "GitHub " + r.status + (d ? ": " + d : "") };
    }
    try { const j = await r.json(); sha = j.content?.sha || sha; } catch (_) {}
    persistCache();
    return { ok: true };
  }

  /* Publica o escopo ajustado de um agente (cria/atualiza o overrides.json). */
  async function commit(agentId, escopo, resumo) {
    const prev = overrides;
    overrides = { ...overrides, [agentId]: { escopo, resumo: resumo || "", updatedAt: new Date().toISOString() } };
    const res = await putDoc(`IAgo: ajuste no prompt de ${agentId}${resumo ? " — " + resumo : ""}`);
    if (!res.ok) overrides = prev; // desfaz em memória se o GitHub recusou
    persistCache();
    return res;
  }

  /* Remove o ajuste de um agente (volta ao prompt do código), publicando. */
  async function remove(agentId, resumo) {
    if (!(agentId in overrides)) return { ok: true };
    const prev = overrides;
    const copy = { ...overrides }; delete copy[agentId]; overrides = copy;
    const res = await putDoc(`IAgo: reverter prompt de ${agentId}${resumo ? " — " + resumo : ""}`);
    if (!res.ok) overrides = prev;
    persistCache();
    return res;
  }

  const status = () => ({ configured: configured(), count: Object.keys(overrides).length, error: lastError });

  return { load, ready, getEscopo, has, all, commit, remove, setToken, token, configured, status, REPO };
})();
