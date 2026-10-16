/* Kyro chat organizing: Lock chat, Favorites, Mark as unread, Clear / Delete chat, Export chat, pin limit.
   Works with the app's existing pin, mute, archive, folders and swipe actions.
   Remove the <script> and <link> in app.html to undo. */
(function () {
  "use strict";
  if (typeof Kyro === "undefined" || !document.getElementById("chatList") || !window.KyroLock) return;

  var LK = "kyro.locked", FK = "kyro.favs", MAX_PINS = 5;
  var unlocked = new Set();   // locked chats opened during this visit
  var pageOpen = false;       // the Locked chats page is open (so it is already unlocked)

  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ids(k) { return load(k, []).map(String); }
  function flip(key, id) {            // plain on/off list helper (no pin limit)
    var list = ids(key), i = list.indexOf(String(id));
    if (i >= 0) list.splice(i, 1); else list.push(String(id));
    save(key, list);
  }
  var isLocked = function (id) { return ids(LK).indexOf(String(id)) >= 0; };
  var isFav = function (id) { return ids(FK).indexOf(String(id)) >= 0; };
  var isGroupId = function (id) { return String(id).indexOf("group:") === 0; };
  function refresh() { try { renderChats(chats); } catch (_) {} }

  /* ---------- Pin limit (covers the long-press sheet and swipe pin) ---------- */
  var origToggle = window.toggleIn;
  window.toggleIn = function (key, id) {
    if (key === "kyro.pins" && !isPinned(id) && ids("kyro.pins").length >= MAX_PINS) {
      toast("You can pin up to " + MAX_PINS + " chats. Unpin one first.");
      return;
    }
    return origToggle.apply(this, arguments);
  };

  /* ---------- Biometrics (optional). A local gate only: no server check, the PIN always works. ---------- */
  var BIO = "kyro.clock.bio";
  var rand = function (n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
  function b64(buf) { var s = ""; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
  function unb64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  var bioOn = function () { return !!localStorage.getItem(BIO); };
  async function bioAvailable() {
    try { return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (_) { return false; }
  }
  async function bioRegister() {
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: "Kyro Chat" },
      user: { id: rand(16), name: (me && me.email) || "kyro-user", displayName: meName || "Kyro user" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, timeout: 60000
    } });
    localStorage.setItem(BIO, b64(cred.rawId));
  }
  async function bioAssert() {
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), userVerification: "required", timeout: 60000,
      allowCredentials: [{ type: "public-key", id: unb64(localStorage.getItem(BIO)), transports: ["internal"] }]
    } });
    return true;
  }

  /* ---------- Unlock ---------- */
  async function unlockFlow() {
    if (!KyroLock.chatPinSet()) return KyroLock.chatPinCreate();
    if (bioOn()) { try { if (await bioAssert()) return true; } catch (_) {} }
    return KyroLock.chatPinUnlock();
  }

  async function lockChat(peer) {
    if (!peer || isGroupId(peer.id)) { toast("Group chats can't be locked yet."); return false; }
    if (!KyroLock.chatPinSet() && !(await KyroLock.chatPinCreate())) return false;
    if (!isLocked(peer.id)) flip(LK, peer.id);
    if (currentPeer && String(currentPeer.id) === String(peer.id)) unlocked.add(String(peer.id));
    refresh();
    toast("Chat locked. Find it under Locked chats.");
    return true;
  }
  async function unlockChat(peer) {
    if (!peer) return false;
    if (!(await unlockFlow())) return false;
    if (isLocked(peer.id)) flip(LK, peer.id);
    unlocked.delete(String(peer.id));
    refresh();
    toast("Chat lock removed.");
    return true;
  }

  /* ---------- Hide locked chats everywhere they could leak ---------- */
  var origRender = window.renderChats;
  window.renderChats = function () {
    var r = origRender.apply(this, arguments);
    try { afterRender(); } catch (_) {}
    return r;
  };
  function afterRender() {
    var box = $("#chatList");
    var locked = ids(LK), lockedSet = new Set(locked);
    Array.prototype.slice.call(box.querySelectorAll(".row[data-peer]")).forEach(function (row) {
      var id = row.dataset.peer;
      if (lockedSet.has(id)) { row.remove(); return; }
      if (isFav(id) && !row.querySelector(".cl-fav")) {
        var b = row.querySelector("b");
        if (b) b.insertBefore(h("span", "cl-fav", "\u2605"), b.firstChild);
      }
    });
    if (locked.length && chatFilter === "all") {
      var row = h("button", "row cl-locked-row");
      row.type = "button";
      row.innerHTML = '<div class="row-avatar">\uD83D\uDD12</div><div class="grow"><b>Locked chats</b><span></span></div>';
      row.querySelector("span").textContent = locked.length + (locked.length === 1 ? " chat" : " chats") + " \u00B7 tap to unlock";
      row.addEventListener("click", openLockedPage);
      box.insertBefore(row, box.firstChild);
    }
    if (pageOpen) paintLockedPage();
  }

  var origTotal = window.totalUnread;
  window.totalUnread = function () {
    var map = unreadMap(), lockedSet = new Set(ids(LK));
    return Object.keys(map).reduce(function (s, k) { return lockedSet.has(k) ? s : s + Number(map[k] || 0); }, 0);
  };

  var origPopup = window.showMessagePopup;
  window.showMessagePopup = function (peerId, text) {
    if (!isLocked(peerId)) return origPopup.apply(this, arguments);
    if (isMuted(peerId) || localStorage.getItem("kyro.popups") === "off") return;
    origPopup.call(this, peerId, "New message");
    var t = document.getElementById("msgToast");
    if (t) t.textContent = "\uD83D\uDD12 New message";
  };

  var origOpen = window.openThread;
  window.openThread = function (peer) {
    if (peer && !isGroupId(peer.id) && isLocked(peer.id) && !unlocked.has(String(peer.id)) && !pageOpen) {
      unlockFlow().then(function (ok) { if (ok) { unlocked.add(String(peer.id)); origOpen.call(window, peer); } });
      return;
    }
    if (peer && isLocked(peer.id)) unlocked.add(String(peer.id));
    if (pageOpen) closeLockedPage();
    return origOpen.apply(this, arguments);
  };

  // closing a thread locks it again
  var ts = document.getElementById("threadScreen");
  if (ts) new MutationObserver(function () { if (ts.hidden) unlocked.clear(); }).observe(ts, { attributes: true, attributeFilter: ["hidden"] });

  // leaving the app for 30+ seconds locks everything again
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= 30000) relock();
    hiddenAt = 0;
  });
  function relock() {
    unlocked.clear();
    if (pageOpen) closeLockedPage();
    if (currentPeer && isLocked(currentPeer.id)) { var b = document.getElementById("backChat"); if (b) b.click(); }
  }

  /* ---------- Locked chats page ---------- */
  var page = h("section", "kc-page cl-page");
  page.id = "lockedPage"; page.hidden = true;
  page.setAttribute("role", "dialog"); page.setAttribute("aria-label", "Locked chats");
  page.innerHTML =
    '<header class="kc-top"><button class="icon-round" id="clBack" type="button" aria-label="Back">\u2190</button><strong>Locked chats</strong></header>' +
    '<div class="kc-scroll">' +
      '<p class="cl-note">Locked chats are hidden from your chat list, and their notifications show no name or message. This protects them on this device only.</p>' +
      '<div class="list" id="clList"></div>' +
      '<p class="hint cl-empty" id="clEmpty" hidden>No locked chats yet. Long-press a chat and tap Lock chat.</p>' +
      '<div class="kc-card kc-rows">' +
        '<button class="kc-row" id="clChange" type="button"><span class="kc-ico">\uD83D\uDD11</span><span class="grow">Change chat lock PIN</span><i>\u203A</i></button>' +
        '<label class="set-row" id="clBioRow" hidden><span>Use fingerprint or Face ID<small>Opens locked chats faster. Your PIN always works too.</small></span><span class="switch"><input type="checkbox" id="clBio" /><i></i></span></label>' +
      '</div>' +
      '<p class="kc-foot">Founded by Mr Vael Tech</p>' +
    '</div>';
  document.body.appendChild(page);

  function lockedPeers() {
    var want = new Set(ids(LK)), seen = new Set(), out = [];
    chats.map(peerFrom).concat(load(LS.contacts, [])).forEach(function (p) {
      var id = String(p.id);
      if (want.has(id) && !seen.has(id)) { seen.add(id); out.push(p); }
    });
    want.forEach(function (id) { if (!seen.has(id)) out.push({ id: id, name: "Locked chat", preview: "" }); });
    return out;
  }
  function paintLockedPage() {
    var box = $("#clList", page);
    box.textContent = "";
    var list = lockedPeers();
    list.forEach(function (p) { box.appendChild(contactRow(p)); });
    $("#clEmpty", page).hidden = list.length > 0;
  }
  async function openLockedPage() {
    if (!(await unlockFlow())) return;
    pageOpen = true;
    page.hidden = false;
    paintLockedPage();
    var avail = await bioAvailable();
    $("#clBioRow", page).hidden = !avail;
    $("#clBio", page).checked = bioOn();
  }
  function closeLockedPage() { pageOpen = false; page.hidden = true; refresh(); }
  $("#clBack", page).addEventListener("click", closeLockedPage);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pageOpen) closeLockedPage(); });
  $("#clChange", page).addEventListener("click", async function () { if (await KyroLock.chatPinChange()) toast("Chat lock PIN changed."); });
  $("#clBio", page).addEventListener("change", async function () {
    var box = this;
    if (box.checked) {
      try { await bioRegister(); toast("Fingerprint / Face ID is on."); }
      catch (_) { box.checked = false; toast("Couldn't set that up on this device. Your PIN still works."); }
    } else { localStorage.removeItem(BIO); toast("Fingerprint / Face ID is off."); }
  });

  /* ---------- Clear / delete / export ---------- */
  async function clearChatFor(peer, quiet) {
    var res = await Kyro.api.clearChat(peer.id).catch(function () { return null; });
    if (!res || res._ok === false) { toast("Couldn't clear this chat. Check your connection."); return false; }
    if (currentPeer && String(currentPeer.id) === String(peer.id)) document.getElementById("messages").textContent = "";
    ["kyro.stars"].forEach(function (k) { save(k, load(k, []).filter(function (x) { return x.peerId !== String(peer.id); })); });
    if (!quiet) toast("Chat cleared.");
    try { await loadChats(); } catch (_) { refresh(); }
    return true;
  }
  async function deleteChatFor(peer) {
    if (!(await clearChatFor(peer, true))) return;
    var id = String(peer.id);
    save(LS.contacts, load(LS.contacts, []).filter(function (c) { return String(c.id) !== id; }));
    ["kyro.pins", "kyro.favs", "kyro.arch", "kyro.mutes", LK].forEach(function (k) { save(k, ids(k).filter(function (x) { return x !== id; })); });
    setUnread(id, 0);
    unlocked.delete(id);
    if (currentPeer && String(currentPeer.id) === id) { var b = document.getElementById("backChat"); if (b) b.click(); }
    toast("Chat deleted.");
    refresh();
  }
  function exportChat(peer) {
    var lines = [], name = (peer && peer.name) || "Chat";
    Array.prototype.forEach.call(document.getElementById("messages").children, function (b) {
      if (!b._ts) return;
      var d = new Date(b._ts);
      var who = b.classList.contains("me") ? (meName || "You") : name;
      lines.push("[" + d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "] " + who + ": " + (b._plain || "[attachment]"));
    });
    if (!lines.length) { toast("Nothing to export in this chat yet."); return; }
    var text = "Chat with " + name + "\nExported from Kyro Chat on " + new Date().toLocaleString() + "\n\n" + lines.join("\n") + "\n\nFounded by Mr Vael Tech\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "kyro-chat-" + name.replace(/[^\w-]+/g, "_").slice(0, 30) + "-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function askClear(peer) { if (peer && confirm("Clear all messages in this chat? They'll be removed for you only. " + (peer.name || "The other person") + " keeps their copy.")) clearChatFor(peer); }
  function askDelete(peer) { if (peer && confirm("Delete this chat with " + (peer.name || "this contact") + "? Messages are cleared for you only and the chat is removed from your list.")) deleteChatFor(peer); }

  /* ---------- Long-press sheet: new actions ---------- */
  var sheet = $("#chatOptsModal .sheet"), closeBtn = $("#optClose");
  function addOpt(id, cls) { var b = h("button", "sheet-btn" + (cls ? " " + cls : "")); b.type = "button"; b.id = id; sheet.insertBefore(b, closeBtn); return b; }
  var oFav = addOpt("optFav"), oUnread = addOpt("optUnread"), oLock = addOpt("optLock");
  var sep = h("div", "cl-sep"); sheet.insertBefore(sep, closeBtn);
  var oClear = addOpt("optClear", "bad"), oDelete = addOpt("optDelete", "bad");
  oClear.textContent = "Clear chat"; oDelete.textContent = "Delete chat";

  function paintOpts(peer) {
    oFav.textContent = isFav(peer.id) ? "Remove from favorites" : "Add to favorites";
    oUnread.textContent = unreadCount(peer.id) > 0 ? "Mark as read" : "Mark as unread";
    oLock.textContent = isLocked(peer.id) ? "Remove chat lock" : "Lock chat";
  }
  var origOpts = window.openChatOpts;
  window.openChatOpts = function (peer) { origOpts.apply(this, arguments); try { paintOpts(peer); } catch (_) {} };

  oFav.addEventListener("click", function () { if (!optsPeer) return; flip(FK, optsPeer.id); closeModal("chatOptsModal"); refresh(); });
  oUnread.addEventListener("click", function () {
    if (!optsPeer) return;
    setUnread(optsPeer.id, unreadCount(optsPeer.id) > 0 ? 0 : 1);
    closeModal("chatOptsModal"); refresh();
  });
  oLock.addEventListener("click", async function () {
    var p = optsPeer; closeModal("chatOptsModal");
    if (!p) return;
    if (isLocked(p.id)) await unlockChat(p); else await lockChat(p);
    if (pageOpen) paintLockedPage();
  });
  oClear.addEventListener("click", function () { var p = optsPeer; closeModal("chatOptsModal"); askClear(p); });
  oDelete.addEventListener("click", function () { var p = optsPeer; closeModal("chatOptsModal"); askDelete(p); });

  /* ---------- Contact Info page: lock, export, clear, delete ---------- */
  var muteLabel = $("#kcMute") && $("#kcMute").closest("label");
  var shareRow = $("#kcShare");
  if (muteLabel && shareRow) {
    var lockLabel = h("label", "set-row");
    lockLabel.innerHTML = '<span>Lock chat<small>Hide this chat behind your chat lock PIN</small></span><span class="switch"><input type="checkbox" id="kcLock" /><i></i></span>';
    muteLabel.insertAdjacentElement("afterend", lockLabel);
    var lockBox = $("#kcLock", lockLabel);
    lockBox.addEventListener("change", async function () {
      var want = lockBox.checked, p = currentPeer;
      if (!p) return;
      var ok = want ? await lockChat(p) : await unlockChat(p);
      if (!ok) lockBox.checked = !want;
    });
    var cp = $("#contactPage");
    if (cp) new MutationObserver(function () { if (!cp.hidden && currentPeer) lockBox.checked = isLocked(currentPeer.id); }).observe(cp, { attributes: true, attributeFilter: ["hidden"] });

    function row(id, icon, text, bad) {
      var b = h("button", "kc-row" + (bad ? " bad" : "")); b.type = "button"; b.id = id;
      b.appendChild(h("span", "kc-ico", icon)); b.appendChild(h("span", "grow", text));
      shareRow.insertAdjacentElement("beforebegin", b);
      return b;
    }
    row("kcExport", "\uD83D\uDCE4", "Export chat").addEventListener("click", function () { exportChat(currentPeer); });
    row("kcFav", "\u2B50", "Favorite").addEventListener("click", function () {
      if (!currentPeer) return; flip(FK, currentPeer.id); paintFavRow(); refresh();
    });
    row("kcClear", "\uD83E\uDDF9", "Clear chat", true).addEventListener("click", function () { askClear(currentPeer); });
    row("kcDelete", "\uD83D\uDDD1\uFE0F", "Delete chat", true).addEventListener("click", function () { askDelete(currentPeer); });
    var paintFavRow = function () { var b = $("#kcFav"); if (b && currentPeer) b.lastChild.textContent = isFav(currentPeer.id) ? "Remove from favorites" : "Add to favorites"; };
    if (cp) new MutationObserver(function () { if (!cp.hidden) paintFavRow(); }).observe(cp, { attributes: true, attributeFilter: ["hidden"] });
  }

  refresh();
})();
