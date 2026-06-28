/* Leitura do Meta Ads (read-only) → relatório objetivo p/ o Conselho.
   Lê META_TOKEN do .env.local. Descobre a conta sozinho. Só GET (ads_read).
   Uso:  node scripts/ler-metaads.mjs   (escreve Conselho/metaads-dados.md e imprime) */
import fs from "fs";

const tok = fs.readFileSync(".env.local", "utf8").match(/META_TOKEN\s*=\s*"?([^"\n]+)"?/)[1].trim();
const BASE = "https://graph.facebook.com/v21.0";
const since = "2026-06-01";
const until = new Date().toISOString().slice(0, 10); // hoje
const get = async (path, params = {}) => {
  const qs = new URLSearchParams({ ...params, access_token: tok }).toString();
  const r = await (await fetch(`${BASE}/${path}?${qs}`)).json();
  if (r.error) throw new Error(r.error.message);
  return r;
};
const tr = JSON.stringify({ since, until });
const act = (row, type) => Number((row.actions || []).find((a) => a.action_type === type)?.value || 0);
const reg = (r) => act(r, "complete_registration");
const co = (r) => act(r, "initiate_checkout");
const pur = (r) => act(r, "purchase") + act(r, "offsite_conversion.fb_pixel_purchase");
const brl = (n) => "R$" + Number(n).toFixed(2);

// conta
const acc = (await get("me/adaccounts", { fields: "id,name,currency,amount_spent", limit: 1 })).data[0];
const F = "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions";

const a = (await get(`${acc.id}/insights`, { level: "account", time_range: tr, fields: F })).data[0] || {};
const camps = (await get(`${acc.id}/insights`, { level: "campaign", time_range: tr, fields: "campaign_name," + F, limit: 50 })).data;
const ads = (await get(`${acc.id}/insights`, { level: "ad", time_range: tr, fields: "ad_name," + F, limit: 50 })).data;

const L = [], out = (s = "") => L.push(s);
out(`# DADOS DO META ADS — leitura objetiva (read-only)`);
out(`> Gerado por \`ler-metaads.mjs\`. Re-rode quando quiser — nunca defasa.`);
out(`> Conta ${acc.id} (${acc.name}) · período ${since} → ${until} · leitura ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
out(``);
out(`## CONTA (período)`);
out(`- Gasto: **${brl(a.spend)}** · Cliques: ${a.clicks} · CTR: ${Number(a.ctr).toFixed(2)}% · CPC: ${brl(a.cpc)} · CPM: ${brl(a.cpm)}`);
out(`- Alcance: ${a.reach} · Frequência: ${Number(a.frequency).toFixed(2)}`);
out(`- **Cadastros (pixel): ${reg(a)}** → custo/cadastro **${brl(reg(a) ? a.spend / reg(a) : 0)}**`);
out(`- Checkouts iniciados: ${co(a)} · **Compras: ${pur(a)}**`);
out(``);
out(`## POR CAMPANHA`);
out(`| Campanha | Gasto | Cliques | CTR | CPC | Cadastros | R$/cadastro | Checkouts | Compras |`);
out(`|---|---|---|---|---|---|---|---|---|`);
camps.sort((x, y) => Number(y.spend) - Number(x.spend)).forEach((r) => {
  out(`| ${r.campaign_name} | ${brl(r.spend)} | ${r.clicks} | ${Number(r.ctr || 0).toFixed(2)}% | ${brl(r.cpc || 0)} | ${reg(r)} | ${brl(reg(r) ? r.spend / reg(r) : 0)} | ${co(r)} | ${pur(r)} |`);
});
out(``);
out(`## POR CRIATIVO (ad)`);
out(`| Criativo | Gasto | Cliques | CTR | Cadastros | R$/cadastro |`);
out(`|---|---|---|---|---|---|`);
ads.sort((x, y) => Number(y.spend) - Number(x.spend)).forEach((r) => {
  out(`| ${r.ad_name} | ${brl(r.spend)} | ${r.clicks} | ${Number(r.ctr || 0).toFixed(2)}% | ${reg(r)} | ${brl(reg(r) ? r.spend / reg(r) : 0)} |`);
});
out(``);
out(`> Atenção: o pixel pode subcontar cadastros vs o banco (atribuição). Cruzar com \`gerador-dados.md\`.`);

const report = L.join("\n") + "\n";
fs.writeFileSync("Conselho/metaads-dados.md", report);
console.log(report);
