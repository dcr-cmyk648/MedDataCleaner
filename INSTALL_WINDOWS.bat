@echo off
setlocal
cd /d "%~dp0"
title Med Data Cleaner - First-Time Setup

echo.
echo ========================================
echo  Med Data Cleaner - first-time setup
echo ========================================
echo.
echo This installs the app only inside this folder.
echo It may take 5-15 minutes and download about 500 MB.
echo Please keep this window open.
echo.

set "PYTHON="
py -3.12 --version >nul 2>nul
if not errorlevel 1 set "PYTHON=py -3.12"
if not defined PYTHON (
    py -3.13 --version >nul 2>nul
    if not errorlevel 1 set "PYTHON=py -3.13"
)
if not defined PYTHON (
    py -3.11 --version >nul 2>nul
    if not errorlevel 1 set "PYTHON=py -3.11"
)
if not defined PYTHON (
    python -c "import sys; raise SystemExit(0 if (3, 11) ^<= sys.version_info[:2] ^<= (3, 13) else 1)" >nul 2>nul
    if not errorlevel 1 set "PYTHON=python"
)

if not defined PYTHON goto python_missing

echo 1 of 4: Checking Python...
%PYTHON% --version
if errorlevel 1 goto failed

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo 2 of 4: Creating a private app environment...
    %PYTHON% -m venv .venv
    if errorlevel 1 goto failed
) else (
    echo.
    echo 2 of 4: Using the existing app environment...
)

echo.
echo 3 of 4: Installing Med Data Cleaner...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install .
if errorlevel 1 goto failed

echo.
echo 4 of 4: Downloading the local language model...
".venv\Scripts\python.exe" -m spacy download en_core_web_lg
if errorlevel 1 goto failed

echo.
echo Setup is complete.
echo The app processes text locally and will now open in your browser.
echo.
pause
call "%~dp0START_WINDOWS.bat"
exit /b 0

:python_missing
echo Python 3.11, 3.12, or 3.13 was not found.
echo.
echo Install Python 3.12 from:
echo https://www.python.org/downloads/release/python-31210/
echo.
echo Check "Add python.exe to PATH" during installation.
echo Then run this setup file again.
echo.
pause
exit /b 1

:failed
echo.
echo Setup did not finish.
echo Please read the error above. If you ask for help, do not include patient text.
echo.
pause
exit /b 1
