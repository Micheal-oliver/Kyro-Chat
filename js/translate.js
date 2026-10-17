/* Kyro translate: translate any message, or auto-translate a whole chat.
   - Long-press a message > Translate.   - Globe button in a chat header > language + auto-translate for that chat.
   Privacy: chats are end-to-end encrypted, so translation is done on the device when the browser supports it
   (Chrome's built-in Translator API). If it doesn't, the app asks once before sending the text of a message to an
   online translation service. Point window.KYRO_TRANSLATE_URL at your own endpoint to use your own service:
   POST {text, target, source} -> {translatedText, detected}.
   Remove the <link> and <script> lines in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const ME = () => String(typeof meId !== "undefined" ? meId : "");
  const tell = (t) => { try { toast(t, "tip", 3200); } catch (_) {} };
  const LANGS = [
    ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"],
    ["ar", "Arabic"], ["hi", "Hindi"], ["bn", "Bengali"], ["ur", "Urdu"], ["ru", "Russian"], ["tr", "Turkish"],
    ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["id", "Indonesian"], ["vi", "Vietnamese"], ["th", "Thai"],
    ["nl", "Dutch"], ["pl", "Polish"], ["uk", "Ukrainian"], ["sv", "Swedish"], ["el", "Greek"], ["he", "Hebrew"],
    ["fa", "Persian"], ["sw", "Swahili"], ["ta", "Tamil"], ["te", "Telugu"], ["ms", "Malay"], ["fil", "Filipino"]
  ];
  const nameOf = (c) => { const f = LANGS.find((l) => l[0] === c); return f ? f[1] : (c || "").toUpperCase(); };

  /* ---------- pure helpers (also used by tests) ---------- */
  const hasLetters = (s) => /\p{L}/u.test(String(s || "").replace(/https?:\/\/\S+|www\.\S+/gi, ""));
  function chunks(text, max) {
    max = max || 450;
    text = String(text || "");
    if (text.length <= max) return [text];
    const parts = text.match(/[^.!?\n]+[.!?\n]*\s*/g) || [text];
    const out = []; let cur = "";
    for (let p of parts) {
      while (p.length > max) { if (cur) { out.push(cur); cur = ""; } out.push(p.slice(0, max)); p = p.slice(max); }
      if ((cur + p).length > max) { out.push(cur); cur = p; } else cur += p;
    }
    if (cur) out.push(cur);
    return out;
  }
  const baseLang = (c) => String(c || "").toLowerCase().split(/[-_]/)[0];

  /* ---------- settings (per account, on this device) ---------- */
  const SK = () => "kyro.tr.v1." + ME();
  function readCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(SK()) || "{}") || {}; } catch (_) {}
    if (!c.lang) c.lang = LANGS.some((l) => l[0] === baseLang(navigator.language)) ? baseLang(navigator.language) : "en";
    c.auto = c.auto || {};
    return c;
  }
  const cfg = () => (cfg.v = cfg.v || readCfg());
  const saveCfg = () => { try { localStorage.setItem(SK(), JSON.stringify(cfg.v)); } catch (_) {} };

  /* ---------- engines ---------- */
  const cache = new Map();
  async function detect(text) {
    try {
      if ("LanguageDetector" in self) {
        const d = await self.LanguageDetector.create();
        const r = await d.detect(text);
        if (r && r[0] && r[0].confidence > 0.4) return baseLang(r[0].detectedLanguage);
      }
    } catch (_) {}
    return "";
  }
  async function onDevice(text, src, tgt) {
    if (!src || !("Translator" in self)) return null;
    try {
      const av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
      if (av === "unavailable") return null;
      const t = await self.Translator.create({ sourceLanguage: src, targetLanguage: tgt });
      return await t.translate(text);
    } catch (_) { return null; }
  }
  async function online(text, src, tgt) {
    if (window.KYRO_TRANSLATE_URL) {
      const r = await fetch(window.KYRO_TRANSLATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, target: tgt, source: src || "auto" }) });
      if (!r.ok) throw new Error("translate failed");
      const j = await r.json();
      return { text: j.translatedText || "", detected: baseLang(j.detected || "") };
    }
    const out = [];
    for (const part of chunks(text, 450)) {
      if (!part.trim()) { out.push(part); continue; }
      const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(part) + "&langpair=" + encodeURIComponent((src || "Autodetect") + "|" + tgt);
      const r = await fetch(url);
      if (!r.ok) throw new Error("translate failed");
      const j = await r.json();
      const t = j && j.responseData && j.responseData.translatedText;
      if (!t || (j.responseStatus && Number(j.responseStatus) !== 200)) throw new Error("translate failed");
      out.push(t);
    }
    return { text: out.join(""), detected: "" };
  }

  /* consent for sending text to an online service */
  function ensureConsent(allowAsk) {
    if (cfg().consent) return Promise.resolve(true);
    if (!allowAsk) return Promise.resolve(false);
    return new Promise((resolve) => {
      const m = document.createElement("div");
      m.className = "modal kt-consent";
      m.innerHTML = '<div class="sheet"><h3>Translate online?</h3><p class="hint">Your browser can\u2019t translate on this device. To translate, the text of the message is sent to an online translation service. That message won\u2019t stay end-to-end private. Only messages you translate are sent.</p><button class="btn btn-primary" data-a="yes" type="button" style="width:100%">Allow</button><button class="sheet-btn ghost" data-a="no" type="button">Not now</button></div>';
      document.body.appendChild(m);
      m.addEventListener("click", (e) => {
        const a = e.target && e.target.dataset && e.target.dataset.a;
        if (!a && e.target !== m) return;
        m.remove();
        if (a === "yes") { cfg().consent = true; saveCfg(); resolve(true); } else resolve(false);
      });
    });
  }

  /* returns {text, from} or {same:true} or throws */
  async function translateText(text, tgt, opts) {
    opts = opts || {};
    const key = tgt + "|" + text;
    if (cache.has(key)) return cache.get(key);
    const src = await detect(text);
    if (src && src === baseLang(tgt)) return { same: true, from: src };
    let res = null;
    if (src) { const t = await onDevice(text, src, tgt); if (t) res = { text: t, from: src }; }
    if (!res) {
      if (!(await ensureConsent(!opts.silent))) { const e = new Error("no consent"); e.code = "consent"; throw e; }
      const o = await online(text, src, tgt);
      if (o.detected && o.detected === baseLang(tgt)) return { same: true, from: o.detected };
      res = { text: o.text, from: src || o.detected || "" };
    }
    cache.set(key, res);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return res;
  }

  /* ---------- bubbles ---------- */
  function clearBox(b) { const x = b.querySelector(":scope > .kt-box"); if (x) x.remove(); b.classList.remove("kt-on"); }
  async function translateBubble(b, opts) {
    opts = opts || {};
    const plain = b && b._plain;
    if (!plain || !hasLetters(plain)) { if (!opts.silent) tell("Nothing to translate in that message."); return; }
    const existing = b.querySelector(":scope > .kt-box");
    if (existing && !opts.force) { clearBox(b); return; } /* tapping Translate again hides it */
    const tgt = cfg().lang;
    let box = existing;
    if (!box) {
      box = document.createElement("div");
      box.className = "kt-box";
      box.textContent = "Translating\u2026";
      const tm = b.querySelector(":scope > .mtime");
      if (tm) b.insertBefore(box, tm); else b.appendChild(box);
      b.classList.add("kt-on");
    }
    try {
      const r = await translateText(plain, tgt, opts);
      if (r.same) {
        if (opts.silent) { box.remove(); b.classList.remove("kt-on"); } else { box.textContent = "Already in " + nameOf(tgt) + "."; setTimeout(() => clearBox(b), 2200); }
        return;
      }
      box.textContent = "";
      const t = document.createElement("div");
      t.className = "kt-text"; t.textContent = r.text;
      const meta = document.createElement("button");
      meta.type = "button"; meta.className = "kt-meta";
      meta.textContent = "Translated" + (r.from ? " from " + nameOf(r.from) : "") + " \u00b7 Hide";
      meta.addEventListener("click", (e) => { e.stopPropagation(); clearBox(b); });
      box.append(t, meta);
    } catch (err) {
      if (opts.silent) { box.remove(); b.classList.remove("kt-on"); return; }
      box.textContent = err && err.code === "consent" ? "Translation is off. Tap Translate again to allow it." : "Couldn\u2019t translate. Check your connection and try again.";
      setTimeout(() => clearBox(b), 3000);
    }
  }

  /* message long-press menu */
  function hookMenu() {
    const sheet = $("#msgActions");
    if (!sheet || $("#actKtTranslate")) return !!sheet;
    const b = document.createElement("button");
    b.className = "sheet-btn"; b.id = "actKtTranslate"; b.type = "button"; b.textContent = "Translate";
    const ref = $("#actKpRemind", sheet) || $("#actStar", sheet);
    if (ref) ref.after(b); else $(".sheet", sheet).appendChild(b);
    b.addEventListener("click", () => {
      const c = typeof actionMsg !== "undefined" ? actionMsg : null;
      closeModal("msgActions");
      if (c && c.bubble) translateBubble(c.bubble, {});
    });
    return true;
  }

  /* ---------- auto-translate (per chat) ---------- */
  const queue = []; let running = false;
  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const b = queue.shift();
      if (b.isConnected && !b.querySelector(":scope > .kt-box")) await translateBubble(b, { silent: true });
      await new Promise((r) => setTimeout(r, 140));
    }
    running = false;
  }
  function consider(b, tries) {
    if (!b || !b.classList || !b.classList.contains("bubble") || !b.classList.contains("them")) return;
    const p = typeof currentPeer !== "undefined" ? currentPeer : null;
    if (!p || !cfg().auto[String(p.id)] || !cfg().consent && !("Translator" in self)) return;
    if (typeof b._plain !== "string") { if ((tries || 0) < 4) setTimeout(() => consider(b, (tries || 0) + 1), 350 * ((tries || 0) + 1)); return; }
    if (!hasLetters(b._plain)) return;
    queue.push(b);
    while (queue.length > 30) queue.shift();
    pump();
  }
  function watch() {
    const box = $("#messages");
    if (!box) return setTimeout(watch, 500);
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => consider(n)))).observe(box, { childList: true });
  }

  /* ---------- header button + settings sheet ---------- */
  let sheet = null, btn = null;
  function refreshBtn() {
    if (!btn) return;
    const p = typeof currentPeer !== "undefined" ? currentPeer : null;
    btn.classList.toggle("kt-active", !!(p && cfg().auto[String(p.id)]));
  }
  function buildSheet() {
    sheet = document.createElement("div");
    sheet.className = "modal is-off"; sheet.id = "ktSheet"; sheet.hidden = true;
    sheet.innerHTML =
      '<div class="sheet kt-sheet"><button class="sheet-x" type="button" aria-label="Close">\u00d7</button>' +
      '<h3>Translate</h3>' +
      '<label class="kt-row"><span>Translate into</span><select id="ktLang"></select></label>' +
      '<label class="kt-row kt-sw"><span>Auto-translate this chat<small>Incoming messages are translated as they arrive</small></span><input id="ktAuto" type="checkbox" /></label>' +
      '<p class="hint kt-note"></p>' +
      '<button class="sheet-btn ghost" id="ktRevoke" type="button">Stop allowing online translation</button></div>';
    document.body.appendChild(sheet);
    const sel = $("#ktLang", sheet);
    LANGS.forEach(([c, n]) => { const o = document.createElement("option"); o.value = c; o.textContent = n; sel.appendChild(o); });
    sel.addEventListener("change", () => {
      cfg().lang = sel.value; cache.clear(); saveCfg();
      document.querySelectorAll(".kt-box").forEach((x) => { if (x.parentNode) x.parentNode.classList.remove("kt-on"); x.remove(); });
    });
    $("#ktAuto", sheet).addEventListener("change", async (e) => {
      const p = typeof currentPeer !== "undefined" ? currentPeer : null;
      if (!p) return;
      if (e.target.checked) {
        const ok = "Translator" in self || await ensureConsent(true);
        if (!ok) { e.target.checked = false; return; }
        cfg().auto[String(p.id)] = true;
        Array.from($("#messages").children).filter((b) => b.classList && b.classList.contains("them")).slice(-15).forEach((b) => consider(b));
      } else delete cfg().auto[String(p.id)];
      saveCfg(); refreshBtn();
    });
    $("#ktRevoke", sheet).addEventListener("click", () => { cfg().consent = false; saveCfg(); tell("Online translation is off."); fillSheet(); });
    $(".sheet-x", sheet).addEventListener("click", () => closeModal("ktSheet"));
    sheet.addEventListener("click", (e) => { if (e.target === sheet) closeModal("ktSheet"); });
  }
  function fillSheet() {
    const p = typeof currentPeer !== "undefined" ? currentPeer : null;
    $("#ktLang", sheet).value = cfg().lang;
    $("#ktAuto", sheet).checked = !!(p && cfg().auto[String(p.id)]);
    $("#ktAuto", sheet).disabled = !p;
    $(".kt-note", sheet).textContent = "Translator" in self
      ? "Your browser translates on this device, so messages stay private."
      : (cfg().consent ? "Online translation is on: the text of messages you translate is sent to a translation service." : "Your browser can\u2019t translate on this device. You\u2019ll be asked before any text is sent to an online service.");
    $("#ktRevoke", sheet).hidden = !cfg().consent;
  }
  function mountButton() {
    const ref = $("#threadSearchBtn");
    if (!ref) return false;
    if ($("#threadTranslate")) return true;
    btn = document.createElement("button");
    btn.className = "icon-round call-ico"; btn.id = "threadTranslate"; btn.type = "button"; btn.setAttribute("aria-label", "Translate");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/></svg>';
    btn.addEventListener("click", () => { if (!sheet) buildSheet(); fillSheet(); openModal("ktSheet"); });
    ref.after(btn);
    return true;
  }
  function init() {
    if (!ME()) return setTimeout(init, 400);
    mountButton(); hookMenu(); watch();
    const bar = $("#threadScreen");
    if (bar) new MutationObserver(refreshBtn).observe(bar, { attributes: true, attributeFilter: ["hidden"] });
    const name = $("#peerName");
    if (name) new MutationObserver(refreshBtn).observe(name, { childList: true, characterData: true, subtree: true });
    refreshBtn();
  }
  window.KyroTranslate = { translateBubble, translateText, _t: { chunks, hasLetters, baseLang, LANGS } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
