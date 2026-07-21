from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_mac_installer_exposes_private_pip_before_spacy_download():
    installer = (ROOT / "INSTALL_MAC.command").read_text(encoding="utf-8")
    virtual_env = 'export VIRTUAL_ENV="$PROJECT_DIR/.venv"'
    path_update = 'export PATH="$VIRTUAL_ENV/bin:$PATH"'
    model_download = '".venv/bin/python" -m spacy download en_core_web_lg'

    assert virtual_env in installer
    assert path_update in installer
    assert installer.index(virtual_env) < installer.index(model_download)
    assert installer.index(path_update) < installer.index(model_download)


def test_windows_installer_exposes_private_pip_before_spacy_download():
    installer = (ROOT / "INSTALL_WINDOWS.bat").read_text(encoding="utf-8")
    virtual_env = 'set "VIRTUAL_ENV=%CD%\\.venv"'
    path_update = 'set "PATH=%VIRTUAL_ENV%\\Scripts;%PATH%"'
    model_download = '".venv\\Scripts\\python.exe" -m spacy download en_core_web_lg'

    assert virtual_env in installer
    assert path_update in installer
    assert installer.index(virtual_env) < installer.index(model_download)
    assert installer.index(path_update) < installer.index(model_download)
