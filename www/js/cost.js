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

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  /* id único por interação — base do merge cross-device (sem duplicar). */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
  /* chave estável p/ entradas antigas (sem id), pra não duplicarem no merge. */
  function legacyKey(e) {
    return `L${e.ts || 0}-${e.agentId || ""}-${e.context || ""}-${Math.round((e.costUSD || 0) * 1e6)}`;
  }
  /* União por id de duas listas — o coração do backup que NÃO perde dado. */
  function mergeInto(base, incoming) {
    const byId = new Map();
    const add = (e) => {
      if (!e || typeof e !== "object") return;
      const id = e.id || legacyKey(e);
      if (!byId.has(id)) byId.set(id, { ...e, id });
    };
    (Array.isArray(base) ? base : []).forEach(add);
    (Array.isArray(incoming) ? incoming : []).forEach(add);
    const merged = [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (merged.length > MAX_ENTRIES) merged.splice(0, merged.length - MAX_ENTRIES);
    return merged;
  }

  /* Registra uma interação. ts em ms. */
  function log({ context, agentId, agentName, usage, costUSD }) {
    const list = all();
    list.push({
      id: genId(),
      ts: Date.now(),
      context: context || "chat",     // 'chat' | 'delfos'
      agentId: agentId || "",
      agentName: agentName || "",
      input: usage?.input || 0,
      output: usage?.output || 0,
      costUSD: costUSD || 0,
    });
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    save(list);
    scheduleBackup();
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  /* ---------------- Backup manual (Exportar / Importar .json) ------------- */
  function exportJSON() {
    return JSON.stringify(
      { type: "kronos.usage", version: 1, exportedAt: new Date().toISOString(), entries: all() },
      null, 2
    );
  }
  function importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, error: "Arquivo inválido (não é JSON)." }; }
    const incoming = Array.isArray(data) ? data : (Array.isArray(data && data.entries) ? data.entries : null);
    if (!incoming) return { ok: false, error: "Formato não reconhecido (esperado um histórico KRONOS)." };
    const before = all().length;
    const merged = mergeInto(all(), incoming);
    save(merged);
    scheduleBackup();
    return { ok: true, added: merged.length - before, total: merged.length };
  }

  /* -------------- Backup automático no GitHub (cross-device) -------------- */
  const USAGE_PATH = "www/contexto/usage.json";
  const SHA_KEY = "kronos.usageSha";
  let backupTimer = null;

  const syncOn = () => typeof Sync !== "undefined" && Sync.configured();

  function scheduleBackup() {
    if (!syncOn()) return; // sem token: fica só local (use Exportar pra não perder)
    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(() => { backupTimer = null; flushBackup(); }, 25000);
  }
  function entriesOf(json) {
    if (json && Array.isArray(json.entries)) return json.entries;
    return Array.isArray(json) ? json : [];
  }
  /* Puxa o histórico do GitHub e funde no local (ao abrir o app). */
  async function pullBackup() {
    if (!syncOn()) return { ok: false, error: "sem token" };
    let res;
    try { res = await Sync.readJson(USAGE_PATH); } catch (e) { return { ok: false, error: e.message || String(e) }; }
    try { if (res.sha) localStorage.setItem(SHA_KEY, res.sha); } catch (_) {}
    const remote = entriesOf(res.json);
    if (remote.length) save(mergeInto(all(), remote));
    return { ok: true, total: all().length };
  }
  /* Funde local+remoto e publica — nunca sobrescreve o de outro aparelho. */
  async function flushBackup() {
    if (!syncOn()) return { ok: false, error: "Sem token do GitHub." };
    let res;
    try { res = await Sync.readJson(USAGE_PATH); } catch (e) { return { ok: false, error: e.message || String(e) }; }
    let sha = res.sha || null;
    let merged = mergeInto(entriesOf(res.json), all());
    save(merged);
    const mkDoc = () => ({ type: "kronos.usage", version: 1, updatedAt: new Date().toISOString(), entries: all() });
    let w = await Sync.writeJson(USAGE_PATH, mkDoc(), sha, "custos: backup do histórico");
    if (w && w.conflict) {
      // outro aparelho publicou antes — re-puxa, funde e tenta 1x
      try {
        const r2 = await Sync.readJson(USAGE_PATH);
        sha = r2.sha || null;
        save(mergeInto(entriesOf(r2.json), all()));
        w = await Sync.writeJson(USAGE_PATH, mkDoc(), sha, "custos: backup do histórico");
      } catch (_) {}
    }
    try { if (w && w.ok && w.sha) localStorage.setItem(SHA_KEY, w.sha); } catch (_) {}
    return w || { ok: false, error: "falha desconhecida" };
  }
  const syncStatus = () => ({ configured: syncOn(), count: all().length });

  // Best-effort: sobe o que faltou ao ocultar/sair (não perde o último uso).
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && backupTimer) {
        clearTimeout(backupTimer); backupTimer = null; flushBackup();
      }
    });
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

  /* --------- Budget Anthropic (estimativa — a API não expõe o saldo) -------
     A chave de mensagens não lê o saldo da organização (não há endpoint público,
     e o navegador não acessa a Admin API). Então o fundador registra quanto
     colocou e a Central desconta o gasto rastreado para estimar o que resta. */
  const KEY_BUDGET = "kronos.budget";
  function getBudget() {
    try { const b = JSON.parse(localStorage.getItem(KEY_BUDGET)); if (b && Number.isFinite(b.amountUSD) && b.amountUSD > 0) return b; } catch (_) {}
    return null;
  }
  function setBudget(amountUSD) {
    const v = parseFloat(amountUSD);
    if (!Number.isFinite(v) || v <= 0) { localStorage.removeItem(KEY_BUDGET); return null; }
    const b = { amountUSD: v, sinceTs: Date.now() }; // marca o saldo a partir de agora
    localStorage.setItem(KEY_BUDGET, JSON.stringify(b));
    return b;
  }
  function budgetStatus() {
    const b = getBudget();
    if (!b) return null;
    const spent = all().filter((e) => e.ts >= b.sinceTs).reduce((a, e) => a + (e.costUSD || 0), 0);
    return {
      amountUSD: b.amountUSD, sinceTs: b.sinceTs, spentUSD: spent,
      remainingUSD: Math.max(0, b.amountUSD - spent),
      pct: Math.min(100, (spent / b.amountUSD) * 100),
    };
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

  return {
    log, reset, all, summary, brlRate, setBrlRate, usd, brl, tok,
    mergeInto, exportJSON, importJSON, pullBackup, flushBackup, syncStatus,
    getBudget, setBudget, budgetStatus,
  };
})();
