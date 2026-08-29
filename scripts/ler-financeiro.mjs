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

// ---- Supabase: cadastros do mês ----
const cli = new pg.Client({ connectionString: fromEnv("GERADOR_DB_URL"), ssl: { rejectUnauthorized: false } });
await cli.connect();
const one = async (s, p) => (await cli.query(s, p)).rows[0].n;
const cadMes = await one(`select count(*)::int n from organizations where created_at::date>=$1`, [mStartStr]);
const cadGoogleMes = await one(`select count(*)::int n from organizations where created_at::date>=$1 and acquisition_gclid is not null`, [mStartStr]);
const cadMetaMes = await one(`select count(*)::int n from organizations where created_at::date>=$1 and acquisition_fbclid is not null`, [mStartStr]);
await cli.end();

const gSpend = google ? google.spend : 0;
const doc = {
  type: "kronos.financeiro", version: 1, updatedAt: now.toISOString(),
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
  cadastros: { total: cadMes, google: cadGoogleMes, meta: cadMetaMes },
};
fs.writeFileSync(OUT, JSON.stringify(encryptDoc(doc)));
console.log(`ok — financeiro cifrado · Google R$${Math.round(gSpend)} de R$${BUDGET_GOOGLE} (${Math.round((gSpend/BUDGET_GOOGLE)*100)}%) · ${cadGoogleMes} cad · R$${cadGoogleMes?Math.round(gSpend/cadGoogleMes):0}/cad · Meta R$${meta?Math.round(meta.spend):0}`);
