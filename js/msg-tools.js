/* Kyro message tools: Copy, Share, Delete for me / Delete for everyone, and the Text size setting.
   Hooks into app.js through window.KyroMsg (4 small lines in app.js). Remove the <script> and <link> in app.html to undo.
   No backend change: "delete for everyone" travels as a hidden control message, the same way reactions do. */
(() => {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const toastMsg = (t) => { try { toast(t); } catch (_) {} };

  /* ---------- saved delete lists (this device) ---------- */
  const K_ME = "kyro.delMe";    // ids hidden only for me
  const K_ALL = "kyro.delAll";  // id -> who deleted it for everyone
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || ""); } catch (_) { return fallback; } };
  const delMe = new Set(read(K_ME, []));
  const delAll = read(K_ALL, {});
  const saveMe = () => { try { localStorage.setItem(K_ME, JSON.stringify([...delMe].slice(-3000))); } catch (_) {} };
  const saveAll = () => {
    try {
      const keys = Object.keys(delAll);
      if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete delAll[k]);
      localStorage.setItem(K_ALL, JSON.stringify(delAll));
    } catch (_) {}
  };

  const box = () => document.getElementById("messages");
  const findBubble = (id) => Array.from((box() || { children: [] }).children).find((x) => x.dataset && x.dataset.id === String(id));

  /* only the person who sent a message may delete it for everyone */
  function allowed(controlSender, bubble) {
    const meIdNow = typeof meId !== "undefined" ? String(meId) : "";
    const byMe = !!controlSender && controlSender === meIdNow;
    if (byMe !== bubble.classList.contains("me")) return false;
    if (!byMe && bubble._sender && controlSender && bubble._sender !== controlSender) return false;
    return true;
  }

  /* real delete: the bubble is removed completely (no "message was deleted" leftover).
     animate=true shrinks it away; animate=false (history loading) just hides it instantly. */
  function tombstone(bubble, animate) {
    if (bubble.dataset.deleted === "1") return;
    bubble.dataset.deleted = "1";
    bubble._plain = "";
    bubble._media = "";
    bubble._reacts = {};
    if (!animate || !bubble.parentNode) { bubble.classList.add("kz-gone"); return; }
    const h = bubble.offsetHeight;
    bubble.style.height = h + "px";
    bubble.style.setProperty("--kz-dir", bubble.classList.contains("me") ? "1" : "-1");
    void bubble.offsetHeight;
    bubble.classList.add("kz-vanishing");
    setTimeout(() => { if (bubble.parentNode) bubble.remove(); }, 460);
  }

  const KyroMsg = {
    /* called by app.js for every bubble it builds */
    decorate(bubble, m) {
      bubble._sender = String((m && (m.senderId || m.from)) || "");
      bubble._m = m;
      const id = bubble.dataset.id;
      if (!id) return;
      if (delAll[id] && allowed(delAll[id], bubble)) tombstone(bubble, false);
      else if (delMe.has(id)) bubble.classList.add("kz-gone");
    },
    /* called by app.js when a "delete for everyone" control message arrives (live or from history) */
    applyDelete(id, sender) {
      id = String(id || "");
      if (!id) return;
      delAll[id] = String(sender || "");
      saveAll();
      const b = findBubble(id);
      if (b && allowed(delAll[id], b)) tombstone(b, true);
    },
    shareImage,
    shareText
  };
  window.KyroMsg = KyroMsg;

  /* ---------- copy ---------- */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  /* ---------- share ---------- */
  function dataUrlToBlob(u) {
    const i = u.indexOf(",");
    const mime = (u.slice(0, i).match(/:(.*?)[;,]/) || [])[1] || "image/jpeg";
    const bin = atob(u.slice(i + 1));
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: mime });
  }
  async function shareImage(src) {
    if (!navigator.share) { toastMsg("Sharing isn't available here. Use Save to phone."); return; }
    try {
      const blob = /^data:/.test(src) ? dataUrlToBlob(src) : await (await fetch(src)).blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const file = new File([blob], "kyro-photo." + ext, { type: blob.type || "image/jpeg" });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) { toastMsg("This device can't share photos. Use Save to phone."); return; }
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toastMsg("Couldn't open the share sheet.");
    }
  }
  async function shareText(text) {
    if (!navigator.share) { toastMsg("Sharing isn't available here. Use Copy."); return; }
    try { await navigator.share({ text }); }
    catch (e) { if (!(e && e.name === "AbortError")) toastMsg("Couldn't open the share sheet."); }
  }

  /* ---------- message sheet: add Copy + Share, hide actions that don't apply to deleted messages ---------- */
  const sheet = $("#msgActions");
  let actCopy = null, actShare = null;
  if (sheet) {
    const mk = (id, label, after) => {
      const b = document.createElement("button");
      b.className = "sheet-btn"; b.id = id; b.type = "button"; b.textContent = label;
      const ref = $(after, sheet);
      if (ref) ref.after(b); else sheet.querySelector(".sheet").appendChild(b);
      return b;
    };
    actCopy = mk("actCopy", "Copy", "#actReply");
    actShare = mk("actShare", "Share", "#actForward");

    actCopy.addEventListener("click", async () => {
      const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
      const text = cur && cur.bubble && cur.bubble._plain;
      closeModal("msgActions");
      if (!text) return;
      toastMsg((await copyText(text)) ? "Copied" : "Couldn't copy. Select the text instead.");
    });
    actShare.addEventListener("click", () => {
      const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
      if (!cur || !cur.bubble) return;
      const img = cur.bubble.querySelector(":scope > img");
      closeModal("msgActions");
      if (img) shareImage(img.currentSrc || img.src);
      else if (cur.bubble._plain) shareText(cur.bubble._plain);
    });
  }

  function prepSheet() {
    const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
    if (!cur || !cur.bubble || !sheet) return;
    const b = cur.bubble;
    const gone = b.dataset.deleted === "1";
    const hasImg = !!b.querySelector(":scope > img");
    actCopy.hidden = gone || !b._plain;
    actShare.hidden = gone || !navigator.share || !(hasImg || b._plain);
    const old = $(".kz-preview", sheet);
    if (old) old.remove();
    if (!gone) {
      const pv = document.createElement("div");
      pv.className = "kz-preview" + (b.classList.contains("me") ? " me" : "");
      const c = b.cloneNode(true);
      c.removeAttribute("id");
      c.classList.remove("kz-vanishing");
      c.style.cssText = "";
      c.querySelectorAll("video, audio").forEach((n) => n.remove());
      pv.appendChild(c);
      const rr = $("#reactRow", sheet);
      if (rr) rr.after(pv);
    }
    const row = $("#reactRow", sheet);
    if (row) row.style.display = gone ? "none" : "";
    ["#actReply", "#actStar", "#actForward", "#actSave"].forEach((q) => { const n = $(q, sheet); if (n) n.hidden = gone; });
    if (gone) { const e = $("#actEdit", sheet); if (e) e.hidden = true; }
  }

  if (typeof window.openModal === "function") {
    const orig = window.openModal;
    window.openModal = function (id) {
      if (id === "msgActions") { try { prepSheet(); } catch (_) {} }
      return orig.apply(this, arguments);
    };
  }

  /* ---------- delete: ask "for me" or "for everyone" ---------- */
  const del = document.createElement("div");
  del.className = "modal is-off";
  del.id = "kzDelModal";
  del.hidden = true;
  del.innerHTML =
    '<div class="sheet">' +
    '<h3>Delete message?</h3>' +
    '<p class="hint" id="kzDelHint"></p>' +
    '<button class="sheet-btn kz-danger" id="kzDelAll" type="button">Delete for everyone</button>' +
    '<button class="sheet-btn kz-danger" id="kzDelMe" type="button">Delete for me</button>' +
    '<button class="sheet-btn ghost" id="kzDelCancel" type="button">Cancel</button>' +
    "</div>";
  document.body.appendChild(del);
  let targets = [];
  const close = () => { closeModal("kzDelModal"); targets = []; };

  /* one place that asks "for me / for everyone" for one or many bubbles */
  function askDelete(list) {
    targets = (list || []).filter((b) => b && b.dataset.deleted !== "1");
    if (!targets.length) return;
    const n = targets.length;
    const canAll = targets.every((b) => b.classList.contains("me") && !!b.dataset.id);
    $("#kzDelAll").hidden = !canAll;
    $("#kzDelAll").textContent = n > 1 ? "Delete " + n + " for everyone" : "Delete for everyone";
    $("#kzDelMe").textContent = n > 1 ? "Delete " + n + " for me" : "Delete for me";
    $("#kzDelHint").textContent = canAll
      ? "\"Delete for everyone\" removes it from the chat for you and the other person."
      : "This removes it from your phone only.";
    openModal("kzDelModal");
  }
  KyroMsg.askDelete = askDelete;

  if (sheet) {
    /* capture phase so we run before app.js's own Delete handler */
    sheet.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest("#actDelete");
      if (!btn) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
      closeModal("msgActions");
      if (cur && cur.bubble) askDelete([cur.bubble]);
    }, true);
  }

  $("#kzDelCancel").addEventListener("click", close);
  del.addEventListener("click", (e) => { if (e.target === del) close(); });

  $("#kzDelMe").addEventListener("click", () => {
    const list = targets;
    close();
    list.forEach((b) => {
      const id = b.dataset.id;
      if (id) {
        delMe.add(id); saveMe();
        try { if (window.Kyro && Kyro.request) Kyro.request("/api/messages/" + encodeURIComponent(id) + "?scope=me", { method: "DELETE" }).catch(() => {}); } catch (_) {}
      }
      tombstone(b, true);
    });
  });

  $("#kzDelAll").addEventListener("click", async () => {
    const list = targets.filter((b) => b.dataset.id);
    close();
    for (const b of list) {
      const id = b.dataset.id;
      KyroMsg.applyDelete(id, typeof meId !== "undefined" ? String(meId) : "");
      let ok = false;
      try {
        const r = await Kyro.request("/api/messages/" + encodeURIComponent(id), { method: "DELETE" });
        ok = !!(r && r._ok);
      } catch (_) {}
      if (ok) continue;
      /* server could not delete it (old server or offline): fall back to the hidden delete message */
      try { await sendChat({ text: "\u27e6d:" + id + "\u27e7", kind: "text" }); }
      catch (_) { toastMsg("Deleted here, but couldn't reach the server to tell the others. Try again later."); }
    }
  });

  /* live: the other person deleted a message for everyone (or you did on another device) */
  let hooked = null;
  setInterval(() => {
    const s = window.kyroSocket;
    if (!s || s === hooked || typeof s.on !== "function") return;
    hooked = s;
    s.on("message-deleted", (d) => { if (d && d.id) KyroMsg.applyDelete(d.id, d.from || ""); });
  }, 1500);

  /* ---------- Text size setting ---------- */
  const SIZES = [["small", "Small", 0.9], ["default", "Default", 1], ["large", "Large", 1.15], ["huge", "Huge", 1.3]];
  const K_SIZE = "kyro.textsize";
  let size = "default";
  try { size = localStorage.getItem(K_SIZE) || "default"; } catch (_) {}
  if (!SIZES.some((s) => s[0] === size)) size = "default";

  function applySize(key) {
    const row = SIZES.find((s) => s[0] === key) || SIZES[1];
    size = row[0];
    document.documentElement.style.setProperty("--kz-scale", String(row[2]));
    document.querySelectorAll("#kzSizeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.s === size));
  }
  applySize(size);

  const themeBox = $("#settingsModal .theme-box");
  if (themeBox) {
    const wrap = document.createElement("div");
    wrap.className = "kz-size";
    wrap.innerHTML =
      '<div class="theme-box"><span>Text size</span><div class="seg" id="kzSizeSeg">' +
      SIZES.map((s) => '<button type="button" data-s="' + s[0] + '">' + s[1] + "</button>").join("") +
      "</div></div>" +
      '<div class="kz-size-preview"><span class="kz-size-bubble">This is how your messages will look.</span></div>';
    themeBox.after(wrap);
    wrap.querySelectorAll("#kzSizeSeg button").forEach((b) => {
      b.addEventListener("click", () => {
        try { localStorage.setItem(K_SIZE, b.dataset.s); } catch (_) {}
        applySize(b.dataset.s);
      });
    });
    applySize(size);
  }
})();
