/* ===========================================================================
   LEADS — espelho do painel "Master" do gerador, dentro da Central.

   Lê www/contexto/leads.json (sincronizado, CIFRADO) e decifra com a chave do
   cofre. Mesma temperatura/fonte do gerador (só-leitura). Filtros por
   temperatura e por fonte. Snapshot gerado por `node scripts/ler-leads.mjs`.
   =========================================================================== */
const Leads = (() => {
  const PATH = "www/contexto/leads.json";
  let DOC = null;
  const state = { temp: "todos", source: "todos" };

  const TEMP = {
    cliente: { label: "Cliente", cls: "lead-t--cliente" },
    quente: { label: "Quente", cls: "lead-t--quente" },
    morno: { label: "Morno", cls: "lead-t--morno" },
    frio: { label: "Frio", cls: "lead-t--frio" },
  };
  const SRC = { meta: "Meta", google: "Google", direct: "Direto", direto: "Direto" };
  const srcLabel = (s) => SRC[s] || (s ? s[0].toUpperCase() + s.slice(1) : "—");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const since = (iso) => {
    if (!iso) return "";
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 60) return "há " + min + "min";
    const h = Math.round(min / 60);
    if (h < 24) return "há " + h + "h";
    return "há " + Math.round(h / 24) + "d";
  };
  const waUrl = (n) => "https://wa.me/" + String(n).replace(/\D/g, "");

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res;
    try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json;
    if (!env) return null;
    try {
      const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && Array.isArray(doc.leads)) ? doc : null;
    } catch (_) { return null; }
  }

  function filtered() {
    return (DOC.leads || []).filter((l) =>
      (state.temp === "todos" || l.temperature === state.temp) &&
      (state.source === "todos" || l.source === state.source));
  }

  function renderKpis() {
    const el = document.getElementById("leadsKpis");
    if (!el) return;
    const t = DOC.totals || {};
    const tile = (n, lbl, cls) =>
      `<div class="lead-kpi ${cls || ""}"><div class="lead-kpi__n">${n ?? 0}</div><div class="lead-kpi__l">${lbl}</div></div>`;
    el.innerHTML =
      tile(t.total, "Leads") + tile(t.cliente, "Clientes", "lead-t--cliente") +
      tile(t.quente, "Quentes", "lead-t--quente") + tile(t.morno, "Mornos", "lead-t--morno") +
      tile(t.frio, "Frios", "lead-t--frio") + tile(t.baixaram, "Baixaram") +
      tile(t.paywall, "No paywall");
  }

  function renderControls() {
    const el = document.getElementById("leadsControls");
    if (!el) return;
    const chip = (group, val, lbl, active) =>
      `<button class="lead-chip${active ? " is-active" : ""}" data-group="${group}" data-val="${val}" type="button">${lbl}</button>`;
    const temps = ["todos", "cliente", "quente", "morno", "frio"];
    const srcs = ["todos", "meta", "google", "direto"];
    el.innerHTML =
      `<div class="lead-chips">${temps.map((v) => chip("temp", v, v === "todos" ? "Todas" : TEMP[v].label, state.temp === v)).join("")}</div>` +
      `<div class="lead-chips">${srcs.map((v) => chip("source", v, v === "todos" ? "Toda fonte" : srcLabel(v), state.source === v)).join("")}</div>`;
    el.querySelectorAll(".lead-chip").forEach((b) =>
      b.addEventListener("click", () => { state[b.dataset.group] = b.dataset.val; renderControls(); renderList(); }));
  }

  function renderList() {
    const el = document.getElementById("leadsList");
    if (!el) return;
    const list = filtered();
    if (!list.length) { el.innerHTML = `<p class="lead-empty">Nenhum lead com esse filtro.</p>`; return; }
    el.innerHTML = list.map((l) => {
      const t = TEMP[l.temperature] || TEMP.frio;
      const wa = l.whatsapp
        ? `<a class="lead-wa" href="${waUrl(l.whatsapp)}" target="_blank" rel="noopener" title="WhatsApp${l.whatsappOptin ? " (opt-in)" : ""}">${esc(l.whatsapp)}${l.whatsappOptin ? " ✓" : ""}</a>`
        : "";
      return `<div class="lead-row">
        <span class="lead-badge ${t.cls}">${t.label}</span>
        <span class="lead-id">${esc(l.email || l.name || "—")}</span>
        <span class="lead-src">${srcLabel(l.source)}</span>
        <span class="lead-dl">${l.downloads > 0 ? "baixou " + l.downloads : "—"}</span>
        ${wa}
        <span class="lead-when">${since(l.createdAt)}</span>
      </div>`;
    }).join("");
  }

  async function render() {
    const meta = document.getElementById("leadsMeta");
    DOC = await load();
    if (!DOC) { if (meta) meta.textContent = "sem dados (rode ler-leads.mjs)"; return; }
    if (meta) meta.textContent = `${(DOC.totals || {}).total ?? 0} leads · atualizado ${since(DOC.updatedAt)}`;
    renderKpis(); renderControls(); renderList();
  }

  return { render };
})();
