import { randomUUID } from "crypto";
import { resolve } from "path";
import { xJwsSignature } from "./xJwsSignature";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const privateKey    = await Bun.file(resolve(import.meta.dir, "Certnew.key")).text();
const thumbprint256 = Bun.env.THUMBPRINT256 ?? "";
const serialHex     = Bun.env.SERIAL_HEX    ?? "";
const emissor       = Bun.env.EMISSOR        ?? "";
const adm           = Bun.env.ADM            ?? "";
const baseURL       = Bun.env.BASE_URL       ?? "https://apislcext.api-ativos.com.br";

const signature = xJwsSignature({
  privateKey,
  thumbprint256,
  serialHex,
  emissor,
  adm,
  requestId:      randomUUID().replace(/-/g, ""),
  dataReferencia: new Date().toISOString().split("T")[0]!,
});

const url = `${baseURL}/api/v1/ferramentas/credenciadoras/eco?msg=testesuccess`;

const response = await fetch(url, {
  headers: {
    "x-jws-signature": signature,
    "Content-Type": "application/json",
  },
});

console.log(`Status: ${response.status}`);
console.log(await response.text());
