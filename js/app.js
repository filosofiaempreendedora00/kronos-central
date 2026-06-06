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
    const card = document.createElement("button");
    card.className = "agent-card";
    card.type = "button";
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
        <span class="agent-card__cta">Abrir conversa</span>
        <svg class="agent-card__arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <line x1="5" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <polyline points="13,7 18,12 13,17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;

    card.addEventListener("click", () => openAgent(agent.id));
    grid.appendChild(card);
  });
}

function openAgent(id) {
  Chat.open(id);
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

/* ------------------------------ Modal API key ---------------------------- */
function openSettings() {
  const modal = document.getElementById("settingsModal");
  document.getElementById("apiKeyInput").value = localStorage.getItem(LS.apiKey) || "";
  modal.hidden = false;
}

function closeSettings() {
  document.getElementById("settingsModal").hidden = true;
}

function saveApiKey() {
  const val = document.getElementById("apiKeyInput").value.trim();
  if (val) localStorage.setItem(LS.apiKey, val);
  else localStorage.removeItem(LS.apiKey);
  closeSettings();
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
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("saveApiKeyBtn").addEventListener("click", saveApiKey);
  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", closeSettings)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });

  // Delfos (sala de reuniões)
  document.getElementById("delfosBannerMark").innerHTML = pedimentSVG(40);
  document.getElementById("delfosHeadMark").innerHTML = pedimentSVG(30);
  document.getElementById("delfosEnter").addEventListener("click", () => Delfos.open());

  Chat.bind();
  Delfos.bind();
}

// Exposto para outros módulos (ex.: chat pede a chave da API)
window.App = { openSettings };

document.addEventListener("DOMContentLoaded", init);
