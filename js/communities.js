/* Communities + Channels (one tab, switch at the top).
   Community: members see each other, admins post announcements.
   Channel:   broadcast. Followers read and react, admins post, followers stay hidden.
   Roles: owner > admin > member. Join by invite code/link, or find public ones in Discover. */
(() => {
  const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "" };
  const RANK = { member: 1, admin: 2, owner: 3 };
  const EMOJIS = ["👍", "❤️", "🔥", "😂", "😮"];
  const KIND_KEY = "kyro.cm.kind";
  const T = {
    community: { noun: "community", plural: "Communities", people: "members", posts: "Announcements", join: "Join", leave: "Leave",
      compose: "Post an announcement to members", pubHint: "Public: anyone can find it and join",
      empty: "Communities group people together. Admins send announcements to everyone. Create one, or tap Discover." },
    channel: { noun: "channel", plural: "Channels", people: "followers", posts: "Posts", join: "Follow", leave: "Unfollow",
      compose: "Write a post for your followers", pubHint: "Public: anyone can find and follow it",
      empty: "Channels broadcast posts to followers. Create your own, or tap Discover to find some." }
  };

  let kind = localStorage.getItem(KIND_KEY) === "channel" ? "channel" : "community";
  let state = { role: null, community: null };

  const can = (role, min) => !!role && RANK[role] >= RANK[min];
  const initial = (s) => (String(s || "C").trim()[0] || "C").toUpperCase();
  const who = (u) => (u.username ? "@" + u.username : [u.firstName, u.lastName].filter(Boolean).join(" ") || "Member");
  const myId = () => { const m = Kyro.getUser() || {}; return String(m.id || m._id || ""); };
  const kindOf = (c) => (c && c.type === "channel" ? "channel" : "community");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const timeLabel = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "just now" : d.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  };
  const say = (msg) => { if (typeof toast === "function") toast(msg); else alert(msg); };

  function friendly(res) {
    if (res._status === 404 && /Cannot (GET|POST|PATCH|DELETE)/i.test(res.message || "")) {
      return "The server needs the latest update before Communities and Channels work. Redeploy your backend, then try again.";
    }
    return res.message || "Something went wrong";
  }
  async function call(path, opts) {
    const res = await Kyro.request(path, opts);
    if (!res._ok) { say(friendly(res)); return null; }
    return res;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove(); return ok;
    }
  }
  const inviteLink = (code) => new URL("app.html?join=" + encodeURIComponent(code), location.href).href;

  function overlay() {
    const o = el("div", "community-overlay");
    o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }

  /* ---------- tab chrome: switch + tools ---------- */
  function chrome() {
    const sec = document.querySelector('.tab-page[data-tab="communities"]');
    const add = document.getElementById("addCommunityBtn");
    if (!sec || !add) return;
    if (!sec.dataset.cm) {
      sec.dataset.cm = "1";
      const seg = el("div", "cm-seg");
      ["community", "channel"].forEach((k) => {
        const b = el("button", "cm-seg-btn", T[k].plural);
        b.type = "button"; b.dataset.kind = k;
        b.onclick = () => setKind(k);
        seg.appendChild(b);
      });
      sec.insertBefore(seg, sec.firstChild);
      const tools = el("div", "cm-tools");
      const join = el("button", "cm-tool", "Join with code"); join.type = "button"; join.onclick = openJoin;
      const find = el("button", "cm-tool", "Discover"); find.type = "button"; find.onclick = openDiscover;
      tools.append(join, find);
      add.insertAdjacentElement("afterend", tools);
    }
    sec.querySelectorAll(".cm-seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
    add.textContent = "+ New " + T[kind].noun;
  }
  function setKind(k) {
    if (k === kind) return;
    kind = k; localStorage.setItem(KIND_KEY, k);
    render();
  }

  /* ---------- list ---------- */
  async function render() {
    const box = document.getElementById("communityList");
    if (!box) return;
    chrome();
    const mine = kind;
    box.innerHTML = "";
    box.appendChild(el("p", "community-hint", "Loading…"));
    const res = await Kyro.request("/api/communities?type=" + mine);
    if (mine !== kind) return;
    box.innerHTML = "";
    if (!res._ok) { box.appendChild(el("p", "community-hint", friendly(res))); return; }
    const list = res.communities || [];
    if (!list.length) {
      const empty = el("div", "empty-box");
      empty.appendChild(el("p", "", T[mine].empty));
      box.appendChild(empty);
      return;
    }
    list.forEach((c) => {
      const row = el("div", "row community-row");
      const body = el("div", "");
      const title = el("b", "", c.name);
      if (c.myRole === "owner" || c.myRole === "admin") title.appendChild(el("span", "community-badge", ROLE_LABEL[c.myRole]));
      body.appendChild(title);
      body.appendChild(el("span", "", c.latestAnnouncement || c.description || "No posts yet"));
      const av = el("div", "row-avatar" + (mine === "channel" ? " cm-ch" : ""), initial(c.name));
      row.append(av, body, el("div", "community-meta", c.memberCount + " " + T[mine].people));
      row.addEventListener("click", () => openDetail(c.id));
      box.appendChild(row);
    });
  }

  /* ---------- create ---------- */
  function openCreate() {
    const k = kind;
    const o = overlay();
    const card = el("div", "community-sheet");
    card.appendChild(el("h3", "", "New " + T[k].noun));
    const name = el("input", "community-input"); name.placeholder = T[k].noun[0].toUpperCase() + T[k].noun.slice(1) + " name"; name.maxLength = 60;
    const desc = el("textarea", "community-input"); desc.placeholder = "What is it about? (optional)"; desc.rows = 3; desc.maxLength = 300;
    const pubRow = el("label", "cm-switch");
    const pub = el("input"); pub.type = "checkbox"; pub.checked = k === "channel";
    pubRow.append(pub, el("span", "", T[k].pubHint));
    const actions = el("div", "community-actions");
    const cancel = el("button", "community-btn ghost", "Cancel");
    const create = el("button", "community-btn", "Create");
    cancel.onclick = () => o.remove();
    create.onclick = async () => {
      if (!name.value.trim()) { name.focus(); return; }
      create.disabled = true;
      const res = await call("/api/communities", { method: "POST", body: { name: name.value.trim(), description: desc.value.trim(), type: k, isPublic: pub.checked } });
      if (!res) { create.disabled = false; return; }
      o.remove(); await render(); openDetail(res.community.id);
    };
    actions.append(cancel, create);
    card.append(name, desc, pubRow, actions);
    o.appendChild(card);
    setTimeout(() => name.focus(), 50);
  }

  /* ---------- join with code ---------- */
  function openJoin() {
    const o = overlay();
    const card = el("div", "community-sheet");
    card.appendChild(el("h3", "", "Join with a code"));
    card.appendChild(el("p", "community-hint", "Ask an admin for the invite code or link."));
    const code = el("input", "community-input cm-code-in"); code.placeholder = "INVITE CODE"; code.maxLength = 24; code.autocapitalize = "characters";
    const actions = el("div", "community-actions");
    const cancel = el("button", "community-btn ghost", "Cancel");
    const go = el("button", "community-btn", "Join");
    cancel.onclick = () => o.remove();
    go.onclick = async () => {
      if (!code.value.trim()) { code.focus(); return; }
      go.disabled = true;
      const res = await call("/api/communities/join", { method: "POST", body: { code: code.value.trim() } });
      go.disabled = false;
      if (!res) return;
      o.remove(); await afterJoin(res.community);
    };
    actions.append(cancel, go);
    card.append(code, actions);
    o.appendChild(card);
    setTimeout(() => code.focus(), 50);
  }
  async function afterJoin(c) {
    kind = kindOf(c); localStorage.setItem(KIND_KEY, kind);
    if (typeof showTab === "function") showTab("communities");
    await render();
    openDetail(c.id);
  }

  /* ---------- discover ---------- */
  function openDiscover() {
    const k = kind;
    const o = overlay();
    const panel = el("div", "community-panel");
    const head = el("div", "community-head");
    const back = el("button", "community-back", "←"); back.onclick = () => o.remove();
    const title = el("div", "community-title"); title.append(el("b", "", "Discover " + T[k].plural.toLowerCase()), el("span", "", "Public ones you can " + T[k].join.toLowerCase()));
    head.append(back, title);
    const body = el("div", "community-body");
    const search = el("input", "community-input"); search.placeholder = "Search by name"; search.type = "search";
    const results = el("div", "");
    body.append(search, results);
    panel.append(head, body);
    o.appendChild(panel);

    let seq = 0, timer = null;
    const load = async () => {
      const mine = ++seq;
      results.innerHTML = ""; results.appendChild(el("p", "community-hint", "Searching…"));
      const q = search.value.trim();
      const res = await Kyro.request("/api/communities/discover?type=" + k + (q ? "&q=" + encodeURIComponent(q) : ""));
      if (mine !== seq) return;
      results.innerHTML = "";
      if (!res._ok) { results.appendChild(el("p", "community-hint", friendly(res))); return; }
      const list = res.communities || [];
      if (!list.length) { results.appendChild(el("p", "community-hint", q ? "Nothing matches “" + q + "”." : "Nothing public to join yet.")); return; }
      list.forEach((c) => {
        const row = el("div", "row community-row");
        const info = el("div", "");
        info.append(el("b", "", c.name), el("span", "", c.description || c.memberCount + " " + T[k].people));
        const btn = el("button", "community-btn cm-small", T[k].join);
        btn.onclick = async () => {
          btn.disabled = true;
          const r = await call("/api/communities/" + encodeURIComponent(c.id) + "/join", { method: "POST" });
          if (!r) { btn.disabled = false; return; }
          o.remove(); await afterJoin(r.community);
        };
        row.append(el("div", "row-avatar" + (k === "channel" ? " cm-ch" : ""), initial(c.name)), info, btn);
        results.appendChild(row);
      });
    };
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    load();
  }

  /* ---------- detail ---------- */
  async function openDetail(id) {
    const o = overlay();
    const panel = el("div", "community-panel");
    const head = el("div", "community-head");
    const back = el("button", "community-back", "←");
    back.onclick = () => { o.remove(); render(); };
    const title = el("div", "community-title");
    const titleName = el("b", "", "Loading…"), titleSub = el("span", "", "");
    title.append(titleName, titleSub);
    const leaveBtn = el("button", "community-link cm-leave", "");
    leaveBtn.hidden = true;
    head.append(back, title, leaveBtn);
    const tabs = el("div", "community-tabs");
    const body = el("div", "community-body");
    panel.append(head, tabs, body);
    o.appendChild(panel);

    const res = await call("/api/communities/" + encodeURIComponent(id));
    if (!res) { o.remove(); return; }
    state = { role: res.myRole, community: res.community };
    const c = res.community, k = kindOf(c), admin = can(state.role, "admin");

    const paintHead = () => {
      titleName.textContent = state.community.name;
      titleSub.textContent = state.community.memberCount + " " + T[k].people + (state.role && ROLE_LABEL[state.role] ? " · " + ROLE_LABEL[state.role] : "");
    };
    paintHead();
    if (state.role && state.role !== "owner") {
      leaveBtn.hidden = false; leaveBtn.textContent = T[k].leave;
      leaveBtn.onclick = async () => {
        if (!confirm(T[k].leave + " this " + T[k].noun + "?")) return;
        const r = await call("/api/communities/" + encodeURIComponent(id) + "/members/" + myId(), { method: "DELETE" });
        if (r) { o.remove(); render(); }
      };
    }

    const defs = [["posts", T[k].posts]];
    if (admin || k === "community") defs.push(["people", k === "channel" ? "Followers" : "Members"]);
    if (admin) defs.push(["settings", "Settings"]);
    const tabEls = {};
    const show = (key) => {
      Object.entries(tabEls).forEach(([kk, b]) => b.classList.toggle("active", kk === key));
      paintHead();
      if (key === "posts") renderPosts(id, body, k);
      if (key === "people") renderPeople(id, body, o, k, paintHead);
      if (key === "settings") renderSettings(id, body, o, k, paintHead);
    };
    defs.forEach(([key, label]) => { const b = el("button", "community-tab", label); b.onclick = () => show(key); tabEls[key] = b; tabs.appendChild(b); });
    if (defs.length === 1) tabs.hidden = true;
    show("posts");
  }

  function renderPosts(id, body, k) {
    const c = state.community;
    body.innerHTML = "";
    if (can(state.role, "admin")) {
      const composer = el("div", "community-composer");
      const input = el("textarea", "community-input"); input.rows = 2; input.maxLength = 1000; input.placeholder = T[k].compose;
      const post = el("button", "community-btn", "Post");
      post.onclick = async () => {
        const text = input.value.trim(); if (!text) return;
        post.disabled = true;
        const res = await call("/api/communities/" + encodeURIComponent(id) + "/announcements", { method: "POST", body: { text } });
        post.disabled = false;
        if (res) { state.community = res.community; renderPosts(id, body, k); }
      };
      composer.append(input, post);
      body.appendChild(composer);
    }
    if (!c.announcements.length) { body.appendChild(el("p", "community-hint", "No posts yet.")); return; }
    c.announcements.forEach((a) => {
      const bubble = el("div", "community-post");
      bubble.appendChild(el("div", "community-post-text", a.text));
      const rx = el("div", "cm-reacts");
      EMOJIS.forEach((e) => {
        const n = (a.reactions && a.reactions.counts && a.reactions.counts[e]) || 0;
        const b = el("button", "cm-react" + (a.reactions && a.reactions.mine === e ? " mine" : ""), e + (n ? " " + n : ""));
        b.type = "button";
        b.onclick = async () => {
          const res = await call("/api/communities/" + encodeURIComponent(id) + "/announcements/" + a.id + "/react", { method: "POST", body: { emoji: e } });
          if (res) { state.community = res.community; renderPosts(id, body, k); }
        };
        rx.appendChild(b);
      });
      bubble.appendChild(rx);
      const foot = el("div", "community-post-foot", (k === "community" && a.author ? who(a.author) + " · " : "") + timeLabel(a.createdAt));
      if (can(state.role, "admin")) {
        const del = el("button", "community-link", "Delete");
        del.onclick = async () => {
          if (!confirm("Delete this post?")) return;
          const res = await call("/api/communities/" + encodeURIComponent(id) + "/announcements/" + a.id, { method: "DELETE" });
          if (res) { state.community = res.community; renderPosts(id, body, k); }
        };
        foot.appendChild(del);
      }
      bubble.appendChild(foot);
      body.appendChild(bubble);
    });
  }

  async function refresh(id) {
    const r = await call("/api/communities/" + encodeURIComponent(id));
    if (r) state = { role: r.myRole, community: r.community };
    return !!r;
  }

  function renderPeople(id, body, o, k, paintHead) {
    const c = state.community;
    body.innerHTML = "";
    if (can(state.role, "admin")) {
      const addRow = el("div", "community-composer");
      const input = el("input", "community-input"); input.placeholder = "Add by username"; input.autocapitalize = "none";
      const add = el("button", "community-btn", "Add");
      add.onclick = async () => {
        const username = input.value.trim().replace(/^@/, ""); if (!username) return;
        add.disabled = true;
        const res = await call("/api/communities/" + encodeURIComponent(id) + "/members", { method: "POST", body: { username } });
        add.disabled = false;
        if (res) { input.value = ""; state.community = res.community; paintHead(); renderPeople(id, body, o, k, paintHead); }
      };
      addRow.append(input, add);
      body.appendChild(addRow);
    }
    const order = { owner: 0, admin: 1, member: 2 };
    [...c.members].sort((a, b) => order[a.role] - order[b.role]).forEach((m) => {
      const row = el("div", "row community-member");
      const info = el("div", "community-member-info");
      const name = el("b", "", who(m));
      if (m.role !== "member") name.appendChild(el("span", "community-badge", ROLE_LABEL[m.role]));
      info.appendChild(name);
      row.append(el("div", "row-avatar", initial(m.firstName || m.username)), info);
      const actions = memberActions(m, id, body, o, k, paintHead);
      if (actions) row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function memberActions(m, id, body, o, k, paintHead) {
    if (String(m.id) === myId() || m.role === "owner") return null;
    const wrap = el("div", "community-member-actions");
    const path = "/api/communities/" + encodeURIComponent(id) + "/members/" + m.id;
    const again = async () => { await refresh(id); paintHead(); renderPeople(id, body, o, k, paintHead); };
    const btn = (label, cls, fn) => { const b = el("button", "community-link " + (cls || ""), label); b.onclick = fn; wrap.appendChild(b); };
    if (state.role === "owner") {
      if (m.role === "member") btn("Make admin", "", async () => { if (await call(path, { method: "PATCH", body: { role: "admin" } })) again(); });
      if (m.role === "admin") btn("Demote", "", async () => { if (await call(path, { method: "PATCH", body: { role: "member" } })) again(); });
    }
    if (state.role === "owner" || (can(state.role, "admin") && m.role === "member")) {
      btn("Remove", "danger", async () => {
        if (!confirm("Remove " + who(m) + "?")) return;
        if (await call(path, { method: "DELETE" })) again();
      });
    }
    return wrap.childNodes.length ? wrap : null;
  }

  function renderSettings(id, body, o, k, paintHead) {
    const c = state.community;
    body.innerHTML = "";
    const nameIn = el("input", "community-input"); nameIn.value = c.name; nameIn.maxLength = 60;
    const descIn = el("textarea", "community-input"); descIn.value = c.description || ""; descIn.rows = 3; descIn.maxLength = 300;
    const pubRow = el("label", "cm-switch");
    const pub = el("input"); pub.type = "checkbox"; pub.checked = !!c.isPublic;
    pubRow.append(pub, el("span", "", T[k].pubHint));
    const save = el("button", "community-btn", "Save changes");
    save.onclick = async () => {
      const res = await call("/api/communities/" + encodeURIComponent(id), { method: "PATCH", body: { name: nameIn.value.trim(), description: descIn.value.trim(), isPublic: pub.checked } });
      if (res) { state.community = res.community; paintHead(); say("Saved"); }
    };
    body.append(el("p", "community-hint", "Name"), nameIn, el("p", "community-hint", "Description"), descIn, pubRow, save);

    // Invite
    body.appendChild(el("p", "community-hint cm-h", "Invite people"));
    const codeBox = el("div", "cm-code", c.inviteCode || "…");
    const row = el("div", "cm-invite-row");
    const copy = el("button", "community-btn ghost", "Copy code");
    copy.onclick = async () => say((await copyText(c.inviteCode)) ? "Code copied" : "Couldn't copy");
    const share = el("button", "community-btn", "Share link");
    share.onclick = async () => {
      const url = inviteLink(state.community.inviteCode);
      if (navigator.share) { try { await navigator.share({ title: state.community.name, text: "Join " + state.community.name + " on Kyro Chat", url }); return; } catch (_) { return; } }
      say((await copyText(url)) ? "Invite link copied" : "Couldn't copy");
    };
    const reset = el("button", "community-btn ghost", "New code");
    reset.onclick = async () => {
      if (!confirm("Make a new code? The old code and link stop working.")) return;
      const r = await call("/api/communities/" + encodeURIComponent(id) + "/invite/reset", { method: "POST" });
      if (r) { state.community.inviteCode = r.inviteCode; renderSettings(id, body, o, k, paintHead); }
    };
    row.append(copy, share, reset);
    body.append(codeBox, row);

    if (state.role === "owner") {
      const del = el("button", "community-btn danger", "Delete " + T[k].noun);
      del.onclick = async () => {
        if (!confirm("Delete this " + T[k].noun + " for everyone? This can't be undone.")) return;
        if (await call("/api/communities/" + encodeURIComponent(id), { method: "DELETE" })) { o.remove(); render(); }
      };
      body.appendChild(del);
    } else {
      body.appendChild(el("p", "community-hint", "Only the owner can delete this " + T[k].noun + "."));
    }
  }

  /* ---------- one-time moves and deep links ---------- */
  // Old versions kept communities only on this device. Move them to the server once.
  async function migrateLocal() {
    let old;
    try { old = JSON.parse(localStorage.getItem("kyro.communities") || "[]"); } catch { return; }
    if (!Array.isArray(old) || !old.length) return;
    const failed = [];
    for (const item of old.slice().reverse()) {
      const name = String((item && item.name) || "").trim();
      if (!name) continue;
      const r = await Kyro.request("/api/communities", { method: "POST", body: { name, type: "community", isPublic: false } });
      if (!r._ok) failed.push(item);
    }
    localStorage.setItem("kyro.communities", JSON.stringify(failed));
    render();
  }

  // Opening app.html?join=CODE joins straight away
  async function handleInviteLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get("join");
    if (!code || !Kyro.isLoggedIn()) return;
    params.delete("join");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    const res = await call("/api/communities/join", { method: "POST", body: { code } });
    if (res) afterJoin(res.community);
  }

  /* ---------- wiring ---------- */
  function bind() {
    const btn = document.getElementById("addCommunityBtn");
    if (btn) btn.addEventListener("click", openCreate);
    chrome();
    render().then(migrateLocal).then(handleInviteLink);
  }

  window.KyroCommunities = { render, open: openDetail };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
