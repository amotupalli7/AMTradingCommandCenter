@echo off
title PlayBook
cd /d "%~dp0PlayBook"

echo Starting PlayBook...
echo.
echo Once ready, the app will open at: http://localhost:5173
echo Close this window to stop the server.
echo.

start "" http://localhost:5173
npm run dev
