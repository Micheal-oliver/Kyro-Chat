(() => {
  const K = {
    hash: "kyro.lock.hash",
    salt: "kyro.lock.salt",
    delay: "kyro.lock.delay",
    fails: "kyro.lock.fails",
    until: "kyro.lock.until"
  };
  const PIN_LEN = 4;
  const MAX_FAILS = 5;

  const get = (k, d = "") => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const del = (k) => { try { localStorage.removeItem(k); } catch (_) {} };

  const enabled = () => !!get(K.hash);
  const delaySec = () => { const n = parseInt(get(K.delay, "60"), 10); return Number.isFinite(n) ? n : 60; };

  function randomSalt() {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPin(pin, salt) {
    if (window.crypto && crypto.subtle) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" },
        key, 256
      );
      return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback for non-secure origins (no crypto.subtle): weaker, but keeps the lock working
    let h = 5381;
    const s = salt + ":" + pin;
    for (let r = 0; r < 5000; r++) for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "f" + (h >>> 0).toString(16);
  }

  async function verify(pin) {
    return (await hashPin(pin, get(K.salt))) === get(K.hash);
  }

  async function setPin(pin) {
    const salt = randomSalt();
    set(K.salt, salt);
    set(K.hash, await hashPin(pin, salt));
    del(K.fails);
    del(K.until);
  }

  function disable() {
    del(K.hash); del(K.salt); del(K.fails); del(K.until);
  }

  // ---------- Overlay ----------
  let overlay = null;
  let busy = false;
  let pending = null; // { resolve, validate, cancelable }
  let entry = "";

  function build() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "kyroLock";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="lock-card">' +
      '<div class="lock-ico">\uD83D\uDD12</div>' +
      '<h2 class="lock-title">Kyro Chat</h2>' +
      '<p class="lock-sub"></p>' +
      '<div class="lock-dots">' + '<i></i>'.repeat(PIN_LEN) + '</div>' +
      '<p class="lock-err" aria-live="polite"></p>' +
      '<div class="lock-pad"></div>' +
      '<button type="button" class="lock-link" id="lockForgot">Forgot PIN? Log out</button>' +
      '<button type="button" class="lock-link" id="lockCancel">Cancel</button>' +
      '</div>';
    const pad = overlay.querySelector(".lock-pad");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "\u232B"].forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lock-key" + (k ? "" : " blank");
      b.textContent = k;
      if (!k) b.disabled = true;
      b.addEventListener("click", () => press(k));
      pad.appendChild(b);
    });
    overlay.querySelector("#lockCancel").addEventListener("click", () => finish(null));
    overlay.querySelector("#lockForgot").addEventListener("click", () => {
      if (!confirm("Logging out removes the app lock on this device. Continue?")) return;
      disable();
      try { Kyro.clearSession(); } catch (_) {}
      location.replace("login.html");
    });
    document.addEventListener("keydown", (e) => {
      if (!overlay || overlay.hidden) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("\u232B");
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function paintDots() {
    overlay.querySelectorAll(".lock-dots i").forEach((d, i) => d.classList.toggle("on", i < entry.length));
  }

  function setErr(msg, shake) {
    const el = overlay.querySelector(".lock-err");
    el.textContent = msg || "";
    if (shake) {
      const dots = overlay.querySelector(".lock-dots");
      dots.classList.remove("shake");
      void dots.offsetWidth;
      dots.classList.add("shake");
      if (navigator.vibrate) navigator.vibrate(80);
    }
  }

  function finish(pin) {
    if (!pending) return;
    const p = pending;
    pending = null;
    entry = "";
    overlay.hidden = true;
    document.documentElement.classList.remove("kyro-locked");
    p.resolve(pin);
  }

  function lockedFor() {
    const until = parseInt(get(K.until, "0"), 10) || 0;
    return Math.max(0, until - Date.now());
  }

  async function press(k) {
    if (!pending || busy) return;
    if (lockedFor() > 0) { setErr("Too many attempts. Try again in " + Math.ceil(lockedFor() / 1000) + "s", true); return; }
    if (k === "\u232B") { entry = entry.slice(0, -1); paintDots(); return; }
    if (entry.length >= PIN_LEN) return;
    entry += k;
    paintDots();
    if (entry.length < PIN_LEN) return;
    busy = true;
    const pin = entry;
    const result = await pending.validate(pin);
    busy = false;
    if (result === true) { finish(pin); return; }
    entry = "";
    paintDots();
    setErr(typeof result === "string" ? result : "Wrong PIN", true);
  }

  // ask for a PIN; resolves with the PIN, or null if cancelled
  function ask({ title, sub, cancelable, validate, forgot }) {
    build();
    return new Promise((resolve) => {
      pending = { resolve, validate: validate || (async () => true), cancelable: !!cancelable };
      entry = "";
      paintDots();
      overlay.querySelector(".lock-title").textContent = title || "Kyro Chat";
      overlay.querySelector(".lock-sub").textContent = sub || "";
      overlay.querySelector("#lockCancel").hidden = !cancelable;
      overlay.querySelector("#lockForgot").hidden = !forgot;
      setErr("");
      overlay.hidden = false;
      document.documentElement.classList.add("kyro-locked");
    });
  }

  async function unlockCheck(pin) {
    const wait = lockedFor();
    if (wait > 0) return "Too many attempts. Try again in " + Math.ceil(wait / 1000) + "s";
    if (await verify(pin)) { del(K.fails); del(K.until); return true; }
    const fails = (parseInt(get(K.fails, "0"), 10) || 0) + 1;
    set(K.fails, String(fails));
    if (fails >= MAX_FAILS) {
      const ms = Math.min(15 * 60 * 1000, 30000 * Math.pow(2, fails - MAX_FAILS));
      set(K.until, String(Date.now() + ms));
      return "Too many attempts. Try again in " + Math.ceil(ms / 1000) + "s";
    }
    return "Wrong PIN (" + (MAX_FAILS - fails) + " left before a timeout)";
  }

  let locking = false;
  async function lockNow() {
    if (!enabled() || locking || pending) return;
    locking = true;
    await ask({ title: "Kyro Chat is locked", sub: "Enter your PIN", cancelable: false, forgot: true, validate: unlockCheck });
    locking = false;
  }

  // ---------- Flows used by Settings ----------
  async function createFlow() {
    const first = await ask({ title: "Create a PIN", sub: PIN_LEN + " digits to unlock Kyro Chat", cancelable: true });
    if (!first) return false;
    const second = await ask({
      title: "Confirm your PIN", sub: "Enter it once more", cancelable: true,
      validate: async (p) => (p === first ? true : "PINs don't match")
    });
    if (!second) return false;
    await setPin(first);
    return true;
  }

  async function verifyFlow(title) {
    const p = await ask({ title: title || "Enter your PIN", sub: "", cancelable: true, validate: unlockCheck });
    return !!p;
  }

  // ---------- Auto-lock when the app returns from the background ----------
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (enabled() && hiddenAt && Date.now() - hiddenAt >= delaySec() * 1000) lockNow();
    hiddenAt = 0;
  });

  // ---------- Chat lock PIN (separate from the app PIN; protects chats you choose to lock) ----------
  const CK = { hash: "kyro.clock.hash", salt: "kyro.clock.salt", fails: "kyro.clock.fails", until: "kyro.clock.until" };
  const chatPinSet = () => !!get(CK.hash);
  const chatWait = () => Math.max(0, (parseInt(get(CK.until, "0"), 10) || 0) - Date.now());
  async function chatCheck(pin) {
    const wait = chatWait();
    if (wait > 0) return "Too many attempts. Try again in " + Math.ceil(wait / 1000) + "s";
    if ((await hashPin(pin, get(CK.salt))) === get(CK.hash)) { del(CK.fails); del(CK.until); return true; }
    const fails = (parseInt(get(CK.fails, "0"), 10) || 0) + 1;
    set(CK.fails, String(fails));
    if (fails >= MAX_FAILS) {
      const ms = Math.min(15 * 60 * 1000, 30000 * Math.pow(2, fails - MAX_FAILS));
      set(CK.until, String(Date.now() + ms));
      return "Too many attempts. Try again in " + Math.ceil(ms / 1000) + "s";
    }
    return "Wrong PIN (" + (MAX_FAILS - fails) + " left before a timeout)";
  }
  async function chatPinCreate() {
    const first = await ask({ title: "Create a chat lock PIN", sub: PIN_LEN + " digits to open your locked chats", cancelable: true });
    if (!first) return false;
    const second = await ask({ title: "Confirm your PIN", sub: "Enter it once more", cancelable: true, validate: async (p) => (p === first ? true : "PINs don't match") });
    if (!second) return false;
    const salt = randomSalt();
    set(CK.salt, salt);
    set(CK.hash, await hashPin(first, salt));
    del(CK.fails); del(CK.until);
    return true;
  }
  async function chatPinUnlock(title) {
    const p = await ask({ title: title || "Locked chats", sub: "Enter your chat lock PIN", cancelable: true, validate: chatCheck });
    return !!p;
  }
  async function chatPinChange() {
    if (!(await chatPinUnlock("Enter current PIN"))) return false;
    return chatPinCreate();
  }

  window.KyroLock = { enabled, lockNow, disable, setPin, verify, chatPinSet, chatPinCreate, chatPinUnlock, chatPinChange };

  // Lock straight away on page load, before the app builds
  const start = () => {
    document.addEventListener("DOMContentLoaded", wireSettings, { once: true });
    if (enabled()) lockNow();
  };

  function wireSettings() {
    const sw = document.getElementById("setLock");
    const opts = document.getElementById("lockOpts");
    const sel = document.getElementById("lockDelay");
    const change = document.getElementById("lockChangeBtn");
    if (!sw) return;
    const sync = () => { sw.checked = enabled(); if (opts) opts.hidden = !enabled(); if (sel) sel.value = String(delaySec()); };
    sync();
    sw.addEventListener("change", async () => {
      if (sw.checked) {
        const ok = await createFlow();
        if (!ok) { sw.checked = false; return; }
      } else {
        const ok = await verifyFlow("Enter PIN to turn off");
        if (!ok) { sw.checked = true; return; }
        disable();
      }
      sync();
    });
    if (sel) sel.addEventListener("change", () => set(K.delay, sel.value));
    if (change) change.addEventListener("click", async () => {
      if (!(await verifyFlow("Enter current PIN"))) return;
      await createFlow();
    });
  }

  if (document.readyState === "loading") start();
  else { wireSettings(); if (enabled()) lockNow(); }
})();
