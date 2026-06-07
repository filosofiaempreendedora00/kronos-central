/* Gera o cofre criptografado (vault.enc) a partir do conteúdo sensível.
   Fonte editável: www/_src/vault-source.json (ignorado pelo Git).
   1ª execução: extrai de agents.js + contexto/*.md e cria o source.
   Depois: edita-se o source e roda de novo para re-cifrar. */
import fs from "fs";
import vm from "vm";
import crypto from "crypto";

const ROOT = "www";
const SRC = ROOT + "/_src/vault-source.json";

function extractFromCode() {
  const code = fs.readFileSync(ROOT + "/js/agents.js", "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + "\nthis.__OUT={AGENTS,CONVERSATION_DOCTRINE,NAME_ROSTER,NIVEIS};", sandbox);
  const o = sandbox.__OUT;
  return {
    nucleo: fs.readFileSync(ROOT + "/contexto/nucleo.md", "utf8"),
    briefing: fs.readFileSync(ROOT + "/contexto/briefing.md", "utf8"),
    agents: o.AGENTS,
    doctrine: o.CONVERSATION_DOCTRINE,
    nameRoster: o.NAME_ROSTER,
    niveis: o.NIVEIS,
  };
}

let vault;
if (fs.existsSync(SRC)) {
  vault = JSON.parse(fs.readFileSync(SRC, "utf8"));
  console.log("fonte: vault-source.json (re-cifrando)");
} else {
  vault = extractFromCode();
  fs.mkdirSync(ROOT + "/_src", { recursive: true });
  fs.writeFileSync(SRC, JSON.stringify(vault, null, 2));
  console.log("fonte: extraída de agents.js + md (source criado)");
}

// Credenciais NUNCA ficam no código. Passe por variáveis de ambiente:
//   KRONOS_EMAIL="..." KRONOS_PWD="..." node scripts/build-vault.mjs
const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
if (!email || !pwd) {
  console.error("Defina KRONOS_EMAIL e KRONOS_PWD no ambiente antes de rodar.");
  process.exit(1);
}
const passphrase = email + "|" + pwd;
const iter = 150000;
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(passphrase, salt, iter, 32, "sha256");
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(vault), "utf8")), cipher.final()]);
const tag = cipher.getAuthTag();
const out = {
  v: 1, kdf: "PBKDF2-SHA256", iter,
  salt: salt.toString("base64"), iv: iv.toString("base64"),
  ct: Buffer.concat([ct, tag]).toString("base64"), // ct||tag (formato do WebCrypto)
};
fs.writeFileSync(ROOT + "/vault.enc", JSON.stringify(out));
console.log("vault.enc:", JSON.stringify(out).length, "bytes |", vault.agents.length, "agentes");
