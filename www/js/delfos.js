/* ===========================================================================
   KRONOS CENTRAL — Delfos (Sala de Reuniões / mesa-redonda)

   Sessão colaborativa: o fundador puxa um tópico e cada agente presente
   responde EM SEQUÊNCIA, enxergando o que os anteriores disseram na thread.
   Cada agente usa seu próprio system prompt + um enquadramento de reunião.
   =========================================================================== */

const Delfos = (() => {
  const KEY_THREAD = "kronos.delfos.thread";
  const KEY_ROSTER = "kronos.delfos.roster";

  let thread = [];     // [{speaker:'user'|agentId, name, initials, content}]
  let roster = [];     // ids dos agentes sentados à mesa
  let busy = false;
  let abortCtrl = null;
  let dustRaf = null;
  let dustObserver = null;

  /* ----------------------------- Persistência ---------------------------- */
  function loadThread() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY_THREAD));
      if (Array.isArray(s)) return s;
    } catch (_) {}
    return [];
  }
  function saveThread() { localStorage.setItem(KEY_THREAD, JSON.stringify(thread)); }

  function loadRoster() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY_ROSTER));
      if (Array.isArray(s) && s.length) return s.filter((id) => AGENTS.some((a) => a.id === id));
    } catch (_) {}
    return AGENTS.map((a) => a.id); // padrão: todos à mesa
  }
  function saveRoster() { localStorage.setItem(KEY_ROSTER, JSON.stringify(roster)); }

  /* ------------------------------- Abrir --------------------------------- */
  function open() {
    thread = loadThread();
    roster = loadRoster();
    document.getElementById("dashboardView").hidden = true;
    document.getElementById("delfosView").hidden = false;
    renderTable();
    renderMessages();
    updateMeetingCost();
    stick = true;
    scrollToBottom(true);
    setTimeout(() => document.getElementById("delfosInput")?.focus(), 50);
    requestAnimationFrame(startDust);
  }

  function close() {
    if (busy) abortCtrl?.abort();
    stopDust();
    document.getElementById("delfosView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
  }

  /* ----------------------------- Poeira ---------------------------------- */
  /* Partículas fininhas decantando lentamente, planando como poeira no feixe. */
  function startDust() {
    const canvas = document.getElementById("delfosDust");
    if (!canvas || typeof canvas.getContext !== "function") return;
    const ctx = canvas.getContext("2d");
    const host = canvas.parentElement; // #delfosView
    let w = 0, h = 0, dpr = 1, particles = [];
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const spawn = (anywhere) => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -6,
      r: 0.3 + Math.random() * 0.9,          // fininhas
      vy: 0.05 + Math.random() * 0.20,       // queda lenta
      sway: 4 + Math.random() * 10,          // amplitude do planar
      swaySpeed: 0.004 + Math.random() * 0.010,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.08 + Math.random() * 0.30,
    });

    const applySize = () => {
      const nw = canvas.clientWidth || host.clientWidth;
      const nh = canvas.clientHeight || host.clientHeight;
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      if (w <= 0 || h <= 0) return; // ainda sem layout — espera o observer
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(26, Math.min(80, Math.round((w * h) / 24000)));
      particles = Array.from({ length: count }, () => spawn(true));
    };

    const frame = () => {
      if (w > 0 && h > 0) {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          p.y += p.vy;
          p.phase += p.swaySpeed;
          const x = p.x + Math.sin(p.phase) * p.sway;
          if (p.y > h + 6) Object.assign(p, spawn(false));
          ctx.beginPath();
          ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(198,172,134,${p.alpha})`;
          ctx.fill();
        }
      }
      if (!reduced) dustRaf = requestAnimationFrame(frame);
    };

    stopDust();
    // ResizeObserver garante o tamanho correto mesmo quando o layout só
    // aparece depois (ex.: troca de view, ambiente de preview, rotação).
    if (typeof ResizeObserver !== "undefined") {
      dustObserver = new ResizeObserver(() => applySize());
      dustObserver.observe(canvas);
    }
    applySize();
    frame(); // com reduced-motion, desenha um quadro estático e não agenda
  }

  function stopDust() {
    if (dustRaf) { cancelAnimationFrame(dustRaf); dustRaf = null; }
    if (dustObserver) { dustObserver.disconnect(); dustObserver = null; }
  }

  /* --------------------------- Participantes ----------------------------- */
  /* "Na sala" (conselho ativo) × "Fora" (banco/cemitério, num canto).
     Clicar move o membro entre as duas zonas. */
  function renderTable() {
    const el = document.getElementById("delfosRoster");
    const inRoom = AGENTS.filter((a) => roster.includes(a.id));
    const bench = AGENTS.filter((a) => !roster.includes(a.id));

    const member = (a, zone) => `
      <button class="member member--${zone}" data-id="${a.id}" type="button" ${busy ? "disabled" : ""}
        title="${zone === "in" ? "Remover da sala" : "Trazer para a sala"}" aria-pressed="${zone === "in"}">
        <span class="member__avatar">${a.initials}</span>
        <span class="member__name">${a.name}</span>
      </button>`;

    el.innerHTML = `
      <div class="roster__zone roster__zone--room">
        <span class="roster__label">Na sala <span class="roster__count">${inRoom.length + 1}</span></span>
        <div class="roster__members">
          <span class="member member--you" title="Você preside o conselho">
            <span class="member__avatar member__avatar--you">VC</span>
            <span class="member__name">Você</span>
          </span>
          ${inRoom.map((a) => member(a, "in")).join("")}
          ${inRoom.length === 0 ? `<span class="roster__hint">convoque membros &rarr;</span>` : ""}
        </div>
      </div>
      <div class="roster__zone roster__zone--bench">
        <span class="roster__label roster__label--muted">Fora</span>
        <div class="roster__members">
          ${bench.length ? bench.map((a) => member(a, "out")).join("") : `<span class="roster__hint">todos presentes</span>`}
        </div>
      </div>`;

    if (!busy) {
      el.querySelectorAll(".member[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => toggleSeat(btn.dataset.id));
      });
    }
  }

  function toggleSeat(id) {
    if (busy) return;
    if (roster.includes(id)) roster = roster.filter((x) => x !== id);
    else roster.push(id);
    saveRoster();
    renderTable();
  }

  /* ------------------------------ Render --------------------------------- */
  function renderMessages() {
    const box = document.getElementById("delfosMessages");
    box.innerHTML = "";

    if (thread.length === 0) {
      box.innerHTML = `
        <div class="delfos__empty">
          <p class="delfos__empty-eyebrow">Oráculo de Delfos</p>
          <p class="delfos__empty-title">O conselho aguarda</p>
          <p class="delfos__empty-sub">Abra a reunião com um tópico ou pergunta. Cada membro na sala responderá da sua perspectiva, em sequência.</p>
        </div>`;
      return;
    }

    thread.forEach((m) => box.appendChild(messageEl(m)));
    scrollToBottom();
  }

  function messageEl(m) {
    const isUser = m.speaker === "user";
    const wrap = document.createElement("div");
    wrap.className = `dmsg ${isUser ? "dmsg--user" : "dmsg--agent"}`;
    if (isUser) {
      wrap.innerHTML = `
        <div class="dmsg__role">Você</div>
        <div class="dmsg__bubble"></div>`;
    } else {
      wrap.innerHTML = `
        <div class="dmsg__head">
          <span class="dmsg__avatar">${m.initials}</span>
          <span class="dmsg__name">${m.name}</span>
        </div>
        <div class="dmsg__bubble"></div>
        <div class="dmsg__cost" hidden></div>`;
    }
    wrap.querySelector(".dmsg__bubble").textContent = m.content;
    if (!isUser && m.costUSD != null) setCostLabel(wrap.querySelector(".dmsg__cost"), m.costUSD, m.outTok);
    return wrap;
  }

  function setCostLabel(el, costUSD, outTok) {
    if (!el) return;
    el.hidden = false;
    el.textContent =
      `≈ ${Cost.usd(costUSD)} · ${Cost.brl(costUSD)}` + (outTok ? ` · ${Cost.tok(outTok)} tok` : "");
  }

  function updateMeetingCost() {
    const el = document.getElementById("delfosMeetingCost");
    if (!el) return;
    const total = thread.reduce((a, m) => a + (m.costUSD || 0), 0);
    if (total > 0) {
      el.hidden = false;
      el.textContent = `Reunião ≈ ${Cost.usd(total)} · ${Cost.brl(total)}`;
    } else {
      el.hidden = true;
    }
  }

  // "Stick to bottom": só auto-rola se o usuário já estiver perto do fim.
  let stick = true;
  function isNearBottom(sc, threshold = 140) {
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight < threshold;
  }
  function scrollToBottom(force) {
    const sc = document.getElementById("delfosScroll");
    if (!sc) return;
    if (force) stick = true;
    if (stick) sc.scrollTop = sc.scrollHeight;
  }

  /* --------------------------- Enquadramento ----------------------------- */
  function transcriptText() {
    const lines = thread.map((m) => `${m.speaker === "user" ? "Fundador" : m.name}: ${m.content}`);
    return "Transcrição da reunião (mesa-redonda Delfos) até agora:\n\n" + lines.join("\n\n");
  }

  function meetingSystem(agent, present) {
    const others = present.filter((p) => p.id !== agent.id).map((p) => p.name);
    const mesa = others.length ? `Também estão à mesa: ${others.join(", ")}. ` : "";
    return `${Context.systemFor(agent)}

---
CONTEXTO DA REUNIÃO — DELFOS
Você está numa mesa-redonda chamada Delfos com o Fundador da KRONOS e outros membros do conselho. ${mesa}Você participa como ${agent.name} (${agent.role}).
Fale em primeira pessoa, da sua perspectiva. Seja conciso e direto — 2 a 5 frases. Você pode concordar, discordar ou complementar o que já foi dito, mas agregue valor: não repita o que outro já falou.
Só puxe a sua especialidade se o que está em jogo realmente toca a sua área. Se não toca, contribua como um bom conselheiro contribuiria: uma observação afiada, uma pergunta que destrava a discussão, ou um apoio/discordância com motivo — não fabrique um ângulo da sua disciplina só pra marcar presença. Se você sinceramente não tem nada relevante a agregar agora, diga isso em uma linha e passe a palavra, em vez de encher linguiça. Não narre que está numa reunião; apenas contribua.`;
  }

  /* ------------------------------ Enviar --------------------------------- */
  async function send() {
    if (busy) return;
    const input = document.getElementById("delfosInput");
    const text = input.value.trim();
    if (!text) return;

    const present = AGENTS.filter((a) => roster.includes(a.id)); // ordem canônica
    if (present.length === 0) {
      setHint("Selecione ao menos um membro para a mesa.");
      return;
    }
    if (!getApiKey()) { App.openSettings(); return; }

    if (thread.length === 0) document.getElementById("delfosMessages").innerHTML = "";

    // fala do fundador
    thread.push({ speaker: "user", name: "Você", initials: "VC", content: text });
    document.getElementById("delfosMessages").appendChild(messageEl(thread[thread.length - 1]));
    input.value = "";
    autoGrow(input);
    saveThread();
    scrollToBottom(true);

    busy = true;
    setBusy(true);
    renderTable(); // desabilita seats durante a rodada
    abortCtrl = new AbortController();
    await Context.ready(); // Núcleo + Briefing prontos antes da rodada

    for (const agent of present) {
      const bubbleWrap = messageEl({ speaker: agent.id, name: agent.name, initials: agent.initials, content: "" });
      bubbleWrap.classList.add("dmsg--streaming");
      const bubble = bubbleWrap.querySelector(".dmsg__bubble");
      bubble.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
      document.getElementById("delfosMessages").appendChild(bubbleWrap);
      scrollToBottom();

      let acc = "";
      try {
        const result = await streamMessage({
          system: meetingSystem(agent, present),
          messages: [{ role: "user", content: `${transcriptText()}\n\nAgora responda como ${agent.name} (${agent.role}).` }],
          signal: abortCtrl.signal,
          onText: (chunk) => {
            if (acc === "") bubble.textContent = "";
            acc += chunk;
            bubble.textContent = acc;
            scrollToBottom();
          },
        });
        thread.push({ speaker: agent.id, name: agent.name, initials: agent.initials, content: acc, costUSD: result.costUSD, outTok: result.usage.output });
        saveThread();
        setCostLabel(bubbleWrap.querySelector(".dmsg__cost"), result.costUSD, result.usage.output);
        updateMeetingCost();
        Cost.log({ context: "delfos", agentId: agent.id, agentName: agent.name, usage: result.usage, costUSD: result.costUSD });
      } catch (err) {
        if (err.name === "AbortError") {
          if (acc) {
            bubble.textContent = acc;
            thread.push({ speaker: agent.id, name: agent.name, initials: agent.initials, content: acc });
            saveThread();
          } else {
            bubbleWrap.remove();
          }
          break; // interrompe a rodada
        } else {
          bubble.classList.add("dmsg__bubble--error");
          bubble.textContent = friendlyError(err);
        }
      } finally {
        bubbleWrap.classList.remove("dmsg--streaming");
      }
    }

    busy = false;
    setBusy(false);
    abortCtrl = null;
    renderTable();
    document.getElementById("delfosInput").focus();
  }

  function friendlyError(err) {
    const msg = String(err.message || err);
    if (msg === "NO_API_KEY") return "Configure a chave da API para conduzir a reunião.";
    if (msg.startsWith("API_401")) return "Chave da API inválida. Verifique em Configurar.";
    if (msg.startsWith("API_429")) return "Limite de uso atingido. Tente novamente em instantes.";
    if (msg.startsWith("API_")) return "Erro da API: " + msg.replace(/^API_\d+:\s*/, "");
    if (msg.includes("Failed to fetch")) return "Falha de conexão com a API.";
    return "Ocorreu um erro: " + msg;
  }

  function setBusy(state) {
    document.getElementById("delfosSendBtn").classList.toggle("composer__send--busy", state);
    setHint(state ? "O conselho está deliberando… (Esc para interromper)" : "");
  }
  function setHint(msg) {
    document.getElementById("delfosHint").textContent =
      msg || "Enter envia · Shift+Enter quebra linha · cada membro presente responde em sequência";
  }

  /* ------------------------------ Encerrar ------------------------------- */
  function clear() {
    if (busy) abortCtrl?.abort();
    thread = [];
    saveThread();
    renderMessages();
    updateMeetingCost();
  }

  // Encerrar = limpa a reunião E volta ao dashboard
  function endMeeting() {
    clear();
    close();
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  /* ------------------------------- Bind ---------------------------------- */
  function bind() {
    document.getElementById("delfosBackBtn").addEventListener("click", close);
    document.getElementById("delfosClearBtn").addEventListener("click", endMeeting);
    document.getElementById("delfosSendBtn").addEventListener("click", send);

    const sc = document.getElementById("delfosScroll");
    if (sc) sc.addEventListener("scroll", () => { stick = isNearBottom(sc); }, { passive: true });

    const input = document.getElementById("delfosInput");
    input.addEventListener("input", () => autoGrow(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && busy) abortCtrl?.abort();
    });
  }

  return { open, close, clear, endMeeting, bind };
})();

/* Frontão de templo grego — marca da sala Delfos (usado no banner do dashboard). */
function pedimentSVG(size) {
  return `
    <svg viewBox="0 0 64 52" width="${size}" height="${size}" aria-hidden="true">
      <polygon points="32,4 61,21 3,21" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      <line x1="6" y1="21" x2="58" y2="21" stroke="currentColor" stroke-width="1.4"/>
      <line x1="11" y1="24" x2="11" y2="44" stroke="currentColor" stroke-width="1.3"/>
      <line x1="22" y1="24" x2="22" y2="44" stroke="currentColor" stroke-width="1.3"/>
      <line x1="32" y1="24" x2="32" y2="44" stroke="currentColor" stroke-width="1.3"/>
      <line x1="42" y1="24" x2="42" y2="44" stroke="currentColor" stroke-width="1.3"/>
      <line x1="53" y1="24" x2="53" y2="44" stroke="currentColor" stroke-width="1.3"/>
      <line x1="6" y1="47" x2="58" y2="47" stroke="currentColor" stroke-width="1.4"/>
    </svg>`;
}
