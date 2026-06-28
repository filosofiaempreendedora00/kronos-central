/* ===========================================================================
   KANBAN — Atividades (aba própria). Dono: MatIAs (COO, "quem toca o bumbo").

   Colunas: Backlog → To Do → Doing → Complete. Cards com prazo, drag-drop
   (desktop) e setas ‹ › (mobile).

   PERSISTÊNCIA DURÁVEL (cross-device): as tarefas vivem CIFRADAS em
   www/contexto/kanban.json (mesma chave do cofre). Lê de qualquer aparelho
   (público) e grava de volta no GitHub se houver token configurado (Configurar).
   localStorage é cache local/instantâneo + fallback offline.
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
  let tasks = [];
  let editingId = null;
  let updatedAt = 0;
  let remoteSha = null;
  let saveTimer = null;
  let syncState = "local"; // local | syncing | synced | error

  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const canSync = () => typeof Sync !== "undefined" && Sync.configured && Sync.configured() && typeof Auth !== "undefined" && Auth.encryptJSON;

  function loadLocal() { try { const d = JSON.parse(localStorage.getItem(LS)); if (d && Array.isArray(d.tasks)) { tasks = d.tasks; updatedAt = d.updatedAt || 0; } } catch (_) {} }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify({ tasks, updatedAt })); } catch (_) {} }

  /* Toda mutação passa por aqui: carimba updatedAt, salva local na hora e agenda
     o push cifrado pro GitHub (debounced). */
  function persist() { updatedAt = Date.now(); saveLocal(); scheduleSync(); }

  function scheduleSync() {
    if (!canSync()) { syncState = "local"; reflectSync(); return; }
    syncState = "syncing"; reflectSync();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, 1200);
  }
  async function pushRemote() {
    if (!canSync()) return;
    try {
      try { const cur = await Sync.readJson(PATH); remoteSha = (cur && cur.sha) || remoteSha; } catch (_) {} // sha fresco (last-write-wins simples)
      const env = await Auth.encryptJSON({ type: "kronos.kanban", version: 1, updatedAt, tasks });
      const res = await Sync.writeJson(PATH, env, remoteSha, "kronos: kanban atualizado");
      if (res && res.ok) { remoteSha = res.sha || remoteSha; syncState = "synced"; }
      else { syncState = "error"; }
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
        if (doc && Array.isArray(doc.tasks) && (doc.updatedAt || 0) >= updatedAt) {
          tasks = doc.tasks; updatedAt = doc.updatedAt || 0; saveLocal(); render();
        }
      }
      syncState = canSync() ? "synced" : "local";
    } catch (_) { syncState = "error"; }
    reflectSync();
  }
  function reflectSync() {
    const el = document.getElementById("kanbanSync");
    if (!el) return;
    const map = {
      local: ["kanban__sync--local", "● só neste aparelho"],
      syncing: ["kanban__sync--wait", "↻ sincronizando…"],
      synced: ["kanban__sync--ok", "✓ sincronizado"],
      error: ["kanban__sync--err", "⚠ falha no sync"],
    };
    const [cls, txt] = map[syncState] || map.local;
    el.className = "kanban__sync " + cls;
    el.textContent = txt;
    el.title = syncState === "local" ? "Edições só neste aparelho. Configure um token do GitHub em Configurar para sincronizar." : "";
  }

  function deadlineInfo(iso) {
    if (!iso) return null;
    const p = iso.split("-");
    const label = `${p[2]}/${p[1]}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(iso + "T00:00:00") - today) / 86400000);
    if (days < 0) return { cls: "over", txt: `${label} · atrasada` };
    if (days === 0) return { cls: "due", txt: `${label} · hoje` };
    if (days <= 2) return { cls: "due", txt: `${label} · ${days}d` };
    return { cls: "ok", txt: label };
  }

  function cardHtml(t) {
    if (editingId === t.id) {
      return `<div class="kcard kcard--edit" data-id="${t.id}">
        <textarea class="kcard__input" rows="3" placeholder="O que precisa ser feito?">${esc(t.title)}</textarea>
        <label class="kcard__dllabel">Prazo <input type="date" class="kcard__date" value="${t.deadline || ""}"></label>
        <div class="kcard__editbtns">
          <button class="kbtn-save" data-act="save" data-id="${t.id}">Salvar</button>
          <button class="kbtn-cancel" data-act="cancel" data-id="${t.id}">Cancelar</button>
        </div>
      </div>`;
    }
    const dl = deadlineInfo(t.deadline);
    const idx = COLS.findIndex((c) => c.key === t.status);
    return `<div class="kcard" draggable="true" data-id="${t.id}">
      <div class="kcard__title">${esc(t.title) || '<span class="kcard__empty">(sem título)</span>'}</div>
      <div class="kcard__foot">
        ${dl ? `<span class="kcard__dl kcard__dl--${dl.cls}">${dl.txt}</span>` : `<span class="kcard__dl kcard__dl--none">sem prazo</span>`}
        <span class="kcard__actions">
          <button class="kbtn" data-act="move" data-dir="-1" data-id="${t.id}"${idx === 0 ? " disabled" : ""} title="Mover para a esquerda">‹</button>
          <button class="kbtn" data-act="move" data-dir="1" data-id="${t.id}"${idx === COLS.length - 1 ? " disabled" : ""} title="Mover para a direita">›</button>
          <button class="kbtn" data-act="edit" data-id="${t.id}" title="Editar">✎</button>
          <button class="kbtn" data-act="del" data-id="${t.id}" title="Excluir">✕</button>
        </span>
      </div>
    </div>`;
  }

  function render() {
    const board = document.getElementById("kanbanBoard");
    if (!board) return;
    board.innerHTML = COLS.map((c) => {
      const list = tasks.filter((t) => t.status === c.key);
      const cards = list.map(cardHtml).join("");
      return `<div class="kcol" data-col="${c.key}">
        <div class="kcol__head">
          <span class="kcol__label">${c.label}</span>
          <span class="kcol__count">${list.length}</span>
          <button class="kcol__add" data-act="add" data-col="${c.key}" title="Nova atividade">+</button>
        </div>
        <div class="kcol__cards" data-col="${c.key}">${cards || '<p class="kcol__empty">—</p>'}</div>
      </div>`;
    }).join("");
    bindBoard(board);
  }

  function bindBoard(board) {
    board.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", onAct));
    board.querySelectorAll('.kcard[draggable="true"]').forEach((c) => {
      c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.id); e.dataTransfer.effectAllowed = "move"; c.classList.add("kcard--drag"); });
      c.addEventListener("dragend", () => c.classList.remove("kcard--drag"));
    });
    board.querySelectorAll(".kcol__cards").forEach((z) => {
      z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("kcol__cards--over"); });
      z.addEventListener("dragleave", () => z.classList.remove("kcol__cards--over"));
      z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("kcol__cards--over"); moveTo(e.dataTransfer.getData("text/plain"), z.dataset.col); });
    });
    const ta = board.querySelector(".kcard__input");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function onAct(e) {
    const b = e.currentTarget;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === "add") add(b.dataset.col);
    else if (act === "edit") { editingId = id; render(); }
    else if (act === "save") saveCard(id);
    else if (act === "cancel") { const t = tasks.find((x) => x.id === id); if (t && t._new) tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); }
    else if (act === "del") { tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); }
    else if (act === "move") moveDir(id, Number(b.dataset.dir));
  }

  function add(status) {
    const t = { id: uid(), title: "", status: status || "backlog", deadline: null, _new: true, createdAt: Date.now() };
    tasks.unshift(t);
    editingId = t.id;
    render();
  }
  function saveCard(id) {
    const card = document.querySelector(`.kcard[data-id="${id}"]`);
    if (!card) return;
    const title = card.querySelector(".kcard__input").value.trim();
    const deadline = card.querySelector(".kcard__date").value || null;
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!title) { if (t._new) tasks = tasks.filter((x) => x.id !== id); editingId = null; persist(); render(); return; }
    t.title = title; t.deadline = deadline; delete t._new;
    editingId = null; persist(); render();
  }
  function moveDir(id, dir) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const ni = COLS.findIndex((c) => c.key === t.status) + dir;
    if (ni < 0 || ni >= COLS.length) return;
    t.status = COLS[ni].key; persist(); render();
  }
  function moveTo(id, status) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    t.status = status; persist(); render();
  }

  function open() {
    if (typeof App !== "undefined" && App.showView) App.showView("kanbanView");
    else { const v = document.getElementById("kanbanView"); if (v) v.hidden = false; }
    render();
    reflectSync();
    loadRemote(); // puxa a versão sincronizada (seed + outros aparelhos)
  }
  function boot() { loadLocal(); }

  return { open, boot, render, add };
})();
