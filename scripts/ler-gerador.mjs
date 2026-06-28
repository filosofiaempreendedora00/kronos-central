/* Leitura SÓ-LEITURA do funil do Gerador (Supabase) → relatório objetivo p/ o Conselho.
   Lê GERADOR_DB_URL do .env.local. Apenas SELECT/agregados — nenhum dado pessoal.
   Uso:  node scripts/ler-gerador.mjs   (escreve em Conselho/gerador-dados.md e imprime) */
import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/GERADOR_DB_URL\s*=\s*"?([^"\n]+)"?/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = async (sql, p) => (await c.query(sql, p)).rows;
const L = [];
const out = (s = "") => L.push(s);

await c.connect();

// FUNIL
const f = (await q(`select
  count(*)::int total,
  count(*) filter (where downloads_used > 0)::int baixou,
  count(*) filter (where first_download_at is not null)::int ativou,
  count(*) filter (where status = 'active')::int ativos_status,
  min(created_at)::date::text desde, max(created_at)::date::text ate
  from organizations`))[0];
const pagantes = (await q(`select count(*)::int n from billing_customers`))[0].n;
// "Solução N" = placeholder semeado; nome diferente = configuração REAL
const PLACE = `name ~* '^solu[çc][aã]o [0-9]'`;
const realCfg = (await q(`select
  count(distinct org_id)::int orgs_real
  from solutions where not (${PLACE})`))[0].orgs_real;
const dlReal = (await q(`select count(*)::int n from organizations o
  where o.downloads_used > 0
    and exists(select 1 from solutions s where s.org_id=o.id and not (${PLACE}))`))[0].n;

// distribuição de downloads
const dist = await q(`select downloads_used, count(*)::int n from organizations group by 1 order by 1`);
// por plano/status
const planos = await q(`select coalesce(plan,'—') plan, coalesce(status,'—') status, count(*)::int n from organizations group by 1,2 order by 3 desc`);
// cadastros por semana
const semanas = await q(`select date_trunc('week', created_at)::date::text wk, count(*)::int n from organizations group by 1 order by 1`);
// config de catálogo por conta (quantas configuraram de verdade)
const cfg = (await q(`select
  count(*) filter (where sols > 0)::int com_solucao,
  count(*) filter (where cons > 0)::int com_consultor,
  count(*) filter (where logo)::int com_logo,
  count(*) filter (where sols > 0 and downloads_used > 0)::int config_e_baixou
  from (select o.id, o.downloads_used,
    (select count(*) from solutions s where s.org_id=o.id) sols,
    (select count(*) from consultants k where k.org_id=o.id) cons,
    exists(select 1 from company_settings cs where cs.org_id=o.id) logo
    from organizations o) x`))[0];
// exemplo vs real: nomes de solução mais comuns (placeholder denuncia conta não-configurada)
const nomes = await q(`select name, count(*)::int n from solutions group by 1 order by 2 desc, 1 limit 15`);
// latência de ativação (cadastro -> 1º download), em horas
const lat = (await q(`select
  round(avg(extract(epoch from (first_download_at - created_at))/3600)::numeric,1) media_h,
  round((percentile_cont(0.5) within group (order by extract(epoch from (first_download_at - created_at))/3600))::numeric,1) mediana_h
  from organizations where first_download_at is not null`))[0];

await c.end();

const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const d = new Date();
out(`# DADOS DO GERADOR — leitura objetiva do funil (Supabase)`);
out(`> Gerado por \`ler-gerador.mjs\` (só-leitura). Re-rode quando quiser — nunca defasa.`);
out(`> Leitura: ${d.toISOString().slice(0, 16).replace("T", " ")} · contas desde ${f.desde} até ${f.ate}`);
out(``);
out(`## O FUNIL (números reais)`);
out(`| Etapa | N | % das contas |`);
out(`|---|---|---|`);
out(`| Contas (cadastros) | ${f.total} | 100% |`);
out(`| Configuraram catálogo REAL (não-placeholder) | ${realCfg} | ${pct(realCfg, f.total)}% |`);
out(`| Baixaram ≥1 proposta (ATIVARAM) | ${f.baixou} | ${pct(f.baixou, f.total)}% |`);
out(`| Baixaram COM catálogo real | ${dlReal} | ${pct(dlReal, f.total)}% |`);
out(`| **Pagantes** | **${pagantes}** | **${pct(pagantes, f.total)}%** |`);
out(``);
out(`> ⚠️ ${f.baixou - dlReal} das ${f.baixou} contas que baixaram tinham só o catálogo de EXEMPLO ("Solução 1/2") → baixaram lixo.`);
out(`Sinais de config: ${cfg.com_solucao} têm alguma solução (mas só ${realCfg} têm solução REAL) · ${cfg.com_consultor} com consultor · ${cfg.com_logo} com logo (de ${f.total}).`);
if (lat.media_h != null) out(`Ativação: de cadastrar até baixar a 1ª — média ${lat.media_h}h, mediana ${lat.mediana_h}h.`);
out(``);
out(`## Distribuição de downloads por conta`);
dist.forEach((r) => out(`- ${r.downloads_used} download(s): ${r.n} conta(s)`));
out(``);
out(`## Por plano / status`);
planos.forEach((r) => out(`- plan=${r.plan} · status=${r.status}: ${r.n}`));
out(``);
out(`## Cadastros por semana`);
semanas.forEach((r) => out(`- ${r.wk}: ${r.n}`));
out(``);
out(`## Nomes de solução mais comuns (placeholder = conta não-configurada)`);
nomes.forEach((r) => out(`- "${r.name}" ×${r.n}`));

const report = L.join("\n") + "\n";
fs.writeFileSync("Conselho/gerador-dados.md", report);
console.log(report);
