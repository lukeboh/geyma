# Inicia o "Geyma no celular" em segundo plano (sem janela) e publica na rede
# Tailscale. Pode rodar de novo à vontade: não duplica o servidor.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File mobile\iniciar.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$dados = Join-Path $env:LOCALAPPDATA 'geyma'
New-Item -ItemType Directory -Force $dados | Out-Null
$log = Join-Path $dados 'celular.log'
$ts = 'C:\Program Files\Tailscale\tailscale.exe'

$escutando = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if (-not $escutando) {
  $node = (Get-Command node).Source
  Start-Process -FilePath $node -ArgumentList "`"$raiz\mobile\servidor.mjs`"" -WorkingDirectory $raiz `
    -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  Start-Sleep -Seconds 2
  'servidor iniciado'
} else { 'servidor já estava rodando' }

if (Test-Path $ts) {
  & $ts serve --bg --http 8080 http://127.0.0.1:8765 | Out-Null
  $nome = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
  $token = (Get-Content (Join-Path $dados 'celular.json') | ConvertFrom-Json).token
  "No celular (rede Tailscale ligada), abra uma vez: http://${nome}:8080/entrar?t=$token"
} else { 'Tailscale não encontrado: o acesso fica só neste computador (http://127.0.0.1:8765)' }
