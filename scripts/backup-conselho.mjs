/* Backup CIFRADO do cérebro do Conselho (pasta Conselho/, que é ignorada pelo Git
   por ser estratégica). Empacota todos os arquivos de texto num único blob,
   cifra com a chave do cofre e grava em backups/conselho.enc — que vai pro GitHub
   (privado por criptografia; ilegível pra qualquer um sem a senha).

   Uso:   KRONOS_EMAIL="..." KRONOS_PWD="..." node scripts/backup-conselho.mjs
   Restaurar:  node scripts/restore-conselho.mjs */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
if (!email || !pwd) { console.error("Defina KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }
const passphrase = email + "|" + pwd;

const ROOT = "Conselho";
const OUT = "backups/conselho.enc";
const ITER = 150000;

// Só faz backup de TEXTO (o cérebro insubstituível). Binários (PDF/imagens) são
// originais do fundador — não vão cifrados pro repo (evita corrupção e inchaço).
const TEXT_EXT = new Set([".md", ".json", ".txt", ".csv", ".mjs", ".js", ".yml", ".yaml", ".env"]);
function walk(dir, acc = {}) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (TEXT_EXT.has(path.extname(name).toLowerCase())) acc[p] = fs.readFileSync(p, "utf8");
  }
  return acc;
}

if (!fs.existsSync(ROOT)) { console.error("Pasta Conselho/ não encontrada."); process.exit(1); }
const files = walk(ROOT);
const payload = { type: "kronos.conselho.backup", version: 1, updatedAt: new Date().toISOString(), files };

const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(passphrase, salt, ITER, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), "utf8")), cipher.final()]);
const tag = cipher.getAuthTag();
const env = { v: 1, kdf: "PBKDF2-SHA256", iter: ITER,
  salt: salt.toString("base64"), iv: iv.toString("base64"),
  ct: Buffer.concat([ct, tag]).toString("base64") };

fs.mkdirSync("backups", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(env));
console.log(`ok — ${Object.keys(files).length} arquivos do Conselho cifrados em ${OUT} (${JSON.stringify(env).length} bytes)`);
