@echo off
REM Run the scanner_v2 daemon. This populates scanner_data.json (drives the left rail)
REM and writes live 1m candles to scanner_db.candles_1m for promoted tickers.
REM
REM Discord alerts are off by default — set ENABLE_DISCORD=1 to restore them.
cd /d "%~dp0"
"C:\Python311\python.exe" -m scanner_v2.main
pause
