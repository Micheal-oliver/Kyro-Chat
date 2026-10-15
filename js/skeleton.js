/* Kyro skeleton upgrade: slow-server note, and placeholders where the app only showed plain "Loading...".
   No data or backend changes. Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const WAIT_MS = 4000;
  const NOTE = "Waking up the server… the first load can take a moment.";

  const rows = (n) => {
    let h = "";
    for (let i = 0; i < n; i++) {
      h += '<div class="skel-row"><div class="skel av"></div><div style="flex:1"><div class="skel ln" style="width:' +
        (48 + (i * 13) % 30) + '%"></div><div class="skel ln" style="width:' + (70 - (i * 9) % 25) + '%;height:10px"></div></div></div>';
    }
    return h;
  };

  /* 1. Note appears only if placeholders are still showing after a few seconds (free servers sleep) */
  function watch(box, selector, place) {
    if (!box) return;
    let timer = null, note = null;
    const showing = () => !!box.querySelector(selector);
    const clear = () => { clearTimeout(timer); timer = null; if (note) { note.remove(); note = null; } };
    const check = () => {
      if (!showing()) { clear(); return; }
      if (timer || note) return;
      timer = setTimeout(() => {
        timer = null;
        if (!showing() || note) return;
        note = document.createElement("p");
        note.className = "ks-wake";
        note.textContent = NOTE;
        place(box, note);
      }, WAIT_MS);
    };
    new MutationObserver(check).observe(box, { childList: true });
    check();
  }
  watch($("#chatList"), ".skel-row", (box, n) => box.insertAdjacentElement("afterend", n));
  watch($("#messages"), ".skel-bubble", (box, n) => box.appendChild(n));

  /* 2. Replace plain "Loading..." text with placeholders in lists that had none */
  ["blockedList", "galBody"].forEach((id) => {
    const box = document.getElementById(id);
    if (!box) return;
    const swap = () => {
      const h = box.firstElementChild;
      if (h && h.classList.contains("hint") && h.textContent.trim() === "Loading...") box.innerHTML = rows(3);
    };
    new MutationObserver(swap).observe(box, { childList: true });
    swap();
  });
})();
