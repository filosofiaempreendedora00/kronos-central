/* ===========================================================================
   KRONOS CENTRAL — Camada de acesso (login simples)

   Objetivo: impedir que alguém que pegue o link abra a Central e veja as infos.
   A senha NÃO fica em texto puro no código — guardamos só um hash SHA-256
   salgado; no login, o que você digita é hasheado e comparado.

   IMPORTANTE (honestidade): este é um portão do lado do cliente. Ele barra o
   acesso casual pelo navegador, mas como o site é estático e público, alguém
   técnico ainda poderia ler os arquivos servidos direto. A proteção REAL do
   conteúdo exige criptografar os materiais (próximo passo) — ver conversa.
   =========================================================================== */

const Auth = (() => {
  const LS = "kronos.auth";
  const SALT = "kronos-central-v1";
  // hash de  email.toLowerCase() + "|" + senha + "|" + SALT
  const HASH = "e1b9b6f3e51c65df1d769c8f45f756f7966b5ccfd033432b18d2abd80b70bfdc";
  const TOKEN = "k:" + HASH; // valor gravado no aparelho ao logar (fica logado)

  function ok() {
    try { return localStorage.getItem(LS) === TOKEN; } catch (_) { return false; }
  }
  async function sha256hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function tryLogin(email, password) {
    const h = await sha256hex((email || "").trim().toLowerCase() + "|" + (password || "") + "|" + SALT);
    if (h === HASH) { try { localStorage.setItem(LS, TOKEN); } catch (_) {} return true; }
    return false;
  }
  function logout() { try { localStorage.removeItem(LS); } catch (_) {} location.reload(); }

  /* Mostra o portão e resolve onSuccess quando o login passa. */
  function showGate(onSuccess) {
    const gate = document.getElementById("authGate");
    if (!gate) { onSuccess && onSuccess(); return; }
    gate.hidden = false;
    const emailEl = document.getElementById("authEmail");
    const pwdEl = document.getElementById("authPwd");
    const btn = document.getElementById("authBtn");
    const err = document.getElementById("authErr");
    const submit = async () => {
      err.textContent = "";
      btn.disabled = true; btn.textContent = "Entrando…";
      let okk = false;
      try { okk = await tryLogin(emailEl.value, pwdEl.value); } catch (_) {}
      if (okk) {
        gate.hidden = true;
        onSuccess && onSuccess();
      } else {
        err.textContent = "Email ou senha incorretos.";
        btn.disabled = false; btn.textContent = "Entrar";
        pwdEl.value = ""; pwdEl.focus();
      }
    };
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", submit);
      [emailEl, pwdEl].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
    }
    setTimeout(() => { (emailEl.value ? pwdEl : emailEl).focus(); }, 60);
  }

  return { ok, showGate, logout };
})();
