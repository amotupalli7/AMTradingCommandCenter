@echo off
title Trader Journal
cd /d "%~dp0TraderJournal\trader-journal"

echo Starting Trader Journal...
echo.
echo Once ready, the app will open at: http://localhost:3000
echo Close this window to stop the server.
echo.

start "" "http://localhost:3000"
npm run dev
