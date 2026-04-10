import { createInterface } from "readline";
import { randomBytes } from "crypto";
import { existsSync } from "fs";

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bright: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ─── Prompt helpers ───────────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function askDefault(question: string, defaultValue: string): Promise<string> {
  const answer = await ask(question);
  return answer.trim() || defaultValue;
}

async function askPassword(question: string): Promise<string> {
  process.stdout.write(question);
  // Desativa echo para a senha
  process.stdin.setRawMode?.(true);
  const chunks: Buffer[] = [];
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 13 || byte === 10) { // Enter
          process.stdin.setRawMode?.(false);
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(Buffer.concat(chunks).toString("utf8"));
        } else if (byte === 127 || byte === 8) { // Backspace
          chunks.pop();
        } else {
          chunks.push(Buffer.from([byte]));
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

// ─── Executa comando e aguarda ────────────────────────────────────────────────
async function run(cmd: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function runPiped(cmd1: string[], cmd2: string[]): Promise<string> {
  const p1 = Bun.spawn(cmd1, { stdout: "pipe", stderr: "pipe" });
  const p2 = Bun.spawn(cmd2, { stdout: "pipe", stderr: "pipe", stdin: p1.stdout });
  const [out] = await Promise.all([new Response(p2.stdout).text(), p1.exited, p2.exited]);
  return out.trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(c.cyan("=== Gerar key, cer (autoassinado) e csr usando a MESMA chave ==="));
console.log(c.cyan("=== Os dados do certificado serão solicitados a seguir. ===\n"));

const cn     = await ask("Informe o CN (ex.: teste.hext.com.br): ");
const ou     = await ask("Informe a OU (Nome Institucional): ");
const ispb   = await ask("Informe o número do ISPB (8 primeiros dígitos do CNPJ): ");
const sigla  = await ask("Informe a sigla (ex.: CCC, CMP, CTC, MCB, PCA, RRC, SCC, SLC, SEC): ");
const codigo = await ask("Informe o código (ex.: T001 para homologação ou P001 para produção): ");
const l      = await askDefault("Informe a Cidade (L) [padrão: Sao Paulo]: ", "Sao Paulo");
const s      = await askDefault("Informe o Estado (S) [padrão: SP]: ", "SP");
const cc     = await askDefault("Informe o País (C) [padrão: BR]: ", "BR");
const days   = await askDefault("Informe a validade em dias [padrão: 365]: ", "365");

console.log("\n[Opcional] Proteção da chave privada com senha");
console.log("- Se desejar criptografar a .key, informe uma senha forte.");
console.log("- Se deixar em branco, a chave será gerada SEM senha.");
const pass = await askPassword("Informe a senha da chave (ou deixe em branco): ");

rl.close();

const serial = randomBytes(8).toString("hex").toUpperCase();
const subj = `/CN=${cn}/OU=${ou}/OU=${ispb}/OU=${sigla} ${codigo}/OU=ICP-Brasil/L=${l}/ST=${s}/C=${cc}`;

console.log(`\n${c.bright("[Resumo]")}`);
console.log(`${"CN".padEnd(18)}: ${cn}`);
console.log(`${"OU".padEnd(18)}: ${ou}`);
console.log(`${"O (ISPB)".padEnd(18)}: ${ispb}`);
console.log(`${"O (Sigla+Código)".padEnd(18)}: ${sigla} ${codigo}`);
console.log(`${"O".padEnd(18)}: ICP-Brasil`);
console.log(`${"L/S/C".padEnd(18)}: ${l} / ${s} / ${cc}`);
console.log(`${"Validade".padEnd(18)}: ${days} dias`);
console.log(`${"Chave".padEnd(18)}: ${pass ? "SERÁ GERADA COM SENHA" : "SERÁ GERADA SEM SENHA"}`);
console.log(`${"Serial".padEnd(18)}: 0x${serial}`);
console.log(`${"Subject".padEnd(18)}: ${subj}\n`);

console.log(c.yellow("[AVISO] A chave privada (.key) é confidencial: armazene com segurança (permissões restritas),"));
console.log(c.yellow("        nunca compartilhe por e-mail/mensageria e mantenha backups criptografados.\n"));

// ─── Verificar OpenSSL ────────────────────────────────────────────────────────
const opensslCheck = await run(["openssl", "version"]);
if (!opensslCheck.ok) {
  console.error(c.red("[ERRO] OpenSSL não encontrado no PATH. Verifique instalação ou PATH."));
  process.exit(1);
}

// ─── Etapa 1: Autoassinado ────────────────────────────────────────────────────
console.log(c.cyan("[1/3] Certificado autoassinado (gera Certnew.key e Certnew.cer)"));

const step1Cmd = pass
  ? `openssl req -x509 -newkey rsa:2048 -sha256 -days ${days} -keyout Certnew.key -out Certnew.cer -subj "${subj}" -set_serial 0x${serial} -passout pass:********`
  : `openssl req -x509 -newkey rsa:2048 -sha256 -days ${days} -nodes -keyout Certnew.key -out Certnew.cer -subj "${subj}" -set_serial 0x${serial}`;
console.log(`Comando: ${step1Cmd}`);

await ask("Pressione ENTER para continuar...");

const step1Args = pass
  ? ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", days, "-keyout", "Certnew.key", "-out", "Certnew.cer", "-subj", subj, "-set_serial", `0x${serial}`, "-passout", `pass:${pass}`]
  : ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", days, "-nodes", "-keyout", "Certnew.key", "-out", "Certnew.cer", "-subj", subj, "-set_serial", `0x${serial}`];

const step1 = await run(step1Args);
if (!step1.ok) {
  console.error(c.red("[ERRO] Falha ao gerar chave/certificado autoassinado."));
  console.error(c.red(step1.stderr));
  process.exit(1);
}
await Bun.file("Certnew.key").exists() && Bun.spawn(["chmod", "600", "Certnew.key"]);
console.log(c.green("[OK] Gerados: Certnew.key e Certnew.cer\n"));

// ─── Etapa 2: CSR ─────────────────────────────────────────────────────────────
console.log(c.cyan("[2/3] Gerar CSR reutilizando a MESMA chave e o MESMO subject"));

const step2Cmd = pass
  ? `openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "${subj}" -passin pass:********`
  : `openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "${subj}"`;
console.log(`Comando: ${step2Cmd}`);

await ask("Pressione ENTER para continuar...");

const step2Args = pass
  ? ["openssl", "req", "-new", "-sha256", "-key", "Certnew.key", "-out", "Certnew.csr", "-subj", subj, "-passin", `pass:${pass}`]
  : ["openssl", "req", "-new", "-sha256", "-key", "Certnew.key", "-out", "Certnew.csr", "-subj", subj];

const step2 = await run(step2Args);
if (!step2.ok) {
  console.error(c.red("[ERRO] Falha ao gerar a CSR."));
  console.error(c.red(step2.stderr));
  process.exit(1);
}
console.log(c.green("[OK] CSR gerada: Certnew.csr\n"));

// ─── Etapa 3: Verificação de modulus ─────────────────────────────────────────
console.log(c.cyan("[3/3] Verificando se key, cer e csr correspondem (comparando modulus)..."));

const keyArgs = pass
  ? ["openssl", "rsa", "-in", "Certnew.key", "-noout", "-modulus", "-passin", `pass:${pass}`]
  : ["openssl", "rsa", "-in", "Certnew.key", "-noout", "-modulus"];

const kmd5 = await runPiped(keyArgs, ["openssl", "md5"]);
const cmd5 = await runPiped(["openssl", "x509", "-in", "Certnew.cer", "-noout", "-modulus"], ["openssl", "md5"]);
const smd5 = await runPiped(["openssl", "req", "-in", "Certnew.csr", "-noout", "-modulus"], ["openssl", "md5"]);

if (kmd5 === cmd5 && kmd5 === smd5) {
  console.log(c.green("[OK] Modulus conferem: key == cer == csr"));
} else {
  console.log(c.yellow("[ALERTA] Modulus NÃO conferem. Verifique se os arquivos foram gerados com a mesma chave."));
}

console.log(`
${c.bright("===== Artefatos =====")}
${existsSync("Certnew.key") ? `Chave privada : Certnew.key` : ""}
${existsSync("Certnew.cer") ? `Certificado   : Certnew.cer` : ""}
${existsSync("Certnew.csr") ? `CSR           : Certnew.csr` : ""}
${c.bright("=====================")}`);

console.log(c.red("\n[IMPORTANTE] A chave privada (Certnew.key) deve ser armazenada em AMBIENTE SEGURO e NÃO deve ser compartilhada."));
console.log(c.red("Restrinja o acesso (chmod 600 / ACLs), considere cofre de segredos (ex.: HashiCorp Vault, AWS Secrets Manager)"));
console.log(c.red("ou HSM, e mantenha backup criptografado em local controlado.\n"));
console.log(c.green("Concluído."));
