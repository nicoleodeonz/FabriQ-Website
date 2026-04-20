@echo off
REM FabriQ Development Server Startup Script for Windows

echo ============================================
echo FabriQ - Starting Development Environment
echo ============================================

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found: %cd%

REM Check if MongoDB is running
echo.
echo Checking MongoDB connection...
mongosh --eval "db.version()" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Warning: MongoDB doesn't appear to be running
    echo Please start MongoDB before continuing
    echo.
    echo To start MongoDB:
    echo   - On Windows: MongoDB should start automatically as a service
    echo   - Check Services (services.msc) for "MongoDB Server"
    pause
)

REM Start Backend
echo.
echo ============================================
echo Starting Backend Server (port 5000)...
echo ============================================
cd backend
if not exist "node_modules" (
    echo Installing backend dependencies...
    call npm install
)
start cmd /k "npm run dev"

REM Wait a moment for backend to start
timeout /t 3 /nobreak

REM Start Frontend
echo.
echo ============================================
echo Starting Frontend Server (port 3000)...
echo ============================================
cd ..\FabriQ
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)
start cmd /k "npm run dev"

echo.
echo ============================================
echo Development Environment Started!
echo ============================================
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:5000
echo.
echo NOTE:
echo - Two command windows should have opened
echo - Keep both windows open while developing
echo - Close both windows to stop the servers
echo.
pause
