/* Kyro chat extras: drafts, multi-select forward, stickers. Additive; uses app.js globals. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const notify = (t) => (typeof toast === "function" ? toast(t) : null);
  const peerId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");

  /* ================= Drafts ================= */
  const DK = "kyro.drafts";
  const input = $("#messageInput");
  const isEditing = () => typeof editing !== "undefined" && !!editing;
  let saveT;
  function setDraft(id, text) {
    const all = store.get(DK, {});
    if (text.trim()) all[id] = text; else delete all[id];
    store.set(DK, all);
  }
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(saveT);
      const id = peerId(), v = input.value;
      if (!id || isEditing()) return;
      saveT = setTimeout(() => setDraft(id, v), 150);
    });
    $("#composer").addEventListener("submit", () => {
      const id = peerId(), wasEditing = isEditing();
      setTimeout(() => { if (id && !wasEditing && !input.value.trim()) { setDraft(id, ""); paintDrafts(); } }, 60);
    });
  }
  const thread = $("#threadScreen");
  if (thread) {
    new MutationObserver(() => {
      if (thread.hidden) { closePicker(); return; }
      setTimeout(() => {
        const id = peerId();
        if (!id || !input || input.value || isEditing()) return;
        const d = store.get(DK, {})[id];
        if (d) { input.value = d; input.setSelectionRange(d.length, d.length); }
      }, 0);
    }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  }
  function paintDrafts() {
    const all = store.get(DK, {});
    document.querySelectorAll("#chatList .row[data-peer]").forEach((row) => {
      const d = all[row.dataset.peer];
      const span = row.querySelector(".grow > span");
      if (!span || !d || span.querySelector(".kx-draft-tag")) return;
      span.textContent = "";
      const tag = document.createElement("em");
      tag.className = "kx-draft-tag"; tag.textContent = "Draft:";
      span.append(tag, document.createTextNode(d.replace(/\s+/g, " ").slice(0, 80)));
    });
  }
  const list = $("#chatList");
  if (list) new MutationObserver(paintDrafts).observe(list, { childList: true, subtree: true, characterData: true });
  paintDrafts();

  /* ================= Group files (videos, documents) ================= */
  // Groups send one copy per member, so the size limit shrinks as the group grows.
  const MAX_FILE = 10 * 1024 * 1024, UPLOAD_BUDGET = 30 * 1024 * 1024;
  const isGroupId = (id) => String(id).startsWith("group:");
  function membersOf(p) {
    const raw = p.members || (load(LS.groups, []).find((g) => "group:" + g.id === String(p.id)) || {}).members || [];
    return raw.map(String).filter((id) => id && id !== String(meId) && !isGroupId(id));
  }
  const limitFor = (p) => Math.min(MAX_FILE, Math.floor(UPLOAD_BUDGET / Math.max(1, membersOf(p).length)));

  document.addEventListener("change", async (e) => {
    if (e.target.id !== "imageInput" || !peerId() || !isGroupId(peerId())) return;
    const file = e.target.files && e.target.files[0];
    if (!file || (file.type || "").startsWith("image/")) return; // photos already work in groups
    e.stopImmediatePropagation();
    e.target.value = "";
    const n = membersOf(currentPeer).length;
    if (!n) { notify("This group has no other members yet."); return; }
    const limit = limitFor(currentPeer);
    if (file.size > limit) {
      notify("That file is " + fmtSize(file.size) + ". In a group of " + (n + 1) + " the limit is " + fmtSize(limit) + ", because it is sent to each member.");
      return;
    }
    let media;
    try { media = await readAsDataUrl(file); } catch (_) { notify("Couldn't read that file."); return; }
    const kind = (file.type || "").startsWith("video/") ? "video" : "file";
    const fileName = file.name || (kind === "video" ? "video" : "file");
    const meta = { kind, media, fileName, fileSize: file.size, text: (kind === "video" ? "\ud83c\udfa5 " : "\ud83d\udcc4 ") + fileName };
    const box = $("#messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, ...meta });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    notify("Sending to " + n + (n === 1 ? " member" : " members") + "...");
    try { await sendChat(meta, bubble); }
    catch (_) { bubble.style.opacity = "0.6"; notify("Couldn't send to everyone. Try again."); }
  }, true);

  /* ================= Multi-select forward ================= */
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#actForward")) return;
    e.stopImmediatePropagation();
    openForward();
  }, true);

  function forwardTargets() {
    const out = [], seen = new Set();
    const add = (p) => { if (p && p.id && !seen.has(String(p.id))) { seen.add(String(p.id)); out.push(p); } };
    try { chats.map(peerFrom).forEach(add); } catch (_) {}
    try { load(LS.contacts, []).forEach(add); } catch (_) {}
    try {
      load(LS.groups, []).forEach((g) => add({ id: "group:" + g.id, name: g.name, members: g.members, avatar: g.avatar }));
    } catch (_) {}
    return out;
  }

  function openForward() {
    closeModal("msgActions");
    const src = actionMsg;
    if (!src) return;
    if (src.bubble && src.bubble.classList.contains("kx-vo")) { notify("View once messages can't be forwarded."); return; }
    const sheet = $("#forwardModal .sheet");
    const oldList = $("#forwardList");
    oldList.hidden = true;
    sheet.querySelectorAll(".kx-fwd-search, .kx-fwd-list, .kx-fwd-send").forEach((n) => n.remove());

    const search = document.createElement("input");
    search.type = "search"; search.className = "kx-fwd-search"; search.placeholder = "Search chats"; search.autocomplete = "off";
    const box = document.createElement("div"); box.className = "kx-fwd-list";
    const send = document.createElement("button");
    send.type = "button"; send.className = "kx-fwd-send"; send.disabled = true; send.textContent = "Select chats";
    sheet.append(search, box, send);

    const people = forwardTargets();
    const picked = new Map();
    const rows = people.map((p) => {
      const row = document.createElement("button");
      row.type = "button"; row.className = "row kx-fwd-row";
      row.innerHTML = '<div class="row-avatar"></div><b></b><span class="kx-tick">\u2713</span>';
      row.querySelector("b").textContent = p.name || "Chat";
      try { setAvatar(row.querySelector(".row-avatar"), p.avatar, p.name); } catch (_) {}
      row.addEventListener("click", () => {
        if (picked.has(p.id)) picked.delete(p.id); else picked.set(p.id, p);
        row.classList.toggle("on", picked.has(p.id));
        send.disabled = picked.size === 0;
        send.textContent = picked.size ? "Send to " + picked.size + (picked.size === 1 ? " chat" : " chats") : "Select chats";
      });
      row._name = String(p.name || "").toLowerCase();
      box.appendChild(row);
      return row;
    });
    if (!people.length) box.innerHTML = '<p class="kx-fwd-empty">No chats yet. Start a conversation first.</p>';
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      rows.forEach((r) => { r.hidden = !!q && !r._name.includes(q); });
    });

    send.addEventListener("click", async () => {
      const targets = [...picked.values()];
      if (!targets.length) return;
      send.disabled = true; send.textContent = "Sending...";
      const fm = src.m, heavy = fm.kind === "video" || fm.kind === "file";
      let media = fm.media || "";
      if (heavy) {
        media = await getBubbleMedia(src.bubble, fm);
        if (!media) { notify("Couldn't load that file to forward it."); send.disabled = false; send.textContent = "Try again"; return; }
      }
      const prev = currentPeer;
      let sent = 0, skipped = 0, last = null;
      for (const p of targets) {
        if (heavy && isGroupId(p.id) && (!membersOf(p).length || media.length * 0.75 > limitFor(p))) { skipped++; continue; }
        currentPeer = p;
        try {
          await sendChat({
            text: heavy ? fm.text || kindLabel(fm, src.bubble) : (src.bubble._plain || fm.text),
            kind: fm.kind || "text", media, fileName: fm.fileName || "", fileSize: fm.fileSize || 0
          });
          sent++; last = p;
        } catch (_) { skipped++; }
      }
      closeModal("forwardModal");
      if (targets.length === 1 && last) { openThread(last); }
      else { currentPeer = prev; }
      notify(sent ? "Forwarded to " + sent + (sent === 1 ? " chat" : " chats") + (skipped ? ". " + skipped + " skipped." : "") : "Nothing was forwarded.");
    });
    openModal("forwardModal");
    setTimeout(() => search.focus(), 80);
  }

  /* ================= Stickers ================= */
  const SIZE = 240; // sticker images are exactly this size; that is how bubbles recognise them
  const PACKS = {
    reactions: [["😂", "lol"], ["😭", "crying"], ["🔥", "fire"], ["💀", "dead"], ["🥹", "aww"], ["😎", "cool"], ["🫡", "yes sir"], ["🤝", "deal"], ["💯", "facts"], ["🙏", "please"], ["😴", "sleepy"], ["🤡", "clown"]],
    vibes: [["🎉", "party"], ["❤️", "love"], ["🚀", "let's go"], ["👀", "seen"], ["🤌", "chef's kiss"], ["😤", "mad"], ["🥳", "happy bday"], ["☕", "coffee"], ["🍕", "pizza"], ["🫶", "thanks"], ["🌙", "good night"], ["☀️", "morning"]]
  };
  const RK = "kyro.stickers.recent";
  const cache = new Map();

  async function makeSticker(emoji, label) {
    const key = emoji + "|" + label;
    if (cache.has(key)) return cache.get(key);
    try { await document.fonts.load("800 34px Outfit"); } catch (_) {}
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const x = c.getContext("2d");
    x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "112px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    x.shadowColor = "#fff"; x.shadowBlur = 0;
    for (let a = 0; a < 16; a++) {
      x.shadowOffsetX = Math.cos((a / 16) * Math.PI * 2) * 7;
      x.shadowOffsetY = Math.sin((a / 16) * Math.PI * 2) * 7;
      x.fillText(emoji, SIZE / 2, 98);
    }
    x.shadowColor = "transparent";
    x.font = "800 34px Outfit, system-ui, sans-serif";
    x.lineJoin = "round"; x.lineWidth = 10; x.strokeStyle = "#fff";
    x.strokeText(label, SIZE / 2, 200, SIZE - 20);
    x.fillStyle = "#1b1840";
    x.fillText(label, SIZE / 2, 200, SIZE - 20);
    const url = c.toDataURL("image/png");
    cache.set(key, url);
    return url;
  }

  let panel, grid, tabs, openTab = "reactions";
  function buildPicker() {
    if (panel || !thread) return;
    panel = document.createElement("div");
    panel.className = "kx-pick"; panel.hidden = true;
    panel.innerHTML = '<div class="kx-pick-tabs"><button type="button" data-p="recent">Recent</button><button type="button" data-p="reactions">Reactions</button><button type="button" data-p="vibes">Vibes</button></div><div class="kx-pick-grid"></div>';
    grid = $(".kx-pick-grid", panel); tabs = panel.querySelector(".kx-pick-tabs");
    tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showPack(b.dataset.p); });
    $("#composer").before(panel);
    document.dispatchEvent(new CustomEvent("kx-picker-built", { detail: panel }));
  }
  async function showPack(name) {
    openTab = name;
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === name));
    grid.classList.remove("kx-pick-list");
    const hook = window.kxPickHooks && window.kxPickHooks[name];
    if (hook) { grid.innerHTML = ""; grid.classList.add("kx-pick-list"); hook(grid, closePicker); return; }
    const items = name === "recent" ? store.get(RK, []) : PACKS[name];
    grid.innerHTML = "";
    if (!items.length) { grid.innerHTML = '<p class="kx-pick-empty">Stickers you send show up here.</p>'; return; }
    for (const [emoji, label] of items) {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", "Send sticker: " + label);
      const img = document.createElement("img"); img.alt = label;
      b.appendChild(img); grid.appendChild(b);
      b.addEventListener("click", () => sendSticker(emoji, label));
      makeSticker(emoji, label).then((u) => { img.src = u; });
    }
  }
  function closePicker() { if (panel) panel.hidden = true; }
  function togglePicker() {
    buildPicker();
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) showPack(store.get(RK, []).length ? "recent" : openTab === "recent" ? "reactions" : openTab);
  }
  async function sendSticker(emoji, label) {
    if (!peerId()) return;
    const blocked = $("#blockedBar");
    if (blocked && !blocked.hidden) { notify("Unblock this contact to send stickers."); return; }
    const media = await makeSticker(emoji, label);
    const rec = store.get(RK, []).filter((r) => r[0] !== emoji || r[1] !== label);
    rec.unshift([emoji, label]); store.set(RK, rec.slice(0, 12));
    const box = $("#messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "image", media, text: "sticker" });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    closePicker();
    try { await sendChat({ kind: "image", media, text: "sticker" }, bubble); }
    catch (_) { bubble.style.opacity = "0.6"; }
  }

  const attach = $("#attachBtn");
  if (attach) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "icon-round"; btn.id = "kxStickerBtn"; btn.setAttribute("aria-label", "Stickers");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-3.5 7a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 8.5 9zm7 0a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 15.5 9zM12 18a6 6 0 0 1-5.2-3h10.4A6 6 0 0 1 12 18z"/></svg>';
    btn.addEventListener("click", togglePicker);
    attach.after(btn);
  }

  /* Mark sticker-sized images so their bubble drops the chrome (works for received ones too) */
  function markSticker(img) {
    const check = () => {
      if (img.naturalWidth === SIZE && img.naturalHeight === SIZE) img.closest(".bubble") && img.closest(".bubble").classList.add("kx-sticker");
    };
    if (img.complete && img.naturalWidth) check(); else img.addEventListener("load", check, { once: true });
  }
  const msgs = $("#messages");
  if (msgs) {
    const scan = (n) => { if (n instanceof HTMLElement && n.classList.contains("bubble")) { const i = n.querySelector(":scope > img"); if (i) markSticker(i); } };
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(msgs, { childList: true });
  }
})();
