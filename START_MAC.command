#!/bin/bash

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$PROJECT_DIR/.venv/bin/med-data-cleaner"

echo
echo "========================================"
echo " Med Data Cleaner"
echo "========================================"
echo

if [[ ! -x "$APP" ]]; then
    echo "The app has not been set up yet."
    echo "Double-click INSTALL_MAC.command first."
    echo
    read -r -p "Press Return to close this window..."
    exit 1
fi

echo "Opening the app in your browser..."
echo "Keep this window open while you use Med Data Cleaner."
echo "To stop the app, return here and press Control+C."
echo

"$APP"
status=$?

echo
if [[ "$status" -eq 0 || "$status" -eq 130 ]]; then
    echo "Med Data Cleaner has stopped."
else
    echo "Med Data Cleaner stopped with an error."
    echo "If you ask for help, do not include patient text."
fi
echo
read -r -p "Press Return to close this window..."
exit "$status"
