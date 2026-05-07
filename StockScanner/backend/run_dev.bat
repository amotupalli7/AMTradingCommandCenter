@echo off
REM Backend dev server.
REM
REM No --reload: it SIGKILLs the worker mid-WS-close, which strands the Polygon
REM connection until the gateway times it out (~30s). With multiple saves you
REM stack ghost sessions and trip the per-key concurrent-connection limit.
REM Stop with Ctrl-C, restart with up-arrow + Enter.
cd /d "%~dp0"
"C:\Python311\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level info
pause
