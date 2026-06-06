# KRONOS CENTRAL

App desktop (Mac) que centraliza a operação da KRONOS: um **dashboard** com métricas da empresa e acesso direto aos **5 agentes de IA** (CEO, COO, CFO, Engenheiro de Prompt, Head de RH).

Cada agente conversa com seu próprio system prompt, em dois modos:

| Modo | Motor | Custo |
|------|-------|-------|
| **Hard** | API da Anthropic (`claude-sonnet-4`), com streaming | Pago por uso |
| **Easy** | Atalho para um chat seu no Claude (Desktop/web) | Grátis (não usa API) |

## Stack

HTML / CSS / JS puro — estático, sem backend. A chave da API é chamada direto do
frontend e fica salva apenas no `localStorage` do dispositivo. Compatível com
empacotamento via Electron, se necessário.

## Estrutura

```
Central/
├── index.html          # dashboard + chat (SPA de 2 views)
├── css/styles.css      # identidade visual
└── js/
    ├── agents.js       # definição dos 5 agentes (prompts + links Easy)
    ├── api.js          # cliente da API da Anthropic (streaming SSE)
    ├── chat.js         # chat individual + switcher de modos
    └── app.js          # dashboard, métricas, boot
```

## Rodar localmente

```bash
# servidor estático simples
python3 -m http.server 4599
# abra http://localhost:4599
```

Depois clique em **Configurar** e cole sua chave `sk-ant-...` (modo Hard).

## Funcionalidades (v1)

- Dashboard: cards dos 5 agentes + bloco de métricas editáveis manualmente.
- Chat individual com streaming, histórico por agente (`localStorage`).
- Switcher **Easy / Hard** por agente.
- Métricas e chave da API persistidas localmente.

## Roadmap

- [ ] Embutir os system prompts finais dos 5 agentes
- [ ] Sessão colaborativa (múltiplos agentes em sequência na mesma thread)
- [ ] Prompt caching / limite de histórico para economizar tokens
- [ ] Empacotamento Electron (.app para Mac)

## Identidade visual

- **Paleta:** Ônix Quente `#150C06` · Branco `#FFFFFF` · Sépia Profunda `#2E2017` · Areia Média `#A89070` · Creme `#F5EFE6`
- **Tipografia:** Cormorant (títulos) · Instrument Sans (interface)
- Ponteiros de relógio como motivo de marca.
