@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Starting Comm (Backend + Frontend) in Network Mode
echo ===================================================
echo.

:: Detect Local IP Address
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
    set LOCAL_IP=%%a
    goto :ip_found
)
:ip_found
if "%LOCAL_IP%"=="" set LOCAL_IP=192.168.1.104

echo [Network URLs]
echo   Frontend : http://localhost:3000  or  http://%LOCAL_IP%:3000
echo   Backend  : http://localhost:5000  or  http://%LOCAL_IP%:5000
echo.

echo [Cleaning old processes on ports 5000 and 3000...]
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /f /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%p >nul 2>&1

start "Comm Backend (Port 5000)" cmd /k "cd /d %~dp0backend && npm run start:dev"
start "Comm Frontend (Port 3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Both services launched in separate windows!
echo Press any key to exit this launcher window...
pause >nul
