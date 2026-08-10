# =================================================================
#   UCM SmartHub -- Script de Inicializacao (PowerShell 5.1+)
#   Universidade Catolica de Mocambique . Extensao de Tete
# =================================================================

$raiz   = $PSScriptRoot
$apiDir = Join-Path $raiz "ucm-smarthub-api"
$webDir = Join-Path $raiz "ucm-smarthub-web"
$tmp    = $env:TEMP

# -----------------------------------------------------------------
# Funcoes de output colorido
# -----------------------------------------------------------------
function Write-Ok  { param([string]$m); Write-Host "  [OK] " -ForegroundColor Green  -NoNewline; Write-Host $m }
function Write-Err { param([string]$m); Write-Host "  [ERRO] " -ForegroundColor Red   -NoNewline; Write-Host $m }
function Write-Info{ param([string]$m); Write-Host "  [ >> ] " -ForegroundColor Yellow -NoNewline; Write-Host $m }
function Write-Sep { Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray }

# -----------------------------------------------------------------
# Cabecalho
# -----------------------------------------------------------------
Clear-Host
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor DarkBlue
Write-Host "       UCM SmartHub -- Sistema Academico                        " -ForegroundColor Cyan
Write-Host "       Universidade Catolica de Mocambique - Extensao de Tete   " -ForegroundColor White
Write-Host "  ================================================================" -ForegroundColor DarkBlue
Write-Host ""

# -----------------------------------------------------------------
# Verificar Node.js
# -----------------------------------------------------------------
Write-Info "A verificar Node.js..."
try {
    $nodeVer = (node --version 2>$null)
    if (-not $nodeVer) { throw "nao encontrado" }
    Write-Ok "Node.js $nodeVer detectado"
} catch {
    Write-Err "Node.js nao encontrado! Instale em https://nodejs.org"
    Read-Host "Prima Enter para sair"
    exit 1
}

# -----------------------------------------------------------------
# Instalar dependencias da API
# -----------------------------------------------------------------
Write-Info "A verificar dependencias da API..."
if (-not (Test-Path (Join-Path $apiDir "node_modules"))) {
    Write-Host "       Instalando..." -ForegroundColor DarkYellow
    Push-Location $apiDir
    npm install --silent 2>$null
    Pop-Location
    Write-Ok "Dependencias da API instaladas"
} else {
    Write-Ok "Dependencias da API OK"
}

# -----------------------------------------------------------------
# Instalar dependencias do Frontend
# -----------------------------------------------------------------
Write-Info "A verificar dependencias do frontend..."
if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
    Write-Host "       Instalando..." -ForegroundColor DarkYellow
    Push-Location $webDir
    npm install --silent 2>$null
    Pop-Location
    Write-Ok "Dependencias do frontend instaladas"
} else {
    Write-Ok "Dependencias do frontend OK"
}

Write-Host ""
Write-Sep
Write-Info "A iniciar os servidores..."
Write-Sep
Write-Host ""

# -----------------------------------------------------------------
# Criar script temporario para a janela da API
# -----------------------------------------------------------------
$scriptAPI = @"
`$Host.UI.RawUI.WindowTitle = 'UCM SmartHub - API (Porta 5000)'
`$Host.UI.RawUI.BackgroundColor = 'DarkBlue'
Clear-Host
Write-Host ''
Write-Host '  UCM SmartHub - SERVIDOR API' -ForegroundColor Yellow
Write-Host '  Porta: 5000  |  http://localhost:5000' -ForegroundColor Cyan
Write-Host ''
Write-Host '  --------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''
Set-Location '$apiDir'
node server.js
Write-Host ''
Write-Host '  [!] Servidor API parou. Prima Enter para fechar.' -ForegroundColor Red
Read-Host
"@

$caminhoAPI = Join-Path $tmp "ucm_api_launcher.ps1"
$scriptAPI | Out-File -FilePath $caminhoAPI -Encoding UTF8 -Force

# -----------------------------------------------------------------
# Criar script temporario para a janela do Frontend
# -----------------------------------------------------------------
$scriptWeb = @"
`$Host.UI.RawUI.WindowTitle = 'UCM SmartHub - Frontend (Porta 5173)'
`$Host.UI.RawUI.BackgroundColor = 'DarkGreen'
Clear-Host
Write-Host ''
Write-Host '  UCM SmartHub - SERVIDOR WEB (Vite)' -ForegroundColor Yellow
Write-Host '  Porta: 5173  |  http://localhost:5173' -ForegroundColor Cyan
Write-Host ''
Write-Host '  --------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''
Set-Location '$webDir'
npm run dev
Write-Host ''
Write-Host '  [!] Servidor Web parou. Prima Enter para fechar.' -ForegroundColor Red
Read-Host
"@

$caminhoWeb = Join-Path $tmp "ucm_web_launcher.ps1"
$scriptWeb | Out-File -FilePath $caminhoWeb -Encoding UTF8 -Force

# -----------------------------------------------------------------
# Abrir janela da API
# -----------------------------------------------------------------
Start-Process powershell -ArgumentList "-NoExit", "-File", $caminhoAPI
Write-Ok "Janela da API aberta (aguardar 2s para arrancar...)"
Start-Sleep -Seconds 2

# -----------------------------------------------------------------
# Abrir janela do Frontend
# -----------------------------------------------------------------
Start-Process powershell -ArgumentList "-NoExit", "-File", $caminhoWeb
Write-Ok "Janela do Frontend aberta"

# -----------------------------------------------------------------
# Aguardar e abrir browser
# -----------------------------------------------------------------
Write-Info "A aguardar o arranque do frontend (4 segundos)..."
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
Write-Ok "Browser aberto em http://localhost:5173"

Write-Host ""
Write-Sep
Write-Ok "Sistema UCM SmartHub iniciado com sucesso!"
Write-Host ""
Write-Host "      API:     http://localhost:5000" -ForegroundColor Cyan
Write-Host "      Website: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Para parar: feche as duas janelas dos servidores" -ForegroundColor DarkGray
Write-Sep
Write-Host ""
Read-Host "Prima Enter para fechar esta janela"
