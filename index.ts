import { createSign } from "crypto";
import { randomUUID } from "crypto";
import { parseArgs } from "util";
import { resolve } from "path";

// Desativa verificação SSL (apenas para desenvolvimento)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ─── Configurações ────────────────────────────────────────────────────────────
const baseURL = Bun.env.BASE_URL ?? "https://apislcext.api-ativos.com.br";
const privateKey = await Bun.file(resolve(import.meta.dir, "Certnew.key")).text();
const serialHex = Bun.env.SERIAL_HEX ?? "";
const thumbprint256 = Bun.env.THUMBPRINT256 ?? "";
const emissor = Bun.env.EMISSOR ?? "";
const adm = Bun.env.ADM ?? "";

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bright: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function colorBright(text: string, colorFn: (s: string) => string): string {
  return c.bright(colorFn(text));
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function getCurrentDatetime(): [string, string] {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR");
  return [date, time];
}

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
async function progressBar(label: string, durationMs: number): Promise<void> {
  const steps = 50;
  const interval = durationMs / steps;
  for (let i = 0; i <= steps; i++) {
    const filled = "█".repeat(i);
    const empty = "░".repeat(steps - i);
    process.stdout.write(`\r${label} [${filled}${empty}] ${i}/${steps}`);
    await Bun.sleep(interval);
  }
  process.stdout.write("\n");
}

// ─── Table (estilo grid) ──────────────────────────────────────────────────────
function gridTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? "").length))
  );

  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const headerRow =
    "|" + headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join("|") + "|";
  const dataRows = rows.map((r) =>
    "|" +
    r
      .map((cell, i) => {
        const plain = stripAnsi(cell);
        const pad = widths[i] - plain.length;
        return ` ${cell}${" ".repeat(pad)} `;
      })
      .join("|") +
    "|"
  );

  return [sep, headerRow, sep, ...dataRows.flatMap((r) => [r, sep])].join("\n");
}

// ─── JWS ──────────────────────────────────────────────────────────────────────
function generateJws(): string {
  const joseHeader = {
    alg: "RS256",
    "x5t#S256": thumbprint256,
    kid: serialHex,
    "http://www.cip-bancos.org.br/identificador-requisicao": randomUUID().replace(/-/g, ""),
    "http://www.cip-bancos.org.br/data-referencia": new Date().toISOString().split("T")[0],
    "http://www.cip-bancos.org.br/identificador-emissor-principal": emissor,
    "http://www.cip-bancos.org.br/identificador-emissor-administrado": adm,
  };

  const encodedHeader = b64urlEncode(JSON.stringify(joseHeader));
  const encodedPayload = "";

  try {
    const sign = createSign("RSA-SHA256");
    sign.update(`${encodedHeader}.${encodedPayload}`);
    const signature = sign.sign(privateKey);
    const encodedSignature = signature.toString("base64url");
    return `${encodedHeader}..${encodedSignature}`;
  } catch {
    throw new Error("Erro ao gerar JWS: Verifique a chave privada e demais parâmetros");
  }
}

// ─── Teste de conectividade ───────────────────────────────────────────────────
async function testConnectivity(verbose = false): Promise<void> {
  console.log(c.cyan("\nTestando conectividade com a API..."));
  await progressBar("Progresso", 2000);

  let jwsSignature: string;
  try {
    jwsSignature = generateJws();
  } catch (e) {
    const [date, time] = getCurrentDatetime();
    const status = colorBright("❌ Erro na chave privada", c.red);
    console.log("\n" + gridTable(["Data", "Hora", "Status"], [[date, time, status]]));
    console.log(c.red(`\nERRO: ${e instanceof Error ? e.message : e}`));
    console.log(
      c.red(
        "OBS: Verifique especialmente:\n" +
        "- A chave privada (formato PEM, sem espaços extras)\n" +
        "- Thumbprint e serialHex\n" +
        "- Emissor e ADM"
      )
    );
    return;
  }

  const url = `${baseURL}/api/v1/ferramentas/credenciadoras/eco?msg=testesuccess`;
  const headers = {
    "x-jws-signature": jwsSignature,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, { headers });
    const [date, time] = getCurrentDatetime();

    if (response.ok) {
      const json = await response.json();
      if (json?.msg === "testesuccess") {
        const status = colorBright("✅ Conectividade OK", c.green);
        console.log("\n" + gridTable(["Data", "Hora", "Status"], [[date, time, status]]));
        if (verbose) console.log(c.cyan(`\nResposta da API: ${JSON.stringify(json, null, 4)}`));
      } else {
        const status = colorBright("⚠ Resposta inesperada", c.yellow);
        console.log("\n" + gridTable(["Data", "Hora", "Status"], [[date, time, status]]));
        if (verbose) console.log(c.yellow(`\nResposta inesperada: ${JSON.stringify(json)}`));
      }
    } else {
      const status = colorBright("❌ Falha na conectividade", c.red);
      console.log("\n" + gridTable(["Data", "Hora", "Status"], [[date, time, status]]));
      console.log(c.red(`\nERRO: Status Code ${response.status}`));
      console.log(c.red("OBS: Verifique se todas as variáveis estão preenchidas corretamente!"));
      if (verbose) console.log(c.red(`Resposta completa: ${await response.text()}`));
    }
  } catch (e) {
    const [date, time] = getCurrentDatetime();
    const status = colorBright("❌ Erro na requisição", c.red);
    console.log("\n" + gridTable(["Data", "Hora", "Status"], [[date, time, status]]));
    console.log(c.red(`\nERRO: ${e instanceof Error ? e.message : e}`));
    console.log(c.red("OBS: Verifique sua conexão e as variáveis de configuração!"));
    if (verbose) console.log(c.red(`Detalhes do erro: ${e}`));
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
${c.cyan("Modo de uso:")}
  bun index.ts [opções]

${c.yellow("Opções:")}
  -h, --help    Mostra esta mensagem de ajuda
  -v, --verbose Mostra detalhes da resposta da API

${c.green("Como usar:")}
  1. Preencha as variáveis no início do script:
     - baseURL
     - privateKey (formato PEM, sem alterações)
     - serialHex
     - thumbprint256 (SHA-256 em maiúsculas, sem espaços)
     - emissor
     - adm
  2. Execute o script normalmente para testar conectividade
  3. Use ${c.bright("-v")} para modo detalhado

${c.red("Problemas comuns:")}
  - Chave privada com formatação incorreta
  - Thumbprint com caracteres inválidos
  - URL da API incorreta
  - Problemas de conexão com a internet
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help:    { type: "boolean", short: "h" },
    verbose: { type: "boolean", short: "v" },
  },
  strict: false,
});

if (values.help) {
  showHelp();
} else {
  await testConnectivity(values.verbose ?? false);
}
