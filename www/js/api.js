/* ===========================================================================
   KRONOS CENTRAL — Cliente da API da Anthropic (chamada direta do frontend)
   --------------------------------------------------------------------------- */

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  model: "claude-sonnet-4-20250514",
  version: "2023-06-01",
  maxTokens: 2048,
};

// Preço por 1 milhão de tokens (USD) — claude-sonnet-4
const PRICING = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75, // cache_creation_input_tokens
  cacheRead: 0.30,  // cache_read_input_tokens
};

function getApiKey() {
  return localStorage.getItem("kronos.apiKey") || "";
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
      system,
      messages,
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
