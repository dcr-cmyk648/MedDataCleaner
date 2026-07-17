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

## Development setup

Python 3.12 is the recommended development runtime.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
python -m spacy download en_core_web_lg
```

The spaCy model is downloaded during setup only. At runtime, the app will never download a model.
If the configured model is unavailable, analysis remains available in degraded mode but export is
blocked. Set `MDC_SPACY_MODEL` to use a different already-installed local model.

Run the app:

```bash
med-data-cleaner
```

Run verification:

```bash
pytest
ruff check .
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
