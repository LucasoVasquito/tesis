@echo off
title Tesis - Launcher
echo ========================================
echo   Iniciando servidores de la Tesis...
echo ========================================
echo.

:: Inicia el backend (Express) en una ventana separada
start "Tesis - Backend (server)" cmd /k "cd /d %~dp0 && npm run server"

:: Pequeña pausa para que no se pisen
timeout /t 2 /nobreak >nul

:: Inicia el frontend (Vite) en otra ventana separada
start "Tesis - Frontend (Vite)" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo   Backend y Frontend iniciados!
echo   Cerrá esta ventana cuando quieras.
echo ========================================
