/* Kyro extras: accent themes, emoji bursts, offline banner, haptics, install card. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  /* ---------- Accent themes ---------- */
  const ACCENTS = [
    { id: "aurora", name: "Aurora", a: "#9b6dff", b: "#3ce7ff" },
    { id: "ember",  name: "Ember",  a: "#ff7a45", b: "#ffc857" },
    { id: "mint",   name: "Mint",   a: "#22c58b", b: "#7df3d0" },
    { id: "rose",   name: "Rose",   a: "#ff5c93", b: "#ffb199" },
    { id: "mono",   name: "Mono",   a: "#cbd5e1", b: "#f1f5f9" }
  ];
  const KEY = "kyro.accent";
  function applyAccent(id) {
    const x = ACCENTS.find((v) => v.id === id) || ACCENTS[0];
    const root = document.documentElement.style;
    root.setProperty("--purple", x.a);
    root.setProperty("--cyan", x.b);
    return x.id;
  }
  let current = applyAccent(localStorage.getItem(KEY) || "aurora");

  function buildLookCard() {
    const acct = $('[data-tab="account"]');
    if (!acct || $("#kxLook")) return;
    const card = document.createElement("div");
    card.className = "kx-card";
    card.id = "kxLook";
    card.innerHTML = '<h3>Accent colour</h3><p>Changes buttons, sent bubbles and highlights.</p><div class="kx-swatches" role="radiogroup" aria-label="Accent colour"></div>';
    const wrap = $(".kx-swatches", card);
    ACCENTS.forEach((x) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "kx-sw"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(x.id === current));
      b.setAttribute("aria-label", x.name);
      b.style.setProperty("--a", x.a); b.style.setProperty("--b", x.b);
      b.innerHTML = "<span>" + x.name + "</span>";
      b.addEventListener("click", () => {
        current = applyAccent(x.id);
        localStorage.setItem(KEY, current);
        wrap.querySelectorAll(".kx-sw").forEach((n) => n.setAttribute("aria-checked", String(n === b)));
        buzz(12);
      });
      wrap.appendChild(b);
    });
    const anchor = $("#settingsBtn", acct);
    anchor ? acct.insertBefore(card, anchor) : acct.appendChild(card);
    buildInstallCard(card);
  }

  /* ---------- Install card (PWA) ---------- */
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; showInstall(); });
  function buildInstallCard(after) {
    if (matchMedia("(display-mode: standalone)").matches || $("#kxInstall")) return;
    const card = document.createElement("div");
    card.className = "kx-card"; card.id = "kxInstall"; card.hidden = true;
    card.innerHTML = '<h3>Install Kyro</h3><p>Open it from your home screen like a normal app.</p><button class="btn btn-ghost kx-install" type="button">Install app</button>';
    $("button", card).addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; card.hidden = true;
    });
    after.after(card);
    if (deferred) showInstall();
  }
  function showInstall() { const c = $("#kxInstall"); if (c) c.hidden = false; }

  /* ---------- Offline banner ---------- */
  const bar = document.createElement("div");
  bar.className = "kx-offline"; bar.setAttribute("role", "status");
  document.body.appendChild(bar);
  let hideT;
  function net(on) {
    clearTimeout(hideT);
    bar.classList.toggle("back", on);
    bar.textContent = on ? "Back online" : "You're offline. Messages will wait until you reconnect.";
    bar.classList.add("on");
    if (on) hideT = setTimeout(() => bar.classList.remove("on"), 2200);
  }
  addEventListener("offline", () => net(false));
  addEventListener("online", () => net(true));
  if (!navigator.onLine) net(false);

  /* ---------- Emoji bursts for fresh, emoji-only messages ---------- */
  const BURSTS = { "🎉": ["🎉", "✨", "🎊"], "🥳": ["🎉", "🎊", "🥳"], "🔥": ["🔥", "✨"], "❤️": ["❤️", "💜", "💖"], "💜": ["💜", "💖"], "🎂": ["🎂", "🎉", "🎈"], "💯": ["💯", "✨"] };
  function burst(set) {
    if (reduce) return;
    const layer = document.createElement("div");
    layer.className = "kx-burst";
    document.body.appendChild(layer);
    const w = innerWidth, h = innerHeight;
    for (let i = 0; i < 26; i++) {
      const p = document.createElement("i");
      p.textContent = set[i % set.length];
      p.style.left = 10 + Math.random() * 80 + "vw";
      p.style.top = h * 0.75 + "px";
      p.style.fontSize = 18 + Math.random() * 20 + "px";
      layer.appendChild(p);
      const dx = (Math.random() - 0.5) * w * 0.5, rise = h * (0.35 + Math.random() * 0.4);
      p.animate(
        [{ transform: "translate(0,0) rotate(0)", opacity: 1 },
         { transform: "translate(" + dx + "px," + -rise + "px) rotate(" + (Math.random() * 360 - 180) + "deg)", opacity: 0 }],
        { duration: 1400 + Math.random() * 900, easing: "cubic-bezier(.2,.7,.3,1)", delay: Math.random() * 250, fill: "forwards" }
      );
    }
    setTimeout(() => layer.remove(), 3000);
  }
  function watchMessages() {
    const box = $("#messages");
    if (!box) return;
    new MutationObserver((list) => {
      for (const m of list) m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || !n.classList.contains("bubble")) return;
        if (Date.now() - (n._ts || 0) > 5000) return; // history load, not a live message
        const t = n.firstElementChild && n.firstElementChild.textContent.trim();
        if (t && BURSTS[t]) burst(BURSTS[t]);
      });
    }).observe(box, { childList: true });
  }

  /* ---------- Haptics ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest(".tab, .fab, .send-btn")) buzz(8);
  }, { passive: true });

  /* ---------- PWA registration ---------- */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  buildLookCard();
  watchMessages();
})();
