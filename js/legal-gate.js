/* Kyro legal gate: people who already have an account must accept the Terms and Privacy Policy before using the app.
   New sign-ups tick the box on the sign-up page (that acceptance is carried over, so they are not asked twice).
   Re-asks everyone whenever `version` in js/legal-config.js changes. Acceptance is stored on this device, per account.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const L = window.KYRO_LEGAL || {};
  const V = String(L.version || "1");
  const ME = () => String(typeof meId !== "undefined" ? meId : "");
  const KEY = (id) => "kyro.legal.accepted." + id;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };

  function accepted(id) { const r = read(KEY(id)); return !!(r && r.v === V); }
  function adoptSignup(id) {
    const p = read("kyro.legal.pending");
    if (p && p.v === V && Date.now() - p.at < 24 * 3600 * 1000) {
      try { localStorage.setItem(KEY(id), JSON.stringify({ v: V, at: p.at, via: "signup" })); localStorage.removeItem("kyro.legal.pending"); } catch (_) {}
      return true;
    }
    return false;
  }
  function show(id) {
    if (document.getElementById("klGate")) return;
    const g = document.createElement("div");
    g.className = "kl-gate"; g.id = "klGate";
    g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "klTitle");
    g.innerHTML =
      '<div class="kl-card"><img src="images/icon-192.png" alt="" />' +
      '<h2 id="klTitle">Before you continue</h2>' +
      '<p>Please review how Kyro Chat works and how your information is handled.</p>' +
      '<ul><li>Text messages are end-to-end encrypted. Photos, voice notes and files are not yet.</li>' +
      '<li>We don\u2019t sell your data or show ads.</li>' +
      '<li>You must be ' + (L.minAge || 13) + ' or older.</li></ul>' +
      '<p>Read our <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
      '<button class="kl-btn" id="klAgree" type="button">I agree and continue</button>' +
      '<button class="kl-btn ghost" id="klOut" type="button">Log out instead</button></div>';
    document.body.appendChild(g);
    const agree = g.querySelector("#klAgree");
    agree.focus();
    agree.addEventListener("click", () => {
      try { localStorage.setItem(KEY(id), JSON.stringify({ v: V, at: Date.now(), via: "app" })); } catch (_) {}
      g.remove();
    });
    g.querySelector("#klOut").addEventListener("click", () => {
      const out = document.getElementById("logoutBtn");
      g.remove();
      if (out) out.click();
    });
    g.addEventListener("keydown", (e) => { if (e.key === "Tab") { const f = g.querySelectorAll("a,button"); const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } });
  }
  let tries = 0;
  (function wait() {
    const id = ME();
    if (!id) { if (++tries < 80) setTimeout(wait, 300); return; }
    if (!accepted(id) && !adoptSignup(id)) show(id);
  })();
})();
