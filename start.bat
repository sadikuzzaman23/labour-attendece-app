@echo off
title SiteBuild Labour ERP — Elite Launcher
color 0B

:: Run from the bat file's own directory
cd /d "%~dp0"

echo ====================================================
echo  🏗️ SiteBuild Labour ERP — System Diagnostic
echo ====================================================
echo.

:: 1. Check for Port 3333 Conflict
echo [1/4] Checking Port 3333...
netstat -ano | findstr :3333 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo [!] Port 3333 is already in use. Attempting to clear it...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
        echo [!] Found process ID %%a, terminating...
        taskkill /F /PID %%a > nul 2>&1
    )
    timeout /t 1 > nul
) else (
    echo [✓] Port 3333 is free.
)

:: 2. Check for Node.js
where npm >nul 2>nul
if %errorlevel% equ 0 (
    echo [2/4] Node.js environment detected.
    
    :: Check for node_modules
    if not exist "node_modules\" (
        echo [3/4] node_modules missing. Installing dependencies...
        call npm install
    ) else (
        echo [3/4] Dependencies verified.
    )

    echo [4/4] Launching Vite Dev Server on http://127.0.0.1:3333...
    echo.
    echo ----------------------------------------------------
    echo  SYSTEM READY. PLEASE KEEP THIS WINDOW OPEN.
    echo ----------------------------------------------------
    
    :: Open browser after a small delay
    start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:3333"
    
    :: Start server
    call npm run dev -- --port 3333 --strictPort --host 127.0.0.1
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Vite failed to start.
        pause
    )
    exit
)

:: 3. Fallback: Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [2/3] Node.js not found. Using Python fallback...
    echo [3/3] Launching server on http://127.0.0.1:3333...
    start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:3333"
    python -m http.server 3333 --bind 127.0.0.1
    exit
)

:: 4. Last resort: open file directly
echo.
echo [CRITICAL] No server tools (Node/Python) found!
echo Opening index.html directly...
echo NOTE: Some features (like .env and modules) might NOT work.
echo.
start "" "%~dp0index.html"
pause
exit
