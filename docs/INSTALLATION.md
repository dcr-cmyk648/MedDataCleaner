# Beginner installation and troubleshooting

This guide is written for people who do not normally use a command line. You will install Python,
download Med Data Cleaner, and then use one setup file that does the remaining technical work.
You do not need a GitHub account and you do not need to know how to code.

> [!WARNING]
> This is an early preview, not a HIPAA certification or guarantee. Use made-up or properly
> authorized test data until your organization has completed the validation and review described
> in [VALIDATION.md](VALIDATION.md). A person must review every result before export.

## Before you start

Have these ready:

- A 64-bit Mac or Windows PC
- About 1 GB of free disk space
- An internet connection for the one-time setup
- 5–15 minutes for the setup to finish

The setup opens a Terminal window on Mac or a black command window on Windows. That is expected.
Do not close it while setup is running.

If this is a work-managed computer, your organization may require IT approval before installing
Python or running a downloaded script. Follow your organization's policy; do not disable antivirus
or other security tools.

## Part 1: Install Python

Python is the local program Med Data Cleaner uses to run. It is free and open source.

Open the official **[Python 3.12.10 download page](https://www.python.org/downloads/release/python-31210/)**,
scroll down to **Files**, and follow the instructions for your computer.

### On a Mac

1. Select **macOS 64-bit universal2 installer**.
2. Open the downloaded file, whose name ends in `.pkg`.
3. Select **Continue** through the installer, then select **Install**.
4. Enter your Mac password if macOS asks for it.
5. Select **Close** when the installation finishes.

### On Windows

1. Select **Windows installer (64-bit)**.
2. Open the downloaded file, whose name ends in `.exe`.
3. At the bottom of the first installer screen, select **Add python.exe to PATH** if it appears.
4. Select **Install Now**.
5. Select **Close** when the installation finishes.

Already have Python 3.11, 3.12, or 3.13? You can skip this part. The setup file will find it.

## Part 2: Download Med Data Cleaner

1. Select **[Download Med Data Cleaner](https://github.com/dcr-cmyk648/MedDataCleaner/archive/refs/heads/main.zip)**.
2. Find `MedDataCleaner-main.zip` in your Downloads folder.
3. Unpack the ZIP file:
   - On a Mac, double-click it.
   - On Windows, right-click it, select **Extract All**, then select **Extract**.
4. Move the unpacked `MedDataCleaner-main` folder somewhere private that you will not delete,
   such as a folder named `Local Apps` in your home folder.

Keep the whole folder together. Do not place it in a shared or cloud-synced folder. Moving the
folder after setup can prevent the app from starting; if that happens, run setup again.

## Part 3: Run the one-time setup

### On a Mac

1. Open the `MedDataCleaner-main` folder.
2. Control-click `INSTALL_MAC.command` and select **Open**.
3. If macOS says it cannot verify the developer, confirm that the file came from this repository,
   then select **Open**.
4. A Terminal window will show four numbered setup stages. Keep the window open.
5. When you see **Setup is complete**, press Return.
6. Med Data Cleaner will open in your normal web browser.

The Control-click step is normally needed only the first time.

### On Windows

1. Open the `MedDataCleaner-main` folder.
2. Double-click `INSTALL_WINDOWS.bat`.
3. If Microsoft Defender SmartScreen appears, continue only if the file came from this repository.
   Select **More info**, then **Run anyway**.
4. A black window will show four numbered setup stages. Keep the window open.
5. When you see **Setup is complete**, press any key.
6. Med Data Cleaner will open in your normal web browser.

Setup downloads the app's open-source packages and a large English language model. It does not
upload or process any medical text during installation.

## Open the app next time

You do not need to run the installer again.

- On a Mac, open the app folder and double-click `START_MAC.command`.
- On Windows, open the app folder and double-click `START_WINDOWS.bat`.

A browser page and a small Terminal or command window will open. Keep that window open while using
the app. To stop Med Data Cleaner, return to the window and press Control+C, or close the window.

The browser address begins with `http://127.0.0.1:`. This means the app is available only on your
computer. The number at the end changes each time by design. No internet connection is required
after setup.

## Update to a newer version

There is no automatic updater or update notification yet. When you are told that a new version is
available, install it in a new folder so the old working copy remains available until you confirm
the update.

1. Stop Med Data Cleaner.
2. Select **[Download the newest Med Data Cleaner ZIP](https://github.com/dcr-cmyk648/MedDataCleaner/archive/refs/heads/main.zip)**.
3. Unpack the ZIP. Your computer may add a number to the folder name, such as
   `MedDataCleaner-main 2`; that is okay.
4. Move the new folder to a private location that is not shared or cloud-synced.
5. Do not copy the old `.venv` folder into the new folder, and do not combine the two app folders.
6. Run `INSTALL_MAC.command` or `INSTALL_WINDOWS.bat` in the new folder. A full setup may again
   take 5–15 minutes.
7. Open the new copy and try it with made-up text.
8. After the new copy works, delete the old app folder if you no longer need it.

Med Data Cleaner does not save the original pasted note in its app folder. Files you intentionally
exported remain wherever your browser saved them. Check that location before deleting anything.

If setup previously stopped with the message that spaCy requires pip or uv, you can instead place
the updated setup file in that same app folder and rerun it. The setup safely reuses the existing
private environment and retries the missing language-model step.

## Troubleshooting

### The setup says Python was not found

Install Python 3.12 using Part 1, restart the computer, and run the Med Data Cleaner setup again.
On Windows, make sure **Add python.exe to PATH** is selected in the Python installer.

### spaCy says it requires pip or uv

You do not need to install uv. This message came from an earlier setup file that did not expose
the app's private copy of pip while downloading the language model. Download a fresh copy of Med
Data Cleaner, unpack it into a new folder, and run the updated setup file. It is also safe to
rerun the updated setup inside an existing app folder.

### The setup looks stuck

The language model is large and can take several minutes to download. If text is still appearing
occasionally, leave the window open. Check the internet connection if no progress appears for more
than ten minutes.

### Setup did not finish

Read the last few lines above the failure message; they usually name the problem. It is safe to run
the setup file again after correcting the issue. If you share an error message for support, remove
usernames or private folder names and never include patient text.

### The start file says the app has not been set up

Run `INSTALL_MAC.command` or `INSTALL_WINDOWS.bat` from that same app folder. Each downloaded copy
has its own private installation.

### Export says the local model is unavailable

Close the app, confirm the computer is online, and run the setup file again. The setup will retry
the language-model download. Export stays blocked until the model loads successfully.

### The browser did not open

Look in the Terminal or command window for an address similar to
`http://127.0.0.1:54321/`. Copy the complete address and paste it into a browser on the same
computer. Do not change `127.0.0.1` to another address.

### macOS opens the `.command` file as text

Control-click the file, select **Open With**, and choose **Terminal**. If Terminal is not listed,
open Terminal, type `chmod +x ` with a space at the end, drag both Mac `.command` files into the
Terminal window one at a time, press Return, and try again.

### Windows or antivirus blocks the setup

Confirm the ZIP came from this public repository. Do not turn off antivirus protection. On a
work-managed computer, ask IT to review or allow the setup file.

## Optional command-line installation

<details>
<summary>Show technical instructions for developers</summary>

These commands require Git and Python 3.12.

### macOS

```bash
git clone https://github.com/dcr-cmyk648/MedDataCleaner.git
cd MedDataCleaner
python3.12 -m venv .venv
export VIRTUAL_ENV="$PWD/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install .
.venv/bin/python -m spacy download en_core_web_lg
.venv/bin/med-data-cleaner
```

### Windows Command Prompt

```bat
git clone https://github.com/dcr-cmyk648/MedDataCleaner.git
cd MedDataCleaner
py -3.12 -m venv .venv
set "VIRTUAL_ENV=%CD%\.venv"
set "PATH=%VIRTUAL_ENV%\Scripts;%PATH%"
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install .
.venv\Scripts\python.exe -m spacy download en_core_web_lg
.venv\Scripts\med-data-cleaner.exe
```

To update a Git checkout, stop the app and run:

```bash
git pull --ff-only
```

Then repeat the local `pip install .` command for your platform. The language model normally does
not need to be downloaded again.

</details>

## Current limitations

Installation does not provide:

- A signed macOS application or Windows installer
- Automatic updates
- Validation or certification for real PHI
- PDF, image, DICOM, audio, or office-document de-identification

See [THREAT_MODEL.md](THREAT_MODEL.md) for the security boundary and [VALIDATION.md](VALIDATION.md)
for the validation work required before operational use.
