# KRONOS CENTRAL

App desktop (Mac) que centraliza a operação da KRONOS: um **dashboard** com métricas da empresa e acesso direto aos **5 agentes de IA** (CEO, COO, CFO, Engenheiro de Prompt, Head de RH).

Cada agente conversa com seu próprio system prompt, em dois modos:

| Modo | Motor | Custo |
|------|-------|-------|
| **Hard** | API da Anthropic (`claude-sonnet-4`), com streaming | Pago por uso |
| **Easy** | Atalho para um chat seu no Claude (Desktop/web) | Grátis (não usa API) |

## Stack

HTML / CSS / JS puro — estático, sem backend. A chave da API é chamada direto do
frontend e fica salva apenas no `localStorage` do dispositivo.

O **mesmo** código web roda em três alvos:
- **Web** (qualquer navegador / servidor estático)
- **Desktop Mac** via **Electron** (`electron/`)
- **iOS** (planejado) via **Capacitor**, reaproveitando os mesmos arquivos

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

### Web (navegador)
```bash
python3 -m http.server 4599   # ou: npm run web
# abra http://localhost:4599
```

### App Mac (Electron)
```bash
npm install      # primeira vez (baixa o Electron)
npm start        # abre a janela nativa do KRONOS Central
```

### Empacotar o .app / .dmg para Mac
```bash
npm install --save-dev electron-builder   # primeira vez
npm run dist:mac                          # gera em dist/
```

Em qualquer alvo: clique em **Configurar** e cole sua chave `sk-ant-...` (modo Hard).

## Funcionalidades (v1)

- Dashboard: cards dos 5 agentes + bloco de métricas editáveis manualmente.
- Chat individual com streaming, histórico por agente (`localStorage`).
- Switcher **Easy / Hard** por agente.
- Métricas e chave da API persistidas localmente.

## Roadmap

- [x] Embutir os system prompts finais dos 5 agentes
- [x] Sessão colaborativa — Delfos (múltiplos agentes em sequência na mesma thread)
- [x] App Mac via Electron (scaffold)
- [ ] Empacotar .dmg assinado para distribuição
- [ ] App iOS via Capacitor
- [ ] Prompt caching / limite de histórico para economizar tokens

## Identidade visual

- **Paleta:** Ônix Quente `#150C06` · Branco `#FFFFFF` · Sépia Profunda `#2E2017` · Areia Média `#A89070` · Creme `#F5EFE6`
- **Tipografia:** Cormorant (títulos) · Instrument Sans (interface)
- Ponteiros de relógio como motivo de marca.
