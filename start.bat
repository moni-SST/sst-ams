@echo off
title SST Application Management System
echo Starting SST Application...
echo.

start "SST Backend" cmd /k "cd /d "d:\SST Application management system\backend" && node server.js"
timeout /t 2 /nobreak >nul
start "SST Frontend" cmd /k "cd /d "d:\SST Application management system\frontend" && npm run dev"
timeout /t 4 /nobreak >nul

echo Both servers started!
echo.
echo Opening browser...
start http://localhost:5173

echo.
echo Login: admin / admin123
echo.
pause
