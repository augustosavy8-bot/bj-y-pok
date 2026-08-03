@echo off
REM Arranca el agente de impresion (ventana visible, para probar).
cd /d "%~dp0"
if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)
node index.js
pause
