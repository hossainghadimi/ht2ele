#!/usr/bin/env python3
"""v1.8.0 E2E for the local AI service using a mock llama.cpp engine.

Covers: model scan / upload / register, hybrid start with auto -ngl (from GGUF
block_count + VRAM), engine args verification, chat (single/multi-turn,
max_tokens, content parts, invalid input rejection), and the full
vision/analyze path with scene validation. Run:
    python tests/test_v180_service.py [report.json]
"""
import base64
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable
RESULTS = {}


def step(name, ok, detail=""):
    RESULTS[name] = {"pass": bool(ok), "detail": detail}
    print(("PASS " if ok else "FAIL ") + name + ((" — " + str(detail)[:200]) if detail else ""))
    return ok


def fake_gguf(blocks=36, pad=64):
    key = b"mock.block_count"
    return (b"GGUF" + struct.pack("<I", 3) + struct.pack("<Q", 0) + struct.pack("<Q", 1)
            + struct.pack("<Q", len(key)) + key + struct.pack("<I", 4) + struct.pack("<I", blocks)
            + b"\x00" * pad)


def png_data_url(w=40, h=40):
    try:
        from PIL import Image
        im = Image.new("RGB", (w, h), (30, 160, 90))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # 1x1 PNG fallback scaled up by test (min 32px required -> 40x40 grey)
        b64 = ("iVBORw0KGgoAAAANSUhEUgAAACoAAAAqCAMAAAASGx4vAAAACVBMVEUAAAAAAAD///8AAAA"
               "AAAAAAAAAAAAAgIAAAGm9YdEAAAApSURBVHja7dMxDQAgDAVRO0cX9i1uZgP+P+2R6oW"
               "Z0U0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+Hc0bBw0u2wAAAABJRU5ErkJggg==")
        return "data:image/png;base64," + b64


def main():
    report_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests" / "report-v1.8.0.json"
    tmp = Path(tempfile.mkdtemp(prefix="h2e18-"))
    token = "test-token-123"
    service = None
    port = None
    try:
        # --- mock engine tree (cpu + cuda) ---
        for folder in ("engine", "engine-cuda"):
            d = tmp / folder
            d.mkdir()
            exe = d / ("llama-server.exe" if os.name == "nt" else "llama-server")
            exe.write_text('#!/bin/sh\nexec %s %s "$@"\n' % (PY, (ROOT / "tests" / "mock_llama_server.py").as_posix()), encoding="utf-8")
            os.chmod(exe, 0o755)
        models_dir = tmp / "data" / "models"
        models_dir.mkdir(parents=True)
        (models_dir / "MockModel-4B-Q4_K_M.gguf").write_bytes(fake_gguf(36, pad=1000))
        (models_dir / "mmproj-MockModel-4B-Q8_0.gguf").write_bytes(fake_gguf(4, pad=500))

        env = dict(os.environ)
        env["H2E_DATA"] = str(tmp / "data")
        env["H2E_ENGINE_ROOT"] = str(tmp)
        env["H2E_MOCK_ARGS_DIR"] = str(tmp / "mockargs")
        service = subprocess.Popen([PY, str(ROOT / "ai" / "service.py"), "--token", token, "--parent", "0"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, cwd=str(ROOT / "ai"))
        port = int(service.stdout.readline().strip())
        base = "http://127.0.0.1:%d/api/ai/" % port

        def call(path, data=None, token=token):
            req = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(),
                                         headers={"X-H2E-Token": token, "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return r.status, json.loads(r.read().decode())
            except urllib.error.HTTPError as e:
                try:
                    return e.code, json.loads(e.read().decode())
                except Exception:
                    return e.code, {}

        st, r = call("status")
        step("status", st == 200 and r.get("ok") is True and r.get("engine") == "stopped" and r.get("cuda_engine") is True,
             {k: r.get(k) for k in ("engine", "cuda_engine", "python")})

        st, r = call("models/scan")
        names = [m["name"] for m in r.get("models", [])]
        model_row = next((m for m in r.get("models", []) if m["name"] == "MockModel-4B-Q4_K_M.gguf"), None)
        step("models/scan", st == 200 and "MockModel-4B-Q4_K_M.gguf" in names and model_row and model_row["blocks"] == 36,
             {"found": names, "blocks": model_row and model_row["blocks"]})

        up_b64 = base64.b64encode(fake_gguf(12, pad=300)).decode()
        st, r = call("models/upload", {"name": "Uploaded.gguf", "b64": up_b64})
        step("models/upload", st == 200 and Path(r.get("path", "")).is_file(), r)
        st_bad, r_bad = call("models/upload", {"name": "bad.gguf", "b64": base64.b64encode(b"NOTGGUF0" * 8).decode()})
        step("models/upload rejects bad magic", st_bad == 400, r_bad)

        st, r = call("models/register", {"path": str(models_dir / "MockModel-4B-Q4_K_M.gguf"),
                                         "projector": str(models_dir / "mmproj-MockModel-4B-Q8_0.gguf")})
        model_id = r.get("id")
        step("models/register (model+mmproj)", st == 200 and bool(model_id), r)

        st, r = call("models/start", {"id": model_id, "mode": "hybrid", "vram_gb": 8})
        auto_ngl = r.get("ngl")
        # fake model: 36 blocks, ~1KB total -> per-layer tiny -> all 36 layers fit
        step("models/start hybrid auto-ngl", st == 200 and r.get("blocks") == 36 and auto_ngl == 36, r)
        deadline = time.time() + 20
        engine_state = None
        while time.time() < deadline:
            _, s = call("status")
            engine_state = s.get("engine")
            if engine_state == "ready":
                break
            if engine_state == "stopped":
                break
            time.sleep(0.5)
        active = s.get("active_model", {})
        step("engine ready (hybrid)", engine_state == "ready" and active.get("mode") == "hybrid" and active.get("ngl") == 36,
             {"engine": engine_state, "active": active})

        args_files = sorted((tmp / "mockargs").glob("args-*.json"))
        args = json.loads(args_files[-1].read_text()) if args_files else {}
        step("engine args (mock recorded)", args.get("ngl") == "36" and "mmproj" in args and args.get("port"), args)

        st, r = call("chat", {"prompt": "سلام"})
        step("chat plain prompt", st == 200 and str(r.get("text", "")).startswith("OK-TEST"), r)

        doc = "<!doctype html><html dir='rtl'><body><main class='vl-page'><h2>تیتر</h2><p>متن</p></main></body></html>"
        st, r = call("chat", {"messages": [{"role": "user", "content": "Document to edit\n<<<HTML\n%s\nHTML>>>\n\nدرخواست کاربر: آبی کن" % doc}], "max_tokens": 4096})
        text = str(r.get("text", ""))
        step("chat html-edit request", st == 200 and "```html" in text and "MOCK-EDITED" in text, text[:120])

        st, r = call("chat", {"messages": [{"role": "user", "content": "مرحله ۱"}, {"role": "assistant", "content": "پاسخ ۱"}, {"role": "user", "content": "مرحله ۲"}], "max_tokens": 512})
        step("chat multi-turn", st == 200 and "OK-TEST" in str(r.get("text", "")), r)

        st_bad, r_bad = call("chat", {"messages": [{"role": "tool", "content": "x"}]})
        step("chat rejects bad role", st_bad == 400, r_bad)

        st_bad, r_bad = call("models/start", {"id": model_id, "mode": "warp"})
        step("models/start rejects bad mode", st_bad == 400, r_bad)

        st, r = call("vision/analyze", {"image": png_data_url(), "limit": 30})
        job_id = r.get("id")
        deadline = time.time() + 30
        job = {}
        while time.time() < deadline:
            _, job = call("vision/jobs/" + str(job_id))
            if job.get("state") in ("ready", "error", "canceled"):
                break
            time.sleep(0.4)
        scene_ok = job.get("state") == "ready" and job.get("result", {}).get("children")
        step("vision/analyze E2E (mock VL)", st == 200 and bool(job_id) and bool(scene_ok),
             {"state": job.get("state"), "error": job.get("error"), "node_count": len(job.get("result", {}).get("children", []))})

        st, r = call("models/stop", {})
        step("models/stop", st == 200 and r.get("state") == "stopped", r)
    finally:
        if service and service.poll() is None:
            service.terminate()
            try:
                service.wait(timeout=5)
            except Exception:
                service.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    passed = sum(1 for r in RESULTS.values() if r["pass"])
    report = {
        "status": "PASS" if passed == len(RESULTS) else "FAIL",
        "version": "1.8.0",
        "test_kind": "AI service E2E with mock llama.cpp engine (hybrid ngl, scan/upload/register, chat single/multi/html-edit, vision analyze path)",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "engine": "mock_llama_server.py (NOT the real engine; real Qwen/Windows/RTX untested here)",
        "passed": passed,
        "total": len(RESULTS),
        "checks": RESULTS,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n%d/%d passed -> %s" % (passed, len(RESULTS), report_path))
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
