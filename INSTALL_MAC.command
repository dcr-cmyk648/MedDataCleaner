#!/bin/bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

pause_after_error() {
    status=$?
    echo
    echo "Setup did not finish."
    echo "Please read the error above. If you ask for help, do not include patient text."
    echo
    read -r -p "Press Return to close this window..."
    exit "$status"
}
trap pause_after_error ERR

echo
echo "========================================"
echo " Med Data Cleaner - first-time setup"
echo "========================================"
echo
echo "This installs the app only inside this folder."
echo "It may take 5-15 minutes and download about 500 MB."
echo "Please keep this window open."
echo

PYTHON=""
for candidate in python3.12 python3.13 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1 &&
        "$candidate" -c 'import sys; raise SystemExit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)' >/dev/null 2>&1; then
        PYTHON="$candidate"
        break
    fi
done

if [[ -z "$PYTHON" ]]; then
    echo "Python 3.11, 3.12, or 3.13 was not found."
    echo
    echo "Install Python 3.12 from:"
    echo "https://www.python.org/downloads/release/python-31210/"
    echo
    echo "After installing Python, run this setup file again."
    read -r -p "Press Return to close this window..."
    exit 1
fi

echo "1 of 4: Checking Python..."
"$PYTHON" --version

if [[ ! -x ".venv/bin/python" ]]; then
    echo
    echo "2 of 4: Creating a private app environment..."
    "$PYTHON" -m venv .venv
else
    echo
    echo "2 of 4: Using the existing app environment..."
fi

echo
echo "3 of 4: Installing Med Data Cleaner..."
".venv/bin/python" -m pip install --upgrade pip
".venv/bin/python" -m pip install .

echo
echo "4 of 4: Downloading the local language model..."
".venv/bin/python" -m spacy download en_core_web_lg

trap - ERR
echo
echo "Setup is complete."
echo "The app processes text locally and will now open in your browser."
echo
read -r -p "Press Return to start Med Data Cleaner..."
/bin/bash "$PROJECT_DIR/START_MAC.command"
