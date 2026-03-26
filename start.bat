@echo off
title SiteBuild Labour ERP — Launcher
color 0E

:: Run from the bat file's own directory
cd /d "%~dp0"

echo ====================================================
echo  SiteBuild Labour ERP — Initializing...
echo ====================================================
echo.

:: 1. Check for Node.js / NPM environment
where npm >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/3] Node.js found.
    
    :: 2. Check for node_modules
    if not exist "node_modules\" (
        echo [2/3] node_modules not found. Installing dependencies...
        call npm install
    ) else (
        echo [2/3] Dependencies found.
    )

    echo [3/3] Launching Vite Dev Server on http://localhost:3333...
    echo.
    :: Using Vite (via npm run dev) handles everything: 
    :: - Environment variables (.env)
    :: - Serving the 'public' directory correctly
    :: - Hot Module Replacement (HMR)
    
    :: Open browser after a small delay to ensure server is starting
    start "" cmd /c "ping 127.0.0.1 -n 5 >nul & start http://localhost:3333"
    
    :: Start server
    call npm run dev -- --port 3333 --strictPort
    if %errorlevel% neq 0 (
        echo.
        echo [WARNING] Vite failed to start on port 3333.
        echo Attempting to run on default port...
        call npm run dev
    )
    exit
)


:: 2. Fallback: Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] Node.js not found. Using Python as fallback...
    echo [2/2] Launching server on http://localhost:3333...
    start "" cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3333"
    python -m http.server 3333 --bind 127.0.0.1
    exit
)

:: 3. Last resort: open file directly
echo.
echo [CRITICAL] No server tools (Node/Python) found!
echo Opening index.html directly...
echo NOTE: Some features (like .env and modules) might NOT work.
echo.
start "" "%~dp0index.html"
pause
exit


