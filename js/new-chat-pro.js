/* New chat PRO: full-screen picker that replaces the small "Start conversation" sheet.
   - Quick actions (New group / New contact / New community)
   - Recent people strip, contacts grouped A-Z with a draggable letter scrubber
   - One search box: filters your contacts AND finds anyone on Kyro by name, @username, email or phone
   - Group builder on the same screen: tap people, see them as chips, name the group, done
   The old sheet markup stays in app.html as a fallback; this file only intercepts the + buttons. */
(() => {
  let root = null, listEl, scrollEl, chipsEl, recentsEl, actionsEl, indexEl, bubbleEl, fab, nameBar, titleEl, subEl, searchWrap, searchIn;
  let mode = "chat";               // "chat" | "group"
  let selected = new Map();        // id -> peer (group mode)
  let query = "", remote = [], seq = 0, timer = null, localPeers = [];

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const letterOf = (name) => { const c = norm(String(name || "").trim()[0] || "#").toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
  const sub = (p) => (p.username ? "@" + p.username : p.statusText || p.about || p.bio || p.phone || p.email || "On Kyro Chat");
  const ico = (path) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" fill-rule="evenodd"><path d="' + path + '"/></svg>';
  const ICON = {
    back: "M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z",
    search: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
    group: "M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
    contact: "M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z",
    community: "M12 3 2 9v2h2v9h6v-6h4v6h6v-9h2V9z",
    check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
    close: "M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"
  };

  function peersNow() {
    const map = new Map();
    const add = (p) => { if (p && p.id && String(p.id) !== String(meId) && !map.has(String(p.id))) map.set(String(p.id), p); };
    load(LS.contacts, []).forEach(add);                 // your own contact names win
    (chats || []).forEach((c) => add(peerFrom(c)));
    return [...map.values()].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  }

  function build() {
    root = el("div", "nc");
    root.innerHTML =
      '<header class="nc-head"><button class="nc-ib nc-back" type="button" aria-label="Back"></button>' +
      '<div class="nc-title"><b>New chat</b><span></span></div>' +
      '<button class="nc-ib nc-sbtn" type="button" aria-label="Search"></button></header>' +
      '<div class="nc-search" hidden><input type="search" autocomplete="off" autocapitalize="none" placeholder="Search name, @username, email or phone" /></div>' +
      '<div class="nc-chips" hidden></div>' +
      '<div class="nc-scroll"><div class="nc-actions"></div><div class="nc-recents" hidden></div><div class="nc-list"></div></div>' +
      '<div class="nc-index"></div><div class="nc-bubble" hidden></div>' +
      '<button class="nc-fab" type="button" hidden aria-label="Next"></button>' +
      '<form class="nc-namebar" hidden><input maxlength="40" placeholder="Group name" /><button type="submit">Create</button></form>';
    document.body.appendChild(root);
    titleEl = root.querySelector(".nc-title b"); subEl = root.querySelector(".nc-title span");
    searchWrap = root.querySelector(".nc-search"); searchIn = searchWrap.querySelector("input");
    chipsEl = root.querySelector(".nc-chips"); scrollEl = root.querySelector(".nc-scroll");
    actionsEl = root.querySelector(".nc-actions"); recentsEl = root.querySelector(".nc-recents");
    listEl = root.querySelector(".nc-list"); indexEl = root.querySelector(".nc-index");
    bubbleEl = root.querySelector(".nc-bubble"); fab = root.querySelector(".nc-fab"); nameBar = root.querySelector(".nc-namebar");
    root.querySelector(".nc-back").innerHTML = ico(ICON.back);
    root.querySelector(".nc-sbtn").innerHTML = ico(ICON.search);
    fab.innerHTML = ico(ICON.check);

    root.querySelector(".nc-back").onclick = back;
    root.querySelector(".nc-sbtn").onclick = () => { searchWrap.hidden = !searchWrap.hidden; if (!searchWrap.hidden) searchIn.focus(); else { searchIn.value = ""; setQuery(""); } };
    searchIn.addEventListener("input", () => setQuery(searchIn.value));
    fab.onclick = () => { fab.hidden = true; nameBar.hidden = false; nameBar.querySelector("input").focus(); };
    nameBar.addEventListener("submit", (e) => { e.preventDefault(); createGroup(nameBar.querySelector("input").value.trim()); });

    // A-Z scrubber
    const jump = (e) => {
      const letters = [...indexEl.children]; if (!letters.length) return;
      const r = indexEl.getBoundingClientRect();
      const i = Math.max(0, Math.min(letters.length - 1, Math.floor(((e.clientY - r.top) / r.height) * letters.length)));
      const L = letters[i].textContent;
      const target = listEl.querySelector('[data-letter="' + L + '"]');
      if (target) scrollEl.scrollTop = target.offsetTop - 2;
      bubbleEl.textContent = L; bubbleEl.hidden = false;
    };
    indexEl.addEventListener("pointerdown", (e) => { indexEl.setPointerCapture(e.pointerId); jump(e); });
    indexEl.addEventListener("pointermove", (e) => { if (indexEl.hasPointerCapture(e.pointerId)) jump(e); });
    const endJump = () => { bubbleEl.hidden = true; };
    indexEl.addEventListener("pointerup", endJump); indexEl.addEventListener("pointercancel", endJump);
  }

  function open() {
    if (!root) build();
    mode = "chat"; selected = new Map(); query = ""; remote = []; searchIn.value = ""; searchWrap.hidden = true; nameBar.hidden = true;
    localPeers = peersNow();
    paint();
    root.classList.add("show");
    requestAnimationFrame(() => root.classList.add("open"));
  }
  function close() {
    if (!root) return;
    root.classList.remove("open");
    setTimeout(() => root.classList.remove("show"), 220);
    searchIn.blur();
  }
  function back() {
    if (!nameBar.hidden) { nameBar.hidden = true; fab.hidden = selected.size === 0; return; }
    if (mode === "group") { mode = "chat"; selected = new Map(); paint(); return; }
    close();
  }

  function setQuery(v) {
    query = v.trim(); remote = []; clearTimeout(timer); const mine = ++seq;
    paint();
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      let data; try { data = await Kyro.api.lookup(query); } catch (_) { return; }
      if (mine !== seq || !data || !data._ok) return;
      const have = new Set(localPeers.map((p) => String(p.id)));
      remote = asArray(data).map((u) => peerFrom({ user: u, preview: "On Kyro Chat" })).filter((p) => p.id && String(p.id) !== String(meId) && !have.has(String(p.id)));
      paint(true);
    }, 380);
  }

  function paint(keepScroll) {
    const top = scrollEl.scrollTop;
    const inGroup = mode === "group";
    titleEl.textContent = inGroup ? "New group" : "New chat";
    subEl.textContent = inGroup ? (selected.size ? selected.size + " selected" : "Add members") : localPeers.length + " contacts";

    // actions + recents only in plain chat mode with no search
    actionsEl.innerHTML = ""; recentsEl.innerHTML = ""; recentsEl.hidden = true;
    if (!inGroup && !query) {
      [["group", "New group", "Chat with several people", () => { mode = "group"; paint(); }],
       ["contact", "New contact", "Add someone by phone or email", () => { close(); openModal("contactModal"); }],
       ["community", "New community", "Announcements and groups together", () => { close(); showTab("communities"); setTimeout(() => { const b = document.getElementById("addCommunityBtn"); if (b) b.click(); }, 80); }]
      ].forEach(([k, t, s, fn]) => {
        const r = el("button", "nc-row nc-action"); r.type = "button";
        const i = el("div", "nc-av nc-ico nc-ico-" + k); i.innerHTML = ico(ICON[k]);
        const tx = el("div", "nc-tx"); tx.append(el("b", "", t), el("span", "", s));
        r.append(i, tx); r.onclick = fn; actionsEl.appendChild(r);
      });
      const recent = (chats || []).map(peerFrom).filter((p) => p.id && String(p.id) !== String(meId)).slice(0, 8);
      if (recent.length) {
        recentsEl.hidden = false;
        recentsEl.appendChild(el("div", "nc-h", "Recent"));
        const strip = el("div", "nc-strip");
        recent.forEach((p) => {
          const b = el("button", "nc-recent"); b.type = "button";
          const av = el("div", "nc-av"); setAvatar(av, p.avatar, p.name);
          if (onlineIds.has(String(p.id))) av.classList.add("on");
          b.append(av, el("span", "", String(p.name).split(" ")[0]));
          b.onclick = () => { close(); openThread(p); };
          strip.appendChild(b);
        });
        recentsEl.appendChild(strip);
      }
    }

    // chips (group mode)
    chipsEl.innerHTML = ""; chipsEl.hidden = !(inGroup && selected.size);
    selected.forEach((p, id) => {
      const c = el("button", "nc-chip"); c.type = "button";
      const av = el("div", "nc-av nc-sm"); setAvatar(av, p.avatar, p.name);
      c.append(av, el("span", "", String(p.name).split(" ")[0]));
      const x = el("i", ""); x.innerHTML = ico(ICON.close); c.append(x);
      c.onclick = () => { selected.delete(id); paint(true); };
      chipsEl.appendChild(c);
    });
    fab.hidden = !(inGroup && selected.size) || !nameBar.hidden;

    // list
    listEl.innerHTML = ""; indexEl.innerHTML = "";
    const q = norm(query);
    const mine = q ? localPeers.filter((p) => norm(p.name + " " + p.username + " " + p.email + " " + p.phone).includes(q)) : localPeers;
    const letters = [];
    let lastL = "";
    mine.forEach((p) => {
      const L = q ? "" : letterOf(p.name);
      if (!q && L !== lastL) { lastL = L; letters.push(L); const h = el("div", "nc-letter", L); h.dataset.letter = L; listEl.appendChild(h); }
      listEl.appendChild(row(p, false));
    });
    if (!q && letters.length > 5) letters.forEach((L) => indexEl.appendChild(el("span", "", L)));
    indexEl.hidden = !!q || letters.length <= 5;

    if (q && remote.length) {
      listEl.appendChild(el("div", "nc-letter nc-remote-h", "People on Kyro"));
      remote.forEach((p) => listEl.appendChild(row(p, true)));
    } else if (q && !mine.length) {
      listEl.appendChild(el("p", "nc-empty", query.length < 2 ? "Keep typing…" : "Searching Kyro for “" + query + "”…"));
    }
    if (!q && !mine.length) listEl.appendChild(el("p", "nc-empty", "No contacts yet. Tap New contact to add someone."));
    if (keepScroll) scrollEl.scrollTop = top;
  }

  function row(p, isRemote) {
    const r = el("button", "nc-row"); r.type = "button";
    const av = el("div", "nc-av"); setAvatar(av, p.avatar, p.name);
    if (onlineIds.has(String(p.id))) av.classList.add("on");
    const tx = el("div", "nc-tx"); tx.append(el("b", "", p.name), el("span", "", sub(p)));
    r.append(av, tx);
    if (mode === "group") {
      const box = el("div", "nc-check"); box.innerHTML = ico(ICON.check); r.append(box);
      if (selected.has(String(p.id))) r.classList.add("sel");
    }
    r.onclick = () => {
      if (isRemote) remember(p);
      if (mode === "group") {
        const id = String(p.id);
        if (selected.has(id)) selected.delete(id); else selected.set(id, p);
        if (isRemote) { localPeers = peersNow(); remote = remote.filter((x) => String(x.id) !== id); }
        paint(true);
      } else { close(); openThread(p); }
    };
    return r;
  }

  function remember(p) {
    const list = load(LS.contacts, []);
    if (!list.some((c) => String(c.id) === String(p.id))) { list.unshift(p); save(LS.contacts, list); }
  }

  function createGroup(name) {
    if (!name || !selected.size) return;
    const groups = load(LS.groups, []);
    groups.unshift({ id: Date.now(), name, creatorId: meId, members: [...selected.keys()], admins: [meId] });
    save(LS.groups, groups);
    nameBar.querySelector("input").value = "";
    close(); renderChats(chats);
    if (typeof toast === "function") toast("Group “" + name + "” created");
  }

  // Intercept the + buttons before the old sheet handlers run
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("#plusBtn, #emptyPlus");
    if (!t) return;
    e.stopImmediatePropagation(); e.preventDefault();
    open();
  }, true);

  window.KyroNewChat = { open, close };
})();
