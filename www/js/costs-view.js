/* ===========================================================================
   KRONOS CENTRAL — View de Custos (mini no dashboard + tela completa)
   =========================================================================== */

const CostsView = (() => {
  /* Mini-resumo no dashboard */
  function renderMini() {
    const grid = document.getElementById("costsMiniGrid");
    if (!grid) return;
    const s = Cost.summary();
    const cards = [
      { label: "Hoje", v: s.today },
      { label: "7 dias", v: s.week },
      { label: "30 dias", v: s.month },
      { label: "Total", v: s.total },
    ];
    grid.innerHTML = cards
      .map(
        (c) => `
        <div class="metric-card">
          <span class="metric-card__label">${c.label}</span>
          <span class="metric-card__value">${Cost.usd(c.v.cost)}</span>
          <span class="cost-sub">${Cost.brl(c.v.cost)} · ${c.v.calls} ${c.v.calls === 1 ? "interação" : "interações"}</span>
        </div>`
      )
      .join("");
  }

  /* Tela completa */
  function open() {
    document.getElementById("dashboardView").hidden = true;
    document.getElementById("costsView").hidden = false;
    renderFull();
  }
  function close() {
    document.getElementById("costsView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
    renderMini();
  }

  function periodCard(label, v) {
    return `
      <div class="cost-card">
        <span class="cost-card__label">${label}</span>
        <span class="cost-card__value">${Cost.usd(v.cost)}</span>
        <span class="cost-card__brl">${Cost.brl(v.cost)}</span>
        <span class="cost-card__meta">${v.calls} ${v.calls === 1 ? "interação" : "interações"} · ${Cost.tok(v.input + v.output)} tok</span>
      </div>`;
  }

  function renderFull() {
    const s = Cost.summary();
    const maxDay = Math.max(...s.byDay.map((d) => d.cost), 0.000001);

    const periodCards = [
      periodCard("Hoje", s.today),
      periodCard("Últimos 7 dias", s.week),
      periodCard("Últimos 30 dias", s.month),
      periodCard("Total", s.total),
    ].join("");

    const ctxRows = [
      { k: "Agentes (individual)", v: s.byContext.chat },
      { k: "Delfos (reuniões)", v: s.byContext.delfos },
    ]
      .map(
        (r) => `
        <div class="cost-row">
          <span class="cost-row__name">${r.k}</span>
          <span class="cost-row__meta">${r.v.calls} · ${Cost.tok(r.v.input + r.v.output)} tok</span>
          <span class="cost-row__val">${Cost.usd(r.v.cost)}</span>
        </div>`
      )
      .join("");

    const agentRows = s.byAgent.length
      ? s.byAgent
          .map(
            (a) => `
        <div class="cost-row">
          <span class="cost-row__name">${a.name}</span>
          <span class="cost-row__meta">${a.calls} · ${Cost.tok(a.input + a.output)} tok</span>
          <span class="cost-row__val">${Cost.usd(a.cost)}</span>
        </div>`
          )
          .join("")
      : `<p class="cost-empty">Nenhuma interação registrada ainda.</p>`;

    const bars = s.byDay
      .map(
        (d) => `
        <div class="cost-bar">
          <span class="cost-bar__day">${d.label}</span>
          <span class="cost-bar__track"><span class="cost-bar__fill" style="width:${Math.max(2, (d.cost / maxDay) * 100)}%"></span></span>
          <span class="cost-bar__val">${d.cost > 0 ? Cost.usd(d.cost) : "—"}</span>
        </div>`
      )
      .join("");

    document.getElementById("costsInner").innerHTML = `
      <div class="cost-cards">${periodCards}</div>

      <section class="cost-section">
        <h3 class="cost-section__title">Por modo</h3>
        <div class="cost-list">${ctxRows}</div>
      </section>

      <section class="cost-section">
        <h3 class="cost-section__title">Por agente</h3>
        <div class="cost-list">${agentRows}</div>
      </section>

      <section class="cost-section">
        <h3 class="cost-section__title">Últimos 14 dias</h3>
        <div class="cost-bars">${bars}</div>
      </section>

      <section class="cost-section">
        <h3 class="cost-section__title">Configuração</h3>
        <label class="cost-rate">
          <span>Câmbio US$ → R$</span>
          <input type="number" step="0.01" min="0" id="brlRateInput" value="${Cost.brlRate()}" />
        </label>
        <p class="cost-note">Preço claude-sonnet-4: US$ 3 / milhão de tokens de entrada · US$ 15 / milhão de saída. Valores estimados a partir do uso reportado pela API.</p>
      </section>`;

    const rateInput = document.getElementById("brlRateInput");
    rateInput.addEventListener("change", () => {
      Cost.setBrlRate(rateInput.value);
      renderFull();
    });
  }

  function reset() {
    if (!confirm("Zerar todo o histórico de custos? Esta ação não pode ser desfeita.")) return;
    Cost.reset();
    renderFull();
  }

  function bind() {
    document.getElementById("openCostsBtn").addEventListener("click", open);
    document.getElementById("costsBackBtn").addEventListener("click", close);
    document.getElementById("costsResetBtn").addEventListener("click", reset);
  }

  return { renderMini, open, close, bind };
})();
