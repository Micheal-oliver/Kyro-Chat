/* Kyro message search: find any message across ALL your chats.
   Chats are end-to-end encrypted, so the server can't search them. This builds a private index on THIS device
   (IndexedDB, per account) from messages the app has already decrypted, and searches it locally.
   Nothing is sent anywhere. Disappearing messages are never indexed.
   Remove the <link> and <script> lines in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const ME = () => String(typeof meId !== "undefined" ? meId : "");
  const tell = (t) => { try { toast(t, "tip", 3000); } catch (_) {} };
  const MAX_ENTRIES = 30000;
  const PAGE = 40;

  /* ---------- pure helpers (also used by tests) ---------- */
  const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function terms(q) { return fold(q).split(/\s+/).filter(Boolean); }
  function matches(entry, ts) {
    if (!ts.length) return false;
    const f = entry.f || (entry.f = fold(entry.t));
    for (const t of ts) if (f.indexOf(t) === -1) return false;
    return true;
  }
  function snippet(text, ts, radius) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    const f = fold(text);
    let at = -1;
    for (const t of ts) { const i = f.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; }
    if (at === -1) at = 0;
    const start = Math.max(0, at - Math.floor(radius / 3));
    const end = Math.min(text.length, start + radius);
    return { text: (start > 0 ? "\u2026" : "") + text.slice(start, end) + (end < text.length ? "\u2026" : ""), offset: start, lead: start > 0 ? 1 : 0 };
  }
  /* returns [[str, isHit], ...] so the UI can build <mark> nodes without innerHTML */
  function highlightParts(text, ts) {
    const f = fold(text);
    if (f.length !== text.length) return [[text, false]]; /* folding changed length: skip highlighting, stay safe */
    const hit = new Array(text.length).fill(false);
    for (const t of ts) { let i = f.indexOf(t); while (i !== -1) { for (let k = i; k < i + t.length; k++) hit[k] = true; i = f.indexOf(t, i + t.length); } }
    const out = []; let cur = "", mode = hit[0] || false;
    for (let i = 0; i < text.length; i++) {
      if (hit[i] !== mode) { out.push([cur, mode]); cur = ""; mode = hit[i]; }
      cur += text[i];
    }
    if (cur) out.push([cur, mode]);
    return out;
  }
  function search(entries, query, opts) {
    opts = opts || {};
    const ts = terms(query);
    if (!ts.length) return [];
    const phrase = fold(query).trim();
    const out = [];
    for (const e of entries) {
      if (opts.peer && e.p !== opts.peer) continue;
      if (opts.who === "me" && !e.me) continue;
      if (opts.who === "them" && e.me) continue;
      if (!matches(e, ts)) continue;
      out.push(e);
    }
    out.sort((a, b) => {
      const pa = (a.f || "").indexOf(phrase) !== -1 ? 1 : 0, pb = (b.f || "").indexOf(phrase) !== -1 ? 1 : 0;
      return pb - pa || b.ts - a.ts;
    });
    return out;
  }

  /* ---------- storage (IndexedDB, in-memory fallback) ---------- */
  let db = null, entries = [], bySig = new Map(), peers = {}, loaded = false, loadP = null;
  const dbName = () => "kyro-msearch-" + ME();
  const sigOf = (p, ts, t) => p + "|" + Math.round(ts / 1000) + "|" + t.length + "|" + t.slice(0, 24);
  function openDb() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open(dbName(), 1); } catch (_) { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("m")) d.createObjectStore("m", { keyPath: "k" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  function load() {
    if (loadP) return loadP;
    loadP = (async () => {
      db = await openDb();
      if (db) {
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(["m", "meta"], "readonly");
            tx.objectStore("m").getAll().onsuccess = (e) => { (e.target.result || []).forEach((x) => addMem(x)); };
            tx.objectStore("meta").get("peers").onsuccess = (e) => { if (e.target.result) peers = e.target.result.v || {}; };
            tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
          } catch (_) { resolve(); }
        });
      }
      loaded = true;
    })();
    return loadP;
  }
  function addMem(x) {
    const sig = sigOf(x.p, x.ts, x.t);
    const had = bySig.get(sig);
    if (had) { if (x.id && !had.id) { had.id = x.id; return had; } return null; }
    x.f = fold(x.t);
    entries.push(x); bySig.set(sig, x);
    return x;
  }
  let pending = [], flushT = 0;
  function persist(x) {
    if (!db) return;
    pending.push(x);
    clearTimeout(flushT);
    flushT = setTimeout(flush, 600);
  }
  function flush() {
    if (!db || !pending.length) return;
    const batch = pending; pending = [];
    try {
      const tx = db.transaction(["m", "meta"], "readwrite");
      const st = tx.objectStore("m");
      batch.forEach((x) => { const { f, ...rest } = x; st.put(rest); });
      tx.objectStore("meta").put({ k: "peers", v: peers });
    } catch (_) {}
    if (entries.length > MAX_ENTRIES) trim();
  }
  function trim() {
    entries.sort((a, b) => a.ts - b.ts);
    const drop = entries.splice(0, entries.length - Math.floor(MAX_ENTRIES * 0.9));
    drop.forEach((x) => bySig.delete(sigOf(x.p, x.ts, x.t)));
    if (!db) return;
    try { const st = db.transaction("m", "readwrite").objectStore("m"); drop.forEach((x) => st.delete(x.k)); } catch (_) {}
  }
  function clearAll() {
    entries = []; bySig = new Map(); peers = {}; pending = [];
    try { localStorage.removeItem("kyro.msearch.done." + ME()); } catch (_) {}
    if (!db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(["m", "meta"], "readwrite");
        tx.objectStore("m").clear(); tx.objectStore("meta").clear();
        tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
      } catch (_) { resolve(); }
    });
  }

  /* ---------- indexing ---------- */
  function peerSnap(p) {
    if (!p) return null;
    return { id: String(p.id), name: p.name || "Chat", publicKey: p.publicKey || "", members: p.members || undefined, avatar: p.avatar || "" };
  }
  function add(peer, text, ts, mine, id) {
    if (!peer || !text) return;
    text = String(text).trim();
    if (!text || text.length > 4000) return;
    const pid = String(peer.id);
    const x = addMem({ k: pid + "|" + (id || sigOf(pid, ts, text)), p: pid, n: peer.name || "Chat", t: text, ts: ts, me: !!mine, id: id || "" });
    if (!x) return;
    peers[pid] = peerSnap(peer);
    persist(x);
  }
  function indexBubble(b, peer, tries) {
    if (!b || !b.classList || !b.classList.contains("bubble")) return;
    if (b.classList.contains("ephemeral") || b._exp) return; /* disappearing messages are never indexed */
    if (b.dataset.react) return;
    const t = b._plain;
    if (typeof t !== "string") {
      if ((tries || 0) < 4) setTimeout(() => indexBubble(b, peer, (tries || 0) + 1), 350 * ((tries || 0) + 1));
      return;
    }
    if (b.querySelector(":scope > img, :scope > .file-tile, :scope > audio")) return;
    add(peer, t, b._ts || Date.now(), b.classList.contains("me"), b.dataset.id || "");
  }
  function watch() {
    const box = $("#messages");
    if (!box) return setTimeout(watch, 500);
    new MutationObserver((muts) => {
      const peer = typeof currentPeer !== "undefined" ? currentPeer : null;
      if (!peer) return;
      load().then(() => muts.forEach((m) => m.addedNodes.forEach((n) => indexBubble(n, peer))));
    }).observe(box, { childList: true });
  }

  let backfilling = false;
  async function backfill(onProgress) {
    if (backfilling) return;
    backfilling = true;
    try {
      const list = (typeof chats !== "undefined" && Array.isArray(chats)) ? chats.slice() : [];
      let done = 0;
      for (const p of list) {
        try {
          const id = String(p.id);
          let msgs = [];
          if (id.startsWith("group:")) {
            if (typeof loadGroupMessages === "function") msgs = await loadGroupMessages(id);
          } else if (window.Kyro && Kyro.api && typeof asArray === "function") {
            const data = await Kyro.api.messages(id);
            if (data && data._ok) msgs = asArray(data);
          }
          for (const m of msgs) {
            if ((m.kind || "text") !== "text" || m.expiresAt) continue;
            let raw = m.text || m.content || "";
            if (String(raw).startsWith("ENC1:")) {
              if (typeof readText !== "function") continue;
              raw = await readText(raw, p);
              if (raw === "Message" || raw === "[Encrypted message]") continue;
            }
            const w = typeof parseWire === "function" ? parseWire(raw) : { type: "text", text: raw };
            if (w.type !== "text" || !w.text) continue;
            const mine = String(m.senderId || m.from || "") === ME() || m.mine === true;
            const ts = new Date(m.createdAt || m.ts || m.time || m.sentAt || Date.now()).getTime();
            add(p, w.text, Number.isFinite(ts) ? ts : Date.now(), mine, m._id ? String(m._id) : "");
          }
        } catch (_) {}
        done++;
        if (onProgress) onProgress(done, list.length);
        await new Promise((r) => setTimeout(r, 60));
      }
      flush();
      try { localStorage.setItem("kyro.msearch.done." + ME(), String(Date.now())); } catch (_) {}
    } finally { backfilling = false; }
  }

  /* ---------- UI ---------- */
  let screen = null, input, list, chipsEl, chatSel, status, moreBtn, state = { who: "all", peer: "", shown: 0, hits: [], q: "" };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function build() {
    screen = el("section", "km-screen");
    screen.hidden = true;
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-label", "Search messages");
    const head = el("header", "km-head");
    const back = el("button", "icon-round km-back", "\u2190");
    back.type = "button"; back.setAttribute("aria-label", "Close search");
    input = el("input", "km-input");
    input.type = "search"; input.placeholder = "Search all messages"; input.autocomplete = "off"; input.setAttribute("aria-label", "Search all messages");
    head.append(back, input);
    chipsEl = el("div", "km-chips");
    [["all", "All"], ["me", "From me"], ["them", "From them"]].forEach(([k, label]) => {
      const b = el("button", "km-chip" + (k === "all" ? " on" : ""), label);
      b.type = "button"; b.dataset.k = k;
      b.addEventListener("click", () => { state.who = k; chipsEl.querySelectorAll(".km-chip").forEach((x) => x.classList.toggle("on", x === b)); run(); });
      chipsEl.appendChild(b);
    });
    chatSel = el("select", "km-sel");
    chatSel.setAttribute("aria-label", "Limit to one chat");
    chatSel.addEventListener("change", () => { state.peer = chatSel.value; run(); });
    chipsEl.appendChild(chatSel);
    status = el("p", "km-status");
    list = el("div", "km-list");
    moreBtn = el("button", "km-more", "Show more");
    moreBtn.type = "button"; moreBtn.hidden = true;
    moreBtn.addEventListener("click", () => render(true));
    const foot = el("div", "km-foot");
    const clr = el("button", "km-clear", "Clear search index on this device");
    clr.type = "button";
    clr.addEventListener("click", async () => { await clearAll(); status.textContent = "Index cleared. It rebuilds as you open chats."; list.textContent = ""; moreBtn.hidden = true; });
    foot.appendChild(clr);
    screen.append(head, chipsEl, status, list, moreBtn, foot);
    document.body.appendChild(screen);
    back.addEventListener("click", close);
    let t = 0;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 120); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && screen && !screen.hidden) close(); });
  }
  function fillChats() {
    chatSel.textContent = "";
    const all = el("option", "", "All chats"); all.value = ""; chatSel.appendChild(all);
    const seen = new Set();
    const pool = (typeof chats !== "undefined" && Array.isArray(chats) ? chats : []).map(peerSnap);
    Object.keys(peers).forEach((k) => pool.push(peers[k]));
    pool.forEach((p) => {
      if (!p || seen.has(p.id)) return;
      seen.add(p.id);
      const o = el("option", "", p.name); o.value = p.id; chatSel.appendChild(o);
    });
    chatSel.value = state.peer;
  }
  function dateText(ts) {
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  }
  function resultRow(e, ts) {
    const row = el("button", "km-row");
    row.type = "button";
    const av = el("span", "km-av", (e.n || "?").trim().charAt(0).toUpperCase());
    const body = el("span", "km-body");
    const top = el("span", "km-top");
    top.append(el("b", "", e.n || "Chat"), el("small", "", dateText(e.ts)));
    const sn = snippet(e.t, ts, 110);
    const txt = el("span", "km-snip");
    if (e.me) txt.appendChild(el("em", "", "You: "));
    highlightParts(sn.text, ts).forEach(([s, hit]) => {
      if (hit) txt.appendChild(el("mark", "", s)); else txt.appendChild(document.createTextNode(s));
    });
    body.append(top, txt);
    row.append(av, body);
    row.addEventListener("click", () => openResult(e));
    return row;
  }
  function render(more) {
    const ts = terms(state.q);
    if (!more) { list.textContent = ""; state.shown = 0; }
    const next = state.hits.slice(state.shown, state.shown + PAGE);
    next.forEach((e) => list.appendChild(resultRow(e, ts)));
    state.shown += next.length;
    moreBtn.hidden = state.shown >= state.hits.length;
  }
  async function run() {
    await load();
    state.q = input.value.trim();
    if (!state.q) { list.textContent = ""; moreBtn.hidden = true; status.textContent = entries.length ? entries.length.toLocaleString() + " messages searchable on this device" : "Open your chats to build the search index."; return; }
    state.hits = search(entries, state.q, { who: state.who, peer: state.peer });
    status.textContent = state.hits.length ? state.hits.length.toLocaleString() + (state.hits.length === 1 ? " message" : " messages") : "No messages found";
    render(false);
  }
  function peerFor(e) {
    try {
      const live = (typeof chats !== "undefined" && Array.isArray(chats)) ? chats.find((c) => String(c.id) === e.p) : null;
      if (live) return live;
    } catch (_) {}
    return peers[e.p] || { id: e.p, name: e.n };
  }
  function openResult(e) {
    close();
    if (typeof openThread !== "function") return;
    openThread(peerFor(e));
    let tries = 0;
    const iv = setInterval(() => {
      const box = $("#messages");
      const hit = box && Array.from(box.children).find((x) => x.dataset && ((e.id && x.dataset.id === e.id) || (!e.id && x._plain === e.t && Math.abs((x._ts || 0) - e.ts) < 1500)));
      if (hit) {
        clearInterval(iv);
        hit.scrollIntoView({ block: "center", behavior: "smooth" });
        hit.classList.add("flash");
        setTimeout(() => hit.classList.remove("flash"), 1500);
      } else if (++tries > 30) { clearInterval(iv); tell("That message isn't on this device anymore."); }
    }, 150);
  }
  async function open() {
    if (!screen) build();
    await load();
    fillChats();
    screen.hidden = false;
    document.body.classList.add("km-open");
    input.focus();
    run();
    const done = Number(localStorage.getItem("kyro.msearch.done." + ME()) || 0);
    if (!backfilling && Date.now() - done > 6 * 3600 * 1000) {
      status.textContent = "Indexing your chats\u2026";
      backfill((d, n) => { if (!screen.hidden && !input.value.trim()) status.textContent = "Indexing your chats\u2026 " + d + "/" + n; })
        .then(() => { if (screen && !screen.hidden) { fillChats(); run(); } });
    }
  }
  function close() { if (screen) screen.hidden = true; document.body.classList.remove("km-open"); }

  function mountButton() {
    const ref = $("#searchToggle");
    if (!ref || $("#kmSearchBtn")) return !!ref;
    const b = el("button", "icon-round");
    b.id = "kmSearchBtn"; b.type = "button"; b.setAttribute("aria-label", "Search messages");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5A7.5 7.5 0 0 1 8 17.4L4 19l1.2-3.6A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 10h6M9 13h3.5"/></svg>';
    b.addEventListener("click", open);
    ref.before(b);
    return true;
  }
  function init() {
    if (!ME()) return setTimeout(init, 400);
    mountButton();
    watch();
    load();
  }
  window.KyroSearch = { open, close, _t: { fold, terms, matches, snippet, highlightParts, search } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
