/* ===========================================================================
   KRONOS CENTRAL — Contexto compartilhado (Núcleo + Briefing Vivo)

   Carrega os dois materiais-base de www/contexto/ e monta o system prompt
   de TODOS os agentes em camadas:
     1. NÚCLEO     — DNA comum (identidade, missão, tom, léxico, comportamento)
     2. ESCOPO     — o que muda por agente (definido em agents.js)
     3. MODO DE CONVERSA — como conversar (altura/contexto), de agents.js
     4. BRIEFING VIVO — os fatos atuais da empresa (você edita; todos leem)

   Edite www/contexto/briefing.md quando a realidade mudar: no próximo deploy,
   todos os agentes passam a enxergar o novo cenário, sem mexer em prompt algum.
   =========================================================================== */

const Context = (() => {
  // Núcleo + Briefing-base vêm do cofre criptografado (semeados no login).
  let nucleoRaw = "";
  let briefingRaw = "";
  let readyPromise = null;

  /* Recebe núcleo e briefing-base do cofre (chamado por applyKronosData). */
  function seedBase(nucleo, briefing) {
    nucleoRaw = nucleo || "";
    briefingRaw = briefing || "";
  }

  /* ----------------------- Briefing Vivo — versões ----------------------
     O Briefing pode ser editado DENTRO do app (pelo fundador, ou pelo IAgo via
     proposta aprovada). Cada salvamento cria uma VERSÃO carimbada; a mais nova é
     a vigente que TODOS os agentes leem. Guardado localmente e publicado no
     GitHub (briefing-live.json) quando há token — fica igual em todo aparelho. */
  const LS_BLIVE = "kronos.briefing.live";
  const BLIVE_PATH = "www/contexto/briefing-live.json";
  let briefingVers = [];
  try { const c = JSON.parse(localStorage.getItem(LS_BLIVE)); if (c && Array.isArray(c.versions)) briefingVers = c.versions; } catch (_) {}

  function persistBlive() {
    const arr = briefingVers.slice();
    for (;;) {
      try { localStorage.setItem(LS_BLIVE, JSON.stringify({ versions: arr })); briefingVers = arr; return; }
      catch (_) { if (arr.length <= 1) return; arr.pop(); } // descarta versões antigas se a cota encher
    }
  }
  function mergeBriefingVers(a, b) {
    const byTs = new Map();
    (Array.isArray(a) ? a : []).forEach((v) => { if (v && v.ts) byTs.set(v.ts, v); });
    (Array.isArray(b) ? b : []).forEach((v) => { if (v && v.ts && !byTs.has(v.ts)) byTs.set(v.ts, v); });
    return [...byTs.values()].sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 60);
  }
  /* Texto vigente do Briefing: a última versão editada OU a base do deploy. */
  function effectiveBriefing() {
    return briefingVers.length ? briefingVers[0].content : briefingRaw;
  }
  function briefingVersions() {
    // sempre devolve algo: se nunca foi editado, mostra a base do deploy como v0.
    if (briefingVers.length) return briefingVers.map((v) => ({ ...v, base: false }));
    return [{ content: briefingRaw, ts: null, base: true }];
  }
  const briefingSynced = () => typeof Sync !== "undefined" && Sync.configured();

  /* Salva uma nova versão do Briefing (vira a vigente na hora p/ todos os agentes). */
  async function saveBriefing(content) {
    const text = String(content == null ? "" : content);
    if (!text.trim()) return { ok: false, error: "O briefing não pode ficar vazio." };
    if (effectiveBriefing().trim() === text.trim()) return { ok: false, error: "Nenhuma mudança em relação ao texto atual." };
    briefingVers = [{ content: text, ts: Date.now() }, ...briefingVers].slice(0, 60);
    persistBlive();
    if (!briefingSynced()) return { ok: true, scope: "local" };
    try {
      const res = await Sync.readJson(BLIVE_PATH);
      const sha = res.sha || null;
      const remoteVers = res.json && Array.isArray(res.json.versions) ? res.json.versions : [];
      briefingVers = mergeBriefingVers(briefingVers, remoteVers);
      persistBlive();
      const doc = { type: "kronos.briefing", version: 1, updatedAt: new Date().toISOString(), versions: briefingVers };
      const w = await Sync.writeJson(BLIVE_PATH, doc, sha, "briefing: nova versão");
      return w.ok ? { ok: true, scope: "remote" } : { ok: true, scope: "local", warn: w.error };
    } catch (e) { return { ok: true, scope: "local", warn: e.message || String(e) }; }
  }
  /* Torna uma versão antiga a vigente (cria uma nova versão com aquele conteúdo). */
  async function restoreBriefingVersion(ts) {
    const v = briefingVers.find((x) => x.ts === ts) || (ts == null ? { content: briefingRaw } : null);
    if (!v) return { ok: false, error: "Versão não encontrada." };
    return saveBriefing(v.content);
  }
  /* Edição do Briefing proposta pelo IAgo (append/replace) → vira nova versão. */
  async function applyBriefingEdit(mode, find, content) {
    const r = computeNext(effectiveBriefing(), mode, find, content);
    if (r.error) return { ok: false, error: r.error };
    return saveBriefing(r.next);
  }

  const sameLocalDay = (a, b) => {
    const x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  };
  /* Salva como a versão de HOJE: se a vigente já é de hoje, atualiza no lugar;
     senão cria uma nova versão datada de hoje (que vira vigente). Resultado:
     UMA entrada por dia no histórico, e a de hoje sempre vigente p/ os agentes. */
  async function saveTodayBriefing(content) {
    const text = String(content == null ? "" : content);
    if (!text.trim()) return { ok: false, error: "O briefing não pode ficar vazio." };
    const now = Date.now();
    const top = briefingVers[0];
    if (top && top.ts && sameLocalDay(top.ts, now)) {
      briefingVers = [{ content: text, ts: now }, ...briefingVers.slice(1)].slice(0, 60); // atualiza hoje
    } else {
      briefingVers = [{ content: text, ts: now }, ...briefingVers].slice(0, 60); // novo dia
    }
    persistBlive();
    if (!briefingSynced()) return { ok: true, scope: "local" };
    try {
      const res = await Sync.readJson(BLIVE_PATH);
      const sha = res.sha || null;
      const remoteVers = res.json && Array.isArray(res.json.versions) ? res.json.versions : [];
      briefingVers = mergeBriefingVers(briefingVers, remoteVers);
      persistBlive();
      const doc = { type: "kronos.briefing", version: 1, updatedAt: new Date().toISOString(), versions: briefingVers };
      const w = await Sync.writeJson(BLIVE_PATH, doc, sha, "briefing: versão do dia");
      return w.ok ? { ok: true, scope: "remote" } : { ok: true, scope: "local", warn: w.error };
    } catch (e) { return { ok: true, scope: "local", warn: e.message || String(e) }; }
  }
  /* Duplica a vigente como a versão de hoje (ponto de partida p/ editar o dia). */
  async function duplicateBriefingAsToday() {
    return saveTodayBriefing(effectiveBriefing());
  }
  /* A versão vigente já é de hoje? (p/ a UI decidir "editar hoje" vs "novo dia") */
  function vigenteIsToday() {
    const top = briefingVers[0];
    return !!(top && top.ts && sameLocalDay(top.ts, Date.now()));
  }

  function load() {
    readyPromise = (async () => {
      // Núcleo/Briefing já foram semeados (seedBase) a partir do cofre no login.
      // Carrega, em paralelo, os ajustes de prompt publicados (cross-device).
      const sync = (typeof Sync !== "undefined") ? Sync.ready().catch(() => {}) : Promise.resolve();
      // E o Briefing Vivo editado (versões publicadas) — vira a base para todos.
      const blive = (async () => {
        if (typeof Sync === "undefined") return;
        try {
          const res = await Sync.readJson(BLIVE_PATH);
          if (res && res.json && Array.isArray(res.json.versions) && res.json.versions.length) {
            briefingVers = mergeBriefingVers(res.json.versions, briefingVers);
            persistBlive();
          }
        } catch (_) {}
      })();
      await Promise.all([sync, blive]);
    })();
    return readyPromise;
  }

  function ready() {
    return readyPromise || load();
  }

  const stripQuotes = (t) =>
    t.split("\n").filter((l) => !l.trim().startsWith(">")).join("\n");
  const collapse = (t) => t.replace(/\n{3,}/g, "\n\n").trim();

  /* Núcleo pronto p/ prompt: tira as notas de autoria (>) e o bloco ESCOPO
     (template), e preenche o nome/função do agente. */
  function nucleoForPrompt(agent) {
    let t = nucleoRaw;
    if (!t) return "";
    const esc = t.indexOf("## ESCOPO");
    if (esc !== -1) t = t.slice(0, esc);
    t = stripQuotes(t)
      .replace("# TEMPLATE-MÃE KRONOS — NÚCLEO", "# NÚCLEO KRONOS")
      .replaceAll("{NOME_DO_AGENTE}", agent.name)
      .replaceAll("{FUNÇÃO}", agent.role);
    return collapse(t);
  }

  function briefingForPrompt() {
    const b = effectiveBriefing();
    return b ? collapse(stripQuotes(b)) : "";
  }

  /* Estado atual da Cartilha de Nomes — injetado no contexto da IAra (RH),
     gerado a partir de AGENTS (em operação) + NAME_ROSTER (reservas). */
  function cartilhaBlock() {
    if (typeof NAME_ROSTER === "undefined") return "";
    const op = (typeof AGENTS !== "undefined" ? AGENTS : [])
      .map((a) => `${a.nome || a.name} (${a.name})`).join(", ");
    const r = NAME_ROSTER;
    const prox = r.proxima ? `${r.proxima.nome} (${r.proxima.cargo} — ${r.proxima.nota})` : "—";
    return [
      "## CARTILHA DE NOMES — estado atual (você é a guardiã deste registro)",
      `EM OPERAÇÃO: ${op}.`,
      `PRÓXIMA A ENTRAR: ${prox}.`,
      `BANCO DE NOMES — prontos: femininos — ${r.prontos.femininos.join(", ")}; masculinos — ${r.prontos.masculinos.join(", ")}.`,
      `BANCO DE NOMES — backup (${r.backup.nota}): ${r.backup.nomes.join(", ")}.`,
      'Convenção: "IA" sempre maiúsculo no nome. Ao promover um nome reserva a agente ativo, ele sai do Banco e entra em "Em operação" com o cargo.',
      r.excecao ? `EXCEÇÃO REGISTRADA: ${r.excecao}` : "",
    ].filter(Boolean).join("\n");
  }

  /* ----------------------- Escopo efetivo + edições --------------------- */
  /* O escopo de um agente pode ter um override (aplicado pelo fundador via
     proposta do IAgo). A versão efetiva = override (se houver) OU o do código. */
  const escopoKey = (id) => "kronos.escopo." + id;
  /* Prioridade da versão efetiva do escopo:
       1. ajuste PUBLICADO (Sync/GitHub) — vale em todos os aparelhos
       2. ajuste só-deste-aparelho (localStorage) — usado quando não há token
       3. o escopo do código (agents.js) */
  function effectiveEscopo(agent) {
    if (!agent) return "";
    if (typeof Sync !== "undefined") { const r = Sync.getEscopo(agent.id); if (r != null) return r; }
    try { const o = localStorage.getItem(escopoKey(agent.id)); if (o != null) return o; } catch (_) {}
    return agent.escopo || "";
  }
  function isEscopoOverridden(id) {
    if (typeof Sync !== "undefined" && Sync.has(id)) return true;
    try { return localStorage.getItem(escopoKey(id)) != null; } catch (_) { return false; }
  }
  /* "ajustado" publicado (cross-device) vs só neste aparelho — p/ rotular a UI. */
  function isEscopoPublished(id) {
    return typeof Sync !== "undefined" && Sync.has(id);
  }

  /* Calcula o texto resultante de uma edição (append/replace). {next} | {error}. */
  function computeNext(base, mode, find, content) {
    if (mode === "append") {
      if (!content || !content.trim()) return { error: "Nada para adicionar." };
      return { next: base.trimEnd() + "\n\n" + content.trim() };
    }
    if (mode === "replace") {
      if (!find || !base.includes(find)) {
        return { error: "O trecho a substituir não foi encontrado no prompt atual (precisa ser uma cópia exata)." };
      }
      return { next: base.replace(find, content || "") };
    }
    return { error: "Operação inválida: " + mode };
  }

  /* Aplica uma edição APENAS neste aparelho (fallback sem token). {ok, error}. */
  function applyEscopoEdit(agentId, mode, find, content) {
    const agent = (typeof AGENTS !== "undefined" ? AGENTS : []).find((a) => a.id === agentId);
    if (!agent) return { ok: false, error: "Agente não encontrado: " + agentId };
    const r = computeNext(effectiveEscopo(agent), mode, find, content);
    if (r.error) return { ok: false, error: r.error };
    try {
      localStorage.setItem(escopoKey(agentId), r.next);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Falha ao salvar: " + e.message };
    }
  }

  /* Aplica e PUBLICA (GitHub) — vale em todos os aparelhos. Promise<{ok,error}>. */
  async function applyEscopoPermanent(agentId, mode, find, content, resumo) {
    if (typeof Sync === "undefined") return { ok: false, error: "Sincronização indisponível." };
    const agent = (typeof AGENTS !== "undefined" ? AGENTS : []).find((a) => a.id === agentId);
    if (!agent) return { ok: false, error: "Agente não encontrado: " + agentId };
    const r = computeNext(effectiveEscopo(agent), mode, find, content);
    if (r.error) return { ok: false, error: r.error };
    const res = await Sync.commit(agentId, r.next, resumo);
    // publicado vira a fonte da verdade: remove o ajuste só-local pra não sombrear.
    if (res.ok) { try { localStorage.removeItem(escopoKey(agentId)); } catch (_) {} }
    return res;
  }

  /* Reverte só neste aparelho. */
  function revertEscopo(id) {
    try { localStorage.removeItem(escopoKey(id)); } catch (_) {}
  }
  /* Reverte e PUBLICA a reversão (some em todos os aparelhos). Promise<{ok,error}>. */
  async function revertEscopoPermanent(id, resumo) {
    let res = { ok: true };
    if (typeof Sync !== "undefined" && Sync.has(id)) res = await Sync.remove(id, resumo);
    if (res.ok) { try { localStorage.removeItem(escopoKey(id)); } catch (_) {} }
    return res;
  }

  /* Biblioteca de prompts (acesso de leitura) — injetada no contexto do IAgo,
     pra que as propostas dele sejam 100% baseadas no texto REAL e atual. */
  function promptsLibraryBlock() {
    const list = (typeof AGENTS !== "undefined" ? AGENTS : []).map((a) =>
      `### ${a.nome || a.name} — ${a.name} (${a.role}) · id: ${a.id}\n${effectiveEscopo(a)}`
    ).join("\n\n");
    return [
      "## BIBLIOTECA DE PROMPTS — acesso de leitura (texto atual de cada agente)",
      "Use estes textos EXATOS ao propor uma alteração (o campo find no replace precisa ser cópia literal).",
      list,
    ].join("\n\n");
  }

  /* System prompt completo de um agente (usado no chat e na Delfos). */
  function systemFor(agent) {
    const doctrine = typeof CONVERSATION_DOCTRINE === "string" ? CONVERSATION_DOCTRINE : "";
    const parts = [
      nucleoForPrompt(agent),
      "---",
      `## ESCOPO — ${agent.name} (${agent.role})\n${effectiveEscopo(agent)}`,
    ];
    if (doctrine) parts.push("---", `## MODO DE CONVERSA\n${doctrine}`);
    if (agent.id === "head-rh") { const c = cartilhaBlock(); if (c) parts.push("---", c); }
    if (agent.id === "prompt-engineer") parts.push("---", promptsLibraryBlock());
    // conhecimento fixo do agente (ex.: benchmarking de mercado do TIAgo) — referência
    // estável, vem antes do Briefing Vivo (que é o cenário que muda toda semana).
    if (agent.knowledge && String(agent.knowledge).trim()) parts.push("---", String(agent.knowledge).trim());
    const brief = briefingForPrompt();
    if (brief) parts.push("---", brief);
    return parts.join("\n\n");
  }

  /* Cru, para a tela "Núcleo" (visualização). */
  function rawNucleo() { return nucleoRaw; }
  function rawBriefing() { return effectiveBriefing(); } // mostra o vigente (editado ou base)
  function briefingDate() {
    if (briefingVers.length && briefingVers[0].ts) {
      const d = new Date(briefingVers[0].ts);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    const m = effectiveBriefing().match(/Última atualização:\s*\**\s*([0-9/.-]+)/i);
    return m ? m[1] : "";
  }

  /* Resumo "O que move o ponteiro" — extraído do bloco PONTEIRO do Briefing. */
  function ponteiro() {
    const t = effectiveBriefing() || "";
    const sec = t.match(/##\s*PONTEIRO[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
    const block = sec ? sec[1] : t;
    const grab = (key) => {
      const m = block.match(new RegExp("^[\\s>*-]*" + key + "\\s*[:：]\\s*(.+)$", "im"));
      return m ? m[1].trim() : "";
    };
    return {
      hoje: grab("HOJE"),
      medio: grab("M[ÉE]DIO(?:\\s*PRAZO)?"),
      longo: grab("LONGO(?:\\s*PRAZO)?"),
    };
  }

  return {
    load, ready, seedBase, systemFor, rawNucleo, rawBriefing, briefingDate, ponteiro,
    effectiveEscopo, isEscopoOverridden, isEscopoPublished,
    applyEscopoEdit, applyEscopoPermanent, revertEscopo, revertEscopoPermanent,
    effectiveBriefing, briefingVersions, saveBriefing, restoreBriefingVersion, briefingSynced, applyBriefingEdit,
    saveTodayBriefing, duplicateBriefingAsToday, vigenteIsToday,
  };
})();
