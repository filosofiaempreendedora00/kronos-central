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
  function open(agentId, forceMode) {
    const agent = AGENTS.find((a) => a.id === agentId);
    if (!agent) return;

    currentAgent = agent;
    if (forceMode === "easy" || forceMode === "hard") {
      currentMode = forceMode;
      localStorage.setItem(modeKey(agent.id), forceMode);
    } else {
      currentMode = getMode(agent.id);
    }
    history = loadHistory(agent.id);

    document.getElementById("chatAvatar").textContent = agent.initials;
    document.getElementById("chatName").textContent = agent.name;
    document.getElementById("chatRole").textContent = agent.role;

    document.getElementById("dashboardView").hidden = true;
    document.getElementById("chatView").hidden = false;

    stick = true;
    renderMessages();
    applyMode(currentMode);
    scrollToBottom(true);
  }

  /* --------------------------- Troca de modo ----------------------------- */
  function applyMode(mode) {
    currentMode = mode;
    if (currentAgent) localStorage.setItem(modeKey(currentAgent.id), mode);

    const isEasy = mode === "easy";
    document.getElementById("chatScroll").hidden = isEasy;
    document.querySelector(".chat__composer").hidden = isEasy;
    document.getElementById("chatEasy").hidden = !isEasy;
    document.getElementById("chatClearBtn").hidden = isEasy;

    document.getElementById("modeEasyBtn").classList.toggle("mode-switch__opt--active", isEasy);
    document.getElementById("modeHardBtn").classList.toggle("mode-switch__opt--active", !isEasy);

    if (isEasy) {
      renderEasy();
    } else {
      setTimeout(() => document.getElementById("chatInput")?.focus(), 50);
    }
  }

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
    document.getElementById("chatView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
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
          <p class="chat__empty-title">Conversa com ${currentAgent.name}</p>
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
      <div class="msg__role">${role === "user" ? "Você" : currentAgent.name}</div>
      <div class="msg__bubble"></div>
      <div class="msg__cost" hidden></div>`;
    wrap.querySelector(".msg__bubble").textContent = content;
    if (role === "assistant" && meta && meta.costUSD != null) {
      setCostLabel(wrap.querySelector(".msg__cost"), meta.costUSD, meta.outTok);
    }
    return wrap;
  }

  function setCostLabel(el, costUSD, outTok) {
    el.hidden = false;
    el.textContent =
      `≈ ${Cost.usd(costUSD)} · ${Cost.brl(costUSD)}` +
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
    document.getElementById("chatClearBtn").addEventListener("click", clear);
    document.getElementById("chatSendBtn").addEventListener("click", send);

    document.getElementById("modeEasyBtn").addEventListener("click", () => applyMode("easy"));
    document.getElementById("modeHardBtn").addEventListener("click", () => {
      if (busy) abortCtrl?.abort();
      applyMode("hard");
    });

    // Detecta se o usuário rolou pra cima — aí paramos de arrastá-lo pro fim.
    const sc = document.getElementById("chatScroll");
    if (sc) sc.addEventListener("scroll", () => { stick = isNearBottom(sc); }, { passive: true });

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
