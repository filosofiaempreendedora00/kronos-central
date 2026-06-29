/* ===========================================================================
   KANBAN — Atividades (aba própria). Dono: MatIAs (COO, "quem toca o bumbo").

   Colunas: Backlog → To Do → Doing → Complete. Cada card: título, RESPONSÁVEIS
   (1 principal + apoios, e o Founder sempre junto) e prazo.
   - Clicar no card abre a EDIÇÃO. Mover: arrastar (desktop) ou pelo seletor de
     coluna na edição (mobile). Prazo: mini-calendário. Pessoas: por FOTO.
     Excluir só dentro da edição, com confirmação.

   PERSISTÊNCIA DURÁVEL (cross-device): tarefas CIFRADAS em www/contexto/kanban.json
   (chave do cofre). Lê de qualquer aparelho; grava de volta no GitHub se houver
   token (Configurar). localStorage = cache local + fallback offline.
   =========================================================================== */
const Kanban = (() => {
  const LS = "kronos.kanban";
  const PATH = "www/contexto/kanban.json";
  const COLS = [
    { key: "backlog", label: "Backlog" },
    { key: "todo", label: "To Do" },
    { key: "doing", label: "Doing" },
    { key: "done", label: "Complete" },
  ];
  const PEOPLE = {
    ceo: { name: "TIAgo", role: "CEO", img: "assets/agents/tiago.jpg" },
    growth: { name: "Hilário", role: "Head de Growth", img: "assets/agents/hilario.jpg" },
    coo: { name: "MatIAs", role: "COO", img: "assets/agents/matias.jpg" },
    cfo: { name: "FabIAna", role: "CFO", img: "assets/agents/fabiana.jpg" },
    cro: { name: "DamIAno", role: "CRO", img: "assets/agents/damiano.jpg" },
    media: { name: "TobIAs", role: "Media Buyer", img: "assets/agents/tobias.jpg" },
    agents: { name: "IAra", role: "Chief Agent Officer", img: "assets/agents/iara.jpg" },
    prompt: { name: "IAgo", role: "Eng. de Prompt", img: "assets/agents/iago.jpg" },
    design: { name: "TatIAna", role: "Designer", img: "assets/agents/tatiana.jpg" },
    copy: { name: "ElIAs", role: "Copywriter", img: "assets/agents/elias.jpg" },
    founder: { name: "Roberto", role: "Founder", ini: "R" },
  };
  const AGENT_KEYS = Object.keys(PEOPLE).filter((k) => k !== "founder");
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  let tasks = [];
  let editingId = null, calMonth = null, updatedAt = 0, remoteSha = null, saveTimer = null, syncState = "local";

  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const canSync = () => typeof Sync !== "undefined" && Sync.configured && Sync.configured() && typeof Auth !== "undefined" && Auth.encryptJSON;

  function loadLocal() { try { const d = JSON.parse(localStorage.getItem(LS)); if (d && Array.isArray(d.tasks)) { tasks = d.tasks; updatedAt = d.updatedAt || 0; } } catch (_) {} }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify({ tasks, updatedAt })); } catch (_) {} }
  function persist() { updatedAt = Date.now(); saveLocal(); scheduleSync(); }

  function scheduleSync() {
    if (!canSync()) { syncState = "local"; reflectSync(); return; }
    syncState = "syncing"; reflectSync();
    clearTimeout(saveTimer); saveTimer = setTimeout(pushRemote, 1200);
  }
  async function pushRemote() {
    if (!canSync()) return;
    try {
      try { const cur = await Sync.readJson(PATH); remoteSha = (cur && cur.sha) || remoteSha; } catch (_) {}
      const env = await Auth.encryptJSON({ type: "kronos.kanban", version: 1, updatedAt, tasks });
      const res = await Sync.writeJson(PATH, env, remoteSha, "kronos: kanban atualizado");
      if (res && res.ok) { remoteSha = res.sha || remoteSha; syncState = "synced"; } else syncState = "error";
    } catch (_) { syncState = "error"; }
    reflectSync();
  }
  async function loadRemote() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return;
    syncState = canSync() ? "syncing" : "local"; reflectSync();
    try {
      const res = await Sync.readJson(PATH);
      remoteSha = (res && res.sha) || null;
      const env = res && res.json;
      if (env) {
        const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
        if (doc && Array.isArray(doc.tasks) && (doc.updatedAt || 0) >= updatedAt) { tasks = doc.tasks; updatedAt = doc.updatedAt || 0; saveLocal(); render(); }
      }
      syncState = canSync() ? "synced" : "local";
    } catch (_) { syncState = "error"; }
    reflectSync();
  }
  function reflectSync() {
    const el = document.getElementById("kanbanSync");
    if (!el) return;
    const map = { local: ["kanban__sync--local", "● só neste aparelho"], syncing: ["kanban__sync--wait", "↻ sincronizando…"], synced: ["kanban__sync--ok", "✓ sincronizado"], error: ["kanban__sync--err", "⚠ falha no sync"] };
    const [cls, txt] = map[syncState] || map.local;
    el.className = "kanban__sync " + cls; el.textContent = txt;
    el.title = syncState === "local" ? "Edições só neste aparelho. Configure um token do GitHub em Configurar para sincronizar." : "";
  }

  function deadlineInfo(iso) {
    if (!iso) return null;
    const p = iso.split("-"), label = `${p[2]}/${p[1]}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(iso + "T00:00:00") - today) / 86400000);
    if (days < 0) return { cls: "over", txt: `${label} · atrasada` };
    if (days === 0) return { cls: "due", txt: `${label} · hoje` };
    if (days <= 2) return { cls: "due", txt: `${label} · ${days}d` };
    return { cls: "ok", txt: label };
  }

  function avatar(key, cls, prefix) {
    const p = PEOPLE[key]; if (!p) return "";
    const inner = p.img ? `<img src="${p.img}" alt="">` : `<span class="kperson__ini">${p.ini || p.name[0]}</span>`;
    return `<span class="kperson${cls ? " " + cls : ""}" title="${esc(prefix + ": " + p.name + (p.role ? " · " + p.role : ""))}">${inner}</span>`;
  }
  function peopleRow(t) {
    const parts = [];
    if (t.owner && PEOPLE[t.owner]) parts.push(avatar(t.owner, "kperson--owner", "Principal"));
    (t.support || []).forEach((k) => { if (PEOPLE[k]) parts.push(avatar(k, "", "Apoio")); });
    parts.push(avatar("founder", "kperson--founder", "Founder (sempre junto)"));
    return `<div class="kcard__people">${parts.join("")}</div>`;
  }

  /* prazo: fica RECOLHIDO (só o gatilho 📅). O calendário abre ao clicar e
     fecha ao escolher um dia. data-date mora no .kdl (container). */
  const fmtBR = (ds) => ds.split("-").reverse().slice(0, 2).join("/");
  function setDate(kdl, ds) {
    kdl.dataset.date = ds || "";
    kdl.classList.toggle("kdl--set", !!ds);
    const l = kdl.querySelector(".kdl__label"); if (l) l.textContent = ds ? fmtBR(ds) : "sem prazo";
  }
  function closeCal(kdl) { const c = kdl.querySelector(".kcal"); if (c) c.hidden = true; kdl.classList.remove("kdl--open"); }
  function openCal(kdl) { calMonth = (kdl.dataset.date || todayISO()).slice(0, 7); renderCalendar(kdl); kdl.querySelector(".kcal").hidden = false; kdl.classList.add("kdl--open"); }
  function renderCalendar(kdl) {
    const el = kdl.querySelector(".kcal");
    const sel = kdl.dataset.date || "";
    const [y, m] = calMonth.split("-").map(Number);
    const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += '<span class="kcal__day kcal__day--pad"></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells += `<button type="button" class="kcal__day${ds === sel ? " kcal__day--sel" : ""}${ds === todayISO() ? " kcal__day--today" : ""}" data-d="${ds}">${d}</button>`;
    }
    el.innerHTML = `<div class="kcal__head">
        <button type="button" class="kcal__nav" data-mv="-1">‹</button>
        <span class="kcal__title">${MES[m - 1]} ${y}</span>
        <button type="button" class="kcal__nav" data-mv="1">›</button>
      </div>
      <div class="kcal__dow"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
      <div class="kcal__grid">${cells}</div>
      ${sel ? '<div class="kcal__foot"><button type="button" class="kcal__clear">limpar prazo</button></div>' : ""}`;
    el.querySelectorAll(".kcal__nav").forEach((b) => b.addEventListener("click", () => {
      let yy = y, mm = m + Number(b.dataset.mv);
      if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; }
      calMonth = `${yy}-${String(mm).padStart(2, "0")}`; renderCalendar(kdl);
    }));
    el.querySelectorAll(".kcal__day[data-d]").forEach((b) => b.addEventListener("click", () => { setDate(kdl, kdl.dataset.date === b.dataset.d ? "" : b.dataset.d); closeCal(kdl); }));
    const clr = el.querySelector(".kcal__clear"); if (clr) clr.addEventListener("click", () => { setDate(kdl, ""); closeCal(kdl); });
  }

  function pickerHtml(id, selected, multi) {
    const sel = multi ? new Set(selected) : null;
    return `<div class="kpick" id="${id}">${AGENT_KEYS.map((k) => {
      const on = multi ? sel.has(k) : k === selected;
      return `<button type="button" class="kpick__a${on ? " kpick__a--on" : ""}" data-k="${k}" title="${esc(PEOPLE[k].name + " · " + PEOPLE[k].role)}"><img src="${PEOPLE[k].img}" alt=""></button>`;
    }).join("")}</div>`;
  }

  function cardHtml(t) {
    if (editingId === t.id) {
      const owner = t.owner || "coo";
      return `<div class="kcard kcard--edit" data-id="${t.id}">
        <textarea class="kcard__input" rows="3" placeholder="O que precisa ser feito?">${esc(t.title)}</textarea>
        <div class="kedit-sec"><span class="kedit-lbl">Prazo</span>
          <div class="kdl${t.deadline ? " kdl--set" : ""}" data-date="${t.deadline || ""}">
            <button type="button" class="kdl__trigger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/></svg><span class="kdl__label">${t.deadline ? t.deadline.split("-").reverse().slice(0, 2).join("/") : "sem prazo"}</span></button>
            <div class="kcal" hidden></div>
          </div>
        </div>
        <div class="kedit-sec"><span class="kedit-lbl">Coluna</span><div class="kstatus">${COLS.map((c) => `<button type="button" class="kstatus__b${c.key === t.status ? " kstatus__b--on" : ""}" data-s="${c.key}">${c.label}</button>`).join("")}</div></div>
        <div class="kedit-sec"><span class="kedit-lbl">Principal</span>${pickerHtml("kowner", owner, false)}</div>
        <div class="kedit-sec"><span class="kedit-lbl">Apoio</span>${pickerHtml("ksupport", (t.support || []).filter((k) => k !== owner), true)}</div>
        <p class="kedit-note">Você (Founder) entra junto em todas.</p>
        <div class="kcard__editbtns">
          <button class="kbtn-save" data-act="save" data-id="${t.id}">Salvar</button>
          <button class="kbtn-cancel" data-act="cancel" data-id="${t.id}">Cancelar</button>
          <button class="kbtn-del" data-act="askdel" data-id="${t.id}">Excluir</button>
        </div>
      </div>`;
    }
    const dl = deadlineInfo(t.deadline);
    return `<div class="kcard" draggable="true" data-id="${t.id}">
      <div class="kcard__title">${esc(t.title) || '<span class="kcard__empty">(sem título)</span>'}</div>
      ${peopleRow(t)}
      <div class="kcard__foot">
        ${dl ? `<span class="kcard__dl kcard__dl--${dl.cls}">${dl.txt}</span>` : `<span class="kcard__dl kcard__dl--none">sem prazo</span>`}
      </div>
    </div>`;
  }

  function render() {
    const board = document.getElementById("kanbanBoard");
    if (!board) return;
    board.innerHTML = COLS.map((c) => {
      const list = tasks.filter((t) => t.status === c.key);
      return `<div class="kcol" data-col="${c.key}">
        <div class="kcol__head"><span class="kcol__label">${c.label}</span><span class="kcol__count">${list.length}</span>
          <button class="kcol__add" data-act="add" data-col="${c.key}" title="Nova atividade">+</button></div>
        <div class="kcol__cards" data-col="${c.key}">${list.map(cardHtml).join("") || '<p class="kcol__empty">—</p>'}</div>
      </div>`;
    }).join("");
    bindBoard(board);
  }

  function bindBoard(board) {
    board.querySelectorAll('[data-act="add"]').forEach((b) => b.addEventListener("click", () => add(b.dataset.col)));
    board.querySelectorAll(".kcard--edit [data-act]").forEach((b) => b.addEventListener("click", onAct));
    // clicar no card (display) abre a edição
    board.querySelectorAll('.kcard[draggable="true"]').forEach((c) => {
      c.addEventListener("click", () => openEdit(c.dataset.id));
      c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.id); e.dataTransfer.effectAllowed = "move"; c.classList.add("kcard--drag"); });
      c.addEventListener("dragend", () => c.classList.remove("kcard--drag"));
    });
    board.querySelectorAll(".kcol__cards").forEach((z) => {
      z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("kcol__cards--over"); });
      z.addEventListener("dragleave", () => z.classList.remove("kcol__cards--over"));
      z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("kcol__cards--over"); moveTo(e.dataTransfer.getData("text/plain"), z.dataset.col); });
    });
    // editor: prazo (gatilho recolhido), pickers, status
    const kdl = board.querySelector(".kdl");
    if (kdl) kdl.querySelector(".kdl__trigger").addEventListener("click", () => { kdl.classList.contains("kdl--open") ? closeCal(kdl) : openCal(kdl); });
    const ow = board.querySelector("#kowner");
    if (ow) ow.querySelectorAll(".kpick__a").forEach((b) => b.addEventListener("click", () => { ow.querySelectorAll(".kpick__a--on").forEach((x) => x.classList.remove("kpick__a--on")); b.classList.add("kpick__a--on"); }));
    const sp = board.querySelector("#ksupport");
    if (sp) sp.querySelectorAll(".kpick__a").forEach((b) => b.addEventListener("click", () => b.classList.toggle("kpick__a--on")));
    const st = board.querySelector(".kstatus");
    if (st) st.querySelectorAll(".kstatus__b").forEach((b) => b.addEventListener("click", () => { st.querySelectorAll(".kstatus__b--on").forEach((x) => x.classList.remove("kstatus__b--on")); b.classList.add("kstatus__b--on"); }));
    const ta = board.querySelector(".kcard__input");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function onAct(e) {
    e.stopPropagation();
    const b = e.currentTarget, act = b.dataset.act, id = b.dataset.id;
    if (act === "save") saveCard(id);
    else if (act === "cancel") { const t = tasks.find((x) => x.id === id); if (t && t._new) tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); }
    else if (act === "askdel") { b.textContent = "Confirmar exclusão"; b.dataset.act = "del"; b.classList.add("kbtn-del--confirm"); }
    else if (act === "del") { tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); }
  }

  function openEdit(id) {
    editingId = id;
    const t = tasks.find((x) => x.id === id);
    calMonth = ((t && t.deadline) || todayISO()).slice(0, 7);
    render();
  }
  function add(status) {
    const t = { id: uid(), title: "", status: status || "backlog", deadline: null, owner: "coo", support: [], _new: true, createdAt: Date.now() };
    tasks.unshift(t); openEdit(t.id);
  }
  function saveCard(id) {
    const card = document.querySelector(`.kcard[data-id="${id}"]`);
    if (!card) return;
    const title = card.querySelector(".kcard__input").value.trim();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!title) { if (t._new) tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); return; }
    t.title = title;
    const kdl = card.querySelector(".kdl"); t.deadline = (kdl && kdl.dataset.date) || null;
    const sb = card.querySelector(".kstatus__b--on"); if (sb) t.status = sb.dataset.s;
    const ob = card.querySelector("#kowner .kpick__a--on"); t.owner = ob ? ob.dataset.k : null;
    t.support = Array.from(card.querySelectorAll("#ksupport .kpick__a--on")).map((b) => b.dataset.k).filter((k) => k !== t.owner);
    delete t._new;
    editingId = null; persist(); render();
  }
  function moveTo(id, status) {
    const t = tasks.find((x) => x.id === id); if (!t || t.status === status) return;
    t.status = status; persist(); render();
  }

  function open() {
    if (typeof App !== "undefined" && App.showView) App.showView("kanbanView");
    else { const v = document.getElementById("kanbanView"); if (v) v.hidden = false; }
    render(); reflectSync(); loadRemote();
  }
  function boot() { loadLocal(); }

  return { open, boot, render, add };
})();
