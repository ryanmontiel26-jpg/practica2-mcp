@echo off
chcp 65001 > nul
title Práctica 2: Protocolo MCP por dentro - Runner VS Code
cls

:menu
echo ======================================================================
echo   PRÁCTICA 2: VER EL PROTOCOLO MCP POR DENTRO
echo   Estudiante: Ryan Montiel (ryanmontiel26-jpg)
echo   Entorno: Visual Studio Code en Windows 11
echo ======================================================================
echo.
echo   [1] Ejecutar Cliente MCP Artesanal (cliente_mcp.mjs - 13 mensajes)
echo   [2] Lanzar MCP Inspector interactivo en el navegador
echo   [3] Ver traza generada (salida\traza.jsonl)
echo   [4] Contar mensajes en la traza (Verificar 13)
echo   [5] Ver historial exportado del Inspector (salida\historial_inspector.json)
echo   [6] Salir
echo.
echo ======================================================================
set /p opcion="Selecciona una opción [1-6]: "

if "%opcion%"=="1" goto ejecutar_cliente
if "%opcion%"=="2" goto lanzar_inspector
if "%opcion%"=="3" goto ver_traza
if "%opcion%"=="4" goto contar_mensajes
if "%opcion%"=="5" goto ver_historial
if "%opcion%"=="6" goto salir

echo Opción no válida.
pause
goto menu

:ejecutar_cliente
cls
echo ======================================================================
echo Ejecutando cliente_mcp.mjs con Node.js...
echo ======================================================================
echo.
node "%~dp0cliente_mcp.mjs"
echo.
pause
goto menu

:lanzar_inspector
cls
echo ======================================================================
echo Lanzando MCP Inspector... (Presiona Ctrl+C en esta ventana para salir)
echo ======================================================================
echo.
npx -y "@modelcontextprotocol/inspector" --config "%~dp0mcp.json"
echo.
pause
goto menu

:ver_traza
cls
echo ======================================================================
echo Contenido de salida\traza.jsonl:
echo ======================================================================
echo.
powershell -NoProfile -Command "Get-Content '%~dp0salida\traza.jsonl' | ForEach-Object { $_ }"
echo.
pause
goto menu

:contar_mensajes
cls
echo ======================================================================
echo Verificando cantidad de mensajes en salida\traza.jsonl:
echo ======================================================================
echo.
powershell -NoProfile -Command "$c = (Get-Content '%~dp0salida\traza.jsonl').Count; Write-Host \"Total de mensajes: $c (Esperados: 13)\" -ForegroundColor Green"
echo.
pause
goto menu

:ver_historial
cls
echo ======================================================================
echo Contenido de salida\historial_inspector.json:
echo ======================================================================
echo.
powershell -NoProfile -Command "Get-Content '%~dp0salida\historial_inspector.json' | Select-Object -First 30; Write-Host '... (archivo completo en salida/historial_inspector.json)'"
echo.
pause
goto menu

:salir
exit /b 0
