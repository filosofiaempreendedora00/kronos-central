/* Snapshot do FUNIL do SaaS → www/contexto/funil.json (CIFRADO, mesma chave do cofre).
   A home do app decifra e mostra os KPIs do funil + variação ao longo do tempo.
   Fonte: Supabase do Gerador (só-leitura) + Meta Ads (best-effort, se houver token).

   Uso:
     KRONOS_EMAIL="..." KRONOS_PWD="..." node scripts/ler-funil.mjs

   Re-rode quando quiser: cada execução grava UM snapshot do dia (dedup por data)
   e mantém o histórico — é assim que a home mostra melhora/piora ao longo do tempo. */
import fs from "fs";
import crypto from "crypto";
import pg from "pg";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
if (!email || !pwd) { console.error("Defina KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }
const passphrase = email + "|" + pwd;

const envFile = fs.readFileSync(".env.local", "utf8");
const dbUrl = (envFile.match(/GERADOR_DB_URL\s*=\s*"?([^"\n]+)"?/) || [])[1];
if (!dbUrl) { console.error("GERADOR_DB_URL não encontrado em .env.local."); process.exit(1); }
const metaTok = (envFile.match(/META_TOKEN\s*=\s*"?([^"\n]+)"?/) || [])[1];

const OUT = "www/contexto/funil.json";
const ITER = 150000;
const deriveKey = (salt, iter) => crypto.pbkdf2Sync(passphrase, salt, iter, 32, "sha256");
function encryptDoc(obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = deriveKey(salt, ITER);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), "utf8")), c.final()]);
  const tag = c.getAuthTag();
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER,
    salt: salt.toString("base64"), iv: iv.toString("base64"),
    ct: Buffer.concat([ct, tag]).toString("base64") };
}
function decryptDoc(e) {
  const key = deriveKey(Buffer.from(e.salt, "base64"), e.iter || ITER);
  const data = Buffer.from(e.ct, "base64");
  const tag = data.subarray(data.length - 16), ct = data.subarray(0, data.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
}

// ---- Supabase (só-leitura) ----
const cli = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const q = async (sql) => (await cli.query(sql)).rows;
await cli.connect();
const PLACE = `name ~* '^solu[çc][aã]o [0-9]'`; // "Solução N" = catálogo de exemplo (não-configurado)
const f = (await q(`select count(*)::int total,
  count(*) filter (where downloads_used > 0)::int baixou,
  min(created_at)::date::text desde, max(created_at)::date::text ate
  from organizations`))[0];
const pagantes = (await q(`select count(*)::int n from billing_customers`))[0].n;
const realCfg = (await q(`select count(distinct org_id)::int n from solutions where not (${PLACE})`))[0].n;
const dlReal = (await q(`select count(*)::int n from organizations o
  where o.downloads_used > 0
    and exists(select 1 from solutions s where s.org_id = o.id and not (${PLACE}))`))[0].n;
const lat = (await q(`select
  round(avg(extract(epoch from (first_download_at - created_at))/3600)::numeric, 1) media,
  round((percentile_cont(0.5) within group (order by extract(epoch from (first_download_at - created_at))/3600))::numeric, 1) mediana
  from organizations where first_download_at is not null`))[0];
await cli.end();

// ---- Meta Ads (best-effort: se token faltar/expirar, segue sem) ----
let meta = null;
if (metaTok) {
  try {
    const BASE = "https://graph.facebook.com/v21.0";
    const get = async (path, params = {}) => {
      const qs = new URLSearchParams({ access_token: metaTok, ...params });
      const r = await (await fetch(`${BASE}/${path}?${qs}`)).json();
      if (r.error) throw new Error(r.error.message);
      return r;
    };
    const acc = (await get("me/adaccounts", { fields: "id", limit: 1 })).data[0];
    const ins = (await get(`${acc.id}/insights`, { level: "account", date_preset: "maximum", fields: "spend,actions" })).data[0] || {};
    const reg = Number((ins.actions || []).find((a) => a.action_type === "complete_registration")?.value || 0);
    meta = { spend: Math.round(Number(ins.spend || 0)), cadastros: reg };
  } catch (e) { console.error("Meta indisponível (segue sem):", e.message); }
}

// ---- monta o snapshot do dia ----
const today = new Date().toISOString().slice(0, 10);
const snap = {
  date: today,
  period: { from: f.desde, to: f.ate },
  cadastros: f.total,
  catalogoReal: realCfg,
  ativacao: f.baixou,
  ativacaoReal: dlReal,
  pagantes,
  latencia: { media: lat.media == null ? null : Number(lat.media), mediana: lat.mediana == null ? null : Number(lat.mediana) },
  meta,
};

// ---- anexa ao histórico cifrado (dedup por data, mais recente primeiro) ----
let snapshots = [];
if (fs.existsSync(OUT)) {
  try {
    const e = JSON.parse(fs.readFileSync(OUT, "utf8"));
    const doc = (e && e.v && e.ct) ? decryptDoc(e) : e;
    if (doc && Array.isArray(doc.snapshots)) snapshots = doc.snapshots;
  } catch (err) { console.error("Aviso: não consegui ler o funil.json atual:", err.message); }
}
snapshots = snapshots.filter((s) => s.date !== today);
snapshots.unshift(snap);
snapshots.sort((a, b) => (a.date < b.date ? 1 : -1));

fs.writeFileSync(OUT, JSON.stringify(encryptDoc({ type: "kronos.funil", version: 1, updatedAt: new Date().toISOString(), snapshots })));
console.log(`ok — funil.json cifrado · ${snapshots.length} leitura(s) · hoje: ${f.total} cadastros · ${f.baixou} ativações (${realCfg} catálogo real, ${dlReal} ativação real) · ${pagantes} pagantes${meta ? ` · Meta R$${meta.spend} / ${meta.cadastros} cad` : ""}`);
