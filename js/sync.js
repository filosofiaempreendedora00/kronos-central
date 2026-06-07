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

  const isEnvelope = (j) => j && typeof j === "object" && j.v && j.ct && j.salt && j.iv;
  const overridesOf = (doc) => {
    if (doc && typeof doc === "object" && doc.overrides && typeof doc.overrides === "object") return doc.overrides;
    if (doc && typeof doc === "object") return doc; // tolerância: mapa direto
    return {};
  };

  /* O arquivo no GitHub é um ENVELOPE CIFRADO (mesma chave do cofre) para não
     expor os prompts no repo público. Decifra com Auth; tolera o formato antigo
     em texto puro (migra na próxima publicação). */
  async function decodeDoc(text) {
    let j; try { j = JSON.parse(text); } catch (_) { return {}; }
    if (isEnvelope(j)) {
      if (typeof Auth === "undefined" || !Auth.decryptJSON) throw new Error("cofre indisponível para decifrar");
      return overridesOf(await Auth.decryptJSON(j));
    }
    return overridesOf(j); // legado em texto puro
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
      return await decodeDoc(b64decode(j.content || ""));
    }
    // sem token: leitura pública do envelope (o repo é público); a decifragem
    // ainda exige a senha do cofre deste aparelho — ler não vaza, só destrava local.
    const r = await fetch(rawUrl() + "?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) return {};
    if (!r.ok) throw new Error("raw " + r.status);
    return await decodeDoc(await r.text());
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
    // Cifra com a chave do cofre: o repo é público, o conteúdo NÃO pode vazar.
    let payload;
    try {
      if (typeof Auth === "undefined" || !Auth.encryptJSON) throw new Error("cofre indisponível");
      payload = JSON.stringify(await Auth.encryptJSON(doc), null, 2);
    } catch (e) {
      return { ok: false, error: "Falha ao cifrar o ajuste: " + (e.message || e) };
    }
    const body = { message, content: b64encode(payload), branch: REPO.branch };
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
    // Mensagem genérica de propósito: o conteúdo (e qual agente) fica só no envelope cifrado.
    const res = await putDoc("kronos: ajuste de prompt publicado");
    if (!res.ok) overrides = prev; // desfaz em memória se o GitHub recusou
    persistCache();
    return res;
  }

  /* Remove o ajuste de um agente (volta ao prompt do código), publicando. */
  async function remove(agentId, resumo) {
    if (!(agentId in overrides)) return { ok: true };
    const prev = overrides;
    const copy = { ...overrides }; delete copy[agentId]; overrides = copy;
    const res = await putDoc("kronos: prompt revertido");
    if (!res.ok) overrides = prev;
    persistCache();
    return res;
  }

  const status = () => ({ configured: configured(), count: Object.keys(overrides).length, error: lastError });

  /* -------- Leitura/escrita genérica de um arquivo JSON do repositório ------
     Usado por outros módulos (ex.: backup do histórico de custos em usage.json).
     Mantém o próprio sha por chamada (o chamador passa de volta no write). */
  const apiUrlFor = (path) => `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/${encodeURI(path)}`;
  const rawUrlFor = (path) => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${encodeURI(path)}`;

  async function readJson(path) {
    const tk = token();
    if (tk) {
      const r = await fetch(apiUrlFor(path) + "?ref=" + REPO.branch, {
        headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (r.status === 404) return { json: null, sha: null };
      if (!r.ok) throw new Error("GitHub " + r.status);
      const j = await r.json();
      let parsed = null; try { parsed = JSON.parse(b64decode(j.content || "")); } catch (_) {}
      return { json: parsed, sha: j.sha || null };
    }
    const r = await fetch(rawUrlFor(path) + "?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) return { json: null, sha: null };
    if (!r.ok) throw new Error("raw " + r.status);
    let parsed = null; try { parsed = JSON.parse(await r.text()); } catch (_) {}
    return { json: parsed, sha: null };
  }

  async function writeJson(path, obj, sha, message) {
    const tk = token();
    if (!tk) return { ok: false, error: "Sem token do GitHub." };
    const body = { message: message || "update", content: b64encode(JSON.stringify(obj, null, 2)), branch: REPO.branch };
    if (sha) body.sha = sha;
    let r;
    try {
      r = await fetch(apiUrlFor(path), {
        method: "PUT",
        headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github+json", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (_) { return { ok: false, error: "Falha de conexão com o GitHub." }; }
    if (r.status === 409) return { ok: false, conflict: true, error: "conflito de versão" };
    if (r.status === 401 || r.status === 403) return { ok: false, error: "Token sem permissão de escrita neste repositório." };
    if (!r.ok) { let d = ""; try { d = (await r.json())?.message || ""; } catch (_) {} return { ok: false, error: "GitHub " + r.status + (d ? ": " + d : "") }; }
    let nsha = null; try { nsha = (await r.json())?.content?.sha || null; } catch (_) {}
    return { ok: true, sha: nsha };
  }

  return {
    load, ready, getEscopo, has, all, commit, remove, setToken, token, configured, status, REPO,
    readJson, writeJson,
  };
})();
