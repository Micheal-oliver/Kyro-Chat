/* Kyro finish: keeps the latest message in view when the on-screen keyboard opens or the window resizes,
   and keeps the message list from jumping when photos finish loading. No data or backend changes.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const box = () => $("#messages");
  const nearBottom = (b) => b.scrollHeight - b.scrollTop - b.clientHeight < 140;

  /* 1) Keyboard / resize: if you were at the bottom, stay at the bottom */
  let wasNear = true;
  function remember() { const b = box(); if (b) wasNear = nearBottom(b); }
  function stick() {
    const b = box();
    if (!b || !wasNear) return;
    requestAnimationFrame(() => { b.scrollTop = b.scrollHeight; });
  }
  function bindScroll() {
    const b = box();
    if (!b) return setTimeout(bindScroll, 500);
    b.addEventListener("scroll", remember, { passive: true });
  }
  bindScroll();
  const vv = window.visualViewport;
  if (vv) {
    let last = vv.height;
    vv.addEventListener("resize", () => { if (Math.abs(vv.height - last) > 60) stick(); last = vv.height; });
  } else window.addEventListener("resize", stick);
  document.addEventListener("focusin", (e) => { if (e.target && e.target.id === "messageInput") { remember(); setTimeout(stick, 280); } });

  /* 2) Photos that finish loading below the fold must not shove the view: re-pin to the bottom if we were there */
  function watchImages() {
    const b = box();
    if (!b) return setTimeout(watchImages, 500);
    b.addEventListener("load", (e) => {
      if (e.target && e.target.tagName === "IMG" && wasNear) b.scrollTop = b.scrollHeight;
    }, true);
  }
  watchImages();
})();
