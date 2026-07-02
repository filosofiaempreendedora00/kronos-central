/* ===========================================================================
   KRONOS CENTRAL — Chat individual
   --------------------------------------------------------------------------- */

const Chat = (() => {
  let currentAgent = null;
  let currentMode = "hard";  // 'hard' (API) | 'easy' (Claude externo)
  let history = [];          // [{role, content}]
  let busy = false;
  let abortCtrl = null;

  const historyKey = (id) => `kronos.chat.${id}`;
  const modeKey = (id) => `kronos.mode.${id}`;
  const easyUrlKey = (id) => `kronos.easyUrl.${id}`;

  /* ------------------------------- Modos --------------------------------- */
  function getMode(id) {
    const m = localStorage.getItem(modeKey(id));
    return m === "easy" || m === "hard" ? m : "hard";
  }
  function getEasyUrl(id) {
    const saved = localStorage.getItem(easyUrlKey(id));
    if (saved != null) return saved;
    const agent = AGENTS.find((a) => a.id === id);
    return agent?.easyUrl || "";
  }
  function setEasyUrl(id, url) {
    localStorage.setItem(easyUrlKey(id), url);
  }

  /* ----------------------------- Persistência ---------------------------- */
  function loadHistory(id) {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey(id)));
      if (Array.isArray(saved)) return saved;
    } catch (_) {}
    return [];
  }
  function saveHistory() {
    if (currentAgent) localStorage.setItem(historyKey(currentAgent.id), JSON.stringify(history));
  }

  /* ------------------------------- Abrir --------------------------------- */
  function open(agentId) {
    const agent = AGENTS.find((a) => a.id === agentId);
    if (!agent) return;

    currentAgent = agent;
    history = loadHistory(agent.id);

    document.getElementById("chatAvatar").innerHTML = agentAvatarHTML(agent);
    document.getElementById("chatAvatar").classList.toggle("avatar--zoomable", !!agent.photo);
    document.getElementById("chatName").textContent = agent.nome || agent.name;
    document.getElementById("chatRole").textContent = `${agent.name} · ${agent.role}`;
    // Cartilha de Nomes é da IAra — atalho só no chat dela.
    const cartChip = document.getElementById("chatCartChip");
    if (cartChip) cartChip.hidden = agent.id !== "head-rh";
    // Benchmarking de Mercado é o "item" do TIAgo — só no chat dele (e só se existir).
    const benchChip = document.getElementById("chatBenchChip");
    if (benchChip) benchChip.hidden = !(agent.id === "ceo" && agent.knowledge);
    // Prompt/escopo do agente — atalho sutil no topo (abre em modal, volta pro chat).
    const promptChip = document.getElementById("chatPromptChip");
    if (promptChip) promptChip.hidden = false;

    App.showView("chatView");

    stick = true;
    renderMessages();
    setTimeout(() => document.getElementById("chatInput")?.focus(), 50);
    scrollToBottom(true);
  }
  // (modo Easy removido — o chat é sempre via API; sem troca de modo.)

  /* ----------------------------- Modo Easy ------------------------------- */
  function renderEasy() {
    const box = document.getElementById("easyLauncher");
    const url = getEasyUrl(currentAgent.id).trim();

    if (url) {
      box.innerHTML = `
        <a class="easy__btn" id="easyOpenBtn" href="${escapeAttr(url)}" target="_blank" rel="noopener">
          Abrir conversa no Claude
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <button class="easy__editlink" id="easyEditBtn" type="button">Editar link</button>`;
      box.querySelector("#easyEditBtn").addEventListener("click", () => renderEasyForm(url));
    } else {
      renderEasyForm("");
    }
  }

  function renderEasyForm(current) {
    const box = document.getElementById("easyLauncher");
    box.innerHTML = `
      <p class="easy__formhint">Cole o link do chat (ou projeto) do Claude com as instruções deste agente:</p>
      <div class="easy__form">
        <input class="easy__input" id="easyUrlInput" type="url" placeholder="https://claude.ai/..." value="${escapeAttr(current)}" />
        <button class="btn-solid" id="easySaveBtn" type="button">Salvar</button>
      </div>`;
    const input = box.querySelector("#easyUrlInput");
    box.querySelector("#easySaveBtn").addEventListener("click", () => {
      setEasyUrl(currentAgent.id, input.value.trim());
      renderEasy();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { setEasyUrl(currentAgent.id, input.value.trim()); renderEasy(); }
    });
    setTimeout(() => input.focus(), 50);
  }

  function close() {
    if (busy) abortCtrl?.abort();
    App.navGo("agentes"); // volta para a lista de agentes
    currentAgent = null;
  }

  /* ------------------------------ Render --------------------------------- */
  function renderMessages() {
    const box = document.getElementById("chatMessages");
    box.innerHTML = "";

    if (history.length === 0) {
      box.innerHTML = `
        <div class="chat__empty">
          <span class="chat__empty-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40">
              <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
              <line x1="24" y1="24" x2="24" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <line x1="24" y1="24" x2="32" y2="27" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </span>
          <p class="chat__empty-title">Conversa com ${currentAgent.nome || currentAgent.name}</p>
          <p class="chat__empty-sub">${currentAgent.blurb}</p>
        </div>`;
      return;
    }

    history.forEach((m) => box.appendChild(messageEl(m.role, m.content, m)));
    scrollToBottom();
  }

  function messageEl(role, content, meta) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}`;
    wrap.innerHTML = `
      <div class="msg__role">${role === "user" ? "Você" : (currentAgent.nome || currentAgent.name)}</div>
      <div class="msg__bubble"></div>
      <div class="msg__cost" hidden></div>`;
    const bubble = wrap.querySelector(".msg__bubble");
    bubble.textContent = content;
    if (role === "assistant" && meta && meta.costUSD != null) {
      setCostLabel(wrap.querySelector(".msg__cost"), meta.costUSD, meta.outTok);
    }
    if (role === "assistant") attachProposal(wrap, bubble, content);
    return wrap;
  }

  /* --------- Proposta de edição de prompt (IAgo) → card de aprovação ------ */
  const APPLIED_KEY = "kronos.appliedEdits";
  function appliedSet() {
    try { const a = JSON.parse(localStorage.getItem(APPLIED_KEY)); return new Set(Array.isArray(a) ? a : []); } catch (_) { return new Set(); }
  }
  function markApplied(raw) {
    const s = appliedSet(); s.add(raw);
    localStorage.setItem(APPLIED_KEY, JSON.stringify([...s]));
  }
  function parseEditBlock(text) {
    const m = (text || "").match(/```kronos-edit\s*([\s\S]*?)```/);
    if (!m) return null;
    try {
      const json = JSON.parse(m[1].trim());
      if (!json || !json.agent || !json.mode) return null;
      return { raw: m[0], json };
    } catch (_) { return null; }
  }
  function stripEditBlock(text) {
    return (text || "").replace(/```kronos-edit\s*[\s\S]*?```/g, "").trim();
  }
  function attachProposal(wrap, bubble, content) {
    // só o IAgo propõe edições
    if (!currentAgent || currentAgent.id !== "prompt-engineer") return;
    const parsed = parseEditBlock(content);
    if (!parsed) return;
    bubble.textContent = stripEditBlock(content); // tira o JSON da bolha
    wrap.appendChild(buildProposeCard(parsed));
  }
  function buildProposeCard({ raw, json }) {
    const isBriefing = json.agent === "briefing";
    const target = AGENTS.find((a) => a.id === json.agent);
    const targetName = isBriefing ? "Briefing Vivo" : (target ? `${target.nome || target.name} (${target.name})` : json.agent);
    const card = document.createElement("div");
    card.className = "propose";
    const opLabel = json.mode === "append" ? "adicionar" : "ajustar trecho";
    const detail = json.mode === "replace"
      ? `<div class="propose__diff"><span class="propose__lbl">sai</span><pre>${escapeHtml(json.find || "")}</pre><span class="propose__lbl">entra</span><pre>${escapeHtml(json.content || "")}</pre></div>`
      : `<div class="propose__diff"><span class="propose__lbl">adiciona</span><pre>${escapeHtml(json.content || "")}</pre></div>`;
    const already = appliedSet().has(raw);
    card.innerHTML = `
      <div class="propose__head"><span class="propose__tag">Proposta do IAgo</span> alterar <strong>${targetName}</strong> · ${opLabel}</div>
      <div class="propose__summary">${escapeHtml(json.resumo || "")}</div>
      <button class="propose__toggle" type="button">ver detalhe</button>
      <div class="propose__detail" hidden>${detail}</div>
      <div class="propose__actions"></div>`;
    const actions = card.querySelector(".propose__actions");
    const detailEl = card.querySelector(".propose__detail");
    card.querySelector(".propose__toggle").addEventListener("click", (e) => {
      detailEl.hidden = !detailEl.hidden;
      e.target.textContent = detailEl.hidden ? "ver detalhe" : "ocultar detalhe";
    });
    const renderApplied = (msg, ok) => {
      actions.innerHTML = `<span class="propose__done ${ok ? "" : "propose__done--err"}">${msg}</span>`;
    };

    const canPublish = () => typeof Sync !== "undefined" && Sync.configured();

    async function onApply() {
      if (isBriefing) {
        // Edição do Briefing Vivo → vira nova versão vigente (publica se houver token).
        renderApplied("⟳ aplicando…", true);
        const r = await Context.applyBriefingEdit(json.mode, json.find, json.content);
        if (r.ok) {
          markApplied(raw);
          if (window.App && App.refreshBriefing) App.refreshBriefing();
          renderApplied(`✓ Briefing atualizado${r.scope === "remote" ? " · todos os aparelhos" : " (só neste aparelho)"}`, true);
        } else { renderActions(r.error); }
        return;
      }
      if (canPublish()) {
        // aprovar = publicar no GitHub → vale em TODOS os aparelhos, na hora.
        renderApplied("⟳ publicando…", true);
        const r = await Context.applyEscopoPermanent(json.agent, json.mode, json.find, json.content, json.resumo);
        if (r.ok) { markApplied(raw); renderApplied(`✓ Publicado em ${targetName} · vale em todos os aparelhos`, true); }
        else { renderActions(r.error); }
      } else {
        // sem token: aplica só neste aparelho (com dica de como publicar).
        const r = Context.applyEscopoEdit(json.agent, json.mode, json.find, json.content);
        if (r.ok) { markApplied(raw); renderApplied(`✓ Aplicado em ${targetName} (só neste aparelho)`, true); }
        else { renderActions(r.error); }
      }
    }

    function renderActions(errMsg) {
      const publish = canPublish();
      actions.innerHTML =
        (errMsg ? `<span class="propose__err">⚠ ${escapeHtml(errMsg)}</span>` : "") +
        `<button class="propose__apply" type="button">${publish ? "Aplicar e publicar" : "Aplicar (só aqui)"}</button>` +
        `<button class="propose__discard" type="button">Descartar</button>` +
        (publish ? "" : `<span class="propose__hint">Configure o token do GitHub em Configurar para publicar em todos os aparelhos.</span>`);
      actions.querySelector(".propose__apply").addEventListener("click", onApply);
      actions.querySelector(".propose__discard").addEventListener("click", () => card.remove());
    }

    if (already) renderApplied("✓ já aplicado", true);
    else renderActions();
    return card;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setCostLabel(el, costUSD, outTok) {
    el.hidden = false;
    el.textContent =
      `≈ ${Cost.brl(costUSD)} · ${Cost.usd(costUSD)}` +
      (outTok ? ` · ${Cost.tok(outTok)} tok` : "");
  }

  // "Stick to bottom": só auto-rola se o usuário já estiver perto do fim.
  // Se ele rolou pra cima pra ler, não o arrastamos de volta.
  let stick = true;
  function isNearBottom(sc, threshold = 140) {
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight < threshold;
  }
  function scrollToBottom(force) {
    const sc = document.getElementById("chatScroll");
    if (!sc) return;
    if (force) stick = true;
    if (stick) sc.scrollTop = sc.scrollHeight;
  }

  /* ------------------------------ Enviar --------------------------------- */
  async function send() {
    if (busy) return;
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    if (!getApiKey()) {
      App.openSettings();
      return;
    }

    // limpa estado vazio
    if (history.length === 0) document.getElementById("chatMessages").innerHTML = "";

    // mensagem do usuário
    history.push({ role: "user", content: text });
    document.getElementById("chatMessages").appendChild(messageEl("user", text));
    input.value = "";
    autoGrow(input);
    saveHistory();
    scrollToBottom(true);

    // bolha do assistente (streaming)
    busy = true;
    setBusy(true);
    const assistantEl = messageEl("assistant", "");
    assistantEl.classList.add("msg--streaming");
    const bubble = assistantEl.querySelector(".msg__bubble");
    bubble.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
    document.getElementById("chatMessages").appendChild(assistantEl);
    scrollToBottom(true);

    abortCtrl = new AbortController();
    let acc = "";

    try {
      await Context.ready(); // garante Núcleo + Briefing carregados
      const result = await streamMessage({
        system: Context.systemFor(currentAgent),
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        signal: abortCtrl.signal,
        onText: (chunk) => {
          if (acc === "") bubble.textContent = "";
          acc += chunk;
          bubble.textContent = acc;
          scrollToBottom();
        },
      });

      const costUSD = result.costUSD;
      const outTok = result.usage.output;
      history.push({ role: "assistant", content: acc, costUSD, outTok, inTok: result.usage.input });
      saveHistory();
      setCostLabel(assistantEl.querySelector(".msg__cost"), costUSD, outTok);
      Cost.log({ context: "chat", agentId: currentAgent.id, agentName: currentAgent.name, usage: result.usage, costUSD });
      attachProposal(assistantEl, bubble, acc); // proposta de edição do IAgo → card de aprovação
      scrollToBottom();
    } catch (err) {
      if (err.name === "AbortError") {
        bubble.textContent = acc || "(interrompido)";
        if (acc) history.push({ role: "assistant", content: acc });
        saveHistory();
      } else {
        bubble.classList.add("msg__bubble--error");
        bubble.textContent = friendlyError(err);
        // remove a última msg do usuário do histórico para permitir nova tentativa
        history.pop();
        saveHistory();
      }
    } finally {
      assistantEl.classList.remove("msg--streaming");
      busy = false;
      setBusy(false);
      abortCtrl = null;
    }
  }

  function friendlyError(err) {
    const msg = String(err.message || err);
    if (msg === "NO_API_KEY") return "Configure a chave da API para conversar.";
    if (msg.startsWith("API_401")) return "Chave da API inválida. Verifique em Configurar.";
    if (msg.startsWith("API_429")) return "Limite de uso atingido. Tente novamente em instantes.";
    if (msg.startsWith("API_")) return "Erro da API: " + msg.replace(/^API_\d+:\s*/, "");
    if (msg.includes("Failed to fetch")) return "Falha de conexão com a API.";
    return "Ocorreu um erro: " + msg;
  }

  function setBusy(state) {
    const btn = document.getElementById("chatSendBtn");
    const hint = document.getElementById("composerHint");
    btn.classList.toggle("composer__send--busy", state);
    hint.textContent = state
      ? "Gerando resposta… (Esc para interromper)"
      : "Enter envia · Shift+Enter quebra linha";
  }

  /* ------------------------------ Limpar --------------------------------- */
  function clear() {
    if (!currentAgent) return;
    if (busy) abortCtrl?.abort();
    history = [];
    saveHistory();
    renderMessages();
  }

  /* --------------------------- Input auto-grow --------------------------- */
  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  /* ------------------------------- Bind ---------------------------------- */
  function bind() {
    document.getElementById("chatBackBtn").addEventListener("click", close);
    document.getElementById("chatAvatar").addEventListener("click", () => {
      if (currentAgent && currentAgent.photo) {
        App.openLightbox(currentAgent.photoFull || currentAgent.photo, currentAgent.nome || currentAgent.name);
      }
    });
    document.getElementById("chatClearBtn").addEventListener("click", clear);
    document.getElementById("chatSendBtn").addEventListener("click", send);
    document.getElementById("chatCartChip")?.addEventListener("click", () => { if (window.App && App.openCartilha) App.openCartilha(); });
    document.getElementById("chatBenchChip")?.addEventListener("click", () => { if (window.App && App.openBenchmark) App.openBenchmark(); });

    document.getElementById("chatPromptChip")?.addEventListener("click", () => {
      if (!currentAgent) return;
      const esc = (window.Context && Context.escopoEfetivo) ? Context.escopoEfetivo(currentAgent) : (currentAgent.escopo || "");
      const md = "## Escopo\n" + (esc || "_(sem escopo)_") + (currentAgent.knowledge ? "\n\n---\n\n" + currentAgent.knowledge : "");
      const html = (window.NucleoView && NucleoView.mdToHtml) ? NucleoView.mdToHtml(md) : md;
      if (typeof openDocModal === "function") {
        openDocModal((currentAgent.nome || currentAgent.name) + " · prompt", (currentAgent.name || "") + " · sincronizado do cofre", html);
      }
    });

    // Detecta se o usuário rolou pra cima — aí paramos de arrastá-lo pro fim.
    const sc = document.getElementById("chatScroll");
    if (sc) {
      sc.addEventListener("scroll", () => { stick = isNearBottom(sc); }, { passive: true });
      // tocar/rolar a conversa fecha o teclado (mobile)
      sc.addEventListener("pointerdown", () => {
        const a = document.activeElement;
        if (a && a.id === "chatInput") a.blur();
      });
    }

    const input = document.getElementById("chatInput");
    input.addEventListener("input", () => autoGrow(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && busy) abortCtrl?.abort();
    });
  }

  return { open, close, clear, bind };
})();
