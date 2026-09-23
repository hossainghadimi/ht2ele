#!/usr/bin/env python3
"""Assemble the v1.8.0 Windows distribution ZIP from this drop.

Layout mirrors the v1.7.0 drop:
  HTML2Elementor-Windows-v1.8.0/{HTML2Elementor.exe, Start.bat, docs, reports,
  runtime/, engine/, ai/, source/}
The EXE must be the one built by .github/workflows/build-windows.yml
(web UI is go:embed inside the binary).
"""
import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # latest-version/
SRC = ROOT / 'source'
VERSION = '1.8.0'
NAME = f'HTML2Elementor-Windows-v{VERSION}'
OUT = ROOT / 'versions' / (NAME + '.zip')

HOW_TO_RUN = f"""HTML2Elementor {VERSION}
Windows 10/11, x64

Extract the COMPLETE ZIP, including runtime, ai and engine folders, then double-click HTML2Elementor.exe. Python, Pillow, micrograd and the CPU GGUF engine are bundled; no installation or internet is required for the base app. GGUF model weights and the optional CUDA engine (engine-cuda, needed for hybrid/CUDA modes) are NOT bundled.

Two-stage workflow:
  Stage 1: image to HTML (Qwen-VL) + AI chat box to edit the reconstructed HTML without touching code, then click final approval.
  Stage 2: HTML to Elementor + its own AI chat box for final edits, then export Elementor JSON + companion CSS.

Keep the console window open. Closing it stops the application.
If an earlier release is open, close it first.
The application opens http://127.0.0.1:7788/ in your browser.
If Windows warns about an unsigned executable, verify the package source and hash before choosing to run it.

Export both Elementor JSON and its companion CSS. Test the imported template on a staging WordPress site.
See RELEASE-v{VERSION}.md for supported widgets and limitations.
Editable source code is included in source/.
"""

RAHNAAM = f"""نسخه {VERSION} — ویندوز ۱۰ و ۱۱، ۶۴بیتی

ابتدا ZIP را کامل استخراج کنید (پوشه‌های runtime، ai و engine باید کنار EXE بمانند). اگر نسخهٔ قبلی باز است، پنجرهٔ آن را ببندید.
روی HTML2Elementor.exe دوبار کلیک کنید؛ پایتون و کتابخانه‌ها و موتور CPU داخل بسته‌اند و نصب جداگانه لازم نیست. وزن مدل و موتور CUDA (برای حالت GPU+CPU همزمان) داخل بسته نیستند.
مرورگر باز می‌شود. پنجرهٔ کنسول باید باز بماند.
در صورت هشدار ویندوز دربارهٔ امضای دیجیتال، ابتدا منبع فایل و هش بسته را بررسی کنید.

روند دو مرحله‌ای:
مرحلهٔ ۱ — تصویر به HTML: تحلیل تصویر با Qwen-VL، سپس ویرایش HTML بازسازی‌شده با چت‌باکس هوش مصنوعی (بدون لمس کد؛ پیش‌نمایش پیش از اعمال) و در پایان «تأیید نهایی».
مرحلهٔ ۲ — HTML به المنتور: اصلاحات نهایی با چت‌باکس همین مرحله، سپس تبدیل به JSON + CSS المنتور.

مدل‌های پیشنهادی برای کارت ۸ گیگابایتی: بینایی: Qwen3-VL-8B Q4_K_M + mmproj Q8_0 (حالت hybrid) · چت‌باکس‌ها: Qwen2.5-Coder-7B Q4_K_M (روی CPU).
در کارگاه AI می‌توانید اسکن دیسک یا ایمپورت فایل بزنید.

قالب JSON و CSS همراه آن هر دو باید در سایت استفاده شوند.
فایل RELEASE-v{VERSION}.md دامنهٔ شناسایی ویجت‌ها و محدودیت‌ها را توضیح می‌دهد.
سورس قابل‌ویرایش داخل source قرار دارد.
"""


def main():
    exe = SRC / 'dist' / 'HTML2Elementor.exe'
    if not exe.is_file():
        raise SystemExit('Missing EXE: build it via .github/workflows/build-windows.yml first (latest-version/source/dist/HTML2Elementor.exe).')
    for req in [
        ROOT / 'runtime' / 'python.exe',
        ROOT / 'runtime' / 'Lib' / 'PIL' / '__init__.py',
        ROOT / 'runtime' / 'Lib' / 'site-packages' / 'micrograd' / 'engine.py',
        ROOT / 'engine' / 'llama-server.exe',
        SRC / 'ai' / 'service.py',
        SRC / 'ai' / 'vision.py',
        SRC / 'docs' / f'RELEASE-v{VERSION}.md',
        SRC / 'tests' / f'report-v{VERSION}.json',
        SRC / 'tests' / f'vision-backend-report-v{VERSION}.json',
        SRC / 'tests' / f'vision-engine-smoke-v{VERSION}.json',
    ]:
        if not req.is_file():
            raise SystemExit('Missing release input: ' + str(req))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    excluded = {'dist', 'versions', 'node_modules', '.git', '__pycache__', '.cache', 'output', 'build', 'HTML2Elementor-data'}
    with zipfile.ZipFile(OUT, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(exe, f'{NAME}/HTML2Elementor.exe')
        z.writestr(f'{NAME}/Start.bat', '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nHTML2Elementor.exe\r\n')
        z.writestr(f'{NAME}/How-to-run.txt', HOW_TO_RUN)
        z.writestr(f'{NAME}/راهنمای اجرا.txt', RAHNAAM)
        z.write(SRC / 'docs' / f'RELEASE-v{VERSION}.md', f'{NAME}/QWEN-VL-SETUP.md')
        z.write(SRC / 'docs' / f'RELEASE-v{VERSION}.md', f'{NAME}/RELEASE-v{VERSION}.md')
        z.write(SRC / 'tests' / f'report-v{VERSION}.json', f'{NAME}/test-report.json')
        z.write(SRC / 'tests' / 'ai-report-v1.6.0.json', f'{NAME}/ai-test-report.json')
        for report in [f'vision-backend-report-v{VERSION}.json', f'vision-engine-smoke-v{VERSION}.json', 'vision-error-report-v1.7.0.json']:
            z.write(SRC / 'tests' / report, f'{NAME}/' + report)
        if (ROOT / 'DEPENDENCIES.json').is_file():
            z.write(ROOT / 'DEPENDENCIES.json', f'{NAME}/DEPENDENCIES.json')
        for folder in ('runtime', 'engine'):
            for path in sorted((ROOT / folder).rglob('*')):
                if path.is_file():
                    z.write(path, f'{NAME}/{folder}/{path.relative_to(ROOT / folder).as_posix()}')
        for path in sorted((SRC / 'ai').glob('*.py')):
            z.write(path, f'{NAME}/ai/{path.name}')
        for path in sorted(SRC.rglob('*')):
            rel = path.relative_to(SRC)
            if not path.is_file() or any(part in excluded for part in rel.parts) or path.suffix in {'.zip', '.pyc'}:
                continue
            z.write(path, f'{NAME}/source/{rel.as_posix()}')

    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    (ROOT / 'versions' / 'SHA256SUMS-v1.8.0.txt').write_text(f'{digest}  {OUT.name}\n', encoding='utf-8')
    import json as _json
    print(_json.dumps({'zip': str(OUT), 'bytes': OUT.stat().st_size, 'sha256': digest}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
