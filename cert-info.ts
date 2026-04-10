import { createHash } from "crypto";
import { resolve } from "path";

const certPath = resolve(import.meta.dir, "Certnew.cer");

if (!(await Bun.file(certPath).exists())) {
  console.error("Erro: Certnew.cer não encontrado. Execute primeiro: bun run gerar-certificado");
  process.exit(1);
}

// ─── SERIAL_HEX ───────────────────────────────────────────────────────────────
const serialProc = Bun.spawn(
  ["openssl", "x509", "-in", certPath, "-noout", "-serial"],
  { stdout: "pipe", stderr: "pipe" }
);
const serialOut = await new Response(serialProc.stdout).text();
const serialExit = await serialProc.exited;

if (serialExit !== 0) {
  const err = await new Response(serialProc.stderr).text();
  console.error("Erro ao ler serial:", err);
  process.exit(1);
}

const serialHex = serialOut.trim().split("=")[1] ?? "";

// ─── THUMBPRINT256 ────────────────────────────────────────────────────────────
const derProc = Bun.spawn(
  ["openssl", "x509", "-in", certPath, "-outform", "DER"],
  { stdout: "pipe", stderr: "pipe" }
);
const derBuffer = await new Response(derProc.stdout).arrayBuffer();
const derExit = await derProc.exited;

if (derExit !== 0) {
  const err = await new Response(derProc.stderr).text();
  console.error("Erro ao converter certificado para DER:", err);
  process.exit(1);
}

const thumbprint256 = createHash("sha256")
  .update(Buffer.from(derBuffer))
  .digest("hex")
  .toUpperCase();

console.log(`SERIAL_HEX=${serialHex}`);
console.log(`THUMBPRINT256=${thumbprint256}`);
