@echo off
title Gemini Chatbot Launcher
cls

echo ===================================================
echo        Starting Gemini AI Chatbot System
echo ===================================================
echo.

cd /d "%~dp0backend"

:: Check if node_modules exists, if not install
if not exist "node_modules\" (
    echo [INFO] First time run detected: Installing backend dependencies...
    call npm.cmd install
    echo.
)

:: Check if .env exists, if not copy from .env.example
if not exist ".env" (
    echo [INFO] Creating .env file from .env.example...
    copy .env.example .env
    echo [IMPORTANT] Please add your GEMINI_API_KEY inside backend\.env or the UI Settings modal!
    echo.
)

echo [INFO] Starting Backend Server on http://localhost:5000 ...
echo [INFO] Press Ctrl+C in this terminal to stop the server anytime.
echo.

:: Open browser after 2 seconds in parallel
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5000"

:: Start the Express server
node server.js

pause
