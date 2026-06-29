/* Leitura SÓ-GET do Microsoft Clarity (Data Export API) → Conselho/clarity-dados.md.
   Sinais de frustração AGREGADOS (rage/dead clicks, quickback, scroll) por dimensão.
   Lê CLARITY_TOKEN do .env.local. Apenas GET. Limite da API: últimos 1-3 dias, ~10 req/dia.
   Uso:  node scripts/ler-clarity.mjs [dimensao]   (dimensao padrão: URL; ex: Device, OS, Source) */
import fs from "fs";

const tok = (fs.readFileSync(".env.local", "utf8").match(/CLARITY_TOKEN\s*=\s*"?([^"\n]+)"?/) || [])[1];
if (!tok) { console.error("CLARITY_TOKEN não encontrado em .env.local."); process.exit(1); }

const dim = process.argv[2] || "URL";
const url = `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=${encodeURIComponent(dim)}`;
const r = await fetch(url, { headers: { Authorization: "Bearer " + tok } });
const body = await r.text();
if (!r.ok) { console.error(`Clarity API ${r.status}: ${body.slice(0, 500)}`); process.exit(1); }

let data;
try { data = JSON.parse(body); } catch { console.error("Resposta não-JSON:", body.slice(0, 500)); process.exit(1); }

const L = [];
const out = (s = "") => L.push(s);
out(`# DADOS DO CLARITY — sinais de frustração (Data Export API, só-GET)`);
out(`> Gerado por \`ler-clarity.mjs\`. Apenas GET. Janela: últimos 3 dias · dimensão: ${dim}`);
out(`> Leitura: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
out(``);

// A API devolve um array de métricas: { metricName, information: [ {linha}, ... ] }.
// Normaliza a URL (host+path, sem query) e AGREGA por página — senão cada fbclid
// vira uma linha e o relatório fica ilegível.
const norm = (u) => { try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, "") || x.host; } catch { return u || "(?)"; } };
const arr = Array.isArray(data) ? data : (data.metrics || [data]);
for (const m of arr) {
  const name = m.metricName || m.name || "(métrica)";
  const info = m.information || m.info || [];
  out(`## ${name}`);
  if (!Array.isArray(info) || !info.length) { out(`- (sem dados)`); out(``); continue; }
  const agg = {};
  for (const row of info) {
    const u = norm(row.Url || row.url);
    const sc = Number(row.sessionsCount || 0);
    const sub = Number(row.subTotal || 0);
    const withCount = Math.round(sc * Number(row.sessionsWithMetricPercentage || 0) / 100);
    (agg[u] = agg[u] || { sessions: 0, sub: 0, withCount: 0 });
    agg[u].sessions += sc; agg[u].sub += sub; agg[u].withCount += withCount;
  }
  const rows = Object.entries(agg)
    .map(([u, v]) => ({ u, ...v, pct: v.sessions ? Math.round(v.withCount / v.sessions * 100) : 0 }))
    .sort((a, b) => b.sub - a.sub || b.sessions - a.sessions);
  rows.slice(0, 12).forEach((r) => out(`- **${r.u}** — ${r.sub} ocorrências · ${r.sessions} sessões · ${r.pct}% das sessões com o sinal`));
  out(``);
}

const report = L.join("\n") + "\n";
fs.writeFileSync("Conselho/clarity-dados.md", report);
console.log(report);
