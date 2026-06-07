/* ===========================================================================
   KRONOS CENTRAL — Agentes (somente código)

   ⚠️ Os DADOS sensíveis (prompts/escopos, cartilha, núcleo, briefing) NÃO ficam
   mais aqui. Eles vivem CRIPTOGRAFADOS em www/vault.enc e são destravados pela
   sua senha no login (Auth → applyKronosData). A fonte editável em texto puro
   fica só no seu Mac: www/_src/vault-source.json (ignorada pelo Git).
   Para editar e re-cifrar: node scripts/build-vault.mjs
   =========================================================================== */

// Preenchidos no login, a partir do cofre descriptografado.
let AGENTS = [];
let CONVERSATION_DOCTRINE = "";
let NAME_ROSTER = { proxima: null, prontos: { femininos: [], masculinos: [] }, backup: { nota: "", nomes: [] } };
let NIVEIS = [];

/* Recebe o cofre descriptografado e popula os globais + semeia o Context. */
function applyKronosData(d) {
  if (!d) return;
  AGENTS = Array.isArray(d.agents) ? d.agents : [];
  CONVERSATION_DOCTRINE = d.doctrine || "";
  if (d.nameRoster) NAME_ROSTER = d.nameRoster;
  NIVEIS = Array.isArray(d.niveis) ? d.niveis : [];
  if (typeof Context !== "undefined" && Context.seedBase) Context.seedBase(d.nucleo || "", d.briefing || "");
}

/* Cargo curto (sigla) p/ lugares apertados — ex.: a sala Delfos.
   Sem `cargoCurto`, cai no cargo completo (name). */
function cargoCurtoOf(agent) {
  return (agent && (agent.cargoCurto || agent.name)) || "";
}

/* Avatar de um agente: foto (se houver) ou as iniciais. */
function agentAvatarHTML(agent) {
  if (agent && agent.photo) {
    return `<img class="avatar-img" src="${agent.photo}" alt="${agent.nome || agent.name}" />`;
  }
  return agent ? (agent.initials || "") : "";
}

/* Métricas iniciais (editáveis manualmente, persistidas em localStorage).
   Não é sensível — continua aqui em texto puro. */
const DEFAULT_METRICS = [
  { id: "pipeline", label: "Pipeline", value: "—", unit: "" },
  { id: "receita", label: "Receita (MRR)", value: "—", unit: "" },
  { id: "tarefas", label: "Tarefas abertas", value: "—", unit: "" },
  { id: "clientes", label: "Clientes ativos", value: "—", unit: "" },
];
