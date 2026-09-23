/**
 * Live Elementor-like preview + inspector.
 * Edits mutate the converted JSON in place.
 */
(function (global) {
  "use strict";

  const LABELS = {
    container: "کانتینر",
    section: "سکشن",
    column: "ستون",
    heading: "تیتر",
    "text-editor": "متن",
    image: "تصویر",
    button: "دکمه",
    html: "HTML",
    divider: "جداکننده",
    spacer: "فاصله",
    video: "ویدیو",
    "icon-list": "فهرست آیکون",
    "icon-box": "جعبه آیکون",
    "image-box": "جعبه تصویر",
    icon: "آیکون",
    "social-icons": "شبکه‌های اجتماعی",
    "image-gallery": "گالری",
    "image-carousel": "اسلایدر تصویر",
    accordion: "آکاردئون",
    toggle: "تاگل",
    tabs: "تب",
    counter: "شمارنده",
    progress: "نوار پیشرفت",
    alert: "هشدار",
    testimonial: "نظر مشتری",
    google_maps: "نقشه",
    rating: "امتیاز",
    audio: "صوت",
    "star-rating": "امتیاز",
    "menu-anchor": "لنگر",
    shortcode: "شورت‌کد",
    "read-more": "ادامه مطلب",
    page: "برگه",
  };

  function iconMarkup(icon, style) {
    if (!icon || !icon.value) return "";
    if (icon.library === "svg" && icon.value.url) return `<img class="h2e-icon" src="${esc(icon.value.url)}" style="width:1em;height:1em;${style || ""}" alt=""/>`;
    const cls = String(icon.value).replace(/[^a-zA-Z0-9 _-]/g, "");
    return `<i aria-hidden="true" class="${esc(cls)} h2e-icon" style="${style || ""}"></i>`;
  }

  const FONTS = [
    "Vazirmatn", "Tahoma", "Arial", "Segoe UI", "Tahoma", "Georgia",
    "Times New Roman", "Courier New", "Roboto", "IRANSans", "Shabnam", "Samim", "system-ui",
  ];

  const state = {
    results: [],
    index: 0,
    selectedId: null,
    itab: "content",
    device: "desktop",
    host: null,
    onSync: null,
    typeHistory: [],
    actions: [],
    editedFlow: new Set(),
  };

  const $ = (s, r) => (r || document).querySelector(s);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function current() {
    return state.results[state.index] || null;
  }

  function walk(list, fn, parent) {
    (list || []).forEach((el, i) => {
      fn(el, parent, i);
      if (el.elements) walk(el.elements, fn, el);
    });
  }

  function findEl(list, id, parent) {
    for (let i = 0; i < (list || []).length; i++) {
      const el = list[i];
      if (el.id === id) return { el, parent, index: i, list };
      if (el.elements) {
        const hit = findEl(el.elements, id, el);
        if (hit) return hit;
      }
    }
    return null;
  }

  function kindOf(el) {
    if (!el) return "page";
    return el.widgetType || el.elType || "container";
  }

  function get(s, path, def) {
    const parts = path.split(".");
    let cur = s;
    for (const p of parts) {
      if (cur == null) return def;
      cur = cur[p];
    }
    return cur == null ? def : cur;
  }

  function set(s, path, val) {
    const parts = path.split(".");
    let cur = s;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] == null || Array.isArray(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function dim(top, right, bottom, left, unit, linked) {
    return {
      unit: unit || "px",
      top: String(top ?? 0),
      right: String(right ?? 0),
      bottom: String(bottom ?? 0),
      left: String(left ?? 0),
      isLinked: !!linked,
    };
  }

  const RESPONSIVE_KEY = /^(flex_direction|flex_wrap|flex_justify_content|flex_align_items|flex_gap|grid_columns_grid|grid_rows_grid|grid_gaps|width|boxed_width|min_height|padding|margin|_padding|_margin|_element_custom_width|_element_width|button_text_padding|size|align|typography_font_size|typography_line_height|typography_letter_spacing|_flex_order|_flex_grow|_flex_shrink|_align_self|border_width|border_radius|_border_width|_border_radius)$/;
  function deviceSettings(el) {
    const src = el.settings || {};
    return new Proxy(src, {
      get(obj, key) {
        if (state.device !== "desktop" && RESPONSIVE_KEY.test(String(key))) {
          if (state.device === "mobile" && obj[key + "_mobile"] != null) return obj[key + "_mobile"];
          if (obj[key + "_tablet"] != null) return obj[key + "_tablet"];
        }
        return obj[key];
      },
      set(obj, key, value) {
        obj[state.device !== "desktop" && RESPONSIVE_KEY.test(String(key)) ? key + "_" + state.device : key] = value;
        return true;
      }
    });
  }

  function ensureSettings(el) {
    if (!el.settings || Array.isArray(el.settings)) el.settings = {};
    return deviceSettings(el);
  }

  function boxToCss(box, prop) {
    if (!box || typeof box !== "object") return "";
    const u = box.unit === "custom" ? "" : box.unit || "px";
    return `${prop}:${box.top || 0}${u} ${box.right || 0}${u} ${box.bottom || 0}${u} ${box.left || 0}${u};`;
  }

  function sizeToCss(sz, prop) {
    if (!sz || typeof sz !== "object" || sz.size == null || sz.size === "") return "";
    return `${prop}:${sz.size}${sz.unit === "custom" ? "" : sz.unit || "px"};`;
  }

  function typoCss(s, prefix) {
    prefix = prefix || "typography_";
    let css = "";
    if (s[prefix + "font_family"]) css += `font-family:${s[prefix + "font_family"]}, Vazirmatn, Tahoma, sans-serif;`;
    css += sizeToCss(s[prefix + "font_size"], "font-size");
    if (s[prefix + "font_weight"]) css += `font-weight:${s[prefix + "font_weight"]};`;
    if (s[prefix + "font_style"]) css += `font-style:${s[prefix + "font_style"]};`;
    if (s[prefix + "text_transform"]) css += `text-transform:${s[prefix + "text_transform"]};`;
    if (s[prefix + "text_decoration"]) css += `text-decoration:${s[prefix + "text_decoration"]};`;
    css += sizeToCss(s[prefix + "line_height"], "line-height");
    css += sizeToCss(s[prefix + "letter_spacing"], "letter-spacing");
    return css;
  }

  function wrapperStyle(el) {
    const s = deviceSettings(el);
    const type = el.elType;
    let css = "";
    const pad = type === "widget" ? s._padding : s.padding;
    const mar = type === "widget" ? s._margin : s.margin;
    css += boxToCss(pad, "padding");
    css += boxToCss(mar, "margin");
    if (el.widgetType !== "button") css += boxToCss(s.border_radius || s._border_radius, "border-radius");
    if (type !== "widget" && s.background_color) css += `background-color:${s.background_color};`;
    if (s.background_image && s.background_image.url) {
      css += `background-image:url('${String(s.background_image.url).replace(/'/g, "%27")}');`;
      css += `background-size:${s.background_size || "cover"};`;
      css += `background-position:${s.background_position || "center center"};`;
      css += `background-repeat:${s.background_repeat || "no-repeat"};`;
    }
    if (s.min_height && s.min_height.size) css += sizeToCss(s.min_height, "min-height");
    if (type !== "widget" && s.width && s.width.size != null) css += sizeToCss(s.width, "width");
    if (s._element_width === "auto") css += "width:auto;";
    if (s._element_custom_width) css += sizeToCss(s._element_custom_width, "width");
    if (s._background_color) css += `background-color:${s._background_color};`;
    [["_flex_grow", "flex-grow"], ["_flex_shrink", "flex-shrink"], ["_flex_order", "order"], ["_align_self", "align-self"]].forEach(([key, prop]) => { if (s[key] != null) css += `${prop}:${s[key]};`; });
    if (s._z_index) css += `z-index:${s._z_index};`;
    const border = s._border_border ?? s.border_border;
    if (el.widgetType !== "button" && border) {
      const w = s._border_width || s.border_width || { top: 0, right: 0, bottom: 0, left: 0, unit: "px" };
      css += `border-style:${border};` + boxToCss(w, "border-width");
      if (s._border_color || s.border_color) css += `border-color:${s._border_color || s.border_color};`;
    }
    if (type === "container" || type === "section") {
      if (s.container_type === "grid") {
        css += "display:grid;";
        const cols = (s.grid_columns_grid && s.grid_columns_grid.size) || s.grid_columns_grid || 3;
        css += s.grid_columns_grid && s.grid_columns_grid.unit === "custom" ? `grid-template-columns:${s.grid_columns_grid.size};` : `grid-template-columns:repeat(${Number(cols) || 3},minmax(0,1fr));`;
        if (s.grid_rows_grid && s.grid_rows_grid.unit === "custom") css += `grid-template-rows:${s.grid_rows_grid.size};`;
      } else {
        css += "display:flex;";
        css += `flex-direction:${s.flex_direction || "column"};`;
        css += `flex-wrap:${s.flex_wrap || "nowrap"};`;
      }
      if (s.flex_justify_content) css += `justify-content:${s.flex_justify_content};`;
      if (s.flex_align_items) css += `align-items:${s.flex_align_items};`;
      if (s.flex_gap || s.grid_gaps) {
        const g = s.container_type === "grid" ? (s.grid_gaps || s.flex_gap) : s.flex_gap;
        const n = g.size != null ? g.size : g.column || 0;
        css += `row-gap:${g.row ?? n}${g.unit || "px"};column-gap:${g.column ?? n}${g.unit || "px"};`;
      }
      if (s.content_width === "boxed") {
        const bw = (s.boxed_width && s.boxed_width.size) || 1140;
        const u = (s.boxed_width && s.boxed_width.unit) || "px";
        css += `max-width:${bw}${u};width:100%;margin-left:auto;margin-right:auto;`;
      }
    }
    if(type === "container" && !state.editedFlow.has(el.id)) {
      const flows=(current()||{}).previewFlows||{};
      const key=String(s._css_classes||"").split(/\s+/).find(k=>flows[k]);
      const flow=key&&flows[key][state.device];
      if(flow && flow!=="none")css+=`display:${flow};`;
    }
    if (type === "column" && s._column_size) css += `width:${s._column_size}%;flex:0 0 auto;`;
    if (s["hide_" + state.device] === "hidden-" + state.device) css += "display:none!important;";
    return css;
  }

  function widgetInner(el) {
    const s = deviceSettings(el);
    const t = el.widgetType;
    if (t === "heading") {
      const tag = s.header_size || "h2";
      const safeTag = /^(h[1-6]|div|p|span)$/.test(tag) ? tag : "h2";
      const st = `margin:0;${s.align ? "text-align:" + s.align + ";" : ""}${s.title_color ? "color:" + s.title_color + ";" : ""}${typoCss(s)}`;
      const inner = s.title || "";
      const body = `<${safeTag} class="elementor-heading-title" style="${st}">${inner}</${safeTag}>`;
      if (s.link && s.link.url) return `<a href="${esc(s.link.url)}" style="text-decoration:none;color:inherit">${body}</a>`;
      return body;
    }
    if (t === "text-editor") {
      const st = `${s.align ? "text-align:" + s.align + ";" : ""}${s.text_color ? "color:" + s.text_color + ";" : ""}${typoCss(s)}`;
      return `<div class="elementor-text-editor" style="${st}">${s.editor || ""}</div>`;
    }
    if (t === "image") {
      const url = (s.image && s.image.url) || "";
      const alt = (s.image && s.image.alt) || s.caption || "";
      const w = s.width && s.width.size != null ? sizeToCss(s.width, "width") : "max-width:100%;";
      const img = `<img src="${esc(url)}" alt="${esc(alt)}" style="${w}height:auto;display:block;${s.align === "center" ? "margin-inline:auto;" : ""}"/>`;
      const cap = s.caption ? `<figcaption style="text-align:${s.align || "center"};font-size:13px;color:#666">${esc(s.caption)}</figcaption>` : "";
      const wrap = `<figure style="margin:0;text-align:${s.align || "center"}">${img}${cap}</figure>`;
      if (s.link && s.link.url) return `<a href="${esc(s.link.url)}">${wrap}</a>`;
      return wrap;
    }
    if (t === "button") {
      const bg = s.background_color || "#61ce70";
      const color = s.button_text_color || "#fff";
      const rad = s.border_radius ? boxToCss(s.border_radius, "border-radius") : "border-radius:4px;";
      const sizePad = { xs: "6px 12px", sm: "10px 20px", md: "12px 24px", lg: "15px 30px", xl: "20px 40px" };
      const pad = s.button_text_padding ? boxToCss(s.button_text_padding, "padding") : `padding:${sizePad[s.size || "sm"]};`;
      const border = s.border_border ? `border-style:${s.border_border};border-color:${s.border_color || "currentColor"};${boxToCss(s.border_width, "border-width")}` : "";
      const st = `display:inline-block;${border}text-decoration:none;background:${bg};color:${color};${rad}${pad}font-weight:600;${typoCss(s)}`;
      const align = s.align ? `text-align:${s.align};` : "";
      const href = (s.link && s.link.url) || "#";
      const target = s.link && s.link.is_external ? " target='_blank'" : "";
      return `<div style="${align}"><a class="elementor-button" href="${esc(href)}"${target} style="${st}">${s.icon_align !== "right" ? iconMarkup(s.selected_icon) : ""} ${esc(s.text || "دکمه")} ${s.icon_align === "right" ? iconMarkup(s.selected_icon) : ""}</a></div>`;
    }
    if (t === "divider") {
      const color = s.color || "#ccc";
      const weight = (s.weight && s.weight.size) || 1;
      return `<div style="text-align:${s.align || "center"}"><hr style="border:none;border-top:${weight}px ${s.style || "solid"} ${color};width:${(s.width && s.width.size) || 100}%;margin:12px auto"/></div>`;
    }
    if (t === "spacer") {
      const h = (s.space && s.space.size) ?? 50;
      return `<div style="height:${h}${get(s, "space.unit", "px")}"></div>`;
    }
    if (t === "html") {
      return `<div class="elementor-widget-html">${s.html || ""}</div>`;
    }
    if (t === "video") {
      if (s.video_type === "hosted") return `<video controls src="${esc(get(s, "hosted_url.url", ""))}" style="width:100%;height:auto"></video>`;
      const url = s.youtube_url || s.vimeo_url || "";
      const yt = (url.match(/v=([A-Za-z0-9_-]+)/) || url.match(/youtu\.be\/([A-Za-z0-9_-]+)/) || [])[1];
      if (yt) {
        return `<div style="position:relative;padding-top:56.25%"><iframe src="https://www.youtube.com/embed/${esc(yt)}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>`;
      }
      return `<div style="background:#111;color:#fff;padding:40px;text-align:center">ویدیو</div>`;
    }
    if (t === "icon-list") {
      const items = s.icon_list || [];
      const lis = items
        .map((it) => {
          const a = it.link && it.link.url ? `<a href="${esc(it.link.url)}">${esc(it.text || "")}</a>` : esc(it.text || "");
          return `<li style="margin:6px 0">${iconMarkup(it.selected_icon)} ${a}</li>`;
        })
        .join("");
      return `<ul class="elementor-icon-list-items" style="list-style:none;padding:0;margin:0;${s.align ? "text-align:" + s.align + ";" : ""}">${lis}</ul>`;
    }
    if (t === "icon-box" || t === "image-box") {
      const title = esc(s.title_text || "");
      const desc = esc(s.description_text || "");
      const img = t === "image-box" && s.image && s.image.url ? `<img src="${esc(s.image.url)}" style="max-width:80px;height:auto"/>` : iconMarkup(s.selected_icon, sizeToCss(s.icon_size, "font-size"));
      return `<div style="text-align:${s.align || "inherit"};${s.position !== "top" ? "display:flex;gap:12px;align-items:center;" : ""}">${img}<div><h3 style="margin:8px 0;${typoCss(s, "title_typography_")}color:${esc(s.title_color || "inherit")}">${title}</h3><p style="margin:0;${typoCss(s, "description_typography_")}color:${esc(s.description_color || "inherit")}">${desc}</p></div></div>`;
    }
    if (t === "icon") {
      const style = sizeToCss(s.size || { unit: "px", size: 24 }, "font-size") + (s.primary_color ? `color:${s.primary_color};` : "");
      const mark = iconMarkup(s.selected_icon, style);
      return `<div class="elementor-icon-wrapper" style="text-align:${s.align || "inherit"};line-height:1">${mark || `<span class="h2e-icon-placeholder" title="آیکن خالی؛ از پنل یک آیکن انتخاب کنید" style="display:inline-grid;place-items:center;min-width:1em;min-height:1em;border:1px dashed #b8a6bc;${style}"><span style="font:10px Tahoma;color:#777">آیکن خالی</span></span>`}</div>`;
    }
    if (t === "social-icons") return `<div style="display:flex;flex-wrap:wrap;gap:12px">${(s.social_icon_list || []).map(it => `<a href="${esc(get(it, "link.url", "#"))}" aria-label="${esc(get(it, "social_icon.value", "شبکه اجتماعی"))}">${iconMarkup(it.social_icon, sizeToCss(s.icon_size || { size: 24, unit: "px" }, "font-size"))}</a>`).join("")}</div>`;
    if (t === "image-gallery" || t === "image-carousel") {
      const gallery = s.gallery || s.carousel || [];
      const count = Math.max(1, Number(s.gallery_columns || s.slides_to_show) || 3);
      return `<div style="display:grid;grid-template-columns:repeat(${count},minmax(0,1fr));gap:12px">${gallery.map(img => `<img src="${esc(img.url)}" alt="${esc(img.alt || "")}" style="width:100%;height:auto"/>`).join("")}</div>`;
    }
    if (["accordion", "toggle", "tabs"].includes(t)) {
      return `<div class="h2e-panels" data-panel-type="${t}">${(s.tabs || []).map((it, i) => `<section style="border:1px solid #ddd"><button type="button" data-panel="${i}" aria-expanded="${i === 0}" style="width:100%;text-align:inherit;padding:12px;background:#f6f6f6;border:0;font:inherit;color:inherit">${esc(it.tab_title)}</button><div data-panel-body="${i}" ${i ? "hidden" : ""} style="padding:12px">${it.tab_content || ""}</div></section>`).join("")}</div>`;
    }
    if (t === "counter") return `<div style="text-align:center"><strong style="font-size:2em">${esc(s.prefix || "")}${esc(s.ending_number ?? 0)}${esc(s.suffix || "")}</strong><div>${esc(s.title || "")}</div></div>`;
    if (t === "progress") {
      const percent = Math.max(0, Math.min(100, Number(get(s, "percent.size", 0))));
      return `<div>${esc(s.title || "")}<div style="background:#eee;border-radius:4px;overflow:hidden"><div style="width:${percent}%;background:${esc(s.bar_color || "#6ec1e4")};min-height:24px;color:#fff;padding:2px 6px">${esc(s.inner_text || "")}${s.display_percentage === "hide" ? "" : percent + "%"}</div></div></div>`;
    }
    if (t === "alert") return `<div role="alert" style="border-inline-start:4px solid #6ec1e4;padding:16px;background:#eef7ff"><strong>${esc(s.alert_title || "")}</strong><div>${s.alert_description || ""}</div></div>`;
    if (t === "testimonial") return `<blockquote style="margin:0">${esc(s.testimonial_content || "")}<footer>${get(s, "testimonial_image.url", "") ? `<img src="${esc(s.testimonial_image.url)}" alt="" style="width:56px;height:56px;border-radius:50%"/>` : ""}<strong>${esc(s.testimonial_name || "")}</strong><div>${esc(s.testimonial_job || "")}</div></footer></blockquote>`;
    if (t === "google_maps") return `<div style="height:260px;background:#e7ece7;display:grid;place-content:center;text-align:center">${esc(s.address || "نقشه")}<small>نمایش نقشه آنلاین پس از ورود به سایت</small></div>`;
    if (t === "star-rating" || t === "rating") return `<div>${esc(s.title || "")} <span style="color:#e9a821;font-size:24px">${"★".repeat(Math.max(0, Math.min(5, Math.round(Number(s.rating) || 0))))}${"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(Number(s.rating) || 0))))}</span></div>`;
    if (t === "audio") return `<div style="padding:20px;background:#eee">SoundCloud · ${esc(s.link || "")}<small>پخش به اینترنت نیاز دارد</small></div>`;
    if (t === "menu-anchor") return `<span id="${esc(s.anchor || "")}"></span>`;
    if (t === "shortcode") return `<code>${esc(s.shortcode || "")}</code>`;
    if (t === "read-more") return `<a href="${esc(get(s, "link.url", "#"))}">ادامه مطلب</a>`;
    return `<div>${esc(t)}</div>`;
  }

  function renderElement(el) {
    if (!el) return "";
    const id = el.id;
    const type = el.elType;
    const wt = kindOf(el);
    const s = deviceSettings(el);
    const extra = s._css_classes || "";
    const cls = `h2e-el elementor-element elementor-element-${id} el-${id} ${extra}`;
    const handle = `<span class="h2e-handle">${esc(LABELS[wt] || wt)}</span>`;
    const style = wrapperStyle(el);
    const kids = (el.elements || []).map(renderElement).join("");
    if (type === "container") {
      return `<div class="e-con ${cls}" id="${esc(s._element_id || "h2e-" + id)}" data-id="${id}" data-kind="${wt}" style="${style}">${handle}${kids}</div>`;
    }
    if (type === "section") {
      return `<section class="elementor-section ${cls}" id="${esc(s._element_id || "h2e-" + id)}" data-id="${id}" data-kind="section" style="${style}">${handle}<div class="elementor-container" style="display:flex;width:100%;flex-wrap:wrap">${kids}</div></section>`;
    }
    if (type === "column") {
      return `<div class="elementor-column ${cls}" id="${esc(s._element_id || "h2e-" + id)}" data-id="${id}" data-kind="column" style="${style}">${handle}${kids}</div>`;
    }
    return `<div class="elementor-widget elementor-widget-${wt} ${cls}" id="${esc(s._element_id || "h2e-" + id)}" data-id="${id}" data-kind="${wt}" style="${style}">${handle}<div class="elementor-widget-container">${widgetInner(el)}</div></div>`;
  }

  function baseFrameCss() {
    return (global.H2E_ICON_CSS || "") + `
      *{box-sizing:border-box}
      html,body{margin:0;padding:0}
      body{font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#222;background:#fff;line-height:1.7}
      img{max-width:100%;height:auto}
      a{color:inherit}
      .h2e-el{position:relative;outline:1px dashed transparent;cursor:pointer;transition:outline .12s}
      .h2e-el:hover{outline:1px dashed #93003f}
      .h2e-el.is-selected{outline:2px solid #93003f;outline-offset:1px}
      .h2e-handle{position:absolute;top:0;right:0;background:#93003f;color:#fff;font-size:10px;padding:1px 6px;display:none;z-index:30;font-family:Tahoma,sans-serif;pointer-events:none;border-radius:0 0 0 4px}
      .is-selected>.h2e-handle,.h2e-el:hover>.h2e-handle{display:block}
      .elementor-heading-title{margin:0;line-height:inherit}
      .elementor-text-editor p{margin:0 0 .6em}
      .elementor-widget{min-width:0}
      .elementor-widget-container{min-width:0}
      .h2e-icon{display:inline-block}
      .h2e-panels [hidden]{display:none!important}
      .e-con{min-height:0}
      .elementor-widget>.elementor-widget-container{padding:0!important;margin:0!important;border:0!important;background:none!important}
      .elementor-text-editor,.elementor-icon-wrapper{padding:0;margin:0;border:0;background:none}
      .h2e-retyped-button{padding:0!important;background:none!important;border:0!important;box-shadow:none!important}
      .elementor,.elementor-page{overflow:visible}
      html,body{overflow:visible}
    `;
  }

  function fontFaces() {
    const base = new URL("fonts/", location.href).href;
    return `
      @font-face{font-family:Vazirmatn;src:url('${base}Vazirmatn-Regular.woff2') format('woff2');font-weight:400;font-display:swap}
      @font-face{font-family:Vazirmatn;src:url('${base}Vazirmatn-Bold.woff2') format('woff2');font-weight:700;font-display:swap}
      @font-face{font-family:Vazirmatn;src:url('${base}Vazirmatn-ExtraBold.woff2') format('woff2');font-weight:800;font-display:swap}
    `;
  }

  function extraCss(el) {
    const s = deviceSettings(el);
    let css = "";
    if (el.widgetType === "button") {
      const hbg = s.button_background_hover_color;
      const hc = s.hover_color;
      if (hbg || hc) {
        css += `.el-${el.id} .elementor-button:hover{`;
        if (hbg) css += `background:${hbg} !important;`;
        if (hc) css += `color:${hc} !important;`;
        css += "}";
      }
    }
    if (s.custom_css) css += s.custom_css.replace(/selector/g, `.el-${el.id}`);
    return css;
  }

  function collectExtraCss(list) {
    let css = "";
    walk(list, (el) => {
      css += extraCss(el);
    });
    return css;
  }

  function safePreview(html) {
    const d = new DOMParser().parseFromString(html, "text/html");
    d.querySelectorAll("script,object,embed,base,meta,link").forEach(n => n.remove());
    d.querySelectorAll("*").forEach(n => {
      Array.from(n.attributes).forEach(a => {
        if (/^on/i.test(a.name) || a.name === "srcdoc" || (/^(href|src|action|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
      });
      if (n.tagName === "IFRAME") n.setAttribute("sandbox", "");
    });
    return d.body.innerHTML;
  }

  function buildFrameHtml(result) {
    const rtl = !!result.rtl;
    const content = (result.template && result.template.content) || [];
    const body = safePreview(content.map(renderElement).join("")) || `<div style="padding:60px;text-align:center;color:#888">محتوایی نیست</div>`;
    const pageBg = (result.template.page_settings && result.template.page_settings.background_color) || "";
    const userCss = result.css || "";
    return `<!DOCTYPE html>
<html lang="fa" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8"/>
<style>${fontFaces()}${baseFrameCss()}
body{${pageBg ? "background:" + pageBg + ";" : ""}}
${collectExtraCss(content)}
</style>
<style id="user-css">${userCss.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div class="elementor elementor-page">${body}</div>
</body>
</html>`;
  }

  function syncResult(r) {
    if (!r || !r.template) return;
    if(r.stats){const counts={};let containers=0,sections=0;walk(r.template.content,n=>{if(n.widgetType)counts[n.widgetType]=(counts[n.widgetType]||0)+1;if(n.elType==="container")containers++;if(n.elType==="section")sections++;});r.stats.containers=containers;r.stats.sections=sections;r.stats.widgetBreakdown=counts;r.stats.widgets=Object.values(counts).reduce((a,b)=>a+b,0);r.stats.htmlFallbacks=counts.html||0;}
    r.jsonText = JSON.stringify(r.template, null, 2);
    r.clipboard = { type: "elementor", siteurl: "", elements: r.template.content || [] };
    r.clipText = JSON.stringify(r.clipboard, null, 2);
    if (state.onSync) state.onSync(r);
  }

  /* ---------- Inspector controls ---------- */

  function inputWrap(label, inner, hint) {
    return `<div class="ctl"><label>${esc(label)}</label>${inner}${hint ? `<small>${esc(hint)}</small>` : ""}</div>`;
  }

  function textInput(name, value, extra) {
    extra = extra || {};
    if (extra.area) {
      return `<textarea class="ctl-in" data-k="${esc(name)}" rows="${extra.rows || 4}">${esc(value)}</textarea>`;
    }
    return `<input class="ctl-in" data-k="${esc(name)}" type="${extra.type || "text"}" value="${esc(value)}"/>`;
  }

  function selectInput(name, value, options) {
    const opts = options
      .map((o) => {
        const v = typeof o === "string" ? o : o.v;
        const l = typeof o === "string" ? o : o.l;
        return `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`;
      })
      .join("");
    return `<select class="ctl-in" data-k="${esc(name)}">${opts}</select>`;
  }

  function colorInput(name, value) {
    const v = value && /^#/.test(value) ? value : value || "#000000";
    const hex = v.length >= 7 ? v.slice(0, 7) : "#000000";
    return `<div class="ctl-color"><input type="color" data-k="${esc(name)}" value="${esc(hex)}"/><input class="ctl-in" data-k="${esc(name)}" type="text" value="${esc(value || "")}" placeholder="#000000"/></div>`;
  }

  function chooseInput(name, value, options) {
    return `<div class="ctl-choose" data-k="${esc(name)}">${options
      .map(
        (o) =>
          `<button type="button" class="ch${String(o.v) === String(value) ? " on" : ""}" data-v="${esc(o.v)}" title="${esc(o.l)}">${o.icon || esc(o.l)}</button>`
      )
      .join("")}</div>`;
  }

  function sizeInput(name, obj) {
    obj = obj || {};
    return `<div class="ctl-size" data-k="${esc(name)}">
      <input class="ctl-in" data-size="1" type="${obj.unit === "custom" ? "text" : "number"}" value="${esc(obj.size ?? "")}"/>
      <select data-unit="1">${["px", "em", "rem", "%", "vh", "vw", "fr", "custom"]
        .map((u) => `<option${(obj.unit || "px") === u ? " selected" : ""}>${u}</option>`)
        .join("")}</select>
    </div>`;
  }

  function boxInput(name, obj) {
    obj = obj || dim(0, 0, 0, 0, "px", true);
    const linked = obj.isLinked ? " on" : "";
    return `<div class="ctl-box" data-k="${esc(name)}">
      <div class="box-grid">
        <input data-side="top" type="${obj.unit === "custom" ? "text" : "number"}" value="${esc(obj.top || 0)}" title="بالا"/>
        <input data-side="right" type="${obj.unit === "custom" ? "text" : "number"}" value="${esc(obj.right || 0)}" title="راست"/>
        <input data-side="bottom" type="${obj.unit === "custom" ? "text" : "number"}" value="${esc(obj.bottom || 0)}" title="پایین"/>
        <input data-side="left" type="${obj.unit === "custom" ? "text" : "number"}" value="${esc(obj.left || 0)}" title="چپ"/>
        <button type="button" class="link-btn${linked}" data-link="1" title="پیوند ضلع‌ها">⧉</button>
      </div>
      <select data-unit="1">${["px", "em", "%", "rem", "custom"]
        .map((u) => `<option${(obj.unit || "px") === u ? " selected" : ""}>${u}</option>`)
        .join("")}</select>
    </div>`;
  }

  function typoInput(prefix, s) {
    return `<div class="ctl-typo" data-prefix="${esc(prefix)}">
      ${inputWrap("فونت", selectInput(prefix + "font_family", s[prefix + "font_family"] || "", ["", ...FONTS]))}
      ${inputWrap("اندازه", sizeInput(prefix + "font_size", s[prefix + "font_size"]))}
      ${inputWrap(
        "وزن",
        selectInput(prefix + "font_weight", s[prefix + "font_weight"] || "", [
          "",
          "100",
          "200",
          "300",
          "400",
          "500",
          "600",
          "700",
          "800",
          "900",
        ])
      )}
      ${inputWrap(
        "تبدیل حروف",
        selectInput(prefix + "text_transform", s[prefix + "text_transform"] || "", [
          { v: "", l: "پیش‌فرض" },
          { v: "none", l: "هیچ" },
          { v: "uppercase", l: "حروف بزرگ" },
          { v: "lowercase", l: "حروف کوچک" },
          { v: "capitalize", l: "حرف اول بزرگ" },
        ])
      )}
      ${inputWrap(
        "استایل",
        selectInput(prefix + "font_style", s[prefix + "font_style"] || "", [
          { v: "", l: "عادی" },
          { v: "italic", l: "ایتالیک" },
        ])
      )}
      ${inputWrap(
        "تزئین",
        selectInput(prefix + "text_decoration", s[prefix + "text_decoration"] || "", [
          { v: "", l: "هیچ" },
          { v: "underline", l: "زیرخط" },
          { v: "line-through", l: "خط‌خورده" },
        ])
      )}
      ${inputWrap("ارتفاع خط", sizeInput(prefix + "line_height", s[prefix + "line_height"]))}
      ${inputWrap("فاصله حروف", sizeInput(prefix + "letter_spacing", s[prefix + "letter_spacing"]))}
    </div>`;
  }

  function alignChoose(name, value) {
    return chooseInput(name, value || "", [
      { v: "left", l: "چپ", icon: "⟸" },
      { v: "center", l: "وسط", icon: "≡" },
      { v: "right", l: "راست", icon: "⟹" },
      { v: "justify", l: "کشیده", icon: "≣" },
    ]);
  }

  function contentFields(el) {
    const s = deviceSettings(el);
    const k = kindOf(el);
    if (k === "heading") {
      return (
        inputWrap("عنوان", textInput("title", s.title || "", { area: true, rows: 3 })) +
        inputWrap(
          "تگ HTML",
          selectInput("header_size", s.header_size || "h2", ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"])
        ) +
        inputWrap("پیوند", textInput("link.url", get(s, "link.url", ""))) +
        inputWrap(
          "باز شدن در تب جدید",
          selectInput("link.is_external", get(s, "link.is_external", ""), [
            { v: "", l: "خیر" },
            { v: "on", l: "بله" },
          ])
        )
      );
    }
    if (k === "text-editor") {
      return inputWrap("محتوا", textInput("editor", s.editor || "", { area: true, rows: 8 }));
    }
    if (k === "image") {
      return (
        inputWrap("آدرس تصویر", textInput("image.url", get(s, "image.url", ""))) +
        inputWrap("متن جایگزین (Alt)", textInput("image.alt", get(s, "image.alt", ""))) +
        inputWrap("کپشن", textInput("caption", s.caption || "")) +
        inputWrap("پیوند", textInput("link.url", get(s, "link.url", ""))) +
        inputWrap("تراز", alignChoose("align", s.align)) +
        inputWrap("عرض", sizeInput("width", s.width))
      );
    }
    if (k === "button") {
      return (
        inputWrap("متن دکمه", textInput("text", s.text || "")) +
        inputWrap("پیوند", textInput("link.url", get(s, "link.url", ""))) +
        inputWrap(
          "تب جدید",
          selectInput("link.is_external", get(s, "link.is_external", ""), [
            { v: "", l: "خیر" },
            { v: "on", l: "بله" },
          ])
        ) +
        inputWrap("تراز", alignChoose("align", s.align)) +
        inputWrap(
          "اندازه",
          selectInput("size", s.size || "sm", [
            { v: "xs", l: "XS" },
            { v: "sm", l: "کوچک" },
            { v: "md", l: "متوسط" },
            { v: "lg", l: "بزرگ" },
            { v: "xl", l: "XL" },
          ])
        )
      );
    }
    if (k === "html") {
      return inputWrap("کد HTML", textInput("html", s.html || "", { area: true, rows: 12 }));
    }
    if (k === "spacer") {
      return inputWrap("ارتفاع فاصله", sizeInput("space", s.space || { unit: "px", size: 50 }));
    }
    if (k === "divider") {
      return (
        inputWrap(
          "استایل خط",
          selectInput("style", s.style || "solid", ["solid", "double", "dotted", "dashed"])
        ) + inputWrap("تراز", alignChoose("align", s.align))
      );
    }
    if (k === "video") {
      return inputWrap("آدرس ویدیو", textInput(s.video_type === "hosted" ? "hosted_url.url" : s.video_type === "vimeo" ? "vimeo_url" : "youtube_url", s.video_type === "hosted" ? get(s, "hosted_url.url", "") : s.youtube_url || s.vimeo_url || ""));
    }
    if (k === "icon-list") {
      const items = s.icon_list || [];
      const rows = items
        .map(
          (it, i) => `<div class="list-row" data-i="${i}">
            <input class="ctl-in" data-list="text" value="${esc(it.text || "")}" placeholder="متن"/>
            <input class="ctl-in" data-list="url" value="${esc((it.link && it.link.url) || "")}" placeholder="لینک"/>
            <button type="button" class="mini danger" data-list-del="${i}">×</button>
          </div>`
        )
        .join("");
      return `<div class="ctl"><label>آیتم‌های فهرست</label><div id="listItems">${rows}</div><button type="button" class="btn btn-ghost" id="addListItem">+ آیتم</button></div>`;
    }
    if (k === "icon-box" || k === "image-box") {
      return (
        inputWrap("عنوان", textInput("title_text", s.title_text || "")) +
        inputWrap("توضیح", textInput("description_text", s.description_text || "", { area: true })) +
        (k === "image-box" ? inputWrap("تصویر", textInput("image.url", get(s, "image.url", ""))) : inputWrap("کلاس آیکون", textInput("selected_icon.value", get(s, "selected_icon.value", ""))))
      );
    }
    if (k === "icon") {
      return (
        inputWrap("کلاس آیکون", textInput("selected_icon.value", get(s, "selected_icon.value", ""))) +
        inputWrap("اندازه", sizeInput("size", s.size || { unit: "px", size: 40 })) +
        inputWrap("رنگ", colorInput("primary_color", s.primary_color || "")) +
        inputWrap("پیوند", textInput("link.url", get(s, "link.url", ""))) +
        inputWrap("تراز", alignChoose("align", s.align))
      );
    }
    const repeaters = { accordion: "tabs", toggle: "tabs", tabs: "tabs", "social-icons": "social_icon_list", "image-gallery": "gallery", "image-carousel": "carousel" };
    if (repeaters[k]) {
      const field = repeaters[k];
      return inputWrap("آیتم‌ها (JSON)", `<textarea class="ctl-in" rows="12" dir="ltr" data-json="${field}">${esc(JSON.stringify(s[field] || [], null, 2))}</textarea>`, "آرایه آیتم‌ها؛ تغییر معتبر بلافاصله در خروجی ثبت می‌شود.");
    }
    if (k === "progress") return inputWrap("عنوان", textInput("title", s.title || "")) + inputWrap("درصد", sizeInput("percent", s.percent || { unit: "%", size: 0 }));
    if (k === "star-rating" || k === "rating") return inputWrap("امتیاز ۰ تا ۵", textInput("rating", s.rating || 0, { type: "number" }));
    if (k === "audio") return inputWrap("لینک", textInput("link", s.link || ""));
    if (k === "shortcode") return inputWrap("شورت‌کد", textInput("shortcode", s.shortcode || ""));
    if (k === "menu-anchor") return inputWrap("شناسه", textInput("anchor", s.anchor || ""));
    if (k === "counter") {
      return inputWrap("عدد", textInput("ending_number", s.ending_number || "0")) + inputWrap("عنوان", textInput("title", s.title || ""));
    }
    if (k === "alert") {
      return inputWrap("عنوان", textInput("alert_title", s.alert_title || "")) + inputWrap("متن", textInput("alert_description", s.alert_description || "", { area: true }));
    }
    if (k === "testimonial") {
      return inputWrap("نظر", textInput("testimonial_content", s.testimonial_content || "", { area: true })) + inputWrap("نام", textInput("testimonial_name", s.testimonial_name || ""));
    }
    if (k === "google_maps") {
      return inputWrap("آدرس / محل", textInput("address", s.address || ""));
    }
    if (k === "container" || k === "section") {
      return (
        inputWrap(
          "عرض محتوا",
          selectInput("content_width", s.content_width || "full", [
            { v: "full", l: "تمام‌عرض" },
            { v: "boxed", l: "باکس‌شده" },
          ])
        ) +
        inputWrap("عرض باکس", sizeInput("boxed_width", s.boxed_width || { unit: "px", size: 1140 })) +
        inputWrap(
          "تگ HTML",
          selectInput("html_tag", s.html_tag || "div", ["div", "section", "header", "footer", "main", "article", "aside", "nav"])
        ) +
        (k === "section"
          ? inputWrap(
              "چیدمان سکشن",
              selectInput("layout", s.layout || "boxed", [
                { v: "boxed", l: "باکس" },
                { v: "full_width", l: "تمام‌عرض" },
              ])
            )
          : "")
      );
    }
    if (k === "column") {
      return inputWrap("عرض ستون (%)", textInput("_column_size", s._column_size ?? 50, { type: "number" }));
    }
    return `<p class="muted">این المان فیلد محتوای اختصاصی ندارد.</p>`;
  }

  function styleFields(el) {
    const s = deviceSettings(el);
    const k = kindOf(el);
    let html = "";
    if (k === "heading") {
      html +=
        inputWrap("تراز", alignChoose("align", s.align)) +
        inputWrap("رنگ متن", colorInput("title_color", s.title_color || "")) +
        inputWrap("تایپوگرافی", typoInput("typography_", s));
    } else if (k === "text-editor") {
      html +=
        inputWrap("تراز", alignChoose("align", s.align)) +
        inputWrap("رنگ متن", colorInput("text_color", s.text_color || "")) +
        inputWrap("تایپوگرافی", typoInput("typography_", s));
    } else if (k === "button") {
      html +=
        inputWrap("رنگ متن", colorInput("button_text_color", s.button_text_color || "#ffffff")) +
        inputWrap("رنگ پس‌زمینه", colorInput("background_color", s.background_color || "#61ce70")) +
        inputWrap("رنگ متن هاور", colorInput("hover_color", s.hover_color || "")) +
        inputWrap("پس‌زمینه هاور", colorInput("button_background_hover_color", s.button_background_hover_color || "")) +
        inputWrap("تایپوگرافی", typoInput("typography_", s)) +
        inputWrap("گردی گوشه", boxInput("border_radius", s.border_radius)) +
        inputWrap("پدینگ دکمه", boxInput("button_text_padding", s.button_text_padding));
    } else if (k === "divider") {
      html +=
        inputWrap("رنگ", colorInput("color", s.color || "#ccc")) +
        inputWrap("ضخامت", sizeInput("weight", s.weight || { unit: "px", size: 1 })) +
        inputWrap("عرض", sizeInput("width", s.width || { unit: "%", size: 100 }));
    } else if (k === "image") {
      html +=
        inputWrap("تراز", alignChoose("align", s.align)) +
        inputWrap("گردی گوشه", boxInput("border_radius", s.border_radius)) +
        inputWrap("شفافیت", textInput("_opacity", s._opacity ?? 1, { type: "number" }));
    } else if (k === "container" || k === "section" || k === "column") {
      html +=
        inputWrap("نوع چیدمان", selectInput("container_type", s.container_type || "flex", ["flex", "grid"])) +
        inputWrap("تعداد ستون‌های گرید", sizeInput("grid_columns_grid", s.grid_columns_grid || { unit: "fr", size: 3 })) +
        inputWrap(
          "جهت فلکس",
          selectInput("flex_direction", s.flex_direction || "column", [
            { v: "column", l: "ستونی" },
            { v: "row", l: "ردیفی" },
            { v: "column-reverse", l: "ستون معکوس" },
            { v: "row-reverse", l: "ردیف معکوس" },
          ])
        ) +
        inputWrap(
          "تراز افقی (Justify)",
          selectInput("flex_justify_content", s.flex_justify_content || "", [
            { v: "", l: "پیش‌فرض" },
            { v: "flex-start", l: "شروع" },
            { v: "center", l: "وسط" },
            { v: "flex-end", l: "پایان" },
            { v: "space-between", l: "فاصله بین" },
            { v: "space-around", l: "اطراف" },
            { v: "space-evenly", l: "یکسان" },
          ])
        ) +
        inputWrap(
          "تراز عمودی (Align)",
          selectInput("flex_align_items", s.flex_align_items || "", [
            { v: "", l: "پیش‌فرض" },
            { v: "flex-start", l: "شروع" },
            { v: "center", l: "وسط" },
            { v: "flex-end", l: "پایان" },
            { v: "stretch", l: "کشیده" },
          ])
        ) +
        inputWrap(
          "شکستن خط",
          selectInput("flex_wrap", s.flex_wrap || "nowrap", [
            { v: "nowrap", l: "بدون شکست" },
            { v: "wrap", l: "شکست" },
          ])
        ) +
        inputWrap("فاصله بین آیتم‌ها (Gap)", sizeInput("flex_gap", s.flex_gap || { unit: "px", size: 20 })) +
        inputWrap("حداقل ارتفاع", sizeInput("min_height", s.min_height)) +
        inputWrap("رنگ پس‌زمینه", colorInput("background_color", s.background_color || "")) +
        inputWrap("تصویر پس‌زمینه", textInput("background_image.url", get(s, "background_image.url", ""))) +
        inputWrap(
          "اندازه پس‌زمینه",
          selectInput("background_size", s.background_size || "cover", ["cover", "contain", "auto"])
        ) +
        inputWrap("گردی گوشه", boxInput("border_radius", s.border_radius));
    } else {
      html += inputWrap("رنگ متن", colorInput("text_color", s.text_color || s.title_color || ""));
    }
    const borderPrefix = el.elType === "widget" && !["button", "image"].includes(k) ? "_" : "";
    html +=
      inputWrap(
        "نوع حاشیه",
        selectInput(borderPrefix + "border_border", s[borderPrefix + "border_border"] || "", [
          { v: "", l: "هیچ" },
          { v: "solid", l: "solid" },
          { v: "dashed", l: "dashed" },
          { v: "dotted", l: "dotted" },
          { v: "double", l: "double" },
        ])
      ) +
      inputWrap("ضخامت حاشیه", boxInput(borderPrefix + "border_width", s[borderPrefix + "border_width"])) +
      inputWrap("رنگ حاشیه", colorInput(borderPrefix + "border_color", s[borderPrefix + "border_color"] || ""));
    return html;
  }

  function advancedFields(el) {
    const s = deviceSettings(el);
    const isWidget = el.elType === "widget";
    const padKey = isWidget ? "_padding" : "padding";
    const marKey = isWidget ? "_margin" : "margin";
    return (
      inputWrap("حاشیه خارجی (Margin)", boxInput(marKey, s[marKey])) +
      inputWrap("حاشیه داخلی (Padding)", boxInput(padKey, s[padKey])) +
      inputWrap("Z-Index", textInput("_z_index", s._z_index || "", { type: "number" })) +
      inputWrap("CSS ID", textInput("_element_id", s._element_id || "")) +
      inputWrap("کلاس‌های CSS", textInput("_css_classes", s._css_classes || ""), "کلاس‌های اصلی HTML اینجا حفظ می‌شوند") +
      inputWrap(
        "مخفی در دسکتاپ",
        selectInput("hide_desktop", s.hide_desktop || "", [
          { v: "", l: "خیر" },
          { v: "hidden-desktop", l: "بله" },
        ])
      ) +
      inputWrap(
        "مخفی در تبلت",
        selectInput("hide_tablet", s.hide_tablet || "", [
          { v: "", l: "خیر" },
          { v: "hidden-tablet", l: "بله" },
        ])
      ) +
      inputWrap(
        "مخفی در موبایل",
        selectInput("hide_mobile", s.hide_mobile || "", [
          { v: "", l: "خیر" },
          { v: "hidden-phone", l: "بله" },
        ])
      ) +
      inputWrap("CSS سفارشی", textInput("custom_css", s.custom_css || "", { area: true, rows: 5 }), "از selector به‌جای المان استفاده کنید")
    );
  }

  function bindControls(root, el) {
    for(const event of ["input","change","click"])root.addEventListener(event,e=>{const n=e.target.closest("[data-k],[data-json],[data-list]");if(n&&(event!=="click"||e.target.closest("button"))){checkpoint();releaseAppearance(n.dataset.k);}},true);
    const s = ensureSettings(el);

    root.querySelectorAll("[data-json]").forEach(node => node.addEventListener("input", () => {
      try {
        const value = JSON.parse(node.value);
        if (!Array.isArray(value) || value.some(v => !v || typeof v !== "object")) throw new Error();
        s[node.dataset.json] = value;
        node.setCustomValidity(""); node.style.borderColor = "";
        changed();
      } catch (_) { node.setCustomValidity("آرایه JSON معتبر وارد کنید"); node.style.borderColor = "#f66"; }
    }));

    root.querySelectorAll(".ctl-choose").forEach((box) => {
      box.querySelectorAll(".ch").forEach((btn) => {
        btn.addEventListener("click", () => {
          const k = box.getAttribute("data-k");
          set(s, k, btn.getAttribute("data-v"));
          changed();
        });
      });
    });

    root.querySelectorAll("input[data-k], textarea[data-k], select[data-k]").forEach((node) => {
      if (node.closest(".ctl-color, .ctl-size, .ctl-box, .ctl-choose")) return;
      const k = node.getAttribute("data-k");
      const ev = node.tagName === "SELECT" ? "change" : "input";
      node.addEventListener(ev, () => {
        let val = node.value;
        if (node.type === "number" && val !== "") val = Number(val);
        if (k === "_column_size") s._column_size = Number(val);
        else set(s, k, val);
        if (["container_type","flex_direction","flex_wrap","flex_justify_content","flex_align_items"].includes(k)) state.editedFlow.add(el.id);
        if (k === "selected_icon.value") {
          s.selected_icon.library = !val ? "" : /\bfab\b/.test(val) ? "fa-brands" : /\bfar\b/.test(val) ? "fa-regular" : "fa-solid";
        }
        if (k.indexOf("typography_") === 0) s.typography_typography = "custom";
        if (k === "background_color" && val) s.background_background = "classic";
        if (k === "background_image.url" && val) s.background_background = "classic";
        changed();
      });
    });

    root.querySelectorAll(".ctl-color").forEach((box) => {
      const inputs = box.querySelectorAll("input");
      inputs.forEach((inp) => {
        inp.addEventListener("input", () => {
          const k = inp.getAttribute("data-k");
          set(s, k, inp.value);
          if (k === "background_color") s.background_background = "classic";
          changed();
        });
      });
    });

    root.querySelectorAll(".ctl-size").forEach((box) => {
      const k = box.getAttribute("data-k");
      const num = box.querySelector("[data-size]");
      const unit = box.querySelector("[data-unit]");
      const apply = () => {
        const size = num.value === "" ? "" : unit.value === "custom" ? num.value : Number(num.value);
        if (k === "flex_gap") {
          s.flex_gap = { unit: unit.value, size, column: String(size), row: String(size), isLinked: true };
          if (s.container_type === "grid") s.grid_gaps = { ...s.flex_gap };
        } else {
          set(s, k, { unit: unit.value, size });
        }
        if (k.indexOf("typography_") === 0) s.typography_typography = "custom";
        changed();
      };
      num.addEventListener("input", apply);
      unit.addEventListener("change", () => { num.type = unit.value === "custom" ? "text" : "number"; apply(); });
    });

    root.querySelectorAll(".ctl-box").forEach((box) => {
      const k = box.getAttribute("data-k");
      const apply = () => {
        const linked = box.querySelector("[data-link]").classList.contains("on");
        const unit = box.querySelector("[data-unit]").value;
        const getSide = (side) => box.querySelector(`[data-side="${side}"]`).value || "0";
        let top = getSide("top"),
          right = getSide("right"),
          bottom = getSide("bottom"),
          left = getSide("left");
        if (linked) right = bottom = left = top;
        set(s, k, dim(top, right, bottom, left, unit, linked));
        changed();
      };
      box.querySelectorAll("input,select").forEach((n) => n.addEventListener("input", apply));
      box.querySelector("[data-unit]").addEventListener("change", () => {
        box.querySelectorAll("[data-side]").forEach(n => { n.type = box.querySelector("[data-unit]").value === "custom" ? "text" : "number"; });
        apply();
      });
      box.querySelector("[data-link]").addEventListener("click", (e) => {
        e.currentTarget.classList.toggle("on");
        apply();
      });
    });

    const addBtn = root.querySelector("#addListItem");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        s.icon_list = s.icon_list || [];
        s.icon_list.push({ _id: Math.random().toString(16).slice(2, 10), text: "آیتم", selected_icon: { value: "fas fa-check", library: "fa-solid" } });
        changed(true);
      });
      root.querySelectorAll("[data-list-del]").forEach((b) => {
        b.addEventListener("click", () => {
          s.icon_list.splice(Number(b.getAttribute("data-list-del")), 1);
          changed(true);
        });
      });
      root.querySelectorAll(".list-row").forEach((row) => {
        const i = Number(row.getAttribute("data-i"));
        row.querySelector('[data-list="text"]').addEventListener("input", (e) => {
          s.icon_list[i].text = e.target.value;
          changed();
        });
        row.querySelector('[data-list="url"]').addEventListener("input", (e) => {
          s.icon_list[i].link = { url: e.target.value };
          changed();
        });
      });
    }
  }

  let paintTimer = null;
  function changed(rebuildInspector) {
    const r = current();
    if (!r) return;
    if (r.template.page_settings && r.template.page_settings.background_color) {
      r.template.page_settings.background_background = "classic";
    }
    syncResult(r);
    const run = () => {
      paintFrame(true);
      paintTree();
      if (rebuildInspector) paintInspector();
    };
    if (rebuildInspector) {
      run();
      return;
    }
    clearTimeout(paintTimer);
    paintTimer = setTimeout(run, 50);
  }

  function paintInspector() {
    const box = $("#inspBody");
    const head = $("#inspHead");
    if (!box) return;
    const r = current();
    if (!r) {
      box.innerHTML = `<div class="empty"><p>ابتدا تبدیل کنید.</p></div>`;
      return;
    }
    if (!state.selectedId) {
      head.innerHTML = `<strong>برگه</strong><span>${esc(r.title || "")}</span>`;
      const ps = r.template.page_settings && !Array.isArray(r.template.page_settings) ? r.template.page_settings : (r.template.page_settings = {});
      box.innerHTML =
        `<div class="insp-tabs-mini"><span class="on">برگه</span></div>` +
        inputWrap("عنوان قالب", `<input class="ctl-in" id="pageTitle" value="${esc(r.template.title || "")}"/>`) +
        inputWrap("رنگ پس‌زمینه صفحه", colorInput("page_bg", ps.background_color || ""));
      $("#pageTitle").addEventListener("input", (e) => {
        r.template.title = e.target.value;
        r.title = e.target.value;
        syncResult(r);
      });
      box.querySelectorAll(".ctl-color input").forEach((inp) => {
        inp.addEventListener("input", () => {
          ps.background_color = inp.value;
          ps.background_background = "classic";
          changed();
        });
      });
      return;
    }
    const hit = findEl(r.template.content, state.selectedId);
    if (!hit) {
      box.innerHTML = `<p class="muted">المان پیدا نشد.</p>`;
      return;
    }
    const el = hit.el;
    const k = kindOf(el);
    head.innerHTML = `<strong>${esc(LABELS[k] || k)}</strong><span>#${esc(el.id)}</span>
      <div class="insp-actions">
        <button type="button" class="mini" id="btnUp" title="جابه‌جایی بالا">↑</button>
        <button type="button" class="mini" id="btnDown" title="جابه‌جایی پایین">↓</button>
        <button type="button" class="mini danger" id="btnDel">حذف</button>
      </div>`;
    const tabs = ["content", "style", "advanced"];
    const tabNames = { content: "محتوا", style: "استایل", advanced: "پیشرفته" };
    const tabBar = `<div class="insp-tabs">${tabs
      .map((t) => `<button type="button" class="itab${state.itab === t ? " on" : ""}" data-itab="${t}">${tabNames[t]}</button>`)
      .join("")}</div>`;
    let body = "";
    if (state.itab === "content") body = contentFields(el);
    else if (state.itab === "style") body = styleFields(el);
    else body = advancedFields(el);
    const typeUI=el.elType==="widget" && global.H2EWidgets ? `<div class="widget-type-box"><label>تغییر نوع ویجت<select id="widgetTypeTarget">${H2EWidgets.types.map(([v,l])=>`<option value="${v}" ${v===el.widgetType?"selected":""}>${esc(l)}</option>`).join("")}</select></label><button type="button" id="applyWidgetType" class="btn btn-primary">تبدیل نوع ویجت</button><button type="button" id="undoWidgetType" class="btn btn-ghost" ${state.typeHistory.some(x=>x.result===r)?"":"disabled"}>بازگشت تغییر نوع</button><small>محتوای قبلی با بازگشت تغییر قابل بازیابی است. آیکن همیشه خالی ساخته می‌شود.</small><p id="widgetTypeMessage"></p></div>`:"";
    const toolsUI='<div class="edit-actions"><label>اندازه در '+state.device+' (px)</label><div class="size-row"><input id="editWidth" type="number" min="20" max="4000" placeholder="عرض" aria-label="عرض المان"><input id="editHeight" type="number" min="20" max="4000" placeholder="ارتفاع" aria-label="ارتفاع المان"></div><button class="btn btn-ghost" id="applyElementSize">اعمال اندازه</button><button class="btn btn-ghost" id="undoElementAction">بازگشت آخرین تغییر</button><small>⠿ را برای ترتیب هم‌سطح‌ها و ↘ را برای اندازه بکشید. فقط اندازهٔ نمایش فعلی تغییر می‌کند. والد بلوکی در این اندازه به فلکس ستونی تبدیل می‌شود.</small></div>';
    box.innerHTML = toolsUI + typeUI + tabBar + `<div class="insp-fields">${body}</div>`;
    const rect=previewRoot()?.querySelector('[data-id="'+el.id+'"]')?.getBoundingClientRect();
    if(rect){$('#editWidth').value=Math.round(rect.width);$('#editHeight').value=Math.round(rect.height);}
    $('#applyElementSize').onclick=()=>resizeElement(el.id,Number($('#editWidth').value),Number($('#editHeight').value));
    $('#undoElementAction').onclick=undoAction;
    if($("#applyWidgetType")) $("#applyWidgetType").onclick=async()=>{
      const target=$("#widgetTypeTarget").value;if(target===el.widgetType)return;
      try{
        $('#applyWidgetType').disabled=true;
        const styles=await captureAppearance(el);
        const replacement=H2EWidgets.retype(el,target);
        state.typeHistory.push({result:r,id:el.id,node:JSON.parse(JSON.stringify(el)),css:r.css});
        if(state.typeHistory.length>40)state.typeHistory.shift();
        checkpoint();hit.list[hit.index]=replacement;
        if(target==="button"&&!r.css.includes("/* H2E_RETYPE */"))r.css+='\n/* H2E_RETYPE */\n.elementor .h2e-retyped-button{padding:0!important;background:none!important;border:0!important;box-shadow:none!important}\n';
        applyAppearance(replacement,styles);state.itab="content";changed(true);
      }catch(e){$("#widgetTypeMessage").textContent=e.message;if($("#applyWidgetType"))$("#applyWidgetType").disabled=false;}
    };
    if($("#undoWidgetType")) $("#undoWidgetType").onclick=()=>{
      const index=state.typeHistory.map(x=>x.result).lastIndexOf(r);if(index<0)return;
      const entry=state.typeHistory.splice(index,1)[0], old=findEl(r.template.content,entry.id);
      if(old){old.list[old.index]=entry.node;r.css=entry.css;state.selectedId=entry.id;changed(true);}
    };
    box.querySelectorAll("[data-itab]").forEach((b) => {
      b.addEventListener("click", () => {
        state.itab = b.getAttribute("data-itab");
        paintInspector();
      });
    });
    bindControls(box, el);
    const del = $("#btnDel");
    if (del)
      del.addEventListener("click", () => {
        checkpoint();hit.list.splice(hit.index, 1);
        state.selectedId = hit.parent ? hit.parent.id : null;
        changed(true);
      });
    const move = (dir) => {const nodes=ordered(hit.list);const j=nodes.indexOf(el)+dir;if(j>=0&&j<nodes.length)moveElement(el.id,nodes[j].id);};
    if ($("#btnUp")) $("#btnUp").addEventListener("click", () => move(-1));
    if ($("#btnDown")) $("#btnDown").addEventListener("click", () => move(1));
  }

  function paintTree() {
    const host = $("#navTree");
    if (!host) return;
    const r = current();
    if (!r) {
      host.innerHTML = "";
      return;
    }
    function node(el, depth) {
      const k = kindOf(el);
      const on = el.id === state.selectedId ? " on" : "";
      const name = LABELS[k] || k;
      const cls = (el.settings && el.settings._css_classes) || "";
      let html = `<button type="button" class="tree-item${on}" data-id="${esc(el.id)}" style="padding-right:${12 + depth * 14}px">
        <i></i><span>${esc(name)}</span>${cls ? `<em>${esc(cls.split(" ")[0])}</em>` : ""}
      </button>`;
      (el.elements || []).forEach((ch) => {
        html += node(ch, depth + 1);
      });
      return html;
    }
    host.innerHTML =
      `<button type="button" class="tree-item${state.selectedId ? "" : " on"}" data-id="">برگه</button>` +
      (r.template.content || []).map((el) => node(el, 0)).join("");
    host.querySelectorAll("[data-id]").forEach((b) => {
      b.addEventListener("click", () => select(b.getAttribute("data-id") || null));
    });
  }


  function previewRoot() {
    const stage = document.getElementById("liveStage");
    return document.getElementById("liveDocument")?.contentDocument || null;
  }

  function select(id) {
    state.selectedId = id || null;
    const root = previewRoot();
    try {
      if (root) {
        root.querySelectorAll(".is-selected").forEach((n) => n.classList.remove("is-selected"));
        if (id) {
          const n = root.querySelector('[data-id="' + id + '"]');
          if (n) {
            n.classList.add("is-selected");
            n.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }
    } catch (_) {}
    root?.h2ePositionTools?.();
    paintTree();
    paintInspector();
  }

  function ensureStage() {
    const stage=document.getElementById("liveStage");if(!stage)return null;
    if(!document.getElementById("liveDocument")) stage.innerHTML='<iframe id="liveDocument" title="بوم واقعی خروجی المنتور" sandbox="allow-same-origin"></iframe>';
    return stage;
  }
  function bindCanvas(doc) {
    doc.addEventListener("click", e=>{
      if(e.target.closest("#h2e-canvas-tools"))return;
      e.preventDefault();
      const panel=e.target.closest("[data-panel]");
      if(panel){const group=panel.closest(".h2e-panels");const body=group.querySelector('[data-panel-body="'+panel.dataset.panel+'"]');const opening=body.hidden;if(group.dataset.panelType!=="toggle")group.querySelectorAll('[data-panel-body]').forEach(n=>n.hidden=true);body.hidden=!opening;}
      const n=e.target.closest("[data-id]");select(n?n.dataset.id:null);
    });
    doc.addEventListener("submit",e=>e.preventDefault());
  }
  function paintFrame() {
    const r=current(),stage=ensureStage();if(!r||!stage)return;
    const frame=document.getElementById("liveDocument");
    const content=r.template.content||[];
    const body=safePreview(content.map(renderElement).join(""));
    const userCss=(String(r.css||"").replace(/\/\* H2E_(?:DEVICE|SOURCE)_START \*\/[\s\S]*?\/\* H2E_(?:DEVICE|SOURCE)_END \*\//g,"")+((r.previewCss||{})[state.device]||"")).replace(/<\/style/gi,"<\\/style");
    const old=frame.contentDocument?.scrollingElement?.scrollTop||0;
    frame.onload=()=>{
      const doc=frame.contentDocument;if(!doc)return;bindCanvas(doc);
      if(state.selectedId)doc.querySelector('[data-id="'+state.selectedId+'"]')?.classList.add("is-selected");
      if(doc.scrollingElement)doc.scrollingElement.scrollTop=old;
      H2ECanvas.bind(doc,{selector:'[data-id]',node:()=>doc.querySelector('[data-id="'+state.selectedId+'"]'),move:(n,t)=>moveElement(n.dataset.id,t.dataset.id),resize:(n,w,h)=>resizeElement(n.dataset.id,w,h)});
    };
    applyDevice();
    frame.srcdoc='<!doctype html><html lang="fa" dir="'+(r.rtl?'rtl':'ltr')+'"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; form-action \'none\'; base-uri \'none\'"><style>'+fontFaces()+baseFrameCss()+collectExtraCss(content)+userCss+'\nhtml,body{margin:0!important;padding:0!important;border:0!important;display:block!important;width:auto!important;max-width:none!important;min-height:0!important} .elementor-widget>.elementor-widget-container{padding:0!important;margin:0!important;border:0!important;background:none!important}</style></head><body><div class="elementor elementor-page">'+body+'</div></body></html>';
  }

  function applyDevice() {
    const stage = document.getElementById("liveStage");
    if (!stage) return;
    const map = { desktop: "1200px", tablet: "768px", mobile: "375px" };
    const w = map[state.device] || "100%";
    stage.style.width = w;
    stage.style.maxWidth = "none";
    $$dev().forEach((b) => b.classList.toggle("on", b.getAttribute("data-device") === state.device));
  }

  function $$dev() {
    return Array.from(document.querySelectorAll("[data-device]"));
  }

  function bindShell() {
    if($("#undoCanvasAction"))$("#undoCanvasAction").onclick=undoAction;
    const pick = $("#pagePick");
    if (pick) {
      pick.onchange = (e) => {
        state.index = Number(e.target.value) || 0;
        state.selectedId = null;
        refresh();
      };
    }
    $$dev().forEach((b) => {
      b.onclick = () => {
        state.device = b.getAttribute("data-device");
        paintFrame();
        paintInspector();
      };
    });
  }

  function shellHtml() {
    return `
      <div class="live-shell">
        <aside class="live-insp">
          <div id="inspHead" class="insp-head"><strong>تنظیمات المان</strong></div>
          <div id="inspBody" class="insp-body"></div>
        </aside>
        <section class="live-canvas">
          <div class="live-toolbar">
            <select id="pagePick" class="ctl-in" style="max-width:180px"></select>
            <div class="dev-switch">
              <button type="button" data-device="desktop" class="on" title="دسکتاپ">🖥</button>
              <button type="button" data-device="tablet" title="تبلت">📟</button>
              <button type="button" data-device="mobile" title="موبایل">📱</button>
            </div>
            <button type="button" id="undoCanvasAction" class="mini">↶ بازگشت</button><span class="live-hint">روی المان کلیک کنید تا تنظیمات محتوا / استایل / پیشرفته باز شود</span>
          </div>
          <div class="live-stage" tabindex="0" aria-label="صفحه پیش‌نمایش؛ قابل اسکرول">
            <div id="liveStage" class="live-stage-inner" title="پیش‌نمایش خروجی"></div>
          </div>
        </section>
        <aside class="live-nav">
          <div class="live-nav-h">ناوبری المان‌ها</div>
          <div id="navTree" class="nav-tree"></div>
        </aside>
      </div>`;
  }

  function mount(sel) {
    state.host = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!state.host) return;
    state.host.innerHTML = shellHtml();
    bindShell();
  }

  function fillPagePick() {
    const sel = $("#pagePick");
    if (!sel) return;
    sel.innerHTML = state.results
      .map((r, i) => `<option value="${i}"${i === state.index ? " selected" : ""}>${esc(r.title || r.sourceName || "برگه")}</option>`)
      .join("");
    sel.style.display = state.results.length > 1 ? "" : "none";
  }

  function refresh() {
    if (!state.host) return;
    if (!state.results.length) {
      state.host.innerHTML = `<div class="empty"><h3>پیش‌نمایش خروجی</h3><p>بعد از تبدیل، پیش‌نمایش زنده و تنظیمات المان‌ها اینجا می‌آید.</p></div>`;
      return;
    }
    if (!$("#liveStage")) {
      mount(state.host);
    }
    fillPagePick();
    paintFrame();
    paintTree();
    paintInspector();
  }

  const appearanceProperties=['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','text-align','text-decoration','text-transform','text-shadow','background-color','background-image','background-size','background-position','background-repeat','background-clip','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius','padding-top','padding-right','padding-bottom','padding-left','box-shadow','opacity','filter','overflow','box-sizing'];
  function visualSelector(type){return ({button:'.elementor-button',heading:'.elementor-heading-title','text-editor':'.elementor-text-editor',image:'.elementor-image img',icon:'.elementor-icon'})[type]||'.elementor-widget-container > :first-child';}
  async function captureAppearance(el){
    const r=current(),originalDevice=state.device,tasks=[];
    try{for(const [device,width] of [['desktop',1200],['tablet',768],['mobile',375]]){
      state.device=device;const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.style.cssText='position:fixed;left:-30000px;top:0;height:1000px;border:0;visibility:hidden;width:'+width+'px';
      const css=(r.css||'').replace(/\/\* H2E_(?:SOURCE|DEVICE)_START \*\/[\s\S]*?\/\* H2E_(?:SOURCE|DEVICE)_END \*\//g,'')+((r.previewCss||{})[device]||'');
      const html=safePreview((r.template.content||[]).map(renderElement).join(''));
      const task=new Promise((resolve,reject)=>{let timer=setTimeout(()=>{frame.remove();reject(new Error('اندازه‌گیری ظاهر زمان‌بر شد؛ دوباره امتحان کنید.'));},7000);frame.onload=async()=>{const d=frame.contentDocument;if(!d?.querySelector('[data-id]'))return;try{await Promise.race([d.fonts.ready,new Promise(done=>setTimeout(done,700))]);const node=d.querySelector('[data-id="'+el.id+'"]');if(!node)throw new Error('المان قابل اندازه‌گیری نیست');let inner=node.querySelector(visualSelector(el.widgetType))||node;const outerStyle=d.defaultView.getComputedStyle(node),innerStyle=d.defaultView.getComputedStyle(inner),box=node.getBoundingClientRect();const values=style=>Object.fromEntries(appearanceProperties.map(p=>[p,style.getPropertyValue(p)]));const outer=values(outerStyle),inside=values(innerStyle);if(inner===node)for(const p of ['background-color','background-image','box-shadow'])inside[p]=p==='background-color'?'transparent':'none';for(const p of ['margin-top','margin-right','margin-bottom','margin-left','position','top','right','bottom','left','z-index','transform','transform-origin','flex-grow','flex-shrink','flex-basis','align-self'])outer[p]=outerStyle.getPropertyValue(p);outer.width=node.style.width||outerStyle.width;outer['min-height']=outerStyle.height;resolve({device,outer,inside});}catch(e){reject(e)}finally{clearTimeout(timer);frame.remove();}};});
      frame.srcdoc='<!doctype html><html dir="'+(r.rtl?'rtl':'ltr')+'"><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\';object-src \'none\';form-action \'none\'"><style>'+fontFaces()+baseFrameCss()+collectExtraCss(r.template.content)+(css.replace(/<\/style/gi,'<\\/style'))+'html,body{margin:0!important;padding:0!important;border:0!important;display:block!important;width:auto!important;min-height:0!important}.elementor-widget>.elementor-widget-container{padding:0!important;margin:0!important;border:0!important;background:none!important}</style></head><body><div class="elementor elementor-page">'+html+'</div></body></html>';document.body.appendChild(frame);tasks.push(task);
    }}finally{state.device=originalDevice;}
    const result=await Promise.all(tasks);if(current()!==r||findEl(r.template.content,el.id)?.el!==el)throw new Error('انتخاب تغییر کرده است؛ دوباره تبدیل کنید.');return result;
  }
  function applyAppearance(el,snapshots){const r=current(),start='/* H2E_APPEAR_'+el.id+'_START */',end='/* H2E_APPEAR_'+el.id+'_END */';r.css+='\n'+start+'\n';for(const x of snapshots){scopedCSS(el.id,x.outer,x.device);const target=el.widgetType==='text-editor'?'.elementor-widget-container':visualSelector(el.widgetType);const inner={...x.inside,margin:'0','box-sizing':'border-box'};if(el.widgetType==='button'){inner.width='100%';inner.display='block';}scopedCSS(el.id,inner,x.device,' '+target);}r.css+='\n'+end+'\n';}
  function releaseAppearance(key){
    const k=String(key||'').replace(/_(mobile|tablet)$/,'').split('.')[0];let props=[];
    if(/padding|margin/.test(k))props=['top','right','bottom','left'].map(x=>(k.includes('padding')?'padding':'margin')+'-'+x);
    else if(/border.*radius/.test(k))props=['top-left','top-right','bottom-right','bottom-left'].map(x=>'border-'+x+'-radius');
    else if(/border/.test(k))props=['top','right','bottom','left'].map(x=>'border-'+x+'-'+(k.includes('color')?'color':k.includes('width')?'width':'style'));
    else if(k.includes('background'))props=[k.includes('image')?'background-image':'background-color'];
    else if(k.includes('color'))props=['color'];
    else if(k.includes('font_size'))props=['font-size'];else if(k.includes('font_family'))props=['font-family'];else if(k.includes('font_weight'))props=['font-weight'];else if(k.includes('line_height'))props=['line-height'];else if(k.includes('letter_spacing'))props=['letter-spacing'];else if(k.includes('align'))props=['text-align'];else if(k.includes('width'))props=['width'];
    if(!props.length||!current())return;
    const pattern=new RegExp('/\\* H2E_APPEAR_'+state.selectedId+'_START \\*/[\\s\\S]*?/\\* H2E_APPEAR_'+state.selectedId+'_END \\*/','g');current().css=current().css.replace(pattern,block=>block.replace(/@media ([^{]+)\{([^{}]+\{[^{}]*\})\}/g,(full,media,rule)=>{if(media.trim()!==H2ECanvas.media[state.device])return full;for(const p of props)rule=rule.replace(new RegExp('([;{])'+p+':[^;}]*[;]?','g'),'$1');return '@media '+media+'{'+rule+'}';}));
  }
  const copy=x=>JSON.parse(JSON.stringify(x));
  function checkpoint(){const r=current();state.actions.push({r,content:copy(r.template.content),css:r.css,id:state.selectedId});if(state.actions.length>30)state.actions.shift();}
  function undoAction(){const i=state.actions.map(x=>x.r).lastIndexOf(current());if(i<0)return;const old=state.actions.splice(i,1)[0];old.r.template.content=old.content;old.r.css=old.css;state.selectedId=old.id;state.typeHistory=[];changed(true);}
  function selector(id){return '.elementor :is(#h2e-edit-a#h2e-edit-b#h2e-edit-c,.elementor-element-'+id+')';}
  function scopedCSS(id,props,dev=state.device,tail=''){const rule=selector(id)+tail+'{'+Object.entries(props).map(([k,v])=>k+':'+v+'!important').join(';')+'}';current().css+='\n@media '+H2ECanvas.media[dev]+'{'+rule+'}';}
  function resizeElement(id,w,h){if(!Number.isFinite(w)||!Number.isFinite(h)||w<20||h<20||w>4000||h>4000)return;const el=findEl(current().template.content,id)?.el;if(!el)return;checkpoint();const s=deviceSettings(el);s._element_width='initial';s._element_custom_width={unit:'px',size:w};if(el.elType==='container')s.min_height={unit:'px',size:h};scopedCSS(id,{width:w+'px',height:h+'px','min-height':h+'px','box-sizing':'border-box','max-width':'none','min-width':'0','flex-shrink':'0'});changed(true);}
  function ordered(list){const doc=previewRoot();return [...list].sort((a,b)=>{const A=doc?.querySelector('[data-id="'+a.id+'"]'),B=doc?.querySelector('[data-id="'+b.id+'"]');return (A?parseInt(doc.defaultView.getComputedStyle(A).order)||0:0)-(B?parseInt(doc.defaultView.getComputedStyle(B).order)||0:0)});}
  function moveElement(id,target){const r=current(),hit=findEl(r.template.content,id),to=findEl(r.template.content,target);if(!hit||!to||hit.list!==to.list)throw new Error('فقط جابه‌جایی داخل همان والد پشتیبانی می‌شود');const doc=previewRoot(),view=doc.querySelector('[data-id="'+id+'"]');if(/absolute|fixed/.test(doc.defaultView.getComputedStyle(view).position))throw new Error('ابتدا موقعیت absolute/fixed را تغییر دهید');const list=ordered(hit.list),index=list.indexOf(to.el);list.splice(list.indexOf(hit.el),1);list.splice(index,0,hit.el);checkpoint();if(hit.parent){const pv=doc.querySelector('[data-id="'+hit.parent.id+'"]');if(!/flex|grid/.test(doc.defaultView.getComputedStyle(pv).display)){deviceSettings(hit.parent).flex_direction='column';scopedCSS(hit.parent.id,{display:'flex','flex-direction':'column'});}}else{r.css+='\n@media '+H2ECanvas.media[state.device]+'{.elementor.elementor-page{display:flex!important;flex-direction:column!important}}';}list.forEach((n,i)=>{deviceSettings(n)._flex_order=i;scopedCSS(n.id,{order:i});});changed(true);}
  function selection(){const hit=findEl(current()?.template.content||[],state.selectedId);const n=previewRoot()?.querySelector('[data-id="'+state.selectedId+'"]');return hit&&n?{kind:'html',html:n.outerHTML}:null;}
  function setResults(results, onSync) {
    state.results = results || [];
    state.typeHistory=[];state.actions=[];state.editedFlow.clear();
    state.index = 0;
    state.selectedId = null;
    state.onSync = onSync || null;
    refresh();
  }

  global.H2EPreview = {
    mount,
    setResults,
    refresh,
    select,selection,resizeElement,moveElement,undoAction,
  };
})(typeof window !== "undefined" ? window : globalThis);
