@echo off
setlocal enabledelayedexpansion
echo === Gerar key, cer (autoassinado) e csr usando a MESMA chave ===
echo === Os dados do certificado serao solicitados a seguir. ===
echo.

:: --------- Coletar dados do cliente ---------
set /p "CN=Informe o CN (ex.: teste.hext.com.br): "
set /p "OU=Informe a OU (Nome Institucional): "
set /p "ISPB=Informe o numero do ISPB (8 primerios digitos do CNPJ): "

:: Sigla e codigo que compoem o campo O dinamico (ex.: RRC T001, DUP T001, SCC T001)
set /p "SIGLA=Informe a sigla (ex.: CCC, CMP, CTC, MCB, PCA, RRC, SCC, SLC, RRC, SEC): "
set /p "CODIGO=Informe o codigo (ex.: T001 para homologacacao ou P001 para producao): "

set /p "L=Informe a Cidade (L) [padrao: Sao Paulo]: "
set /p "S=Informe o Estado (S) [padrao: SP]: "
set /p "C=Informe o Pais (C) [padrao: BR]: "

:: --------- Defaults se o usuario deixar em branco ---------
if not defined L set "L=Sao Paulo"
if not defined S set "S=SP"
if not defined C set "C=BR"

:: --------- Perguntar validade e senha da chave (opcional) ---------
set "DAYS=365"
set /p "DAYS=Informe a validade em dias [padrao: 365]: "
if "%DAYS%"=="" set "DAYS=365"

echo.
echo [Opcional] Protecao da chave privada com senha
echo - Se desejar criptografar a .key, informe uma senha forte.
echo - Se deixar em branco, a chave sera gerada SEM senha.
set "PASS="
set /p "PASS=Informe a senha da chave (ou deixe em branco): "

:: --------- Sanitizacao simples (remover aspas) ---------
for %%V in (CN OU ISPB SIGLA CODIGO L S C DAYS PASS) do (
  set "%%V=!%%V:"=%%!"
)

:: --------- Montar SUBJECT ---------
:: Resultado: ... /O=%ISPB%/O=%SIGLA% %CODIGO%/O=ICP-Brasil/ ...
set "SUBJ=/CN=%CN%/OU=%OU%/OU=%ISPB%/OU=%SIGLA% %CODIGO%/OU=ICP-Brasil/L=%L%/S=%S%/C=%C%"

:: --------- Serial aleatorio 64 bits ---------
set "serial="
for /L %%A in (1,1,8) do (
  set /A rand=!random! %% 256
  set "hex=0!rand!"
  set "serial=!serial!!hex:~-2!"
)

echo.
echo [Resumo]
echo CN              : %CN%
echo OU              : %OU%
echo O (ISPB)        : %ISPB%
echo O (Sigla+Codigo): %SIGLA% %CODIGO%
echo O               : ICP-Brasil
echo L/S/C           : %L% / %S% / %C%
echo Validade        : %DAYS% dias
if defined PASS (echo Chave           : SERA GERADA COM SENHA) else (echo Chave           : SERA GERADA SEM SENHA)
echo Serial          : 0x%serial%
echo Subject         : %SUBJ%
echo.

:: -------- Aviso de seguranca sobre a chave privada --------
echo [AVISO] A chave privada (.key) e confidencial: armazene com seguranca (permissoes restritas),
echo         nunca compartilhe por e-mail/mensageria e mantenha backups criptografados.
echo.

:: -------- Checar OpenSSL no PATH --------
openssl version >nul 2>&1
if errorlevel 1 (
  echo [ERRO] OpenSSL nao encontrado no PATH. Verifique instalacao ou PATH.
  goto end
)

:: -------- Etapa 1: Autoassinado (gera key + cer) --------
echo [1/3] Certificado autoassinado (gera Certnew.key e Certnew.cer)
if defined PASS (
  echo Comando: openssl req -x509 -newkey rsa:2048 -sha256 -days %DAYS% -keyout Certnew.key -out Certnew.cer -subj "%SUBJ%" -set_serial 0x%serial% -passout pass:********
) else (
  echo Comando: openssl req -x509 -newkey rsa:2048 -sha256 -days %DAYS% -nodes -keyout Certnew.key -out Certnew.cer -subj "%SUBJ%" -set_serial 0x%serial%
)
pause

if defined PASS (
  openssl req -x509 -newkey rsa:2048 -sha256 -days %DAYS% -keyout Certnew.key -out Certnew.cer -subj "%SUBJ%" -set_serial 0x%serial% -passout pass:%PASS%
) else (
  openssl req -x509 -newkey rsa:2048 -sha256 -days %DAYS% -nodes -keyout Certnew.key -out Certnew.cer -subj "%SUBJ%" -set_serial 0x%serial%
)
if errorlevel 1 (
  echo [ERRO] Falha ao gerar chave/certificado autoassinado.
  goto end
) else (
  echo [OK] Gerados: Certnew.key e Certnew.cer
)
echo.

:: -------- Etapa 2: CSR usando a MESMA chave --------
echo [2/3] Gerar CSR reutilizando a MESMA chave e o MESMO subject
if defined PASS (
  echo Comando: openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "%SUBJ%" -passin pass:********
) else (
  echo Comando: openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "%SUBJ%"
)
pause

if defined PASS (
  openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "%SUBJ%" -passin pass:%PASS%
) else (
  openssl req -new -sha256 -key Certnew.key -out Certnew.csr -subj "%SUBJ%"
)
if errorlevel 1 (
  echo [ERRO] Falha ao gerar a CSR.
  goto end
) else (
  echo [OK] CSR gerada: Certnew.csr
)
echo.

:: -------- Etapa 3: Verificacao de correspondencia (modulus) --------
echo [3/3] Verificando se key, cer e csr correspondem (comparando modulus)...

openssl rsa -in Certnew.key -noout -modulus %__PASSIN__% | openssl md5 > key.md5
openssl x509 -in Certnew.cer -noout -modulus | openssl md5 > cer.md5
openssl req -in Certnew.csr -noout -modulus | openssl md5 > csr.md5

:: Ler MD5s para comparar
set "KMD5="
set "CMD5="
set "SMD5="
for /f "usebackq delims=" %%i in ("key.md5") do set "KMD5=%%i"
for /f "usebackq delims=" %%i in ("cer.md5") do set "CMD5=%%i"
for /f "usebackq delims=" %%i in ("csr.md5") do set "SMD5=%%i"

if /I "%KMD5%"=="%CMD5%" if /I "%KMD5%"=="%SMD5%" (
  echo [OK] Modulus conferem: key == cer == csr
) else (
  echo [ALERTA] Modulus NAO conferem. Verifique se os arquivos foram gerados com a mesma chave.
)

:: Limpar arquivos temporarios
del /q key.md5 cer.md5 csr.md5 >nul 2>&1

echo.
echo ===== Artefatos =====
if exist Certnew.key echo Chave privada: Certnew.key
if exist Certnew.cer echo Certificado  : Certnew.cer
if exist Certnew.csr echo CSR          : Certnew.csr
echo ======================
echo.

:: -------- Mensagem FINAL de seguranca --------
echo [IMPORTANTE] A chave privada (Certnew.key) deve ser armazenada em AMBIENTE SEGURO e NAO deve ser compartilhada.
echo Restrinja o acesso (NTFS/ACLs), considere cofre de segredos (ex.: Azure Key Vault/HashiCorp Vault)
echo ou HSM, e mantenha backup criptografado em local controlado.
echo.
echo Concluido.

:end
endlocal
