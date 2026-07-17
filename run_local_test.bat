@echo off
setlocal

echo ============================================================
echo  ProAI-SLO Advisory Console — Local Test Runner
echo ============================================================
echo.

cd /d "%~dp0web"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on PATH.
    echo Install Node.js 20+ from https://nodejs.org and try again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies — first run only, this can take a few minutes...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See the output above.
        pause
        exit /b 1
    )
    echo.
)

rem Pinned to a dedicated, uncommon port rather than the Next.js default
rem (3000): another project on this machine (SoulMen) already occupies 3000,
rem and Next.js silently falls back to the next free port when that happens
rem — which then opens the browser on the wrong app if this script still
rem hardcodes :3000. Pinning here means this script fails loudly if 3900 is
rem ever taken, instead of silently landing on someone else's app.
set PROAI_SLO_PORT=3900

echo Starting the dev server on http://localhost:%PROAI_SLO_PORT%
echo A browser tab will open automatically in a few seconds.
echo Leave this window open while testing. Press Ctrl+C here to stop the server.
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:%PROAI_SLO_PORT%"

call npm run dev -- -p %PROAI_SLO_PORT%

echo.
echo Dev server stopped.
pause
