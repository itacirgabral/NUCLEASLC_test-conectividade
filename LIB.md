# Biblioteca de integração SLC — Nuclea

Implementação mínima para assinar requisições e chamar a API SLC da Nuclea.
Copie `xJwsSignature.ts` para o seu projeto e use `eco.ts` como referência de chamada.

---

## xJwsSignature.ts

Função pura que recebe os parâmetros do participante e retorna o token JWS para o header `x-jws-signature`.

Não lê arquivos, não gera UUIDs, não faz requisições. Lança `Error` se a `privateKey` for inválida.

```typescript
import { createSign } from "crypto";

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

export function xJwsSignature(options: {
  privateKey: string;      // Chave privada RSA em formato PEM
  thumbprint256: string;   // SHA-256 do certificado em hex maiúsculo (32 chars)
  serialHex: string;       // Número de série do certificado em hex (32 chars)
  emissor: string;         // ISPB ou CNPJ Base do emissor principal
  adm: string;             // ISPB ou CNPJ Base do emissor administrado
  requestId: string;       // UUID único por requisição, sem hífens
  dataReferencia: string;  // Data no formato "YYYY-MM-DD"
}): string {
  const { privateKey, thumbprint256, serialHex, emissor, adm, requestId, dataReferencia } = options;

  const header = b64urlEncode(JSON.stringify({
    alg: "RS256",
    "x5t#S256": thumbprint256,
    kid: serialHex,
    "http://www.cip-bancos.org.br/identificador-requisicao": requestId,
    "http://www.cip-bancos.org.br/data-referencia": dataReferencia,
    "http://www.cip-bancos.org.br/identificador-emissor-principal": emissor,
    "http://www.cip-bancos.org.br/identificador-emissor-administrado": adm,
  }));

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.`);
  const signature = sign.sign(privateKey).toString("base64url");

  return `${header}..${signature}`;
}
```

### Sobre os campos

| Campo | Descrição |
|---|---|
| `alg` | Algoritmo de assinatura — fixo `RS256` (RSASSA-PKCS1-v1_5 + SHA-256) |
| `x5t#S256` | Thumbprint SHA-256 do certificado em DER — identifica o certificado na Nuclea |
| `kid` | Serial do certificado em hex — deve ter exatamente 32 caracteres com padding de zeros |
| `identificador-requisicao` | UUID único por chamada sem hífens — usado para rastreamento |
| `data-referencia` | Data da requisição no formato ISO `YYYY-MM-DD` |
| `identificador-emissor-principal` | ISPB ou CNPJ Base do participante que se conecta |
| `identificador-emissor-administrado` | ISPB ou CNPJ Base do participante administrado — igual ao principal em conexão direta sem intermediário |

> Os campos `http://www.cip-bancos.org.br/...` são identificadores de namespace herdados da especificação XML/SOAP do SPB. Não são URLs reais — funcionam como chaves únicas para evitar colisão entre sistemas.

### Formato JWS

O token segue o formato JWS com payload vazio (requisições GET):

```
<header_b64url>..<signature_b64url>
```

O payload vazio entre os dois `.` é intencional — a especificação SLC usa JWS Unencoded Payload.

---

## eco.ts

Exemplo mínimo de chamada ao endpoint de eco usando `xJwsSignature`:

```typescript
import { randomUUID } from "crypto";
import { resolve } from "path";
import { xJwsSignature } from "./xJwsSignature";

// Necessário em homologação — o certificado é autoassinado e não passa
// na validação de cadeia SSL padrão. Remover em produção se o certificado
// for emitido por uma AC reconhecida.
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
```

### Resposta de sucesso

```json
{ "msg": "testesuccess" }
```

### NODE_TLS_REJECT_UNAUTHORIZED

O certificado gerado para homologação é **autoassinado** — não foi emitido por uma Autoridade Certificadora reconhecida. Por isso o Node/Bun rejeita a conexão TLS por padrão.

`NODE_TLS_REJECT_UNAUTHORIZED = "0"` desativa essa validação para que a requisição passe. **Usar apenas em homologação.** Em produção, com certificado emitido por uma AC ICP-Brasil credenciada, essa linha deve ser removida.
