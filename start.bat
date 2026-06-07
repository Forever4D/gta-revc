@echo off
title GTA Vice City - Web Server
cd /d "D:\1TEMP1\Sitezzz\GTAVC_reVC\revcdos-server"
echo ============================================
echo  GTA Vice City - Web Server
echo  Open http://localhost:8000 in your browser
echo ============================================
echo.
python server.py --port 8000 --packed revcdos.bin
pause
