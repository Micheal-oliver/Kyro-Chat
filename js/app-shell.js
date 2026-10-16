/* Kyro app shell: makes the installed web app feel native.
   - Splash on launch from the home screen
   - Status bar colour follows the light / dark theme
   - Share target: pick Kyro in another app's Share menu, choose a chat, and the text, link or
     photos are placed in that chat's message box (you still tap Send)
   Share target needs Kyro installed (Android Chrome and desktop Chrome / Edge). iPhone Safari doesn't support it. */
(function () {
  "use strict";
  if (window.KyroShell) return;
  function $(s, r) { return (r || document).querySelector(s); }
  function say(t) { try { if (typeof toast === "function") toast(t); } catch (_) {} }

  /* ---------- splash ---------- */
  var splash = $("#kSplash");
  function hideSplash() {
    if (!splash) return;
    splash.classList.add("out");
    setTimeout(function () { if (splash) { splash.remove(); splash = null; } }, 450);
  }
  if (splash) {
    var go = function () { setTimeout(hideSplash, 500); };
    if (document.readyState === "complete") go(); else addEventListener("load", go);
    setTimeout(hideSplash, 4000);
  }

  /* ---------- status bar colour follows the theme ---------- */
  function paintBar() {
    var meta = document.getElementById("themeColor");
    if (!meta) return;
    var light = document.documentElement.getAttribute("data-theme") === "light";
    meta.setAttribute("content", light ? "#f8f6ff" : "#070712");
  }
  paintBar();
  new MutationObserver(paintBar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- receive shared items ---------- */
  var sheet = null, shared = null;
  async function readShare() {
    if (!("caches" in window)) return null;
    try {
      var c = await caches.open("kyro-share");
      var m = await c.match("/__share/meta");
      if (!m) return null;
      var meta = await m.json();
      if (!meta || Date.now() - meta.at > 15 * 60 * 1000) { clearShare(); return null; }
      meta.blobs = [];
      for (var i = 0; i < meta.files.length; i++) {
        var r = await c.match(meta.files[i].key);
        if (r) meta.blobs.push(new File([await r.blob()], meta.files[i].name, { type: meta.files[i].type }));
      }
      return meta;
    } catch (_) { return null; }
  }
  function clearShare() { try { caches.delete("kyro-share"); } catch (_) {} }

  function textOf(meta) {
    var parts = [meta.title, meta.text, meta.url].filter(Boolean);
    // many apps put the link inside text as well; don't repeat it
    return parts.filter(function (p, i) { return parts.indexOf(p) === i && !(i > 0 && parts[0] && parts[0].indexOf(p) !== -1); }).join("\n").trim();
  }
  function people() {
    var out = [], seen = {};
    try {
      (chats || []).map(peerFrom).forEach(function (p) { if (p.id && !seen[p.id]) { seen[p.id] = 1; out.push(p); } });
      (load(LS.contacts, []) || []).forEach(function (c) { var id = String(c.id || ""); if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, name: c.name || "Contact", avatar: c.avatar || "" }); } });
    } catch (_) {}
    return out;
  }
  function deliver(peer) {
    close();
    try { openThread(peer); } catch (_) { return; }
    setTimeout(function () {
      var input = document.getElementById("messageInput");
      var t = textOf(shared);
      if (t && input) { input.value = t; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); }
      if (shared.blobs.length) {
        var fileInput = document.getElementById("imageInput");
        if (fileInput && typeof DataTransfer === "function") {
          var dt = new DataTransfer();
          shared.blobs.slice(0, 1).forEach(function (f) { dt.items.add(f); }); // one file at a time, like the attach button
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          if (shared.blobs.length > 1) say("Only the first file was added. Share the others again.");
        }
      }
      clearShare(); shared = null;
    }, 350);
  }
  function close() { if (sheet) { sheet.hidden = true; sheet.classList.add("is-off"); } }
  function paintList(q) {
    var list = $("#ksList", sheet); list.innerHTML = "";
    q = (q || "").toLowerCase();
    var ppl = people().filter(function (p) { return !q || String(p.name).toLowerCase().indexOf(q) !== -1; });
    if (!ppl.length) { list.innerHTML = '<p class="hint">No chats found.</p>'; return; }
    ppl.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "ks-item";
      var av = document.createElement("span"); av.className = "ks-av";
      if (p.avatar) av.style.backgroundImage = 'url("' + p.avatar + '")'; else av.textContent = (p.name || "?").trim().charAt(0).toUpperCase();
      var nm = document.createElement("span"); nm.textContent = p.name;
      b.append(av, nm);
      b.addEventListener("click", function () { deliver(p); });
      list.appendChild(b);
    });
  }
  function showShare() {
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "modal is-off"; sheet.hidden = true; sheet.id = "shareModal";
      sheet.innerHTML = '<div class="sheet tall"><h3>Send to…</h3><div class="ks-prev" id="ksPrev"></div>' +
        '<input id="ksSearch" placeholder="Search chats" autocomplete="off" /><div class="ks-list" id="ksList"></div>' +
        '<button class="sheet-btn ghost" id="ksCancel" type="button">Cancel</button></div>';
      document.body.appendChild(sheet);
      $("#ksCancel", sheet).addEventListener("click", function () { close(); clearShare(); shared = null; });
      $("#ksSearch", sheet).addEventListener("input", function () { paintList(this.value); });
    }
    var prev = textOf(shared);
    if (shared.blobs.length) prev = (prev ? prev + "\n" : "") + "📎 " + shared.blobs.map(function (f) { return f.name; }).join(", ");
    $("#ksPrev", sheet).textContent = prev || "Shared item";
    $("#ksSearch", sheet).value = "";
    paintList("");
    sheet.hidden = false; sheet.classList.remove("is-off");
  }
  async function checkShare() {
    var meta = await readShare();
    if (!meta || (!textOf(meta) && !meta.blobs.length)) return;
    shared = meta;
    if (history.replaceState && /[?&]share=1/.test(location.search)) history.replaceState(null, "", location.pathname);
    // wait for the chat list so there is someone to pick
    var n = 0, iv = setInterval(function () {
      if ((typeof chats !== "undefined" && chats.length) || ++n > 20) { clearInterval(iv); showShare(); }
    }, 300);
  }
  if (document.readyState === "complete") checkShare(); else addEventListener("load", checkShare);

  window.KyroShell = { hideSplash: hideSplash };
})();
