(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const state = {
    htmlFiles: [], /* {name, content, size} */
    cssFiles: [],
    imageFiles: [], /* {name, dataUrl, size} */
    results: [],
    activeTab: "source",
    converting: false,
  };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve({ name: file.name, content: String(fr.result), size: file.size, path: file.webkitRelativePath || file.name });
      fr.onerror = reject;
      fr.readAsText(file, "UTF-8");
    });
  }

  function isHtml(name) {
    return /\.(html?|xhtml)$/i.test(name);
  }
  function isCss(name) {
    return /\.css$/i.test(name);
  }
  function isImage(name) {
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve({ name: file.name, dataUrl: String(fr.result), size: file.size, path: file.webkitRelativePath || file.name });
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const f of files) {
      if (isHtml(f.name)) {
        const rec = await readFile(f);
        if (!state.htmlFiles.some((x) => x.name === rec.name && x.size === rec.size)) state.htmlFiles.push(rec);
      } else if (isCss(f.name)) {
        const rec = await readFile(f);
        if (!state.cssFiles.some((x) => x.name === rec.name && x.size === rec.size)) state.cssFiles.push(rec);
      } else if (isImage(f.name)) {
        const rec = await readDataUrl(f);
        if (!state.imageFiles.some((x) => x.name === rec.name && x.size === rec.size)) state.imageFiles.push(rec);
      }
    }
    renderFiles();
    refreshSource();
    switchTab(files.some(f=>isImage(f.name))?"vision":"source");
    if(window.H2EVision&&files.some(f=>isImage(f.name)))H2EVision.refresh();
  }

  function refreshSource() {
    if(window.H2ESource)H2ESource.setFiles(state.htmlFiles,state.cssFiles,state.imageFiles,()=>{
      state.results=[];renderFiles();renderResults();
      if(window.H2EPreview)H2EPreview.setResults([]);
      toast("ورودی اصلاح شد؛ برای خروجی جدید دوباره تبدیل را بزنید");
    });
  }

  function renderFiles() {
    document.dispatchEvent(new CustomEvent("h2e:files"));
    const box = $("#fileList");
    const all = [
      ...state.htmlFiles.map((f, i) => ({ ...f, kind: "html", idx: i })),
      ...state.cssFiles.map((f, i) => ({ ...f, kind: "css", idx: i })),
      ...state.imageFiles.map((f, i) => ({ ...f, kind: "img", idx: i })),
    ];
    if (!all.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = all
      .map(
        (f) => `
      <div class="file">
        <div class="ext ${f.kind}">${f.kind.toUpperCase()}</div>
        <div>
          <div class="name">${escape(f.name)}</div>
          <div class="meta">${fmtSize(f.size)}${f.path && f.path !== f.name ? " · " + escape(f.path) : ""}</div>
        </div>
        <button type="button" data-del="${f.kind}:${f.idx}" title="حذف">×</button>
      </div>`
      )
      .join("");
    box.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [kind, idx] = btn.getAttribute("data-del").split(":");
        if (kind === "html") state.htmlFiles.splice(Number(idx), 1);
        else if (kind === "css") state.cssFiles.splice(Number(idx), 1);
        else state.imageFiles.splice(Number(idx), 1);
        renderFiles();
        refreshSource();
      });
    });
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function optionsFromForm() {
    return {
      docType: $("#optType").value,
      imageMode: $("#optImageMode")?.value || "ai",
      layout: $("#optLayout").value,
      mode: $("#optMode").value,
      rtl: $("#optRtl").checked,
      keepClasses: $("#optKeep").checked,
      scopeCss: $("#optScope").checked,
    };
  }

  async function convertAll() {
    if(state.converting)return;
    if (!state.htmlFiles.length && !state.imageFiles.length) {
      toast("اول فایل HTML یا تصویر سکشن را اضافه کنید");
      return;
    }
    state.converting=true;$("#btnConvert").disabled=true;
    try {
      const opts = optionsFromForm();
      const cssFiles = state.cssFiles.map((f) => ({ name: f.name, content: f.content }));
      const results = [];
      for (const f of state.htmlFiles) {
        const o = { ...opts, title: H2E.slug(f.name) };
        const r = H2E.convertHtml(f.content, cssFiles, o, f.name);
        r.sourceName = f.name;
        r.base = H2E.slug(f.name);
        r.rtl = r.rtl == null ? !!o.rtl : r.rtl;
        r.jsonText = JSON.stringify(r.template, null, 2);
        r.clipText = JSON.stringify(r.clipboard, null, 2);
        results.push(r);
      }
      for (const f of [...state.imageFiles]) {
        const o = { ...opts, title: H2E.slug(f.name) };
        const r = opts.imageMode==="ai" ? await H2EVision.runImage(f,o) : await H2E.convertImage(f.dataUrl, o, f.name);
        r.sourceName = f.name;
        r.base = H2E.slug(f.name);
        r.rtl = r.rtl == null ? !!o.rtl : r.rtl;
        r.jsonText = JSON.stringify(r.template, null, 2);
        r.clipText = JSON.stringify(r.clipboard, null, 2);
        results.push(r);
      }
      state.results = results;
      renderResults();
      if (window.H2EPreview) {
        H2EPreview.setResults(state.results, function (r) {
          renderResults();
          const jsonHost = $("#jsonHost");
          if (jsonHost && state.activeTab === "json") {
            jsonHost.innerHTML = `<pre class="view">${escape(r.jsonText)}</pre>`;
          }
        });
      }
      toast(state.results.length + " مورد تبدیل شد — پیش‌نمایش را ببینید");
      switchTab("live");
    } catch (err) {
      console.error(err);
      toast("خطا در تبدیل: " + (err && err.message ? err.message : String(err)));
    } finally {state.converting=false;$("#btnConvert").disabled=false;}
  }

  function downloadBlob(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 800);
  }

  function filesForResult(r) {
    return [
      { name: r.base + ".json", data: r.jsonText },
      { name: r.base + ".css", data: r.css },
      { name: r.base + ".clipboard.json", data: r.clipText },
      { name: "enqueue-" + r.base + ".php", data: r.php },
      ...(r.assets||[]),
      ...(r.analysis?[{name:r.base+".vision-layout.json",data:JSON.stringify(r.analysis,null,2)},{name:r.base+".reconstructed.html",data:r.reconstructedHTML}]:[]),
    ];
  }

  function downloadOne(r, kind) {
    if (kind === "json") downloadBlob(r.base + ".json", r.jsonText, "application/json");
    if (kind === "css") downloadBlob(r.base + ".css", r.css, "text/css");
    if (kind === "clip") downloadBlob(r.base + ".clipboard.json", r.clipText, "application/json");
    if (kind === "zip") {
      const zip = H2E.zipStore(filesForResult(r));
      downloadBlob(r.base + "-elementor.zip", zip, "application/zip");
    }
  }

  function downloadAllZip() {
    if (!state.results.length) return;
    const files = [];
    state.results.forEach((r) => {
      filesForResult(r).forEach((f) => files.push({ name: r.base + "/" + f.name, data: f.data }));
    });
    files.push({
      name: "README.txt",
      data:
        "HTML2Elementor\n\n" +
        "۱) در وردپرس: قالب‌ها → قالب‌های ذخیره‌شده → وارد کردن قالب → فایل JSON\n" +
        "۲) فایل CSS را در ظاهر → سفارشی‌سازی → CSS اضافی پیست کنید یا enqueue کنید.\n" +
        "۳) برای چسباندن مستقیم: فایل clipboard.json را کپی کرده و در بوم المنتور راست‌کلیک → Paste.\n",
    });
    downloadBlob("elementor-pages.zip", H2E.zipStore(files), "application/zip");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("کپی شد");
    } catch {
      toast("کپی ناموفق بود");
    }
  }

  function renderResults() {
    const host = $("#resultsHost");
    if (!state.results.length) {
      host.innerHTML = `<div class="empty"><h3>هنوز خروجی‌ای نیست</h3><p>فایل HTML یا تصویر سکشن را رها کنید و تبدیل را بزنید.</p></div>`;
      const jh = $("#jsonHost");
      if (jh) jh.innerHTML = `<div class="empty"><p>بعد از تبدیل، JSON اینجا دیده می‌شود.</p></div>`;
      if (window.H2EPreview) H2EPreview.setResults([]);
      return;
    }
    const totals = state.results.reduce(
      (a, r) => {
        a.w += r.stats.widgets;
        a.c += r.stats.containers;
        a.s += r.stats.sections;
        a.h += r.stats.htmlFallbacks;
        return a;
      },
      { w: 0, c: 0, s: 0, h: 0 }
    );
    host.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${state.results.length}</b><span>برگه</span></div>
        <div class="kpi"><b>${totals.w}</b><span>ویجت</span></div>
        <div class="kpi"><b>${totals.c + totals.s}</b><span>سکشن / کانتینر</span></div>
        <div class="kpi"><b>${totals.h}</b><span>HTML ویجت (fallback)</span></div>
      </div>
      <div class="actions" style="margin:0 0 12px">
        <button class="btn btn-primary" id="dlAll">دانلود همه به‌صورت ZIP</button>
      </div>
      ${state.results
        .map((r, i) => {
          const br = Object.entries(r.stats.widgetBreakdown)
            .map(([k, v]) => `<span class="pill">${escape(k)} ${v}</span>`)
            .join("");
          const warns = (r.warnings || [])
            .map((w) => `<li>${escape(w)}</li>`)
            .join("");
          return `<article class="result" data-i="${i}">
            <div class="result-head">
              <h3>${escape(r.title)} <span class="meta" style="color:var(--faint);font-weight:500">· ${escape(r.sourceName)}</span></h3>
            </div>
            <div class="pills">${br}
              ${r.stats.missingCss.length ? `<span class="pill warn">CSS گم‌شده ${r.stats.missingCss.length}</span>` : ""}
            </div>
            ${warns ? `<ul class="warn-list">${warns}</ul>` : ""}
            <div class="row-btns">
              <button class="btn btn-primary" data-act="json">دانلود JSON المنتور</button>
              <button class="btn btn-ghost" data-act="css">دانلود CSS</button>
              <button class="btn btn-ghost" data-act="zip">ZIP این برگه</button>
              <button class="btn btn-ghost" data-act="copy">کپی برای Paste در المنتور</button>
              <button class="btn btn-ghost" data-act="live">پیش‌نمایش و ویرایش</button>
              <button class="btn btn-ghost" data-act="view">کد JSON</button>
            </div>
          </article>`;
        })
        .join("")}`;
    $("#dlAll").addEventListener("click", downloadAllZip);
    host.querySelectorAll(".result").forEach((el) => {
      const r = state.results[Number(el.getAttribute("data-i"))];
      el.querySelectorAll("[data-act]").forEach((b) => {
        b.addEventListener("click", () => {
          const act = b.getAttribute("data-act");
          if (act === "json") downloadOne(r, "json");
          if (act === "css") downloadOne(r, "css");
          if (act === "zip") downloadOne(r, "zip");
          if (act === "copy") copyText(r.clipText);
          if (act === "live") switchTab("live");
          if (act === "view") {
            $("#jsonHost").innerHTML = `<pre class="view">${escape(r.jsonText)}</pre>`;
            switchTab("json");
          }
        });
      });
    });
    const jh = $("#jsonHost");
    if (jh) jh.innerHTML = `<pre class="view">${escape(state.results[0].jsonText)}</pre>`;
  }

  function switchTab(id) {
    state.activeTab = id;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    $$(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + id));
    const wide = id === "live" || id === "source" || id === "vision";
    const app = document.querySelector(".app");
    const layout = document.querySelector(".layout");
    if (app) app.classList.toggle("wide", wide);
    if (layout) layout.classList.toggle("editor-on", wide);
    if (id === "live" && window.H2EPreview) {
      H2EPreview.refresh();
    }
    if (id === "json" && state.results[0] && $("#jsonHost")) {
      $("#jsonHost").innerHTML = `<pre class="view">${escape(state.results[0].jsonText)}</pre>`;
    }
  }

  async function loadSample() {
    try {
      const html = await fetch("samples/demo.html").then((r) => {
        if (!r.ok) throw new Error("sample");
        return r.text();
      });
      let css = "";
      try {
        css = await fetch("samples/demo.css").then((r) => (r.ok ? r.text() : ""));
      } catch (_) {}
      state.htmlFiles = [{ name: "demo.html", content: html, size: html.length, path: "demo.html" }];
      state.cssFiles = css ? [{ name: "demo.css", content: css, size: css.length, path: "demo.css" }] : [];
      renderFiles();
      refreshSource();
      switchTab("source");
      toast("نمونه بارگذاری شد");
    } catch (e) {
      /* offline fallback embedded */
      const html = window.H2E_SAMPLE_HTML;
      const css = window.H2E_SAMPLE_CSS || "";
      if (!html) {
        toast("نمونه در دسترس نیست");
        return;
      }
      state.htmlFiles = [{ name: "demo.html", content: html, size: html.length, path: "demo.html" }];
      state.cssFiles = css ? [{ name: "demo.css", content: css, size: css.length, path: "demo.css" }] : [];
      renderFiles();
      refreshSource();
      switchTab("source");
    }
  }

  function bindDrop(el, input) {
    el.addEventListener("click", () => input.click());
    ["dragenter", "dragover"].forEach((ev) =>
      el.addEventListener(ev, (e) => {
        e.preventDefault();
        el.classList.add("over");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      el.addEventListener(ev, (e) => {
        e.preventDefault();
        el.classList.remove("over");
      })
    );
    el.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    input.addEventListener("change", () => {
      addFiles(input.files);
      input.value = "";
    });
  }

  function init() {
    bindDrop($("#drop"), $("#fileInput"));
    $("#btnConvert").addEventListener("click", convertAll);
    $("#btnSample").addEventListener("click", loadSample);
    $("#btnClear").addEventListener("click", () => {
      state.htmlFiles = [];
      state.cssFiles = [];
      state.imageFiles = [];
      state.results = [];
      renderFiles();
      renderResults();
      if (window.H2EPreview) H2EPreview.setResults([]);
      refreshSource();
      switchTab("source");
    });
    $$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
    if (window.H2EPreview) H2EPreview.mount("#liveHost");
    renderResults();
    refreshSource();
    switchTab("source");
    const zipBtn = $("#btnWinZip");
    if (zipBtn) {
      fetch("/api/release")
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (!info || !info.url) {
            zipBtn.hidden = true;
            return;
          }
          const versions = $("#btnVersions");
          if (versions && info.archive_url) { versions.hidden = false; versions.href = info.archive_url; }
          zipBtn.hidden = false;
          zipBtn.href = info.url;
          zipBtn.setAttribute("download", info.file || "HTML2Elementor-Windows.zip");
          zipBtn.textContent = "دانلود نسخه ویندوز " + (info.version ? "v" + info.version : "") + " (ZIP)";
        })
        .catch(() => {
          zipBtn.hidden = true;
        });
    }
  }

  window.H2EApp={images:()=>state.imageFiles,options:optionsFromForm,show:switchTab,addFiles,download:downloadBlob,
    acceptVision(r){state.results=[r,...state.results.filter(old=>old.sourceName!==r.sourceName)];renderResults();H2EPreview.setResults(state.results,(changed)=>{renderResults();if(state.activeTab==='json')$('#jsonHost').innerHTML='<pre class="view">'+escape(changed.jsonText)+'</pre>';});switchTab('live');toast('طرح بومی ساخته شد؛ روی هر المان کلیک و آن را اصلاح کنید');}
  };
  document.addEventListener("DOMContentLoaded", init);
})();
