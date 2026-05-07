@echo off
REM Boot the whole StockScanner app: backend + frontend in their own windows.
REM Each window auto-reloads on code changes. Close the windows to stop.
setlocal
set ROOT=%~dp0

start "StockScanner Scanner"  cmd /k "%ROOT%run_scanner.bat"
start "StockScanner Backend"  cmd /k "%ROOT%backend\run_dev.bat"
start "StockScanner Frontend" cmd /k "%ROOT%frontend\run_dev.bat"

echo.
echo Scanner  -^>  scanner_v2 daemon (writes scanner_data.json + live 1m candles)
echo Backend  -^>  http://127.0.0.1:8000  (health: /api/health)
echo Frontend -^>  http://127.0.0.1:3000
echo.
echo Three terminal windows just opened. Close them when you're done.
echo.
endlocal
