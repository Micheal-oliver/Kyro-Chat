/* Kyro GIF search: a GIF button in the composer opens trending GIFs and search (GIPHY).
   A GIF is sent as a normal image message, so the other person needs nothing new and there is no backend change.
   Needs a free GIPHY key in js/gif-config.js. Remove the <script> and <link> lines in app.html to undo. */
(() => {
  "use strict";

  const attach = document.getElementById("attachBtn");
  if (!attach) return;

  const API = "https://api.giphy.com/v1/gifs/";
  const PAGE = 24;
  const MAX_BYTES = 4 * 1024 * 1024;
  const key = () => String(window.KYRO_GIPHY_KEY || "").trim();
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const say = (t) => { try { toast(t); } catch (_) {} };

  /* ---------- composer button (next to the sticker button) ---------- */
  const btn = el("button", "icon-round kg-btn", "GIF");
  btn.type = "button";
  btn.id = "kgBtn";
  btn.setAttribute("aria-label", "Send a GIF");
  (document.getElementById("kxStickerBtn") || attach).after(btn);

  /* ---------- panel ---------- */
  const root = el("div", "kg");
  root.hidden = true;
  root.innerHTML =
    '<div class="kg-scrim"></div>' +
    '<div class="kg-sheet" role="dialog" aria-label="GIF search">' +
    '<div class="kg-grab" aria-hidden="true"></div>' +
    '<div class="kg-head"><input class="kg-q" type="search" placeholder="Search GIFs" autocomplete="off" enterkeyhint="search" aria-label="Search GIFs" />' +
    '<button class="kg-x" type="button" aria-label="Close">\u00d7</button></div>' +
    '<div class="kg-body"><div class="kg-grid"></div><p class="kg-note" hidden></p></div>' +
    '<p class="kg-credit">Powered by GIPHY</p></div>';
  document.body.appendChild(root);

  const q = root.querySelector(".kg-q");
  const body = root.querySelector(".kg-body");
  const grid = root.querySelector(".kg-grid");
  const note = root.querySelector(".kg-note");

  let term = "", offset = 0, loading = false, done = false, ticket = 0, timer = null;
  const cache = new Map(); // term -> {items, offset, done}

  function setNote(msg) { note.hidden = !msg; note.textContent = msg || ""; }

  function tile(it) {
    const b = el("button", "kg-tile");
    b.type = "button";
    b.setAttribute("aria-label", it.title ? "Send GIF: " + it.title : "Send this GIF");
    const sm = it.images.fixed_width_small || it.images.fixed_width || it.images.downsized;
    if (sm && sm.width && sm.height) b.style.aspectRatio = sm.width + " / " + sm.height;
    const img = el("img");
    img.loading = "lazy"; img.decoding = "async"; img.alt = it.title || "GIF";
    img.src = sm.url;
    b.appendChild(img);
    b.addEventListener("click", () => send(it, b));
    return b;
  }

  async function fetchPage(t, off) {
    const k = key();
    const url = API + (t ? "search" : "trending") + "?api_key=" + encodeURIComponent(k) +
      (t ? "&q=" + encodeURIComponent(t) : "") + "&limit=" + PAGE + "&offset=" + off + "&rating=pg-13";
    const res = await fetch(url);
    if (res.status === 429) { const e = new Error("rate"); e.code = 429; throw e; }
    if (res.status === 401 || res.status === 403) { const e = new Error("key"); e.code = 401; throw e; }
    if (!res.ok) throw new Error("http " + res.status);
    const j = await res.json();
    return (j.data || []).filter((x) => x && x.images && (x.images.fixed_width || x.images.downsized));
  }

  async function more(reset) {
    if (!key()) {
      grid.innerHTML = "";
      setNote("GIF search needs a free GIPHY key. Open js/gif-config.js in your project, paste the key there, save and redeploy.");
      return;
    }
    if (reset) {
      ticket++; offset = 0; done = false; loading = false;
      grid.innerHTML = ""; body.scrollTop = 0; setNote("");
      const c = cache.get(term);
      if (c) { c.items.forEach((it) => grid.appendChild(tile(it))); offset = c.offset; done = c.done; if (!c.items.length) setNote("No GIFs found. Try another word."); return; }
    }
    if (loading || done) return;
    loading = true;
    const mine = ticket;
    root.classList.add("busy");
    try {
      const items = await fetchPage(term, offset);
      if (mine !== ticket) return;
      const c = cache.get(term) || { items: [], offset: 0, done: false };
      items.forEach((it) => { c.items.push(it); grid.appendChild(tile(it)); });
      offset += items.length; c.offset = offset;
      if (items.length < PAGE) done = true;
      c.done = done;
      cache.set(term, c);
      if (!c.items.length) setNote("No GIFs found. Try another word.");
    } catch (e) {
      if (mine !== ticket) return;
      if (e.code === 429) setNote("Too many searches for now. Wait a minute and try again.");
      else if (e.code === 401) setNote("GIPHY didn't accept the key in js/gif-config.js. Check that it is copied correctly.");
      else setNote("Couldn't load GIFs. Check your connection and try again.");
      done = true;
    } finally {
      if (mine === ticket) { loading = false; root.classList.remove("busy"); }
    }
  }

  body.addEventListener("scroll", () => {
    if (body.scrollHeight - body.scrollTop - body.clientHeight < 240) more(false);
  }, { passive: true });

  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const t = q.value.trim().toLowerCase();
      if (t === term) return;
      term = t;
      more(true);
    }, 380);
  });

  /* ---------- send ---------- */
  function toDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function send(it, node) {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    const blocked = document.getElementById("blockedBar");
    if (blocked && !blocked.hidden) { say("Unblock this contact to send GIFs."); return; }
    if (node.classList.contains("sending")) return;
    node.classList.add("sending");
    try {
      const im = it.images;
      const big = im.fixed_width || im.downsized;
      const small = im.fixed_width_small || im.downsized_small || big;
      let pick = big;
      if (Number(big.size) > MAX_BYTES && small) pick = small;
      const res = await fetch(pick.url);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      if (blob.size > MAX_BYTES) { say("That GIF is too big to send. Pick another."); return; }
      const media = await toDataUrl(blob.type === "image/gif" ? blob : new Blob([blob], { type: "image/gif" }));
      const box = document.getElementById("messages");
      if (box.querySelector(".hint")) box.innerHTML = "";
      const bubble = makeBubble({ mine: true, senderId: meId, kind: "image", media, text: "GIF" });
      appendMsg(box, bubble);
      box.scrollTop = box.scrollHeight;
      close();
      try { await sendChat({ kind: "image", media, text: "GIF" }, bubble); }
      catch (_) { bubble.style.opacity = "0.6"; }
    } catch (_) {
      say("Couldn't load that GIF. Try another.");
    } finally {
      node.classList.remove("sending");
    }
  }

  /* ---------- open / close ---------- */
  function open() {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("on"));
    if (!grid.children.length) { term = ""; q.value = ""; more(true); }
    if (window.matchMedia && !matchMedia("(pointer: coarse)").matches) q.focus();
  }
  function close() {
    root.classList.remove("on");
    setTimeout(() => { if (!root.classList.contains("on")) root.hidden = true; }, 220);
  }

  btn.addEventListener("click", () => (root.hidden || !root.classList.contains("on") ? open() : close()));
  root.querySelector(".kg-scrim").addEventListener("click", close);
  root.querySelector(".kg-x").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });
})();
