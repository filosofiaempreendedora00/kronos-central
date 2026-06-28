/* Restaura o cérebro do Conselho a partir do backup cifrado (backups/conselho.enc).
   Decifra com a chave do cofre e reescreve os arquivos sob Conselho/.
   Uso:  KRONOS_EMAIL="..." KRONOS_PWD="..." node scripts/restore-conselho.mjs */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
if (!email || !pwd) { console.error("Defina KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }
const passphrase = email + "|" + pwd;

const IN = "backups/conselho.enc";
if (!fs.existsSync(IN)) { console.error("Backup não encontrado:", IN); process.exit(1); }
const env = JSON.parse(fs.readFileSync(IN, "utf8"));

const key = crypto.pbkdf2Sync(passphrase, Buffer.from(env.salt, "base64"), env.iter || 150000, 32, "sha256");
const data = Buffer.from(env.ct, "base64");
const tag = data.subarray(data.length - 16), ct = data.subarray(0, data.length - 16);
const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
d.setAuthTag(tag);
const payload = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));

let n = 0;
for (const [p, content] of Object.entries(payload.files || {})) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  n++;
}
console.log(`ok — ${n} arquivos do Conselho restaurados (backup de ${payload.updatedAt}).`);
