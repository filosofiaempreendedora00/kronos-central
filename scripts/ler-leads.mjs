/* Snapshot dos LEADS do SaaS → www/contexto/leads.json (CIFRADO, chave do cofre).
   Espelha o painel "Master" do gerador (mesma temperatura/fonte), só-leitura.
   A Central decifra e mostra a lista com filtros (temperatura + fonte).

   Racional da temperatura = idêntico ao gerador (src/lib/admin/data.ts):
     cliente (status active) > quente (baixou ≥1) > morno (logo/catálogo/contato) > frio.
   E-mail vem de ai_generations (o cofre só-leitura não acessa auth.users).

   Uso:
     KRONOS_PASS='email|senha' node scripts/ler-leads.mjs
     (ou KRONOS_EMAIL + KRONOS_PWD) */
import fs from "fs";
import crypto from "crypto";
import pg from "pg";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
const passphrase = process.env.KRONOS_PASS || ((email && pwd) ? email + "|" + pwd : "");
if (!passphrase) { console.error("Defina KRONOS_PASS OU KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }

const envFile = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const fromEnv = (name) => process.env[name] || (envFile.match(new RegExp(name + '\\s*=\\s*"?([^"\\n]+)"?')) || [])[1];
const dbUrl = fromEnv("GERADOR_DB_URL");
if (!dbUrl) { console.error("GERADOR_DB_URL não definido."); process.exit(1); }

const OUT = "www/contexto/leads.json";
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

// Contas internas (nunca aparecem). Sobrescreve com INTERNAL_EMAILS (csv) se quiser.
const INTERNAL = new Set(
  (fromEnv("INTERNAL_EMAILS") || "roberto_fpj@hotmail.com,robertofachetti2@gmail.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

const cli = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const q = async (sql, p) => (await cli.query(sql, p)).rows;
await cli.connect();

const rows = await q(`
  select
    o.id, o.name, o.plan, o.status, o.downloads_used, o.created_at, o.first_download_at,
    o.acquisition_source, o.acquisition_gclid, o.acquisition_fbclid,
    (select ag.user_email from ai_generations ag where ag.org_id=o.id and ag.user_email is not null
       order by ag.created_at limit 1) as email,
    (select c.phone from consultants c where c.org_id=o.id and c.phone ~ '[1-9]'
       and c.phone not like '%00000%' order by c.sort_order, c.created_at limit 1) as wa,
    (select coalesce(c.whatsapp_optin,false) from consultants c where c.org_id=o.id
       and c.phone ~ '[1-9]' and c.phone not like '%00000%' order by c.sort_order, c.created_at limit 1) as wa_optin,
    exists(select 1 from company_settings cs where cs.org_id=o.id
      and ((cs.logo is not null and length(cs.logo)>100) or (cs.logo_dark is not null and length(cs.logo_dark)>100))) as has_logo,
    exists(select 1 from consultants c where c.org_id=o.id
      and ((c.email ~ '@' and c.email <> 'consultor@suaempresa.com') or (c.phone ~ '[1-9]' and c.phone not like '%00000%'))) as consultant_contact,
    exists(select 1 from solutions s where s.org_id=o.id
      and (s.name !~ '^Solução [0-9]+$' or (s.tagline <> '' and s.tagline not in
        ('Resumo de uma linha do que esta solução entrega.','Outra frente de trabalho, totalmente preenchível.')))) as custom_solution
  from organizations o
  order by o.created_at desc
`);
await cli.end();

const toIso = (d) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));
const sourceOf = (o) =>
  o.acquisition_fbclid ? "meta" : o.acquisition_gclid ? "google" : (o.acquisition_source || "direto");
const tempOf = (o) => {
  if (o.status === "active") return "cliente";
  if ((o.downloads_used || 0) >= 1) return "quente";
  if (o.has_logo || o.custom_solution || o.consultant_contact) return "morno";
  return "frio";
};

const leads = rows
  .filter((o) => !INTERNAL.has(String(o.email || "").toLowerCase()))
  .map((o) => ({
    email: o.email || null,
    name: o.name || null,
    plan: o.plan,
    status: o.status,
    downloads: Number(o.downloads_used) || 0,
    source: sourceOf(o),
    temperature: tempOf(o),
    whatsapp: o.wa || null,
    whatsappOptin: !!o.wa_optin,
    createdAt: toIso(o.created_at),
    firstDownloadAt: toIso(o.first_download_at),
  }));

const count = (fn) => leads.filter(fn).length;
const totals = {
  total: leads.length,
  cliente: count((l) => l.temperature === "cliente"),
  quente: count((l) => l.temperature === "quente"),
  morno: count((l) => l.temperature === "morno"),
  frio: count((l) => l.temperature === "frio"),
  meta: count((l) => l.source === "meta"),
  google: count((l) => l.source === "google"),
  baixaram: count((l) => l.downloads > 0),
  paywall: count((l) => l.status !== "active" && l.downloads >= 3),
};

const doc = { type: "kronos.leads", version: 1, updatedAt: new Date().toISOString(),
  today: new Date().toISOString().slice(0, 10), totals, leads };
fs.writeFileSync(OUT, JSON.stringify(encryptDoc(doc)));
console.log(`ok — leads v1 cifrado · ${totals.total} leads`);
console.log(`  cliente ${totals.cliente} · quente ${totals.quente} · morno ${totals.morno} · frio ${totals.frio}`);
console.log(`  meta ${totals.meta} · google ${totals.google} · baixaram ${totals.baixaram} · paywall ${totals.paywall}`);
