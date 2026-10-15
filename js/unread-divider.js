/* Kyro unread divider: opening a chat from the list with unread messages shows a "3 unread messages" line
   above the first one and scrolls to it. Uses the app's own unread counts. No data or backend changes.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const list = document.getElementById("chatList");
  const box = document.getElementById("messages");
  if (!list || !box) return;

  let pending = 0, at = 0;
  list.addEventListener("click", (e) => {
    const row = e.target.closest && e.target.closest(".row[data-peer]");
    pending = 0;
    if (!row) return;
    try { pending = typeof unreadCount === "function" ? Number(unreadCount(row.dataset.peer)) || 0 : 0; } catch (_) {}
    at = Date.now();
  }, true);

  new MutationObserver((muts) => {
    if (!pending || Date.now() - at > 15000) { pending = 0; return; }
    let loaded = false;
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains("bubble")) loaded = true; }));
    if (!loaded) return;
    const incoming = Array.from(box.querySelectorAll(".bubble.them")).filter((b) => !b.dataset.react && b.style.display !== "none");
    if (!incoming.length) return;
    const n = Math.min(pending, incoming.length);
    pending = 0;
    const first = incoming[incoming.length - n];
    box.querySelectorAll(".ks-unread").forEach((d) => d.remove());
    const d = document.createElement("div");
    d.className = "ks-unread";
    d.setAttribute("role", "separator");
    d.textContent = n === 1 ? "1 unread message" : n + " unread messages";
    first.before(d);
    d.scrollIntoView({ block: "center" });
  }).observe(box, { childList: true });
})();
