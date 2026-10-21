/* Kyro status sync: puts your status on the server so your contacts can see it, and brings theirs to you.
   Works with the existing status screens (js/status-pro.js): they keep reading and writing the same
   local list (LS.stories); this file mirrors it with the backend.
   "Contacts" = people you've messaged + people saved in your contacts list.
   Music statuses are shared as text (the song file itself stays on your phone).
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  if (typeof LS === "undefined" || typeof load !== "function" || typeof save !== "function" || typeof Kyro === "undefined") return;
  if (window.KyroStatusSync) return;

  const KEY = LS.stories;
  const rawSave = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
  const mine = () => String(typeof meId !== "undefined" ? meId : "");
  const myName = () => (typeof meName !== "undefined" ? meName : "");
  const alive = (s) => !s.expires || s.expires > Date.now();
  const stories = () => load(KEY, []);
  const redraw = () => { try { if (typeof window.renderStories === "function") window.renderStories(); } catch (_) {} };

  const uploading = new Set();   // local stories being uploaded right now (keyed at|name)
  const lastIds = new Set();     // remote ids of my stories as of the last save, to notice deletions
  const tag = (s) => s.at + "|" + s.name;

  async function call(path, method, body) {
    try { return await Kyro.request("/api/status" + path, { method, body }); } catch (_) { return { _ok: false }; }
  }

  function savedContactIds() {
    try { return (load(LS.contacts, []) || []).map((c) => String(c.id || "")).filter(Boolean).slice(0, 500); } catch (_) { return []; }
  }

  /* ---------- push: my new statuses, views and reactions, deletions ---------- */
  async function upload(s) {
    const k = tag(s);
    if (uploading.has(k)) return;
    uploading.add(k);
    try {
      const body = {
        type: s.image ? "image" : "text",
        text: s.musicName && !s.image ? "\u266A " + (s.text || s.musicName) : s.text || "",
        caption: s.caption || "",
        image: s.image || "",
        bg: typeof s.bg === "number" ? s.bg : 0,
        musicName: s.musicName || "",
        createdAt: s.at,
        contactIds: savedContactIds()
      };
      const r = await call("", "POST", body);
      if (r && r._ok && r.story) {
        const list = stories().map((x) => (x.at === s.at && x.name === s.name ? { ...x, remoteId: r.story.id, authorId: mine() } : x));
        rawSave(list);
        lastIds.add(r.story.id);
        redraw();
      }
    } finally { uploading.delete(k); setTimeout(pull, 200); }
  }

  function diff(list) {
    const ids = new Set();
    list.forEach((s) => {
      if (!alive(s)) return;
      if (s.remoteId) {
        if (s.authorId === mine() || s.name === myName()) ids.add(s.remoteId);
        else {
          // someone else's status: tell the server I viewed it / reacted to it
          if ((s.views || []).includes(mine()) && !s._vs) { s._vs = 1; call("/" + s.remoteId + "/view", "POST", {}); rawSave(list); }
          const emo = (s.reacts || {})[mine()] || "";
          if (emo !== (s._rs || "")) { s._rs = emo; call("/" + s.remoteId + "/react", "POST", { emoji: emo }); rawSave(list); }
        }
      } else if (s.name === myName()) {
        upload(s);
      }
    });
    lastIds.forEach((id) => { if (!ids.has(id)) call("/" + id, "DELETE"); });
    lastIds.clear();
    ids.forEach((id) => lastIds.add(id));
  }

  // watch every write the status screens make to the local list
  const origSave = window.save;
  window.save = function (key, value) {
    const r = origSave.apply(this, arguments);
    if (key === KEY && Array.isArray(value)) setTimeout(() => diff(value), 0);
    return r;
  };

  /* ---------- pull: contacts' statuses, plus views / reactions on mine ---------- */
  let pulling = false, again = false;
  async function pull() {
    if (pulling) { again = true; return; }
    pulling = true;
    try {
      const r = await call("", "GET");
      if (!r || !r._ok || !Array.isArray(r.stories)) return;
      const me = mine();
      const feed = r.stories;

      // give two different people with the same name different labels, and never reuse my own name
      const nameOf = new Map();
      feed.forEach((f) => {
        if (f.authorId === me || nameOf.has(f.authorId)) return;
        let n = f.authorName || "Contact";
        if (n === myName() || [...nameOf.values()].includes(n)) n += " (" + (f.authorUsername || f.authorId.slice(-4)) + ")";
        nameOf.set(f.authorId, n);
      });

      const local = stories().filter(alive);
      const byRemote = new Map(local.filter((s) => s.remoteId).map((s) => [s.remoteId, s]));
      const next = local.filter((s) => !s.remoteId && !uploading.has(tag(s))); // unsent local ones stay until uploaded

      feed.forEach((f) => {
        const old = byRemote.get(f.id) || {};
        const isMine = f.authorId === me;
        const s = {
          ...old,
          remoteId: f.id,
          authorId: f.authorId,
          name: isMine ? myName() : nameOf.get(f.authorId),
          avatar: isMine ? "" : f.authorAvatar || "",
          type: f.type,
          at: new Date(f.createdAt).getTime(),
          expires: new Date(f.expiresAt).getTime(),
          text: f.text || "",
          caption: f.caption || "",
          bg: f.bg,
          musicName: f.musicName || undefined
        };
        if (f.image) s.image = f.image; else delete s.image;
        if (isMine) {
          s.views = f.viewers || [];
          s.reacts = f.reacts || {};
          s.likes = Object.keys(s.reacts).filter((id) => s.reacts[id] === "\u2764\uFE0F");
        } else {
          // keep what I've already viewed / reacted on this phone
          const v = old.views || [];
          s.views = v;
          s.reacts = { ...(old.reacts || {}), ...(f.reacts || {}) };
          s._vs = old._vs || ((f.reacts && f.reacts[me]) ? 1 : 0);
          s._rs = (f.reacts && f.reacts[me]) || old._rs || "";
          if (s._rs && !s.reacts[me]) s.reacts[me] = s._rs;
        }
        next.push(s);
      });

      const uniq = [];
      const ids = new Set();
      next.forEach((s) => { if (s.remoteId) { if (ids.has(s.remoteId)) return; ids.add(s.remoteId); } uniq.push(s); });
      next.length = 0; uniq.forEach((s) => next.push(s));
      next.sort((a, b) => (b.at || 0) - (a.at || 0));
      rawSave(next);
      lastIds.clear();
      next.forEach((s) => { if (s.remoteId && (s.authorId === me)) lastIds.add(s.remoteId); });
      redraw();
      // anything of mine that never reached the server (older statuses, offline posts)
      diff(next);
    } finally {
      pulling = false;
      if (again) { again = false; setTimeout(pull, 400); }
    }
  }

  /* ---------- when to pull ---------- */
  function listen() {
    const sock = window.kyroSocket;
    if (!sock) return setTimeout(listen, 800);
    sock.on("status-new", pull);
    sock.on("status-update", pull);
    sock.on("connect", pull);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  window.addEventListener("online", pull);
  setInterval(() => { if (!document.hidden) pull(); }, 60000);
  const origShowTab = window.showTab;
  if (typeof origShowTab === "function") {
    window.showTab = function (name) {
      const r = origShowTab.apply(this, arguments);
      if (name === "story") pull();
      return r;
    };
  }
  listen();
  setTimeout(pull, 600);

  window.KyroStatusSync = { pull };
})();
