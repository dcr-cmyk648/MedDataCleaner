@echo off
setlocal
cd /d "%~dp0"
title Med Data Cleaner

echo.
echo ========================================
echo  Med Data Cleaner
echo ========================================
echo.

if not exist ".venv\Scripts\med-data-cleaner.exe" (
    echo The app has not been set up yet.
    echo Double-click INSTALL_WINDOWS.bat first.
    echo.
    pause
    exit /b 1
)

echo Opening the app in your browser...
echo Keep this window open while you use Med Data Cleaner.
echo To stop the app, return here and press Control+C.
echo.

".venv\Scripts\med-data-cleaner.exe"
set "APP_STATUS=%ERRORLEVEL%"

echo.
echo Med Data Cleaner has stopped.
if not "%APP_STATUS%"=="0" echo If you ask for help, do not include patient text.
echo.
pause
exit /b %APP_STATUS%
