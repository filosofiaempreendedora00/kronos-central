/* Snapshot dos LEADS + COMPORTAMENTO → www/contexto/leads.json (CIFRADO).
   A "casa do DamIAno" (CRO) na Central: cada lead com granularidade tipo Clarity —
   sessões, tempo, visitas, downloads, timeline de eventos, device, WhatsApp+LGPD.

   Fontes (Supabase só-leitura): organizations/consultants/solutions (perfil) +
   funnel_events (comportamento por org_id). E-mail via ai_generations.

   Uso: KRONOS_PASS='email|senha' node scripts/ler-leads.mjs
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
try { decryptDoc(JSON.parse(fs.readFileSync("www/vault.enc", "utf8"))); }
catch (_) { console.error("✗ Esta senha NÃO abre o cofre (vault.enc). Nada gravado."); process.exit(1); }

const INTERNAL = new Set(
  (fromEnv("INTERNAL_EMAILS") || "roberto_fpj@hotmail.com,robertofachetti2@gmail.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

const cli = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const q = async (sql, p) => (await cli.query(sql, p)).rows;
await cli.connect();

// ---- perfil dos leads ----
const rows = await q(`
  select o.id, o.name, o.plan, o.status, o.downloads_used, o.created_at, o.first_download_at,
    o.acquisition_source, o.acquisition_gclid, o.acquisition_fbclid, o.acquisition_first_url,
    (select ag.user_email from ai_generations ag where ag.org_id=o.id and ag.user_email is not null order by ag.created_at limit 1) as email,
    (select c.phone from consultants c where c.org_id=o.id and c.phone ~ '[1-9]' and c.phone not like '%00000%' order by c.whatsapp_optin desc, c.sort_order, c.created_at limit 1) as wa,
    (select coalesce(c.whatsapp_optin,false) from consultants c where c.org_id=o.id and c.phone ~ '[1-9]' and c.phone not like '%00000%' order by c.whatsapp_optin desc, c.sort_order, c.created_at limit 1) as wa_optin,
    exists(select 1 from company_settings cs where cs.org_id=o.id and ((cs.logo is not null and length(cs.logo)>100) or (cs.logo_dark is not null and length(cs.logo_dark)>100))) as has_logo,
    (exists(select 1 from ai_generations g where g.org_id=o.id and g.kind='catalog') or exists(select 1 from funnel_events e where e.org_id=o.id and e.event='catalog_generated')) as has_catalog,
    (exists(select 1 from ai_generations g where g.org_id=o.id and g.kind='transcript') or exists(select 1 from funnel_events e where e.org_id=o.id and e.event in ('transcript_uploaded','transcript_generated'))) as has_transcript,
    exists(select 1 from consultants c where c.org_id=o.id and ((c.email ~ '@' and c.email <> 'consultor@suaempresa.com') or (c.phone ~ '[1-9]' and c.phone not like '%00000%'))) as consultant_contact,
    exists(select 1 from solutions s where s.org_id=o.id and (s.name !~ '^Solução [0-9]+$' or (s.tagline <> '' and s.tagline not in ('Resumo de uma linha do que esta solução entrega.','Outra frente de trabalho, totalmente preenchível.')))) as custom_solution,
    exists(select 1 from solution_plans p where p.org_id=o.id and (p.name !~ '^Plano [0-9]+$' or p.price not in ('R$ 2.997','R$ 4.997','R$ 14.997'))) as custom_plan,
    (select string_agg(name,' · ') from (select name from solutions s where s.org_id=o.id and s.name !~ '^Solução [0-9]+$' order by created_at limit 3) x) as catalogo
  from organizations o
  order by o.created_at desc
`);

// ---- comportamento: todos os eventos com org_id (pequeno, cabe em memória) ----
const evs = await q(`
  select org_id, event, device, created_at
  from funnel_events
  where event <> '__smoke_test__' and org_id is not null
  order by created_at asc
`);
await cli.end();

// agrupa eventos por org e computa métricas de sessão/comportamento (Clarity-like)
const GAP_MIN = 30; // > 30min sem evento = nova sessão
const byOrg = {};
for (const e of evs) (byOrg[e.org_id] = byOrg[e.org_id] || []).push(e);
function behavior(list) {
  if (!list || !list.length) return null;
  const ts = list.map((e) => new Date(e.created_at).getTime());
  // sessões por gap
  let sessions = 1, sessStart = ts[0], totalMs = 0;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] > GAP_MIN * 60000) { totalMs += ts[i - 1] - sessStart; sessions++; sessStart = ts[i]; }
  }
  totalMs += ts[ts.length - 1] - sessStart;
  const days = new Set(list.map((e) => new Date(e.created_at).toISOString().slice(0, 10))).size;
  const devices = [...new Set(list.map((e) => e.device).filter(Boolean))];
  const cnt = (ev) => list.filter((e) => e.event === ev).length;
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    events: list.length,
    sessions,
    visitDays: days,
    totalMin: Math.round(totalMs / 60000),
    avgSessionMin: round1(totalMs / 60000 / sessions),
    firstSeen: new Date(ts[0]).toISOString(),
    lastSeen: new Date(ts[ts.length - 1]).toISOString(),
    devices,
    key: {
      downloads: cnt("download_success"),
      examples: cnt("example_downloaded"),
      watermark: cnt("watermark_download"),
      unlockClicks: cnt("unlock_click"),
      blocked: cnt("download_blocked"),
      upgradeViews: cnt("upgrade_prompt_view"),
      transcripts: cnt("transcript_generated") + cnt("transcript_uploaded"),
    },
    // timeline compacta (últimos 20 eventos) pro drill-down
    timeline: list.slice(-20).map((e) => ({ e: e.event, t: new Date(e.created_at).toISOString(), d: e.device || null })),
  };
}

const toIso = (d) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));
const sourceOf = (o) => o.acquisition_fbclid ? "meta" : o.acquisition_gclid ? "google" : (o.acquisition_source || "direto");
// telefone → dígitos wa.me (Brasil: prefixa 55 se vier sem DDI)
function waDigits(raw) { let d = String(raw || "").replace(/\D/g, ""); if (!d) return null; if (d.length <= 11 && !d.startsWith("55")) d = "55" + d; return d; }
// ESTÁGIO no funil (automações WhatsApp). Mesmos sinais do coletor _wa3 validado.
// 1 chegou/nada · 2 catálogo/parou · 3 +transcript/não baixou · 4 baixou marca-d'água/não pagou · 0 cliente/fora
function funnelStage(o, b) {
  if (o.status === "active") return 0; // já é cliente
  const hasCat = !!o.has_catalog;
  const hasTr = !!o.has_transcript || (b && b.key.transcripts > 0);
  const baixou = (Number(o.downloads_used) || 0) > 0 || (b && b.key.watermark > 0);
  if (!hasCat) return 1;
  if (hasCat && !hasTr && !baixou) return 2;
  if (hasTr && !baixou) return 3;
  if (baixou) return 4;
  return 0;
}
// TEMPERATURA DINÂMICA — engajamento (proximidade do dinheiro) DECAÍDO pela recência.
// Um quente que some vira morno e depois frio sozinho (o cron reavalia de 4/4h).
const DECAY = { hotToWarm: 7, hotToCold: 21, warmToCold: 14, newDays: 3 }; // dias (ajustáveis)
// Recência = atividade de PRODUTO (funnel_events). O gerador também tem essa tabela,
// então o critério é 100% replicável lá (e-mail fica só no histórico, não na temperatura).
function tempSituation(o, b) {
  if (o.status === "active") return { temp: "cliente", situation: "cliente", daysSince: 0 };
  const now = Date.now();
  const lastMs = (b && b.lastSeen) ? new Date(b.lastSeen).getTime() : new Date(o.created_at).getTime();
  const daysSince = Math.max(0, Math.floor((now - lastMs) / 86400000));
  const createdDays = Math.max(0, Math.floor((now - new Date(o.created_at).getTime()) / 86400000));
  const money = ((o.downloads_used || 0) >= 1) ||
    (b && (b.key.unlockClicks > 0 || b.key.watermark > 0 || b.key.upgradeViews > 0));
  const activated = money || (b && b.key.transcripts > 0) || o.has_logo || o.custom_solution || o.consultant_contact;
  const base = money ? "quente" : activated ? "morno" : "frio";
  if (base === "quente") {
    if (daysSince <= DECAY.hotToWarm) return { temp: "quente", situation: "ativo", daysSince };
    if (daysSince <= DECAY.hotToCold) return { temp: "morno", situation: "esfriando", daysSince };
    return { temp: "frio", situation: "dormente", daysSince };
  }
  if (base === "morno") {
    if (daysSince <= DECAY.warmToCold) return { temp: "morno", situation: "ativo", daysSince };
    return { temp: "frio", situation: "dormente", daysSince };
  }
  if (createdDays <= DECAY.newDays) return { temp: "frio", situation: "novo", daysSince };
  return { temp: "frio", situation: (b && b.events > 0) ? "espiou" : "sumiu", daysSince };
}

// ---- Brevo: eventos de e-mail (cliques + aberturas) por contato ----
const brevoKey = fromEnv("BREVO_API_KEY");
const emailByAddr = {};
if (brevoKey) {
  try {
    const H = { headers: { "api-key": brevoKey, accept: "application/json" } };
    for (const ev of ["clicks", "opened"]) {
      let offset = 0;
      while (offset < 4000) {
        const r = await (await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=100&offset=${offset}&event=${ev}&sort=desc`, H)).json();
        const list = r.events || [];
        for (const e of list) {
          const addr = String(e.email || "").toLowerCase(); if (!addr) continue;
          (emailByAddr[addr] = emailByAddr[addr] || []).push({
            t: e.date, type: ev === "clicks" ? "click" : "open", link: e.link || null, subject: e.subject || null,
          });
        }
        if (list.length < 100) break;
        offset += 100;
      }
    }
  } catch (e) { console.error("Brevo indisponível (segue sem e-mail):", e.message); }
}
const emailTotal = Object.values(emailByAddr).reduce((s, a) => s + a.length, 0);

const leads = rows
  .filter((o) => !INTERNAL.has(String(o.email || "").toLowerCase()))
  .map((o) => {
    const b = behavior(byOrg[o.id]);
    const mails = emailByAddr[String(o.email || "").toLowerCase()] || [];
    const ts = tempSituation(o, b);
    // histórico combinado (produto + e-mail), ordenado por data, últimos 25
    const prod = ((b && b.timeline) || []).map((e) => ({ ...e, ch: "product" }));
    const mail = mails.map((m) => ({ e: m.type === "click" ? "email_click" : "email_open", t: m.t, ch: "email", link: m.link, subject: m.subject }));
    const timeline = prod.concat(mail).sort((a, c) => new Date(a.t) - new Date(c.t)).slice(-25);
    return {
      id: o.id,
      email: o.email || null,
      name: o.name || null,
      catalogo: o.catalogo || null,
      setup: { logo: !!o.has_logo, solucao: !!o.custom_solution, contato: !!o.consultant_contact, plano: !!o.custom_plan },
      plan: o.plan,
      status: o.status,
      downloads: Number(o.downloads_used) || 0,
      source: sourceOf(o),
      temperature: ts.temp,
      situation: ts.situation,
      daysSince: ts.daysSince,
      whatsapp: o.wa || null,
      whatsappOptin: !!o.wa_optin, // LGPD: só clicável se true
      waDigits: (o.wa_optin ? waDigits(o.wa) : null), // só compõe wa.me se opt-in (LGPD)
      stage: funnelStage(o, b), // 1..4 no funil (0 = cliente/fora) — pras automações WhatsApp
      horasInativo: Math.floor((Date.now() - ((b && b.lastSeen) ? new Date(b.lastSeen).getTime() : new Date(o.created_at).getTime())) / 3600000),
      createdAt: toIso(o.created_at),
      firstDownloadAt: toIso(o.first_download_at),
      emailClicks: mails.filter((m) => m.type === "click").length,
      emailOpens: mails.filter((m) => m.type === "open").length,
      timeline,
      behavior: b,
    };
  });

const count = (fn) => leads.filter(fn).length;
const withB = leads.filter((l) => l.behavior);
const avg = (arr) => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
const totals = {
  total: leads.length,
  cliente: count((l) => l.temperature === "cliente"),
  quente: count((l) => l.temperature === "quente"),
  morno: count((l) => l.temperature === "morno"),
  frio: count((l) => l.temperature === "frio"),
  meta: count((l) => l.source === "meta"),
  google: count((l) => l.source === "google"),
  direto: count((l) => l.source === "direto" || l.source === "direct"),
  baixaram: count((l) => l.downloads > 0),
  paywall: count((l) => l.status !== "active" && l.downloads >= 3),
  comWhats: count((l) => l.whatsapp),
  comWhatsOptin: count((l) => l.whatsapp && l.whatsappOptin),
  // agregados de comportamento (padrões coletivos)
  avgSessionMin: withB.length ? Math.round(withB.reduce((s, l) => s + l.behavior.avgSessionMin, 0) / withB.length * 10) / 10 : 0,
  avgVisits: withB.length ? Math.round(withB.reduce((s, l) => s + l.behavior.sessions, 0) / withB.length * 10) / 10 : 0,
  voltaram: count((l) => l.behavior && l.behavior.sessions >= 2), // engajamento repetido
  esfriando: count((l) => l.situation === "esfriando"),
  dormente: count((l) => l.situation === "dormente"),
  novos: count((l) => l.situation === "novo"),
  comEmailClick: count((l) => l.emailClicks > 0),
};

const doc = { type: "kronos.leads", version: 2, updatedAt: new Date().toISOString(),
  today: new Date().toISOString().slice(0, 10), totals, leads };
fs.writeFileSync(OUT, JSON.stringify(encryptDoc(doc)));
console.log(`ok — leads v2 cifrado · ${totals.total} leads · ${withB.length} com comportamento`);
console.log(`  cliente ${totals.cliente} · quente ${totals.quente} · morno ${totals.morno} · frio ${totals.frio}`);
console.log(`  meta ${totals.meta} · google ${totals.google} · direto ${totals.direto} · baixaram ${totals.baixaram} · paywall ${totals.paywall}`);
console.log(`  whats ${totals.comWhats} (${totals.comWhatsOptin} opt-in) · sessão média ${totals.avgSessionMin}min · visitas média ${totals.avgVisits} · voltaram ${totals.voltaram}`);
console.log(`  e-mail (Brevo): ${emailTotal} eventos · ${totals.comEmailClick} leads clicaram em link`);
