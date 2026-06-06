/* ===========================================================================
   KRONOS CENTRAL — Custos
   Registra o uso de tokens/custo de cada chamada e agrega por período.
   =========================================================================== */

const Cost = (() => {
  const KEY = "kronos.usage";
  const KEY_BRL = "kronos.brlRate";
  const MAX_ENTRIES = 5000;

  function all() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(s)) return s;
    } catch (_) {}
    return [];
  }

  /* Registra uma interação. ts em ms. */
  function log({ context, agentId, agentName, usage, costUSD }) {
    const list = all();
    list.push({
      ts: Date.now(),
      context: context || "chat",     // 'chat' | 'delfos'
      agentId: agentId || "",
      agentName: agentName || "",
      input: usage?.input || 0,
      output: usage?.output || 0,
      costUSD: costUSD || 0,
    });
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  /* Câmbio USD→BRL (editável). */
  function brlRate() {
    const r = parseFloat(localStorage.getItem(KEY_BRL));
    return Number.isFinite(r) && r > 0 ? r : 5.4;
  }
  function setBrlRate(r) {
    const v = parseFloat(r);
    if (Number.isFinite(v) && v > 0) localStorage.setItem(KEY_BRL, String(v));
  }

  /* ----------------------------- Agregações ------------------------------ */
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function sum(entries) {
    return entries.reduce(
      (a, e) => {
        a.cost += e.costUSD;
        a.input += e.input;
        a.output += e.output;
        a.calls += 1;
        return a;
      },
      { cost: 0, input: 0, output: 0, calls: 0 }
    );
  }

  function summary() {
    const list = all();
    const now = Date.now();
    const todayStart = startOfDay(now);
    const weekStart = todayStart - 6 * 86400000;   // últimos 7 dias
    const monthStart = todayStart - 29 * 86400000;  // últimos 30 dias

    const today = sum(list.filter((e) => e.ts >= todayStart));
    const week = sum(list.filter((e) => e.ts >= weekStart));
    const month = sum(list.filter((e) => e.ts >= monthStart));
    const total = sum(list);

    // por agente (total)
    const byAgentMap = {};
    for (const e of list) {
      const k = e.agentName || e.agentId || "—";
      (byAgentMap[k] ||= { name: k, cost: 0, calls: 0, input: 0, output: 0 });
      byAgentMap[k].cost += e.costUSD;
      byAgentMap[k].calls += 1;
      byAgentMap[k].input += e.input;
      byAgentMap[k].output += e.output;
    }
    const byAgent = Object.values(byAgentMap).sort((a, b) => b.cost - a.cost);

    // por contexto
    const byContext = {
      chat: sum(list.filter((e) => e.context === "chat")),
      delfos: sum(list.filter((e) => e.context === "delfos")),
    };

    // últimos 14 dias (para mini-gráfico)
    const byDay = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = todayStart - i * 86400000;
      const dayEnd = dayStart + 86400000;
      const s = sum(list.filter((e) => e.ts >= dayStart && e.ts < dayEnd));
      const d = new Date(dayStart);
      byDay.push({
        label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        cost: s.cost,
        calls: s.calls,
      });
    }

    return { today, week, month, total, byAgent, byContext, byDay };
  }

  /* ----------------------------- Formatação ------------------------------ */
  function fmtNum(v) {
    if (!v) return "0,00";
    const dec = v < 0.01 ? 4 : 2;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function usd(v) { return "US$ " + fmtNum(v); }
  function brl(v) { return "R$ " + fmtNum((v || 0) * brlRate()); }
  function tok(n) {
    if (n >= 1000) return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
    return String(n || 0);
  }

  return { log, reset, all, summary, brlRate, setBrlRate, usd, brl, tok };
})();
