import { createSign } from "crypto";

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

export function xJwsSignature(options: {
  privateKey: string;
  thumbprint256: string;
  serialHex: string;
  emissor: string;
  adm: string;
  requestId: string;
  dataReferencia: string;
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
