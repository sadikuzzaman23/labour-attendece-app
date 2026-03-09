@echo off
title SiteBuild App Launcher
color 0A

:: Ensure we are starting in the directory where the .bat file is located
cd /d "%~dp0"

echo ===================================================
echo Starting SiteBuild ERP...
echo ===================================================
echo.

:: Try opening through Node.js if installed
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] Node.js found. Starting local server...
    start /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
    echo [2/2] Server is running. Close this window to stop the server.
    call npx -y serve . -l 3000
    exit
)

:: Try opening through Python if installed
python -c "exit()" >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] Python found. Starting local server...
    start /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8000"
    echo [2/2] Server is running. Close this window to stop the server.
    python -m http.server 8000
    exit
)

:: Fallback: Open index.html directly
echo Local server tools not found. Opening the app directly in browser...
start "" "index.html"
exit
