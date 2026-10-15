@echo off
title Supabase Database Setup
cls

echo ====================================================
echo        Supabase Database Migration Runner
echo ====================================================
echo.

cd /d "%~dp0backend"
node scripts/setup-db.js %*

echo.
pause
