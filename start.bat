@echo off
title WaBlast Pro - WhatsApp Bulk Messenger
color 0A
echo.
echo  ==========================================
echo    WaBlast Pro - Starting Server...
echo  ==========================================
echo.

cd /d "%~dp0"

IF NOT EXIST "node_modules" (
  echo  [INFO] Installing dependencies... (first time only)
  echo  This may take 2-3 minutes. Please wait...
  echo.
  call npm install
  echo.
  echo  [OK] Dependencies installed!
  echo.
)

echo  [OK] Starting WaBlast Pro on http://localhost:4040
echo.
echo  >> Open your browser: http://localhost:4040
echo  >> Press Ctrl+C to stop the server
echo.

call npm start

pause
