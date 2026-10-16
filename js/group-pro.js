/* Kyro Group Pro
   Tapping a group's header opens a full group page: photo, name, description, quick actions,
   and Members / Media / Settings tabs. Admins can add people, make or dismiss admins, remove
   members, and edit the group. Groups are still stored on this device. */
(() => {
  if (typeof LS === "undefined" || typeof load !== "function") return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const say = (t) => { try { toast(t); } catch (_) {} };
  const isGroupId = (id) => String(id).startsWith("group:");
  const curId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");
  const getG = () => (isGroupId(curId()) ? load(LS.groups, []).find((g) => "group:" + g.id === curId()) : null);
  const putG = (g) => save(LS.groups, load(LS.groups, []).map((x) => (String(x.id) === String(g.id) ? g : x)));
  const adminSet = (g) => new Set([...(g.admins || []), g.creatorId].filter(Boolean).map(String));
  const amAdmin = (g) => adminSet(g).has(String(meId));

  const ICON = {
    add: "M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9 1v-2H4v2H2v2h2v2h2v-2h2v-2zm9 1c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z",
    search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    image: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z",
    exit: "M10.1 17.3 11.5 18.7 18.2 12 11.5 5.3 10.1 6.7 14.4 11H3v2h11.4zM19 3H12v2h7v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z",
    edit: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z",
    timer: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7z",
    wall: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm1 12h14l-4.5-6-3.5 4.5-2.5-3z"
  };
  const svg = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="' + d + '"/></svg>';

  /* ---------- people ---------- */
  function everyone() {
    const out = [], seen = new Set([String(meId)]);
    const add = (p) => {
      if (!p || !p.id) return;
      const id = String(p.id);
      if (seen.has(id) || isGroupId(id)) return;
      seen.add(id);
      out.push({ id, name: p.name || "Contact", avatar: p.avatar });
    };
    try { load(LS.contacts, []).forEach(add); } catch (_) {}
    try { chats.map(peerFrom).forEach((p) => { if (p && p.name) add(p); }); } catch (_) {}
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function people(g) {
    const known = new Map(everyone().map((p) => [p.id, p]));
    const admins = adminSet(g);
    const ids = (g.members || []).map(String).filter((x) => x !== String(meId));
    const list = ids.map((id) => {
      const p = known.get(id) || { id, name: "Member" };
      return { id, name: p.name, avatar: p.avatar, isMe: false, isAdmin: admins.has(id), isCreator: String(g.creatorId) === id };
    });
    list.sort((a, b) => (b.isAdmin - a.isAdmin) || String(a.name).localeCompare(String(b.name)));
    list.unshift({ id: String(meId), name: "You", avatar: typeof me !== "undefined" && me ? me.avatar || me.profilePicture : "", isMe: true, isAdmin: admins.has(String(meId)), isCreator: String(g.creatorId) === String(meId) });
    return list;
  }

  /* ---------- small UI helpers ---------- */
  function avatarInto(node, src, name) {
    try { setAvatar(node, src, name); } catch (_) { node.textContent = String(name || "?").slice(0, 1).toUpperCase(); }
  }

  function sheet(title, items, text) {
    const m = el("div", "kx-sh");
    const card = el("div", "kx-sh-card");
    card.appendChild(el("h3", null, title));
    if (text) card.appendChild(el("p", "kx-sh-text", text));
    const close = () => m.remove();
    items.forEach((it) => {
      const b = el("button", "kx-sh-btn" + (it.danger ? " danger" : ""), it.label);
      b.type = "button";
      b.addEventListener("click", () => { close(); if (it.fn) it.fn(); });
      card.appendChild(b);
    });
    const c = el("button", "kx-sh-btn ghost", "Cancel");
    c.type = "button";
    c.addEventListener("click", close);
    card.appendChild(c);
    m.appendChild(card);
    m.addEventListener("click", (e) => { if (e.target === m) close(); });
    document.body.appendChild(m);
    return m;
  }

  function squarePhoto(file, size) {
    size = size || 256;
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      const bail = () => { URL.revokeObjectURL(url); Kyro.fileToDataUrl(file).then(resolve); };
      img.onload = () => {
        try {
          const s = Math.min(img.width, img.height);
          const cv = document.createElement("canvas");
          cv.width = cv.height = size;
          cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL("image/jpeg", 0.85));
        } catch (_) { bail(); }
      };
      img.onerror = bail;
      img.src = url;
    });
  }

  /* ---------- page ---------- */
  let P = null, tab = "members", query = "";

  function build() {
    if (P) return P;
    const root = el("div", "kx-gp");
    root.id = "kxGP";
    root.hidden = true;
    root.innerHTML =
      '<header class="kx-gp-top"><button type="button" class="kx-gp-ic" data-a="back" aria-label="Back">\u2190</button><div class="kx-gp-title">Group info</div>' +
      '<button type="button" class="kx-gp-ic" data-a="edit" aria-label="Edit group">' + svg(ICON.edit) + '</button></header>' +
      '<div class="kx-gp-scroll">' +
      '<section class="kx-gp-hero"><div class="kx-gp-avatar"></div><h2 class="kx-gp-name"></h2><p class="kx-gp-sub"></p>' +
      '<p class="kx-gp-desc"></p><p class="kx-gp-made"></p></section>' +
      '<nav class="kx-gp-actions">' +
      '<button type="button" data-a="add"><span>' + svg(ICON.add) + '</span>Add</button>' +
      '<button type="button" data-a="search"><span>' + svg(ICON.search) + '</span>Search</button>' +
      '<button type="button" data-a="media"><span>' + svg(ICON.image) + '</span>Media</button>' +
      '<button type="button" data-a="exit" class="danger"><span>' + svg(ICON.exit) + '</span>Exit</button></nav>' +
      '<nav class="kx-gp-tabs"><button type="button" data-t="members">Members</button><button type="button" data-t="media">Media</button><button type="button" data-t="settings">Settings</button></nav>' +
      '<div class="kx-gp-body"></div></div>';
    document.body.appendChild(root);
    P = {
      root, scroll: $(".kx-gp-scroll", root), title: $(".kx-gp-title", root), avatar: $(".kx-gp-avatar", root),
      name: $(".kx-gp-name", root), sub: $(".kx-gp-sub", root), desc: $(".kx-gp-desc", root),
      made: $(".kx-gp-made", root), body: $(".kx-gp-body", root), editBtn: $('[data-a="edit"]', root),
      addBtn: $('.kx-gp-actions [data-a="add"]', root)
    };
    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-t]");
      if (t) { tab = t.dataset.t; paint(); return; }
      const a = e.target.closest("[data-a]");
      if (!a) return;
      const g = getG();
      if (!g) return;
      const act = a.dataset.a;
      if (act === "back") closePage();
      else if (act === "edit") openEdit(g);
      else if (act === "add") openAdd(g);
      else if (act === "media") { tab = "media"; paint(); P.scroll.scrollTo({ top: P.scroll.querySelector(".kx-gp-tabs").offsetTop - 4, behavior: "smooth" }); }
      else if (act === "exit") confirmExit(g);
      else if (act === "search") {
        tab = "members"; paint();
        const s = $(".kx-gp-search", P.root);
        P.scroll.scrollTo({ top: P.scroll.querySelector(".kx-gp-tabs").offsetTop - 4, behavior: "smooth" });
        if (s) setTimeout(() => s.focus(), 250);
      }
      else if (act === "desc") { if (amAdmin(g)) openEdit(g); }
    });
    P.desc.addEventListener("click", () => { const g = getG(); if (g && amAdmin(g)) openEdit(g); });
    return P;
  }

  function dateLabel(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return ""; }
  }

  function paint() {
    const g = getG();
    if (!g || !P) { closePage(); return; }
    const admin = amAdmin(g);
    const list = people(g);
    P.title.textContent = "Group info";
    avatarInto(P.avatar, g.avatar || "", g.name);
    P.name.textContent = g.name;
    P.sub.textContent = "Group \u00B7 " + list.length + (list.length === 1 ? " member" : " members");
    if (g.desc) { P.desc.textContent = g.desc; P.desc.classList.remove("empty"); }
    else if (admin) { P.desc.textContent = "Add a group description"; P.desc.classList.add("empty"); }
    else { P.desc.textContent = ""; P.desc.classList.remove("empty"); }
    P.desc.hidden = !g.desc && !admin;
    const creator = list.find((p) => p.isCreator);
    const when = typeof g.id === "number" && g.id > 1e12 ? dateLabel(g.id) : "";
    P.made.textContent = "Created" + (creator ? " by " + (creator.isMe ? "you" : creator.name) : "") + (when ? " on " + when : "");
    P.editBtn.hidden = !admin;
    P.addBtn.hidden = !admin;
    $$(".kx-gp-tabs button", P.root).forEach((b) => b.classList.toggle("on", b.dataset.t === tab));

    P.body.textContent = "";
    if (tab === "members") bodyMembers(g, list, admin);
    else if (tab === "media") bodyMedia();
    else bodySettings(g, admin);
  }

  function actionRow(label, sub, icon, fn, danger) {
    const b = el("button", "kx-gp-act" + (danger ? " danger" : ""));
    b.type = "button";
    const ic = el("span", "kx-gp-act-ic");
    ic.innerHTML = icon;
    const col = el("span", "kx-gp-act-col");
    col.appendChild(el("b", null, label));
    if (sub) col.appendChild(el("small", null, sub));
    b.append(ic, col);
    b.addEventListener("click", fn);
    return b;
  }

  function bodyMembers(g, list, admin) {
    const bar = el("div", "kx-gp-bar");
    bar.appendChild(el("span", null, list.length + (list.length === 1 ? " member" : " members")));
    const s = el("input", "kx-gp-search");
    s.type = "search"; s.placeholder = "Search members"; s.autocomplete = "off"; s.value = query;
    bar.appendChild(s);
    P.body.appendChild(bar);
    if (admin) P.body.appendChild(actionRow("Add members", "", svg(ICON.add), () => openAdd(g)));
    const host = el("div", "kx-gp-list");
    P.body.appendChild(host);
    const draw = () => {
      host.textContent = "";
      const q = query.trim().toLowerCase();
      const shown = list.filter((p) => !q || p.name.toLowerCase().includes(q));
      shown.forEach((p) => host.appendChild(memberRow(g, p, admin)));
      if (!shown.length) host.appendChild(el("p", "kx-gp-empty", "No one matches \u201C" + query.trim() + "\u201D."));
    };
    s.addEventListener("input", () => { query = s.value; draw(); });
    draw();
  }

  function memberRow(g, p, admin) {
    const r = el("div", "kx-gp-row");
    r.setAttribute("role", "button");
    r.tabIndex = 0;
    const av = el("div", "kx-gp-mav");
    avatarInto(av, p.avatar, p.name);
    const col = el("div", "kx-gp-mcol");
    col.appendChild(el("b", null, p.name));
    r.append(av, col);
    if (p.isAdmin) r.appendChild(el("span", "kx-gp-pill", p.isCreator ? "Group creator" : "Group admin"));
    if (!p.isMe) {
      const open = () => memberSheet(g, p, admin);
      r.addEventListener("click", open);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    }
    return r;
  }

  function memberSheet(g, p, admin) {
    const items = [{ label: "Message " + p.name, fn: () => { closePage(); openThread({ id: p.id, name: p.name, avatar: p.avatar }); } }];
    if (admin && !p.isCreator) {
      items.push({
        label: p.isAdmin ? "Dismiss as admin" : "Make group admin",
        fn: () => {
          const set = adminSet(g);
          if (p.isAdmin) set.delete(p.id); else set.add(p.id);
          g.admins = [...set];
          putG(g); paint(); say(p.isAdmin ? p.name + " is no longer an admin" : p.name + " is now an admin");
        }
      });
      items.push({
        label: "Remove from group", danger: true,
        fn: () => {
          g.members = (g.members || []).filter((id) => String(id) !== p.id);
          g.admins = (g.admins || []).filter((id) => String(id) !== p.id);
          putG(g); paint(); syncHeader(g); try { renderChats(chats); } catch (_) {}
          say(p.name + " removed");
        }
      });
    }
    sheet(p.name, items);
  }

  function bodyMedia() {
    const nodes = $$("#messages img[src], #messages video[src]").filter((n) => !n.closest(".row-avatar, .peer-avatar")).slice(-60).reverse();
    if (nodes.length) {
      const grid = el("div", "kx-gp-grid");
      nodes.forEach((n) => {
        const cell = el("button", "kx-gp-cell");
        cell.type = "button";
        if (n.tagName === "VIDEO") {
          const v = el("video"); v.src = n.currentSrc || n.src; v.muted = true; v.preload = "metadata";
          cell.appendChild(v); cell.appendChild(el("i", "kx-gp-play", "\u25B6"));
        } else {
          const im = el("img"); im.src = n.currentSrc || n.src; im.alt = ""; im.loading = "lazy";
          cell.appendChild(im);
        }
        cell.addEventListener("click", () => { closePage(); setTimeout(() => n.click(), 160); });
        grid.appendChild(cell);
      });
      P.body.appendChild(grid);
    } else {
      P.body.appendChild(el("p", "kx-gp-empty", "Photos and videos shared in this group show up here."));
    }
    const all = $("#piMedia");
    if (all) P.body.appendChild(actionRow("Media, files and links", "See everything shared in this group", svg(ICON.image), () => all.click()));
  }

  function bodySettings(g, admin) {
    const timer = $("#kxTimerBtn"), wall = $("#piWall");
    if (timer) P.body.appendChild(actionRow("Disappearing messages", "Choose when new messages vanish", svg(ICON.timer), () => timer.click()));
    if (wall) P.body.appendChild(actionRow("Chat wallpaper", "Change the background of this group", svg(ICON.wall), () => wall.click()));
    if (admin) P.body.appendChild(actionRow("Edit group", "Name, photo and description", svg(ICON.edit), () => openEdit(g)));
    P.body.appendChild(actionRow("Exit group", "Removes this group from this device", svg(ICON.exit), () => confirmExit(g), true));
  }

  /* ---------- add / edit / exit ---------- */
  function openAdd(g) {
    const have = new Set((g.members || []).map(String));
    const cand = everyone().filter((p) => !have.has(p.id));
    const m = el("div", "kx-sh");
    const card = el("div", "kx-sh-card tall");
    card.appendChild(el("h3", null, "Add members"));
    const close = () => m.remove();
    if (!cand.length) {
      card.appendChild(el("p", "kx-sh-text", "Everyone you know is already in this group. Add a new contact to invite more people."));
      const nb = el("button", "kx-sh-btn", "Add a contact");
      nb.type = "button";
      nb.addEventListener("click", () => { close(); closePage(); openModal("contactModal"); });
      card.appendChild(nb);
    } else {
      const search = el("input", "kx-gp-search wide");
      search.type = "search"; search.placeholder = "Search people"; search.autocomplete = "off";
      card.appendChild(search);
      const list = el("div", "kx-sh-list");
      const rows = cand.map((p) => {
        const lab = el("label", "kx-gp-row pick");
        const cb = el("input"); cb.type = "checkbox"; cb.value = p.id; cb.hidden = true;
        const av = el("div", "kx-gp-mav"); avatarInto(av, p.avatar, p.name);
        const col = el("div", "kx-gp-mcol"); col.appendChild(el("b", null, p.name));
        const tick = el("span", "kx-gp-tick", "\u2713");
        lab.append(cb, av, col, tick);
        lab._n = p.name.toLowerCase();
        cb.addEventListener("change", () => { lab.classList.toggle("on", cb.checked); count(); });
        list.appendChild(lab);
        return lab;
      });
      card.appendChild(list);
      const go = el("button", "kx-sh-btn primary", "Add");
      go.type = "button"; go.disabled = true;
      const count = () => {
        const n = $$("input:checked", list).length;
        go.disabled = !n;
        go.textContent = n ? "Add " + n + (n === 1 ? " person" : " people") : "Add";
      };
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        rows.forEach((r) => { r.hidden = !!q && !r._n.includes(q); });
      });
      go.addEventListener("click", () => {
        const ids = $$("input:checked", list).map((i) => i.value);
        if (!ids.length) return;
        g.members = [...new Set([...(g.members || []).map(String), ...ids])];
        putG(g); close(); paint(); syncHeader(g); try { renderChats(chats); } catch (_) {}
        say(ids.length === 1 ? "1 person added" : ids.length + " people added");
      });
      card.appendChild(go);
    }
    const c = el("button", "kx-sh-btn ghost", "Cancel");
    c.type = "button"; c.addEventListener("click", close);
    card.appendChild(c);
    m.appendChild(card);
    m.addEventListener("click", (e) => { if (e.target === m) close(); });
    document.body.appendChild(m);
  }

  function openEdit(g) {
    if (!amAdmin(g)) return;
    let photo = g.avatar || "";
    const m = el("div", "kx-sh");
    const card = el("div", "kx-sh-card");
    card.appendChild(el("h3", null, "Edit group"));
    const pv = el("div", "kx-gp-avatar small");
    avatarInto(pv, photo, g.name);
    const pb = el("button", "kx-sh-btn", "Change group photo");
    pb.type = "button";
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
    pb.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0]; if (!f) return;
      photo = await squarePhoto(f);
      avatarInto(pv, photo, g.name);
    });
    const name = el("input", "kx-gp-input"); name.maxLength = 40; name.value = g.name; name.placeholder = "Group name";
    const desc = el("textarea", "kx-gp-input"); desc.maxLength = 200; desc.rows = 3; desc.value = g.desc || ""; desc.placeholder = "Group description";
    const save1 = el("button", "kx-sh-btn primary", "Save");
    save1.type = "button";
    const close = () => m.remove();
    save1.addEventListener("click", () => {
      const n = name.value.trim();
      if (!n) { say("Give the group a name."); return; }
      g.name = n; g.desc = desc.value.trim(); g.avatar = photo;
      try { putG(g); } catch (_) { say("Not enough storage for that photo."); return; }
      close(); paint(); syncHeader(g); try { renderChats(chats); } catch (_) {}
      say("Group updated");
    });
    const c = el("button", "kx-sh-btn ghost", "Cancel");
    c.type = "button"; c.addEventListener("click", close);
    card.append(pv, pb, file, name, desc, save1, c);
    m.appendChild(card);
    m.addEventListener("click", (e) => { if (e.target === m) close(); });
    document.body.appendChild(m);
  }

  function confirmExit(g) {
    sheet("Exit \u201C" + g.name + "\u201D?", [{
      label: "Exit group", danger: true,
      fn: () => {
        save(LS.groups, load(LS.groups, []).filter((x) => String(x.id) !== String(g.id)));
        closePage();
        const back = $("#backChat");
        if (back) back.click();
        try { renderChats(chats); } catch (_) {}
        say("You left " + g.name);
      }
    }], "Groups live on this device, so this removes the group and its members list from here.");
  }

  /* ---------- keep the chat header in step ---------- */
  function syncHeader(g) {
    const pn = $("#peerName");
    if (pn && pn.textContent !== g.name) pn.textContent = g.name;
    if (typeof currentPeer !== "undefined" && currentPeer) currentPeer.name = g.name;
    const pa = $("#peerAvatar");
    if (pa && g.avatar) avatarInto(pa, g.avatar, g.name);
    const meta = $("#peerMeta");
    if (meta) { const n = (g.members || []).length + 1; meta.textContent = n + (n === 1 ? " member" : " members") + " \u00B7 tap for info"; }
  }
  const pn0 = $("#peerName");
  if (pn0) new MutationObserver(() => setTimeout(() => { const g = getG(); if (g && g.avatar) { const pa = $("#peerAvatar"); if (pa) avatarInto(pa, g.avatar, g.name); } }, 80)).observe(pn0, { childList: true, characterData: true, subtree: true });

  /* ---------- open / close ---------- */
  function openPage() {
    const g = getG();
    if (!g) return;
    build();
    tab = "members"; query = "";
    P.root.hidden = false;
    document.body.classList.add("kx-gp-open");
    P.scroll.scrollTop = 0;
    paint();
  }
  function closePage() {
    if (!P) return;
    P.root.hidden = true;
    document.body.classList.remove("kx-gp-open");
  }

  // Capture on the header so this runs before the old info sheet from groups-fix.js
  const head = $(".thread-head");
  if (head) head.addEventListener("click", (e) => {
    if (!isGroupId(curId())) return;
    if (!e.target.closest(".grow, #peerAvatar")) return;
    e.stopPropagation();
    e.preventDefault();
    openPage();
  }, true);
})();
