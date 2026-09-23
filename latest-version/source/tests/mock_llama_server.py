#!/usr/bin/env python3
"""Mock llama-server for offline E2E tests of the AI service (tests only, not shipped as the engine).

Parses the same CLI surface the app uses (--host/--port/--api-key/-m/--mmproj/-ngl/-c),
records the arguments to $H2E_MOCK_ARGS_DIR for assertions, and serves:
  GET  /health                 -> 200
  POST /v1/chat/completions    -> canned responses (vision layout / HTML edit / plain text)
"""
import json
import os
import re
import struct
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = {}


def parse_args(argv):
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('-m', '--host', '--port', '--api-key', '-ngl', '-c', '--mmproj', '-t') and i + 1 < len(argv):
            ARGS[a.lstrip('-')] = argv[i + 1]
            i += 2
        else:
            i += 1


VISION_SCENE = {
    "title": "Mock Design",
    "direction": "rtl",
    "nodes": [
        {"id": "n1", "parent": "", "type": "container", "box": [0, 0, 1000, 1000], "layout": "column", "style": {"background": "#ffffff"}},
        {"id": "n2", "parent": "n1", "type": "heading", "box": [100, 100, 900, 200], "text": "عنوان تست", "style": {"font_size": 32, "color": "#111111"}},
        {"id": "n3", "parent": "n1", "type": "text", "box": [100, 220, 900, 320], "text": "متن تست", "style": {"font_size": 16}},
        {"id": "n4", "parent": "n1", "type": "button", "box": [300, 340, 700, 420], "text": "دکمه تست"},
    ],
}


def user_text(payload):
    out = []
    for m in payload.get("messages", []):
        c = m.get("content")
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("type") == "text":
                    out.append(str(part.get("text", "")))
    return "\n".join(out)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        raw = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self._send(404, {"error": "not found"})
            return
        auth = self.headers.get("Authorization", "")
        if ARGS.get("api-key") and auth != "Bearer " + ARGS["api-key"]:
            self._send(401, {"error": "bad key"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._send(400, {"error": "bad json"})
            return
        text = user_text(payload)
        if "What color is the circle?" in text:
            content = '{"color":"green"}'
        elif "Reconstruct the visible website screenshot" in text:
            content = json.dumps(VISION_SCENE)
        elif "Document to edit" in text:
            content = "```html\n<!doctype html><html dir=\"rtl\"><head><meta charset=\"utf-8\"></head><body><main class=\"vl-page\" style=\"background:#eef\">MOCK-EDITED :: " + re.sub(r"\s+", " ", text)[:400] + "</main></body></html>\n```"
        else:
            content = "OK-TEST :: " + re.sub(r"\s+", " ", text)[:200]
        self._send(200, {"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]})


def main():
    parse_args(sys.argv[1:])
    port = int(ARGS.get("port", "0"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    args_dir = os.environ.get("H2E_MOCK_ARGS_DIR")
    if args_dir:
        import time
        os.makedirs(args_dir, exist_ok=True)
        stamp = time.time_ns()
        with open(os.path.join(args_dir, "args-%d.json" % stamp), "w") as f:
            json.dump(ARGS, f, ensure_ascii=False)
    print("MOCK-ENGINE-READY", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
