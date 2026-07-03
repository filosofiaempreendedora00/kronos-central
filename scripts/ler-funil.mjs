/* Snapshot do FUNIL do SaaS → www/contexto/funil.json (CIFRADO, chave do cofre).
   A home decifra e mostra o funil ponta a ponta (tráfego → cadastro → ativação →
   pagante) com filtros de data e fonte.

   FOCO 100% FREEMIUM: o piso é a data de início da CAMPANHA MAIS RECENTE do Meta
   (a isolada do freemium). Tudo antes (era checkout) fica de fora. Cliques = cliques
   no LINK (inline_link_clicks). Série DIÁRIA pra permitir filtro de data no app.

   Uso:
     KRONOS_PASS='email|senha' node scripts/ler-funil.mjs
     (ou KRONOS_EMAIL + KRONOS_PWD ; FREEMIUM_START='AAAA-MM-DD' força o piso) */
import fs from "fs";
import crypto from "crypto";
import pg from "pg";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
const passphrase = process.env.KRONOS_PASS || ((email && pwd) ? email + "|" + pwd : "");
if (!passphrase) { console.error("Defina KRONOS_PASS (a passphrase exata do cofre) OU KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }

// Lê de variáveis de ambiente (GitHub Actions) OU do .env.local (máquina local).
const envFile = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const fromEnv = (name) => process.env[name] || (envFile.match(new RegExp(name + '\\s*=\\s*"?([^"\\n]+)"?')) || [])[1];
const dbUrl = fromEnv("GERADOR_DB_URL");
if (!dbUrl) { console.error("GERADOR_DB_URL não definido (env var nem .env.local)."); process.exit(1); }
const metaTok = fromEnv("META_TOKEN");

const OUT = "www/contexto/funil.json";
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

// TRAVA: a passphrase TEM que abrir o cofre (mesma chave que o app usa).
try { decryptDoc(JSON.parse(fs.readFileSync("www/vault.enc", "utf8"))); }
catch (_) { console.error("✗ Esta senha NÃO abre o cofre (vault.enc). Use a senha de LOGIN do app. Nada gravado."); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);

// ---- Meta: campanha mais recente (= freemium) → piso + série diária de cliques no link ----
let freemiumStart = process.env.FREEMIUM_START || null;
let freemiumCampaign = null;
let metaDaily = [];
if (metaTok) {
  try {
    const BASE = "https://graph.facebook.com/v21.0";
    const get = async (p, q = {}) => {
      const r = await (await fetch(`${BASE}/${p}?${new URLSearchParams({ access_token: metaTok, ...q })}`)).json();
      if (r.error) throw new Error(r.error.message);
      return r;
    };
    const acc = (await get("me/adaccounts", { fields: "id", limit: 1 })).data[0];
    const camps = (await get(`${acc.id}/campaigns`, { fields: "name,created_time,start_time", limit: 50 })).data;
    camps.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    const fc = camps[0];
    freemiumCampaign = fc.name;
    if (!freemiumStart) freemiumStart = String(fc.start_time || fc.created_time).slice(0, 10);
    const rows = (await get(`${fc.id}/insights`, {
      time_range: JSON.stringify({ since: freemiumStart, until: today }),
      time_increment: 1, fields: "spend,inline_link_clicks,actions",
    })).data;
    metaDaily = rows.map((r) => ({
      date: r.date_start,
      linkClicks: Number(r.inline_link_clicks || 0),
      spend: Number(r.spend || 0),
      registrations: Number((r.actions || []).find((a) => a.action_type === "complete_registration")?.value || 0),
    }));
  } catch (e) { console.error("Meta indisponível (segue sem tráfego):", e.message); }
}
if (!freemiumStart) freemiumStart = "2026-06-21"; // fallback se Meta off

// ---- Google Ads (CSV publicado, público) → resumo da janela da campanha ----
// O CSV é agregado por campanha (não é série diária), então entra como resumo.
let google = null;
const gUrl = fromEnv("GOOGLE_CSV_URL");
if (gUrl) {
  try {
    const txt = await (await fetch(gUrl)).text();
    const parseLine = (line) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === "," && !q) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur); return out;
    };
    const num = (s) => Number(String(s || "").replace(/[^0-9.\-]/g, "")) || 0;
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.slice(1).map(parseLine);
    // col: 0 Campanha,1 Status,2 Impr,3 Cliques,4 CTR,5 CPC,6 Custo,7 Conv,8 Custo/conv,9 Janela
    const rel = rows.filter((x) => /kronos|gerador|proposta/i.test(x[0]) || /ativ/i.test(x[1] || "") || num(x[3]) > 0);
    if (rel.length) {
      const impressions = rel.reduce((s, x) => s + num(x[2]), 0);
      const clicks = rel.reduce((s, x) => s + num(x[3]), 0);
      const cost = rel.reduce((s, x) => s + num(x[6]), 0);
      const conversions = rel.reduce((s, x) => s + num(x[7]), 0);
      google = {
        impressions, clicks, cost, conversions,
        ctr: impressions ? clicks / impressions : 0,
        cpc: clicks ? cost / clicks : 0,
        costPerConv: conversions ? cost / conversions : 0,
        window: rel[0][9] || "", campaigns: rel.map((x) => x[0]),
      };
    }
  } catch (e) { console.error("Google indisponível (segue sem):", e.message); }
}

// ---- GA4 (CSV publicado, público) → funil de PRODUTO (onboarding → WOW → pay) ----
let produto = null;
// URL pública do CSV do GA4 (planilha publicada, não-secreta) — fallback embutido
// pra o cron funcionar sem secret; .env.local sobrescreve se quiser.
const ga4Url = fromEnv("GA4_CSV_URL") || "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTAq7pmu_h3DGne1wd9hIROL4fNd-eJBXDF1Y_uK-SemAEq4ZIsMmNl3RKEEwdI_bWF4FBWweSDiXk/pub?gid=1991838151&single=true&output=csv";
if (ga4Url) {
  try {
    const txt = await (await fetch(ga4Url)).text();
    const map = {};
    txt.split(/\r?\n/).slice(1).forEach((line) => {
      const cols = line.split(",");
      const ev = (cols[0] || "").trim();
      if (ev) map[ev] = Number(String(cols[1] || "0").replace(/[^0-9.]/g, "")) || 0;
    });
    const STEPS = [
      ["onboarding_view", "Viu o onboarding"],
      ["business_described", "Descreveu o negócio"],
      ["catalog_generated", "IA gerou o catálogo"],
      ["proposal_ready", "Proposta pronta"],
      ["chegou_ao_gerador", "Chegou ao gerador"],
      ["download_attempt", "Tentou baixar"],
      ["download_success", "Baixou · WOW"],
      ["upgrade_prompt_view", "Viu o \"assine\""],
      ["upgrade_prompt_click", "Clicou em assinar"],
    ];
    produto = { steps: STEPS.map(([key, label]) => ({ key, label, count: map[key] || 0 })) };
  } catch (e) { console.error("GA4 indisponível (segue sem):", e.message); }
}

// ---- Supabase (só-leitura): séries DIÁRIAS escopadas ao freemium ----
const cli = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const q = async (sql, p) => (await cli.query(sql, p)).rows;
await cli.connect();
const PLACE = `name ~* '^solu[çc][aã]o [0-9]'`; // "Solução N" = catálogo de exemplo
const S = [freemiumStart];
const cad = await q(`select created_at::date::text d, count(*)::int n from organizations where created_at::date >= $1 group by 1`, S);
const ativ = await q(`select first_download_at::date::text d, count(*)::int n from organizations where first_download_at is not null and first_download_at::date >= $1 group by 1`, S);
const ativR = await q(`select o.first_download_at::date::text d, count(*)::int n from organizations o
  where o.first_download_at is not null and o.first_download_at::date >= $1
    and exists(select 1 from solutions s where s.org_id=o.id and not (${PLACE})) group by 1`, S);
let pagantesTotal = 0;
try { pagantesTotal = (await q(`select count(*)::int n from billing_customers where created_at::date >= $1`, S))[0].n; }
catch (_) { try { pagantesTotal = (await q(`select count(*)::int n from billing_customers`))[0].n; } catch (__) {} }
await cli.end();

// junta as 3 séries num mapa por dia
const map = {};
const put = (rows, key) => rows.forEach((r) => { (map[r.d] = map[r.d] || { date: r.d, cadastros: 0, ativacoes: 0, ativacoesReal: 0 })[key] = r.n; });
put(cad, "cadastros"); put(ativ, "ativacoes"); put(ativR, "ativacoesReal");
const daily = Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1));

const doc = {
  type: "kronos.funil", version: 2, updatedAt: new Date().toISOString(),
  freemiumStart, freemiumCampaign, today, daily, metaDaily, pagantesTotal, google, produto,
};
fs.writeFileSync(OUT, JSON.stringify(encryptDoc(doc)));
const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
console.log(`ok — funil v2 cifrado · freemium desde ${freemiumStart}${freemiumCampaign ? ` (${freemiumCampaign})` : ""}`);
console.log(`  cadastros ${sum(daily, "cadastros")} · ativações ${sum(daily, "ativacoes")} (${sum(daily, "ativacoesReal")} reais) · pagantes ${pagantesTotal} · cliques-link ${sum(metaDaily, "linkClicks")} · gasto R$${Math.round(sum(metaDaily, "spend"))}`);
if (google) console.log(`  Google: ${google.clicks} cliques · ${google.conversions} conv · gasto R$${Math.round(google.cost)} · janela ${google.window}`);
