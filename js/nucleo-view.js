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

  /* ------------------------------ Render -------------------------------- */
  function render() {
    document.getElementById("nucleoDoc").innerHTML =
      mdToHtml(Context.rawNucleo() || "_Material ainda não carregado._");
    document.getElementById("briefingDoc").innerHTML =
      mdToHtml(Context.rawBriefing() || "_Material ainda não carregado._");
    const d = Context.briefingDate();
    const meta = document.getElementById("briefingMeta");
    if (meta) meta.textContent = d ? `atualizado em ${d}` : "";
  }

  /* ------------------------------ Abrir --------------------------------- */
  async function open() {
    ["dashboardView", "chatView", "delfosView", "costsView", "settingsView"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.hidden = true;
    });
    document.getElementById("nucleoView").hidden = false;
    render();
    await Context.ready(); // se ainda não carregou, busca e re-renderiza
    render();
  }

  function close() {
    document.getElementById("nucleoView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
  }

  function bind() {
    document.getElementById("nucleoBtn").addEventListener("click", open);
    document.getElementById("nucleoBackBtn").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("nucleoView").hidden) close();
    });
  }

  return { open, close, bind };
})();
