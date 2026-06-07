/* ===========================================================================
   KRONOS CENTRAL — Biblioteca de prompts
   Hub que reúne, de forma legível, tudo que molda a inteligência dos agentes:
   • Núcleo central (DNA comum)         • Briefing Vivo (cenário atual)
   • O prompt-escopo de CADA agente (o que muda por agente).
   Renderiza markdown com um conversor mínimo (sem libs).
   =========================================================================== */

const NucleoView = (() => {
  /* ----------------------- Markdown → HTML (mínimo) ---------------------- */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  }
  function mdToHtml(md) {
    const lines = (md || "").split("\n");
    let html = "", inUL = false, inOL = false, inQuote = false;
    const closeUL = () => { if (inUL) { html += "</ul>"; inUL = false; } };
    const closeOL = () => { if (inOL) { html += "</ol>"; inOL = false; } };
    const closeQuote = () => { if (inQuote) { html += "</blockquote>"; inQuote = false; } };
    const closeAll = () => { closeUL(); closeOL(); closeQuote(); };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (/^\s*---\s*$/.test(line)) { closeAll(); html += "<hr>"; continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeAll(); const lvl = Math.min(h[1].length + 1, 6); html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; continue; }
      const q = line.match(/^\s*>\s?(.*)$/);
      if (q) { closeUL(); closeOL(); if (!inQuote) { html += "<blockquote>"; inQuote = true; } html += `<p>${inline(q[1])}</p>`; continue; }
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) { closeUL(); closeQuote(); if (!inOL) { html += "<ol>"; inOL = true; } html += `<li>${inline(ol[1])}</li>`; continue; }
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) { closeOL(); closeQuote(); if (!inUL) { html += "<ul>"; inUL = true; } html += `<li>${inline(li[1])}</li>`; continue; }
      if (line.trim() === "") { closeAll(); continue; }
      closeAll();
      html += `<p>${inline(line)}</p>`;
    }
    closeAll();
    return html;
  }

  /* ------------------------------- Cards -------------------------------- */
  function cardHtml(doc, kicker, title, desc) {
    return `
      <button class="nucleo-card" data-doc="${doc}" type="button">
        <span class="nucleo-card__kicker">${kicker}</span>
        <span class="nucleo-card__title">${title}</span>
        <span class="nucleo-card__desc">${desc}</span>
        <span class="nucleo-card__cta">Abrir <span aria-hidden="true">→</span></span>
      </button>`;
  }

  async function renderHub() {
    const hub = document.getElementById("libHub");
    await Context.ready();
    const date = Context.briefingDate();
    const fundamentos =
      cardHtml("nucleo", "Camada 1 · muda raramente", "Núcleo central",
        "O DNA comum a todo agente da KRONOS — identidade, missão, tom, léxico e comportamento.") +
      cardHtml("briefing", `Camada 2 · você atualiza${date ? ` · ${date}` : ""}`, "Briefing Vivo",
        "O cenário atual da empresa. Todos os agentes leem por cima do Núcleo.");
    const agentes = AGENTS.map((a) =>
      cardHtml(`agent:${a.id}`, `${a.name} · ${a.role}`, a.nome || a.name, a.blurb || "Prompt-escopo do agente.")
    ).join("");
    const pessoas = cardHtml("cartilha", "Guardada por IAra", "Cartilha de Nomes",
      "Quem já opera, quem é a próxima a entrar e o banco de nomes dos próximos agentes.");
    hub.innerHTML =
      `<div class="lib-group"><span class="lib-group__label">Fundamentos</span>${fundamentos}</div>` +
      `<div class="lib-group"><span class="lib-group__label">Agentes · prompt-escopo</span>${agentes}</div>` +
      `<div class="lib-group"><span class="lib-group__label">Pessoas · RH</span>${pessoas}</div>`;
    hub.querySelectorAll(".nucleo-card").forEach((c) =>
      c.addEventListener("click", () => openDoc(c.dataset.doc))
    );
  }

  /* ---------------------- Cartilha de Nomes (render) -------------------- */
  function chip(label, cls, sub) {
    return `<span class="namechip ${cls}">${esc(label)}` +
      (sub ? `<span class="namechip__sub">${esc(sub)}</span>` : "") + `</span>`;
  }
  function renderCartilha() {
    const op = (typeof AGENTS !== "undefined" ? AGENTS : []);
    const r = (typeof NAME_ROSTER !== "undefined") ? NAME_ROSTER : { prontos: { femininos: [], masculinos: [] }, backup: { nomes: [], nota: "" } };
    let h = "";
    h += `<div class="cart-sec"><h3 class="cart-sec__h">Em operação <span class="cart-sec__count">${op.length}</span></h3>` +
      `<div class="namechips">${op.map((a) => chip(a.nome || a.name, "namechip--op", a.name)).join("")}</div></div>`;
    if (r.proxima) {
      h += `<div class="cart-sec"><h3 class="cart-sec__h">Próxima a entrar</h3>` +
        `<div class="namechips">${chip(r.proxima.nome, "namechip--next", r.proxima.cargo)}</div>` +
        `<p class="cart-note">${esc(r.proxima.nota || "")}</p></div>`;
    }
    h += `<div class="cart-sec"><h3 class="cart-sec__h">Banco de nomes · prontos</h3>` +
      `<p class="cart-sub">Femininos</p><div class="namechips">${r.prontos.femininos.map((n) => chip(n, "namechip--bank")).join("")}</div>` +
      `<p class="cart-sub">Masculinos</p><div class="namechips">${r.prontos.masculinos.map((n) => chip(n, "namechip--bank")).join("")}</div></div>`;
    h += `<div class="cart-sec"><h3 class="cart-sec__h">Banco de nomes · backup</h3>` +
      `<div class="namechips">${r.backup.nomes.map((n) => chip(n, "namechip--backup")).join("")}</div>` +
      `<p class="cart-note">${esc(r.backup.nota || "")}</p></div>`;
    document.getElementById("docBody").innerHTML = h;
  }

  /* --------------------------- Leitor de doc ---------------------------- */
  const showOnly = (id) => App.showView(id); // troca de tela centralizada

  async function openHub() {
    showOnly("nucleoView");
    await renderHub();
  }

  async function openDoc(which) {
    if (which === "cartilha") {
      showOnly("nucleoDocView");
      document.getElementById("nucleoDocTitle").textContent = "Cartilha de Nomes";
      document.getElementById("nucleoDocSub").textContent = "guardada por IAra · RH";
      renderCartilha();
      const sc0 = document.querySelector("#nucleoDocView .settings__scroll");
      if (sc0) sc0.scrollTop = 0;
      return;
    }
    let title = "", sub = "", needsContext = false, raw = "";
    if (which === "nucleo") {
      title = "Núcleo central"; sub = "o DNA comum a todos os agentes"; needsContext = true;
    } else if (which === "briefing") {
      title = "Briefing Vivo"; sub = "o cenário atual — edite www/contexto/briefing.md"; needsContext = true;
    } else if (which && which.startsWith("agent:")) {
      const a = AGENTS.find((x) => x.id === which.slice(6));
      if (!a) return;
      title = a.nome || a.name; sub = `${a.name} · prompt-escopo`; raw = a.escopo || "_Sem escopo definido._";
    } else { return; }

    showOnly("nucleoDocView");
    document.getElementById("nucleoDocTitle").textContent = title;
    document.getElementById("nucleoDocSub").textContent = sub;
    const body = document.getElementById("docBody");
    const paint = (text) => { body.innerHTML = mdToHtml(text || "_Material ainda não carregado._"); };

    if (needsContext) {
      paint(which === "nucleo" ? Context.rawNucleo() : Context.rawBriefing());
      await Context.ready();
      paint(which === "nucleo" ? Context.rawNucleo() : Context.rawBriefing());
    } else {
      paint(raw);
    }
    const sc = document.querySelector("#nucleoDocView .settings__scroll");
    if (sc) sc.scrollTop = 0;
  }

  function toDashboard() { App.navGo("dash"); }

  function bind() {
    // abertura é pela sidebar (nav "Contextos"); aqui só os "voltar".
    document.getElementById("nucleoBackBtn").addEventListener("click", toDashboard);
    document.getElementById("nucleoDocBackBtn").addEventListener("click", openHub);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!document.getElementById("nucleoDocView").hidden) openHub();
      else if (!document.getElementById("nucleoView").hidden) toDashboard();
    });
  }

  return { open: openHub, openDoc, bind };
})();
