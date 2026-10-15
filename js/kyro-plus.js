/* Kyro Plus: Schedule send, Saved messages, Reminders and slash commands (/recap, /remind, /schedule, /saved).
   All additive. Pairs with kyro-plus.css. Remove the <link> and <script> hook lines in app.html to undo.
   No backend change: everything is stored on this device (localStorage, keyed per account) and messages
   are sent through the app's own sendChat(), so encryption, groups and disappearing timers behave as normal.
   Scheduled messages and reminders fire while Kyro is open; anything that came due while it was closed
   is delivered / shown the next time Kyro opens. */
(() => {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const toastMsg = (t, k, ms) => { try { toast(t, k, ms); } catch (_) {} };
  const ME = () => (typeof meId !== "undefined" ? String(meId) : "");
  const K = (n) => "kyro.plus." + n + "." + ME();
  const rd = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || ""); return v == null ? f : v; } catch (_) { return f; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const curPeer = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? currentPeer : null);
  const isGroupId = (id) => String(id).startsWith("group:");
  const isEditing = () => (typeof editing !== "undefined" && !!editing);
  const pad = (n) => String(n).padStart(2, "0");

  /* =====================================================================
     Time parsing: "20m", "in 2 hours", "9pm", "21:30", "tonight", "tomorrow 8am", "friday 6pm"
     Returns { at, rest } (rest = the text after the time) or null.
     ===================================================================== */
  /*PARSE-START*/
  function parseWhen(input, nowTs) {
    const s0 = String(input || "").trim();
    if (!s0) return null;
    const now = new Date(nowTs || Date.now());
    let m = s0.match(/^(?:in\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b[\s,:-]*/i);
    if (m) {
      const n = parseFloat(m[1]);
      const u = m[2].toLowerCase()[0];
      if (!(n > 0)) return null;
      const ms = u === "m" ? n * 60000 : u === "h" ? n * 3600000 : n * 86400000;
      return { at: now.getTime() + Math.round(ms), rest: s0.slice(m[0].length).trim() };
    }
    let rest = s0;
    let dayWord = null;
    m = rest.match(/^(today|tonight|tomorrow|tmrw|tmr|sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b[\s,]*/i);
    if (m) { dayWord = m[1].toLowerCase(); rest = rest.slice(m[0].length); }
    let h = null, min = 0;
    const word = rest.match(/^(?:at\s+)?(noon|midnight)\b[\s,]*/i);
    if (word) {
      h = word[1].toLowerCase() === "noon" ? 12 : 0;
      rest = rest.slice(word[0].length);
    } else {
      const t = rest.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$|[,.!?])[\s,]*/i);
      if (t && (t[2] || t[3])) {
        let hh = parseInt(t[1], 10);
        const mm = t[2] ? parseInt(t[2], 10) : 0;
        const ap = t[3] ? t[3].toLowerCase()[0] : "";
        if (mm > 59) return null;
        if (ap) {
          if (hh < 1 || hh > 12) return null;
          if (ap === "p" && hh < 12) hh += 12;
          if (ap === "a" && hh === 12) hh = 0;
        } else if (hh > 23) return null;
        h = hh; min = mm;
        rest = rest.slice(t[0].length);
      }
    }
    if (!dayWord && h == null) return null;
    const base = new Date(now);
    base.setSeconds(0, 0);
    const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const setTime = (d, hh, mm) => { d.setHours(hh, mm, 0, 0); return d; };
    let at;
    if (!dayWord) {
      at = setTime(new Date(base), h, min);
      if (at.getTime() <= now.getTime() + 30000) at.setDate(at.getDate() + 1);
    } else if (dayWord === "today") {
      if (h == null) return null;
      at = setTime(new Date(base), h, min);
      if (at.getTime() <= now.getTime()) return null;
    } else if (dayWord === "tonight") {
      at = setTime(new Date(base), h == null ? 20 : h, h == null ? 0 : min);
      if (at.getTime() <= now.getTime()) return null;
    } else if (dayWord === "tomorrow" || dayWord === "tmrw" || dayWord === "tmr") {
      at = setTime(new Date(base), h == null ? 9 : h, h == null ? 0 : min);
      at.setDate(at.getDate() + 1);
    } else {
      const target = DAYS[dayWord.slice(0, 3)];
      at = setTime(new Date(base), h == null ? 9 : h, h == null ? 0 : min);
      let add = (target - at.getDay() + 7) % 7;
      if (add === 0 && at.getTime() <= now.getTime()) add = 7;
      at.setDate(at.getDate() + add);
    }
    return { at: at.getTime(), rest: rest.trim() };
  }
  /*PARSE-END*/

  function fmtWhen(ts) {
    const d = new Date(ts), n = new Date();
    const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    if (diff === 0) return "Today " + t;
    if (diff === 1) return "Tomorrow " + t;
    if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: "short" }) + " " + t;
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + t;
  }
  const toLocalInput = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };
  const snip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };

  /* ---------- peers ---------- */
  const snapPeer = (p) => ({ id: String(p.id), name: p.name || "Chat", publicKey: p.publicKey || "", members: p.members || undefined });
  function resolvePeer(s) {
    try {
      if (isGroupId(s.id)) {
        const g = (load(LS.groups, []) || []).find((x) => "group:" + x.id === s.id);
        if (g) return { id: s.id, name: g.name || s.name, preview: "Group chat", members: g.members || s.members || [] };
      } else {
        const c = (typeof chats !== "undefined" ? chats : []).find((x) => String(x.id) === s.id);
        if (c) return c;
      }
    } catch (_) {}
    return s;
  }
  function nameOf(id) {
    id = String(id || "");
    const p = curPeer();
    if (!id) return p && !isGroupId(p.id) ? p.name : "Someone";
    if (p && String(p.id) === id) return p.name || "Someone";
    try {
      const pools = [(typeof chats !== "undefined" ? chats : []), load(LS.contacts, []) || []];
      for (const pool of pools) {
        const c = pool.find((x) => String(x.id || x._id || x.userId || "") === id);
        if (c) return c.name || c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Someone";
      }
    } catch (_) {}
    return "Someone";
  }

  /* =====================================================================
     Generic "pick a time" sheet (schedule, reschedule, reminder)
     ===================================================================== */
  const when = el("div", "modal is-off");
  when.id = "kpWhen"; when.hidden = true;
  when.innerHTML =
    '<div class="sheet kp-sheet">' +
    '<h3 id="kpWhenTitle">Schedule message</h3>' +
    '<p class="hint" id="kpWhenTo"></p>' +
    '<textarea id="kpWhenText" rows="3" maxlength="2000"></textarea>' +
    '<div class="kp-chips" id="kpWhenChips"></div>' +
    '<label>Or pick a date and time</label>' +
    '<input type="datetime-local" id="kpWhenInput" />' +
    '<p class="hint" id="kpWhenNote"></p>' +
    '<button class="btn btn-primary" id="kpWhenGo" type="button" style="width:100%">Schedule</button>' +
    '<button class="sheet-btn ghost" id="kpWhenCancel" type="button">Cancel</button>' +
    "</div>";
  let whenCfg = null;
  const wText = () => $("#kpWhenText", when);
  const wInput = () => $("#kpWhenInput", when);

  function openWhen(cfg) {
    whenCfg = cfg;
    $("#kpWhenTitle", when).textContent = cfg.title;
    const to = $("#kpWhenTo", when);
    to.textContent = cfg.to || ""; to.hidden = !cfg.to;
    wText().value = cfg.text || "";
    wText().placeholder = cfg.placeholder || "Message";
    wText().hidden = cfg.showText === false;
    $("#kpWhenGo", when).textContent = cfg.cta || "Schedule";
    $("#kpWhenNote", when).textContent = cfg.note || "";
    const chips = $("#kpWhenChips", when);
    chips.textContent = "";
    const now = new Date();
    const mkAt = (add, h) => { const d = new Date(now); d.setDate(d.getDate() + add); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const opts = [["In 1 hour", Date.now() + 3600000], ["In 3 hours", Date.now() + 3 * 3600000]];
    if (mkAt(0, 20) > Date.now() + 15 * 60000) opts.push(["Tonight 8 PM", mkAt(0, 20)]);
    opts.push(["Tomorrow 9 AM", mkAt(1, 9)], ["Tomorrow 6 PM", mkAt(1, 18)]);
    const start = cfg.at && cfg.at > Date.now() ? cfg.at : opts[0][1];
    opts.forEach(([label, ts]) => {
      const b = el("button", "kp-chip", label);
      b.type = "button";
      b.addEventListener("click", () => { wInput().value = toLocalInput(ts); mark(); });
      chips.appendChild(b);
    });
    function mark() {
      const v = new Date(wInput().value).getTime();
      $$(".kp-chip", chips).forEach((c, i) => c.classList.toggle("on", Math.abs(opts[i][1] - v) < 60000));
    }
    wInput().min = toLocalInput(Date.now());
    wInput().value = toLocalInput(start);
    wInput().oninput = mark;
    mark();
    openModal("kpWhen");
    if (cfg.showText !== false && !cfg.text) setTimeout(() => wText().focus(), 120);
  }
  function closeWhen() { closeModal("kpWhen"); whenCfg = null; }

  /* =====================================================================
     Schedule send
     ===================================================================== */
  let sched = rd(K("sched"), []);
  const saveSched = () => wr(K("sched"), sched);

  function addSched(peer, text, at) {
    if (sched.length >= 50) { toastMsg("You can keep up to 50 scheduled messages."); return false; }
    sched.push({ id: uid(), peer: snapPeer(peer), text, at, created: Date.now() });
    sched.sort((a, b) => a.at - b.at);
    saveSched();
    paintAll();
    return true;
  }

  async function deliver(item) {
    const peer = resolvePeer(item.peer);
    const text = item.text;
    const open = curPeer() && String(curPeer().id) === String(peer.id);
    try { if (typeof rememberPlain === "function") rememberPlain(peer.id, text); } catch (_) {}
    if (open) {
      const box = $("#messages");
      const bubble = makeBubble({ mine: true, senderId: ME(), text, kind: "text" });
      appendMsg(box, bubble);
      box.scrollTop = box.scrollHeight;
      await sendChat({ text, kind: "text" }, bubble);
      return;
    }
    const prev = currentPeer;
    currentPeer = peer;
    try { await sendChat({ text, kind: "text" }); }
    finally { if (currentPeer === peer) currentPeer = prev; }
    try { if (!curPeer() && typeof loadChats === "function") loadChats(); } catch (_) {}
  }

  let busy = false;
  async function tickSched() {
    if (busy || !navigator.onLine || !sched.length) return;
    const now = Date.now();
    const due = sched.filter((s) => s.at <= now);
    if (!due.length) return;
    busy = true;
    let sent = 0, late = 0;
    try {
      for (const it of due) {
        sched = sched.filter((x) => x.id !== it.id);
        saveSched();
        try {
          await deliver(it);
          sent++;
          if (now - it.at > 120000) late++;
        } catch (_) {
          it.fail = (it.fail || 0) + 1;
          if (it.fail < 3) { it.at = Date.now() + 60000; sched.push(it); saveSched(); }
        }
      }
    } finally { busy = false; paintAll(); }
    if (sent) {
      toastMsg(sent === 1 ? "Scheduled message sent" : sent + " scheduled messages sent", "", 3800);
      if (late) toastMsg("Some were due while Kyro was closed, so they went out now.", "tip", 5200);
    }
  }

  /* composer: clock button + long-press on Send */
  const composer = $("#composer");
  const input = $("#messageInput");
  const send = composer && $(".send-btn", composer);
  const clock = el("button", "icon-round kp-sched-btn");
  clock.id = "kpSchedBtn"; clock.type = "button"; clock.hidden = true;
  clock.setAttribute("aria-label", "Schedule message");
  clock.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7V7z"/></svg>';
  if (send) send.before(clock);

  const canSchedule = () => !!(curPeer() && input && input.value.trim() && !isEditing());
  function syncClock() { clock.hidden = !canSchedule(); }

  function scheduleFromComposer(prefill) {
    const p = curPeer();
    const text = prefill != null ? prefill : (input ? input.value.trim() : "");
    if (!p) return;
    openWhen({
      title: "Schedule message",
      to: "To " + (p.name || "this chat"),
      text,
      cta: "Schedule",
      note: "Kyro sends it at that time while the app is open. If it's closed, it goes out the next time you open Kyro.",
      onSave(at, t) {
        if (!t.trim()) { toastMsg("Type a message first."); return false; }
        if (!addSched(p, t.trim(), at)) return false;
        if (prefill == null && input) { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); }
        toastMsg("Scheduled for " + fmtWhen(at), "", 3600);
        return true;
      }
    });
  }
  clock.addEventListener("click", () => scheduleFromComposer());

  if (send) {
    let lp = null, fired = false;
    send.addEventListener("pointerdown", () => {
      fired = false; clearTimeout(lp);
      lp = setTimeout(() => {
        if (!canSchedule()) return;
        fired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        scheduleFromComposer();
      }, 520);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => send.addEventListener(ev, () => clearTimeout(lp)));
    send.addEventListener("click", (e) => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
    send.addEventListener("contextmenu", (e) => { if (canSchedule()) e.preventDefault(); });
  }
  if (input) input.addEventListener("input", syncClock);

  /* banner above composer for this chat's pending messages */
  const banner = el("div", "kp-banner");
  banner.id = "kpBanner"; banner.hidden = true;
  banner.innerHTML = '<span class="kp-banner-ico">\u23F0</span><span id="kpBannerText"></span><button type="button">View</button>';
  if (composer) composer.before(banner);
  $("button", banner).addEventListener("click", () => openList());

  function paintBanner() {
    const p = curPeer();
    const n = p ? sched.filter((s) => s.peer.id === String(p.id)).length : 0;
    banner.hidden = !n;
    if (n) {
      const first = sched.find((s) => s.peer.id === String(p.id));
      $("#kpBannerText", banner).textContent = n + (n === 1 ? " scheduled message" : " scheduled messages") + " \u00b7 next " + fmtWhen(first.at);
    }
  }

  /* =====================================================================
     Reminders
     ===================================================================== */
  let rem = rd(K("rem"), []);
  const saveRem = () => wr(K("rem"), rem);
  const remWrap = el("div", "kp-rem-wrap");
  remWrap.id = "kpRemWrap";
  document.body.appendChild(remWrap);

  function askNotify() {
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (_) {}
  }
  function addRem(text, at, peer) {
    if (rem.length >= 50) { toastMsg("You can keep up to 50 reminders."); return false; }
    rem.push({ id: uid(), text, at, peer: peer ? snapPeer(peer) : null, created: Date.now() });
    rem.sort((a, b) => a.at - b.at);
    saveRem(); paintAll(); askNotify();
    return true;
  }
  function popReminder(r, missed) {
    const card = el("div", "kp-rem");
    const top = el("div", "kp-rem-top");
    top.append(el("b", "", (missed ? "Missed reminder" : "Reminder") + (r.peer ? " \u00b7 " + r.peer.name : "")), el("small", "", fmtWhen(r.at)));
    const txt = el("p", "", r.text);
    const act = el("div", "kp-rem-act");
    const done = el("button", "", "Done");
    const snooze = el("button", "", "Snooze 10 min");
    done.type = snooze.type = "button";
    done.addEventListener("click", () => card.remove());
    snooze.addEventListener("click", () => { addRem(r.text, Date.now() + 600000, r.peer); card.remove(); toastMsg("Snoozed for 10 minutes"); });
    act.append(done, snooze);
    if (r.peer) {
      const open = el("button", "", "Open chat");
      open.type = "button";
      open.addEventListener("click", () => { card.remove(); try { openThread(resolvePeer(r.peer)); } catch (_) {} });
      act.prepend(open);
    }
    card.append(top, txt, act);
    remWrap.appendChild(card);
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Kyro reminder", { body: r.text, icon: "images/icon-192.png", tag: r.id });
      }
    } catch (_) {}
  }
  function tickRem() {
    if (!rem.length) return;
    const now = Date.now();
    const due = rem.filter((r) => r.at <= now);
    if (!due.length) return;
    rem = rem.filter((r) => r.at > now);
    saveRem();
    due.forEach((r) => popReminder(r, now - r.at > 120000));
    paintAll();
  }

  /* =====================================================================
     Scheduled + reminders list
     ===================================================================== */
  const list = el("div", "modal is-off");
  list.id = "kpList"; list.hidden = true;
  list.innerHTML = '<div class="sheet tall kp-sheet"><button class="sheet-x" id="kpListX" type="button">\u00d7</button><h3>Scheduled &amp; reminders</h3><div id="kpListBody"></div></div>';

  function paintList() {
    const body = $("#kpListBody", list);
    body.textContent = "";
    const sec = (title) => { const h = el("h4", "kp-sec", title); body.appendChild(h); };
    const row = (top, when_, text, acts) => {
      const r = el("div", "kp-item");
      const t = el("div", "kp-item-top");
      t.append(el("b", "", top), el("span", "", when_));
      const p = el("p", "", text);
      const a = el("div", "kp-item-act");
      acts.forEach(([label, fn, danger]) => {
        const b = el("button", danger ? "danger" : "", label);
        b.type = "button"; b.addEventListener("click", fn); a.appendChild(b);
      });
      r.append(t, p, a);
      body.appendChild(r);
    };
    sec("Scheduled messages");
    if (!sched.length) body.appendChild(el("p", "hint", "Nothing scheduled. Type a message, then tap the clock (or hold Send)."));
    sched.forEach((s) => row(s.peer.name, fmtWhen(s.at), s.text, [
      ["Send now", async () => {
        sched = sched.filter((x) => x.id !== s.id); saveSched();
        try { await deliver(s); toastMsg("Sent"); } catch (_) { toastMsg("Couldn't send. Try again."); sched.push(s); saveSched(); }
        paintAll();
      }],
      ["Edit", () => {
        openWhen({
          title: "Reschedule", to: "To " + s.peer.name, text: s.text, at: s.at, cta: "Save",
          onSave(at, t) {
            if (!t.trim()) { toastMsg("The message can't be empty."); return false; }
            s.text = t.trim(); s.at = at; sched.sort((a, b) => a.at - b.at); saveSched(); paintAll();
            toastMsg("Updated for " + fmtWhen(at)); return true;
          }
        });
      }],
      ["Delete", () => { sched = sched.filter((x) => x.id !== s.id); saveSched(); paintAll(); }, true]
    ]));
    sec("Reminders");
    if (!rem.length) body.appendChild(el("p", "hint", "No reminders. Try /remind 2h call mum, or long-press a message and tap Remind me."));
    rem.forEach((r) => row(r.peer ? r.peer.name : "Reminder", fmtWhen(r.at), r.text, [
      ["Edit", () => {
        openWhen({
          title: "Edit reminder", text: r.text, at: r.at, cta: "Save", placeholder: "What should I remind you about?",
          onSave(at, t) {
            if (!t.trim()) { toastMsg("Add a note for the reminder."); return false; }
            r.text = t.trim(); r.at = at; rem.sort((a, b) => a.at - b.at); saveRem(); paintAll();
            toastMsg("Reminder set for " + fmtWhen(at)); return true;
          }
        });
      }],
      ["Delete", () => { rem = rem.filter((x) => x.id !== r.id); saveRem(); paintAll(); }, true]
    ]));
  }
  function openList() { paintList(); openModal("kpList"); }
  $("#kpListX", list).addEventListener("click", () => closeModal("kpList"));
  list.addEventListener("click", (e) => { if (e.target === list) closeModal("kpList"); });

  /* wire the time sheet (created above, appended after the list so it stacks on top) */
  document.body.append(list, when);
  $("#kpWhenCancel", when).addEventListener("click", closeWhen);
  when.addEventListener("click", (e) => { if (e.target === when) closeWhen(); });
  $("#kpWhenGo", when).addEventListener("click", () => {
    if (!whenCfg) return;
    const at = new Date(wInput().value).getTime();
    if (!Number.isFinite(at) || at <= Date.now() + 5000) { toastMsg("Pick a time in the future."); return; }
    const ok = whenCfg.onSave(at, wText().value);
    if (ok) closeWhen();
  });

  /* =====================================================================
     Saved messages
     ===================================================================== */
  let saved = rd(K("saved"), []);
  const saveSaved = () => wr(K("saved"), saved);

  function shrinkEl(src) {
    return new Promise((res) => {
      try {
        const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
        if (!w0 || !h0) { res(""); return; }
        const s = Math.min(1, 1280 / Math.max(w0, h0));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
        c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.78));
      } catch (_) { res(""); }
    });
  }
  async function shrinkImg(img) {
    const out = await shrinkEl(img);
    if (out) return out;
    const s = img.currentSrc || img.src || "";
    if (/^data:/.test(s)) return s.length < 1500000 ? s : "";
    return s;
  }
  function shrinkFile(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = async () => { const out = await shrinkEl(im); URL.revokeObjectURL(url); res(out); };
      im.onerror = () => { URL.revokeObjectURL(url); res(""); };
      im.src = url;
    });
  }
  function pushSaved(rec) {
    saved.push(rec);
    if (!saveSaved()) {
      saved.pop();
      toastMsg("Storage is full. Delete a few saved items and try again.", "error");
      return false;
    }
    paintSavedRow();
    if (!savedScreen.hidden) paintSaved();
    return true;
  }
  async function saveFromBubble(b) {
    const m = b._m || {};
    const kind = m.kind || "text";
    const p = curPeer();
    const rec = { id: uid(), ts: Date.now(), kind: "text", text: "", media: "", from: b.classList.contains("me") ? "You" : nameOf(b._sender), chat: p ? p.name || "" : "", peerId: p ? String(p.id) : "" };
    const img = b.querySelector(":scope > img");
    if (img) {
      rec.kind = "image";
      rec.media = await shrinkImg(img);
      if (!rec.media) { toastMsg("Couldn't save that photo."); return; }
    } else if (kind === "voice") {
      if (m.media && m.media.length < 900000) { rec.kind = "voice"; rec.media = m.media; }
      else rec.text = "\uD83C\uDFA4 Voice note (too large to keep here)";
    } else if (kind === "video" || kind === "file") {
      rec.text = (kind === "video" ? "\uD83C\uDFA5 " : "\uD83D\uDCC4 ") + (m.fileName || kind) + " (files aren't stored in Saved messages)";
    } else {
      rec.text = b._plain || m.text || "";
    }
    if (!rec.text && !rec.media) { toastMsg("Nothing to save from that message."); return; }
    if (pushSaved(rec)) toastMsg("Saved \u2713", "", 2200);
  }
  function saveNote(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    return pushSaved({ id: uid(), ts: Date.now(), kind: "text", text: t, media: "", from: "You", chat: "", peerId: "" });
  }

  /* chat-list row */
  const chatList = $("#chatList");
  const savedRow = el("div", "list kp-saved-wrap");
  savedRow.id = "kpSavedRow";
  savedRow.innerHTML = '<div class="row kp-saved-row"><div class="row-avatar kp-saved-av">\uD83D\uDD16</div><div class="grow"><b>Saved messages</b><span id="kpSavedPrev"></span></div></div>';
  if (chatList) chatList.before(savedRow);
  savedRow.firstElementChild.addEventListener("click", () => openSaved());
  function paintSavedRow() {
    const last = saved[saved.length - 1];
    $("#kpSavedPrev", savedRow).textContent = last ? (last.kind === "image" ? "\uD83D\uDCF7 Photo" : last.kind === "voice" ? "\uD83C\uDFA4 Voice note" : snip(last.text, 50)) : "Notes, links and photos just for you";
  }
  const chips = $("#chatChips");
  if (chips) chips.addEventListener("click", () => setTimeout(() => { const on = $("button.on", chips); savedRow.hidden = !!(on && on.dataset.f !== "all"); }, 0));

  /* full-screen Saved view (reuses the thread-screen look) */
  const savedScreen = el("section", "thread-screen kp-saved");
  savedScreen.id = "kpSaved"; savedScreen.hidden = true;
  savedScreen.innerHTML =
    '<header class="thread-head">' +
    '<button class="icon-round" id="kpSavedBack" type="button" aria-label="Back">\u2190</button>' +
    '<div class="peer-avatar kp-saved-av">\uD83D\uDD16</div>' +
    '<div class="grow"><strong>Saved messages</strong><small id="kpSavedMeta"></small></div>' +
    '<button class="icon-round call-ico" id="kpSavedSearchBtn" type="button" aria-label="Search saved"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg></button>' +
    "</header>" +
    '<div class="tsearch" id="kpSavedSearch" hidden><input id="kpSavedSearchInput" type="search" placeholder="Search saved messages" autocomplete="off" /><button class="icon-round" id="kpSavedSearchClose" type="button" aria-label="Close search">\u00d7</button></div>' +
    '<div class="kp-saved-list" id="kpSavedList"></div>' +
    '<form class="composer kp-saved-composer" id="kpSavedComposer">' +
    '<button class="icon-round" id="kpSavedAttach" type="button" aria-label="Add photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg></button>' +
    '<input id="kpSavedFile" type="file" accept="image/*" hidden />' +
    '<input id="kpSavedInput" autocomplete="off" placeholder="Save a note, link or idea" />' +
    '<button class="send-btn" type="submit" aria-label="Save"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2L2 14v7z"/></svg></button>' +
    "</form>";
  document.body.appendChild(savedScreen);
  const sList = $("#kpSavedList", savedScreen);
  const sInput = $("#kpSavedInput", savedScreen);
  let sQuery = "";

  function linkify(node, text) {
    const re = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = el("a", "", m[0]);
      a.href = /^www\./i.test(m[0]) ? "https://" + m[0] : m[0];
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.addEventListener("click", (e) => e.stopPropagation());
      node.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }
  function dayText(ts) {
    const d = new Date(ts), n = new Date();
    const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }
  async function copyPlain(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {}
    try {
      const ta = el("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (_) { return false; }
  }
  function paintSaved() {
    sList.textContent = "";
    const q = sQuery.trim().toLowerCase();
    const items = saved.filter((n) => !q || (n.text || "").toLowerCase().includes(q) || (n.from || "").toLowerCase().includes(q) || (n.chat || "").toLowerCase().includes(q));
    $("#kpSavedMeta", savedScreen).textContent = saved.length ? saved.length + (saved.length === 1 ? " saved item" : " saved items") : "Just for you";
    if (!items.length) {
      const e = el("div", "kp-saved-empty");
      e.append(el("div", "kp-saved-empty-ico", "\uD83D\uDD16"), el("p", "", q ? "Nothing matches that search." : "Nothing saved yet"), el("small", "", q ? "" : "Long-press any message and tap Add to Saved, or type a note below. Only you can see this."));
      sList.appendChild(e);
      return;
    }
    let lastDay = "";
    items.forEach((n) => {
      const dt = dayText(n.ts);
      if (dt !== lastDay) { sList.appendChild(el("div", "day-div", dt)); lastDay = dt; }
      const card = el("div", "kp-note");
      if (n.from && (n.from !== "You" || n.chat)) card.appendChild(el("div", "kp-note-from", "\u21AA " + n.from + (n.chat && n.chat !== n.from ? " \u00b7 " + n.chat : "")));
      if (n.kind === "image" && n.media) {
        const im = el("img"); im.src = n.media; im.alt = "Saved photo"; im.loading = "lazy";
        im.addEventListener("click", (e) => { e.stopPropagation(); try { const c = el("img"); c.src = n.media; openLightbox(c); } catch (_) {} });
        card.appendChild(im);
      } else if (n.kind === "voice" && n.media) {
        const a = el("audio"); a.controls = true; a.src = n.media; card.appendChild(a);
      }
      if (n.text) { const p = el("p", "kp-note-text"); linkify(p, n.text); card.appendChild(p); }
      card.appendChild(el("div", "kp-note-meta", new Date(n.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })));
      const act = el("div", "kp-note-act");
      const add = (label, fn, danger) => { const b = el("button", danger ? "danger" : "", label); b.type = "button"; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); act.appendChild(b); };
      if (n.text) add("Copy", async () => toastMsg((await copyPlain(n.text)) ? "Copied" : "Couldn't copy"));
      if (navigator.share && (n.text || n.kind === "image")) add("Share", async () => {
        try {
          if (n.kind === "image" && n.media && /^data:/.test(n.media)) {
            const blob = await (await fetch(n.media)).blob();
            await navigator.share({ files: [new File([blob], "kyro-saved.jpg", { type: blob.type || "image/jpeg" })] });
          } else await navigator.share({ text: n.text });
        } catch (e) { if (!(e && e.name === "AbortError")) toastMsg("Couldn't open the share sheet."); }
      });
      if (n.text) add("Remind me", () => openWhen({ title: "Remind me", text: snip(n.text, 200), cta: "Set reminder", placeholder: "What should I remind you about?", onSave(at, t) { if (!t.trim()) { toastMsg("Add a note for the reminder."); return false; } addRem(t.trim(), at, null); toastMsg("Reminder set for " + fmtWhen(at)); return true; } }));
      if (n.peerId) add("Go to chat", () => {
        const peer = resolvePeer({ id: n.peerId, name: n.chat });
        savedScreen.hidden = true;
        try { openThread(peer); } catch (_) {}
      });
      add("Delete", () => { saved = saved.filter((x) => x.id !== n.id); saveSaved(); paintSavedRow(); paintSaved(); }, true);
      card.appendChild(act);
      card.addEventListener("click", () => card.classList.toggle("open"));
      sList.appendChild(card);
    });
    sList.scrollTop = sList.scrollHeight;
  }
  function openSaved() {
    const sm = $("#settingsClose") && $("#settingsClose").closest(".modal");
    if (sm && !sm.hidden) closeModal(sm.id);
    sQuery = ""; $("#kpSavedSearchInput", savedScreen).value = ""; $("#kpSavedSearch", savedScreen).hidden = true;
    savedScreen.hidden = false;
    paintSaved();
  }
  $("#kpSavedBack", savedScreen).addEventListener("click", () => { savedScreen.hidden = true; });
  $("#kpSavedSearchBtn", savedScreen).addEventListener("click", () => {
    const s = $("#kpSavedSearch", savedScreen); s.hidden = !s.hidden;
    if (!s.hidden) $("#kpSavedSearchInput", savedScreen).focus(); else { sQuery = ""; paintSaved(); }
  });
  $("#kpSavedSearchClose", savedScreen).addEventListener("click", () => { $("#kpSavedSearch", savedScreen).hidden = true; $("#kpSavedSearchInput", savedScreen).value = ""; sQuery = ""; paintSaved(); });
  $("#kpSavedSearchInput", savedScreen).addEventListener("input", (e) => { sQuery = e.target.value; paintSaved(); });
  $("#kpSavedComposer", savedScreen).addEventListener("submit", (e) => {
    e.preventDefault();
    if (saveNote(sInput.value)) sInput.value = "";
  });
  $("#kpSavedAttach", savedScreen).addEventListener("click", () => $("#kpSavedFile", savedScreen).click());
  $("#kpSavedFile", savedScreen).addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const media = await shrinkFile(f);
    if (!media) { toastMsg("Couldn't read that photo."); return; }
    pushSaved({ id: uid(), ts: Date.now(), kind: "image", text: "", media, from: "You", chat: "", peerId: "" });
  });

  /* message long-press menu: Add to Saved + Remind me */
  const sheet = $("#msgActions");
  let actSaved = null, actRemind = null;
  if (sheet) {
    const mk = (id, label, after) => {
      const b = el("button", "sheet-btn", label);
      b.id = id; b.type = "button";
      const ref = $(after, sheet);
      if (ref) ref.after(b); else $(".sheet", sheet).appendChild(b);
      return b;
    };
    actSaved = mk("actKpSave", "Add to Saved", "#actStar");
    actRemind = mk("actKpRemind", "Remind me", "#actKpSave");
    const cur = () => (typeof actionMsg !== "undefined" ? actionMsg : null);
    actSaved.addEventListener("click", () => {
      const c = cur();
      closeModal("msgActions");
      if (c && c.bubble) saveFromBubble(c.bubble);
    });
    actRemind.addEventListener("click", () => {
      const c = cur();
      closeModal("msgActions");
      if (!c || !c.bubble) return;
      const b = c.bubble, p = curPeer();
      const base = b._plain ? snip(b._plain, 160) : (b.querySelector(":scope > img") ? "Photo" : "this message");
      openWhen({
        title: "Remind me", to: p ? "In " + (p.name || "this chat") : "", text: base, at: Date.now() + 3600000,
        cta: "Set reminder", placeholder: "What should I remind you about?",
        onSave(at, t) {
          if (!t.trim()) { toastMsg("Add a note for the reminder."); return false; }
          if (!addRem(t.trim(), at, p)) return false;
          toastMsg("Reminder set for " + fmtWhen(at), "", 3200);
          return true;
        }
      });
    });
  }
  if (typeof window.openModal === "function") {
    const orig = window.openModal;
    window.openModal = function (id) {
      if (id === "msgActions" && actSaved) {
        try {
          const c = typeof actionMsg !== "undefined" ? actionMsg : null;
          const gone = !!(c && c.bubble && c.bubble.dataset.deleted === "1");
          actSaved.hidden = gone; actRemind.hidden = gone;
        } catch (_) {}
      }
      return orig.apply(this, arguments);
    };
  }

  /* settings entries */
  const starBtn = $("#starredBtn");
  if (starBtn) {
    const sv = el("button", "set-link"); sv.id = "kpSavedBtn"; sv.type = "button"; sv.innerHTML = "Saved messages<em>&rsaquo;</em>";
    const sc = el("button", "set-link"); sc.id = "kpSchedSetBtn"; sc.type = "button"; sc.style.marginTop = "8px"; sc.innerHTML = "Scheduled &amp; reminders<em>&rsaquo;</em>";
    sv.style.marginTop = "8px";
    starBtn.after(sv); sv.after(sc);
    sv.addEventListener("click", () => openSaved());
    sc.addEventListener("click", () => {
      const sm = $("#settingsClose") && $("#settingsClose").closest(".modal");
      if (sm && !sm.hidden) closeModal(sm.id);
      openList();
    });
  }

  /* =====================================================================
     Slash commands: /recap  /remind  /schedule  /saved  /commands
     ===================================================================== */
  const CMDS = [
    { n: "recap", alias: ["tldr", "catchup"], d: "Catch up on this chat", fill: "/recap", hint: "Try /recap 50 or /recap today" },
    { n: "remind", alias: ["reminder", "remindme"], d: "Remind yourself", fill: "/remind ", hint: "/remind 20m call mum \u00b7 /remind tomorrow 8am gym \u00b7 /remind 9pm pay rent" },
    { n: "schedule", alias: ["later", "sched"], d: "Send a message later", fill: "/schedule ", hint: "/schedule 9pm happy birthday! \u00b7 /schedule tomorrow 8am good morning" },
    { n: "saved", alias: ["save", "note"], d: "Save a note to yourself", fill: "/saved ", hint: "/saved <note>, or just /saved to open Saved messages" },
    { n: "commands", alias: ["cmds"], d: "Show all commands", fill: "/commands", hint: "" }
  ];
  const findCmd = (w) => CMDS.find((c) => c.n === w || c.alias.includes(w));

  const pop = el("div", "kp-cmd-pop");
  pop.id = "kpCmdPop"; pop.hidden = true;
  if (composer) composer.before(pop);
  function syncPop() {
    const v = input ? input.value : "";
    pop.textContent = "";
    let show = false;
    const m = v.match(/^\/([a-z]*)$/i);
    if (m && !isEditing()) {
      const q = m[1].toLowerCase();
      const hits = CMDS.filter((c) => c.n.startsWith(q) || c.alias.some((a) => a.startsWith(q)));
      hits.forEach((c) => {
        const b = el("button", "kp-cmd");
        b.type = "button";
        b.append(el("b", "", "/" + c.n), el("span", "", c.d));
        b.addEventListener("click", () => { input.value = c.fill; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); });
        pop.appendChild(b);
      });
      show = hits.length > 0;
    } else {
      const m2 = v.match(/^\/([a-z]+)\s/i);
      const c = m2 && findCmd(m2[1].toLowerCase());
      if (c && c.hint) { pop.appendChild(el("span", "kp-cmd-hint", c.hint)); show = true; }
    }
    pop.hidden = !show;
    document.body.classList.toggle("kp-cmd-on", show);
  }
  if (input) input.addEventListener("input", () => { syncPop(); });

  /* local cards (shown only to you, never sent) */
  function card(title, build) {
    const box = $("#messages");
    if (!box) return null;
    const c = el("div", "kp-card");
    const head = el("div", "kp-card-head");
    const x = el("button", "kp-card-x", "\u00d7");
    x.type = "button"; x.setAttribute("aria-label", "Dismiss");
    x.addEventListener("click", () => c.remove());
    head.append(el("b", "", title), x);
    c.appendChild(head);
    build(c);
    c.appendChild(el("div", "kp-card-foot", "Only visible to you \u00b7 built on this device"));
    box.appendChild(c);
    box.scrollTop = box.scrollHeight;
    return c;
  }

  const STOP = new Set(("that this with have from they them then than were been will would could should about there their what when where which while your yours just like also into over some more most very much only even still here dont cant wont yeah okay thanks thank please going gonna want need know think really well back right good make made time tell said says come came look see got get let lets its ive thats youre theyre whats didnt doesnt isnt wasnt arent").split(" "));
  const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const TIME_RE = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|\d{1,2}:\d{2}|tonight|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this weekend|noon|midnight)\b/i;

  function jump(b) {
    try {
      b.scrollIntoView({ block: "center", behavior: "smooth" });
      b.classList.add("flash");
      setTimeout(() => b.classList.remove("flash"), 1300);
    } catch (_) {}
  }

  function recap(arg) {
    const box = $("#messages");
    const p = curPeer();
    if (!box || !p) return;
    const all = [];
    Array.from(box.querySelectorAll(":scope > .bubble")).forEach((b) => {
      if (b.dataset.deleted === "1" || b.classList.contains("kz-gone") || b.dataset.react) return;
      const m = b._m || {};
      const img = b.querySelector(":scope > img");
      let kind = m.kind || "text";
      if (img) kind = (img.naturalWidth === 240 && img.naturalHeight === 240) || b.classList.contains("sticker") ? "sticker" : "image";
      else if (b.querySelector(":scope > audio, :scope .voice")) kind = "voice";
      else if (b.querySelector(":scope > .file-tile")) kind = m.kind === "video" ? "video" : "file";
      all.push({ b, kind, mine: b.classList.contains("me"), text: kind === "text" ? String(b._plain || "") : "", ts: b._ts || 0, sender: b.classList.contains("me") ? "You" : nameOf(b._sender) });
    });
    if (!all.length) { card("Catch-up", (c) => c.appendChild(el("p", "kp-muted", "Nothing to recap yet. This chat is quiet."))); return; }

    let list, label;
    const a = String(arg || "").trim().toLowerCase();
    if (/^\d+$/.test(a)) { const n = Math.min(300, Math.max(5, parseInt(a, 10))); list = all.slice(-n); label = "last " + list.length + " messages"; }
    else if (a === "today") { const t0 = new Date(); t0.setHours(0, 0, 0, 0); list = all.filter((x) => x.ts >= t0.getTime()); label = "today"; }
    else {
      let li = -1;
      for (let i = all.length - 1; i >= 0; i--) if (all[i].mine && all[i].kind === "text") { li = i; break; }
      const after = li >= 0 ? all.slice(li + 1) : [];
      if (after.length >= 3) { list = after; label = "since you last replied"; }
      else { list = all.slice(-30); label = "last " + list.length + " messages"; }
    }
    if (!list.length) { card("Catch-up", (c) => c.appendChild(el("p", "kp-muted", "No messages in that range."))); return; }

    const others = list.filter((x) => !x.mine);
    const counts = { image: 0, voice: 0, file: 0, video: 0 };
    list.forEach((x) => { if (counts[x.kind] != null) counts[x.kind]++; });
    const voices = {};
    others.forEach((x) => { voices[x.sender] = (voices[x.sender] || 0) + 1; });
    const topVoices = Object.entries(voices).sort((x, y) => y[1] - x[1]).slice(0, 3);
    const meFirst = String(typeof meName !== "undefined" ? meName : "").split(/\s+/)[0].toLowerCase();
    const questions = others.filter((x) => x.text.includes("?") && x.text.length > 6).slice(-3);
    const mentions = others.filter((x) => x.b.classList.contains("mentions-me") || (meFirst.length > 1 && x.text.toLowerCase().includes("@" + meFirst))).slice(-3);
    const links = [];
    list.forEach((x) => { (x.text.match(URL_RE) || []).forEach((u) => links.push({ u, x })); });
    const plans = list.filter((x) => x.text && TIME_RE.test(x.text)).slice(-3);
    const freq = {};
    list.forEach((x) => (x.text.toLowerCase().match(/[a-z\u00C0-\u024F]{4,}/g) || []).forEach((w) => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; }));
    const topics = Object.entries(freq).filter((e) => e[1] >= 2).sort((x, y) => y[1] - x[1]).slice(0, 5).map((e) => e[0]);
    const t1 = list[0].ts, t2 = list[list.length - 1].ts;
    const fmtT = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    const plain = [];
    card("Catch-up \u00b7 " + label, (c) => {
      const sum = el("p", "kp-sum");
      sum.textContent = list.length + " messages" + (others.length && topVoices.length > 1 ? " from " + Object.keys(voices).length + " people" : "") + " \u00b7 " + fmtT(t1) + (t2 - t1 > 60000 ? " to " + fmtT(t2) : "");
      c.appendChild(sum);
      plain.push("Catch-up (" + label + ") with " + (p.name || "chat") + ": " + sum.textContent);
      const section = (ico, title) => { const s = el("div", "kp-sec-line"); s.append(el("span", "", ico), el("b", "", title)); c.appendChild(s); plain.push(title + ":"); };
      const item = (x, text) => {
        const b = el("button", "kp-jump");
        b.type = "button";
        b.append(el("small", "", x.sender), el("span", "", snip(text, 110)));
        b.addEventListener("click", () => jump(x.b));
        c.appendChild(b);
        plain.push("- " + x.sender + ": " + snip(text, 110));
      };
      const media = [];
      if (counts.image) media.push("\uD83D\uDCF7 " + counts.image + (counts.image === 1 ? " photo" : " photos"));
      if (counts.voice) media.push("\uD83C\uDFA4 " + counts.voice + (counts.voice === 1 ? " voice note" : " voice notes"));
      if (counts.video) media.push("\uD83C\uDFA5 " + counts.video + (counts.video === 1 ? " video" : " videos"));
      if (counts.file) media.push("\uD83D\uDCC4 " + counts.file + (counts.file === 1 ? " file" : " files"));
      if (media.length) { c.appendChild(el("p", "kp-media", media.join("  \u00b7  "))); plain.push(media.join(", ")); }
      if (topVoices.length > 1) {
        const row = el("div", "kp-voices");
        topVoices.forEach(([n, k]) => row.appendChild(el("span", "kp-pill", n + " " + k)));
        c.appendChild(row);
      }
      if (mentions.length) { section("\uD83D\uDCE3", "Mentions of you"); mentions.forEach((x) => item(x, x.text)); }
      if (questions.length) { section("\u2753", "Questions to answer"); questions.forEach((x) => item(x, x.text)); }
      if (plans.length) { section("\uD83D\uDDD3", "Plans and times"); plans.forEach((x) => item(x, x.text)); }
      if (links.length) {
        section("\uD83D\uDD17", "Links shared");
        links.slice(-4).forEach(({ u }) => {
          const a = el("a", "kp-link", u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").slice(0, 60));
          a.href = /^www\./i.test(u) ? "https://" + u : u; a.target = "_blank"; a.rel = "noopener noreferrer";
          c.appendChild(a);
          plain.push("- " + u);
        });
      }
      if (topics.length) {
        section("\uD83D\uDCAC", "Talked about");
        const row = el("div", "kp-voices");
        topics.forEach((t) => row.appendChild(el("span", "kp-pill soft", t)));
        c.appendChild(row);
        plain.push(topics.join(", "));
      }
      if (!mentions.length && !questions.length && !plans.length && !links.length && !topics.length && !media.length) {
        c.appendChild(el("p", "kp-muted", "Nothing urgent. Just a quiet stretch of chat."));
      }
      const act = el("div", "kp-card-act");
      const sv = el("button", "", "Save recap");
      sv.type = "button";
      sv.addEventListener("click", () => { if (saveNote(plain.join("\n"))) toastMsg("Recap saved \u2713"); });
      act.appendChild(sv);
      c.appendChild(act);
    });
  }

  function helpCard() {
    card("Kyro commands", (c) => {
      CMDS.forEach((x) => {
        const b = el("button", "kp-jump");
        b.type = "button";
        b.append(el("small", "", "/" + x.n), el("span", "", x.d + (x.hint ? " \u2014 " + x.hint.split(" \u00b7 ")[0] : "")));
        b.addEventListener("click", () => { if (input) { input.value = x.fill; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); } });
        c.appendChild(b);
      });
    });
  }

  function runCmd(name, arg) {
    const p = curPeer();
    if (name === "commands") { helpCard(); return; }
    if (name === "saved") {
      if (arg) { if (saveNote(arg)) toastMsg("Saved \u2713", "", 2200); } else openSaved();
      return;
    }
    if (!p) return;
    if (name === "recap") { recap(arg); return; }
    if (name === "remind") {
      if (!arg) { openList(); return; }
      const w = parseWhen(arg);
      if (!w) { card("Couldn't read that time", (c) => c.appendChild(el("p", "kp-muted", "Try /remind 20m call mum, /remind 9pm pay rent, or /remind tomorrow 8am gym."))); return; }
      if (!w.rest) { openWhen({ title: "Remind me", at: w.at, text: "", cta: "Set reminder", placeholder: "What should I remind you about?", onSave(at, t) { if (!t.trim()) { toastMsg("Add a note for the reminder."); return false; } if (!addRem(t.trim(), at, p)) return false; toastMsg("Reminder set for " + fmtWhen(at)); return true; } }); return; }
      if (addRem(w.rest, w.at, p)) toastMsg("\u23F0 Reminder set for " + fmtWhen(w.at), "", 3400);
      return;
    }
    if (name === "schedule") {
      if (!arg) { openList(); return; }
      const w = parseWhen(arg);
      if (!w) { scheduleFromComposer(arg); return; }
      if (!w.rest) { toastMsg("Add the message after the time, like /schedule 9pm happy birthday!"); return; }
      if (addSched(p, w.rest, w.at)) toastMsg("Scheduled for " + fmtWhen(w.at), "", 3400);
    }
  }

  if (composer) {
    composer.addEventListener("submit", (e) => {
      if (!input || isEditing()) return;
      const v = input.value.trim();
      if (!v.startsWith("/")) return;
      const m = v.match(/^\/([a-z]+)\b\s*([\s\S]*)$/i);
      if (!m) return;
      const c = findCmd(m[1].toLowerCase());
      if (!c) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      runCmd(c.n, m[2].trim());
    }, true);
  }

  /* =====================================================================
     Upkeep: paint, timers, boot
     ===================================================================== */
  function paintAll() {
    syncClock();
    paintBanner();
    paintSavedRow();
    if (!list.hidden) paintList();
  }
  const thread = $("#threadScreen");
  if (thread) new MutationObserver(() => { pop.hidden = true; document.body.classList.remove("kp-cmd-on"); paintAll(); }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  setInterval(() => { syncClock(); paintBanner(); }, 1500);

  const tick = () => { tickSched(); tickRem(); };
  setInterval(tick, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  window.addEventListener("online", tick);
  window.addEventListener("focus", tick);
  setTimeout(tick, 3500);
  paintAll();

  window.KyroPlus = { parseWhen, fmtWhen, openSaved, openList, saveNote };
})();
