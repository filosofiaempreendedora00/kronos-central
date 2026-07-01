/* Leitura SÓ-GET do Google Ads via CSV publicado (Google Ads Script → Planilha).
   Lê GOOGLE_CSV_URL do .env.local. A conta tem campanhas de vários projetos —
   este leitor FOCA nas da KRONOS / ativas / com dado e ignora as pausadas vazias.
   Uso: node scripts/ler-google.mjs   (escreve em Conselho/google-dados.md) */
import fs from "fs";

const url = (fs.readFileSync(".env.local", "utf8").match(/GOOGLE_CSV_URL\s*=\s*"?([^"\n]+)"?/) || [])[1];
if (!url) { console.error("GOOGLE_CSV_URL não encontrado em .env.local."); process.exit(1); }

const r = await fetch(url);
if (!r.ok) { console.error(`CSV ${r.status} — a planilha ainda está publicada como CSV?`); process.exit(1); }
const txt = await r.text();

// parser de linha CSV simples (respeita aspas com vírgula dentro)
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

const lines = txt.split(/\r?\n/).filter((l) => l.trim());
const header = parseLine(lines[0]);
const rows = lines.slice(1).map(parseLine);
const atualizado = (header.find((h) => /Atualizado/i.test(h)) || "").replace(/^Atualizado:\s*/, "").trim();
const janela = rows[0] ? rows[0][9] : "?";

// col: 0 Campanha,1 Status,2 Impr,3 Cliques,4 CTR,5 CPC,6 Custo,7 Conv,8 Custo/conv,9 Janela
const relevant = rows.filter((x) => /kronos|gerador|proposta/i.test(x[0]) || /ativ/i.test(x[1] || "") || Number(x[3]) > 0);
const ignored = rows.length - relevant.length;

const L = [];
const out = (s = "") => L.push(s);
out(`# DADOS DO GOOGLE ADS — via CSV publicado (só-GET)`);
out(`> Gerado por \`ler-google.mjs\`. Fonte: Google Ads Script → Planilha → CSV. Janela: ${janela}.`);
out(`> Planilha atualizada em: ${atualizado || "?"} · leitura: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
out(``);
out(`## Campanhas relevantes (KRONOS / ativas / com dado)`);
out(`| Campanha | Status | Impr. | Cliques | CTR | CPC | Custo | Conv. | Custo/conv |`);
out(`|---|---|---|---|---|---|---|---|---|`);
relevant.forEach((x) => out(`| ${x[0]} | ${x[1]} | ${x[2]} | ${x[3]} | ${x[4]} | R$ ${x[5]} | R$ ${x[6]} | ${x[7]} | ${x[8] === "—" ? "—" : "R$ " + x[8]} |`));
out(``);
out(`> ${ignored} campanha(s) pausada(s)/de outros projetos, sem dado — ignoradas.`);

const report = L.join("\n") + "\n";
fs.writeFileSync("Conselho/google-dados.md", report);
console.log(report);
