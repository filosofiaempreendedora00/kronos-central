/* Semeia o Kanban (aba Atividades) → www/contexto/kanban.json (CIFRADO, chave do
   cofre). As tarefas ficam DURÁVEIS no repo e aparecem em todos os aparelhos.
   Uso: KRONOS_PASS='email|senha' node scripts/kanban-seed.mjs
   ATENÇÃO: sobrescreve o kanban.json com esta lista (é uma semeadura inicial). */
import fs from "fs";
import crypto from "crypto";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
const passphrase = process.env.KRONOS_PASS || ((email && pwd) ? email + "|" + pwd : "");
if (!passphrase) { console.error("Defina KRONOS_PASS (a passphrase exata do cofre)."); process.exit(1); }

const ITER = 150000;
const deriveKey = (salt, iter) => crypto.pbkdf2Sync(passphrase, salt, iter, 32, "sha256");
function encryptDoc(obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", deriveKey(salt, ITER), iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), "utf8")), c.final()]);
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: Buffer.concat([ct, c.getAuthTag()]).toString("base64") };
}
function decryptDoc(e) {
  const key = deriveKey(Buffer.from(e.salt, "base64"), e.iter || ITER);
  const data = Buffer.from(e.ct, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAuthTag(data.subarray(data.length - 16));
  return JSON.parse(Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]).toString("utf8"));
}
// TRAVA: a passphrase tem que abrir o cofre (mesma chave do app).
try { decryptDoc(JSON.parse(fs.readFileSync("www/vault.enc", "utf8"))); }
catch (_) { console.error("✗ Esta senha NÃO abre o cofre. Use a senha de LOGIN do app. Nada gravado."); process.exit(1); }

// Tarefas do fundador (1-11) + sugestões do contexto (12-17). Todas em Backlog.
const TITLES = [
  "Garantir o tracking do Google Ads (validar conversões Cadastro e Ativação no Tag Assistant + Diagnóstico)",
  "Vincular o Kiwify ao Google Ads (conversão de Assinatura/compra ligada ao Google)",
  "Lapidar o funil da Central para a realidade do Google (incluir a fonte Google quando conectada)",
  "Limpar dados fakes remanescentes no banco (contas de teste que ainda distorcem)",
  "Vincular o Brevo à Central (todos os agentes verem os dados de e-mail/leads)",
  "Plugar coleta de WhatsApp ao produto (canal BR forte; avaliar custo da automação)",
  "Broadcast certeiro para os leads frios (reativação)",
  "UI/UX perfeita do preenchimento do cadastro com IA — momento WOW que puxa o lead do mobile pro navegador",
  "Treinar a IAra e criar novos agentes (ex.: editor de vídeos para criativos fodas, entre outras funções)",
  "Testar LinkedIn Ads (novo canal de aquisição)",
  "Adaptar o Kanban à metodologia ICE (Impact / Confidence / Ease) de growth",
  // sugestões (contexto):
  "Atribuição clique→conta: ligar gclid/fbclid à conta no cadastro (UTM/click-id) p/ filtrar o funil por fonte de verdade",
  "Conectar a leitura do Google Ads (read-only) à Central — trazer cliques/custos do Google ao funil e aos agentes",
  "Consertar a deliverability do e-mail pós-cadastro (Brevo caindo no spam)",
  "Resolver o descasamento de dispositivo (produto desktop-only × tráfego ~97% mobile): estratégia mobile/handoff",
  "Onboarding guiado no 1º uso para reduzir a fricção dos ~30 campos (além da IA preencher o catálogo)",
  "Definir o gate da 1ª venda: plano objetivo para fechar a 1ª assinatura paga (libera escalar verba)",
];

const base = Date.now();
const tasks = TITLES.map((title, i) => ({
  id: "t" + (base + i).toString(36) + i.toString(36),
  title, status: "backlog", deadline: null, createdAt: base + i,
}));

const doc = { type: "kronos.kanban", version: 1, updatedAt: Date.now(), tasks };
fs.writeFileSync("www/contexto/kanban.json", JSON.stringify(encryptDoc(doc)));
console.log(`ok — kanban.json cifrado · ${tasks.length} tarefas no Backlog`);
