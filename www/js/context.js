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

  /* System prompt completo de um agente (usado no chat e na Delfos). */
  function systemFor(agent) {
    const doctrine = typeof CONVERSATION_DOCTRINE === "string" ? CONVERSATION_DOCTRINE : "";
    const parts = [
      nucleoForPrompt(agent),
      "---",
      `## ESCOPO — ${agent.name} (${agent.role})\n${agent.escopo || ""}`,
    ];
    if (doctrine) parts.push("---", `## MODO DE CONVERSA\n${doctrine}`);
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

  return { load, ready, systemFor, rawNucleo, rawBriefing, briefingDate };
})();
