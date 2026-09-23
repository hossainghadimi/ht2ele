/**
 * HTML → Elementor JSON converter
 * Builds Elementor template v0.4 (containers / sections) and a separate CSS file.
 */
(function (global) {
  "use strict";

  const SKIP_TAGS = new Set([
    "script", "noscript", "style", "link", "meta", "title", "head",
    "template", "iframe", "canvas", "object", "embed", "param",
  ]);
  const SKIP_ALWAYS = new Set(["script", "noscript", "style", "link", "meta", "title", "head", "template"]);
  const INLINE_TAGS = new Set([
    "span", "a", "strong", "b", "em", "i", "u", "s", "small", "mark",
    "abbr", "cite", "code", "kbd", "samp", "sub", "sup", "time", "var",
    "bdi", "bdo", "br", "wbr", "q", "font", "label",
  ]);
  const LAYOUT_TAGS = new Set([
    "section", "header", "footer", "main", "article", "aside", "div",
    "nav", "figure", "details", "dialog",
  ]);
  const SEMANTIC_TAGS = new Set(["section", "header", "footer", "main", "article", "aside", "nav"]);

  const BS_COLORS = {
    primary: "#0d6efd", secondary: "#6c757d", success: "#198754",
    danger: "#dc3545", warning: "#ffc107", info: "#0dcaf0",
    light: "#f8f9fa", dark: "#212529", white: "#ffffff", black: "#000000",
    muted: "#6c757d",
  };

  const BS_SPACE = { 0: 0, 1: 4, 2: 8, 3: 16, 4: 24, 5: 48 };
  const TW_SPACE = {
    0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14,
    4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48,
    14: 56, 16: 64, 20: 80, 24: 96, 28: 112, 32: 128, 36: 144, 40: 160,
    44: 176, 48: 192, 52: 208, 56: 224, 60: 240, 64: 256, 72: 288, 80: 320, 96: 384,
  };

  const BTN_CLASS_RE = /\b(btn|button|cta|wp-block-button__link|elementor-button|btn-primary|btn-secondary|btn-dark|btn-light|btn-success|btn-danger|btn-warning|btn-info|btn-outline)\b/i;
  const ROW_CLASS_RE = /\b(row|grid|d-grid|d-flex|flex|flex-row|columns|gallery|cards|card-grid|features|pricing|team|stats)\b/i;
  const COL_CLASS_RE = /\b(col(?:-(?:xs|sm|md|lg|xl|xxl))?(?:-\d+)?|column|col-auto|sidebar|card)\b/i;
  const LAYOUT_CLASS_RE = /\b(container(?:-fluid)?|wrapper|section|hero|banner|footer|header|content|main|inner|page|site|wrap|boxed|layout|navbar|nav)\b/i;

  function uid() {
    const a = new Uint8Array(4);
    (global.crypto || window.crypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function slug(name) {
    return String(name || "page")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w\u0600-\u06FF\-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rgbToHex(v) {
    if (!v) return null;
    v = String(v).trim();
    if (/^#([0-9a-f]{3,8})$/i.test(v)) {
      if (v.length === 4) {
        return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
      }
      return v.toLowerCase();
    }
    const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!m) return v;
    const hex = (n) => ("0" + Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16)).slice(-2);
    const r = hex(m[1]), g = hex(m[2]), b = hex(m[3]);
    if (m[4] !== undefined && Number(m[4]) < 1) {
      const a = hex(Math.round(Number(m[4]) * 255));
      return `#${r}${g}${b}${a}`;
    }
    return `#${r}${g}${b}`;
  }

  function parseStyle(styleStr) {
    const out = {};
    if (!styleStr) return out;
    String(styleStr).split(";").forEach((part) => {
      const i = part.indexOf(":");
      if (i < 0) return;
      const k = part.slice(0, i).trim().toLowerCase();
      const val = part.slice(i + 1).trim();
      if (k && val) out[k] = val;
    });
    return out;
  }

  function flattenCss(css) {
    css = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
    let out = "";
    let i = 0;
    while (i < css.length) {
      if (css[i] === "@") {
        const brace = css.indexOf("{", i);
        if (brace < 0) {
          out += css.slice(i);
          break;
        }
        const head = css.slice(i, brace).trim();
        let depth = 0;
        let j = brace;
        for (; j < css.length; j++) {
          if (css[j] === "{") depth++;
          else if (css[j] === "}") {
            depth--;
            if (depth === 0) {
              j++;
              break;
            }
          }
        }
        const inner = css.slice(brace + 1, j - 1);
        if (/^@(?:media|supports|layer|container)\b/i.test(head)) out += flattenCss(inner);
        i = j;
        continue;
      }
      out += css[i++];
    }
    return out;
  }

  function parseCssRules(css) {
    const flat = flattenCss(css);
    const rules = [];
    let i = 0;
    while (i < flat.length) {
      const brace = flat.indexOf("{", i);
      if (brace < 0) break;
      const selectors = flat.slice(i, brace).trim();
      let depth = 0;
      let j = brace;
      for (; j < flat.length; j++) {
        if (flat[j] === "{") depth++;
        else if (flat[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      const body = flat.slice(brace + 1, j - 1);
      i = j;
      if (!selectors || selectors[0] === "@") continue;
      const decls = parseStyle(body.replace(/\n/g, ";"));
      selectors.split(",").forEach((sel) => {
        const s = sel.trim();
        if (s) rules.push({ selector: s, decls });
      });
    }
    return rules;
  }

  function collectRootVars(rules) {
    const vars = {};
    rules.forEach((r) => {
      if (r.selector === ":root" || r.selector === "html") {
        Object.keys(r.decls).forEach((k) => {
          if (k.slice(0, 2) === "--") vars[k] = r.decls[k];
        });
      }
    });
    return vars;
  }

  function resolveCssVars(val, vars) {
    if (!val || val.indexOf("var(") < 0) return val;
    return String(val).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, n, fb) => vars[n] || fb || _);
  }

  function applyCssToDoc(doc, cssText) {
    if (!doc || !cssText) return;
    const rules = parseCssRules(cssText);
    const vars = collectRootVars(rules);
    const els = [];
    if (doc.documentElement) els.push(doc.documentElement);
    if (doc.body) els.push(doc.body);
    if (doc.body) Array.prototype.push.apply(els, doc.body.querySelectorAll("*"));
    els.forEach((el) => {
      const acc = {};
      rules.forEach((r) => {
        try {
          if (el.matches && el.matches(r.selector)) Object.assign(acc, r.decls);
        } catch (e) { /* invalid selector */ }
      });
      Object.keys(acc).forEach((k) => {
        acc[k] = resolveCssVars(acc[k], vars);
      });
      el._h2eSheet = acc;
      el._h2eEff = null;
    });
  }

  function styleOf(el) {
    if (!el) return {};
    if (el._h2eEff) return el._h2eEff;
    const sheet = el._h2eSheet || {};
    const inline = parseStyle(attr(el, "style"));
    el._h2eEff = Object.assign({}, sheet, inline);
    return el._h2eEff;
  }

  const INHERIT_PROPS = ["color", "font-family", "font-size", "font-weight", "line-height", "direction", "text-align", "text-transform", "letter-spacing"];

  function bakeInherited(doc) {
    function pick(eff) {
      const o = {};
      INHERIT_PROPS.forEach((k) => { if (eff[k] != null && eff[k] !== "") o[k] = eff[k]; });
      return o;
    }
    function walk(el, parentPick) {
      if (!el || el.nodeType !== 1) return;
      const sheet = el._h2eSheet || {};
      const inline = parseStyle(attr(el, "style"));
      const acc = Object.assign({}, parentPick, sheet, inline);
      el._h2eEff = acc;
      const next = pick(acc);
      Array.from(el.children || []).forEach((c) => walk(c, next));
    }
    walk(doc.documentElement || doc.body, {});
  }

  // Use the browser cascade, not selector-order guesses. The measurement frame
  // cannot run input scripts or fetch external resources. Desktop viewport: 1200px.
  function measureStyles(doc, cssText, ctx) {
    if (!global.document || !global.getComputedStyle) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none;border:0";
    document.body.appendChild(frame);
    try {
      const md = frame.contentDocument;
      const clone = doc.documentElement.cloneNode(true);
      if (!clone.hasAttribute("dir")) clone.setAttribute("dir", ctx.options.rtl ? "rtl" : "ltr");
      const originals = Array.from(doc.querySelectorAll("*"));
      const copies = [clone, ...clone.querySelectorAll("*")];
      const pairs = originals.map((e, i) => [e, copies[i]]);
      clone.querySelectorAll("script,style,link,base,meta,iframe,object,embed").forEach(e => e.remove());
      clone.querySelectorAll("*").forEach(e => {
        Array.from(e.attributes).forEach(a => {
          if (/^on/i.test(a.name) || /^(src|srcset|href|poster)$/i.test(a.name)) e.removeAttribute(a.name);
        });
      });
      md.replaceChild(md.importNode(clone, true), md.documentElement);
      // Pair by temporary index after nodes that cannot affect layout are removed.
      pairs.forEach(([e, c], i) => { if (c && clone.contains(c)) c.setAttribute("data-h2e-measure", i); });
      md.replaceChild(md.importNode(clone, true), md.documentElement);
      const csp = md.createElement("meta");
      csp.httpEquiv = "Content-Security-Policy";
      csp.content = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";
      md.head.prepend(csp);
      const sheet = md.createElement("style");
      sheet.textContent = (global.H2E_ICON_CSS || "").replace(/@font-face\{[^}]*\}/g, "") + "\n" + cssText.replace(/@font-face\s*\{[^}]*\}/g, "");
      md.head.appendChild(sheet);
      function matchedRules(rules, el, out, ranks, counter) {
        ranks = ranks || {}; counter = counter || { n:0 };
        for (const r of Array.from(rules || [])) {
          if (r.media && !frame.contentWindow.matchMedia(r.conditionText || r.media.mediaText).matches) continue;
          if (r.constructor?.name === "CSSSupportsRule" && !CSS.supports(r.conditionText)) continue;
          if (r.selectorText) {
            for (const selector of splitSelectors(r.selectorText)) {
              try {
                if(!el.matches(selector))continue;
                const spec=global.H2ESpecificity ? global.H2ESpecificity(selector) : [0,0,0];
                const order=++counter.n;
                for(const k of r.style){
                  const rank=[r.style.getPropertyPriority(k)==="important"?1:0,0,...spec,order];
                  if(!ranks[k] || compareRank(rank,ranks[k])>=0){out[k]=r.style.getPropertyValue(k);ranks[k]=rank;}
                }
              } catch (_) {}
            }
          } else if(r.cssRules) matchedRules(r.cssRules,el,out,ranks,counter);
        }
        return ranks;
      }
      function compareRank(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;}
      function splitSelectors(text){let depth=0,quote="",start=0,result=[];for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote&&text[i-1]!=="\\")quote="";continue;}if(c==='"'||c==="'")quote=c;else if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(c===','&&depth===0){result.push(text.slice(start,i));start=i+1;}}result.push(text.slice(start));return result;}
      // Preserve nonstandard source breakpoints in companion CSS, rather than
      // stretching a 900px source breakpoint to Elementor's 1024px tablet limit.
      const cuts = new Set([0]);
      let customBreakpoints = false;
      function collectWidths(rules) {
        for (const r of Array.from(rules || [])) {
          if (r.media) {
            const query = r.conditionText || r.media.mediaText;
            for (const m of query.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/gi)) {
              const n = Number(m[2]) * (/em/i.test(m[3]) ? 16 : 1);
              if (n > 0 && n < 5000) {
                cuts.add(m[1].toLowerCase() === "max" ? n + 0.001 : n);
                if (![767,1024].includes(n)) customBreakpoints = true;
              }
            }
          }
          if (r.cssRules) collectWidths(r.cssRules);
        }
      }
      collectWidths(sheet.sheet.cssRules);
      ctx.rangeSpecs = [];
      if (customBreakpoints && cuts.size <= 24) {
        const sorted = Array.from(cuts).sort((a,b)=>a-b);
        ctx.rangeSpecs = sorted.map((min,i)=>({min,max:sorted[i+1] == null ? null : sorted[i+1] - 0.001, sample: sorted[i+1] == null ? Math.max(1200,min+100) : Math.max(1,(min+sorted[i+1])/2)}));
      }
      const samples = [["desktop",1200],["tablet",768],["mobile",375],...ctx.rangeSpecs.map((r,i)=>["range"+i,r.sample])];
      for (const [device, viewport] of samples) {
        frame.style.width = viewport + "px";
        void frame.offsetWidth;
        void md.documentElement.getBoundingClientRect();
      md.querySelectorAll("[data-h2e-measure]").forEach(el => {
        const src = originals[Number(el.getAttribute("data-h2e-measure"))];
        const declared = {};
        const ranks=matchedRules(sheet.sheet.cssRules, el, declared);
        for (const k of el.style) {
          const rank=[el.style.getPropertyPriority(k)==="important"?1:0,1,0,0,0,0];
          if(!ranks[k] || compareRank(rank,ranks[k])>=0)declared[k]=el.style.getPropertyValue(k);
        }
        const cs = frame.contentWindow.getComputedStyle(el);
        const eff = {};
        // Include inherited typography and UA heading/paragraph spacing.
        const props = new Set([...Object.keys(declared), "display", "box-sizing", "direction", "color", "font-family", "font-size", "font-weight", "line-height", "text-align", "letter-spacing", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left", ...["top","right","bottom","left"].flatMap(x => ["border-"+x+"-width","border-"+x+"-style","border-"+x+"-color"]), ...["top-left","top-right","bottom-right","bottom-left"].map(x=>"border-"+x+"-radius")]);
        props.forEach(k => {
          if (k.startsWith("--")) return;
          let v = cs.getPropertyValue(k).trim();
          // Retain relative widths, auto margins, and grid track definitions.
          if ((/^(width|height|min-width|max-width|min-height|max-height|flex-basis|grid-template-columns|grid-template-rows)$/.test(k) && /%|vw|vh|fr|repeat|auto|minmax|calc/.test(declared[k] || "")) || (/^margin/.test(k) && /auto/.test(declared[k] || ""))) v = declared[k];
          if (/^(padding|margin)-(top|right|bottom|left)$/.test(k) && /%$/.test(declared[k] || "")) v = declared[k];
          if (v) eff[k] = v;
        });
        if (!declared.width && src._h2eDeclared && src._h2eDeclared.width) eff.width = "auto";
        if (!declared["max-width"] && src._h2eDeclared && src._h2eDeclared["max-width"]) eff["max-width"] = "none";
        if (device !== "desktop" && src._h2eEff && /flex|grid/.test(src._h2eEff.display) && !/flex|grid/.test(cs.display)) {
          eff["flex-direction"] = "column"; eff["flex-wrap"] = "nowrap"; eff["row-gap"] = "0px"; eff["column-gap"] = "0px";
        }
        if (cs.display.includes("flex") || cs.display.includes("grid")) {
          ["flex-direction", "flex-wrap", "justify-content", "align-items", "row-gap", "column-gap"].forEach(k => { eff[k] = cs.getPropertyValue(k); });
        }
        if (device === "desktop") { src._h2eEff = eff; src._h2eDeclared = declared; }
        else if (device.startsWith("range")) { src._h2eRanges = src._h2eRanges || []; src._h2eRanges[Number(device.slice(5))] = eff; }
        else { src._h2eResponsive = src._h2eResponsive || {}; src._h2eResponsive[device] = eff; }
      });
      }
    } catch (e) {
      ctx.warnings.push("اندازه‌گیری مرورگر در دسترس نبود؛ نگاشت CSS ساده استفاده شد.");
    } finally { frame.remove(); }
  }

  function flexVal(v) {
    v = String(v || "").toLowerCase().trim();
    if (v === "start" || v === "left") return "flex-start";
    if (v === "end" || v === "right") return "flex-end";
    return v;
  }

  function parseLen(val) {
    if (val == null || val === "") return null;
    const s = String(val).trim();
    if (s === "0") return { size: 0, unit: "px" };
    const m = s.match(/^(-?[\d.]+)\s*(px|em|rem|%|vh|vw|pt)?$/i);
    if (!m) return null;
    let unit = (m[2] || "px").toLowerCase();
    let size = parseFloat(m[1]);
    if (unit === "rem" || unit === "em") {
      size = Math.round(size * 16);
      unit = "px";
    }
    if (unit === "pt") {
      size = Math.round(size * 1.333);
      unit = "px";
    }
    return { size, unit };
  }

  function dimBox(top, right, bottom, left, unit) {
    unit = unit || "px";
    const t = String(top ?? 0), r = String(right ?? t), b = String(bottom ?? t), l = String(left ?? r);
    return { unit, top: t, right: r, bottom: b, left: l, isLinked: t === r && r === b && b === l };
  }

  function parseBox(val) {
    if (!val) return null;
    const raw = String(val).trim().split(/\s+/);
    const parts = raw.map(parseLen);
    if (parts.some((p) => !p) || !parts.length) return null;
    const unit = parts[0].unit || "px";
    if (parts.some((p) => (p.unit || "px") !== unit)) return null;
    if (parts.length === 1) return dimBox(parts[0].size, parts[0].size, parts[0].size, parts[0].size, unit);
    if (parts.length === 2) return dimBox(parts[0].size, parts[1].size, parts[0].size, parts[1].size, unit);
    if (parts.length === 3) return dimBox(parts[0].size, parts[1].size, parts[2].size, parts[1].size, unit);
    return dimBox(parts[0].size, parts[1].size, parts[2].size, parts[3].size, unit);
  }

  function sizeObj(val) {
    const p = parseLen(val);
    if (!p) return null;
    return { unit: p.unit, size: p.size };
  }

  function classNames(el) {
    if (!el || !el.getAttribute) return [];
    return (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean);
  }

  function classStr(el) {
    return classNames(el).join(" ");
  }

  function hasClass(el, re) {
    return re.test(classStr(el));
  }

  function textContent(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function innerHtml(el) {
    return el ? (el.innerHTML || "").trim() : "";
  }

  function attr(el, name) {
    return el && el.getAttribute ? (el.getAttribute(name) || "") : "";
  }

  function isElement(n) {
    return n && n.nodeType === 1;
  }

  function childrenOf(el) {
    return el ? Array.from(el.children || []) : [];
  }

  function isWhitespaceText(n) {
    return n && n.nodeType === 3 && !String(n.textContent || "").trim();
  }

  function looksLikeButton(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "button" || attr(el, "role").toLowerCase() === "button" || attr(el, "data-h2e-widget") === "button") return true;
    if (tag === "input") {
      const t = (attr(el, "type") || "text").toLowerCase();
      return t === "button" || t === "submit" || t === "reset";
    }
    if (tag === "a") {
      if (BTN_CLASS_RE.test(classStr(el))) return true;
      const role = attr(el, "role").toLowerCase();
      if (role === "button") return true;
      const st = styleOf(el);
      if (st["background-color"] || st.background) {
        const t = textContent(el);
        if (t && t.length <= 48 && childrenOf(el).every((c) => INLINE_TAGS.has(c.tagName.toLowerCase()))) {
          return true;
        }
      }
    }
    return false;
  }

  function isComplex(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (["form", "table", "svg", "canvas", "video", "audio", "iframe", "object", "embed"].includes(tag)) return true;
    if (el.querySelector && el.querySelector("form, table, svg, canvas, video, audio, iframe")) {
      const hits = el.querySelectorAll("form, table, svg, canvas, video, audio, iframe").length;
      if (hits >= 1 && tag === "nav") return true;
      if (hits >= 1 && ["form", "table", "svg"].includes(el.querySelector("form, table, svg, canvas, video, audio, iframe").tagName.toLowerCase())) {
        if (tag !== "section" && tag !== "main" && tag !== "div" && tag !== "article" && tag !== "header" && tag !== "footer") return true;
      }
    }
    if (tag === "nav") {
      const links = el.querySelectorAll("a").length;
      if (links >= 5) return true;
    }
    if (el.querySelector && el.querySelector("[onclick], [data-bs-toggle], [uk-slideshow], .swiper, .slick, .owl-carousel")) return true;
    return false;
  }

  function isLayoutEl(el) {
    const tag = el.tagName.toLowerCase();
    if (SEMANTIC_TAGS.has(tag)) return true;
    if (tag === "div" || tag === "figure") {
      if (LAYOUT_CLASS_RE.test(classStr(el)) || ROW_CLASS_RE.test(classStr(el)) || COL_CLASS_RE.test(classStr(el))) return true;
      const st = styleOf(el);
      const d = (st.display || "").toLowerCase();
      if (d.includes("flex") || d.includes("grid")) return true;
      const kids = childrenOf(el).filter((c) => !SKIP_ALWAYS.has(c.tagName.toLowerCase()));
      const blockKids = kids.filter((c) => !INLINE_TAGS.has(c.tagName.toLowerCase()) || looksLikeButton(c));
      if (blockKids.length >= 2) return true;
      if (kids.length === 1 && LAYOUT_TAGS.has(kids[0].tagName.toLowerCase())) return true;
    }
    return false;
  }

  function isRowEl(el) {
    const st = styleOf(el);
    const d = (st.display || "").toLowerCase();
    const dir = (st["flex-direction"] || "").toLowerCase();
    const cls = classStr(el);
    if (/\bflex-col\b|\bflex-column\b/.test(cls) || dir === "column" || dir === "column-reverse") {
      if (d.includes("flex") || /\bd-flex\b|\bflex\b/.test(cls)) return false;
    }
    if (d.includes("flex")) {
      const n = childrenOf(el).filter((c) => !SKIP_ALWAYS.has(c.tagName.toLowerCase())).length;
      if (n >= 2 && (dir === "row" || dir === "row-reverse" || !dir)) return true;
    }
    if (d.includes("grid")) {
      const n = childrenOf(el).filter((c) => !SKIP_ALWAYS.has(c.tagName.toLowerCase())).length;
      if (n >= 2) return true;
    }
    if (!d && ROW_CLASS_RE.test(cls) && !/\bflex-col\b|\bflex-column\b/.test(cls)) {
      const n = childrenOf(el).filter((c) => !SKIP_ALWAYS.has(c.tagName.toLowerCase())).length;
      if (n >= 2) return true;
    }
    if (d && !d.includes("flex") && !d.includes("grid")) return false;
    const cols = childrenOf(el).filter((c) => COL_CLASS_RE.test(classStr(c)));
    return cols.length >= 2;
  }

  function colWidth(el, count) {
    const cls = classStr(el);
    const m12 = cls.match(/\bcol-(?:xs-|sm-|md-|lg-|xl-|xxl-)?(\d+)\b/);
    if (m12) {
      const n = parseInt(m12[1], 10);
      if (n >= 1 && n <= 12) return Math.round((n / 12) * 100);
    }
    if (/\bcol-auto\b/.test(cls)) return Math.round(100 / Math.max(count, 1));
    if (/\bw-25\b|\bw-1\/4\b/.test(cls)) return 25;
    if (/\bw-50\b|\bw-1\/2\b/.test(cls)) return 50;
    if (/\bw-75\b|\bw-3\/4\b/.test(cls)) return 75;
    if (/\bw-33\b|\bw-1\/3\b/.test(cls)) return 33;
    if (/\bw-66\b|\bw-2\/3\b/.test(cls)) return 66;
    const st = styleOf(el);
    if (st.width && st.width.indexOf("%") >= 0) {
      const n = parseFloat(st.width);
      if (!isNaN(n)) return Math.round(n);
    }
    if (st["flex-basis"] && st["flex-basis"].indexOf("%") >= 0) {
      const n = parseFloat(st["flex-basis"]);
      if (!isNaN(n)) return Math.round(n);
    }
    const tw = cls.match(/\bw-(\d+)\/(\d+)\b/);
    if (tw) return Math.round((parseInt(tw[1], 10) / parseInt(tw[2], 10)) * 100);
    const twp = cls.match(/\bw-\[(\d+)%\]/);
    if (twp) return parseInt(twp[1], 10);
    return Math.round(100 / Math.max(count, 1));
  }

  /* ---------- Elementor node factories ---------- */

  function elWidget(type, settings) {
    return {
      id: uid(),
      elType: "widget",
      widgetType: type,
      isInner: false,
      settings: settings || {},
      elements: [],
    };
  }

  function elContainer(settings, elements, isInner) {
    const s = settings && Object.keys(settings).length ? settings : {};
    return {
      id: uid(),
      elType: "container",
      isInner: !!isInner,
      settings: s,
      elements: elements || [],
    };
  }

  function elSection(settings, columns, isInner) {
    return {
      id: uid(),
      elType: "section",
      isInner: !!isInner,
      settings: settings && Object.keys(settings).length ? settings : {},
      elements: columns || [],
    };
  }

  function elColumn(size, elements, extra) {
    const settings = Object.assign({ _column_size: size, _inline_size: null }, extra || {});
    return {
      id: uid(),
      elType: "column",
      isInner: false,
      settings,
      elements: elements || [],
    };
  }

  function flexGap(px) {
    const n = String(px == null ? 20 : px);
    return { column: n, row: n, isLinked: true, unit: "px", size: Number(n) };
  }

  /* ---------- Utility class → settings ---------- */

  function applyUtilities(cls, settings, kind) {
    const list = (cls || "").split(/\s+/).filter(Boolean);
    kind = kind || "container";

    const setAlign = (v) => {
      if (kind === "heading") settings.align = v;
      else if (kind === "button") settings.align = v;
      else if (kind === "image") settings.align = v;
      else if (kind === "text") settings.align = v;
      else settings.flex_justify_content = v === "center" ? "center" : v === "right" ? "flex-end" : "flex-start";
    };

    for (const c of list) {
      if (c === "text-center" || c === "text-center" || c === "text-lg-center") setAlign("center");
      else if (c === "text-start" || c === "text-left") setAlign("left");
      else if (c === "text-end" || c === "text-right") setAlign("right");
      else if (c === "mx-auto") {
        if (kind === "container") settings.flex_align_items = settings.flex_align_items || "center";
      }

      const bgBs = c.match(/^bg-(primary|secondary|success|danger|warning|info|light|dark|white|black)$/);
      if (bgBs && (kind === "container" || kind === "section" || kind === "column" || kind === "button")) {
        if (kind === "button") settings.background_color = BS_COLORS[bgBs[1]];
        else {
          settings.background_background = "classic";
          settings.background_color = BS_COLORS[bgBs[1]];
        }
      }
      const txBs = c.match(/^text-(primary|secondary|success|danger|warning|info|light|dark|white|black|muted)$/);
      if (txBs) {
        const col = BS_COLORS[txBs[1]];
        if (kind === "heading") settings.title_color = col;
        else if (kind === "text") settings.text_color = col;
        else if (kind === "button") settings.button_text_color = col;
      }

      if (c === "d-flex" || c === "flex") {
        settings.flex_direction = settings.flex_direction || "row";
      }
      if (c === "flex-column" || c === "flex-col") settings.flex_direction = "column";
      if (c === "flex-row") settings.flex_direction = "row";
      if (c === "flex-wrap" || c === "flex-wrap") settings.flex_wrap = "wrap";
      if (c === "justify-content-center" || c === "justify-center") settings.flex_justify_content = "center";
      if (c === "justify-content-between" || c === "justify-between") settings.flex_justify_content = "space-between";
      if (c === "justify-content-around" || c === "justify-around") settings.flex_justify_content = "space-around";
      if (c === "justify-content-evenly" || c === "justify-evenly") settings.flex_justify_content = "space-evenly";
      if (c === "justify-content-start" || c === "justify-start") settings.flex_justify_content = "flex-start";
      if (c === "justify-content-end" || c === "justify-end") settings.flex_justify_content = "flex-end";
      if (c === "align-items-center" || c === "items-center") settings.flex_align_items = "center";
      if (c === "align-items-start" || c === "items-start") settings.flex_align_items = "flex-start";
      if (c === "align-items-end" || c === "items-end") settings.flex_align_items = "flex-end";
      if (c === "align-items-stretch" || c === "items-stretch") settings.flex_align_items = "stretch";

      const gapBs = c.match(/^(?:g|gap|gy|gx)-([0-5])$/);
      if (gapBs) settings.flex_gap = flexGap(BS_SPACE[gapBs[1]]);
      const gapTw = c.match(/^gap-(\d+(?:\.\d+)?)$/);
      if (gapTw && TW_SPACE[gapTw[1]] != null) settings.flex_gap = flexGap(TW_SPACE[gapTw[1]]);

      const pBs = c.match(/^p-([0-5])$/);
      if (pBs) settings.padding = dimBox(BS_SPACE[pBs[1]]);
      const py = c.match(/^py-([0-5])$/);
      if (py) {
        const n = BS_SPACE[py[1]];
        settings.padding = dimBox(n, 0, n, 0);
      }
      const px = c.match(/^px-([0-5])$/);
      if (px) {
        const n = BS_SPACE[px[1]];
        settings.padding = dimBox(0, n, 0, n);
      }
      const mBs = c.match(/^m-([0-5])$/);
      if (mBs && kind === "container") settings.margin = dimBox(BS_SPACE[mBs[1]]);

      const pTw = c.match(/^p-(\d+)$/);
      if (pTw && TW_SPACE[pTw[1]] != null) settings.padding = dimBox(TW_SPACE[pTw[1]]);
      const pyTw = c.match(/^py-(\d+)$/);
      if (pyTw && TW_SPACE[pyTw[1]] != null) settings.padding = dimBox(TW_SPACE[pyTw[1]], 0, TW_SPACE[pyTw[1]], 0);
      const pxTw = c.match(/^px-(\d+)$/);
      if (pxTw && TW_SPACE[pxTw[1]] != null) settings.padding = dimBox(0, TW_SPACE[pxTw[1]], 0, TW_SPACE[pxTw[1]]);

      if (c === "container") {
        settings.content_width = "boxed";
        settings.boxed_width = { unit: "px", size: 1140 };
      }
      if (c === "container-fluid") settings.content_width = "full";
      if (c === "rounded" || c === "rounded-md") settings.border_radius = dimBox(8);
      if (c === "rounded-lg") settings.border_radius = dimBox(12);
      if (c === "rounded-xl") settings.border_radius = dimBox(16);
      if (c === "rounded-pill" || c === "rounded-full") settings.border_radius = dimBox(50);
      if (c === "fw-bold" || c === "font-bold" || c === "font-extrabold") {
        settings.typography_typography = "custom";
        settings.typography_font_weight = "700";
      }
      if (c === "fw-light" || c === "font-light") {
        settings.typography_typography = "custom";
        settings.typography_font_weight = "300";
      }
      const fs = c.match(/^fs-([1-6])$/);
      if (fs) {
        const map = { 1: 40, 2: 32, 3: 28, 4: 24, 5: 20, 6: 16 };
        settings.typography_typography = "custom";
        settings.typography_font_size = { unit: "px", size: map[fs[1]] };
      }
      const twText = c.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/);
      if (twText) {
        const map = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60 };
        settings.typography_typography = "custom";
        settings.typography_font_size = { unit: "px", size: map[twText[1]] };
      }
      if (c === "w-100" || c === "w-full") {
        if (kind === "container") settings.content_width = "full";
        if (kind === "image") settings.width = { unit: "%", size: 100 };
        if (kind === "button") { /* full width button */ settings.button_width = "fill"; }
      }
      if (c === "min-vh-100" || c === "h-screen") {
        settings.min_height = { unit: "vh", size: 100 };
      }
      const twBg = c.match(/^bg-\[(#[0-9A-Fa-f]{3,8})\]$/);
      if (twBg) {
        if (kind === "button") settings.background_color = rgbToHex(twBg[1]);
        else {
          settings.background_background = "classic";
          settings.background_color = rgbToHex(twBg[1]);
        }
      }
      const twCol = c.match(/^text-\[(#[0-9A-Fa-f]{3,8})\]$/);
      if (twCol) {
        const col = rgbToHex(twCol[1]);
        if (kind === "heading") settings.title_color = col;
        else if (kind === "text") settings.text_color = col;
        else if (kind === "button") settings.button_text_color = col;
      }
    }
    return settings;
  }

  function dimensionsFromValues(values) {
    if (values.length !== 4 || values.some(v => v == null || v === "")) return null;
    const lens = values.map(parseLen);
    if (lens.every(Boolean) && lens.every(v => v.unit === lens[0].unit)) return dimBox(...lens.map(v=>v.size), lens[0].unit);
    return dimBox(...values.map(String), "custom");
  }
  function cssDimensions(st, prop, suffix) {
    const short = st[prop + (suffix ? "-"+suffix : "")];
    let sides = short ? String(short).trim().split(/\s+/) : [];
    if (sides.length === 1) sides = Array(4).fill(sides[0]);
    else if (sides.length === 2) sides = [sides[0],sides[1],sides[0],sides[1]];
    else if (sides.length === 3) sides = [...sides,sides[1]];
    const names = ["top", "right", "bottom", "left"];
    const values = names.map((side,i) => st[prop + "-" + side + (suffix ? "-" + suffix : "")] ?? sides[i]);
    if (!values.some(v=>v!=null)) return null;
    return dimensionsFromValues(values.map(v=>v ?? "0px"));
  }

  function applyInline(styleMap, settings, kind) {
    if (!styleMap) return { leftover: {} };
    const leftover = {};
    const mapped = new Set();

    const takeColor = (k) => rgbToHex(styleMap[k]);

    if (styleMap["background-color"]) {
      const c = takeColor("background-color");
      if (kind === "button") settings.background_color = c;
      else if (kind === "container" || kind === "section" || kind === "column") {
        settings.background_background = "classic";
        settings.background_color = c;
      } else leftover["background-color"] = styleMap["background-color"];
      mapped.add("background-color");
    }
    if (styleMap.background && /url\(/i.test(styleMap.background)) {
      leftover.background = styleMap.background;
      mapped.add("background");
    } else if (styleMap.background && (kind === "container" || kind === "section" || kind === "column" || kind === "button")) {
      if (/gradient/i.test(styleMap.background)) leftover.background = styleMap.background;
      else {
        const c = rgbToHex(styleMap.background.split(/\s+/)[0]);
        if (c && c[0] === "#") {
          if (kind === "button") settings.background_color = c;
          else {
            settings.background_background = "classic";
            settings.background_color = c;
          }
          mapped.add("background");
        }
      }
    }
    const bgImg = styleMap["background-image"];
    if (bgImg && /url\(/i.test(bgImg) && (kind === "container" || kind === "section")) {
      const um = bgImg.match(/url\((['"]?)(.*?)\1\)/i);
      if (um) {
        settings.background_background = "classic";
        settings.background_image = { url: um[2], id: "" };
        settings.background_position = styleMap["background-position"] || "center center";
        settings.background_repeat = styleMap["background-repeat"] || "no-repeat";
        settings.background_size = styleMap["background-size"] || "cover";
        mapped.add("background-image");
        mapped.add("background-position");
        mapped.add("background-repeat");
        mapped.add("background-size");
      }
    }
    if (styleMap.color) {
      const c = takeColor("color");
      if (kind === "heading") settings.title_color = c;
      else if (kind === "text") settings.text_color = c;
      else if (kind === "button") settings.button_text_color = c;
      else if (kind === "icon") settings.primary_color = c;
      else leftover.color = styleMap.color;
      mapped.add("color");
    }
    if (styleMap["text-align"]) {
      const a = styleMap["text-align"].toLowerCase();
      const map = { start: styleMap.direction === "rtl" ? "right" : "left", end: styleMap.direction === "rtl" ? "left" : "right", left: "left", right: "right", center: "center", justify: "justify" };
      const v = map[a] || a;
      if (kind === "heading" || kind === "text" || kind === "button" || kind === "image") settings.align = v;
      else leftover["text-align"] = v;
      mapped.add("text-align");
    }
    const layout = ["container", "section", "column"].includes(kind);
    for (const prop of ["padding", "margin"]) {
      const key = prop === "padding" && kind === "button" ? "button_text_padding" : layout ? prop : "_" + prop;
      const box = cssDimensions(styleMap, prop);
      if (box) {
        settings[key] = box;
        Object.keys(styleMap).filter(k => k === prop || k.startsWith(prop + "-")).forEach(k => mapped.add(k));
      }
    }
    // Native border controls, with per-edge CSS fallback when styles/colors differ.
    const bp = layout || kind === "button" || kind === "image" ? "" : "_";
    const widths = cssDimensions(styleMap, "border", "width");
    if (widths) { settings[bp + "border_width"] = widths; ["border-width", ...["top","right","bottom","left"].map(x => "border-"+x+"-width")].forEach(k=>mapped.add(k)); }
    const styles = ["top","right","bottom","left"].map(x => styleMap["border-"+x+"-style"] || styleMap["border-style"] || "none");
    const colors = ["top","right","bottom","left"].map(x => styleMap["border-"+x+"-color"] || styleMap["border-color"] || styleMap.color || "currentColor");
    if (Object.keys(styleMap).some(k => /^border/.test(k))) {
      settings[bp + "border_border"] = styles[0];
      settings[bp + "border_color"] = rgbToHex(colors[0]);
      if (styles.every(x => x === styles[0])) ["border-style", ...["top","right","bottom","left"].map(x => "border-"+x+"-style")].forEach(k=>mapped.add(k));
      if (colors.every(x => x === colors[0])) ["border-color", ...["top","right","bottom","left"].map(x => "border-"+x+"-color")].forEach(k=>mapped.add(k));
    }
    const corners = ["top-left", "top-right", "bottom-right", "bottom-left"].map(x => styleMap["border-" + x + "-radius"]);
    const radius = corners.some(v => /\s/.test(String(v || "").trim())) ? null : corners.every(Boolean) ? dimensionsFromValues(corners) : parseBox(styleMap["border-radius"]);
    if (radius) {
      settings[bp + "border_radius"] = radius;
      ["border-radius", ...["top-left", "top-right", "bottom-right", "bottom-left"].map(x=>"border-"+x+"-radius")].forEach(k=>mapped.add(k));
    }
    if (styleMap["font-size"]) {
      const p = parseLen(styleMap["font-size"]);
      if (p && (kind === "heading" || kind === "text" || kind === "button")) {
        settings.typography_typography = "custom";
        settings.typography_font_size = { unit: p.unit, size: p.size };
        mapped.add("font-size");
      } else if (p && kind === "icon") {
        settings.size = { unit: p.unit, size: p.size };
        mapped.add("font-size");
      }
    }
    if (styleMap["font-weight"]) {
      if (kind === "heading" || kind === "text" || kind === "button") {
        settings.typography_typography = "custom";
        settings.typography_font_weight = String(styleMap["font-weight"]);
        mapped.add("font-weight");
      }
    }
    if (styleMap["font-family"]) {
      if (kind === "heading" || kind === "text" || kind === "button") {
        settings.typography_typography = "custom";
        settings.typography_font_family = styleMap["font-family"].replace(/['"]/g, "").split(",")[0].trim();
        mapped.add("font-family");
      }
    }
    if (styleMap["line-height"]) {
      const p = /^[\d.]+$/.test(styleMap["line-height"]) ? { unit: "em", size: parseFloat(styleMap["line-height"]) } : parseLen(styleMap["line-height"]);
      if (p && (kind === "heading" || kind === "text")) {
        settings.typography_typography = "custom";
        settings.typography_line_height = { unit: p.unit, size: p.size };
        mapped.add("line-height");
      }
    }
    if (styleMap["line-height"] === "normal" && ["heading", "text", "button"].includes(kind)) {
      leftover["line-height"] = "normal";
    }
    if (styleMap["letter-spacing"]) {
      const p = parseLen(styleMap["letter-spacing"]);
      if (p && (kind === "heading" || kind === "text" || kind === "button")) {
        settings.typography_typography = "custom";
        settings.typography_letter_spacing = { unit: p.unit, size: p.size };
        mapped.add("letter-spacing");
      }
    }
    if (styleMap.display && (styleMap.display.includes("flex") || styleMap.display.includes("grid"))) {
      if (kind === "container") {
        if (styleMap.display.includes("grid")) {
          settings.container_type = "grid";
          const gt = styleMap["grid-template-columns"] || "";
          const repeat = gt.match(/^repeat\(\s*(\d+)\s*,\s*(?:1fr|minmax\(0,\s*1fr\))\s*\)$/);
          const tracks = gt.trim().split(/\s+/);
          const equal = tracks.length > 0 && tracks.every(t => t === "1fr");
          if (repeat || equal) {
            settings.grid_columns_grid = { unit: "fr", size: repeat ? Number(repeat[1]) : tracks.length };
            mapped.add("grid-template-columns");
          } else {
            settings.grid_columns_grid = { unit: "custom", size: gt || "1fr" };
            mapped.add("grid-template-columns");
          }
          settings.grid_rows_grid = { unit: "custom", size: styleMap["grid-template-rows"] || "auto" };
          mapped.add("grid-template-rows");

        } else if (styleMap.display.includes("flex")) {
          settings.container_type = "flex";
          settings.flex_direction = flexVal(styleMap["flex-direction"] || "row");
        }
        mapped.add("display");
      }
    }
    if (styleMap["flex-direction"] && kind === "container") {
      settings.flex_direction = flexVal(styleMap["flex-direction"]);
      mapped.add("flex-direction");
    }
    if (styleMap["justify-content"] && kind === "container") {
      settings.flex_justify_content = styleMap["justify-content"] === "normal" ? "flex-start" : flexVal(styleMap["justify-content"]);
      mapped.add("justify-content");
    }
    if (styleMap["align-items"] && kind === "container") {
      settings.flex_align_items = styleMap["align-items"] === "normal" ? "stretch" : flexVal(styleMap["align-items"]);
      mapped.add("align-items");
    }
    if (kind === "container") {
      const parts = String(styleMap.gap || "").split(/\s+/);
      const row = parseLen(styleMap["row-gap"] === "normal" ? "0" : styleMap["row-gap"] || parts[0]);
      const col = parseLen(styleMap["column-gap"] === "normal" ? "0" : styleMap["column-gap"] || parts[1] || parts[0]);
      if (row && col && row.unit === col.unit) {
        settings.flex_gap = { unit: row.unit, size: row.size, row: String(row.size), column: String(col.size), isLinked: row.size === col.size };
        if (settings.container_type === "grid") settings.grid_gaps = Object.assign({}, settings.flex_gap);
        ["gap", "row-gap", "column-gap"].forEach(k => mapped.add(k));
      }
    }
    if (styleMap["flex-wrap"] && kind === "container") {
      settings.flex_wrap = styleMap["flex-wrap"];
      mapped.add("flex-wrap");
    }
    if (styleMap["min-height"] && (kind === "container" || kind === "section")) {
      const p = parseLen(styleMap["min-height"]);
      if (p) settings.min_height = { unit: p.unit, size: p.size };
      mapped.add("min-height");
    }
    if (styleMap.width && kind === "image") {
      const p = parseLen(styleMap.width);
      if (p) settings.width = { unit: p.unit, size: p.size };
      mapped.add("width");
    }
    if (styleMap.width && kind === "container") {
      settings.width = sizeObj(styleMap.width) || { unit: "custom", size: styleMap.width };
      mapped.add("width");
    }
    if (styleMap["max-width"] && kind === "container") {
      // Native max-width varies across Elementor releases; keep exact CSS with media overrides.
      leftover["max-width"] = styleMap["max-width"];
      mapped.add("max-width");
    }
    if (!layout && kind !== "image" && styleMap.width) {
      settings._element_width = styleMap.width === "auto" ? "auto" : "initial";
      settings._element_custom_width = sizeObj(styleMap.width) || { unit: "custom", size: styleMap.width };
      mapped.add("width");
    }
    [["flex-grow", "_flex_grow"], ["flex-shrink", "_flex_shrink"], ["order", "_flex_order"]].forEach(([prop, key]) => {
      if (styleMap[prop] != null && kind !== "container") { settings[key] = Number(styleMap[prop]); mapped.add(prop); }
    });
    if (styleMap["align-self"] && kind !== "container") { settings._align_self = styleMap["align-self"]; mapped.add("align-self"); }
    Object.keys(styleMap).forEach((k) => {
      if (!mapped.has(k)) leftover[k] = styleMap[k];
    });
    return { leftover };
  }

  function leftoverClass(leftover, ctx, suffix) {
    if (!leftover) return null;
    if (leftover.display === "none") delete leftover.display;
    ["unicode-bidi", "speak", "cursor", "outline", "outline-offset", "appearance", "-webkit-appearance"].forEach((k) => { delete leftover[k]; });
    if (!Object.keys(leftover).length) return null;
    const id = "h2e-" + uid();
    const body = Object.keys(leftover).map((k) => `  ${k}: ${leftover[k]}${/^border-(top|right|bottom|left)/.test(k) ? " !important" : ""};`).join("\n");
    ctx.generatedCss.push(`.${id}${suffix || ""} {\n${body}\n}`);
    return id;
  }

  const RESPONSIVE_KEY = /^(flex_direction|flex_wrap|flex_justify_content|flex_align_items|flex_gap|grid_columns_grid|grid_rows_grid|grid_gaps|width|boxed_width|min_height|padding|margin|_padding|_margin|_element_custom_width|_element_width|button_text_padding|size|align|typography_font_size|typography_line_height|typography_letter_spacing|_flex_order|_flex_grow|_flex_shrink|_align_self|border_width|border_radius|_border_width|_border_radius)$/;
  function responsiveSettings(settings, el, ctx) {
    if (!el._h2eResponsive) return;
    const kind = settings.flex_direction ? "container" : settings.editor != null ? "text" : settings.header_size ? "heading" : settings.button_text_padding ? "button" : settings.selected_icon && !settings.title_text ? "icon" : settings.image && !settings.title_text ? "image" : "text";
    const snapshots = { desktop: styleOf(el), ...el._h2eResponsive };
    const base = {}; const baseLeft = applyInline(snapshots.desktop, base, kind).leftover;
    const className = "h2e-responsive-" + uid();
    el._h2eResponsiveClass = className;
    ctx.previewCss = ctx.previewCss || { desktop: "", tablet: "", mobile: "" };
    for (const device of ["desktop", "tablet", "mobile"]) {
      const st = snapshots[device];
      if (!st) continue;
      settings["hide_" + device] = st.display === "none" ? "hidden-" + device : "";
      const next = {};
      const residual = applyInline(st, next, kind).leftover;
      if (device !== "desktop") {
        // Explicit values prevent mobile inheriting a stale tablet or widget default.
        for (const key of Object.keys(next)) if (RESPONSIVE_KEY.test(key)) settings[key + "_" + device] = next[key];
      }
      const outer = {}, inner = {};
      // Non-native responsive values must not be frozen in desktop generated CSS.
      for (const k of new Set([...Object.keys(baseLeft), ...Object.keys(residual)])) {
        if (["display", "cursor", "outline", "appearance", "-webkit-appearance"].includes(k)) continue;
        if (residual[k] != null && (device === "desktop" || residual[k] !== baseLeft[k])) {
          if (device === "desktop") continue;
          (kind === "button" && /^(border|background|box-shadow)/.test(k) ? inner : outer)[k] = residual[k];
        }
      }
      // Border style/color controls are not responsive in all Core versions; use CSS.
      if (device !== "desktop") {
        for (const k of Object.keys(st)) {
          if (/^border-(top|right|bottom|left)-(style|color)$/.test(k) && st[k] !== snapshots.desktop[k]) (kind === "button" ? inner : outer)[k] = st[k];
        }
        if ((/grid/.test(snapshots.desktop.display) || snapshots.desktop.display === "none" || st.display === "none") && st.display !== snapshots.desktop.display) outer.display = st.display;
      }
      function rule(data, suffix) {
        const body = Object.entries(data).map(([k,v]) => `${k}:${v} !important;`).join("");
        return body ? `.${className}${suffix || ""}{${body}}` : "";
      }
      const css = rule(outer) + rule(inner, " .elementor-button");
      if (css) {
        const media = device === "tablet" ? "(min-width:768px) and (max-width:1024px)" : device === "mobile" ? "(max-width:767px)" : "(min-width:1025px)";
        if (!ctx.rangeSpecs || !ctx.rangeSpecs.length) ctx.generatedCss.push(`/* H2E_DEVICE_START */@media ${media}{${css}}/* H2E_DEVICE_END */`);
        ctx.previewCss[device] += css;
      }
    }
  }

  function sourceBreakpointCss(settings, el, ctx) {
    if (!el._h2eRanges || !el._h2eResponsiveClass) return;
    const cls = el._h2eResponsiveClass;
    const selector = `.elementor .elementor-element.${cls}.${cls}`;
    const button = settings.button_text_padding != null;
    const icon = settings.selected_icon && !button;
    const text = settings.header_size || settings.editor != null;
    const layout = settings.flex_direction != null;
    el._h2eRanges.forEach((st,i) => {
      const range = ctx.rangeSpecs[i]; if (!range) return;
      const outer = {}, inner = {};
      for (const [k,v] of Object.entries(st)) {
        if (!/^(display|direction|box-sizing|width|height|min-width|max-width|min-height|max-height|flex-direction|flex-wrap|flex-grow|flex-shrink|flex-basis|order|justify-content|align-items|align-self|gap|row-gap|column-gap|grid-template-columns|grid-template-rows|grid-auto-flow|grid-column|grid-row|padding-(top|right|bottom|left)|margin-(top|right|bottom|left)|border-(top|right|bottom|left)-(width|style|color)|border-(top-left|top-right|bottom-left|bottom-right)-radius|color|background-color|font-size|font-weight|line-height|letter-spacing|text-align)$/.test(k)) continue;
        if (k === "display" && !layout && v !== "none" && !el._h2eRanges.some(x=>x.display === "none")) continue;
        const typography = /^(font-|line-height|letter-spacing|color|text-align)/.test(k);
        const content = (button && /^(padding-|border-|background-color|font-|color|line-height|letter-spacing|text-align)/.test(k)) || ((text || icon) && typography);
        (content ? inner : outer)[k] = v;
      }
      if(el._h2eInlineFlow && outer.display!=="none"){outer.display=String(st.display).startsWith("inline")?"inline-flex":"flex";outer["flex-direction"]="row";outer["flex-wrap"]="wrap";}
      const declarations = obj => Object.entries(obj).map(([k,v])=>`${k}:${v}${(k === "display" && el._h2eRanges.some(x=>x.display === "none")) || /^border-(top|right|bottom|left)-(style|color)$/.test(k) ? " !important" : ""};`).join("");
      const target = button ? " .elementor-button" : icon ? " .elementor-icon" : settings.header_size ? " .elementor-heading-title" : " > .elementor-widget-container";
      const css = `${selector}{${declarations(outer)}}` + (Object.keys(inner).length ? `${selector}${target}{${declarations(inner)}}` : "");
      const conditions = [];
      if (range.min) conditions.push(`(min-width:${Number(range.min.toFixed(3))}px)`);
      if (range.max != null) conditions.push(`(max-width:${Number(range.max.toFixed(3))}px)`);
      ctx.generatedCss.push(`/* H2E_SOURCE_START */@media ${conditions.join(" and ") || "all"}{${css}}/* H2E_SOURCE_END */`);
    });
  }

  function withClasses(settings, el, extraClass, ctx) {
    const st = styleOf(el);
    const parentDisplay = styleOf(el.parentElement).display || "block";
    // A normal-flow block fills its containing block even with auto side margins.
    // In Elementor it becomes a flex child; explicitly preserve that width.
    if (!st.width && /^(block|flex|grid)$/.test(st.display || "") && !/flex|grid/.test(parentDisplay)) {
      const sides = [st["margin-left"], st["margin-right"], ...(st["box-sizing"] === "content-box" ? [st["padding-left"],st["padding-right"],st["border-left-width"],st["border-right-width"]] : [])].filter(v=>v && v!=="auto" && parseFloat(v)!==0);
      const width = sides.length ? { unit:"custom", size:"calc(100% - " + sides.join(" - ") + ")" } : { unit:"%", size:100 };
      if (settings.flex_direction) settings.width = width;
      else if (!settings.html && !settings.image) { settings._element_width = "initial"; settings._element_custom_width = width; }
    }
    if (settings.flex_direction) {
      const cls = "h2e-flow-"+uid();
      ctx.previewFlows = ctx.previewFlows || {};
      const flow = value => el._h2eInlineFlow && !/flex|grid|none/.test(value || "") ? (String(value).startsWith("inline") ? "inline-flex" : "flex") : value || "block";
      ctx.previewFlows[cls] = { desktop: flow(st.display), tablet: flow(el._h2eResponsive?.tablet?.display || st.display), mobile: flow(el._h2eResponsive?.mobile?.display || st.display) };
      if(el._h2eInlineFlow)ctx.generatedCss.push(`.${cls}{display:${flow(st.display)};flex-direction:row;flex-wrap:wrap}`);
      extraClass = [extraClass,cls].filter(Boolean).join(" ");
    }
    if(!st.width && /^inline/.test(st.display||"") && !settings.flex_direction)settings._element_width="auto";
    responsiveSettings(settings, el, ctx);
    sourceBreakpointCss(settings, el, ctx);
    const keep = [];
    if (ctx.options.keepClasses) {
      classNames(el).forEach((c) => {
        if (!/^h2e-/.test(c) && !(isIcon(el) && /^(fa[bsr]?|fa-)/.test(c))) keep.push(c);
      });
    }
    if (extraClass) keep.push(extraClass);
    if (el._h2eResponsiveClass) keep.push(el._h2eResponsiveClass);
    if (attr(el, "id")) settings._element_id = attr(el, "id");
    if (keep.length) settings._css_classes = keep.join(" ");
    return settings;
  }

  /* ---------- Widget makers ---------- */

  function makeHeading(el, ctx) {
    const tag = el.tagName.toLowerCase();
    const settings = {
      title: innerHtml(el) && el.querySelector("a, span, strong, em, br") ? innerHtml(el) : textContent(el),
      header_size: /^h[1-6]$/.test(tag) ? tag : "h2",
    };
    applyUtilities(classStr(el), settings, "heading");
    const st = styleOf(el);
    const { leftover } = applyInline(st, settings, "heading");
    const extra = leftoverClass(leftover, ctx);
    withClasses(settings, el, extra, ctx);
    ctx.stats.widgets.heading = (ctx.stats.widgets.heading || 0) + 1;
    return elWidget("heading", settings);
  }

  function makeText(el, ctx, htmlOverride) {
    let html = htmlOverride != null ? htmlOverride : innerHtml(el);
    const tag = el.tagName.toLowerCase();
    if (tag === "p" && html && html.indexOf("<p") === -1) {
      /* keep as-is inside text-editor; Elementor wraps */
    }
    if (tag === "blockquote") html = `<blockquote>${innerHtml(el)}</blockquote>`;
    if (tag === "pre") html = `<pre>${escapeHtml(el.textContent || "")}</pre>`;
    if (!html) html = `<p>${escapeHtml(textContent(el))}</p>`;
    const settings = { editor: html };
    const retainsOuter = htmlOverride != null && htmlOverride === el.outerHTML;
    applyUtilities(classStr(el), settings, "text");
    const st = styleOf(el);
    const { leftover } = applyInline(st, settings, "text");
    const extra = leftoverClass(leftover, ctx);
    withClasses(settings, el, extra, ctx);
    if(retainsOuter){
      settings._margin=dimBox(0);settings._padding=dimBox(0);settings._border_border="none";settings._border_width=dimBox(0);delete settings._css_classes;delete settings._element_id;
      for(const device of ["tablet","mobile"]){settings["_margin_"+device]=dimBox(0);settings["_padding_"+device]=dimBox(0);}
    }
    ctx.stats.widgets["text-editor"] = (ctx.stats.widgets["text-editor"] || 0) + 1;
    return elWidget("text-editor", settings);
  }

  function resolveSrc(el) {
    return attr(el, "src") || attr(el, "data-src") || attr(el, "data-lazy-src") || attr(el, "data-original") || "";
  }

  function makeImage(el, ctx) {
    let img = el;
    let caption = "";
    if (el.tagName.toLowerCase() === "figure") {
      img = el.querySelector("img") || el;
      const cap = el.querySelector("figcaption");
      if (cap) caption = textContent(cap);
    }
    if (el.tagName.toLowerCase() === "picture") {
      img = el.querySelector("img") || el;
    }
    const src = resolveSrc(img);
    const alt = attr(img, "alt");
    const settings = {
      image: { url: src, id: "", alt: alt },
      image_size: "full",
      caption_source: caption ? "custom" : "none",
    };
    if (caption) settings.caption = caption;
    if (alt) settings.caption_source = settings.caption_source || "none";
    const parent = el.parentElement;
    if (parent && parent.tagName && parent.tagName.toLowerCase() === "a") {
      settings.link_to = "custom";
      settings.link = { url: attr(parent, "href"), is_external: attr(parent, "target") === "_blank" ? "on" : "", nofollow: "" };
    }
    applyUtilities(classStr(img) + " " + classStr(el), settings, "image");
    const st = Object.assign({}, styleOf(el), styleOf(img));
    const { leftover } = applyInline(st, settings, "image");
    const extra = leftoverClass(leftover, ctx);
    withClasses(settings, el, extra, ctx);
    const wAttr = attr(img, "width");
    if (wAttr && /^\d+$/.test(wAttr) && !(img._h2eDeclared && img._h2eDeclared.width)) settings.width = { unit: "px", size: parseInt(wAttr, 10) };
    if (settings.width) { settings._element_width = "initial"; settings._element_custom_width = settings.width; settings.width = { unit: "%", size: 100 }; }
    ctx.stats.widgets.image = (ctx.stats.widgets.image || 0) + 1;
    if (!src) ctx.warnings.push("تصویر بدون src پیدا شد.");
    return elWidget("image", settings);
  }

  function makeButton(el, ctx) {
    const tag = el.tagName.toLowerCase();
    let text = textContent(el);
    let href = "";
    if (tag === "a") href = attr(el, "href");
    href = attr(el,"data-h2e-link") || href;
    if (tag === "input") text = attr(el, "value") || text || "ارسال";
    if (tag === "button" && el.closest && el.closest("a")) href = attr(el.closest("a"), "href");
    if (!text) text = "دکمه";
    const icon = el.querySelector(ICON_SELECTOR);
    if (icon) { const copy = el.cloneNode(true); copy.querySelector(ICON_SELECTOR).remove(); text = textContent(copy); }
    const settings = {
      text,
      ...(icon ? { selected_icon: selectedIcon(icon), icon_align: el.lastElementChild === icon ? "right" : "left" } : {}),
      link: { url: href || "#", is_external: attr(el, "target") === "_blank" ? "on" : "", nofollow: "" },
    };
    applyUtilities(classStr(el), settings, "button");
    if (/\bbtn-outline|\bbtn-outline-/.test(classStr(el))) {
      settings.button_background_hover_color = settings.background_color || "#0d6efd";
      settings.background_color = "#00000000";
      settings.border_border = "solid";
      settings.border_width = dimBox(1);
      settings.border_color = settings.button_background_hover_color;
      settings.button_text_color = settings.button_background_hover_color;
    }
    const st = styleOf(el);
    const { leftover } = applyInline(st, settings, "button");
    settings._padding = dimBox(0);
    const reset = "h2e-button-" + uid();
    ctx.generatedCss.push(`.${reset}{padding:0;background:none;border:0;box-shadow:none} .${reset} .elementor-button{line-height:inherit}`);

    const inner = {};
    Object.keys(leftover).filter(k => /^(border|background|box-shadow)/.test(k)).forEach(k => { inner[k] = leftover[k]; delete leftover[k]; });
    const outerClass = leftoverClass(leftover, ctx);
    const innerClass = leftoverClass(inner, ctx, " .elementor-button");
    const extra = [outerClass, innerClass].filter(Boolean).join(" ");
    withClasses(settings, el, extra, ctx);
    settings._css_classes = ((settings._css_classes || "") + " " + reset).trim();
    ctx.stats.widgets.button = (ctx.stats.widgets.button || 0) + 1;
    return elWidget("button", settings);
  }

  function makeDivider(el, ctx) {
    const settings = { style: "solid" };
    const st = styleOf(el);
    if (st["border-color"] || st.color) settings.color = rgbToHex(st["border-color"] || st.color);
    applyUtilities(classStr(el), settings, "container");
    withClasses(settings, el, null, ctx);
    ctx.stats.widgets.divider = (ctx.stats.widgets.divider || 0) + 1;
    return elWidget("divider", settings);
  }

  function makeSpacer(height, ctx) {
    ctx.stats.widgets.spacer = (ctx.stats.widgets.spacer || 0) + 1;
    return elWidget("spacer", { space: { unit: "px", size: height || 40 } });
  }

  function youtubeId(url) {
    if (!url) return null;
    const m =
      url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/) ||
      url.match(/youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function vimeoId(url) {
    if (!url) return null;
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function makeVideoOrHtml(el, ctx) {
    const src = attr(el, "src") || "";
    const yt = youtubeId(src);
    if (yt) {
      ctx.stats.widgets.video = (ctx.stats.widgets.video || 0) + 1;
      return elWidget("video", {
        video_type: "youtube",
        youtube_url: "https://www.youtube.com/watch?v=" + yt,
      });
    }
    const vm = vimeoId(src);
    if (vm) {
      ctx.stats.widgets.video = (ctx.stats.widgets.video || 0) + 1;
      return elWidget("video", {
        video_type: "vimeo",
        vimeo_url: "https://vimeo.com/" + vm,
      });
    }
    return makeHtmlWidget(el, ctx);
  }

  function makeList(el, ctx) {
    const items = childrenOf(el).filter((c) => c.tagName && c.tagName.toLowerCase() === "li");
    const simple = items.every((li) => {
      const nested = li.querySelector("ul, ol, img, table, form, video, iframe");
      return !nested;
    });
    if (!simple || !items.length || !items.every(li => li.querySelector(ICON_SELECTOR))) {
      return makeText(el, ctx, el.outerHTML);
    }
    const icon_list = items.map((li) => {
      const a = li.querySelector("a");
      const item = {
        _id: uid(),
        text: textContent(li),
        selected_icon: selectedIcon(li.querySelector(ICON_SELECTOR)),
      };
      if (a) item.link = { url: attr(a, "href") };
      return item;
    });
    return nativeWidget("icon-list", el, ctx, { icon_list, view: "traditional" });
  }

  function makeHtmlWidget(el, ctx, htmlOverride) {
    const html = htmlOverride != null ? htmlOverride : el.outerHTML;
    const settings = { html };
    withClasses(settings, el, null, ctx);
    ctx.stats.widgets.html = (ctx.stats.widgets.html || 0) + 1;
    ctx.stats.htmlFallbacks += 1;
    return elWidget("html", settings);
  }

  function makeIconBox(el, ctx) {
    const media = el.querySelector("img," + ICON_SELECTOR);
    const title = el.querySelector("h1,h2,h3,h4,h5,h6,.title");
    const desc = el.querySelector("p,.description,.desc");
    if (!media || !title || el.querySelector("a,button,form,ul,ol")) return null;
    const type = media.tagName.toLowerCase() === "img" ? "image-box" : "icon-box";
    const st = styleOf(el);
    const settings = { title_text: textContent(title), description_text: textContent(desc), title_size: /^h[1-6]$/i.test(title.tagName) ? title.tagName.toLowerCase() : "h3", position: /row/.test(st["flex-direction"] || "") ? (st.direction === "rtl" ? "right" : "left") : "top" };
    if (type === "image-box") settings.image = { url: resolveSrc(media), id: 0 };
    else { settings.selected_icon = selectedIcon(media); settings.icon_size = sizeObj(styleOf(media)["font-size"]); settings.primary_color = rgbToHex(styleOf(media).color); }
    [[title,"title"],[desc,"description"]].forEach(([node,prefix]) => {
      if (!node) return;
      const local = {}; applyInline(styleOf(node), local, "text");
      Object.keys(local).filter(k => k.startsWith("typography_")).forEach(k => settings[prefix + "_" + k] = local[k]);
      settings[prefix + "_color"] = local.text_color;
    });
    return nativeWidget(type, el, ctx, settings);
  }

  const ICON_SELECTOR = 'svg,i.bx,i.bi,i[class*="ri-"],i[class*="ti-"],.iconify,[data-icon],[data-feather],i.fa,i.fas,i.far,i.fab,span.fa,span.fas,span.far,span.fab,.fa-solid,.fa-regular,.fa-brands,i[class*="fa-"],span[class*="fa-"],i[class*="bi-"],i[class*="icon-"],.material-icons,.material-symbols-outlined,[data-lucide],svg.icon,svg[data-icon],svg.lucide,svg.feather,svg[width="24"],svg[width="16"],svg[width="20"],svg[width="32"],svg[width="1em"],[data-h2e-widget="icon"],img.icon';
  function isIcon(el) {
    if(!el||!el.matches)return false;
    if(el.tagName.toLowerCase()==="svg"){
      if(/icon|lucide|feather|fa-/i.test(classStr(el))||el.hasAttribute("data-icon"))return true;
      const box=(attr(el,"viewBox")||"").trim().split(/[ ,]+/).map(Number);
      const w=parseFloat(attr(el,"width")||styleOf(el).width),h=parseFloat(attr(el,"height")||styleOf(el).height);
      return (box.length===4&&box[2]<=64&&box[3]<=64)||(w>0&&w<=96&&(!h||h<=96));
    }
    return el.matches(ICON_SELECTOR)||(/^(i|span)$/i.test(el.tagName)&&/(?:^|\s)(?:icon|icon-[\w-]+|[\w-]+-icon)(?:\s|$)/i.test(classStr(el)));
  }
  function selectedIcon() { return { value: "", library: "" }; }

  function nativeWidget(type, el, ctx, settings, kind) {
    applyUtilities(classStr(el), settings, kind || "text");
    const { leftover } = applyInline(styleOf(el), settings, kind || "text");
    withClasses(settings, el, leftoverClass(leftover, ctx), ctx);
    if (type === "icon") {
      settings._css_classes = ((settings._css_classes || "") + " h2e-empty-icon").trim();
      settings.selected_icon = selectedIcon();
      settings.icon = "";
      settings.view = "default";
      const width = sizeObj(styleOf(el).width || attr(el, "width"));
      if (width) settings.size = width;
      for (const device of ["tablet", "mobile"]) {
        const st = (el._h2eResponsive || {})[device] || {};
        const w = sizeObj(st.width || attr(el, "width"));
        if (w) settings["size_"+device] = w;
      }
    }
    ctx.stats.widgets[type] = (ctx.stats.widgets[type] || 0) + 1;
    return elWidget(type, settings);
  }
  function detectWidget(el, ctx) {
    const tag = el.tagName.toLowerCase();
    const cls = classStr(el);
    const hint = attr(el, "data-h2e-widget") || attr(el, "data-widget_type").split(".")[0];
    const is = (type, re) => hint === type || (re && re.test(cls));
    const txt = selector => textContent(el.querySelector(selector));
    if (isIcon(el)) return nativeWidget("icon", el, ctx, { selected_icon: selectedIcon(el), view: "default" }, "icon");
    if (tag === "a" && childrenOf(el).length === 1 && isIcon(el.firstElementChild) && !textContent(el.cloneNode(true)).replace(textContent(el.firstElementChild), "").trim()) {
      const w = nativeWidget("icon", el, ctx, { selected_icon: selectedIcon(el.firstElementChild), link: { url: attr(el, "href") } }, "icon");
      const sz = sizeObj(styleOf(el.firstElementChild)["font-size"]);
      if (sz) w.settings.size = sz;
      return w;
    }
    // Social groups stay containers with individually editable, empty icon widgets.
    if (is("image-gallery", /\b(image-gallery|gallery)\b/) || is("image-carousel", /\b(image-carousel|carousel|swiper|owl-carousel)\b/)) {
      const imgs = Array.from(el.querySelectorAll("img"));
      // Captions, buttons and text need their own layout instead of being discarded.
      if (imgs.length > 1 && !textContent(el)) {
        const carousel = is("image-carousel", /\b(image-carousel|carousel|swiper|owl-carousel)\b/);
        return nativeWidget(carousel ? "image-carousel" : "image-gallery", el, ctx, {
          [carousel ? "carousel" : "gallery"]: imgs.map(img => ({ id: 0, url: resolveSrc(img), alt: attr(img, "alt") })),
          [carousel ? "slides_to_show" : "gallery_columns"]: "3", image_size: "full"
        });
      }
    }
    if (tag === "details" || is("accordion", /\b(accordion|faq)\b/) || is("toggle", /\btoggle\b/) || is("tabs", /\btabs\b/)) {
      let tabs = [];
      const details = tag === "details" ? [el] : Array.from(el.querySelectorAll(":scope > details"));
      if (details.length) tabs = details.map(d => {
        const summary = d.querySelector("summary");
        const copy = d.cloneNode(true); const sum = copy.querySelector("summary"); if (sum) sum.remove();
        return { _id: uid(), tab_title: textContent(summary), tab_content: copy.innerHTML };
      });
      if (!tabs.length) {
        const heads = Array.from(el.querySelectorAll('[role="tab"],.accordion-button,.accordion-header,.tab-title'));
        tabs = heads.map(h => {
          const id = attr(h, "aria-controls") || attr(h, "data-bs-target").replace(/^#/, "") || attr(h, "href").replace(/^#/, "");
          let panel = id && el.ownerDocument.getElementById(id);
          if (!panel) panel = h.parentElement.querySelector(".accordion-body,.tab-content,.panel-body");
          return panel && el.contains(panel) ? { _id: uid(), tab_title: textContent(h), tab_content: panel.innerHTML } : null;
        }).filter(Boolean);
      }
      if (tabs.length) return nativeWidget(is("tabs", /\btabs\b/) ? "tabs" : is("toggle", /\btoggle\b/) || tag === "details" ? "toggle" : "accordion", el, ctx, { tabs });
    }
    if (is("counter", /\b(counter|stat-counter)\b/) || el.hasAttribute("data-counter")) {
      const n = el.querySelector("[data-count],.counter-number,.number");
      const raw = attr(el, "data-counter") || attr(el, "data-count") || (n && (attr(n, "data-count") || textContent(n))) || textContent(el);
      const number = String(raw).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      if (number) return nativeWidget("counter", el, ctx, { starting_number: 0, ending_number: Number(number[0]), title: txt(".counter-title,.label,h3,p"), prefix: attr(el, "data-prefix"), suffix: attr(el, "data-suffix"), duration: 2000 });
    }
    if (tag === "progress" || attr(el, "role") === "progressbar" || is("progress", /\bprogress\b/)) {
      const bar = el.querySelector('[role="progressbar"],.progress-bar') || el;
      const val = Number(attr(bar, "aria-valuenow") || attr(bar, "value") || parseFloat(styleOf(bar).width) || 0);
      const max = Number(attr(bar, "aria-valuemax") || attr(bar, "max") || 100);
      return nativeWidget("progress", el, ctx, { title: attr(el, "aria-label") || txt(".progress-title,label"), percent: { unit: "%", size: Math.max(0, Math.min(100, val / (max || 100) * 100)) }, display_percentage: "show", inner_text: textContent(bar) });
    }
    if (is("alert", /\balert\b/) || attr(el, "role") === "alert") {
      const title = el.querySelector(".alert-heading,h2,h3,h4,strong");
      const copy = el.cloneNode(true); const h = copy.querySelector(".alert-heading,h2,h3,h4,strong"); if (h) h.remove();
      copy.querySelectorAll("button,.close").forEach(n => n.remove());
      const type = (cls.match(/alert-(info|success|warning|danger)/) || [])[1] || "info";
      return nativeWidget("alert", el, ctx, { alert_type: type, alert_title: textContent(title), alert_description: copy.innerHTML, show_dismiss: el.querySelector("button,.close") ? "show" : "hide" });
    }
    if (is("testimonial", /\btestimonial\b/)) {
      const image = el.querySelector("img");
      return nativeWidget("testimonial", el, ctx, { testimonial_content: txt("blockquote,.testimonial-content,p"), testimonial_name: txt("cite,.testimonial-name,.name"), testimonial_job: txt(".testimonial-job,.job"), testimonial_image: { url: image ? resolveSrc(image) : "", id: 0 } });
    }
    if (is("star-rating", /\b(star-rating|rating)\b/) && el.hasAttribute("data-rating")) {
      return nativeWidget("star-rating", el, ctx, { rating: Math.max(0, Math.min(5, Number(attr(el, "data-rating")) || 0)), title: attr(el, "aria-label") });
    }
    if (tag === "iframe") {
      const src = attr(el, "src");
      if (/google\.[^/]+\/maps|maps\.google\./.test(src)) {
        try {
          const url = new URL(src, "https://maps.google.com");
          const address = url.searchParams.get("q") || url.searchParams.get("query");
          if (address) return nativeWidget("google_maps", el, ctx, { address, zoom: { size: Number(url.searchParams.get("z")) || 14, unit: "px" } });
        } catch (_) {}
        return makeHtmlWidget(el, ctx); // opaque pb= embeds retain the exact location
      }
      if (/soundcloud\.com/.test(src)) return nativeWidget("audio", el, ctx, { link: src });
    }
    if (tag === "video") {
      const src = resolveSrc(el) || resolveSrc(el.querySelector("source"));
      if (src && !el.querySelector("track") && el.querySelectorAll("source").length <= 1) return nativeWidget("video", el, ctx, { video_type: "hosted", hosted_url: { url: src, id: 0 }, autoplay: el.hasAttribute("autoplay") ? "yes" : "", loop: el.hasAttribute("loop") ? "yes" : "", mute: el.hasAttribute("muted") ? "yes" : "" });
    }
    if (hint === "menu-anchor" || (tag === "a" && attr(el, "id") && !attr(el, "href") && !textContent(el))) return nativeWidget("menu-anchor", el, ctx, { anchor: attr(el, "id") });
    if (hint === "shortcode") return nativeWidget("shortcode", el, ctx, { shortcode: textContent(el) });
    if (hint === "read-more") return nativeWidget("read-more", el, ctx, { link: { url: attr(el, "href") } });
    return null;
  }

  /* ---------- Tree walk ---------- */

  function convertChildren(parent, ctx, depth) {
    const out = [];
    if (!parent || !parent.childNodes) return out;
    let inlineBuf = [];

    const flushInline = () => {
      const html = inlineBuf.join("").replace(/\s+/g, " ").trim();
      inlineBuf = [];
      if (!html) return;
      const heading = /^h[1-6]$/i.test(parent.tagName);
      const dummy = parent.ownerDocument.createElement(heading ? parent.tagName.toLowerCase() : "span");
      dummy.innerHTML = html;
      dummy._h2eEff = {display:"inline-block"};
      INHERIT_PROPS.forEach(k => { if (styleOf(parent)[k]) dummy._h2eEff[k] = styleOf(parent)[k]; });
      dummy._h2eResponsive = {};
      for (const [device, st] of Object.entries(parent._h2eResponsive || {})) {
        dummy._h2eResponsive[device] = {};
        INHERIT_PROPS.forEach(k => { if (st[k]) dummy._h2eResponsive[device][k] = st[k]; });
      }
      out.push(heading ? makeHeading(dummy, ctx) : makeText(dummy, ctx, html));
    };

    const nodes = Array.from(parent.childNodes);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === 8) continue;
      if (node.nodeType === 3) {
        if (String(node.textContent || "").trim()) inlineBuf.push(escapeHtml(node.textContent));
        continue;
      }
      if (!isElement(node)) continue;
      const tag = node.tagName.toLowerCase();
      if (SKIP_ALWAYS.has(tag) || node.hasAttribute("hidden")) continue;
      if (styleOf(node).display === "none" && !Object.values(node._h2eResponsive || {}).some(st => st.display !== "none")) continue;

      if (tag === "br") {
        inlineBuf.push("<br>");
        continue;
      }

      if (INLINE_TAGS.has(tag) && !looksLikeButton(node) && !isIcon(node) && !node.querySelector(ICON_SELECTOR) && !/flex|grid/.test(styleOf(parent).display || "") && !attr(node, "data-h2e-widget") && tag !== "label") {
        inlineBuf.push(node.outerHTML);
        continue;
      }

      flushInline();
      const converted = convertElement(node, ctx, depth);
      if (Array.isArray(converted)) converted.forEach((x) => x && out.push(x));
      else if (converted) out.push(converted);
    }
    flushInline();
    return out;
  }

  function convertElement(el, ctx, depth) {
    const tag = el.tagName.toLowerCase();
    const mode = ctx.options.mode;

    if (SKIP_ALWAYS.has(tag)) return null;

    if (el.hasAttribute && el.hasAttribute("hidden")) return null;
    const st0 = styleOf(el);
    if (st0.display === "none" && !Object.values(el._h2eResponsive || {}).some(st => st.display !== "none")) return null;
    if (/\bd-none\b/.test(classStr(el)) && !/\bd-md-block\b|\bd-lg-block\b|\bd-flex\b/.test(classStr(el))) {
      /* still convert; might be responsive. keep it. */
    }

    const forced=attr(el,"data-h2e-widget");
    if(forced==="ignore")return null;
    if(mode!=="html") {
      if(forced==="icon")return nativeWidget("icon",el,ctx,{selected_icon:selectedIcon(),view:"default"},"icon");
      if(forced==="button")return makeButton(el,ctx);
      if(forced==="text-editor")return makeText(el,ctx);
      if(forced==="heading")return makeHeading(el,ctx);
      if(forced==="html")return makeHtmlWidget(el,ctx);
      if(forced==="container")return makeLayout(el,ctx,depth);
      if(forced==="image")return makeImage(el.querySelector("img")||el,ctx);
    }
    if (mode !== "html" && looksLikeButton(el)) return makeButton(el, ctx);
    if (mode !== "html") {
      const widget = detectWidget(el, ctx);
      if (widget) return widget;
    }
    if (tag === "iframe") return makeVideoOrHtml(el, ctx);
    if (tag === "svg") {
      if (isIcon(el)) return nativeWidget("icon", el, ctx, {selected_icon:selectedIcon(),view:"default"}, "icon");
      const img=el.ownerDocument.createElement("img");
      const svg=el.cloneNode(true);svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
      img.setAttribute("src","data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg.outerHTML));
      img._h2eEff=styleOf(el);img._h2eResponsive=el._h2eResponsive;img.setAttribute("class",classStr(el));
      return makeImage(img,ctx);
    }
    if (tag === "canvas" || tag === "video" || tag === "audio" || tag === "object" || tag === "embed") {
      return makeHtmlWidget(el, ctx);
    }
    if (["form", "table", "select", "textarea"].includes(tag) || (tag === "input" && !looksLikeButton(el))) return makeHtmlWidget(el, ctx);

    if (mode === "html") {
      if (depth === 0) return makeHtmlWidget(el, ctx);
      return makeHtmlWidget(el, ctx);
    }

    if ((/^h[1-6]$/.test(tag) || tag === "p") && el.querySelector(ICON_SELECTOR)) return makeLayout(el, ctx, depth);
    if (/^h[1-6]$/.test(tag)) return makeHeading(el, ctx);
    if (tag === "p" && !el.querySelector("img,svg,iframe,video")) return makeText(el, ctx);
    if (tag === "blockquote" || tag === "pre") return makeText(el, ctx);
    if (tag === "img" || tag === "picture" || (tag === "figure" && el.querySelectorAll("img").length === 1)) return makeImage(el, ctx);
    if (looksLikeButton(el)) return makeButton(el, ctx);
    if (tag === "hr") return makeDivider(el, ctx);
    if (tag === "ul" || tag === "ol") return el.querySelector(ICON_SELECTOR) ? makeLayout(el, ctx, depth) : makeList(el, ctx);
    if (tag === "a") {
      if (el.querySelector(ICON_SELECTOR)) return makeLayout(el, ctx, depth);
      if (el.querySelector("img") && childrenOf(el).length === 1) return makeImage(el.querySelector("img"), ctx);
      return makeText(el, ctx, el.outerHTML);
    }

    /* empty spacer */
    const kids = childrenOf(el);
    if (!kids.length && !textContent(el)) {
      const h = parseLen(st0.height || st0["min-height"]);
      if (h && h.size >= 8) return nativeWidget("spacer", el, ctx, { space: { unit: h.unit, size: h.size } });
      return null;
    }

    if (isLayoutEl(el) || kids.length) {
      return makeLayout(el, ctx, depth);
    }

    if (textContent(el)) return makeText(el, ctx);
    return null;
  }

  function containerSettingsFrom(el, ctx, depth, asRow) {
    const settings = {
      content_width: depth === 0 ? "full" : "full",
      flex_direction: asRow ? "row" : "column",
      flex_wrap: "nowrap",
    };
    const tag = el.tagName.toLowerCase();
    if (SEMANTIC_TAGS.has(tag)) settings.html_tag = tag === "nav" ? "nav" : tag;

    if (!el._h2eDeclared && /\bcontainer\b/.test(classStr(el)) && !/\bcontainer-fluid\b/.test(classStr(el))) {
      settings.content_width = "boxed";
      settings.boxed_width = { unit: "px", size: 1140 };
    }
    if (/\bcontainer-fluid\b|\bhero\b|\bbanner\b|\bsite-header\b|\bsite-footer\b/.test(classStr(el))) {
      settings.content_width = "full";
    }
    settings.flex_gap = flexGap(0);
    settings.padding = dimBox(0);

    applyUtilities(classStr(el), settings, "container");
    const st = styleOf(el);
    const { leftover } = applyInline(st, settings, "container");
    const extra = leftoverClass(leftover, ctx);
    if (st.display && !/flex|grid/.test(st.display)) {
      settings.flex_direction = "column";
      settings.flex_gap = flexGap(0);
    }
    if (!/flex|grid/.test(st.display || "") && el.querySelector(ICON_SELECTOR) && ["p","li","a","h1","h2","h3","h4","h5","h6"].includes(tag)) {
      el._h2eInlineFlow = true;
      settings.flex_direction = "row"; settings.flex_wrap = "wrap"; settings.flex_align_items = "center";
    }
    withClasses(settings, el, extra, ctx);
    return settings;
  }

  function wrapAsColumnOrChild(childEl, converted, widthPct, ctx, depth, layoutMode) {
    const nodes = Array.isArray(converted) ? converted : converted ? [converted] : [];
    if (layoutMode === "section") {
      const extra = {};
      applyUtilities(classStr(childEl), extra, "column");
      const st = styleOf(childEl);
      applyInline(st, extra, "column");
      withClasses(extra, childEl, null, ctx);
      return elColumn(snapCol(widthPct), nodes, extra);
    }
    const settings = containerSettingsFrom(childEl, ctx, depth + 1, false);
    settings.content_width = "full";
    settings.width = { unit: "%", size: widthPct };
    settings.flex_direction = "column";
    return elContainer(settings, nodes, true);
  }

  function snapCol(n) {
    const allowed = [10, 14, 16, 20, 25, 30, 33, 40, 50, 60, 66, 70, 75, 80, 83, 90, 100];
    let best = 100, diff = 999;
    for (const a of allowed) {
      const d = Math.abs(a - n);
      if (d < diff) {
        best = a;
        diff = d;
      }
    }
    return best;
  }

  function makeLayout(el, ctx, depth) {
    const layoutMode = ctx.options.layout;
    const asRow = isRowEl(el);
    const kids = childrenOf(el).filter((c) => !SKIP_ALWAYS.has(c.tagName.toLowerCase()));

    if (layoutMode !== "section") {
      const settings = containerSettingsFrom(el, ctx, depth, asRow);
      const inner = convertChildren(el, ctx, depth + 1);
      ctx.stats.containers += 1;
      return elContainer(settings, inner, depth > 0);
    }

    if (asRow && kids.length >= 2) {
      const widths = kids.map((k) => colWidth(k, kids.length));
      const sum = widths.reduce((a, b) => a + b, 0);
      const norm = sum > 0 ? widths.map((w) => Math.max(8, Math.round((w / sum) * 100))) : kids.map(() => Math.round(100 / kids.length));

      if (layoutMode === "section") {
        const columns = kids.map((k, i) => {
          const converted = convertChildren(k, ctx, depth + 1);
          const direct = converted.length ? converted : (() => {
            const one = convertElement(k, ctx, depth + 1);
            return Array.isArray(one) ? one : one ? [one] : [];
          })();
          return wrapAsColumnOrChild(k, direct, norm[i], ctx, depth, "section");
        });
        const settings = {};
        applyUtilities(classStr(el), settings, "section");
        const st = styleOf(el);
        applyInline(st, settings, "section");
        settings.layout = depth === 0 ? "full_width" : "boxed";
        settings.gap = "default";
        withClasses(settings, el, null, ctx);
        ctx.stats.sections += 1;
        return elSection(settings, columns, depth > 0);
      }

      const childCons = kids.map((k, i) => {
        let converted = convertChildren(k, ctx, depth + 1);
        if (!converted.length) {
          const one = convertElement(k, ctx, depth + 1);
          converted = Array.isArray(one) ? one : one ? [one] : [];
        }
        return wrapAsColumnOrChild(k, converted, norm[i], ctx, depth, "container");
      });
      const settings = containerSettingsFrom(el, ctx, depth, true);
      ctx.stats.containers += 1;
      return elContainer(settings, childCons, depth > 0);
    }

    const inner = convertChildren(el, ctx, depth + 1);
    if (!inner.length) {
      if (textContent(el)) return makeText(el, ctx);
      return null;
    }

    if (layoutMode === "section" && depth === 0) {
      const settings = {};
      applyUtilities(classStr(el), settings, "section");
      applyInline(styleOf(el), settings, "section");
      settings.layout = "full_width";
      withClasses(settings, el, null, ctx);
      ctx.stats.sections += 1;
      return elSection(settings, [elColumn(100, inner, {})], false);
    }

    const settings = containerSettingsFrom(el, ctx, depth, false);
    ctx.stats.containers += 1;
    return elContainer(settings, inner, depth > 0);
  }

  function ensureTopLevel(elements, ctx) {
    const layout = ctx.options.layout;
    if (!elements.length) {
      return [
        layout === "section"
          ? elSection({ layout: "boxed" }, [elColumn(100, [elWidget("heading", { title: "خالی", header_size: "h2" })], {})], false)
          : elContainer({ content_width: "boxed", flex_direction: "column" }, [], false),
      ];
    }
    return elements.map((el) => {
      if (!el) return null;
      if (el.elType === "container" || el.elType === "section") return el;
      if (layout === "section") return elSection({ layout: "boxed" }, [elColumn(100, [el], {})], false);
      return elContainer({ content_width: "boxed", flex_direction: "column", padding: dimBox(20) }, [el], false);
    }).filter(Boolean);
  }

  /* ---------- CSS extraction ---------- */

  function extractCss(doc, extraCssFiles, options, filename) {
    const parts = [], missing = [], used = new Set();
    const basename = p => String(p || "").split(/[?#]/)[0].split(/[/\\]/).pop().toLowerCase();
    const wrap = (css, media) => media && media !== "all" ? `@media ${media}{\n${css}\n}` : css;
    doc.querySelectorAll('style,link[rel~="stylesheet"]').forEach((node,i) => {
      if (node.tagName.toLowerCase() === "style") {
        if(node.textContent.trim()) parts.push(`/* inline style ${i+1}: ${filename} */\n` + wrap(node.textContent, attr(node,"media")));
      } else {
        const href=attr(node,"href");
        const f=(extraCssFiles||[]).find(f=>String(f.name).toLowerCase()===href.toLowerCase()) || (extraCssFiles||[]).find(f=>basename(f.name)===basename(href));
        if(f){parts.push(`/* stylesheet: ${f.name} */\n`+wrap(f.content,attr(node,"media")));used.add(f);}
        else if(href)missing.push(href);
      }
      node.remove();
    });
    (extraCssFiles||[]).filter(f=>!used.has(f)).forEach(f=>parts.push(`/* extra stylesheet: ${f.name} */\n${f.content}`));
    return {parts,missing};
  }

  function scopeCss(css, scope) {
    if (!scope || !css) return css;
    /* naive scoping: prefix selectors except @ rules and :root */
    const chunks = [];
    let i = 0;
    while (i < css.length) {
      if (css[i] === "@") {
        const start = i;
        const brace = css.indexOf("{", i);
        if (brace < 0) {
          chunks.push(css.slice(i));
          break;
        }
        const kw = css.slice(i, brace).trim();
        if (/^@(media|supports|layer|container|keyframes|font-face|page|import)/i.test(kw)) {
          if (/^@(import|font-face|charset|keyframes|page)/i.test(kw)) {
            /* keep whole rule */
            let depth = 0, j = brace;
            for (; j < css.length; j++) {
              if (css[j] === "{") depth++;
              else if (css[j] === "}") {
                depth--;
                if (depth === 0) {
                  j++;
                  break;
                }
              }
            }
            chunks.push(css.slice(start, j));
            i = j;
            continue;
          }
          /* @media: scope inside */
          let depth = 0, j = brace;
          for (; j < css.length; j++) {
            if (css[j] === "{") depth++;
            else if (css[j] === "}") {
              depth--;
              if (depth === 0) {
                j++;
                break;
              }
            }
          }
          const inner = css.slice(brace + 1, j - 1);
          chunks.push(css.slice(start, brace + 1) + "\n" + scopeCss(inner, scope) + "\n}");
          i = j;
          continue;
        }
      }
      const brace = css.indexOf("{", i);
      if (brace < 0) {
        chunks.push(css.slice(i));
        break;
      }
      const selectors = css.slice(i, brace);
      let depth = 0, j = brace;
      for (; j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      const body = css.slice(brace, j);
      const scoped = selectors
        .split(",")
        .map((sel) => {
          const s = sel.trim();
          if (!s) return sel;
          if (s.startsWith("@")) return s;
          if (s.startsWith(":root") || s.startsWith("html") || s.startsWith("body")) {
            return scope + " " + s.replace(/^(html|body)/, "").trim();
          }
          return scope + " " + s;
        })
        .join(", ");
      chunks.push(scoped + body);
      i = j;
    }
    return chunks.join("");
  }

  function buildCssFile(filename, extractedParts, generatedCss, missing, options) {
    const header = [
      "/*",
      " * CSS استخراج‌شده توسط HTML2Elementor",
      " * منبع: " + filename,
      " * تاریخ: " + new Date().toISOString().slice(0, 10),
      " *",
      " * نحوه استفاده در وردپرس:",
      " *  1) ظاهر ← سفارشی‌سازی ← CSS اضافی  (پیست کنید)",
      " *  2) یا این فایل را در قالب enqueue کنید (نمونه PHP همراه خروجی است)",
      " *  3) کلاس‌های اصلی HTML روی ویجت‌های المنتور حفظ شده‌اند (_css_classes)",
      " */",
      "",
    ];
    if (options.rtl) {
      header.push("/* راست‌چین */", ".elementor, .elementor-page, .h2e-root { direction: rtl; text-align: right; }", "");
    }
    header.push("/* Empty icon placeholders: no source glyph is exported. */", ".h2e-empty-icon::before,.h2e-empty-icon::after{content:none!important;background-image:none!important}", "");
    const gen = generatedCss.length
      ? ["/* ——— استایل‌های اینلاین که به تنظیمات المنتور نگاشت نشدند ——— */", ...generatedCss, ""]
      : [];
    let body = extractedParts.concat(gen).join("\n\n");
    if (options.scopeCss) {
      const scope = ".h2e-root, .elementor";
      body = scopeCss(body, scope);
    }
    return header.join("\n") + body + "\n";
  }

  function phpSnippet(cssFile) {
    return `<?php
/**
 * Enqueue converted CSS in WordPress (add to functions.php of your child theme)
 */
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'h2e-converted',
        get_stylesheet_directory_uri() . '/${cssFile}',
        [],
        '1.0.0'
    );
});
`;
  }

  /* ---------- Public convert ---------- */

  function convertHtml(htmlString, extraCssFiles, options, filename) {
    options = Object.assign(
      {
        title: slug(filename),
        docType: "page",
        layout: "container", /* container | section */
        mode: "hybrid", /* native | hybrid | html */
        rtl: true,
        keepClasses: true,
        scopeCss: false,
      },
      options || {}
    );

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const ctx = {
      options,
      generatedCss: [],
      warnings: [],
      stats: { widgets: {}, containers: 0, sections: 0, htmlFallbacks: 0 },
    };

    const extracted = extractCss(doc, extraCssFiles || [], options, filename || "page.html");
    extracted.missing.forEach((m) => ctx.warnings.push("فایل CSS لینک‌شده پیدا نشد: " + m));
    const cssForLayout = extracted.parts.map(function (p) {
      return String(p).replace(/^\/\*[\s\S]*?\*\/\n?/, "");
    }).join("\n");
    applyCssToDoc(doc, cssForLayout);
    bakeInherited(doc);
    measureStyles(doc, cssForLayout, ctx);

    const scriptNodes = Array.from(doc.querySelectorAll("script"));
    const scriptHtml = scriptNodes.map((s) => s.outerHTML).join("\n").trim();
    const bodyHtmlSnapshot = (doc.body || doc.documentElement).innerHTML;
    scriptNodes.forEach((s) => s.remove());

    const body = doc.body || doc.documentElement;
    const pageSettings = {};
    const bodyStyle = styleOf(body);
    const explicitDirection = attr(body, "dir") || attr(doc.documentElement, "dir") || (body._h2eDeclared && body._h2eDeclared.direction) || (doc.documentElement._h2eDeclared && doc.documentElement._h2eDeclared.direction);
    options.rtl = explicitDirection ? bodyStyle.direction === "rtl" : options.rtl;
    if (!explicitDirection && options.rtl) {
      [body, ...body.querySelectorAll("*")].forEach(e => {
        if (!attr(e, "dir") && !(e._h2eDeclared && e._h2eDeclared.direction)) styleOf(e).direction = "rtl";
      });
    }
    if (bodyStyle["background-color"]) {
      pageSettings.background_background = "classic";
      pageSettings.background_color = rgbToHex(bodyStyle["background-color"]);
    }
    if (options.rtl) {
      /* no official key; CSS handles direction */
    }

    let content;
    if (options.mode === "html") {
      const root = `<div class="h2e-root">${bodyHtmlSnapshot}</div>`;
      const inner = elWidget("html", { html: root, _css_classes: "h2e-root" });
      ctx.stats.widgets.html = 1;
      ctx.stats.htmlFallbacks = 1;
      if (options.layout === "section") {
        content = [elSection({ layout: "full_width", stretch_section: "section-stretched" }, [elColumn(100, [inner], {})], false)];
        ctx.stats.sections = 1;
      } else {
        content = [elContainer({ content_width: "full", flex_direction: "column", _css_classes: "h2e-root" }, [inner], false)];
        ctx.stats.containers = 1;
      }
    } else {
      if (options.layout === "container") content = [makeLayout(body, ctx, 0)];
      else content = ensureTopLevel(convertChildren(body, ctx, 0), ctx);
      if (scriptHtml) {
        const htmlW = elWidget("html", { html: scriptHtml });
        ctx.stats.widgets.html = (ctx.stats.widgets.html || 0) + 1;
        if (options.layout === "section") {
          content.push(elSection({ layout: "full_width" }, [elColumn(100, [htmlW], {})], false));
          ctx.stats.sections += 1;
        } else {
          content.push(elContainer({ content_width: "full", flex_direction: "column" }, [htmlW], false));
          ctx.stats.containers += 1;
        }
      }
    }

    if (options.keepClasses) {
      /* add h2e-root on first top-level for CSS targeting */
      if (content[0] && content[0].settings) {
        const cur = content[0].settings._css_classes || "";
        if (!/\bh2e-root\b/.test(cur)) content[0].settings._css_classes = (cur + " h2e-root").trim();
      }
    }

    const titleFromDoc = (doc.querySelector("title") && doc.querySelector("title").textContent.trim()) || options.title;

    const template = {
      version: "0.4",
      title: titleFromDoc || options.title || "Converted Page",
      type: options.docType || "page",
      page_settings: Object.keys(pageSettings).length ? pageSettings : [],
      content,
    };

    const cssText = buildCssFile(filename || "page.html", extracted.parts, ctx.generatedCss, extracted.missing, options);
    const clipboard = { type: "elementor", siteurl: "", elements: content };

    const widgetCount = Object.values(ctx.stats.widgets).reduce((a, b) => a + b, 0);

    return {
      template,
      clipboard,
      css: cssText,
      previewCss: ctx.previewCss || {},
      previewFlows: ctx.previewFlows || {},
      php: phpSnippet(slug(filename) + ".css"),
      warnings: ctx.warnings,
      stats: {
        widgets: widgetCount,
        widgetBreakdown: ctx.stats.widgets,
        containers: ctx.stats.containers,
        sections: ctx.stats.sections,
        htmlFallbacks: ctx.stats.htmlFallbacks,
        cssBytes: cssText.length,
        missingCss: extracted.missing,
      },
      title: template.title,
      rtl: options.rtl,
    };
  }

  /* ---------- ZIP (store) ---------- */

  function crc32(buf) {
    let table = crc32.t;
    if (!table) {
      table = crc32.t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name.replace(/\\/g, "/"));
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      locals.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    });
    const centralSize = centrals.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const parts = locals.concat(centrals);
    parts.push(end);
    let total = 0;
    parts.forEach((p) => (total += p.length));
    const out = new Uint8Array(total);
    let p = 0;
    parts.forEach((x) => {
      out.set(x, p);
      p += x.length;
    });
    return out;
  }

  /* ---------- Image (screenshot of a section) → Elementor ---------- */

  function lum(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function boxStats(data, w, box) {
    const x0 = Math.max(0, box.x | 0);
    const y0 = Math.max(0, box.y | 0);
    const x1 = Math.min(w, box.x + box.w);
    const y1 = Math.min(data.length / (w * 4), box.y + box.h);
    let n = 0, sL = 0, sL2 = 0, sR = 0, sG = 0, sB = 0;
    const step = Math.max(1, Math.floor(Math.min(box.w, box.h) / 80));
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const L = lum(r, g, b);
        sL += L; sL2 += L * L; sR += r; sG += g; sB += b; n++;
      }
    }
    if (!n) return { variance: 0, color: "#ffffff", mean: 255 };
    const mean = sL / n;
    const variance = Math.max(0, sL2 / n - mean * mean);
    const hex = (n) => ("0" + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
    return {
      variance,
      mean,
      color: "#" + hex(sR / n) + hex(sG / n) + hex(sB / n),
    };
  }

  function axisProfile(data, w, h, box, horizontal) {
    const len = horizontal ? box.h : box.w;
    const arr = new Float32Array(Math.max(1, len));
    const x0 = box.x, y0 = box.y;
    for (let i = 0; i < len; i++) {
      let s = 0, n = 0, prev = -1;
      if (horizontal) {
        const y = y0 + i;
        for (let x = x0; x < x0 + box.w; x += 2) {
          const idx = (y * w + x) * 4;
          const L = lum(data[idx], data[idx + 1], data[idx + 2]);
          if (prev >= 0) s += Math.abs(L - prev);
          prev = L;
          n++;
        }
      } else {
        const x = x0 + i;
        for (let y = y0; y < y0 + box.h; y += 2) {
          const idx = (y * w + x) * 4;
          const L = lum(data[idx], data[idx + 1], data[idx + 2]);
          if (prev >= 0) s += Math.abs(L - prev);
          prev = L;
          n++;
        }
      }
      arr[i] = n ? s / n : 0;
    }
    const win = 5;
    const sm = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        const j = i + k;
        if (j >= 0 && j < len) { s += arr[j]; c++; }
      }
      sm[i] = s / c;
    }
    return sm;
  }

  function findSplits(profile, minGap, minSeg) {
    let max = 0;
    for (let i = 0; i < profile.length; i++) if (profile[i] > max) max = profile[i];
    const thresh = Math.max(1.2, max * 0.14);
    const gaps = [];
    let i = 0;
    while (i < profile.length) {
      if (profile[i] < thresh) {
        let j = i;
        while (j < profile.length && profile[j] < thresh) j++;
        if (j - i >= minGap) gaps.push([i, j]);
        i = j;
      } else i++;
    }
    const cuts = [];
    gaps.forEach((g) => {
      const mid = (g[0] + g[1]) >> 1;
      if (mid > minSeg && profile.length - mid > minSeg) cuts.push(mid);
    });
    return cuts;
  }

  function splitBox(box, cuts, horizontal) {
    const parts = [];
    let start = 0;
    const total = horizontal ? box.h : box.w;
    const all = cuts.concat([total]).sort((a, b) => a - b);
    all.forEach((cut) => {
      const size = cut - start;
      if (size >= 12) {
        parts.push(horizontal
          ? { x: box.x, y: box.y + start, w: box.w, h: size }
          : { x: box.x + start, y: box.y, w: size, h: box.h });
      }
      start = cut;
    });
    return parts.length ? parts : [box];
  }

  function segmentBox(data, w, h, box, depth) {
    if (depth > 4 || box.w < 36 || box.h < 36) return { type: "leaf", box };
    const rowP = axisProfile(data, w, h, box, true);
    const colP = axisProfile(data, w, h, box, false);
    const rowCuts = findSplits(rowP, Math.max(6, Math.round(box.h * 0.02)), Math.max(28, Math.round(box.h * 0.08)));
    const colCuts = findSplits(colP, Math.max(6, Math.round(box.w * 0.02)), Math.max(28, Math.round(box.w * 0.08)));
    const preferRow = rowCuts.length && (rowCuts.length >= colCuts.length || box.h > box.w * 1.15);
    if (preferRow) {
      const kids = splitBox(box, rowCuts, true).map((b) => segmentBox(data, w, h, b, depth + 1));
      if (kids.length >= 2) return { type: "column", box, children: kids };
    }
    if (colCuts.length) {
      const kids = splitBox(box, colCuts, false).map((b) => segmentBox(data, w, h, b, depth + 1));
      if (kids.length >= 2) return { type: "row", box, children: kids };
    }
    if (rowCuts.length) {
      const kids = splitBox(box, rowCuts, true).map((b) => segmentBox(data, w, h, b, depth + 1));
      if (kids.length >= 2) return { type: "column", box, children: kids };
    }
    return { type: "leaf", box };
  }

  function cropJpeg(srcCanvas, box) {
    const c = document.createElement("canvas");
    const scale = box.w > 1000 ? 1000 / box.w : 1;
    c.width = Math.max(1, Math.round(box.w * scale));
    c.height = Math.max(1, Math.round(box.h * scale));
    const g = c.getContext("2d");
    g.drawImage(srcCanvas, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.78);
  }

  function imageTreeToElements(node, srcCanvas, data, iw, parentBox, depth, ctx) {
    if (node.type === "leaf") {
      const st = boxStats(data, iw, node.box);
      if (st.variance < 22) {
        ctx.stats.containers += 1;
        return elContainer({
          content_width: "full",
          flex_direction: "column",
          background_background: "classic",
          background_color: st.color,
          min_height: { unit: "px", size: Math.max(8, node.box.h) },
        }, [], depth > 0);
      }
      ctx.stats.widgets.image = (ctx.stats.widgets.image || 0) + 1;
      return elWidget("image", {
        image: { url: cropJpeg(srcCanvas, node.box), id: "", alt: "" },
        image_size: "full",
        width: { unit: "%", size: 100 },
      });
    }
    const kids = (node.children || []).map((ch) => imageTreeToElements(ch, srcCanvas, data, iw, node.box, depth + 1, ctx));
    const settings = {
      content_width: "full",
      flex_direction: node.type === "row" ? "row" : "column",
      flex_wrap: node.type === "row" ? "wrap" : "nowrap",
      flex_align_items: "stretch",
      flex_gap: flexGap(8),
    };
    if (depth > 0 && parentBox && parentBox.w) {
      settings.width = { unit: "%", size: Math.max(8, Math.min(100, Math.round((node.box.w / parentBox.w) * 100))) };
    }
    if (node.box.h) settings.min_height = { unit: "px", size: node.box.h };
    ctx.stats.containers += 1;
    return elContainer(settings, kids, depth > 0);
  }

  function convertImageSync(imgEl, options, filename) {
    options = Object.assign({
      title: slug(filename),
      docType: "page",
      layout: "container",
      mode: "hybrid",
      rtl: true,
      keepClasses: false,
      scopeCss: false,
    }, options || {});
    const maxW = 1200;
    const scale = imgEl.naturalWidth > maxW ? maxW / imgEl.naturalWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imgEl.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(imgEl.naturalHeight * scale));
    const g = canvas.getContext("2d", { willReadFrequently: true });
    g.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    const imageData = g.getImageData(0, 0, canvas.width, canvas.height);
    const box = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const tree = segmentBox(imageData.data, canvas.width, canvas.height, box, 0);
    const ctx = { options, generatedCss: [], warnings: ["تصویر به کانتینر/ویجت تصویر تبدیل شد. متن داخل عکس به‌صورت تصویر است؛ در وردپرس بهتر است تصاویر را در رسانه آپلود کنید."], stats: { widgets: {}, containers: 0, sections: 0, htmlFallbacks: 0 } };
    let root = imageTreeToElements(tree, canvas, imageData.data, canvas.width, box, 0, ctx);
    if (!root) {
      root = elContainer({ content_width: "full", flex_direction: "column" }, [
        elWidget("image", { image: { url: canvas.toDataURL("image/jpeg", 0.82), id: "" }, width: { unit: "%", size: 100 } }),
      ], false);
      ctx.stats.widgets.image = 1;
      ctx.stats.containers = 1;
    }
    if (root.elType !== "container" && root.elType !== "section") {
      root = elContainer({ content_width: "full", flex_direction: "column" }, [root], false);
    }
    const content = [root];
    const template = {
      version: "0.4",
      title: options.title || slug(filename) || "Section from image",
      type: options.docType || "page",
      page_settings: [],
      content,
    };
    const cssText = buildCssFile(filename || "section.jpg", [], [], [], options);
    const clipboard = { type: "elementor", siteurl: "", elements: content };
    const widgetCount = Object.values(ctx.stats.widgets).reduce((a, b) => a + b, 0);
    return {
      template,
      clipboard,
      css: cssText,
      php: phpSnippet(slug(filename) + ".css"),
      warnings: ctx.warnings,
      stats: {
        widgets: widgetCount,
        widgetBreakdown: ctx.stats.widgets,
        containers: ctx.stats.containers,
        sections: ctx.stats.sections,
        htmlFallbacks: ctx.stats.htmlFallbacks,
        cssBytes: cssText.length,
        missingCss: [],
      },
      title: template.title,
      fromImage: true,
    };
  }

  function convertImage(dataUrl, options, filename) {
    return new Promise((resolve, reject) => {
      if (typeof Image === "undefined") {
        reject(new Error("تبدیل تصویر فقط در مرورگر در دسترس است"));
        return;
      }
      const img = new Image();
      img.onload = function () {
        try { resolve(convertImageSync(img, options, filename)); }
        catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error("خواندن تصویر ناموفق بود")); };
      img.src = dataUrl;
    });
  }

  global.H2E = {
    convertHtml,
    suggestWidget(el){
      const forced=attr(el,"data-h2e-widget");if(forced)return forced;
      if(looksLikeButton(el))return "button";if(isIcon(el))return "icon";
      const tag=el.tagName.toLowerCase();if(/^h[1-6]$/.test(tag))return "heading";
      if(["img","picture"].includes(tag))return "image";
      if(["form","table","iframe","canvas"].includes(tag))return "html";
      return childrenOf(el).length ? "container" : "text-editor";
    },
    convertImage,
    zipStore,
    slug,
    uid,
  };
})(typeof window !== "undefined" ? window : globalThis);
