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

## Easy installation

No coding experience or Git is required. The current preview is not a normal signed Mac or Windows
app yet, but the included setup files handle the technical commands for you.

> [!WARNING]
> Use made-up or properly authorized test data while evaluating this preview. Installing the app
> does not make it HIPAA-certified, and a person must review every result before export.

### Before you begin

You need:

- A Mac or Windows PC
- About 1 GB of free space
- Internet access for the first setup
- [Python 3.12.10](https://www.python.org/downloads/release/python-31210/)

On the Python page, scroll to **Files** and choose:

- **macOS 64-bit universal2 installer** on a Mac
- **Windows installer (64-bit)** on most Windows PCs

Run the Python installer normally. On Windows, select **Add python.exe to PATH** if that option is
shown.

### Step 1: Download Med Data Cleaner

1. Select this link: **[Download Med Data Cleaner as a ZIP file](https://github.com/dcr-cmyk648/MedDataCleaner/archive/refs/heads/main.zip)**.
2. Open your Downloads folder and double-click the ZIP file to unpack it.
3. Open the new `MedDataCleaner-main` folder.

### Step 2: Set it up once

**On a Mac**

1. Control-click `INSTALL_MAC.command` and select **Open**.
2. If macOS asks for confirmation, select **Open** again.
3. A Terminal window will install the app. Keep it open; setup commonly takes 5–15 minutes.
4. When prompted, press Return. The app will open in your browser.

**On Windows**

1. Double-click `INSTALL_WINDOWS.bat`.
2. If Windows shows a protection message, continue only if you downloaded the file from this
   GitHub repository. Select **More info**, then **Run anyway**.
3. A black setup window will install the app. Keep it open; setup commonly takes 5–15 minutes.
4. When prompted, press any key. The app will open in your browser.

### Step 3: Open it next time

- On a Mac, double-click `START_MAC.command`.
- On Windows, double-click `START_WINDOWS.bat`.

Keep the Terminal or black command window open while using the app. Closing that window stops the
local app. Internet access is not needed after setup.

For screenshots-in-words, common error messages, updates, and optional command-line instructions,
see the **[beginner installation and troubleshooting guide](docs/INSTALLATION.md)**.

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
