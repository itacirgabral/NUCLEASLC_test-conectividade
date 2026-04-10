# Teste de Conectividade — SLC (Nuclea)

Ferramenta para validar a conectividade com a API da **Nuclea** no ambiente de homologação do **SLC (Sistema de Liquidação Centralizada)**.

Realiza autenticação via assinatura JWS com certificado digital (RS256) e chama o endpoint de eco da API para confirmar que a integração está operacional antes de ir para produção.

---

## Pré-requisitos

- [Bun](https://bun.sh) instalado
- [OpenSSL](https://openssl.org) instalado e disponível no PATH — necessário para `bun run gerar-certificado`
- Certificado digital registrado pela Nuclea no Atlante Viewer (veja seção abaixo)
- ISPB ou CNPJ Base do participante

---

## Fluxo completo

```
1. Gerar certificado  →  2. Enviar CSR à Nuclea  →  3. Configurar .env  →  4. Executar teste
```

### 1. Gerar o certificado

```bash
bun run gerar-certificado
```

O script `gerar-certificado.ts` solicita interativamente CN, OU institucional, ISPB, sigla e código do sistema (ex.: `SLC T001`), localidade e validade. Ao final verifica se os três artefatos compartilham o mesmo módulo RSA.

Artefatos gerados na raiz do projeto:

| Arquivo       | Descrição                                     |
|---------------|-----------------------------------------------|
| `Certnew.key` | Chave privada RSA 2048 (formato PEM)          |
| `Certnew.cer` | Certificado autoassinado (formato PEM)        |
| `Certnew.csr` | CSR gerada com a mesma chave, para envio à AC |

> **Atenção:** `Certnew.key` é a chave privada e não deve ser compartilhada. Armazene com permissões restritas (`chmod 600`).

### 2. Enviar o CSR à Nuclea

Envie o arquivo `Certnew.csr` à Nuclea para cadastro no Atlante Viewer. O teste de conectividade só funcionará após o certificado estar registrado.

### 3. Configurar o `.env`

```bash
cp .env.example .env
```

Preencha as variáveis conforme abaixo:

| Variável        | Descrição                                              |
|-----------------|--------------------------------------------------------|
| `BASE_URL`      | URL base da API (padrão: ambiente de homologação)      |
| `SERIAL_HEX`    | Número de série do certificado em hexadecimal          |
| `THUMBPRINT256` | Hash SHA-256 do certificado em maiúsculas              |
| `EMISSOR`       | ISPB ou CNPJ Base do participante (emissor principal)  |
| `ADM`           | ISPB ou CNPJ Base do participante (emissor administrado — igual ao `EMISSOR` para conexão direta sem intermediário) |

A chave privada é lida automaticamente do arquivo `Certnew.key`.

#### Obtendo o SERIAL_HEX e o THUMBPRINT256

Execute o script utilitário para calcular os dois valores a partir do `Certnew.cer`:

```bash
bun run cert-info
```

Saída esperada:

```
SERIAL_HEX=D8E5EA1256D734AD
THUMBPRINT256=2AE765129318BC2DB1B2C24546A599F0BDD4612003984224D80C9E595A3B3AE9
```

Copie os valores para o `.env`.

- **SERIAL_HEX** — número de série do certificado, também visível no **Atlante Viewer - NG**. A API exige exatamente **32 caracteres hex** — o script `cert-info.ts` já aplica o padding com zeros à esquerda automaticamente (ex: `0000000000000000D8E5EA1256D734AD`)
- **THUMBPRINT256** — hash SHA-256 do certificado em formato DER, enviado no header JWS (`x5t#S256`) para que a Nuclea identifique qual certificado verificar a assinatura

> O kit da Nuclea vem com um valor pré-preenchido (`8F1BECCC...`). Verifique com a Nuclea se esse valor deve ser mantido ou substituído pelo hash do seu `Certnew.cer`.

### 4. Executar o teste

Instale as dependências:

```bash
bun install
```

Teste simples:

```bash
bun start
```

Teste salvando o resultado em `teste-conectividade.log`:

```bash
bun run test:conectividade
```

Para ver detalhes completos da resposta da API:

```bash
bun start --verbose
```

---

## Resultado esperado

Em caso de sucesso:

```
✅ Conectividade OK
```

Em caso de falha, verifique:

- `SERIAL_HEX` e `THUMBPRINT256` correspondem ao certificado cadastrado pela Nuclea
- `EMISSOR` e `ADM` preenchidos com o ISPB ou CNPJ Base correto
- `Certnew.key` presente na raiz do projeto e compatível com o `Certnew.cer` enviado

---

## Arquivos do projeto

| Arquivo                                        | Descrição                                                            |
|------------------------------------------------|----------------------------------------------------------------------|
| `index.ts`                                     | Script principal — gera o JWS e executa o teste de conectividade    |
| `gerar-certificado.ts`                         | Gerador interativo de certificados (key + cer + csr)                |
| `.env.example`                                 | Template de configuração                                            |
| `package.json`                                 | Scripts do projeto                                                  |
| `tsconfig.json`                                | Configuração TypeScript                                             |

### Arquivos de referência (kit original Nuclea)

Mantidos como documentação do kit recebido:

| Arquivo                                        | Descrição                                                            |
|------------------------------------------------|----------------------------------------------------------------------|
| `Gerar certificado.BAT`                        | Script original Windows — substituído por `gerar-certificado.ts`    |
| `teste-conectividade-credenciadoras.py`        | Script original Python — substituído por `index.ts`                 |
| `requirements.txt`                             | Dependências Python do script original                              |
| `Roteiro Teste de Conectividade API v.1.0.pdf` | Roteiro oficial da Nuclea com instruções do teste                   |
