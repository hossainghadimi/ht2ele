#!/usr/bin/env python3
"""Create immutable release ZIP and a collection of available historical releases."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile
import sys
MAKE_COLLECTION = '--collection' in sys.argv

ROOT = Path(__file__).resolve().parent
version = re.search(r'const version = "([^"]+)"', (ROOT / 'main.go').read_text())[1]
versions = ROOT.parent / 'versions'
versions.mkdir(exist_ok=True)
name = f'HTML2Elementor-Windows-v{version}'
release = versions / (name + '.zip')
archive = versions / f'HTML2Elementor-All-Versions-through-v{version}.zip'
if release.exists() or archive.exists():
    raise SystemExit('Release already exists. Increment version; never overwrite a released ZIP.')
for base in [ROOT.parent, ROOT / 'dist']:
    for old in base.glob('HTML2Elementor-Windows*.zip'):
        dest = versions / old.name
        if dest.exists():
            if hashlib.sha256(dest.read_bytes()).digest() != hashlib.sha256(old.read_bytes()).digest():
                raise SystemExit('Historical filename conflict: ' + old.name)
        else:
            shutil.copy2(old, dest)

for required in ['dist/HTML2Elementor.exe','docs/RELEASE-v1.7.0.md','tests/report-v1.7.0.json','tests/vision-backend-report-v1.7.0.json','tests/vision-engine-smoke-v1.7.0.json','build/offline/runtime/python312.zip','build/offline/runtime/python312.dll','build/offline/engine/mtmd.dll','ai/vision.py']:
    if not (ROOT/required).is_file():raise SystemExit('Missing release input: '+required)

with zipfile.ZipFile(release, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(ROOT / 'docs/RELEASE-v1.7.0.md', f'{name}/QWEN-VL-SETUP.md')
    z.write(ROOT / 'dist/HTML2Elementor.exe', f'{name}/HTML2Elementor.exe')
    z.writestr(f'{name}/Start.bat', '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nHTML2Elementor.exe\r\n')
    z.writestr(f'{name}/How-to-run.txt', f'HTML2Elementor {version}\nWindows 10/11, x64\n\nExtract the COMPLETE ZIP, including runtime, ai and engine folders, then double-click HTML2Elementor.exe. Python, Pillow, micrograd and the CPU GGUF engine are bundled; no installation or internet is required for the base app. GGUF model weights and optional CUDA engine are NOT bundled.\nKeep the console window open. Closing it stops the application.\nIf an earlier release is open, close it first.\n\nThe application opens http://127.0.0.1:7788/ in your browser.\nIf Windows warns about an unsigned executable, verify the package source and hash before choosing to run it.\n\nExport both Elementor JSON and its companion CSS. Test the imported template on a staging WordPress site.\nSee RELEASE-v{version}.md for supported widgets and limitations.\nEditable source code is included in source/.\n')
    z.writestr(f'{name}/راهنمای اجرا.txt', 'نسخه ۱.۷.۰ — ویندوز ۱۰ و ۱۱، ۶۴بیتی\n\nابتدا ZIP را استخراج کنید. اگر نسخه قبلی باز است، پنجره آن را ببندید.\nهمه پوشه‌های runtime و ai و engine باید کنار EXE بمانند. روی HTML2Elementor.exe دوبار کلیک کنید؛ پایتون و کتابخانه‌ها و موتور CPU داخل بسته‌اند و نصب جداگانه لازم نیست. وزن مدل و CUDA داخل بسته نیستند.\nمرورگر باز می‌شود. پنجره کنسول باید باز بماند.\nدر صورت هشدار ویندوز درباره امضای دیجیتال، ابتدا منبع فایل و هش بسته را بررسی کنید.\n\nHTML و فایل‌های CSS مرتبط را وارد کنید و تبدیل را بزنید.\nدر پیش‌نمایش اسکرول کنید و روی المان برای ویرایش کلیک کنید.\nقالب JSON و CSS همراه آن هر دو باید در سایت استفاده شوند.\nفایل RELEASE-v1.7.0.md دامنه شناسایی ویجت‌ها و محدودیت‌ها را توضیح می‌دهد.\nسورس قابل‌ویرایش داخل source قرار دارد.\n')
    z.write(ROOT / 'docs/RELEASE-v1.7.0.md', f'{name}/RELEASE-v1.7.0.md')
    z.write(ROOT / 'tests/report-v1.7.0.json', f'{name}/test-report.json')
    z.write(ROOT / 'tests/ai-report-v1.6.0.json', f'{name}/ai-test-report.json')
    for report in ['vision-backend-report-v1.7.0.json','vision-engine-smoke-v1.7.0.json','vision-error-report-v1.7.0.json']:
        z.write(ROOT/'tests'/report,f'{name}/'+report)
    runtime = ROOT/'build/offline'
    for required in ['runtime/python.exe','runtime/python312.zip','runtime/python312.dll','engine/mtmd.dll','runtime/Lib/site-packages/PIL/__init__.py','runtime/Lib/site-packages/micrograd/engine.py','engine/llama-server.exe','DEPENDENCIES.json']:
        if not (runtime/required).is_file(): raise SystemExit('Missing offline dependency: '+required)
    for path in sorted(runtime.rglob('*')):
        if path.is_file(): z.write(path, f'{name}/'+path.relative_to(runtime).as_posix())
    for path in (ROOT/'ai').glob('*.py'): z.write(path,f'{name}/ai/'+path.name)

    excluded = {'dist','versions','node_modules','.git','__pycache__','.cache','output','build','HTML2Elementor-data'}
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if not path.is_file() or any(part in excluded for part in rel.parts) or path.suffix in {'.zip','.pyc'}:
            continue
        z.write(path, f'{name}/source/{rel.as_posix()}')

records=[]
for path in sorted(versions.glob('HTML2Elementor-Windows*.zip')):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None, path
    records.append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest={'latest':release.name,'releases':records,'note':'Only existing releases are listed. Previously deleted releases were not recreated.'}
(versions/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(versions/'README.md').write_text('# نسخه‌های HTML2Elementor\n\nجدیدترین نسخه: **'+release.name+'**\n\n'+ '\n'.join('- `'+r['file']+'`' for r in records)+'\n\nبسته‌های قبلی بنا به درخواست حذف شده‌اند و بازسازی نشده‌اند. فقط ZIPهای موجود فهرست می‌شوند. manifest.json شامل SHA-256 و اندازه فایل‌هاست. بستهٔ تجمیعی تکراری ساخته نمی‌شود.\n',encoding='utf-8')
if MAKE_COLLECTION:
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED) as z:
        for r in records:
            z.write(versions/r['file'],'versions/'+r['file'])
        for f in ['manifest.json','README.md']:
            z.write(versions/f,'versions/'+f)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
# A transient compatibility copy; persistent canonical ZIP is in versions/.
shutil.copy2(release, ROOT/'dist'/release.name)
print(json.dumps({'release':str(release),'archive':str(archive) if MAKE_COLLECTION else None,'records':records},ensure_ascii=False,indent=2))
