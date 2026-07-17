# Installation and troubleshooting

Med Data Cleaner currently runs from a local Python environment. These instructions install the
web interface, Presidio, and the large English spaCy model on one computer. Runtime processing is
local and does not require an internet connection.

> [!WARNING]
> This MVP has not been validated for operational use with real PHI. Use synthetic data until the
> category-level validation and organizational review described in [VALIDATION.md](VALIDATION.md)
> are complete.

## Requirements

- A 64-bit Mac or Windows PC
- Git
- Python 3.12 recommended (the project supports Python 3.11–3.13)
- Approximately 1 GB of free disk space
- Internet access for the initial package and model download

Verify the prerequisites:

```text
git --version
python --version
```

On Windows, use `py -3.12 --version` if `python` is not recognized before the environment is
created.

## macOS installation

Open Terminal and run:

```bash
git clone https://github.com/dcr-cmyk648/MedDataCleaner.git
cd MedDataCleaner
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install .
python -m spacy download en_core_web_lg
med-data-cleaner
```

If `python3.12` is not found, install Python 3.12 from
[python.org](https://www.python.org/downloads/) and open a new Terminal window.

## Windows installation

Open PowerShell and run:

```powershell
git clone https://github.com/dcr-cmyk648/MedDataCleaner.git
Set-Location MedDataCleaner
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install .
python -m spacy download en_core_web_lg
med-data-cleaner
```

If PowerShell reports that script execution is disabled, open Command Prompt in the project
directory instead:

```bat
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install .
python -m spacy download en_core_web_lg
med-data-cleaner
```

## Start the app later

From the project directory, activate the environment and start the app.

macOS:

```bash
source .venv/bin/activate
med-data-cleaner
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
med-data-cleaner
```

The terminal prints a URL similar to `http://127.0.0.1:54321/` and opens it in the default browser.
The port changes each time by design. Keep the terminal open and press `Ctrl+C` to stop the app.

## Update an existing installation

Stop the app, open a terminal in the repository, activate the environment, and run:

```bash
git pull --ff-only
python -m pip install .
```

The already-installed model normally does not need to be downloaded again.

## Troubleshooting

### Export blocked: local model unavailable

Activate the environment, then run:

```bash
python -m spacy download en_core_web_lg
```

Restart Med Data Cleaner afterward. The status badge should say **Local engine ready**. The app
intentionally blocks export when the required model cannot load.

### The browser did not open

Copy the complete `http://127.0.0.1:<port>/` address printed in the terminal and paste it into a
browser on the same computer. Do not replace `127.0.0.1` with a network address.

### `med-data-cleaner` is not recognized

Confirm that the environment is activated. You can also start the executable directly:

macOS:

```bash
.venv/bin/med-data-cleaner
```

Windows PowerShell:

```powershell
.\.venv\Scripts\med-data-cleaner.exe
```

### Install without Git

Download the repository ZIP from GitHub, extract it, open a terminal in the extracted folder, and
begin at the `python3.12 -m venv .venv` or `py -3.12 -m venv .venv` step. Git is recommended because
it makes updates simpler.

## What installation does not provide yet

- A signed macOS application or Windows installer
- Automatic updates
- Validation or certification for real PHI
- PDF, image, DICOM, audio, or office-document de-identification

Those remain separate release milestones; see the project README and threat model for the current
security boundary.
