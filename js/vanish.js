/* Kyro vanish: disappearing-message picker, countdowns, and view-once photos/videos.
   View once needs the updated backend (POST /api/messages/:id/view-once). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const notify = (t) => (typeof toast === "function" ? toast(t) : null);
  const isGroupId = (id) => String(id).startsWith("group:");
  const curId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");

  /* ================= Disappearing messages: easier picker ================= */
  const TIMERS = [[0, "Off", ""], [300, "5 minutes", "5m"], [3600, "1 hour", "1h"], [86400, "24 hours", "24h"], [604800, "7 days", "7d"], [2592000, "30 days", "30d"], [7776000, "90 days", "90d"]];
  try { TIMERS.forEach(([s, l]) => { DISAPPEAR_LABEL[s] = s ? l : "off"; }); } catch (_) {}

  // The old dropdown in contact info gets the new choices too
  const sel = $("#piDisappear");
  if (sel) { sel.textContent = ""; TIMERS.forEach(([s, l]) => { const o = document.createElement("option"); o.value = String(s); o.textContent = l; sel.appendChild(o); }); }

  let curSec = 0;
  const head = $(".thread-head");
  const search = $("#threadSearchBtn");
  const tbtn = document.createElement("button");
  tbtn.type = "button"; tbtn.className = "icon-round call-ico"; tbtn.id = "kxTimerBtn"; tbtn.hidden = true;
  tbtn.setAttribute("aria-label", "Disappearing messages");
  tbtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7z"/></svg><span class="kx-timer-badge" hidden></span>';
  if (head && search) search.before(tbtn);
  const badge = $(".kx-timer-badge", tbtn);

  function paintTimer() {
    const t = TIMERS.find((x) => x[0] === curSec);
    badge.hidden = !curSec;
    badge.textContent = t ? t[2] : "";
  }
  async function loadTimer() {
    const id = curId();
    if (!id || isGroupId(id)) { curSec = 0; paintTimer(); return; }
    const r = await Kyro.api.chatSettings(id).catch(() => null);
    if (curId() !== id) return;
    curSec = r && r._ok !== false ? r.disappearAfter || 0 : 0;
    paintTimer();
  }

  let tm, tlist;
  function buildTimerModal() {
    if (tm) return;
    tm = document.createElement("div");
    tm.className = "modal is-off"; tm.id = "kxTimerModal"; tm.hidden = true;
    tm.innerHTML = '<div class="sheet"><h3>Disappearing messages</h3><p class="kx-timer-note">New messages in this chat disappear after the time you pick. Messages already sent stay as they are.</p><div class="kx-folder-list"></div><button class="sheet-btn ghost" type="button">Close</button></div>';
    document.body.appendChild(tm);
    tlist = $(".kx-folder-list", tm);
    $(".sheet-btn.ghost", tm).addEventListener("click", () => closeModal("kxTimerModal"));
  }
  function paintTimerList() {
    tlist.textContent = "";
    TIMERS.forEach(([s, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sheet-btn" + (s === curSec ? " on" : ""); b.textContent = label;
      b.addEventListener("click", () => chooseTimer(s));
      const row = document.createElement("div"); row.className = "kx-folder-row"; row.appendChild(b);
      tlist.appendChild(row);
    });
  }
  async function chooseTimer(seconds) {
    const id = curId();
    if (!id) return;
    const res = await Kyro.api.setChatSettings(id, seconds).catch(() => null);
    if (!res || res._ok === false) { notify("Couldn't change this setting."); return; }
    curSec = res.disappearAfter != null ? res.disappearAfter : seconds;
    paintTimer();
    closeModal("kxTimerModal");
    sysNote("You turned disappearing messages " + (curSec ? "on: " + DISAPPEAR_LABEL[curSec] : "off"));
    notifyPeer(id, "setting");
  }
  tbtn.addEventListener("click", () => { buildTimerModal(); paintTimerList(); openModal("kxTimerModal"); });

  // Countdown under messages that will disappear
  function remaining(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return "<1m";
    if (s < 3600) return Math.ceil(s / 60) + "m";
    if (s < 86400) return Math.ceil(s / 3600) + "h";
    return Math.ceil(s / 86400) + "d";
  }
  function tickCountdowns() {
    const now = Date.now();
    document.querySelectorAll("#messages .bubble.ephemeral").forEach((b) => {
      if (!b._exp) return;
      let l = b.querySelector(":scope > .kx-exp");
      if (!l) { l = document.createElement("small"); l.className = "kx-exp"; b.appendChild(l); }
      l.textContent = "Disappears in " + remaining(b._exp - now);
    });
  }
  setInterval(tickCountdowns, 20000);

  /* ================= View once ================= */
  const readUrl = (f) => (typeof readAsDataUrl === "function" ? readAsDataUrl(f) : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); }));
  const MAX_VIDEO = 10 * 1024 * 1024;

  // Turn view-once messages into a card; the media itself never reaches the screen
  const prevMake = window.makeBubble;
  window.makeBubble = function (m) {
    const b = prevMake.call(this, m);
    try { if (m && m.viewOnce) decorateOnce(b, m); } catch (_) {}
    return b;
  };

  function decorateOnce(b, m) {
    b.classList.add("kx-vo");
    b.querySelectorAll("img, video, audio").forEach((n) => { n.removeAttribute("src"); n.remove(); });
    b._media = "";
    [...b.children].forEach((c) => { if (!c.classList.contains("mtime")) c.classList.add("kx-vo-hide"); });
    const card = document.createElement("button");
    card.type = "button"; card.className = "kx-vo-card";
    b.insertBefore(card, b.firstChild);
    b._kxVo = { m: { ...m, media: "" }, card };
    card.addEventListener("click", () => { if (!card.disabled) openViewer(b); });
    paintOnce(b);
  }
  function paintOnce(b) {
    const { m, card } = b._kxVo;
    const mine = String(m.senderId) === String(meId);
    const opened = !!m.viewedAt;
    const what = m.kind === "video" ? "Video" : "Photo";
    card.textContent = "";
    const ico = document.createElement("div"); ico.className = "kx-vo-ico";
    const one = document.createElement("span"); one.textContent = "1"; ico.appendChild(one);
    const text = document.createElement("div");
    const t = document.createElement("b"), s = document.createElement("small");
    if (opened) { t.textContent = "Opened"; s.textContent = mine ? "They opened your " + what.toLowerCase() : "This " + what.toLowerCase() + " can't be viewed again"; }
    else if (mine) { t.textContent = what + " \u00b7 View once"; s.textContent = "Sent. Waiting to be opened"; }
    else { t.textContent = "Tap to view"; s.textContent = what + " \u00b7 View once"; }
    text.append(t, s);
    card.append(ico, text);
    card.classList.toggle("opened", opened);
    card.disabled = opened || mine;
  }

  let viewer = null;
  function closeViewer() {
    if (!viewer) return;
    viewer.querySelectorAll("video").forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
    viewer.querySelectorAll("img").forEach((i) => i.removeAttribute("src"));
    viewer.remove(); viewer = null;
  }
  async function openViewer(b) {
    if (viewer) return;
    const id = b.dataset.id;
    if (!id) { notify("This message is still sending. Try again in a moment."); return; }
    viewer = document.createElement("div");
    viewer.className = "kx-viewer";
    viewer.innerHTML = '<div class="kx-viewer-top"><span>View once</span><button type="button" class="kx-viewer-x" aria-label="Close">\u00d7</button></div><div class="kx-viewer-stage"><span class="kx-viewer-load">Opening...</span></div><p class="kx-viewer-note">It closes for good when you leave.</p>';
    document.body.appendChild(viewer);
    viewer.addEventListener("contextmenu", (e) => e.preventDefault());
    $(".kx-viewer-x", viewer).addEventListener("click", closeViewer);
    const r = await Kyro.request("/api/messages/" + encodeURIComponent(id) + "/view-once", { method: "POST", body: {} });
    if (!viewer) return;
    if (!r || !r._ok || !r.media) {
      closeViewer();
      if (r && r._status === 404) { b._kxVo.m.viewedAt = b._kxVo.m.viewedAt || new Date().toISOString(); paintOnce(b); }
      notify((r && r.message) || "Couldn't open it. Check your connection and try again.");
      return;
    }
    b._kxVo.m.viewedAt = new Date().toISOString();
    paintOnce(b);
    const stage = $(".kx-viewer-stage", viewer);
    stage.textContent = "";
    let el;
    if (r.kind === "video") {
      el = document.createElement("video");
      el.autoplay = true; el.playsInline = true; el.controls = true;
      el.setAttribute("controlsList", "nodownload noplaybackrate"); el.disablePictureInPicture = true;
    } else { el = document.createElement("img"); el.draggable = false; el.alt = ""; }
    el.src = r.media;
    stage.appendChild(el);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) closeViewer(); });
  addEventListener("pagehide", closeViewer);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewer(); });

  // Composer toggle
  let armed = false;
  const once = document.createElement("button");
  once.type = "button"; once.className = "icon-round"; once.id = "kxOnceBtn"; once.hidden = true;
  once.setAttribute("aria-label", "View once"); once.setAttribute("aria-pressed", "false");
  once.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" stroke-dasharray="3.2 2.6"/><path d="M10.6 9.4 12.4 8v8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const anchor = $("#kxStickerBtn") || $("#attachBtn");
  if (anchor) anchor.after(once);
  function arm(on) {
    armed = on;
    once.classList.toggle("kx-armed", on);
    once.setAttribute("aria-pressed", String(on));
  }
  once.addEventListener("click", () => {
    arm(!armed);
    if (armed) notify("View once is on. Attach a photo or video and it can only be opened one time.");
  });

  // Send a photo or video as view once (1:1 chats only)
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "imageInput" || !armed) return;
    const id = curId();
    if (!id || isGroupId(id)) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.stopImmediatePropagation();
    e.target.value = "";
    const type = file.type || "";
    const isImg = type.startsWith("image/"), isVid = type.startsWith("video/");
    if (!isImg && !isVid) { notify("View once works for photos and videos."); return; }
    if (isVid && file.size > MAX_VIDEO) { notify("That video is too big. The limit is 10 MB."); return; }
    let media;
    try { media = isImg ? await Kyro.fileToDataUrl(file) : await readUrl(file); } catch (_) { notify("Couldn't read that file."); return; }
    const kind = isImg ? "image" : "video";
    const text = isImg ? "View once photo" : "View once video";
    const fileName = isVid ? (file.name || "video").slice(0, 120) : "";
    const box = $("#messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind, text, viewOnce: true, media, fileName });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    arm(false);
    const r = await Kyro.request("/api/messages", {
      method: "POST",
      body: { to: id, receiverId: id, recipientId: id, otherUserId: id, text, content: text, message: text, kind, media, fileName, fileSize: file.size, viewOnce: true }
    });
    media = null;
    const packed = r && r._ok ? r.message : null;
    if (!packed || !packed._id) {
      bubble.style.opacity = "0.55";
      notify((r && r.message) || "Couldn't send it. Check your connection and try again.");
      return;
    }
    bubble.dataset.id = String(packed._id);
    try { seenMessages.add(String(packed._id)); flushPending(bubble); } catch (_) {}
    if (packed.expiresAt) { bubble._exp = new Date(packed.expiresAt).getTime(); bubble.classList.add("ephemeral"); tickCountdowns(); }
    if (window.kyroSocket && window.kyroSocket.connected) window.kyroSocket.emit("relay-message", packed);
  }, true);

  /* ================= Follow the open chat + realtime ================= */
  function onPeer() {
    const id = curId(), thread = $("#threadScreen");
    const open = id && thread && !thread.hidden;
    const direct = open && !isGroupId(id);
    tbtn.hidden = !direct;
    once.hidden = !direct;
    if (!direct) arm(false);
    if (direct) loadTimer(); else { curSec = 0; paintTimer(); }
  }
  const thread = $("#threadScreen");
  if (thread) new MutationObserver(() => setTimeout(onPeer, 0)).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  const pn = $("#peerName");
  if (pn) new MutationObserver(() => setTimeout(onPeer, 0)).observe(pn, { childList: true, characterData: true, subtree: true });
  const msgs = $("#messages");
  if (msgs) new MutationObserver((list) => {
    let note = false, eph = false;
    list.forEach((m) => m.addedNodes.forEach((n) => {
      if (!(n instanceof HTMLElement)) return;
      if (n.classList.contains("sys-note") && /^Disappearing messages are now/.test(n.textContent)) note = true;
      if (n.classList.contains("ephemeral")) eph = true;
    }));
    if (note) setTimeout(loadTimer, 300);
    if (eph) tickCountdowns();
  }).observe(msgs, { childList: true });
  setTimeout(tickCountdowns, 1500);

  let hooked = null;
  setInterval(() => {
    const s = window.kyroSocket;
    if (!s || s === hooked || typeof s.on !== "function") return;
    hooked = s;
    s.on("view-once-opened", (d) => {
      const b = d && [...document.querySelectorAll("#messages .bubble.kx-vo")].find((x) => x.dataset.id === String(d.id));
      if (b && b._kxVo) { b._kxVo.m.viewedAt = new Date().toISOString(); paintOnce(b); }
    });
  }, 2000);
})();
