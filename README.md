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
├── www/                    # APP WEB (servido aos 3 alvos)
│   ├── index.html          # dashboard + chat + Delfos (SPA)
│   ├── css/styles.css      # identidade visual
│   └── js/
│       ├── agents.js       # os 5 agentes (prompts + links Easy)
│       ├── api.js          # cliente da API da Anthropic (streaming SSE)
│       ├── chat.js         # chat individual + switcher Easy/Hard
│       ├── delfos.js       # sala de reuniões (sessão colaborativa)
│       └── app.js          # dashboard, métricas, boot
├── electron/               # APP MAC
│   ├── main.js             # janela nativa
│   └── preload.js
├── capacitor.config.json   # APP iOS (Capacitor) → webDir: www
└── package.json
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

### App iOS (Capacitor) — pré-requisitos: Xcode + CocoaPods
As dependências do Capacitor já estão instaladas e o `capacitor.config.json`
aponta para `www/`. Falta só o que exige o Xcode completo (App Store):

```bash
# 1. Instalar Xcode (App Store) e o CocoaPods
sudo gem install cocoapods            # ou: brew install cocoapods
xcode-select --install                # se necessário

# 2. Gerar o projeto iOS nativo (cria a pasta ios/)
npm run ios:add                       # = cap add ios

# 3. Copiar o web app para o projeto iOS sempre que mudar o www/
npm run ios:sync                      # = cap sync ios

# 4. Abrir no Xcode para rodar no simulador ou em device
npm run ios:open                      # = cap open ios
```

No Xcode: defina o *Team* de desenvolvedor e o *bundle id* (`com.kronos.central`)
para rodar em iPhone real.

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
