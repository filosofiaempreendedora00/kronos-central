/* Snapshot FINANCEIRO → www/contexto/financeiro.json (CIFRADO).
   A casa da FabIAna (CFO): custo de mídia (Google/Meta) vs orçamento, custo/cadastro,
   projeção do mês. Foco: o Google (métrica principal), orçamento-teto R$ 1500/mês.
   Uso: KRONOS_PASS='email|senha' node scripts/ler-financeiro.mjs */
import fs from "fs";
import crypto from "crypto";
import pg from "pg";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
const passphrase = process.env.KRONOS_PASS || ((email && pwd) ? email + "|" + pwd : "");
if (!passphrase) { console.error("Defina KRONOS_PASS OU KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }
const envFile = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const fromEnv = (name) => process.env[name] || (envFile.match(new RegExp(name + '\\s*=\\s*"?([^"\\n]+)"?')) || [])[1];

const OUT = "www/contexto/financeiro.json";
const ITER = 150000;
const deriveKey = (salt, iter) => crypto.pbkdf2Sync(passphrase, salt, iter, 32, "sha256");
function encryptDoc(obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", deriveKey(salt, ITER), iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), "utf8")), c.final()]);
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"),
    ct: Buffer.concat([ct, c.getAuthTag()]).toString("base64") };
}
function decryptDoc(e) {
  const key = deriveKey(Buffer.from(e.salt, "base64"), e.iter || ITER);
  const data = Buffer.from(e.ct, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAuthTag(data.subarray(data.length - 16));
  return JSON.parse(Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]).toString("utf8"));
}
try { decryptDoc(JSON.parse(fs.readFileSync("www/vault.enc", "utf8"))); }
catch (_) { console.error("✗ senha não abre o cofre. Nada gravado."); process.exit(1); }

const BUDGET_GOOGLE = Number(fromEnv("BUDGET_GOOGLE") || 1500); // teto mensal R$
const USD_BRL = Number(fromEnv("USD_BRL") || 5.5); // câmbio p/ converter API Anthropic
// preços Anthropic USD por 1M tokens (por modelo) — p/ custo real por geração
const PRICE = { "claude-haiku-4-5": { in: 1, out: 5 }, "claude-3-5-haiku": { in: 0.8, out: 4 },
  "claude-sonnet-4-6": { in: 3, out: 15 }, "claude-opus-4-8": { in: 5, out: 25 } };
const priceOf = (m) => PRICE[m] || { in: 1, out: 5 };
// custos fixos mensais (mensalidades). Fonte: scripts/custos-fixos.json (local, gitignored, você edita)
// ou secret CUSTOS_FIXOS_B64 (base64 do JSON) p/ o cron. Ex: [{"nome":"Claude","valorMes":500}]
// ordem: (1) arquivo local editável → (2) secret base64 → (3) preserva o que já está no financeiro.json (cron)
let fixos = null;
try {
  if (fs.existsSync("scripts/custos-fixos.json")) fixos = JSON.parse(fs.readFileSync("scripts/custos-fixos.json", "utf8"));
  else if (fromEnv("CUSTOS_FIXOS_B64")) fixos = JSON.parse(Buffer.from(fromEnv("CUSTOS_FIXOS_B64"), "base64").toString("utf8"));
} catch (e) { console.error("custos-fixos inválido:", e.message); fixos = null; }
if (fixos == null && fs.existsSync(OUT)) { // cron: reaproveita os fixos já cifrados
  try { const prev = decryptDoc(JSON.parse(fs.readFileSync(OUT, "utf8"))); if (Array.isArray(prev.fixos)) fixos = prev.fixos; } catch (_) {}
}
if (!Array.isArray(fixos)) fixos = [];
const fixosTotalMes = fixos.reduce((s, f) => s + (Number(f.valorMes) || 0), 0);
const now = new Date();
const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const daysElapsed = now.getDate();
const mStartStr = mStart.toISOString().slice(0, 10);
const today = now.toISOString().slice(0, 10);
const num = (s) => Number(String(s || "").replace(/[^0-9.]/g, "")) || 0;

// ---- Google (CSV agregado por campanha) ----
let google = null;
try {
  const gUrl = fromEnv("GOOGLE_CSV_URL");
  const txt = await (await fetch(gUrl)).text();
  const rel = txt.split(/\r?\n/).filter((l) => l.trim()).slice(1).map((l) => l.split(","))
    .filter((x) => /kronos|gerador|proposta/i.test(x[0] || ""));
  if (rel[0]) {
    const x = rel[0];
    const win = String(x[9] || ""); // 20260730..20260829
    const parts = win.split("..");
    const winDays = (parts.length === 2)
      ? Math.max(1, Math.round((new Date(`${parts[1].slice(0,4)}-${parts[1].slice(4,6)}-${parts[1].slice(6,8)}`) - new Date(`${parts[0].slice(0,4)}-${parts[0].slice(4,6)}-${parts[0].slice(6,8)}`)) / 86400000) + 1)
      : 30;
    const spend = num(x[6]);
    google = {
      status: (x[1] || "").trim(), spend, clicks: num(x[3]), impressions: num(x[2]),
      conversions: num(x[7]), cpc: num(x[5]), ctr: num(x[4]), costPerConv: num(x[8]),
      window: win, winDays, dailyRate: winDays ? spend / winDays : 0,
    };
  }
} catch (e) { console.error("Google CSV indisponível:", e.message); }

// ---- Meta (API, mês corrente) ----
let meta = null;
const metaTok = fromEnv("META_TOKEN");
if (metaTok) {
  try {
    const tr = encodeURIComponent(JSON.stringify({ since: mStartStr, until: today }));
    const j = await (await fetch(`https://graph.facebook.com/v20.0/act_1322770809264094/insights?fields=spend,clicks,actions&time_range=${tr}&access_token=${metaTok}`)).json();
    const d = j.data && j.data[0];
    if (d) {
      const reg = (d.actions || []).find((a) => /complete_registration/.test(a.action_type));
      meta = { spend: Number(d.spend || 0), clicks: Number(d.clicks || 0), cadastros: reg ? Number(reg.value) : 0 };
    } else meta = { spend: 0, clicks: 0, cadastros: 0 };
  } catch (e) { console.error("Meta indisponível:", e.message); }
}

// ---- Meta: série mensal (últimos 6 meses) ----
let metaSeries = {}; // "YYYY-MM" -> spend
if (metaTok) {
  try {
    const sixStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
    const tr = encodeURIComponent(JSON.stringify({ since: sixStart, until: today }));
    const j = await (await fetch(`https://graph.facebook.com/v20.0/act_1322770809264094/insights?fields=spend&time_range=${tr}&time_increment=monthly&access_token=${metaTok}`)).json();
    for (const d of (j.data || [])) { const mk = (d.date_start || "").slice(0, 7); if (mk) metaSeries[mk] = (metaSeries[mk] || 0) + Number(d.spend || 0); }
  } catch (e) { console.error("Meta série indisponível:", e.message); }
}

// ---- Supabase: cadastros + custo Anthropic (ai_generations) ----
const cli = new pg.Client({ connectionString: fromEnv("GERADOR_DB_URL"), ssl: { rejectUnauthorized: false } });
await cli.connect();
const one = async (s, p) => (await cli.query(s, p)).rows[0].n;
const cadMes = await one(`select count(*)::int n from organizations where created_at::date>=$1`, [mStartStr]);
const cadGoogleMes = await one(`select count(*)::int n from organizations where created_at::date>=$1 and acquisition_gclid is not null`, [mStartStr]);
const cadMetaMes = await one(`select count(*)::int n from organizations where created_at::date>=$1 and acquisition_fbclid is not null`, [mStartStr]);
const apiRows = (await cli.query(`select to_char(date_trunc('month',created_at),'YYYY-MM') mes, kind, model, count(*)::int n, sum(input_tokens)::bigint tin, sum(output_tokens)::bigint tout from ai_generations group by 1,2,3`)).rows;
const cadRows = (await cli.query(`select to_char(date_trunc('month',created_at),'YYYY-MM') mes, count(*)::int total, count(*) filter (where acquisition_gclid is not null)::int g, count(*) filter (where acquisition_fbclid is not null)::int f from organizations group by 1`)).rows;
await cli.end();

// custo Anthropic em R$ por linha
const brlOf = (model, tin, tout) => { const p = priceOf(model); return ((Number(tin) / 1e6) * p.in + (Number(tout) / 1e6) * p.out) * USD_BRL; };
// unit (histórico): custo médio por catálogo / por proposta
const unit = {};
for (const r of apiRows) { const b = brlOf(r.model, r.tin, r.tout); const u = unit[r.kind] || (unit[r.kind] = { n: 0, brl: 0 }); u.n += r.n; u.brl += b; }
for (const k of Object.keys(unit)) unit[k].brlEach = unit[k].n ? unit[k].brl / unit[k].n : 0;
const apiTotalBrl = Object.values(unit).reduce((s, u) => s + u.brl, 0);
// série mensal combinada (últimos 6 meses)
const gSpend = google ? google.spend : 0;
const curMonth = today.slice(0, 7);
const monthsSet = new Set([...apiRows.map((r) => r.mes), ...cadRows.map((r) => r.mes), ...Object.keys(metaSeries)]);
const series = [...monthsSet].sort().reverse().slice(0, 6).map((mes) => {
  const api = { catalogN: 0, catalogBrl: 0, transcriptN: 0, transcriptBrl: 0 };
  for (const r of apiRows.filter((x) => x.mes === mes)) { const b = brlOf(r.model, r.tin, r.tout);
    if (r.kind === "catalog") { api.catalogN += r.n; api.catalogBrl += b; } else { api.transcriptN += r.n; api.transcriptBrl += b; } }
  const c = cadRows.find((x) => x.mes === mes) || { total: 0, g: 0, f: 0 };
  return { mes, api, metaSpend: metaSeries[mes] || 0, googleSpend: (mes === curMonth ? gSpend : null), cad: { total: c.total, google: c.g, meta: c.f } };
});

const doc = {
  type: "kronos.financeiro", version: 2, updatedAt: now.toISOString(), usdBrl: USD_BRL,
  month: { start: mStartStr, today, daysElapsed, daysInMonth },
  budget: { google: BUDGET_GOOGLE },
  google: google ? {
    ...google,
    custoPorCadastro: cadGoogleMes ? gSpend / cadGoogleMes : (google.conversions ? gSpend / google.conversions : 0),
    pctBudget: BUDGET_GOOGLE ? gSpend / BUDGET_GOOGLE : 0,
    projecaoMes: google.dailyRate ? Math.round(google.dailyRate * daysInMonth) : gSpend,
    cadMes: cadGoogleMes,
  } : null,
  meta: meta ? { ...meta, cadMes: cadMetaMes, custoPorCadastro: cadMetaMes ? meta.spend / cadMetaMes : 0 } : null,
  fixos, fixosTotalMes,
  api: { unit, totalBrl: apiTotalBrl },
  series,
  cadastros: { total: cadMes, google: cadGoogleMes, meta: cadMetaMes },
};
fs.writeFileSync(OUT, JSON.stringify(encryptDoc(doc)));
const cat = unit.catalog || { n: 0, brlEach: 0 };
console.log(`ok — financeiro cifrado v2 · Google R$${Math.round(gSpend)}/R$${BUDGET_GOOGLE} (${Math.round((gSpend/BUDGET_GOOGLE)*100)}%) · Meta R$${meta?Math.round(meta.spend):0} · Fixos R$${Math.round(fixosTotalMes)}/mês · API R$${apiTotalBrl.toFixed(2)} (catálogo R$${cat.brlEach.toFixed(3)}/un) · ${series.length} meses de série`);
