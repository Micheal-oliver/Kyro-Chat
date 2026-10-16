/* Kyro Contact Info screen + About Me editor.
   - Tap a person's name or photo in a chat to open their Contact Info page.
   - Account tab gets an About Me card (max 500 characters) with status, location, website and privacy.
   Remove the <script> and <link> in app.html to undo. */
(function () {
  "use strict";
  if (typeof Kyro === "undefined" || !document.getElementById("threadScreen")) return;

  var ABOUT_MAX = 500;
  var LEVELS = [["everyone", "Everyone"], ["contacts", "My contacts"], ["nobody", "Nobody"]];
  var LEVEL_LABEL = { everyone: "Everyone", contacts: "My contacts", nobody: "Nobody" };
  var QUICK = [["\uD83D\uDFE2", "Available"], ["\u26D4", "Busy"], ["\uD83D\uDCBC", "At work"], ["\uD83D\uDCDA", "At school"], ["\uD83D\uDCC5", "In a meeting"], ["\uD83D\uDD0B", "Battery low"], ["\uD83D\uDE34", "Sleeping"], ["\u2708\uFE0F", "Traveling"]];
  var NS = "http://www.w3.org/2000/svg";
  var ICON = {
    msg: "M4 4h16v12H7l-3 3V4zm4 5h8v2H8V9zm0-3h8v2H8V6z",
    call: "M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z",
    video: "M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z",
    search: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
    save: "M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM6 11V8H4v3H1v2h3v3h2v-3h3v-2H6zm9 3c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"
  };

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(d) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "22"); s.setAttribute("height", "22"); s.setAttribute("fill", "currentColor");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d); s.appendChild(p);
    return s;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function isGroup(p) { return !p || String(p.id).indexOf("group:") === 0; }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }

  function chip(icon, text, href) {
    var c = href ? h("a", "kc-chip") : h("span", "kc-chip");
    if (href) { c.href = href; c.target = "_blank"; c.rel = "noopener noreferrer"; }
    c.appendChild(h("b", "", icon));
    c.appendChild(document.createTextNode(text));
    return c;
  }
  function monthYear(v) {
    var d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { month: "short", year: "numeric" });
  }
  function birthdayText(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    var d = new Date(2000, Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { month: "long", day: "numeric" });
  }
  function siteLabel(u) { return String(u).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""); }

  // fills a status pill, about text and info chips from a profile-like object
  function fillStatus(el, d) {
    var emoji = (d.statusEmoji || "").trim(), text = (d.statusText || "").trim();
    el.textContent = "";
    if (!emoji && !text) { el.hidden = true; return; }
    el.hidden = false;
    if (emoji) el.appendChild(h("span", "", emoji));
    if (text) el.appendChild(h("span", "", text));
  }
  function fillChips(el, items) {
    el.textContent = "";
    items.forEach(function (i) { if (i && i.text) el.appendChild(chip(i.icon, i.text, i.href)); });
  }
  function infoChips(d, extra) {
    var out = [];
    if (d.location) out.push({ icon: "\uD83D\uDCCD", text: d.location });
    var site = safeUrl(d.website);
    if (site) out.push({ icon: "\uD83D\uDD17", text: siteLabel(site), href: site });
    var bd = birthdayText(d.dateOfBirth);
    if (bd) out.push({ icon: "\uD83C\uDF82", text: bd });
    return out.concat(extra || []);
  }

  /* =============================================================
     CONTACT INFO PAGE
     ============================================================= */
  var page = h("section", "kc-page");
  page.id = "contactPage";
  page.hidden = true;
  page.setAttribute("role", "dialog");
  page.setAttribute("aria-label", "Contact info");
  page.innerHTML =
    '<header class="kc-top"><button class="icon-round" id="kcBack" type="button" aria-label="Back">\u2190</button><strong>Contact info</strong></header>' +
    '<div class="kc-scroll">' +
      '<div class="kc-hero">' +
        '<button class="kc-avatar" id="kcAvatar" type="button" aria-label="View photo"></button>' +
        '<h2 id="kcName"></h2><p class="kc-sub" id="kcUser"></p><p class="kc-sub" id="kcPhone"></p><p class="kc-presence" id="kcPresence"></p>' +
        '<div class="kc-status" id="kcStatus" hidden></div>' +
      '</div>' +
      '<div class="kc-actions" id="kcActions"></div>' +
      '<div class="kc-card"><h4>About</h4><p class="kc-tag" id="kcTag" hidden></p><p class="kc-about is-empty" id="kcAbout"></p>' +
        '<button class="kc-more" id="kcMore" type="button" hidden>Read more</button><div class="kc-chips" id="kcChips"></div></div>' +
      '<div class="kc-card"><button class="kc-row" id="kcMediaRow" type="button"><span class="grow">Media, links and docs</span><em id="kcMediaCount"></em><i>\u203A</i></button>' +
        '<div class="kc-strip" id="kcStrip"></div><div class="kc-counts" id="kcCounts"></div></div>' +
      '<div class="kc-card kc-rows">' +
        '<label class="set-row"><span>Mute notifications<small>Stop pop-ups and sounds from this chat</small></span><span class="switch"><input type="checkbox" id="kcMute" /><i></i></span></label>' +
        '<button class="kc-row" id="kcStars" type="button"><span class="kc-ico">\u2B50</span><span class="grow">Starred messages</span><em id="kcStarCount"></em><i>\u203A</i></button>' +
        '<div class="kc-row"><span class="kc-ico">\u23F3</span><span class="grow">Disappearing messages</span><select id="kcDisappear"><option value="0">Off</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="7776000">90 days</option></select></div>' +
        '<button class="kc-row" id="kcTheme" type="button"><span class="kc-ico">\uD83C\uDF08</span><span class="grow">Chat theme<small>Colours and a photo from your gallery</small></span><i>\u203A</i></button>' +
        '<button class="kc-row" id="kcWall" type="button"><span class="kc-ico">\uD83C\uDFA8</span><span class="grow">Chat wallpaper</span><i>\u203A</i></button>' +
        '<button class="kc-row" id="kcEnc" type="button"><span class="kc-ico">\uD83D\uDD12</span><span class="grow">Encryption<small>Messages and calls are end-to-end encrypted. Tap to verify.</small></span><i>\u203A</i></button>' +
      '</div>' +
      '<div class="kc-card" id="kcGroupsCard" hidden><h4 id="kcGroupsH">Groups in common</h4><div id="kcGroups"></div></div>' +
      '<div class="kc-card kc-rows">' +
        '<button class="kc-row" id="kcShare" type="button"><span class="kc-ico">\u2197\uFE0F</span><span class="grow">Share contact</span></button>' +
        '<button class="kc-row bad" id="kcBlock" type="button"><span class="kc-ico">\uD83D\uDEAB</span><span class="grow">Block</span></button>' +
        '<button class="kc-row bad" id="kcReport" type="button"><span class="kc-ico">\u26A0\uFE0F</span><span class="grow">Report</span></button>' +
      '</div>' +
      '<p class="kc-foot">Founded by Mr Vael Tech</p>' +
    '</div>';
  document.body.appendChild(page);

  var peer = null, prof = null, token = 0, presenceTimer = null;
  var actions = {};

  function makeActions() {
    var box = $("#kcActions");
    [["msg", "Message", ICON.msg], ["call", "Voice", ICON.call], ["video", "Video", ICON.video], ["search", "Search", ICON.search], ["save", "Save", ICON.save]].forEach(function (a) {
      var b = h("button", "kc-act");
      b.type = "button";
      b.appendChild(svg(a[2]));
      b.appendChild(h("span", "", a[1]));
      box.appendChild(b);
      actions[a[0]] = b;
    });
  }
  makeActions();

  function isSaved(id) { return load(LS.contacts, []).some(function (c) { return String(c.id) === String(id); }); }
  function paintSave() {
    var saved = !!peer && isSaved(peer.id);
    actions.save.lastChild.textContent = saved ? "Saved" : "Save";
    actions.save.disabled = saved;
  }
  function paintPresence() {
    if (!peer) return;
    var t = presenceText(peer.id, peer.lastSeen);
    var el = $("#kcPresence");
    el.textContent = t;
    el.classList.toggle("on", t === "online");
  }

  function render() {
    if (!peer) return;
    var u = Object.assign({}, peer, prof && prof.user ? prof.user : {});
    var name = peer.name || u.fullName || "Kyro user";
    setAvatar($("#kcAvatar"), u.avatar || peer.avatar, name);
    var nm = $("#kcName");
    nm.textContent = name;
    if (u.isVerified) { var v = h("span", "kc-verified", "\u2713"); v.title = "Verified"; nm.appendChild(v); }
    var un = $("#kcUser");
    un.textContent = u.username ? "@" + u.username : "";
    $("#kcPhone").textContent = u.phone || u.email || "";
    paintPresence();
    fillStatus($("#kcStatus"), u);

    var tag = $("#kcTag"), about = $("#kcAbout");
    var bio = (u.bio || "").trim(), long = (u.about || "").trim();
    tag.textContent = bio; tag.hidden = !bio;
    about.textContent = long || (bio ? "" : "No about info shared yet.");
    about.classList.toggle("is-empty", !long);
    about.hidden = !long && !!bio;
    about.classList.remove("is-clamped");
    var more = $("#kcMore");
    more.hidden = true;
    if (long.length > 220 || long.split("\n").length > 5) {
      about.classList.add("is-clamped"); more.hidden = false; more.textContent = "Read more";
    }
    var extra = [];
    if (prof && prof.user && prof.user.createdAt) extra.push({ icon: "\u2728", text: "On Kyro since " + monthYear(prof.user.createdAt) });
    if (prof && prof.relation && prof.relation.chattingSince) extra.push({ icon: "\uD83D\uDCAC", text: "Chatting since " + monthYear(prof.relation.chattingSince) });
    fillChips($("#kcChips"), infoChips(u, extra));

    $("#kcMute").checked = isMuted(peer.id);
    var stars = load("kyro.stars", []).filter(function (x) { return x.peerId === String(peer.id); }).length;
    $("#kcStarCount").textContent = stars ? String(stars) : "None";
    $("#kcBlock").lastChild.textContent = blockedSet().has(String(peer.id)) ? "Unblock" : "Block";
    paintSave();
    paintGroups();
    paintCounts();
  }

  function linkCount() {
    var rx = /https?:\/\/[^\s<>"']+/gi, n = 0;
    Array.prototype.forEach.call(document.getElementById("messages").children, function (b) {
      var f = (b._plain || "").match(rx);
      if (f) n += f.length;
    });
    return n;
  }
  function paintCounts() {
    var s = (prof && prof.shared) || {};
    var links = linkCount();
    var items = [["Photos", s.image || 0], ["Videos", s.video || 0], ["Voice", s.voice || 0], ["Files", s.file || 0], ["Links", links]].filter(function (x) { return x[1] > 0; });
    var total = items.reduce(function (a, x) { return a + x[1]; }, 0);
    $("#kcMediaCount").textContent = total ? String(total) : "None";
    var box = $("#kcCounts");
    box.textContent = "";
    items.forEach(function (x) {
      var c = h("span", "kc-count");
      c.appendChild(h("b", "", String(x[1])));
      c.appendChild(document.createTextNode(x[0]));
      box.appendChild(c);
    });
  }
  function paintGroups() {
    var id = String(peer.id);
    var list = load(LS.groups, []).filter(function (g) { return (g.members || []).map(String).indexOf(id) >= 0; });
    var card = $("#kcGroupsCard"), box = $("#kcGroups");
    box.textContent = "";
    card.hidden = !list.length;
    $("#kcGroupsH").textContent = list.length + (list.length === 1 ? " group in common" : " groups in common");
    list.forEach(function (g) {
      var row = h("div", "kc-group");
      row.appendChild(h("span", "kc-gav", Kyro.initials(g.name || "G")));
      var info = h("div");
      info.appendChild(h("b", "", g.name || "Group"));
      info.appendChild(h("small", "", (g.members || []).length + " members"));
      row.appendChild(info);
      box.appendChild(row);
    });
  }

  function loadStrip(myToken) {
    var strip = $("#kcStrip");
    strip.textContent = "";
    strip.appendChild(h("p", "hint", "Loading..."));
    Kyro.api.gallery(peer.id).then(function (r) {
      if (myToken !== token) return;
      strip.textContent = "";
      var imgs = r && r._ok !== false ? (r.images || []) : [];
      if (!imgs.length) { strip.appendChild(h("p", "hint", "No photos shared yet.")); return; }
      imgs.slice(0, 9).forEach(function (m) {
        var b = h("button", "kc-thumb");
        b.type = "button";
        b.setAttribute("aria-label", "Open photo");
        b.style.backgroundImage = "url(" + m.media + ")";
        b.addEventListener("click", function () {
          var big = document.createElement("img");
          big.src = m.media; big.className = "lightbox-img";
          openLightbox(big);
        });
        strip.appendChild(b);
      });
      if (imgs.length > 9) {
        var more = h("button", "kc-thumb", "+" + (imgs.length - 9));
        more.type = "button";
        more.addEventListener("click", function () { $("#piMedia").click(); });
        strip.appendChild(more);
      }
    }).catch(function () { if (myToken === token) { strip.textContent = ""; strip.appendChild(h("p", "hint", "Couldn't load media.")); } });
  }

  function openPage(p) {
    peer = p; prof = null;
    var myToken = ++token;
    render();
    page.hidden = false;
    $(".kc-scroll", page).scrollTop = 0;
    loadStrip(myToken);
    var sel = $("#kcDisappear");
    sel.value = "0";
    Kyro.api.chatSettings(p.id).then(function (r) { if (myToken === token && r && r._ok !== false) sel.value = String(r.disappearAfter || 0); }).catch(function () {});
    Kyro.api.profileOf(p.id).then(function (r) {
      if (myToken !== token || !r || r._ok === false || !r.user) return;
      prof = r;
      // share the fresh fields with the rest of the app
      if (currentPeer && String(currentPeer.id) === String(p.id)) {
        ["about", "statusEmoji", "statusText", "location", "website", "dateOfBirth", "bio", "isVerified"].forEach(function (k) { if (r.user[k] != null) currentPeer[k] = r.user[k]; });
        peer = currentPeer;
      }
      render();
    }).catch(function () {});
    clearInterval(presenceTimer);
    presenceTimer = setInterval(paintPresence, 15000);
  }
  function closePage() {
    page.hidden = true;
    token++;
    clearInterval(presenceTimer);
  }

  // open from the chat header (name or photo); groups keep their own sheet
  var head = $(".thread-head");
  head.addEventListener("click", function (e) {
    if (!e.target.closest(".grow, #peerAvatar")) return;
    if (!currentPeer || isGroup(currentPeer)) return;
    e.stopPropagation();
    openPage(currentPeer);
  }, true);

  $("#kcBack").addEventListener("click", closePage);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !page.hidden) closePage(); });
  $("#backChat").addEventListener("click", closePage);

  $("#kcAvatar").addEventListener("click", function () {
    var src = (prof && prof.user && prof.user.avatar) || (peer && peer.avatar);
    if (!src) { toast("No profile photo yet."); return; }
    var big = document.createElement("img");
    big.src = src; big.className = "lightbox-img";
    openLightbox(big);
  });
  $("#kcMore").addEventListener("click", function () {
    var about = $("#kcAbout"), open = about.classList.toggle("is-clamped");
    $("#kcMore").textContent = open ? "Read more" : "Show less";
  });

  actions.msg.addEventListener("click", function () { closePage(); var i = document.getElementById("messageInput"); if (i) i.focus(); });
  actions.call.addEventListener("click", function () { if (!peer) return; closePage(); startCall(peer, false); });
  actions.video.addEventListener("click", function () { if (!peer) return; closePage(); startCall(peer, true); });
  actions.search.addEventListener("click", function () { closePage(); var b = document.getElementById("threadSearchBtn"); if (b) b.click(); });
  actions.save.addEventListener("click", function () {
    if (!peer || isSaved(peer.id)) return;
    var list = load(LS.contacts, []);
    list.unshift(Object.assign({}, peer));
    save(LS.contacts, list);
    paintSave();
    toast("Saved to your contacts.");
  });

  $("#kcMediaRow").addEventListener("click", function () { $("#piMedia").click(); });
  $("#kcStars").addEventListener("click", function () { closePage(); document.getElementById("starredBtn").click(); });
  $("#kcWall").addEventListener("click", function () { $("#piWall").click(); });
  $("#kcTheme").addEventListener("click", function () { closePage(); if (window.KyroTheme) KyroTheme.open(peer && peer.id); });
  $("#kcMute").addEventListener("change", function () {
    if (!peer) return;
    var want = this.checked;
    if (isMuted(peer.id) !== want) toggleIn("kyro.mutes", peer.id);
    renderChats(chats);
    toast(want ? "Chat muted." : "Chat unmuted.");
  });
  $("#kcDisappear").addEventListener("change", function () {
    var native = document.getElementById("piDisappear");
    native.value = this.value;
    native.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("#kcBlock").addEventListener("click", async function () {
    if (!peer) return;
    var on = !blockedSet().has(String(peer.id));
    if (on && !confirm("Block " + (peer.name || "this contact") + "? They won't be able to message or call you.")) return;
    if (await setBlocked(peer, on)) { $("#kcBlock").lastChild.textContent = on ? "Unblock" : "Block"; toast(on ? "Contact blocked." : "Contact unblocked."); }
  });
  $("#kcReport").addEventListener("click", function () { $("#piReport").click(); });
  $("#kcShare").addEventListener("click", async function () {
    if (!peer) return;
    var u = Object.assign({}, peer, prof && prof.user ? prof.user : {});
    var text = (peer.name || "Kyro user") + " on Kyro Chat" + (u.username ? " (@" + u.username + ")" : "");
    try {
      if (navigator.share) { await navigator.share({ text: text }); return; }
      await navigator.clipboard.writeText(text);
      toast("Contact copied.");
    } catch (_) {}
  });

  /* ---------- Encryption: safety number ---------- */
  async function safetyNumber(a, b) {
    var keys = [String(a), String(b)].sort().join("|");
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keys));
    var dv = new DataView(buf), groups = [];
    for (var i = 0; i < 6; i++) groups.push(String(dv.getUint32(i * 4) % 100000).padStart(5, "0"));
    return groups.join(" ");
  }
  var safety = h("div", "modal is-off");
  safety.id = "kcSafety"; safety.hidden = true;
  safety.innerHTML = '<div class="sheet" style="text-align:center"><h3>Verify encryption</h3>' +
    '<p class="hint" id="kcSafeInfo"></p><p class="kc-safe" id="kcSafeNum"></p>' +
    '<p class="hint">If this number matches the one on their phone, your chat is private and nobody is listening in.</p>' +
    '<button class="sheet-btn" id="kcSafeCopy" type="button">Copy number</button><button class="sheet-btn ghost" id="kcSafeClose" type="button">Close</button></div>';
  document.body.appendChild(safety);
  $("#kcSafeClose").addEventListener("click", function () { closeModal("kcSafety"); });
  $("#kcSafeCopy").addEventListener("click", function () {
    var t = $("#kcSafeNum").textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast("Number copied."); }).catch(function () {});
  });
  $("#kcEnc").addEventListener("click", async function () {
    if (!peer) return;
    var mine = (me && me.publicKey) || "", theirs = peer.publicKey || "";
    var info = $("#kcSafeInfo"), num = $("#kcSafeNum");
    if (!mine || !theirs || !(window.crypto && crypto.subtle)) {
      info.textContent = "Encryption keys aren't ready yet. Both of you need to open Kyro once, then try again.";
      num.textContent = "";
    } else {
      info.textContent = "Your safety number with " + (peer.name || "this contact") + ":";
      try { num.textContent = await safetyNumber(mine, theirs); } catch (_) { num.textContent = ""; info.textContent = "Couldn't create the number on this device."; }
    }
    openModal("kcSafety");
  });

  /* =============================================================
     ABOUT ME (own profile)
     ============================================================= */
  var acc = $('.tab-page[data-tab="account"] .account-card');
  var card = h("div", "kc-card ab-card");
  card.id = "aboutCard";
  card.innerHTML = '<div class="ab-head"><h4>About me</h4><button class="ab-edit" id="abEdit" type="button">Edit</button></div>' +
    '<div class="kc-status" id="abStatus" hidden></div><p class="kc-about is-empty" id="abText"></p><div class="kc-chips" id="abChips"></div><p class="ab-vis" id="abVis"></p>';
  if (acc) acc.insertAdjacentElement("afterend", card);

  function myPrivacy() { return Object.assign({ about: "everyone", phone: "contacts", email: "contacts", birthday: "contacts", location: "everyone", website: "everyone" }, (me && me.privacy) || {}); }
  function paintAbout() {
    if (!acc) return;
    var t = $("#abText"), a = (me.about || "").trim();
    t.textContent = a || "Tell people who you are. Add a few lines about yourself (up to " + ABOUT_MAX + " characters).";
    t.classList.toggle("is-empty", !a);
    fillStatus($("#abStatus"), me);
    fillChips($("#abChips"), infoChips(me));
    $("#abVis").textContent = "About is visible to: " + LEVEL_LABEL[myPrivacy().about];
  }
  paintAbout();
  if (typeof window.paintMe === "function") {
    var origPaint = window.paintMe;
    window.paintMe = function () { var r = origPaint.apply(this, arguments); try { paintAbout(); } catch (_) {} return r; };
  }

  var modal = h("div", "modal is-off");
  modal.id = "aboutModal"; modal.hidden = true;
  var sheetHtml = '<div class="sheet tall ab-sheet"><h3>About me</h3><div class="ab-body">' +
    '<div class="kc-card ab-preview"><h4>Preview</h4><div class="kc-status" id="abpStatus" hidden></div><p class="kc-about is-empty" id="abpText"></p><div class="kc-chips" id="abpChips"></div></div>' +
    '<label for="abInput">About <small class="hint" id="abCount">0/' + ABOUT_MAX + '</small></label>' +
    '<textarea id="abInput" maxlength="' + ABOUT_MAX + '" placeholder="Who you are, what you do, what you love..."></textarea>' +
    '<label for="abEmoji">Status</label><div class="ab-row"><input id="abEmoji" maxlength="4" placeholder="\uD83D\uDE42" aria-label="Status emoji" /><input id="abStatusText" maxlength="60" placeholder="What are you up to?" aria-label="Status text" /></div>' +
    '<div class="ab-quick" id="abQuick"></div>' +
    '<label for="abLoc">Location</label><input id="abLoc" maxlength="60" placeholder="City, Country" autocomplete="off" />' +
    '<label for="abWeb">Website</label><input id="abWeb" maxlength="120" placeholder="yoursite.com" inputmode="url" autocapitalize="none" autocomplete="off" />' +
    '<h4 class="set-h">Who can see</h4><div id="abPriv"></div>' +
    '<p class="form-msg" id="abMsg"></p></div>' +
    '<button class="sheet-btn" id="abSave" type="button">Save</button><button class="sheet-btn ghost" id="abCancel" type="button">Cancel</button></div>';
  modal.innerHTML = sheetHtml;
  document.body.appendChild(modal);

  var PRIV_FIELDS = [["about", "About me"], ["phone", "Phone number"], ["email", "Email"], ["birthday", "Birthday"], ["location", "Location"], ["website", "Website"]];
  PRIV_FIELDS.forEach(function (f) {
    var row = h("div", "ab-priv");
    row.appendChild(h("span", "", f[1]));
    var sel = document.createElement("select");
    sel.dataset.f = f[0];
    sel.setAttribute("aria-label", f[1] + " visibility");
    LEVELS.forEach(function (l) { var o = document.createElement("option"); o.value = l[0]; o.textContent = l[1]; sel.appendChild(o); });
    row.appendChild(sel);
    $("#abPriv", modal).appendChild(row);
  });
  QUICK.forEach(function (q) {
    var b = h("button", "", q[0] + " " + q[1]);
    b.type = "button";
    b.addEventListener("click", function () { $("#abEmoji").value = q[0]; $("#abStatusText").value = q[1]; preview(); });
    $("#abQuick", modal).appendChild(b);
  });

  function count() {
    var n = $("#abInput").value.length, el = $("#abCount");
    el.textContent = n + "/" + ABOUT_MAX;
    el.classList.toggle("warn", n >= ABOUT_MAX - 50 && n < ABOUT_MAX);
    el.classList.toggle("max", n >= ABOUT_MAX);
  }
  function formData() {
    var web = $("#abWeb").value.trim();
    return {
      about: $("#abInput").value.replace(/\r\n/g, "\n").trim(),
      statusEmoji: $("#abEmoji").value.trim(),
      statusText: $("#abStatusText").value.trim(),
      location: $("#abLoc").value.trim(),
      website: web
    };
  }
  function preview() {
    count();
    var d = formData();
    $("#abpText").textContent = d.about || "Nothing here yet.";
    $("#abpText").classList.toggle("is-empty", !d.about);
    fillStatus($("#abpStatus"), d);
    var site = d.website ? safeUrl(/^https?:\/\//i.test(d.website) ? d.website : "https://" + d.website) : "";
    fillChips($("#abpChips"), infoChips({ location: d.location, website: site, dateOfBirth: "" }));
  }
  ["abInput", "abEmoji", "abStatusText", "abLoc", "abWeb"].forEach(function (id) { document.getElementById(id).addEventListener("input", preview); });

  function openEditor() {
    $("#abInput").value = me.about || "";
    $("#abEmoji").value = me.statusEmoji || "";
    $("#abStatusText").value = me.statusText || "";
    $("#abLoc").value = me.location || "";
    $("#abWeb").value = me.website || "";
    var pv = myPrivacy();
    Array.prototype.forEach.call(modal.querySelectorAll("#abPriv select"), function (s) { s.value = pv[s.dataset.f] || "everyone"; });
    var msg = $("#abMsg"); msg.textContent = ""; msg.classList.remove("bad");
    preview();
    openModal("aboutModal");
  }
  $("#abEdit").addEventListener("click", openEditor);
  card.addEventListener("click", function (e) { if (e.target === $("#abText") && !$("#abText").hidden) openEditor(); });
  $("#abCancel").addEventListener("click", function () { closeModal("aboutModal"); });

  $("#abSave").addEventListener("click", async function () {
    var msg = $("#abMsg"), btn = $("#abSave");
    var data = formData();
    if (data.about.length > ABOUT_MAX) { msg.className = "form-msg bad"; msg.textContent = "About me can be at most " + ABOUT_MAX + " characters."; return; }
    var privacy = {};
    Array.prototype.forEach.call(modal.querySelectorAll("#abPriv select"), function (s) { privacy[s.dataset.f] = s.value; });
    data.privacy = privacy;
    btn.disabled = true;
    msg.className = "form-msg"; msg.textContent = "Saving...";
    var res = null;
    try { res = await Kyro.api.updateProfile(data); } catch (_) {}
    btn.disabled = false;
    if (!res || res._ok === false || !res.user) {
      msg.className = "form-msg bad";
      msg.textContent = (res && res.message) || "Couldn't save. Check your connection and try again.";
      return;
    }
    me = Object.assign({}, me, res.user);
    Kyro.setSession(Kyro.getToken(), me);
    paintAbout();
    msg.textContent = "Saved.";
    setTimeout(function () { closeModal("aboutModal"); }, 450);
  });
})();
