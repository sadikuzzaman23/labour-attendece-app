@echo off
title SiteBuild ERP — Launcher
color 0A

:: Run from the bat file's own directory
cd /d "%~dp0"

echo ====================================================
echo  SiteBuild Labour ERP Elite — Starting...
echo ====================================================
echo.

:: Check for Node / npx
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] Node.js found. Launching server on http://localhost:3333...
    start /b cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3333"
    echo [2/2] Server running at http://localhost:3333
    echo        Close this window to stop the server.
    echo.
    call npx -y serve . -l tcp://localhost:3333
    exit
)

:: Fallback: Python
python -c "exit()" >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] Python found. Launching server on http://localhost:3333...
    start /b cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3333"
    echo [2/2] Server running at http://localhost:3333
    echo        Close this window to stop the server.
    echo.
    python -m http.server 3333 --bind 127.0.0.1
    exit
)

:: Last resort: open file directly
echo No server tools found. Opening index.html directly...
echo NOTE: Some features may not work without a local server.
start "" "%~dp0index.html"
exit
