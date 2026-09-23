# بررسی «آخرین نسخه» ارسال‌شده — ۲۰۲۶-۰۹-۲۴

موضوع: پوشهٔ کامل `latest-version/` روی شاخهٔ `arena/01a0cfe3-ht2ele` (۳۰۶ فایل، ۸۷٫۴ MiB) + وضعیت `main` (commit `ffe9bb5`)

## ۰) نتیجهٔ کوتاه

ارسالی، **دسترسیٔ کامل و سازگار نسخهٔ ۱٫۷٫۰ برای ویندوز x64** است: EXE + موتور CPU کامل llama.cpp (b11095) + پایتون قابل‌حمل 3.12 + سورس + گزارش‌های تست.
- سورس **تغییری نسبت به v1.7.0 ندارد** (بایت‌به‌بایت یکسان؛ فقط `output/` که آرتیفکت بیلد بود حذف شده).
- همهٔ گزارش‌های تست **PASS** هستند (روی مرجع لینوکسی؛ اجرای ویندوز صریحاً «test نشده» اعلام شده).
- اسناد supply-chain (`DEPENDENCIES.json` با SHA-256 همهٔ منابع دانلود) اضافه شده — نقطهٔ قوی جدید.
- اسکن حریم خصوصی: **پاک** (سریال/UUID/مسیر شخصی پیدا نشد).

## ۱) وضعیت `main` (commit `ffe9bb5`)

| فایل | وضعیت |
|---|---|
| `workspace-0.zip` | **بدون تغییر** — SHA-256 `de721da9b51e40b5e4c27869594fa3f5ddb7727da55d9ea54ce5010046bba1a8` با نسخهٔ چرخهٔ قبل یکسان |
| `engine/ggml.dll` (79,872 B) | جدید — بایت‌به‌بایت یکسان با `latest-version/engine/ggml.dll` (SHA-256 `9a77082a...`) |
| `engine/ggml-base.dll` (796,160 B) | جدید — بایت‌به‌بایت یکسان با `latest-version/engine/ggml-base.dll` (SHA-256 `45534fed...`) |

یافته‌های گزارش ۲۰۲۶-۰۹-۲۳ (ساختار zip-Based، نبود بستهٔ ۴۲ مگابایتی، POLARIS خام داخل ZIP) چون `workspace-0.zip` دست‌نخورده مانده، **پابرجاست**.

## ۲) تحلیل `latest-version/`

### ۲.۱ سورس — بدون تغییر
`diff -rq` بین `latest-version/source/` و سورس داخل `workspace-0.zip`:
- فقط تفاوت‌ها: `output/` (فقط در zip — آرتیفکت دموی بیلد) و فیلد نام فارسی `راهنما.txt` (در zip به‌خاطر encoding نامش گنده شده بود).
- ⇒ هیچ خط کدی نسبت به ۱٫۷٫۰ عوض نشده است.

### ۲.۲ `HTML2Elementor.exe` (7,927,296 B)
- PE32+، x64 (machine 0x8664)، ۹ سکشن؛ بیلد **go1.24.2**
- مانیفست: `assemblyIdentity name="HTML2Elementor" version="1.7.0.0"`
- UI کامل در `embed.FS` داخل باینری است (استرینگ‌های `web/` و APIها داخل EXE دیده می‌شوند)
- نمادهای سورس: `main.go`, `ai_bridge.go`, `releases.go`, `console_windows.go` — با سورس سازگار
- اسکن مسیر شخصی داخل باینری: خالی (بیلد clean، بدون نشت `C:\Users\...`)

### ۲.۳ `engine/` (۴۲MB — ۳۴ فایل) — موتور رسمی b11095 کامل
- `llama-server.exe` + `llama.dll` + `llama-common.dll` + `llama-server-impl.dll`
- `ggml.dll` (لودر/رجیستری بک‌اند؛ مسیر build داخلی: `D:/a/llama.cpp/llama.cpp/...` = GitHub Actions رسمی) + `ggml-base.dll` (هسته + CPU + پارسر GGUF)
- ۱۳ DLL واریانت معمورسی CPU: sse42، ivybridge، haswell، sapphirerapids، zen4 و... + `ggml-cpu-x64.dll`
- `mtmd.dll` (کتابخانهٔ بینایی)، `libomp.dll` (OpenMP)، رانت‌تایم VC، و لایسنس‌ها (MIT llama.cpp، LLVM-OpenMP، NOTICE Microsoft)
- timestamp هر PE: 2026-09-22 01:23 UTC — هم‌زمان با پنجرهٔ انتشار b11095

### ۲.۴ `runtime/` (۳۵MB) — پایتون قابل‌حمل
- Python 3.12.10 embeddable + Pillow 11.3.0 + micrograd 0.1.0 (در `Lib/site-packages`)
- `python312._pth` به `../ai` اشاره دارد تا `ai/service.py` و `vision.py` بدون نصب import شوند — با معماری `main.go` (که `runtime/python.exe` را با `ai/service.py` راه می‌اندازد) سازگار است

### ۲.۵ گزارش‌های تست (همهٔ `PASS` — روی مرجع لینوکسی)
| گزارش | نوع تست | نکتهٔ مهم |
|---|---|---|
| `test-report.json` | یکپارچگی مرورگر با endpointهای mock + صحنهٔ fixture | ۹ چک؛ بدون خطای کنسول؛ ۵ ویجت بومی |
| `ai-test-report.json` | سرویس AI: توکن، آموزش واقعی گرادیان‌دار، ذخیره/پیش‌بینی، ردِ URL دور و NaN | GGUF test با **Qwen2.5-0.5B روی b11095 لینوکس** — `Windows_execution: not tested` |
| `vision-backend-report-v1.7.0.json` | contract test با پاسخ تزریقی | ردِ cycle/parent/duplicate/NaN/bounds |
| `vision-engine-smoke-v1.7.0.json` | ترانسپورت واقعی multimodal با **SmolVLM-256M** | `Windows_CUDA_RTX_Qwen4B: not tested in this environment` |
| `vision-error-report-v1.7.0.json` | یکپارچگی UI منفی (mock) | بدون fallback ساختگی |

### ۲.۶ `DEPENDENCIES.json` — supply-chain manifest (نقطهٔ قوی جدید)
منبع و SHA-256 همهٔ دانلودها ثبت شده:
- پایتون 3.12.10 embed (`4acbed6d...`)، بستهٔ رسمی `llama-b11095-bin-win-cpu-x64.zip` (`170b23e0...`، ۱۸٫۵MB)، VC Redist appx (`b56a9101...`)، لایسنس llama.cpp، چرخ‌های PyPI (Pillow `a6444696...`، micrograd `47d756d9...`)

### ۲.۷ اسناد و راه‌اندازی
`How-to-run.txt` + `راهنمای اجرا.txt` + `Start.bat` (فقط launch و chcp 65001) + `QWEN-VL-SETUP.md` + `RELEASE-v1.7.0.md` (== `source/docs/RELEASE-v1.7.0.md`)

## ۳) یافته‌های این چرخه

1. 🟠 **جست‌وگذار باینری در گیت‌هاب:** این شاخه حالا ≈۸۷MB باینری دارد (EXE ۷٫۹ + engine ۴۲ + runtime ۳۵ + سورس ۳٫۹). تا حد محدودیت GitHub (۱۰۰MB/فایل) مشکلی نیست، ولی با هر نسخهٔ جدید ریپازیتوری چند برابر سنگین می‌شود. **پیشنهاد:** سورس + اسناد + manifest در گیت، بیلدها در **GitHub Releases** (که در آنجا هم SHA-256 را ثبت می‌کند).
2. 🟡 **اجرای ویندوز هنوز تست نشده:** کل بسته ویندوزی است ولی همهٔ تست‌ها روی لینوکس. چک‌لیست پیشنهادی برای اولین اجرا روی POLARIS: `Start.bat` → مرورگر روی `127.0.0.1:7788` → `GET /api/ping` (باید `"desktop"` و `1.7.0` برگردد) → drop یک HTML ساده → تبدیل → دانلود JSON+CSS → `/api/ai/status` (engine: `stopped`) → ثبت یک GGUF کوچک (0.5B) و `models/start` روی CPU.
3. 🟡 **تطبیق بایت‌به‌بایت موتور با انتشار رسمی در این محیط انجام نشد** (دانلود release asset به‌خاطر محدودیت شبکه قطع شد). مسیر یک‌قدمی برای شما: دانلود `llama-b11095-bin-win-cpu-x64.zip` رسمی و مقایسهٔ SHA-256 با `170b23e0a52c4bee7afc26912472c9b64c891382fd0d78fd9a8fafe310d571f8` (در `DEPENDENCIES.json` ثبت است) و سپس تطبیق هش‌های فایل‌های داخلش با `latest-version/SHA256SUMS.txt`.
4. 🟢 **حریم خصوصی در ارسالی پاک است** — ولی هشدار ۲۰۲۶-۰۹-۲۳ پابرجاست: `workspace-0.zip` (که هنوز در ریشهٔ هر دو شاخه است) همچنان `uploads/POLARIS.txt` و `POLARIS-original.txt` با سریال‌های واقعی را دارد.
5. 🟢 **مانیفست‌های هش:** `latest-version/SHA256SUMS.txt` برای آرته‌فکت‌های کلیدی ساخته شد (EXE، ggml.dll، ggml-base.dll، llama-server.exe، mtmd.dll).
6. 🟢 دو DLL روی `main` با کپی‌های `latest-version/engine/` بایت‌به‌بایت یکسان‌اند — تکراری‌اند؛ بعد از ادغام، نسخهٔ `engine/` ریشه می‌تواند حذف شود.

## ۴) جمع‌بندی و بعدی‌ها

- «آخرین نسخه» از نظر **کد** همان ۱٫۷٫۰ است؛ ارزش این ارسالی، **بستهٔ توزیع کامل و مستند** است (engine+runtime+source+reports+supply-chain hashes).
- اگر نسخهٔ ۱٫۸/کد جدید در کار است، هنوز ارسال نشده — منتظر آن در همین پوشه‌ام.
- اقدامات باز (از گزارش‌های قبل + این چرخه):
  1. حذف/redact گزارش خام POLARIS از `workspace-0.zip` (یا حذف خود ZIP از ریشه).
  2. انتقال بیلدها به GitHub Releases + نگه‌داشتن سورس/اسناد در گیت.
  3. چک‌لیست چک‌شدهٔ اولین اجرا روی ویندوز (مادهٔ ۳.۲).
  4. timeout/respawn در `app.py:ai_port()` (یافتهٔ ۳.۴ گزارش قبل) و CI ساده (`go test` + `py_compile`).
