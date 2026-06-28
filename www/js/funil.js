/* ===========================================================================
   FUNIL — retrato vivo do funil do SaaS na home (entre Métricas e Custos).

   Lê www/contexto/funil.json (sincronizado, PÚBLICO mas CIFRADO) e decifra com a
   chave do cofre — mesmo padrão do histórico da Delfos (meetings.json). Mostra os
   KPIs do funil (cadastro → catálogo real → ativação → pagante), a variação vs a
   leitura anterior (melhora/piora ao longo do tempo) e insights automáticos.

   Os snapshots são gerados por `node scripts/ler-funil.mjs` (Supabase só-leitura +
   Meta best-effort). Cada execução grava um snapshot do dia e mantém o histórico.
   =========================================================================== */
const Funil = (() => {
  const PATH = "www/contexto/funil.json";

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const brl = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const fmtDate = (iso) => { // "2026-06-28" -> "28/06"
    if (!iso) return "";
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res;
    try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json; // Sync.readJson devolve { json, sha } — o envelope está em .json
    if (!env) return null;
    try {
      const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && Array.isArray(doc.snapshots) && doc.snapshots.length) ? doc : null;
    } catch (_) { return null; }
  }

  /* Selo de variação vs leitura anterior. goodUp=true → subir é bom (verde). */
  function delta(cur, prev, { goodUp = true, fmt = (n) => (n > 0 ? "+" : "") + n } = {}) {
    if (prev == null || cur == null) return `<span class="funil-card__delta funil-card__delta--flat">1ª leitura</span>`;
    const d = cur - prev;
    if (d === 0) return `<span class="funil-card__delta funil-card__delta--flat">→ estável</span>`;
    const up = d > 0;
    const good = goodUp ? up : !up;
    return `<span class="funil-card__delta funil-card__delta--${good ? "up" : "down"}">${up ? "▲" : "▼"} ${fmt(d)} vs leitura anterior</span>`;
  }

  function card(label, value, sub, deltaHtml, isKey) {
    return `<div class="metric-card funil-card${isKey ? " funil-card--key" : ""}">
      <span class="metric-card__label">${label}</span>
      <span class="metric-card__value">${value}</span>
      <span class="funil-card__sub">${sub || ""}</span>
      ${deltaHtml || ""}
    </div>`;
  }

  function insights(cur) {
    const out = [];
    const tAtiv = pct(cur.ativacao, cur.cadastros);
    out.push(`<b>Ativação:</b> ${tAtiv}% dos cadastros geram uma proposta${tAtiv < 50 ? " — este é o gargalo do funil." : "."}`);
    const lixo = cur.ativacao - cur.ativacaoReal;
    if (lixo > 0) out.push(`⚠️ ${lixo} de ${cur.ativacao} ativações usaram catálogo de EXEMPLO (proposta-lixo) — só ${cur.ativacaoReal} com catálogo real.`);
    if (cur.pagantes === 0) out.push(`<b>0 pagantes:</b> o funil ainda não fechou uma venda. Gate de escala = a 1ª assinatura.`);
    else out.push(`<b>${cur.pagantes} pagante(s)</b> · ${pct(cur.pagantes, cur.cadastros)}% dos cadastros.`);
    if (cur.meta && cur.meta.spend && cur.ativacao) out.push(`Custo por ativação ≈ <b>${brl(cur.meta.spend / cur.ativacao)}</b> (Meta: ${brl(cur.meta.spend)} ÷ ${cur.ativacao} ativações).`);
    if (cur.latencia && cur.latencia.mediana != null) {
      const med = cur.latencia.mediana < 1 ? "menos de 1h" : `${cur.latencia.mediana}h`;
      out.push(`Quem ativa, ativa rápido: mediana de ${med} do cadastro à 1ª proposta — ou nos primeiros minutos, ou nunca.`);
    }
    return out;
  }

  function render() {
    const sec = document.getElementById("funilSection");
    const grid = document.getElementById("funilGrid");
    const metaEl = document.getElementById("funilMeta");
    const insEl = document.getElementById("funilInsight");
    if (!grid) return;

    load().then((doc) => {
      if (!doc) {
        if (metaEl) metaEl.textContent = "";
        if (insEl) insEl.hidden = true;
        grid.innerHTML = `<p class="funil-empty">Sem leitura do funil ainda. Rode <code>node scripts/ler-funil.mjs</code> para gerar o 1º retrato.</p>`;
        return;
      }
      const cur = doc.snapshots[0];
      const prev = doc.snapshots[1] || null;
      const P = (k) => (prev ? prev[k] : null);

      const cards = [
        card("Cadastros", cur.cadastros, `de ${fmtDate(cur.period?.from)} a ${fmtDate(cur.period?.to)}`, delta(cur.cadastros, P("cadastros"))),
        card("Catálogo real", cur.catalogoReal, `${pct(cur.catalogoReal, cur.cadastros)}% dos cadastros`, delta(cur.catalogoReal, P("catalogoReal"))),
        card("Ativação · 1ª proposta", cur.ativacao, `${pct(cur.ativacao, cur.cadastros)}% dos cadastros`, delta(cur.ativacao, P("ativacao")), true),
        card("Pagantes", cur.pagantes, `${pct(cur.pagantes, cur.cadastros)}% dos cadastros`, delta(cur.pagantes, P("pagantes"))),
      ];
      if (cur.meta && cur.meta.spend && cur.ativacao) {
        const cpa = cur.meta.spend / cur.ativacao;
        const prevCpa = (prev && prev.meta && prev.meta.spend && prev.ativacao) ? prev.meta.spend / prev.ativacao : null;
        cards.push(card("Custo / ativação", brl(cpa), "Meta Ads · gasto ÷ ativações",
          delta(Math.round(cpa), prevCpa == null ? null : Math.round(prevCpa), { goodUp: false, fmt: (n) => (n > 0 ? "+" : "") + brl(Math.abs(n)).replace("R$ ", "R$") })));
      }
      grid.innerHTML = cards.join("");

      if (metaEl) metaEl.textContent = `leitura de ${fmtDate(cur.date)} · ${doc.snapshots.length} ${doc.snapshots.length === 1 ? "registro" : "registros"}`;
      if (insEl) {
        insEl.innerHTML = insights(cur).map((s) => `<span class="funil-insight__line">${s}</span>`).join("");
        insEl.hidden = false;
      }
    });
  }

  return { render };
})();
