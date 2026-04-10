import { createSign } from "crypto";
import { randomUUID } from "crypto";
import { resolve } from "path";

const baseURL = Bun.env.BASE_URL ?? "https://apislcext.api-ativos.com.br";
const privateKey = await Bun.file(resolve(import.meta.dir, "Certnew.key")).text();
const serialHex = Bun.env.SERIAL_HEX ?? "";
const thumbprint256 = Bun.env.THUMBPRINT256 ?? "";
const emissor = Bun.env.EMISSOR ?? "";
const adm = Bun.env.ADM ?? "";

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

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

const sign = createSign("RSA-SHA256");
sign.update(`${encodedHeader}.`);
const signature = sign.sign(privateKey).toString("base64url");

const jws = `${encodedHeader}..${signature}`;
const url = `${baseURL}/api/v1/ferramentas/credenciadoras/eco?msg=testesuccess`;

console.log(`curl -sk -H "Content-Type: application/json" -H "x-jws-signature: ${jws}" "${url}"`);
