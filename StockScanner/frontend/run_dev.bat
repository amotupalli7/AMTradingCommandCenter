@echo off
REM Frontend dev server (Next.js auto-reloads on file change).
REM Prepend nvm-for-windows Node dir to PATH for this shell so node/npx/npm
REM resolve regardless of system PATH state.
set "PATH=C:\nvm4w\nodejs;%PATH%"
cd /d "%~dp0"
call "node_modules\.bin\next.cmd" dev -p 3000
pause
