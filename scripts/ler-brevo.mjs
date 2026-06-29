/* Leitura SÓ-GET do Brevo (e-mail transacional + leads) → Conselho/brevo-dados.md.
   Lê BREVO_API_KEY do .env.local. APENAS GET — nunca envia e-mail nem altera nada.
   Uso:  node scripts/ler-brevo.mjs   (escreve em Conselho/brevo-dados.md e imprime) */
import fs from "fs";

const key = (fs.readFileSync(".env.local", "utf8").match(/BREVO_API_KEY\s*=\s*"?([^"\n]+)"?/) || [])[1];
if (!key) { console.error("BREVO_API_KEY não encontrado em .env.local."); process.exit(1); }

const BASE = "https://api.brevo.com/v3";
async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "api-key": key, accept: "application/json" } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${body.message || JSON.stringify(body)}`);
  return body;
}
const tryGet = async (path) => { try { return await get(path); } catch (e) { return { _err: e.message }; } };

const L = [];
const out = (s = "") => L.push(s);
const n = (v) => Number(v || 0).toLocaleString("pt-BR");
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "—");

// --- chamadas (todas GET) ---
const acc = await tryGet("/account");
const contacts = await tryGet("/contacts?limit=1");          // .count = total de contatos
const lists = await tryGet("/contacts/lists?limit=50&sort=desc");
const agg = await tryGet("/smtp/statistics/aggregatedReport?days=90"); // deliverability transacional
const camps = await tryGet("/emailCampaigns?statistics=globalStats&limit=20&sort=desc");

const d = new Date();
out(`# DADOS DO BREVO — e-mail & leads (leitura só-GET)`);
out(`> Gerado por \`ler-brevo.mjs\`. APENAS GET — não envia nem altera. Re-rode quando quiser.`);
out(`> Leitura: ${d.toISOString().slice(0, 16).replace("T", " ")} · janela transacional: últimos 90 dias`);
out(``);

// Conta
out(`## Conta`);
if (acc._err) out(`- ⚠️ erro ao ler conta: ${acc._err}`);
else {
  const plans = (acc.plan || []).map((p) => `${p.type}${p.credits != null ? ` (${n(p.credits)} créditos)` : ""}`).join(" · ");
  out(`- ${acc.companyName || "—"} · login ${acc.email || "—"}`);
  if (plans) out(`- Plano: ${plans}`);
}
out(``);

// Contatos / listas
out(`## Leads / contatos`);
if (contacts._err) out(`- ⚠️ ${contacts._err}`);
else out(`- **Total de contatos: ${n(contacts.count)}**`);
if (!lists._err && Array.isArray(lists.lists)) {
  out(`- Listas (${lists.count || lists.lists.length}):`);
  lists.lists.slice(0, 15).forEach((l) => out(`  - ${l.name} — ${n(l.totalSubscribers)} inscritos${l.totalBlacklisted ? ` · ${n(l.totalBlacklisted)} blacklisted` : ""}`));
} else if (lists._err) out(`- ⚠️ listas: ${lists._err}`);
out(``);

// Deliverability (o ponto-chave: o e-mail pós-cadastro está sendo entregue ou indo pro spam?)
out(`## ✉️ Deliverability — e-mail transacional (últimos 90 dias)`);
if (agg._err) out(`- ⚠️ ${agg._err}`);
else {
  const req = agg.requests || 0;
  out(`| Métrica | N | % dos enviados |`);
  out(`|---|---|---|`);
  out(`| Enviados (requests) | ${n(req)} | 100% |`);
  out(`| **Entregues** | ${n(agg.delivered)} | ${pct(agg.delivered, req)} |`);
  out(`| Abertos (únicos) | ${n(agg.uniqueOpens ?? agg.opens)} | ${pct(agg.uniqueOpens ?? agg.opens, agg.delivered)} dos entregues |`);
  out(`| Cliques (únicos) | ${n(agg.uniqueClicks ?? agg.clicks)} | ${pct(agg.uniqueClicks ?? agg.clicks, agg.delivered)} dos entregues |`);
  out(`| Hard bounces | ${n(agg.hardBounces)} | ${pct(agg.hardBounces, req)} |`);
  out(`| Soft bounces | ${n(agg.softBounces)} | ${pct(agg.softBounces, req)} |`);
  out(`| Bloqueados | ${n(agg.blocked)} | ${pct(agg.blocked, req)} |`);
  out(`| Inválidos | ${n(agg.invalid)} | ${pct(agg.invalid, req)} |`);
  out(`| **Spam reports** | ${n(agg.spamReports)} | ${pct(agg.spamReports, req)} |`);
  out(`| Descadastros | ${n(agg.unsubscribed)} | ${pct(agg.unsubscribed, req)} |`);
  out(``);
  out(`> Leitura rápida: entrega ${pct(agg.delivered, req)} · abertura ${pct(agg.uniqueOpens ?? agg.opens, agg.delivered)} · spam ${pct(agg.spamReports, req)}. (Abertura baixa + spam/bounce alto = problema de deliverability.)`);
}
out(``);

// Campanhas (broadcasts), se houver
out(`## Campanhas de e-mail (broadcasts)`);
if (camps._err) out(`- ⚠️ ${camps._err}`);
else if (!camps.campaigns || !camps.campaigns.length) out(`- Nenhuma campanha (só transacional por enquanto).`);
else {
  camps.campaigns.slice(0, 10).forEach((c) => {
    const g = (c.statistics && c.statistics.globalStats) || {};
    out(`- "${c.name}" [${c.status}] — enviados ${n(g.sent)} · entregues ${n(g.delivered)} · abertos ${n(g.uniqueViews ?? g.viewed)} · cliques ${n(g.uniqueClicks ?? g.clickers)}`);
  });
}

const report = L.join("\n") + "\n";
fs.writeFileSync("Conselho/brevo-dados.md", report);
console.log(report);
