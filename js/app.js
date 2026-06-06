/* ===========================================================================
   KRONOS CENTRAL — Dashboard
   =========================================================================== */

const LS = {
  apiKey: "kronos.apiKey",
  metrics: "kronos.metrics",
};

/* ----------------------------- Relógio ao vivo ---------------------------- */
function tickClock() {
  const el = document.getElementById("liveClock");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.textContent = `${hh}:${mm}`;
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
    card.setAttribute("aria-label", `Conversar com ${agent.name}`);

    card.innerHTML = `
      <div class="agent-card__top">
        <span class="agent-card__avatar">${agent.initials}</span>
        <span class="agent-card__status agent-card__status--${agent.status}">
          <span class="dot"></span>${agent.status === "online" ? "Disponível" : "Offline"}
        </span>
      </div>
      <div class="agent-card__body">
        <h3 class="agent-card__name">${agent.name}</h3>
        <p class="agent-card__role">${agent.role}</p>
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
function init() {
  renderAgents();
  renderMetrics();
  tickClock();
  setInterval(tickClock, 10_000);

  document.getElementById("editMetricsBtn").addEventListener("click", toggleMetricsEdit);

  // Delfos (sala de reuniões)
  document.getElementById("delfosBannerMark").innerHTML = pedimentSVG(40);
  document.getElementById("delfosEnter").addEventListener("click", () => Delfos.open());

  Chat.bind();
  Delfos.bind();
  CostsView.bind();
  CostsView.renderMini();
  Settings.bind();
}

// Exposto para outros módulos (ex.: chat/delfos pedem a chave da API)
window.App = { openSettings: () => Settings.open() };

document.addEventListener("DOMContentLoaded", init);
