/* ===========================================================================
   KRONOS CENTRAL — Dashboard
   =========================================================================== */

const LS = {
  apiKey: "kronos.apiKey",
  metrics: "kronos.metrics",
};

/* ----------------------------- Relógio ao vivo ---------------------------- */
function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const t = `${hh}:${mm}`;
  ["liveClock", "liveClockMobile"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t;
  });
}

/* ------------------------------ Agentes (Bloco 1) ------------------------- */
function renderAgents() {
  const grid = document.getElementById("agentsGrid");
  grid.innerHTML = "";

  AGENTS.forEach((agent) => {
    const card = document.createElement("div");
    card.className = "agent-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("data-agent", agent.id);
    card.setAttribute("aria-label", `Conversar com ${agent.nome || agent.name}`);

    card.innerHTML = `
      <div class="agent-card__top">
        <span class="agent-card__avatar">${agentAvatarHTML(agent)}</span>
        <span class="agent-card__status agent-card__status--${agent.status}">
          <span class="dot"></span>${agent.status === "online" ? "Disponível" : "Offline"}
        </span>
      </div>
      <div class="agent-card__body">
        <h3 class="agent-card__name">${agent.nome || agent.name}</h3>
        <p class="agent-card__cargo">${agent.name}</p>
        <p class="agent-card__blurb">${agent.blurb}</p>
      </div>
      <div class="agent-card__foot">
        <span class="agent-card__cta">
          Abrir conversa
          <svg class="agent-card__arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <line x1="5" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <polyline points="13,7 18,12 13,17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <button class="agent-card__easy" type="button" data-easy="${agent.id}" title="Abrir no Claude (modo Easy) — sem custo">
          Easy
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    // clique no card → conversa (modo salvo do agente)
    card.addEventListener("click", () => openAgent(agent.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAgent(agent.id); }
    });

    // clique no atalho Easy → vai direto pro Claude, sem entrar no agente
    card.querySelector(".agent-card__easy").addEventListener("click", (e) => {
      e.stopPropagation();
      openEasyDirect(agent.id);
    });

    grid.appendChild(card);
  });
}

function openAgent(id) {
  Chat.open(id);
}

/* Link do modo Easy de um agente (override do localStorage tem prioridade). */
function easyUrlFor(id) {
  const saved = localStorage.getItem(`kronos.easyUrl.${id}`);
  if (saved != null && saved.trim() !== "") return saved.trim();
  const a = AGENTS.find((x) => x.id === id);
  return (a?.easyUrl || "").trim();
}

/* Atalho do card: abre o Claude direto, ou entra no modo Easy se ainda não houver link. */
function openEasyDirect(id) {
  const url = easyUrlFor(id);
  if (url) window.open(url, "_blank", "noopener");
  else Chat.open(id, "easy"); // sem link salvo → entra no modo Easy para configurar
}

/* ------------------------------ Métricas (Bloco 2) ------------------------ */
function loadMetrics() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS.metrics));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (_) {}
  return structuredClone(DEFAULT_METRICS);
}

function saveMetrics(metrics) {
  localStorage.setItem(LS.metrics, JSON.stringify(metrics));
}

let metricsState = loadMetrics();
let metricsEditing = false;

function renderMetrics() {
  const grid = document.getElementById("metricsGrid");
  grid.innerHTML = "";

  metricsState.forEach((m) => {
    const cell = document.createElement("div");
    cell.className = "metric-card";

    if (metricsEditing) {
      cell.innerHTML = `
        <input class="metric-card__label-input" value="${escapeAttr(m.label)}" data-id="${m.id}" data-field="label" />
        <input class="metric-card__value-input" value="${escapeAttr(m.value)}" data-id="${m.id}" data-field="value" placeholder="valor" />
      `;
    } else {
      cell.innerHTML = `
        <span class="metric-card__label">${m.label}</span>
        <span class="metric-card__value">${m.value || "—"}</span>
      `;
    }
    grid.appendChild(cell);
  });

  // listeners de edição
  if (metricsEditing) {
    grid.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const { id, field } = e.target.dataset;
        const metric = metricsState.find((x) => x.id === id);
        if (metric) metric[field] = e.target.value;
      });
    });
  }

  const btn = document.getElementById("editMetricsBtn");
  btn.textContent = metricsEditing ? "Salvar" : "Editar";
  btn.classList.toggle("btn-ghost--active", metricsEditing);
}

function toggleMetricsEdit() {
  if (metricsEditing) saveMetrics(metricsState);
  metricsEditing = !metricsEditing;
  renderMetrics();
}

/* ------------------------------- Utils ----------------------------------- */
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

/* ------------------------------- Boot ------------------------------------ */
/* Acompanha a VIEWPORT VISÍVEL do iOS: altura (--app-h) E deslocamento que o
   teclado aplica (--vv-top = visualViewport.offsetTop). No mobile, o .app é
   fixado nessa área, então, ao abrir o teclado, ele gruda exatamente acima dele
   — o campo de texto e o botão de enviar ficam sempre visíveis e ao alcance,
   sem ir parar colado no topo. Ouvimos 'resize' e 'scroll' (o iOS dispara
   'scroll' do visualViewport quando empurra a tela ao focar o campo). */
function fitViewportToKeyboard() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let raf = 0;
  const apply = () => {
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (h && h > 0) root.style.setProperty("--app-h", Math.round(h) + "px");
    root.style.setProperty("--vv-top", Math.round(top || 0) + "px");
  };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  if (vv) {
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
  }
  window.addEventListener("orientationchange", () => setTimeout(apply, 250));
  apply();
}

/* --------------------- Navegação central (troca de telas) ----------------- */
const VIEW_IDS = [
  "dashboardView", "agentesView", "chatView", "delfosView",
  "costsView", "settingsView", "nucleoView", "nucleoDocView", "delfosHistoryView",
];
const SUB_VIEWS = ["chatView", "delfosView", "nucleoDocView", "delfosHistoryView"];
// Qual item da sidebar fica ativo para cada tela (sub-telas herdam a seção pai).
const VIEW_NAV = {
  dashboardView: "dash", agentesView: "agentes", chatView: "agentes",
  delfosView: "dash", delfosHistoryView: "dash", costsView: "custos",
  settingsView: "config", nucleoView: "contextos", nucleoDocView: "contextos",
};

function setActiveNav(key) {
  document.querySelectorAll(".navitem[data-nav]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.nav === key)
  );
}

/* Mostra UMA tela e esconde todas as outras (fonte única da verdade). */
function showView(id) {
  VIEW_IDS.forEach((v) => { const e = document.getElementById(v); if (e) e.hidden = (v !== id); });
  const app = document.getElementById("app");
  if (app) { app.classList.toggle("app--sub", SUB_VIEWS.includes(id)); app.scrollTop = 0; }
  setActiveNav(VIEW_NAV[id] || "");
}

function navGo(key) {
  if (key === "dash") showView("dashboardView");
  else if (key === "agentes") showView("agentesView");
  else if (key === "contextos") NucleoView.open();
  else if (key === "custos") CostsView.open();
  else if (key === "config") Settings.open();
  closeDrawer();
}

/* ------------------------------- Sidebar / gaveta ------------------------- */
function openDrawer() {
  document.getElementById("shell").classList.add("drawer-open");
  const b = document.getElementById("sidebarBackdrop"); if (b) b.hidden = false;
}
function closeDrawer() {
  document.getElementById("shell").classList.remove("drawer-open");
  const b = document.getElementById("sidebarBackdrop"); if (b) b.hidden = true;
}
function toggleCollapse() {
  const collapsed = document.getElementById("shell").classList.toggle("sidebar-collapsed");
  localStorage.setItem("kronos.sidebarCollapsed", collapsed ? "1" : "0");
}

function init() {
  Context.load(); // carrega Núcleo + Briefing (alimenta todos os agentes)
  fitViewportToKeyboard();
  renderAgents();
  renderMetrics();
  tickClock();
  setInterval(tickClock, 10_000);

  document.getElementById("editMetricsBtn").addEventListener("click", toggleMetricsEdit);

  // Delfos (sala de reuniões)
  document.getElementById("delfosBannerMark").innerHTML = pedimentSVG(40);
  document.getElementById("delfosEnter").addEventListener("click", () => Delfos.open());

  // Navegação da sidebar / gaveta
  document.querySelectorAll(".navitem[data-nav]").forEach((b) =>
    b.addEventListener("click", () => navGo(b.dataset.nav))
  );
  document.getElementById("menuToggle").addEventListener("click", openDrawer);
  document.getElementById("sidebarBackdrop").addEventListener("click", closeDrawer);
  document.getElementById("sidebarCollapse").addEventListener("click", toggleCollapse);
  if (localStorage.getItem("kronos.sidebarCollapsed") === "1") {
    document.getElementById("shell").classList.add("sidebar-collapsed");
  }

  Chat.bind();
  Delfos.bind();
  CostsView.bind();
  CostsView.renderMini();
  NucleoView.bind();
  Settings.bind();

  showView("dashboardView"); // estado inicial
}

// Exposto para outros módulos (troca de tela centralizada + atalhos)
window.App = {
  showView,
  navGo,
  openSettings: () => navGo("config"),
  openNucleo: () => navGo("contextos"),
  closeDrawer,
};

document.addEventListener("DOMContentLoaded", init);
