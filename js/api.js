/* ===========================================================================
   KRONOS CENTRAL — Cliente da API da Anthropic (chamada direta do frontend)
   --------------------------------------------------------------------------- */

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  model: "claude-sonnet-4-20250514",
  version: "2023-06-01",
  maxTokens: 2048,
};

function getApiKey() {
  return localStorage.getItem("kronos.apiKey") || "";
}

/**
 * Envia uma conversa e faz streaming da resposta.
 * @param {Object}   opts
 * @param {string}   opts.system     - system prompt do agente
 * @param {Array}    opts.messages   - [{role:'user'|'assistant', content:'...'}]
 * @param {Function} opts.onText     - (chunk:string) chamado a cada delta de texto
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} texto completo da resposta
 */
async function streamMessage({ system, messages, onText, signal }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const res = await fetch(ANTHROPIC.url, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC.version,
      // Necessário para permitir chamadas diretas do navegador:
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

  // Parse de SSE (Server-Sent Events)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

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
      if (data === "[DONE]") continue;

      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          full += evt.delta.text;
          onText?.(evt.delta.text);
        } else if (evt.type === "error") {
          throw new Error(evt.error?.message || "Erro no stream");
        }
      } catch (_) {
        /* ignora linhas que não são JSON válido */
      }
    }
  }

  return full;
}
