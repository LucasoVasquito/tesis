@echo off
title Camaleón - Launcher
echo ========================================
echo   Iniciando servidores de Camaleón...
echo ========================================
echo.

:: Inicia el backend (Express) en una ventana separada
start "Camaleón - Backend (server)" /D "%~dp0" cmd /k "npm run server"

:: Pequeña pausa para que no se pisen
ping -n 3 127.0.0.1 >nul

:: Inicia el frontend (Vite) en otra ventana separada
start "Camaleón - Frontend (Vite)" /D "%~dp0" cmd /k "npm run dev"

echo.
echo   Backend y Frontend iniciados!
echo   Cerrá esta ventana cuando quieras.
echo ========================================
