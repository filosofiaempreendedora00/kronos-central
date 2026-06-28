/* ===========================================================================
   KRONOS CENTRAL — Cliente da API da Anthropic (chamada direta do frontend)
   --------------------------------------------------------------------------- */

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  // Sonnet 4.6 = mesma geração que você fala direto no Claude (NÃO é capado).
  // Mesmo preço do Sonnet anterior, porém mais inteligente e com raciocínio
  // estendido (thinking adaptativo) — o agente "pensa antes de responder".
  model: "claude-sonnet-4-6",
  version: "2023-06-01",
  // teto generoso: thinking + resposta cabem com folga (só cobra o que usar).
  maxTokens: 8192,
};

// Preço por 1 milhão de tokens (USD) — claude-sonnet-4-6 (igual ao 4 anterior)
const PRICING = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75, // cache_creation_input_tokens
  cacheRead: 0.30,  // cache_read_input_tokens
};

function getApiKey() {
  return localStorage.getItem("kronos.apiKey") || "";
}

/* Modelo barato p/ tarefas pequenas (ex.: destilar o ponteiro do Briefing). */
const HAIKU = { model: "claude-haiku-4-5", input: 1.0, output: 5.0 };

function parsePonteiroJSON(text) {
  try {
    const m = (text || "").match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : text);
    return { hoje: String(j.hoje || "").trim(), medio: String(j.medio || "").trim(), longo: String(j.longo || "").trim() };
  } catch (_) { return { hoje: "", medio: "", longo: "" }; }
}

/* Gera o "ponteiro" (HOJE/MÉDIO/LONGO) a partir do Briefing, com o modelo barato.
   Uma chamada curta e não-streaming. Devolve {hoje,medio,longo,usage,costUSD}. */
async function generatePonteiro(briefing, meetingsDigest) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");
  const system =
    "Você é o motor do \"ponteiro\" da KRONOS — a inteligência que destila o que de fato move o negócio AGORA.\n" +
    "Régua: \"isto move o ponteiro?\" = progresso mensurável rumo a receita/cliente/resultado.\n" +
    "Tom: seco, afirmativo, frase curta, sem hype, sem jargão, sem adjetivo de venda. Proibido a palavra \"empoderar\".\n" +
    "Fontes: o BRIEFING VIVO (cenário) e as ÚLTIMAS REUNIÕES DO CONSELHO (decisões). " +
    "As decisões do conselho têm PRIORIDADE sobre o briefing quando mais recentes — são a direção viva. " +
    "Se a reunião decidiu uma prioridade, o HOJE deve refletir essa decisão.\n" +
    "Tarefa: escreva três linhas cirúrgicas:\n" +
    "- HOJE: a ÚNICA prioridade que mais move o ponteiro agora (a ação concreta do dia, alinhada à decisão mais recente do conselho).\n" +
    "- MEDIO: o que precisa acontecer no médio prazo para o negócio avançar.\n" +
    "- LONGO: a direção de longo prazo.\n" +
    "Não invente número nem fato que não esteja nas fontes.\n" +
    "Responda APENAS com JSON puro, sem markdown: {\"hoje\":\"...\",\"medio\":\"...\",\"longo\":\"...\"}";
  const userMsg =
    "BRIEFING VIVO:\n\n" + String(briefing || "") +
    (meetingsDigest && meetingsDigest.trim()
      ? "\n\n---\nÚLTIMAS REUNIÕES DO CONSELHO (decisões recentes — PRIORIDADE sobre o briefing):\n" + meetingsDigest.trim()
      : "");
  const res = await fetch(ANTHROPIC.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC.version,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: HAIKU.model,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    let detail = ""; try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
    throw new Error(`API_${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const u = data.usage || {};
  const usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheWrite: 0, cacheRead: 0 };
  const costUSD = (usage.input * HAIKU.input + usage.output * HAIKU.output) / 1_000_000;
  return { ...parsePonteiroJSON(text), usage, costUSD, raw: text };
}

/* Calcula o custo em USD a partir do uso de tokens. */
function costFromUsage(u) {
  if (!u) return 0;
  return (
    ((u.input || 0) * PRICING.input +
      (u.output || 0) * PRICING.output +
      (u.cacheWrite || 0) * PRICING.cacheWrite +
      (u.cacheRead || 0) * PRICING.cacheRead) /
    1_000_000
  );
}

/**
 * Envia uma conversa e faz streaming da resposta.
 * @param {Object}   opts
 * @param {string}   opts.system     - system prompt do agente
 * @param {Array}    opts.messages   - [{role, content}]
 * @param {Function} opts.onText     - (chunk:string) a cada delta de texto
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{text:string, usage:Object, costUSD:number}>}
 */
async function streamMessage({ system, messages, onText, signal }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  /* PROMPT CACHING — corta custo sem perder inteligência.
     O system prompt (Núcleo + Escopo + Modo de Conversa + Briefing) é idêntico
     a cada turno; marcamos com cache_control para que, nas chamadas seguintes
     (dentro de ~5 min), ele seja lido do cache a ~10% do preço de input.
     Numa conversa de vários turnos, também cacheamos o histórico (marcando a
     última mensagem), então só o turno novo é cobrado como input cheio. */
  const systemBlocks = typeof system === "string"
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const cachedMessages = messages.map((m, i) => {
    // só cacheia o histórico quando há conversa de fato (>1 msg) — evita
    // desperdício em chamadas de turno único (ex.: cada agente na Delfos).
    if (i !== messages.length - 1 || messages.length < 2) return m;
    if (typeof m.content !== "string") return m;
    return {
      role: m.role,
      content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
    };
  });

  const res = await fetch(ANTHROPIC.url, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC.version,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC.model,
      max_tokens: ANTHROPIC.maxTokens,
      // RACIOCÍNIO ADAPTATIVO: o Claude decide sozinho quando (e quanto) pensar
      // antes de responder. Em pergunta simples quase não pensa (não encarece);
      // em pergunta difícil, raciocina a fundo — é o que tira o ar de "cru".
      thinking: { type: "adaptive" },
      system: systemBlocks,
      messages: cachedMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch (_) {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`API_${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // mantém a linha incompleta

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let evt;
      try {
        evt = JSON.parse(data);
      } catch (_) {
        continue; // linha não-JSON
      }

      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        full += evt.delta.text;
        onText?.(evt.delta.text);
      } else if (evt.type === "message_start" && evt.message?.usage) {
        const mu = evt.message.usage;
        usage.input = mu.input_tokens || 0;
        usage.output = mu.output_tokens || 0;
        usage.cacheWrite = mu.cache_creation_input_tokens || 0;
        usage.cacheRead = mu.cache_read_input_tokens || 0;
      } else if (evt.type === "message_delta" && evt.usage) {
        // output_tokens vem cumulativo no message_delta final
        if (typeof evt.usage.output_tokens === "number") usage.output = evt.usage.output_tokens;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Erro no stream");
      }
    }
  }

  return { text: full, usage, costUSD: costFromUsage(usage) };
}
