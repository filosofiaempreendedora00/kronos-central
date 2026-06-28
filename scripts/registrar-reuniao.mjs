/* Registra uma reunião do Conselho no histórico sincronizado do app.
   Lê um JSON de reunião (gerado aqui), anexa ao www/contexto/meetings.json
   CIFRADO (mesma chave do cofre) e reescreve. O app decifra e mostra no
   histórico da Delfos — em todos os aparelhos, inclusive mobile.

   Uso:
     KRONOS_EMAIL="..." KRONOS_PWD="..." node scripts/registrar-reuniao.mjs <reuniao.json>

   Formato esperado do <reuniao.json>:
     { "ts"?: number, "title": "...", "participants": ["ceo","head-growth"],
       "cost": 0, "thread": [ {"speaker":"user","content":"..."},
                              {"speaker":"ceo","name":"TIAgo","content":"..."} ] }
   (se "ts" faltar, usa agora e grava de volta no arquivo — p/ re-runs estáveis) */
import fs from "fs";
import crypto from "crypto";

const email = (process.env.KRONOS_EMAIL || "").toLowerCase();
const pwd = process.env.KRONOS_PWD || "";
if (!email || !pwd) { console.error("Defina KRONOS_EMAIL e KRONOS_PWD."); process.exit(1); }
const passphrase = email + "|" + pwd;

const srcPath = process.argv[2];
if (!srcPath || !fs.existsSync(srcPath)) { console.error("Passe o caminho do JSON da reunião."); process.exit(1); }

const OUT = "www/contexto/meetings.json";
const ITER = 150000;

function deriveKey(salt, iter) { return crypto.pbkdf2Sync(passphrase, salt, iter, 32, "sha256"); }
function encryptDoc(obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = deriveKey(salt, ITER);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER,
    salt: salt.toString("base64"), iv: iv.toString("base64"),
    ct: Buffer.concat([ct, tag]).toString("base64") };
}
function decryptDoc(env) {
  const key = deriveKey(Buffer.from(env.salt, "base64"), env.iter || ITER);
  const data = Buffer.from(env.ct, "base64");
  const tag = data.subarray(data.length - 16), ct = data.subarray(0, data.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
}

const meeting = JSON.parse(fs.readFileSync(srcPath, "utf8"));
if (meeting.ts == null) { meeting.ts = Date.now(); fs.writeFileSync(srcPath, JSON.stringify(meeting, null, 2) + "\n"); }
if (meeting.cost == null) meeting.cost = 0;

let meetings = [];
if (fs.existsSync(OUT)) {
  try {
    const env = JSON.parse(fs.readFileSync(OUT, "utf8"));
    const doc = (env && env.v && env.ct) ? decryptDoc(env) : env;
    if (doc && Array.isArray(doc.meetings)) meetings = doc.meetings;
  } catch (e) { console.error("Aviso: não consegui ler o meetings.json atual:", e.message); }
}
meetings = meetings.filter((m) => m.ts !== meeting.ts); // dedup por ts
meetings.unshift(meeting);
meetings.sort((a, b) => (b.ts || 0) - (a.ts || 0));

const env = encryptDoc({ type: "kronos.meetings", version: 1, updatedAt: new Date().toISOString(), meetings });
fs.writeFileSync(OUT, JSON.stringify(env));
console.log(`ok — ${meetings.length} reunião(ões) no meetings.json cifrado (${JSON.stringify(env).length} bytes)`);
