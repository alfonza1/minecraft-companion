@echo off
powershell.exe -NoProfile -File "%~dp0scripts\Start.ps1"
if errorlevel 1 pause
