/* Kyro design layer v2 — behaviour that the new look needs.
   Everything here only re-presents existing features by clicking the app's own
   buttons; no data or backend changes. Remove the <script> line to revert. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var press = function (id) { var el = document.getElementById(id); if (el) el.click(); };
  var readList = function (key) {
    try { var v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  };

  var P = {
    group: '<path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h8v-2.5c0-1.2.6-2.2 1.5-3A9 9 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/>',
    person: '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/>',
    add: '<path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9 0V9H4v3H1v2h3v3h2v-3h3v-2zm9 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/>',
    star: '<path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.2-.6L12 2 9.2 8.7 2 9.3l5.4 4.7-1.6 7z"/>',
    gear: '<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4L10.7 6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.3 2.7h4l.3-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/>',
    image: '<path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/>',
    block: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.9 7.9 0 0 1 4 12zm8 8a7.9 7.9 0 0 1-4.9-1.7l11.2-11.2A8 8 0 0 1 12 20z"/>',
    out: '<path d="M10 17v-3H3v-4h7V7l5 5zm2-14h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7v-2h7V5h-7z"/>',
    chev: '<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    dots: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
    search: '<path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>',
    timer: '<path d="M15 1H9v2h6zm-4 13h2V8h-2zm8.1-6.6 1.4-1.4-1.4-1.4-1.4 1.4A9 9 0 1 0 21 13a9 9 0 0 0-1.9-5.6zM12 20a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18 2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.2h2A4.5 4.5 0 0 0 21.5 10 9 9 0 0 0 12 3zM6.5 12a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 6.5 12zm3-4a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 9.5 8zm5 0A1.5 1.5 0 1 1 16 6.5 1.5 1.5 0 0 1 14.5 8z"/>'
  };
  var svg = function (k, extra) { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"' + (extra || "") + '>' + P[k] + '</svg>'; };

  /* ---------- 1. Overflow menus (chat list header + chat header) ---------- */
  var scrim, openMenu;
  function ensureScrim() {
    if (scrim) return;
    scrim = document.createElement("div");
    scrim.className = "k-menu-scrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);
    scrim.addEventListener("click", function () { if (openMenu) openMenu.close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openMenu) openMenu.close(); });
  }
  function attachMenu(btn, getItems) {
    ensureScrim();
    var menu = document.createElement("div");
    menu.className = "k-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    var api = { close: function () { menu.hidden = true; scrim.hidden = true; btn.setAttribute("aria-expanded", "false"); if (openMenu === api) openMenu = null; } };
    btn.setAttribute("aria-haspopup", "menu");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!menu.hidden) { api.close(); return; }
      menu.innerHTML = "";
      getItems().forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        if (it[3]) b.className = "danger";
        b.innerHTML = svg(it[1]) + "<span>" + it[0] + "</span>";
        b.addEventListener("click", function () { api.close(); it[2](); });
        menu.appendChild(b);
      });
      var r = btn.getBoundingClientRect();
      menu.style.top = r.bottom + 6 + "px";
      menu.style.right = Math.max(10, window.innerWidth - r.right) + "px";
      menu.hidden = false;
      scrim.hidden = false;
      openMenu = api;
      btn.setAttribute("aria-expanded", "true");
      var first = menu.querySelector("button");
      if (first) first.focus();
    });
    return api;
  }
  function moreButton(label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "k-more";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg("dots", ' width="22" height="22"');
    return btn;
  }
  function buildMenu() {
    var top = $("#mainTop");
    if (top && !$(".k-more", top)) {
      var btn = moreButton("More options");
      top.appendChild(btn);
      attachMenu(btn, function () {
        return [
          ["New group", "group", function () { press("chooseGroup"); }],
          ["Add contact", "add", function () { press("chooseContact"); }],
          ["Starred messages", "star", function () { press("starredBtn"); }],
          ["Settings", "gear", function () { press("settingsBtn"); }],
          ["Log out", "out", function () { press("logoutBtn"); }, true]
        ];
      });
    }
    var head = $(".thread-head");
    if (head && !$(".k-more", head)) {
      var tb = moreButton("Chat options");
      head.appendChild(tb);
      attachMenu(tb, function () {
        var items = [["Search in chat", "search", function () { press("threadSearchBtn"); }]];
        var timer = document.getElementById("kxTimerBtn");
        if (timer && !timer.hidden) items.push(["Disappearing messages", "timer", function () { press("kxTimerBtn"); }]);
        if (window.KyroTheme) items.push(["Chat theme", "image", function () { KyroTheme.open(); }]);
        return items;
      });
    }
  }

  /* ---------- 2. Search: calmer copy + instant local filtering ---------- */
  function wireSearch() {
    var input = document.getElementById("searchInput");
    if (!input) return;
    input.placeholder = "Search chats or find people";
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      $$("#chatList .row").forEach(function (row) {
        var hit = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.classList.toggle("k-hide", !hit);
      });
    });
  }

  /* ---------- 3. Chip counts ---------- */
  function updateChips() {
    var unread = 0;
    try {
      var map = JSON.parse(localStorage.getItem("kyro.unread") || "{}");
      Object.keys(map).forEach(function (k) { if (Number(map[k]) > 0) unread++; });
    } catch (e) {}
    var counts = { unread: unread, pinned: readList("kyro.pins").length, archived: readList("kyro.arch").length };
    $$("#chatChips button[data-f]").forEach(function (b) {
      var n = counts[b.dataset.f];
      if (n === undefined) { b.removeAttribute("data-n"); return; }
      b.setAttribute("data-n", n > 99 ? "99+" : String(n));
    });
  }

  /* ---------- 4. Tidy rows: pin/mute become icons instead of emoji ---------- */
  var RX_PIN = /^\uD83D\uDCCC\s*/;
  var RX_MUTE = /\s*\uD83D\uDD07$/;
  function decorateRows() {
    $$("#chatList .row[data-peer]").forEach(function (row) {
      var b = $(".grow b", row);
      if (!b || row.dataset.kDone === b.textContent) return;
      var t = b.textContent;
      if (RX_PIN.test(t)) { row.classList.add("k-pinned"); t = t.replace(RX_PIN, ""); }
      if (RX_MUTE.test(t)) { row.classList.add("k-muted"); t = t.replace(RX_MUTE, ""); }
      b.textContent = t;
      row.dataset.kDone = t;
    });
    updateChips();
  }
  function watchList() {
    var list = document.getElementById("chatList");
    if (!list) return;
    new MutationObserver(decorateRows).observe(list, { childList: true });
    decorateRows();
  }

  /* ---------- 5. Account tab: a real settings list ---------- */
  function row(opts) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "k-item" + (opts.danger ? " danger" : "");
    b.innerHTML =
      '<span class="k-ico ' + opts.tone + '">' + svg(opts.icon) + "</span>" +
      '<span class="k-txt"><b>' + opts.title + "</b>" + (opts.sub ? "<small>" + opts.sub + "</small>" : "") + "</span>" +
      (opts.danger ? "" : '<span class="k-chev">' + svg("chev") + "</span>");
    b.addEventListener("click", opts.run);
    return b;
  }
  function buildSettingsList() {
    var page = $('.tab-page[data-tab="account"]');
    var card = page && $(".account-card", page);
    if (!page || !card || $(".k-group", page)) return;

    var group = document.createElement("div");
    group.className = "k-group";
    [
      { tone: "blue", icon: "person", title: "Edit profile", sub: "Photo, username and bio", run: function () { press("editProfileBtn"); } },
      { tone: "violet", icon: "palette", title: "Appearance", sub: "Accent colour and link previews", run: function () {
          var el = document.getElementById("kxLook");
          if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.animate([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 3px var(--k-acc)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1100 }); }
        } },
      { tone: "green", icon: "gear", title: "Settings", sub: "Theme, app lock and privacy", run: function () { press("settingsBtn"); } },
      { tone: "orange", icon: "image", title: "Chat wallpaper", sub: "Change how your chats look", run: function () { press("wallBtn"); } },
      { tone: "yellow", icon: "star", title: "Starred messages", sub: "Messages you saved", run: function () { press("starredBtn"); } },
      { tone: "red", icon: "block", title: "Blocked contacts", sub: "People you have blocked", run: function () { press("blockedBtn"); } }
    ].forEach(function (o) { group.appendChild(row(o)); });
    card.insertAdjacentElement("afterend", group);

    var out = document.createElement("div");
    out.className = "k-group k-logout";
    out.appendChild(row({ tone: "red", icon: "out", title: "Log out", danger: true, run: function () { press("logoutBtn"); } }));
    page.appendChild(out);
  }

  /* ---------- 6. Chat header status + tick order ---------- */
  function watchPeerMeta() {
    var meta = document.getElementById("peerMeta");
    if (!meta) return;
    var sync = function () {
      var t = (meta.textContent || "").trim().toLowerCase();
      meta.dataset.state = t === "online" ? "online" : /typing/.test(t) ? "typing" : "";
    };
    new MutationObserver(sync).observe(meta, { childList: true, characterData: true, subtree: true });
    sync();
  }
  function fixTickOrder(root) {
    $$(".bubble", root).forEach(function (b) {
      var tm = $(".mtime", b), tk = $(".ticks", b);
      if (!tm) return;
      var wrap = $(".k-meta", b);
      if (!wrap) {
        wrap = document.createElement("span");
        wrap.className = "k-meta";
        b.insertBefore(wrap, tm);
      }
      if (tm.parentNode !== wrap) wrap.appendChild(tm);
      if (tk && tk.parentNode !== wrap) wrap.appendChild(tk);
    });
  }
  function watchMessages() {
    var box = document.getElementById("messages");
    if (!box) return;
    new MutationObserver(function () { fixTickOrder(box); }).observe(box, { childList: true, subtree: true });
  }

  /* ---------- 7. Empty-state copy ---------- */
  function tidyEmpty() {
    var plus = document.getElementById("emptyPlus");
    if (plus) plus.textContent = "Start a chat";
  }

  function init() {
    buildMenu();
    wireSearch();
    watchList();
    buildSettingsList();
    watchPeerMeta();
    watchMessages();
    tidyEmpty();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
