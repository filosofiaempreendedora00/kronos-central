/* ===========================================================================
   KRONOS CENTRAL — Tela "Núcleo"
   Mostra os dois materiais-base que TODOS os agentes enxergam:
   o Núcleo Central (DNA comum) e o Briefing Vivo (cenário atual).
   Renderiza o markdown de www/contexto/ com um conversor mínimo (sem libs).
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
    let html = "", inList = false, inQuote = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    const closeQuote = () => { if (inQuote) { html += "</blockquote>"; inQuote = false; } };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (/^\s*---\s*$/.test(line)) { closeList(); closeQuote(); html += "<hr>"; continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeList(); closeQuote(); const lvl = Math.min(h[1].length + 1, 6); html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; continue; }
      const q = line.match(/^\s*>\s?(.*)$/);
      if (q) { closeList(); if (!inQuote) { html += "<blockquote>"; inQuote = true; } html += `<p>${inline(q[1])}</p>`; continue; }
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) { closeQuote(); if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
      if (line.trim() === "") { closeList(); closeQuote(); continue; }
      closeList(); closeQuote();
      html += `<p>${inline(line)}</p>`;
    }
    closeList(); closeQuote();
    return html;
  }

  const DOCS = {
    nucleo: {
      title: "Núcleo Central",
      sub: "o DNA comum a todos os agentes",
      raw: () => Context.rawNucleo(),
    },
    briefing: {
      title: "Briefing Vivo",
      sub: "o cenário atual — edite www/contexto/briefing.md",
      raw: () => Context.rawBriefing(),
    },
  };

  const ALL_VIEWS = ["dashboardView", "chatView", "delfosView", "costsView", "settingsView", "nucleoView", "nucleoDocView"];
  function showOnly(id) {
    ALL_VIEWS.forEach((v) => { const e = document.getElementById(v); if (e) e.hidden = (v !== id); });
    window.scrollTo(0, 0); // evita o header (botão voltar) ficar fora da tela
  }

  /* ------------------------------- Hub ---------------------------------- */
  async function openHub() {
    showOnly("nucleoView");
    await Context.ready();
    const d = Context.briefingDate();
    const meta = document.getElementById("briefingMeta");
    if (meta) meta.textContent = d ? `· atualizado em ${d}` : "";
  }

  /* --------------------------- Leitor de doc ---------------------------- */
  async function openDoc(which) {
    const doc = DOCS[which];
    if (!doc) return;
    showOnly("nucleoDocView");
    document.getElementById("nucleoDocTitle").textContent = doc.title;
    document.getElementById("nucleoDocSub").textContent = doc.sub;
    const body = document.getElementById("docBody");
    const paint = () => { body.innerHTML = mdToHtml(doc.raw() || "_Material ainda não carregado._"); };
    paint();
    await Context.ready();
    paint();
    const sc = document.querySelector("#nucleoDocView .settings__scroll");
    if (sc) sc.scrollTop = 0;
  }

  function toDashboard() { showOnly("dashboardView"); }

  function bind() {
    document.getElementById("nucleoBtn").addEventListener("click", openHub);
    document.getElementById("nucleoBackBtn").addEventListener("click", toDashboard);
    document.getElementById("nucleoDocBackBtn").addEventListener("click", openHub);
    document.querySelectorAll(".nucleo-card").forEach((c) =>
      c.addEventListener("click", () => openDoc(c.dataset.doc))
    );
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!document.getElementById("nucleoDocView").hidden) openHub();
      else if (!document.getElementById("nucleoView").hidden) toDashboard();
    });
  }

  return { open: openHub, openDoc, bind };
})();
