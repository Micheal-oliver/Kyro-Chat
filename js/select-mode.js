/* Kyro multi-select: pick one or many messages, then act on them from a top bar
   (reply, copy, star, forward, pin, delete). Start it with "Select" in the message menu.
   Uses KyroMsg.askDelete from msg-tools.js and the existing actions in app.js. Remove the <script> and <link> in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const say = (t) => { try { toast(t); } catch (_) {} };
  const buzz = (n) => { try { navigator.vibrate && navigator.vibrate(n); } catch (_) {} };

  const thread = $("#threadScreen");
  const box = $("#messages");
  const sheet = $("#msgActions");
  const head = thread && $(".thread-head", thread);
  if (!thread || !box || !sheet || !head) return;

  const ICON = {
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    forward: '<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
    pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>";

  /* ---------- "Select" tile in the message menu ---------- */
  const selBtn = document.createElement("button");
  selBtn.type = "button"; selBtn.className = "sheet-btn"; selBtn.id = "kzSelectBtn"; selBtn.textContent = "Select";
  const after = $("#actSave", sheet) || $("#actForward", sheet);
  if (after) after.after(selBtn); else sheet.querySelector(".sheet").appendChild(selBtn);

  /* ---------- top bar ---------- */
  const bar = document.createElement("div");
  bar.className = "kzs-bar";
  bar.hidden = true;
  bar.innerHTML =
    '<button type="button" class="kzs-b" data-a="exit" aria-label="Cancel selection">' + svg("x") + "</button>" +
    '<span class="kzs-count"><b id="kzsN">1</b><small>selected</small></span>' +
    '<span class="kzs-sp"></span>' +
    '<button type="button" class="kzs-b" data-a="reply" aria-label="Reply">' + svg("reply") + "</button>" +
    '<button type="button" class="kzs-b" data-a="copy" aria-label="Copy">' + svg("copy") + "</button>" +
    '<button type="button" class="kzs-b" data-a="star" aria-label="Star">' + svg("star") + "</button>" +
    '<button type="button" class="kzs-b" data-a="forward" aria-label="Forward">' + svg("forward") + "</button>" +
    '<button type="button" class="kzs-b" data-a="pin" aria-label="Pin">' + svg("pin") + "</button>" +
    '<button type="button" class="kzs-b kzs-del" data-a="delete" aria-label="Delete">' + svg("trash") + "</button>";
  thread.appendChild(bar);

  const sel = new Set();
  let on = false;
  const ordered = () => Array.from(box.querySelectorAll(".bubble.kz-sel"));
  const mOf = (b) => b._m || { kind: "text", text: b._plain || "" };
  const show = (a, v) => { const n = $('[data-a="' + a + '"]', bar); if (n) n.hidden = !v; };

  function refresh() {
    const list = ordered();
    const n = list.length;
    $("#kzsN", bar).textContent = String(n);
    const one = n === 1;
    show("reply", one);
    show("forward", one);
    show("pin", one && !!$("#kxPinBtn"));
    show("copy", list.some((b) => b._plain));
    show("star", list.some((b) => b.dataset.id));
    show("delete", n > 0);
    if (!n) exit();
  }

  function place() {
    const cs = getComputedStyle(head);
    bar.style.height = head.offsetHeight + "px";
    bar.style.paddingTop = cs.paddingTop;
    bar.style.paddingLeft = cs.paddingLeft;
    bar.style.paddingRight = cs.paddingRight;
  }

  function enter(bubble) {
    if (!on) {
      on = true;
      place();
      bar.hidden = false;
      void bar.offsetWidth;
      bar.classList.add("kzs-on");
      document.body.classList.add("kz-selecting");
    }
    toggle(bubble, true);
  }

  function toggle(bubble, force) {
    if (!bubble || bubble.dataset.react === "1" || bubble.dataset.deleted === "1") return;
    const want = typeof force === "boolean" ? force : !bubble.classList.contains("kz-sel");
    bubble.classList.toggle("kz-sel", want);
    buzz(6);
    refresh();
  }

  function exit() {
    if (!on) return;
    on = false;
    box.querySelectorAll(".bubble.kz-sel").forEach((b) => b.classList.remove("kz-sel"));
    document.body.classList.remove("kz-selecting");
    bar.classList.remove("kzs-on");
    setTimeout(() => { if (!on) bar.hidden = true; }, 260);
  }

  /* ---------- while selecting, taps pick messages instead of opening them ---------- */
  const block = (e) => { if (on) e.stopPropagation(); };
  ["touchstart", "mousedown", "dblclick", "contextmenu"].forEach((t) => box.addEventListener(t, block, true));
  box.addEventListener("click", (e) => {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    const b = e.target.closest && e.target.closest(".bubble");
    if (b && box.contains(b)) toggle(b);
  }, true);

  selBtn.addEventListener("click", () => {
    const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
    closeModal("msgActions");
    if (cur && cur.bubble) enter(cur.bubble);
  });
  if (typeof window.openModal === "function") {
    const orig = window.openModal;
    window.openModal = function (id) {
      if (id === "msgActions") {
        const cur = typeof actionMsg !== "undefined" ? actionMsg : null;
        selBtn.hidden = !!(cur && cur.bubble && cur.bubble.dataset.deleted === "1");
      }
      return orig.apply(this, arguments);
    };
  }

  /* ---------- actions ---------- */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (_) { return false; }
  }
  const asAction = (b) => { actionMsg = { bubble: b, m: mOf(b) }; };

  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-a]");
    if (!btn) return;
    const a = btn.dataset.a;
    const list = ordered();
    if (a === "exit") { exit(); return; }
    if (!list.length) return;

    if (a === "reply") {
      const b = list[0];
      exit();
      if (typeof startReply === "function") startReply(b, mOf(b));
    } else if (a === "copy") {
      const text = list.map((b) => b._plain).filter(Boolean).join("\n");
      exit();
      say((await copyText(text)) ? "Copied" : "Couldn't copy. Select the text instead.");
    } else if (a === "star") {
      const items = list.filter((b) => b.dataset.id);
      exit();
      items.forEach((b) => { asAction(b); const s = $("#actStar"); if (s) s.click(); });
      say(items.length > 1 ? "Updated stars on " + items.length + " messages" : "Star updated");
    } else if (a === "forward") {
      const b = list[0];
      exit();
      asAction(b);
      const f = $("#actForward"); if (f) f.click();
    } else if (a === "pin") {
      const b = list[0];
      exit();
      asAction(b);
      const p = $("#kxPinBtn"); if (p) p.click();
    } else if (a === "delete") {
      exit();
      if (window.KyroMsg && KyroMsg.askDelete) KyroMsg.askDelete(list);
    }
  });

  /* leave selection when the chat closes, on Escape, or when the window changes size */
  new MutationObserver(() => { if (thread.hidden) exit(); }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && on) exit(); });
  window.addEventListener("resize", () => { if (on) place(); });
  const back = $("#backChat");
  if (back) back.addEventListener("click", exit, true);
})();
