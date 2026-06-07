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
  const LS_N = "kronos.ctx.nucleo";
  const LS_B = "kronos.ctx.briefing";

  let nucleoRaw = localStorage.getItem(LS_N) || "";
  let briefingRaw = localStorage.getItem(LS_B) || "";
  let readyPromise = null;

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return r.text();
  }

  function load() {
    readyPromise = (async () => {
      try {
        const [n, b] = await Promise.all([
          fetchText("contexto/nucleo.md"),
          fetchText("contexto/briefing.md"),
        ]);
        nucleoRaw = n;
        briefingRaw = b;
        localStorage.setItem(LS_N, n);
        localStorage.setItem(LS_B, b);
      } catch (_) {
        // Offline / falha: usa o que estiver no cache do localStorage.
        nucleoRaw = localStorage.getItem(LS_N) || nucleoRaw;
        briefingRaw = localStorage.getItem(LS_B) || briefingRaw;
      }
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
    return briefingRaw ? collapse(stripQuotes(briefingRaw)) : "";
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
    ].join("\n");
  }

  /* ----------------------- Escopo efetivo + edições --------------------- */
  /* O escopo de um agente pode ter um override (aplicado pelo fundador via
     proposta do IAgo). A versão efetiva = override (se houver) OU o do código. */
  const escopoKey = (id) => "kronos.escopo." + id;
  function effectiveEscopo(agent) {
    if (!agent) return "";
    try { const o = localStorage.getItem(escopoKey(agent.id)); if (o != null) return o; } catch (_) {}
    return agent.escopo || "";
  }
  function isEscopoOverridden(id) {
    try { return localStorage.getItem(escopoKey(id)) != null; } catch (_) { return false; }
  }
  /* Aplica uma edição proposta (append ou replace). Retorna {ok, error}. */
  function applyEscopoEdit(agentId, mode, find, content) {
    const agent = (typeof AGENTS !== "undefined" ? AGENTS : []).find((a) => a.id === agentId);
    if (!agent) return { ok: false, error: "Agente não encontrado: " + agentId };
    const base = effectiveEscopo(agent);
    let next;
    if (mode === "append") {
      if (!content || !content.trim()) return { ok: false, error: "Nada para adicionar." };
      next = base.trimEnd() + "\n\n" + content.trim();
    } else if (mode === "replace") {
      if (!find || !base.includes(find)) {
        return { ok: false, error: "O trecho a substituir não foi encontrado no prompt atual (precisa ser uma cópia exata)." };
      }
      next = base.replace(find, content || "");
    } else {
      return { ok: false, error: "Operação inválida: " + mode };
    }
    try {
      localStorage.setItem(escopoKey(agentId), next);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Falha ao salvar: " + e.message };
    }
  }
  function revertEscopo(id) {
    try { localStorage.removeItem(escopoKey(id)); } catch (_) {}
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
    const brief = briefingForPrompt();
    if (brief) parts.push("---", brief);
    return parts.join("\n\n");
  }

  /* Cru, para a tela "Núcleo" (visualização). */
  function rawNucleo() { return nucleoRaw; }
  function rawBriefing() { return briefingRaw; }
  function briefingDate() {
    const m = briefingRaw.match(/Última atualização:\s*\**\s*([0-9/.-]+)/i);
    return m ? m[1] : "";
  }

  return {
    load, ready, systemFor, rawNucleo, rawBriefing, briefingDate,
    effectiveEscopo, isEscopoOverridden, applyEscopoEdit, revertEscopo,
  };
})();
