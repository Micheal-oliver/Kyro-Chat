/* Kyro per-chat themes. Additive: remove the hook lines in app.html to undo.
   Each chat can have its own look: bubble colours, a colour wallpaper OR a photo from your gallery
   (or from the photos already in that chat), with Dim and Blur controls.
   Saved on this device only (theme details in localStorage, photos in IndexedDB), so the other
   person's app is not changed. The existing Chat wallpaper feature is untouched. */
(function () {
  "use strict";
  if (window.KyroTheme) return;

  var LS = "kyro.theme";
  var THEMES = [
    { id: "none", name: "Default", a: "", b: "", wall: "" },
    { id: "aurora", name: "Aurora", a: "#9b6dff", b: "#3ce7ff", wall: "linear-gradient(160deg,#0a1f2e,#1d4d5c 50%,#3a1f5c)" },
    { id: "ocean", name: "Ocean", a: "#1f9bff", b: "#12d8fa", wall: "linear-gradient(180deg,#06202e,#0b4a6b)" },
    { id: "sunset", name: "Sunset", a: "#ff7e5f", b: "#feb47b", wall: "linear-gradient(170deg,#2a1033,#6b2a55 55%,#b24a4a)" },
    { id: "forest", name: "Forest", a: "#22c55e", b: "#5eead4", wall: "linear-gradient(180deg,#0a1f17,#17402f)" },
    { id: "rose", name: "Rose", a: "#ff5fa2", b: "#ff9a9e", wall: "linear-gradient(170deg,#2a0f24,#5a1f48)" },
    { id: "midnight", name: "Midnight", a: "#6c63ff", b: "#8ab4ff", wall: "linear-gradient(180deg,#0b0b24,#1a1040)" },
    { id: "lemon", name: "Lemon", a: "#f6c90e", b: "#ffe66d", wall: "linear-gradient(180deg,#1e1a08,#3b3210)" },
    { id: "mono", name: "Mono", a: "#8e9aaf", b: "#cbd5e1", wall: "linear-gradient(180deg,#121316,#23252b)" }
  ];
  var BLURS = [["None", 0], ["Soft", 4], ["Strong", 10]];

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  function say(t) { try { if (typeof toast === "function") toast(t); } catch (_) {} }
  function pid() { try { return typeof currentPeer !== "undefined" && currentPeer ? String(currentPeer.id) : ""; } catch (_) { return ""; } }
  function pname() { try { return (currentPeer && currentPeer.name) || "this chat"; } catch (_) { return "this chat"; } }
  function store() { try { var v = JSON.parse(localStorage.getItem(LS) || "{}"); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; } }
  function putStore(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (_) { say("Storage is full. Couldn't save the theme."); } }
  function themeById(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }

  /* ---------- photo storage (IndexedDB, with an in-memory fallback) ---------- */
  var mem = {};
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var r = indexedDB.open("kyro-theme", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("photos"); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction("photos", mode), req = fn(tx.objectStore("photos"));
          tx.oncomplete = function () { resolve(req && "result" in req ? req.result : true); };
          tx.onerror = tx.onabort = function () { resolve(null); };
        } catch (_) { resolve(null); }
      });
    });
  }
  function getPhoto(id) { return mem[id] ? Promise.resolve(mem[id]) : idb("readonly", function (s) { return s.get(id); }).then(function (v) { if (v) mem[id] = v; return v || null; }); }
  function setPhoto(id, rec) { mem[id] = rec; return idb("readwrite", function (s) { return s.put(rec, id); }); }
  function delPhoto(id) { delete mem[id]; return idb("readwrite", function (s) { return s.delete(id); }); }

  /* ---------- image processing ---------- */
  function loadImg(src) {
    return new Promise(function (resolve, reject) {
      var i = new Image();
      i.onload = function () { resolve(i); };
      i.onerror = reject;
      i.src = src;
    });
  }
  function toData(img, maxSide, blurPx) {
    var scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var w = Math.round((img.naturalWidth || img.width) * scale), h = Math.round((img.naturalHeight || img.height) * scale);
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d");
    if (blurPx && typeof x.filter === "string") {
      x.filter = "blur(" + blurPx + "px)";
      var pad = blurPx * 2; // draw a little oversized so the edges don't fade out
      x.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
    } else {
      x.drawImage(img, 0, 0, w, h);
    }
    return c.toDataURL("image/jpeg", 0.8);
  }

  /* ---------- applying a theme to the open chat ---------- */
  var applied = "";
  var VARS = ["--kt-a", "--kt-b", "--kt-bg"];
  function clear(el) {
    el.classList.remove("kt-on", "kt-bg");
    VARS.forEach(function (v) { el.style.removeProperty(v); });
  }
  function dimCss(d, url) {
    return "linear-gradient(rgba(7,7,18," + d + "),rgba(7,7,18," + d + ")), url(\"" + url + "\") center/cover no-repeat";
  }
  function apply(id) {
    var el = document.getElementById("threadScreen");
    if (!el) return;
    applied = id || "";
    clear(el);
    if (!id) return;
    var t = store()[id];
    if (!t) return;
    var th = themeById(t.id);
    var a = t.a || th.a, b = t.b || th.b;
    if (a && b) {
      el.classList.add("kt-on");
      el.style.setProperty("--kt-a", a);
      el.style.setProperty("--kt-b", b);
    }
    if (t.photo) {
      getPhoto(id).then(function (rec) {
        if (!rec || applied !== id) return;
        el.style.setProperty("--kt-bg", dimCss(t.dim == null ? 0.35 : t.dim, rec.shown));
        el.classList.add("kt-bg");
      });
    } else if (th.wall && t.id !== "none") {
      el.style.setProperty("--kt-bg", th.wall);
      el.classList.add("kt-bg");
    }
  }
  function check() {
    var id = pid(), el = document.getElementById("threadScreen");
    if (!el) return;
    if (el.hidden && applied) { applied = ""; return; }
    if (id && id !== applied) apply(id);
  }

  /* ---------- the sheet ---------- */
  var modal = null, cur = null, curId = "";
  function build() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal is-off";
    modal.id = "ktModal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="sheet tall kt-sheet">' +
        '<h3 id="ktTitle">Chat theme</h3>' +
        '<div class="kt-preview" id="ktPrev"><div class="bubble them"><span>Hey, how is it going?</span></div><div class="bubble me"><span>All good, love this look</span></div></div>' +
        '<h4 class="set-h">Colours</h4>' +
        '<div class="kt-swatches" id="ktSw"></div>' +
        '<h4 class="set-h">Photo</h4>' +
        '<div class="kt-row">' +
          '<button class="sheet-btn" id="ktGallery" type="button">Choose from gallery</button>' +
          '<button class="sheet-btn" id="ktChatPics" type="button">From this chat</button>' +
        '</div>' +
        '<input type="file" id="ktFile" accept="image/*" hidden />' +
        '<div class="kt-pics" id="ktPics" hidden></div>' +
        '<div id="ktAdj" hidden>' +
          '<label class="kt-lab">Dim <input type="range" id="ktDim" min="0" max="80" step="5" /></label>' +
          '<div class="kt-lab">Blur <span class="kt-seg" id="ktBlur"></span></div>' +
          '<button class="sheet-btn ghost" id="ktRemovePhoto" type="button">Remove photo</button>' +
        '</div>' +
        '<p class="hint kt-note">Only you see this theme. It is saved on this device.</p>' +
        '<button class="sheet-btn" id="ktReset" type="button">Reset to default</button>' +
        '<button class="sheet-btn ghost" id="ktDone" type="button">Done</button>' +
      '</div>';
    document.body.appendChild(modal);

    var sw = $("#ktSw", modal);
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kt-sw"; b.dataset.id = t.id; b.setAttribute("aria-label", t.name);
      b.style.background = t.a ? "linear-gradient(135deg," + t.a + "," + t.b + ")" : "";
      b.innerHTML = '<span>' + esc(t.name) + "</span>";
      b.addEventListener("click", function () { pick(t.id); });
      sw.appendChild(b);
    });
    var seg = $("#ktBlur", modal);
    BLURS.forEach(function (bl) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.v = bl[1]; b.textContent = bl[0];
      b.addEventListener("click", function () { setBlur(bl[1]); });
      seg.appendChild(b);
    });
    $("#ktDone", modal).addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    $("#ktReset", modal).addEventListener("click", reset);
    $("#ktGallery", modal).addEventListener("click", function () { $("#ktFile", modal).click(); });
    $("#ktFile", modal).addEventListener("change", onFile);
    $("#ktChatPics", modal).addEventListener("click", showChatPics);
    $("#ktDim", modal).addEventListener("input", function () { setDim(this.value / 100, false); });
    $("#ktDim", modal).addEventListener("change", function () { setDim(this.value / 100, true); });
    $("#ktRemovePhoto", modal).addEventListener("click", removePhoto);
  }
  function entry() { var s = store(); return s[curId] || { id: "none" }; }
  function commit(t) {
    var s = store();
    if (t) s[curId] = t; else delete s[curId];
    putStore(s);
    if (pid() === curId) apply(curId);
    paint();
  }
  function pick(id) {
    var t = entry(), th = themeById(id);
    if (id === "none" && !t.photo) { commit(null); return; }
    t.id = id; t.a = th.a; t.b = th.b;
    if (id !== "none" && t.photo) { /* keep the photo; colours only change the bubbles */ }
    if (id === "none") { t.a = ""; t.b = ""; }
    commit(t);
  }
  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    var url = URL.createObjectURL(f);
    usePhoto(url).then(function () { URL.revokeObjectURL(url); });
  }
  function usePhoto(src) {
    return loadImg(src).then(function (img) {
      var t = entry();
      var blur = t.blur || 0;
      var orig = toData(img, 1280, 0);
      return loadImg(orig).then(function (o) {
        var shown = blur ? toData(o, 1280, blur) : orig;
        return setPhoto(curId, { orig: orig, shown: shown });
      });
    }).then(function () {
      var t = entry();
      t.photo = true; if (t.dim == null) t.dim = 0.35; if (t.blur == null) t.blur = 0;
      if (!t.id) t.id = "none";
      commit(t);
      $("#ktPics", modal).hidden = true;
    }).catch(function () { say("Couldn't use that photo. Try a different one."); });
  }
  function setDim(v, final) {
    var t = entry(); t.dim = v;
    if (final) commit(t);
    else { var s = store(); s[curId] = t; putStore(s); if (pid() === curId) apply(curId); paintPreview(); }
  }
  function setBlur(px) {
    getPhoto(curId).then(function (rec) {
      if (!rec) return;
      return loadImg(rec.orig).then(function (o) {
        rec.shown = px ? toData(o, 1280, px) : rec.orig;
        return setPhoto(curId, rec);
      }).then(function () { var t = entry(); t.blur = px; commit(t); });
    });
  }
  function removePhoto() {
    delPhoto(curId);
    var t = entry(); t.photo = false; delete t.dim; delete t.blur;
    if (!t.a && !t.b && (!t.id || t.id === "none")) commit(null); else commit(t);
  }
  function reset() {
    delPhoto(curId);
    commit(null);
    $("#ktPics", modal).hidden = true;
  }
  function showChatPics() {
    var box = $("#ktPics", modal);
    var seen = {}, list = [];
    Array.prototype.forEach.call(document.querySelectorAll("#messages .bubble img"), function (im) {
      var src = im.currentSrc || im.src;
      if (!src || seen[src] || im.closest(".sticker") || im.classList.contains("sticker")) return;
      if ((im.naturalWidth || 0) < 320 && (im.naturalHeight || 0) < 320) return; // skip stickers and tiny images
      seen[src] = 1; list.push(src);
    });
    box.innerHTML = "";
    if (!list.length) { box.innerHTML = '<p class="hint">No photos in this chat yet.</p>'; box.hidden = !box.hidden; return; }
    box.hidden = false;
    list.slice(-24).reverse().forEach(function (src) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kt-pic";
      b.style.backgroundImage = 'url("' + src + '")';
      b.addEventListener("click", function () { usePhoto(src); });
      box.appendChild(b);
    });
  }
  function paintPreview() {
    var p = $("#ktPrev", modal), t = entry(), th = themeById(t.id);
    var a = t.a || th.a, b = t.b || th.b;
    p.style.setProperty("--kt-a", a || "var(--accent-a, #9b6dff)");
    p.style.setProperty("--kt-b", b || "var(--accent-b, #3ce7ff)");
    if (t.photo) {
      getPhoto(curId).then(function (rec) { if (rec) p.style.background = dimCss(t.dim == null ? 0.35 : t.dim, rec.shown); });
    } else {
      p.style.background = t.id !== "none" && th.wall ? th.wall : "";
    }
  }
  function paint() {
    var t = entry();
    Array.prototype.forEach.call(modal.querySelectorAll(".kt-sw"), function (b) { b.classList.toggle("on", b.dataset.id === (t.id || "none")); });
    $("#ktAdj", modal).hidden = !t.photo;
    $("#ktDim", modal).value = Math.round((t.dim == null ? 0.35 : t.dim) * 100);
    Array.prototype.forEach.call(modal.querySelectorAll("#ktBlur button"), function (b) { b.classList.toggle("on", Number(b.dataset.v) === (t.blur || 0)); });
    $("#ktReset", modal).hidden = !store()[curId];
    paintPreview();
  }
  function open(peerId) {
    curId = peerId ? String(peerId) : pid();
    if (!curId) return;
    build();
    $("#ktTitle", modal).textContent = "Theme for " + pname();
    $("#ktPics", modal).hidden = true;
    paint();
    modal.hidden = false; modal.classList.remove("is-off");
  }
  function close() { if (!modal) return; modal.hidden = true; modal.classList.add("is-off"); }

  /* ---------- keep the open chat themed ---------- */
  function start() {
    var el = document.getElementById("threadScreen"), box = document.getElementById("messages");
    if (!el || !box) return false;
    new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
    new MutationObserver(check).observe(box, { childList: true });
    check();
    return true;
  }
  var n = 0, iv = setInterval(function () { if (start() || ++n > 40) clearInterval(iv); }, 250);

  window.KyroTheme = { open: open, apply: apply };
})();
