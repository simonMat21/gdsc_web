@echo off
REM Development startup script for Cursor Tracker (Windows)
REM Starts both server and frontend in separate terminals

echo.
echo Launching Cursor Tracker...
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed. Please install Node.js 16+ first.
    pause
    exit /b 1
)

REM Kill any existing processes on ports 4000 and 3000
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":4000 "') do taskkill /pid %%a /f >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000 "') do taskkill /pid %%a /f >nul 2>&1

REM Start backend in new window
echo.
echo Starting backend server...
start "Cursor Tracker - Backend" cmd /k "cd server && npm install && npm run dev"

REM Wait for backend to start
timeout /t 3 /nobreak

REM Start frontend in new window
echo.
echo Starting frontend app...
start "Cursor Tracker - Frontend" cmd /k "cd frontend && npm install && npm run dev"

echo.
echo ════════════════════════════════════════════
echo   Cursor Tracker is starting!
echo.
echo   Backend:  http://localhost:4000
echo   Frontend: http://localhost:3000
echo.
echo   Open http://localhost:3000 in your browser
echo ════════════════════════════════════════════
echo.

pause
