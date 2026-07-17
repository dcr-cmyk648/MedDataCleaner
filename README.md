# Med Data Cleaner

Med Data Cleaner is a local-first review tool for removing likely protected health
information (PHI) from pasted English clinical text. It combines deterministic rules with
Microsoft Presidio and a locally installed spaCy model. It does not send clinical text to an
AI service or any other remote endpoint.

> [!IMPORTANT]
> This project assists with de-identification; it does not certify that text is de-identified
> under HIPAA. Automated detectors can miss identifying information. Every export requires a
> human review, and real-world use requires validation against representative, authorized data
> and the organization's compliance process.

## Current MVP scope

- Pasted plain text in US English
- In-memory processing; original text is not saved by the application
- Layered deterministic and local named-entity detection
- Typed placeholders such as `[PERSON_1]`, `[DATE_1]`, and `[MEDICAL_RECORD_NUMBER_1]`
- Reviewable findings without returning matched PHI from the server
- Residual scan and fail-closed export gate
- Loopback-only web server with no CDN assets, telemetry, or cloud calls

PDFs, office documents, images, DICOM, audio, databases, and automatic AI upload are explicitly
out of scope for the first release.

## Install and run

The current MVP is installed from source. Standalone `.dmg` and Windows installer builds are not
available yet.

You need:

- [Git](https://git-scm.com/downloads)
- [Python 3.12](https://www.python.org/downloads/) (recommended; Python 3.11–3.13 is supported)
- An internet connection during installation only, to download Python packages and the local model
- Roughly 1 GB of free disk space for the environment and English NLP model

### macOS

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

### Windows PowerShell

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

If PowerShell blocks activation scripts, use Command Prompt and run
`.venv\Scripts\activate.bat`, then continue with the four `python`/`med-data-cleaner` commands
above.

The app opens in the default browser at a random `127.0.0.1` port. Keep the terminal window open
while using it and press `Ctrl+C` there to stop it. No internet connection is required at runtime.

The spaCy model is downloaded during installation only. If the model is missing, analysis remains
available in degraded mode but export is blocked. See the
[detailed installation and troubleshooting guide](docs/INSTALLATION.md) for recovery steps,
updates, and running the app again later.

## Development setup

After completing the platform setup above, install the project in editable mode with development
tools:

```bash
python -m pip install -e '.[dev]'
```

Run verification before submitting changes:

```bash
pytest
ruff check .
ruff format --check .
```

## Security defaults

- The server binds to `127.0.0.1` on an ephemeral port.
- A random per-launch token protects every API request.
- Responses use `Cache-Control: no-store` and a restrictive Content Security Policy.
- Uvicorn access logs are disabled.
- Validation errors never echo request bodies.
- Browser storage and service workers are not used.
- Export filenames are fixed and cannot contain patient data.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) and
[docs/VALIDATION.md](docs/VALIDATION.md) before using the project with sensitive data.
