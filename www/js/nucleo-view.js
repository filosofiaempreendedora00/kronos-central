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

  /* --------- Camada de VIDA dos cards especiais (anim. via CSS) ---------- */
  const BFLY = `<svg class="bfly__svg" viewBox="-56 -42 112 88" aria-hidden="true">
    <line class="bfly__body" x1="0" y1="-16" x2="0" y2="24"/>
    <path class="bfly__ant" d="M0 -16 C -6 -28 -12 -30 -17 -28"/>
    <path class="bfly__ant" d="M0 -16 C 6 -28 12 -30 17 -28"/>
    <g class="bfly__wings">
      <path d="M0 0 C -34 -30 -52 -22 -46 6 C -42 24 -18 18 0 0 Z"/>
      <path d="M0 0 C 34 -30 52 -22 46 6 C 42 24 18 18 0 0 Z"/>
      <path d="M0 0 C -24 6 -34 22 -22 36 C -8 34 -2 16 0 0 Z"/>
      <path d="M0 0 C 24 6 34 22 22 36 C 8 34 2 16 0 0 Z"/>
    </g>
  </svg>`;
  const GRASS = `<svg class="grass__svg" viewBox="0 0 30 50" aria-hidden="true">
    <path d="M15 50 C 12 34 9 22 3 10"/>
    <path d="M15 50 C 14 32 15 20 16 5"/>
    <path d="M15 50 C 18 36 22 25 27 14"/>
    <path d="M15 50 C 13 38 11 30 8 22"/>
    <path d="M15 50 C 16 38 19 30 23 24"/>
  </svg>`;
  const FLOWER = `<svg class="flower__svg" viewBox="0 0 26 56" aria-hidden="true">
    <path class="flower__stem" d="M13 56 C 12 40 13 30 13 18"/>
    <path class="flower__leaf" d="M13 38 C 6 36 3 30 4 24 C 11 26 15 32 13 38 Z"/>
    <g class="flower__bloom" transform="translate(13 13)">
      <ellipse class="flower__petal" cx="0" cy="-5.5" rx="2.3" ry="4.2"/>
      <ellipse class="flower__petal" cx="5.2" cy="-1.7" rx="2.3" ry="4.2" transform="rotate(72)"/>
      <ellipse class="flower__petal" cx="3.2" cy="4.5" rx="2.3" ry="4.2" transform="rotate(144)"/>
      <ellipse class="flower__petal" cx="-3.2" cy="4.5" rx="2.3" ry="4.2" transform="rotate(216)"/>
      <ellipse class="flower__petal" cx="-5.2" cy="-1.7" rx="2.3" ry="4.2" transform="rotate(288)"/>
      <circle class="flower__center" r="2"/>
    </g>
  </svg>`;
  const FLORA = [["grass", 7, 5.6, 0], ["flower", 24, 7, -1.4], ["grass", 45, 6.2, -2.6], ["grass", 67, 5.9, -0.7], ["flower", 85, 6.8, -3.2]];
  const POLLEN = [[14,80,0,11,3],[30,90,3,13,2],[48,74,6,10,3.5],[64,86,1.5,12,2.5],[78,68,4.5,14,3],[88,82,8,11,2],[22,62,9,15,2.5]];
  const EMBERS = [[24,84,0,9,2.5],[40,92,3,11,2],[58,80,6,8,3],[72,88,1.5,10,2],[86,76,4,12,2.5]];
  const dots = (cls, arr) => arr.map(([l, t, d, u, s]) =>
    `<span class="${cls}" style="left:${l}%;top:${t}%;width:${s}px;height:${s}px;--d:${d}s;--u:${u}s"></span>`).join("");
  const flora = () => FLORA.map(([k, l, sw, sd]) =>
    `<span class="flora flora--${k}" style="left:${l}%;--sw:${sw}s;--sd:${sd}s">${k === "grass" ? GRASS : FLOWER}</span>`).join("");
  function decorHtml(variant) {
    if (variant === "living") {
      return `<span class="card-decor" aria-hidden="true">
        <span class="cd-sun"></span>
        ${flora()}
        <span class="bfly"><span class="bfly__bob">${BFLY}</span></span>
        ${dots("pollen", POLLEN)}
      </span>`;
    }
    if (variant === "core") {
      return `<span class="card-decor" aria-hidden="true"><span class="cd-glow"></span>${dots("ember", EMBERS)}</span>`;
    }
    return "";
  }

  /* ------------------------------- Cards -------------------------------- */
  function cardHtml(doc, kicker, title, desc, face, variant) {
    const cls = "nucleo-card" + (face ? " nucleo-card--agent" : "") + (variant ? " nucleo-card--" + variant : "");
    return `
      <button class="${cls}" data-doc="${doc}" type="button">
        ${decorHtml(variant)}
        ${face ? `<span class="nucleo-card__face">${face}</span>` : ""}
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
        "O DNA comum a todo agente da KRONOS — identidade, missão, tom, léxico e comportamento.", null, "core") +
      cardHtml("briefing", `Camada 2 · você atualiza${date ? ` · ${date}` : ""}`, "Briefing Vivo",
        "O cenário atual da empresa. Todos os agentes leem por cima do Núcleo.", null, "living");
    const agentes = AGENTS.map((a) => {
      const adj = Context.isEscopoPublished(a.id)
        ? ' <span class="lib-badge">publicado</span>'
        : (Context.isEscopoOverridden(a.id) ? ' <span class="lib-badge">ajustado (só aqui)</span>' : "");
      return cardHtml(`agent:${a.id}`, `${a.name} · ${a.role}${adj}`, a.nome || a.name, a.blurb || "Prompt-escopo do agente.", agentAvatarHTML(a));
    }).join("");
    hub.innerHTML =
      `<div class="lib-group lib-group--fund"><span class="lib-group__label">Fundamentos</span>${fundamentos}</div>` +
      `<div class="lib-group"><span class="lib-group__label">Agentes · prompt-escopo</span>${agentes}</div>`;
    hub.querySelectorAll(".nucleo-card").forEach((c) =>
      c.addEventListener("click", () => openDoc(c.dataset.doc))
    );
  }

  /* ---------------------- Cartilha de Nomes (render) -------------------- */
  function chip(label, cls, sub) {
    return `<span class="namechip ${cls}">${esc(label)}` +
      (sub ? `<span class="namechip__sub">${esc(sub)}</span>` : "") + `</span>`;
  }
  function cartilhaHTML() {
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
    return h;
  }

  /* --------------------------- Leitor de doc ---------------------------- */
  const showOnly = (id) => App.showView(id); // troca de tela centralizada

  async function openHub() {
    showOnly("nucleoView");
    await renderHub();
  }

  const scrollDocTop = () => { const sc = document.querySelector("#nucleoDocView .settings__scroll"); if (sc) sc.scrollTop = 0; };

  async function openDoc(which) {
    if (which === "cartilha") {
      showOnly("nucleoDocView");
      document.getElementById("nucleoDocTitle").textContent = "Cartilha de Nomes";
      document.getElementById("nucleoDocSub").textContent = "guardada por IAra · CAO";
      document.getElementById("docBody").innerHTML = cartilhaHTML();
      scrollDocTop();
      return;
    }
    if (which && which.startsWith("agent:")) {
      const a = AGENTS.find((x) => x.id === which.slice(6));
      if (!a) return;
      showOnly("nucleoDocView");
      document.getElementById("nucleoDocTitle").textContent = a.nome || a.name;
      document.getElementById("nucleoDocSub").textContent = `${a.name} · prompt-escopo`;
      renderAgentDoc(a);
      scrollDocTop();
      return;
    }
    if (which === "briefing") {
      showOnly("nucleoDocView");
      document.getElementById("nucleoDocTitle").textContent = "Briefing Vivo";
      document.getElementById("nucleoDocSub").textContent = "o cenário atual · você edita, ou pede ao IAgo";
      document.getElementById("docBody").innerHTML = `<p class="cost-note">carregando…</p>`;
      await Context.ready();
      renderBriefingDoc();
      scrollDocTop();
      return;
    }
    if (which === "nucleo") {
      showOnly("nucleoDocView");
      document.getElementById("nucleoDocTitle").textContent = "Núcleo central";
      document.getElementById("nucleoDocSub").textContent = "o DNA comum a todos os agentes";
      const body = document.getElementById("docBody");
      const paint = () => { body.innerHTML = mdToHtml(Context.rawNucleo() || "_Material ainda não carregado._"); };
      paint(); await Context.ready(); paint();
      scrollDocTop();
      return;
    }
  }

  /* --------------------------- Briefing Vivo: doc + editor + versões -------- */
  function fmtVer(ts) {
    if (!ts) return "base (deploy)";
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function renderBriefingDoc() {
    const body = document.getElementById("docBody");
    const synced = Context.briefingSynced();
    const vers = Context.briefingVersions();
    const note = synced
      ? "As edições são publicadas (GitHub) e passam a valer para todos os agentes, em todos os aparelhos, na hora."
      : "Sem token do GitHub: a edição vale já neste aparelho. Configure o token em Configurar para publicar em todos.";
    body.innerHTML = `
      <div class="briefing-doc">
        <div class="briefing-doc__bar">
          <button class="btn-ghost btn-ghost--sm" id="briefEditBtn" type="button">Editar</button>
          <button class="btn-ghost btn-ghost--sm" id="briefVersBtn" type="button">Versões (${vers.length})</button>
        </div>
        <p class="cost-note">${note} Entre os agentes, só o IAgo altera o Briefing (você aprova) — ou você edita aqui.</p>
        <div id="briefMain" class="doc">${mdToHtml(Context.effectiveBriefing() || "_Material ainda não carregado._")}</div>
      </div>`;
    document.getElementById("briefEditBtn").addEventListener("click", openBriefEditor);
    document.getElementById("briefVersBtn").addEventListener("click", openBriefVersions);
  }
  function openBriefEditor() {
    const main = document.getElementById("briefMain");
    main.innerHTML = `
      <textarea class="brief-editor" id="briefTextarea" spellcheck="false"></textarea>
      <div class="brief-editor__actions">
        <button class="btn-solid" id="briefSaveBtn" type="button">Salvar nova versão</button>
        <button class="btn-ghost btn-ghost--sm" id="briefCancelBtn" type="button">Cancelar</button>
        <span class="settings__status" id="briefStatus"></span>
      </div>`;
    const ta = document.getElementById("briefTextarea");
    ta.value = Context.effectiveBriefing();
    document.getElementById("briefSaveBtn").addEventListener("click", async () => {
      const st = document.getElementById("briefStatus");
      st.textContent = "salvando…"; st.classList.remove("settings__status--ok");
      const r = await Context.saveBriefing(ta.value);
      if (!r.ok) { st.textContent = "⚠ " + r.error; return; }
      if (window.App && App.refreshBriefing) App.refreshBriefing();
      renderBriefingDoc();
    });
    document.getElementById("briefCancelBtn").addEventListener("click", renderBriefingDoc);
    setTimeout(() => ta.focus(), 30);
  }
  function openBriefVersions() {
    const main = document.getElementById("briefMain");
    const vers = Context.briefingVersions();
    main.innerHTML = `<div class="brief-vers">` + vers.map((v, i) => `
      <button class="brief-vers__row" data-ts="${v.ts == null ? "" : v.ts}" type="button">
        <span class="brief-vers__when">${fmtVer(v.ts)}${i === 0 ? ' <span class="brief-vers__cur">vigente</span>' : ""}</span>
        <span class="brief-vers__prev">${esc((v.content || "").replace(/[#>*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 96))}…</span>
      </button>`).join("") + `</div>`;
    main.querySelectorAll(".brief-vers__row").forEach((row) =>
      row.addEventListener("click", () => viewBriefVersion(row.dataset.ts)));
  }
  function viewBriefVersion(tsStr) {
    const vers = Context.briefingVersions();
    const v = vers.find((x) => (x.ts == null ? "" : String(x.ts)) === String(tsStr));
    if (!v) return;
    const isCurrent = (vers[0].ts == null ? "" : String(vers[0].ts)) === String(tsStr);
    const main = document.getElementById("briefMain");
    main.innerHTML = `
      <div class="brief-vers__head">
        <button class="btn-ghost btn-ghost--sm" id="briefBackVers" type="button">← versões</button>
        <span class="brief-vers__date">${fmtVer(v.ts)}</span>
        ${isCurrent ? '<span class="settings__status settings__status--ok">vigente</span>' : '<button class="btn-solid" id="briefRestoreBtn" type="button">Tornar vigente</button>'}
      </div>
      <div class="doc">${mdToHtml(v.content)}</div>`;
    document.getElementById("briefBackVers").addEventListener("click", openBriefVersions);
    const rb = document.getElementById("briefRestoreBtn");
    if (rb) rb.addEventListener("click", async () => {
      rb.disabled = true; rb.textContent = "…";
      await Context.restoreBriefingVersion(v.ts);
      if (window.App && App.refreshBriefing) App.refreshBriefing();
      renderBriefingDoc();
    });
  }

  /* Doc de um agente: escopo EFETIVO + banner de reverter se foi ajustado. */
  function renderAgentDoc(a) {
    const body = document.getElementById("docBody");
    const overridden = Context.isEscopoOverridden(a.id);
    const published = Context.isEscopoPublished(a.id);
    const tag = published
      ? "⟳ Ajustado pelo fundador via IAgo · publicado (todos os aparelhos)."
      : "⟳ Ajustado pelo fundador via IAgo · só neste aparelho.";
    const banner = overridden
      ? `<div class="doc-revert"><span>${tag}</span><button id="revertEscopoBtn" type="button">Reverter ao original</button></div>`
      : "";
    // A IAra é a guardiã da Cartilha de Nomes — atalho no canto do doc dela.
    const cartChip = a.id === "head-rh"
      ? `<button class="cart-chip" id="docCartChip" type="button"><span class="cart-chip__mark">✦</span> Cartilha de Nomes</button>`
      : "";
    body.innerHTML = cartChip + banner + mdToHtml(Context.effectiveEscopo(a) || "_Sem escopo definido._");
    const cc = document.getElementById("docCartChip");
    if (cc) cc.addEventListener("click", () => { if (window.App && App.openCartilha) App.openCartilha(); });
    const rb = document.getElementById("revertEscopoBtn");
    if (rb) rb.addEventListener("click", async () => {
      if (published) {
        rb.disabled = true; rb.textContent = "revertendo…";
        const r = await Context.revertEscopoPermanent(a.id);
        if (!r.ok) { rb.disabled = false; rb.textContent = "Reverter ao original"; alert("Não consegui reverter: " + r.error); return; }
      } else {
        Context.revertEscopo(a.id);
      }
      renderAgentDoc(a);
    });
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

  return { open: openHub, openDoc, bind, cartilhaHTML };
})();
