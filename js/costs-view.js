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
          <span class="metric-card__value">${Cost.brl(c.v.cost)}</span>
          <span class="cost-sub">${Cost.usd(c.v.cost)} · ${c.v.calls} ${c.v.calls === 1 ? "interação" : "interações"}</span>
        </div>`
      )
      .join("");
  }

  /* Tela completa */
  function open() {
    App.showView("costsView");
    renderFull();
  }
  function close() {
    renderMini();
    App.navGo("dash");
  }

  function periodCard(label, v) {
    return `
      <div class="cost-card">
        <span class="cost-card__label">${label}</span>
        <span class="cost-card__value">${Cost.brl(v.cost)}</span>
        <span class="cost-card__brl">${Cost.usd(v.cost)}</span>
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
          <span class="cost-row__val">${Cost.brl(r.v.cost)}</span>
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
          <span class="cost-row__val">${Cost.brl(a.cost)}</span>
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
          <span class="cost-bar__val">${d.cost > 0 ? Cost.brl(d.cost) : "—"}</span>
        </div>`
      )
      .join("");

    document.getElementById("costsInner").innerHTML = `
      <div class="cost-cards">${periodCards}</div>

      <section class="cost-section">
        <h3 class="cost-section__title">Budget na Anthropic</h3>
        ${budgetBlock()}
      </section>

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
        <p class="cost-note">Preço claude-sonnet-4.6: US$ 3 / milhão de tokens de entrada · US$ 15 / milhão de saída (cache mais barato). Valores calculados a partir do uso reportado pela API — diferença para o painel da Anthropic vem só do câmbio.</p>
      </section>

      <section class="cost-section">
        <h3 class="cost-section__title">Backup do histórico</h3>
        <p class="cost-note">${backupNote()}</p>
        <div class="cost-backup">
          <button class="btn-ghost btn-ghost--sm" id="costExportBtn" type="button">Exportar (.json)</button>
          <button class="btn-ghost btn-ghost--sm" id="costImportBtn" type="button">Importar / juntar (.json)</button>
          ${Cost.syncStatus().configured ? '<button class="btn-ghost btn-ghost--sm" id="costBackupBtn" type="button">Fazer backup agora</button>' : ""}
        </div>
        <span class="settings__status" id="costBackupStatus"></span>
      </section>`;

    const rateInput = document.getElementById("brlRateInput");
    rateInput.addEventListener("change", () => {
      Cost.setBrlRate(rateInput.value);
      renderFull();
    });
    bindBackup();
    bindBudget();
  }

  /* ----------------------------- Budget Anthropic ------------------------ */
  let budgetEditing = false;
  function fmtShortDate(ts) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function budgetBlock() {
    const s = Cost.budgetStatus();
    if (!s || budgetEditing) {
      return `
        <p class="cost-note">A Anthropic não expõe o saldo pela API (a chave de mensagens não lê o saldo da organização). Registre aqui quanto você colocou de crédito — a Central desconta o gasto rastreado e estima o que resta, pra você saber quando realimentar.</p>
        <div class="cost-budget__set">
          <span class="cost-budget__prefix">US$</span>
          <input type="number" step="1" min="0" id="budgetInput" placeholder="ex.: 50" value="${s ? s.amountUSD : ""}" />
          <button class="btn-solid" id="budgetSaveBtn" type="button">Registrar</button>
        </div>`;
    }
    const lowClass = s.pct >= 80 ? " cost-budget--low" : "";
    return `
      <div class="cost-budget${lowClass}">
        <div class="cost-budget__nums">
          <span class="cost-budget__rem">${Cost.usd(s.remainingUSD)} <small>${Cost.brl(s.remainingUSD)}</small></span>
          <span class="cost-budget__of">disponíveis de ${Cost.usd(s.amountUSD)} colocados · marcado em ${fmtShortDate(s.sinceTs)}</span>
        </div>
        <div class="cost-budget__bar"><span style="width:${s.pct.toFixed(1)}%"></span></div>
        <div class="cost-budget__foot">
          <span>Já gastou: ${Cost.usd(s.spentUSD)} <small>(${Cost.brl(s.spentUSD)})</small></span>
          <button class="btn-ghost btn-ghost--sm" id="budgetEditBtn" type="button">Atualizar saldo</button>
        </div>
        <p class="cost-note">O crédito da Anthropic é em dólar; aqui a conta é toda em US$ (o R$ é só referência pelo câmbio). Estimativa pelo uso rastreado. Ao recolocar crédito, toque em “Atualizar saldo”.</p>
      </div>`;
  }
  function bindBudget() {
    const save = document.getElementById("budgetSaveBtn");
    if (save) {
      const doSave = () => { Cost.setBudget(document.getElementById("budgetInput").value); budgetEditing = false; renderFull(); };
      save.addEventListener("click", doSave);
      document.getElementById("budgetInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });
    }
    const edit = document.getElementById("budgetEditBtn");
    if (edit) edit.addEventListener("click", () => { budgetEditing = true; renderFull(); });
  }

  function backupNote() {
    const s = Cost.syncStatus();
    if (s.configured) {
      return `Backup automático no GitHub <strong>ligado</strong> — o histórico fica salvo e igual em todos os aparelhos (${s.count} registro(s)). Exportar gera uma cópia extra.`;
    }
    return `O histórico vive só neste aparelho. <strong>Exporte um .json de vez em quando</strong> para não perder, ou configure o token do GitHub em Configurar para backup automático e em todos os aparelhos.`;
  }

  function setBackupStatus(msg, ok) {
    const el = document.getElementById("costBackupStatus");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("settings__status--ok", !!ok);
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindBackup() {
    const exp = document.getElementById("costExportBtn");
    if (exp) exp.addEventListener("click", () => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`kronos-custos-${stamp}.json`, Cost.exportJSON());
      setBackupStatus("Arquivo exportado ✓ guarde em local seguro.", true);
    });

    const imp = document.getElementById("costImportBtn");
    if (imp) imp.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "application/json,.json";
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const r = Cost.importJSON(String(reader.result || ""));
          if (r.ok) { setBackupStatus(`Importado ✓ ${r.added} novo(s) · ${r.total} no total.`, true); renderFull(); }
          else setBackupStatus("⚠ " + r.error, false);
        };
        reader.readAsText(file);
      });
      input.click();
    });

    const bkp = document.getElementById("costBackupBtn");
    if (bkp) bkp.addEventListener("click", async () => {
      setBackupStatus("⟳ enviando ao GitHub…", true);
      const r = await Cost.flushBackup();
      if (r && r.ok) setBackupStatus("Backup publicado ✓ vale em todos os aparelhos.", true);
      else setBackupStatus("⚠ " + ((r && r.error) || "falhou"), false);
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
