/* ===========================================================================
   KRONOS CENTRAL — Acesso + cofre criptografado

   O conteúdo sensível mora cifrado em www/vault.enc (AES-256-GCM, chave derivada
   da sua senha por PBKDF2). O login NÃO compara hash: ele TENTA DESCRIPTOGRAFAR.
   Se a senha abre o cofre, está correta — e os dados são aplicados aos agentes.

   • Quem pega o link/arquivo cru só vê texto embaralhado.
   • Você loga uma vez; a senha fica só neste aparelho (localStorage) e destrava
     o cofre nas próximas aberturas. "Sair" apaga isso.
   =========================================================================== */

const Auth = (() => {
  const LS_PASS = "kronos.pass";   // passphrase (email|senha) — só neste aparelho
  const VAULT_URL = "vault.enc";

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64enc = (buf) => { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
  const passOf = (email, password) => (email || "").trim().toLowerCase() + "|" + (password || "");
  const ITER = 150000;
  const storedPass = () => { try { return localStorage.getItem(LS_PASS); } catch (_) { return null; } };

  async function deriveKey(passphrase, saltBytes, iter, usages) {
    const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: iter, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, usages
    );
  }

  /* Cifra um objeto JS com a MESMA chave do cofre (derivada da senha guardada
     neste aparelho). Devolve um envelope no mesmo formato do vault.enc. Usado
     para guardar os ajustes do IAgo no GitHub sem expô-los no repo público.
     Lança se o cofre estiver trancado (sem senha salva). */
  async function encryptJSON(obj) {
    const pass = storedPass();
    if (!pass) throw new Error("Cofre trancado — faça login para cifrar.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt, ITER, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64enc(salt), iv: b64enc(iv), ct: b64enc(ct) };
  }

  /* Decifra um envelope produzido por encryptJSON. */
  async function decryptJSON(env) {
    const pass = storedPass();
    if (!pass) throw new Error("Cofre trancado.");
    const key = await deriveKey(pass, b64(env.salt), env.iter || ITER, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv) }, key, b64(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function decryptVault(passphrase) {
    const enc = await fetch(VAULT_URL + "?x=" + Date.now(), { cache: "no-store" }).then((r) => r.json());
    const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt)); // lança erro se a senha estiver errada
  }

  async function unlock(passphrase, persist) {
    const data = await decryptVault(passphrase);
    if (typeof applyKronosData === "function") applyKronosData(data);
    if (persist) { try { localStorage.setItem(LS_PASS, passphrase); } catch (_) {} }
    return data;
  }

  function logout() { try { localStorage.removeItem(LS_PASS); } catch (_) {} location.reload(); }

  function showGate(onReady) {
    const gate = document.getElementById("authGate");
    gate.hidden = false;
    const emailEl = document.getElementById("authEmail");
    const pwdEl = document.getElementById("authPwd");
    const btn = document.getElementById("authBtn");
    const err = document.getElementById("authErr");
    const submit = async () => {
      err.textContent = ""; btn.disabled = true; btn.textContent = "Entrando…";
      try {
        await unlock(passOf(emailEl.value, pwdEl.value), true);
        gate.hidden = true;
        onReady();
      } catch (_) {
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

  /* Ponto de entrada do app: destrava com a senha guardada, ou pede login.
     Chama onReady() (= init do app) só depois que os dados foram aplicados. */
  async function boot(onReady) {
    let saved = null;
    try { saved = localStorage.getItem(LS_PASS); } catch (_) {}
    if (saved) {
      try { await unlock(saved, false); document.getElementById("authGate").hidden = true; onReady(); return; }
      catch (_) { try { localStorage.removeItem(LS_PASS); } catch (_) {} } // senha mudou/cofre novo → relogar
    }
    showGate(onReady);
  }

  return { boot, logout, encryptJSON, decryptJSON, hasPass: () => !!storedPass() };
})();
