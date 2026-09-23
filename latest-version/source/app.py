#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTML2Elementor — local desktop server for the converter UI."""

from __future__ import annotations

import json
import os
import re
import sys
import threading
import secrets
import subprocess
import urllib.request
import urllib.error
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
VERSIONS = os.environ.get("H2E_VERSIONS", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "versions")))
ARCHIVE = os.path.abspath(os.path.join(VERSIONS, "HTML2Elementor-All-Versions-through-v1.7.0.zip"))
HOST = os.environ.get("H2E_HOST", "0.0.0.0")
PORT = int(os.environ.get("H2E_PORT", "7788"))
VERSION_RE = re.compile(r"HTML2Elementor-Windows-v(\d+(?:\.\d+)*)\.zip$", re.I)


def _ver_tuple(name: str) -> tuple:
    m = VERSION_RE.search(name)
    if not m:
        return (0,)
    return tuple(int(x) for x in m.group(1).split("."))


def zip_paths() -> list[str]:
    found = {}
    for folder in (DIST, VERSIONS):
        if os.path.isdir(folder):
            for name in os.listdir(folder):
                if name.lower().endswith(".zip") and os.path.isfile(os.path.join(folder, name)):
                    found[name] = os.path.join(folder, name)
    return list(found.values())


def latest_windows_zip() -> str | None:
    found = [p for p in zip_paths() if VERSION_RE.search(os.path.basename(p))]
    return max(found, key=lambda p: _ver_tuple(os.path.basename(p))) if found else None


def download_path(path: str) -> str | None:
    want = path.removeprefix("/download/")
    if want == "versions.zip":
        return ARCHIVE if os.path.isfile(ARCHIVE) else None
    if want in ("windows.zip", "HTML2Elementor-Windows.zip", ""):
        return latest_windows_zip()
    name = os.path.basename(want)
    return next((p for p in zip_paths() if os.path.basename(p) == name), None)


def release_info() -> dict:
    path = latest_windows_zip()
    if not path:
        return {"app": "html2elementor", "download": False}
    name = os.path.basename(path)
    m = VERSION_RE.search(name)
    return {
        "app": "html2elementor",
        "download": True,
        "version": m.group(1) if m else "",
        "file": name,
        "url": "/download/windows.zip",
        "bytes": os.path.getsize(path),
        "archive_url": "/download/versions.zip" if os.path.isfile(ARCHIVE) else "/versions.html",
    }


AI_TOKEN = secrets.token_urlsafe(32)
AI_LOCK = threading.Lock()
AI_PROC = None
AI_PORT = None

def ai_port():
    global AI_PORT, AI_PROC
    with AI_LOCK:
        if AI_PORT is None:
            script = os.path.join(os.path.dirname(__file__), 'ai', 'service.py')
            AI_PROC = subprocess.Popen([sys.executable, script, '--token', AI_TOKEN, '--parent', str(os.getpid())], stdout=subprocess.PIPE, text=True)
            AI_PORT = int(AI_PROC.stdout.readline().strip())
    return AI_PORT

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("[html2elementor] " + (fmt % args) + "\n")
        sys.stdout.flush()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.startswith('/api/ai/'):
            origin=self.headers.get('Origin','')
            if self.headers.get('X-H2E-Client')!='1' or (origin and urlparse(origin).netloc!=self.headers.get('Host')):
                self.send_error(403);return
            self.ai_proxy(True)
        else:self.send_error(405)

    def ai_proxy(self, post=False):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length>12000000:raise ValueError('Request too large')
            data=self.rfile.read(length) if post else None
            req=urllib.request.Request(f'http://127.0.0.1:{ai_port()}'+self.path, data=data, headers={'X-H2E-Token':AI_TOKEN,'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(req,timeout=190) as r:raw=r.read();status=r.status
            except urllib.error.HTTPError as e:raw=e.read();status=e.code
        except Exception as e:raw=json.dumps({'error':str(e)}).encode();status=503
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.startswith('/api/ai/'):
            self.ai_proxy();return
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/release":
            body = json.dumps(release_info(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/releases":
            body = json.dumps([{"file": os.path.basename(p), "bytes": os.path.getsize(p), "url": "/download/history/" + os.path.basename(p)} for p in sorted(zip_paths())]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path.startswith("/download/"):
            self.serve_download(path)
            return

        super().do_GET()

    def serve_download(self, path: str, head_only: bool = False) -> None:
        src = download_path(path)
        if not src:
            self.send_error(404, "zip not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Length", str(os.path.getsize(src)))
        self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(src)}"')
        self.end_headers()
        if not head_only:
            with open(src, "rb") as f:
                while chunk := f.read(256 * 1024):
                    self.wfile.write(chunk)

    def do_HEAD(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path.startswith("/download/"):
            self.serve_download(path, head_only=True)
        else:
            super().do_HEAD()


def main() -> None:
    if not os.path.isdir(ROOT):
        sys.stderr.write("web/ folder is missing.\n")
        sys.exit(1)

    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    info = release_info()
    print("=" * 56)
    print("  HTML2Elementor")
    print(f"  Open: {url}")
    if info.get("file"):
        print(f"  Windows ZIP: {url}download/windows.zip")
        print(f"  File: {info['file']}")
    print("  Drop HTML + CSS files, then download JSON + CSS.")
    print("  Press Ctrl+C to stop.")
    print("=" * 56)

    def _open() -> None:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    if os.environ.get("H2E_NO_BROWSER") != "1":
        threading.Timer(0.6, _open).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
