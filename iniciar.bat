@echo off
chcp 65001 >nul
title SmartHub — Inicializador

:: ═══════════════════════════════════════════════════════════
::   SMARTHUB — SCRIPT DE INICIALIZAÇÃO DO SISTEMA
::   Plataforma académica configurável
:: ═══════════════════════════════════════════════════════════

color 1F
cls

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║               SmartHub — Plataforma Académica            ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: ─── Verificar Node.js ───────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 4F
    echo  [ERRO] Node.js não encontrado!
    echo  Instale em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% detectado
echo.

:: ─── Instalar dependências da API se necessário ──────────────
echo  A verificar dependências do servidor API...
if not exist "ucm-smarthub-api\node_modules" (
    echo  [INSTALANDO] Dependências da API...
    cd ucm-smarthub-api
    call npm install --silent
    if errorlevel 1 (
        cd ..
        color 4F
        echo  [ERRO] Falha ao instalar dependencias da API.
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Dependências da API instaladas
) else (
    echo  [OK] Dependências da API presentes
)

:: ─── Instalar dependências do Frontend se necessário ─────────
echo  A verificar dependências do frontend...
if not exist "ucm-smarthub-web\node_modules" (
    echo  [INSTALANDO] Dependências do frontend...
    cd ucm-smarthub-web
    call npm install --silent
    if errorlevel 1 (
        cd ..
        color 4F
        echo  [ERRO] Falha ao instalar dependencias do frontend.
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Dependências do frontend instaladas
) else (
    echo  [OK] Dependências do frontend presentes
)

echo.
echo  ─────────────────────────────────────────────────────────
echo  A iniciar os servidores...
echo  ─────────────────────────────────────────────────────────
echo.

:: ─── Iniciar API em nova janela ───────────────────────────────
start "SmartHub — API (Porta 5000)" cmd /k ^
    "color 2F && echo. && echo  SmartHub — SERVIDOR API && echo  ─────────────────────────────────────── && echo. && cd /d %~dp0ucm-smarthub-api && node server.js"

:: Aguardar 2 segundos para a API arrancar
timeout /t 2 /nobreak >nul

:: ─── Iniciar Frontend em nova janela ─────────────────────────
start "SmartHub — Frontend (Porta 5173)" cmd /k ^
    "color 3F && echo. && echo  SmartHub — SERVIDOR WEB && echo  ─────────────────────────────────────── && echo. && cd /d %~dp0ucm-smarthub-web && npm run dev"

:: Aguardar 3 segundos e abrir o browser
echo  [INFO] A aguardar o arranque do frontend...
timeout /t 4 /nobreak >nul

:: Abrir browser automaticamente
echo  [INFO] A abrir o browser...
start http://localhost:5173

echo.
echo  ─────────────────────────────────────────────────────────
echo  [OK] Sistema iniciado com sucesso!
echo.
echo      API:      http://localhost:5000
echo      Website:  http://localhost:5173
echo.
echo  Para parar: feche as janelas dos servidores
echo  ─────────────────────────────────────────────────────────
echo.
pause
