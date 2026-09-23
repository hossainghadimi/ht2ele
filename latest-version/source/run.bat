@echo off
chcp 65001 >nul
cd /d "%~dp0"
title HTML to Elementor
echo.
echo  HTML2Elementor  -  converting HTML pages to Elementor JSON
echo  Browser will open automatically. Keep this window open.
echo.

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" http://127.0.0.1:7788/
  py -3 app.py
  goto :end
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" http://127.0.0.1:7788/
  python app.py
  goto :end
)

echo Python was not found.
echo Install Python 3 from https://www.python.org/downloads/
echo During setup, enable "Add python.exe to PATH".
pause
:end
pause
