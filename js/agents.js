/* ===========================================================================
   KRONOS CENTRAL — Definição dos agentes

   Cada agente tem DOIS modos de conversa:
   • HARD  → usa a API da Anthropic (systemPrompt abaixo). Tem custo por uso.
   • EASY  → abre um chat seu no Claude (Desktop/web) com as mesmas instruções.
             Sem custo de API. O link (easyUrl) pode ser colado aqui OU dentro
             do app, no próprio modo Easy (fica salvo no localStorage).
   =========================================================================== */

const AGENTS = [
  {
    id: "ceo",
    name: "CEO",
    role: "Estratégia & Visão",
    initials: "CE",
    status: "online",
    blurb: "Direção, prioridades e decisões de alto nível.",
    systemPrompt: "PLACEHOLDER — cole aqui o prompt completo do CEO.",
    easyUrl: "", // ex.: "https://claude.ai/chat/xxxxxxxx" (chat com as instruções do CEO)
  },
  {
    id: "coo",
    name: "COO",
    role: "Operações & Execução",
    initials: "CO",
    status: "online",
    blurb: "Processos, execução e eficiência operacional.",
    systemPrompt: "PLACEHOLDER — cole aqui o prompt completo do COO.",
    easyUrl: "",
  },
  {
    id: "cfo",
    name: "CFO",
    role: "Finanças & Capital",
    initials: "CF",
    status: "online",
    blurb: "Caixa, projeções e disciplina financeira.",
    systemPrompt: "PLACEHOLDER — cole aqui o prompt completo do CFO.",
    easyUrl: "",
  },
  {
    id: "prompt-engineer",
    name: "Engenheiro de Prompt",
    role: "IA & Automação",
    initials: "EP",
    status: "online",
    blurb: "Desenho de prompts, automações e uso de IA.",
    systemPrompt: "PLACEHOLDER — cole aqui o prompt completo do Engenheiro de Prompt.",
    easyUrl: "",
  },
  {
    id: "head-rh",
    name: "Head de RH",
    role: "Pessoas & Cultura",
    initials: "RH",
    status: "online",
    blurb: "Time, contratações e cultura da empresa.",
    systemPrompt: "PLACEHOLDER — cole aqui o prompt completo do Head de RH.",
    easyUrl: "",
  },
];

/* Métricas iniciais (editáveis manualmente, persistidas em localStorage). */
const DEFAULT_METRICS = [
  { id: "pipeline", label: "Pipeline", value: "—", unit: "" },
  { id: "receita", label: "Receita (MRR)", value: "—", unit: "" },
  { id: "tarefas", label: "Tarefas abertas", value: "—", unit: "" },
  { id: "clientes", label: "Clientes ativos", value: "—", unit: "" },
];
