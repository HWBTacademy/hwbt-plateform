@echo off
setlocal
set "PY=C:\Users\demar\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PY%" (
  echo Python Codex introuvable.
  pause
  exit /b 1
)
"%PY%" "%~dp0tools\convert_latest_reel.py"
pause
