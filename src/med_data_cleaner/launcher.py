from __future__ import annotations

import os
import socket
import threading
import webbrowser

import uvicorn

from med_data_cleaner.web.app import app


def _open_browser(url: str) -> None:
    if os.environ.get("MDC_NO_BROWSER") != "1":
        webbrowser.open(url, new=1, autoraise=True)


def main() -> None:
    host = "127.0.0.1"
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((host, 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    url = f"http://{host}:{port}/"

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=False,
        log_level="warning",
        server_header=False,
    )
    server = uvicorn.Server(config)
    opener = threading.Timer(0.35, _open_browser, args=(url,))
    opener.daemon = True
    opener.start()

    print(f"Med Data Cleaner is running locally at {url}")
    print("Press Ctrl+C to stop it. No clinical text is logged.")
    try:
        server.run(sockets=[listener])
    except KeyboardInterrupt:
        pass
    finally:
        listener.close()


if __name__ == "__main__":
    main()
