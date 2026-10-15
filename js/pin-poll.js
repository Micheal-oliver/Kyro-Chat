/* Kyro pins and polls. Needs the updated backend (/api/polls and /api/chats/pins). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const notify = (t) => (typeof toast === "function" ? toast(t) : null);
  const api = (path, opts) => Kyro.request(path, opts);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const curId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");
  const isGroupId = (id) => String(id).startsWith("group:");
  const POLL_RX = /^poll:([a-f0-9]{24})$/i;

  /* ---------- Tag every bubble with its message data; turn poll messages into cards ---------- */
  const origMake = window.makeBubble;
  window.makeBubble = function (m) {
    const b = origMake.call(this, m);
    try {
      b._kxM = m || {};
      if (m && m._id) b._kxKey = String(m._id);
      else if (m && m.at) b._kxKey = "at:" + m.at;
      const hit = m && m.fileName && (!m.kind || m.kind === "text") && POLL_RX.exec(m.fileName);
      if (hit) decoratePoll(b, hit[1]);
    } catch (_) {}
    return b;
  };

  /* ================= Polls ================= */
  const polls = new Map(); // id -> { data, cards:Set }
  function entry(id) { if (!polls.has(id)) polls.set(id, { data: null, cards: new Set() }); return polls.get(id); }

  function decoratePoll(bubble, id) {
    bubble.classList.add("kx-poll-bubble");
    const textSpan = bubble.querySelector(":scope > span");
    if (textSpan) textSpan.hidden = true;
    const card = document.createElement("div");
    card.className = "kx-poll kx-poll-wait";
    card.innerHTML = '<span class="kx-tag">Poll</span><h4>Loading poll...</h4>';
    bubble.insertBefore(card, textSpan || bubble.firstChild);
    const e = entry(id);
    card._pid = id;
    e.cards.add(card);
    if (e.data) renderCard(card, e.data); else fetchPoll(id);
  }

  async function fetchPoll(id) {
    const r = await api("/api/polls/" + id);
    const e = entry(id);
    if (r && r._ok && r.poll) { e.data = r.poll; e.cards.forEach((c) => renderCard(c, r.poll)); }
    else e.cards.forEach((c) => { c.classList.remove("kx-poll-wait"); c.innerHTML = '<span class="kx-tag">Poll</span><h4>This poll is no longer available.</h4>'; });
  }

  function nameFor(id) {
    if (String(id) === String(meId)) return "You";
    try {
      const people = chats.map(peerFrom).concat(load(LS.contacts, []));
      const p = people.find((x) => String(x.id) === String(id) && x.name);
      if (p) return String(p.name);
    } catch (_) {}
    return "Member";
  }

  function renderCard(card, p) {
    card.classList.remove("kx-poll-wait");
    card.textContent = "";
    const tag = document.createElement("span");
    tag.className = "kx-tag"; tag.textContent = p.closed ? "Poll (closed)" : p.multi ? "Poll (choose any)" : "Poll";
    const q = document.createElement("h4");
    q.textContent = p.question;
    card.append(tag, q);
    const totalVotes = p.options.reduce((n, o) => n + o.count, 0);
    p.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "kx-opt" + (p.myPicks.includes(i) ? " on" : "");
      b.disabled = !!p.closed;
      const pct = totalVotes ? Math.round((o.count / totalVotes) * 100) : 0;
      b.style.setProperty("--p", pct + "%");
      const bar = document.createElement("i");
      const row = document.createElement("span");
      const label = document.createElement("span"); label.textContent = (p.myPicks.includes(i) ? "\u2713 " : "") + o.text;
      const cnt = document.createElement("b"); cnt.textContent = String(o.count);
      row.append(label, cnt);
      b.append(bar, row);
      if (o.voters.length) b.title = o.voters.map(nameFor).join(", ");
      b.addEventListener("click", (e) => { e.stopPropagation(); vote(p, i, card); });
      card.appendChild(b);
    });
    const foot = document.createElement("div");
    foot.className = "kx-poll-foot";
    const info = document.createElement("span");
    info.textContent = p.voted + " of " + p.eligible + " voted";
    foot.appendChild(info);
    if (!p.closed && String(p.creatorId) === String(meId)) {
      const c = document.createElement("button");
      c.type = "button"; c.textContent = "Close poll";
      c.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Close this poll? Nobody will be able to vote after this.")) return;
        const r = await api("/api/polls/" + p._id + "/close", { method: "POST", body: {} });
        if (r && r._ok && r.poll) { const en = entry(p._id); en.data = r.poll; en.cards.forEach((x) => renderCard(x, r.poll)); }
        else notify((r && r.message) || "Couldn't close the poll.");
      });
      foot.appendChild(c);
    }
    card.appendChild(foot);
  }

  async function vote(p, idx, card) {
    let picks = p.myPicks.slice();
    if (p.multi) picks = picks.includes(idx) ? picks.filter((n) => n !== idx) : picks.concat(idx);
    else picks = picks[0] === idx ? [] : [idx];
    card.classList.add("kx-poll-wait");
    const r = await api("/api/polls/" + p._id + "/vote", { method: "POST", body: { picks } });
    if (r && r._ok && r.poll) { const e = entry(p._id); e.data = r.poll; e.cards.forEach((c) => renderCard(c, r.poll)); }
    else { card.classList.remove("kx-poll-wait"); notify((r && r.message) || "Couldn't save your vote."); }
  }

  // Keep visible polls fresh: socket events when available, plus a slow refresh.
  setInterval(() => {
    if (document.hidden) return;
    polls.forEach((e, id) => {
      e.cards.forEach((c) => { if (!c.isConnected) e.cards.delete(c); });
      if (e.cards.size) fetchPoll(id);
    });
  }, 25000);

  /* ---------- Poll creation (groups) ---------- */
  function groupMemberIds() {
    const p = currentPeer || {};
    const raw = p.members || (load(LS.groups, []).find((g) => "group:" + g.id === String(p.id)) || {}).members || [];
    return raw.map(String).filter((id) => id && id !== String(meId) && !isGroupId(id));
  }

  let modal, qIn, optsBox, multiIn, sendBtn;
  function buildModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal is-off"; modal.id = "kxPollModal"; modal.hidden = true;
    modal.innerHTML = '<div class="sheet tall"><button class="sheet-x" type="button" aria-label="Close">\u00d7</button><h3>New poll</h3>' +
      '<input id="kxPollQ" maxlength="200" placeholder="Ask a question" autocomplete="off" />' +
      '<div class="kx-poll-opts"></div><button type="button" class="kx-poll-add">+ Add option</button>' +
      '<label class="kx-check"><input type="checkbox" id="kxPollMulti" /> Allow multiple answers</label>' +
      '<button type="button" class="kx-fwd-send" id="kxPollSend">Send poll</button></div>';
    document.body.appendChild(modal);
    qIn = $("#kxPollQ", modal); optsBox = $(".kx-poll-opts", modal); multiIn = $("#kxPollMulti", modal); sendBtn = $("#kxPollSend", modal);
    $(".sheet-x", modal).addEventListener("click", () => closeModal("kxPollModal"));
    $(".kx-poll-add", modal).addEventListener("click", () => addOpt());
    sendBtn.addEventListener("click", sendPoll);
  }
  function addOpt(v = "") {
    if (optsBox.children.length >= 6) { notify("A poll can have up to 6 options."); return; }
    const i = document.createElement("input");
    i.maxLength = 80; i.placeholder = "Option " + (optsBox.children.length + 1); i.value = v; i.autocomplete = "off";
    optsBox.appendChild(i);
  }
  function openPoll() {
    buildModal();
    if (!groupMemberIds().length) { notify("Add members to this group first."); return; }
    qIn.value = ""; multiIn.checked = false; optsBox.textContent = "";
    addOpt(); addOpt();
    sendBtn.disabled = false; sendBtn.textContent = "Send poll";
    openModal("kxPollModal");
    setTimeout(() => qIn.focus(), 80);
  }
  async function sendPoll() {
    const question = qIn.value.trim();
    const options = [...optsBox.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
    if (!question) { notify("Type a question first."); return; }
    if (new Set(options.map((o) => o.toLowerCase())).size < 2) { notify("Add at least 2 different options."); return; }
    sendBtn.disabled = true; sendBtn.textContent = "Sending...";
    const r = await api("/api/polls", { method: "POST", body: { question, options, multi: multiIn.checked, memberIds: groupMemberIds() } });
    if (!r || !r._ok || !r.poll) {
      sendBtn.disabled = false; sendBtn.textContent = "Send poll";
      notify((r && r.message) || "Couldn't create the poll. Is the backend updated?");
      return;
    }
    const id = r.poll._id, text = "\ud83d\udcca " + question, fileName = "poll:" + id;
    entry(id).data = r.poll;
    closeModal("kxPollModal");
    const box = $("#messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "text", text, fileName });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    try { await sendChat({ kind: "text", text, fileName }, bubble); }
    catch (_) { bubble.style.opacity = "0.6"; }
  }

  const attach = $("#attachBtn");
  let pollBtn;
  if (attach) {
    pollBtn = document.createElement("button");
    pollBtn.type = "button"; pollBtn.className = "icon-round"; pollBtn.id = "kxPollBtn"; pollBtn.hidden = true;
    pollBtn.setAttribute("aria-label", "Create poll");
    pollBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 9h3v10H5zm5.5-5h3v15h-3zM16 13h3v6h-3z"/></svg>';
    pollBtn.addEventListener("click", openPoll);
    (document.getElementById("kxStickerBtn") || attach).after(pollBtn);
  }

  /* ================= Pins ================= */
  const GK = "kyro.gpins";
  let pins = [];        // 1:1: [{id}]  group: [{key, preview}]
  let pinIdx = 0;
  const previewCache = new Map();
  let banner;

  function buildBanner() {
    if (banner) return;
    banner = document.createElement("div");
    banner.className = "kx-pin"; banner.hidden = true;
    banner.innerHTML = '<button type="button" class="kx-pin-main"><span class="kx-pin-bar"></span><span class="kx-pin-text"><small></small><span></span></span></button><button type="button" class="kx-pin-x" aria-label="Unpin">\u00d7</button>';
    const anchor = $("#typingLine") || $("#messages");
    anchor.before(banner);
    $(".kx-pin-main", banner).addEventListener("click", jumpToPin);
    $(".kx-pin-x", banner).addEventListener("click", unpinCurrent);
  }

  const bubbles = () => [...document.querySelectorAll("#messages .bubble")];
  function bubbleFor(p) {
    return bubbles().find((b) => (p.id && b.dataset.id === p.id) || (p.key && b._kxKey === p.key));
  }
  function previewOf(b) {
    let t = "";
    try { t = kindLabel(b._kxM || {}, b); } catch (_) {}
    return String(t || "Message").replace(/\s+/g, " ").slice(0, 90);
  }

  async function resolvePreview(p) {
    if (p.preview) return p.preview;
    const b = bubbleFor(p);
    if (b) { const t = previewOf(b); if (t && t !== "Message") return t; }
    if (!p.id) return "Pinned message";
    if (previewCache.has(p.id)) return previewCache.get(p.id);
    let out = "Pinned message";
    try {
      const r = await api("/api/messages/item/" + p.id);
      const m = r && r.message;
      if (m) {
        if (m.fileName && POLL_RX.test(m.fileName)) out = m.text || "Poll";
        else if (m.kind && m.kind !== "text") out = kindLabel(m, null);
        else out = await readText(m.text || m.content || "", currentPeer);
        out = String(out).replace(/\s+/g, " ").slice(0, 90) || "Pinned message";
      }
    } catch (_) {}
    previewCache.set(p.id, out);
    return out;
  }

  async function renderBanner() {
    buildBanner();
    if (!pins.length) { banner.hidden = true; return; }
    if (pinIdx >= pins.length) pinIdx = 0;
    const p = pins[pinIdx], at = curId();
    banner.hidden = false;
    $("small", banner).textContent = pins.length > 1 ? "Pinned message " + (pinIdx + 1) + " of " + pins.length : "Pinned message";
    const line = $(".kx-pin-text > span", banner);
    line.textContent = p.preview || previewCache.get(p.id) || "\u2026";
    const text = await resolvePreview(p);
    if (curId() === at && pins[pinIdx] === p) line.textContent = text;
  }

  function jumpToPin() {
    if (!pins.length) return;
    const p = pins[pinIdx], b = bubbleFor(p);
    if (b) {
      b.scrollIntoView({ block: "center", behavior: "smooth" });
      b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 1200);
    } else notify("That message is further up. Scroll up to find it.");
    pinIdx = (pinIdx + 1) % pins.length;
    renderBanner();
  }

  async function loadPins() {
    const at = curId();
    pinIdx = 0;
    if (!at) { pins = []; renderBanner(); return; }
    if (isGroupId(at)) { pins = (store.get(GK, {})[at] || []).slice().reverse(); renderBanner(); return; }
    const r = await api("/api/chats/pins/" + at);
    if (curId() !== at) return;
    pins = r && r._ok && Array.isArray(r.pins) ? r.pins.map((id) => ({ id })) : [];
    renderBanner();
  }

  const isPinned = (b) => pins.some((p) => (p.id && p.id === b.dataset.id) || (p.key && p.key === b._kxKey));

  async function togglePin(b) {
    const at = curId();
    if (!at || !b) return;
    if (isGroupId(at)) {
      const key = b._kxKey;
      if (!key) { notify("Can't pin this message."); return; }
      const all = store.get(GK, {});
      let list = all[at] || [];
      if (list.some((p) => p.key === key)) list = list.filter((p) => p.key !== key);
      else { list.push({ key, preview: previewOf(b) }); list = list.slice(-3); }
      all[at] = list; store.set(GK, all);
      pinIdx = 0; pins = list.slice().reverse(); renderBanner();
      notify("Pinned on this device only.");
      return;
    }
    const id = b.dataset.id;
    if (!id) { notify("Wait for the message to finish sending, then try again."); return; }
    const was = isPinned(b);
    const r = was
      ? await api("/api/chats/pins/" + at + "/" + id, { method: "DELETE" })
      : await api("/api/chats/pins/" + at, { method: "POST", body: { messageId: id } });
    if (!r || !r._ok) { notify((r && r.message) || "Couldn't update the pin."); return; }
    if (curId() !== at) return;
    previewCache.set(id, previewOf(b));
    pinIdx = 0; pins = (r.pins || []).map((x) => ({ id: x })); renderBanner();
  }

  function unpinCurrent() {
    const p = pins[pinIdx];
    if (!p) return;
    const b = bubbleFor(p);
    if (b) { togglePin(b); return; }
    const at = curId();
    if (isGroupId(at)) {
      const all = store.get(GK, {});
      all[at] = (all[at] || []).filter((x) => x.key !== p.key); store.set(GK, all);
      pins = all[at].slice().reverse(); pinIdx = 0; renderBanner();
    } else {
      api("/api/chats/pins/" + at + "/" + p.id, { method: "DELETE" }).then((r) => {
        if (r && r._ok && curId() === at) { pins = (r.pins || []).map((x) => ({ id: x })); pinIdx = 0; renderBanner(); }
      });
    }
  }

  // Pin / Unpin button in the long-press menu
  const fwd = $("#actForward");
  if (fwd) {
    const pb = document.createElement("button");
    pb.type = "button"; pb.className = "sheet-btn"; pb.id = "kxPinBtn"; pb.textContent = "Pin";
    fwd.after(pb);
    pb.addEventListener("click", () => {
      const b = actionMsg && actionMsg.bubble;
      closeModal("msgActions");
      togglePin(b);
    });
    const sheet = $("#msgActions");
    if (sheet) new MutationObserver(() => {
      if (sheet.hidden || !actionMsg) return;
      pb.textContent = isPinned(actionMsg.bubble) ? "Unpin" : "Pin";
    }).observe(sheet, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  /* ---------- Follow the open chat ---------- */
  let lastPeer = "";
  function onPeer() {
    const id = curId(), thread = $("#threadScreen");
    const open = id && thread && !thread.hidden;
    if (pollBtn) pollBtn.hidden = !(open && isGroupId(id));
    if (!open) { lastPeer = ""; return; }
    if (id !== lastPeer) { lastPeer = id; loadPins(); }
  }
  const thread = $("#threadScreen");
  if (thread) new MutationObserver(() => setTimeout(onPeer, 0)).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  const pn = $("#peerName");
  if (pn) new MutationObserver(() => setTimeout(onPeer, 0)).observe(pn, { childList: true, characterData: true, subtree: true });
  const msgs = $("#messages");
  let rbT;
  if (msgs) new MutationObserver(() => { clearTimeout(rbT); rbT = setTimeout(() => { if (pins.length) renderBanner(); }, 250); }).observe(msgs, { childList: true });

  /* ---------- Realtime ---------- */
  let hooked = null;
  setInterval(() => {
    const s = window.kyroSocket;
    if (!s || s === hooked || typeof s.on !== "function") return;
    hooked = s;
    s.on("poll-update", (d) => { if (d && d.id && polls.has(d.id)) fetchPoll(d.id); });
    s.on("pins-update", (d) => { if (d && String(d.peerId) === curId()) loadPins(); });
  }, 2000);
})();
