/* Kyro ticks: drawn sending / sent / delivered / seen marks. "Seen" turns bright white with a glow.
   Real "delivered" needs the updated backend. */
(() => {
  const box = document.getElementById("messages");
  if (!box) return;
  const LABEL = { sending: "Sending", sent: "Sent", delivered: "Delivered", seen: "Seen" };
  let queued = new Set(), raf = 0;

  function stateOf(b, t) {
    if (t.classList.contains("seen")) return "seen";
    if (!b.dataset.id) return "sending";
    return t.textContent.indexOf("\u2713\u2713") >= 0 ? "delivered" : "sent";
  }
  function paint(b) {
    const t = b.querySelector(".ticks");
    if (!t) return;
    const s = stateOf(b, t), prev = t.dataset.s;
    if (prev === s) return;
    t.dataset.s = s;
    t.setAttribute("aria-label", LABEL[s]);
    if (prev && prev !== "seen" && s === "seen") {
      t.classList.add("kx-pop");
      setTimeout(() => t.classList.remove("kx-pop"), 900);
    }
  }
  function flush() { raf = 0; queued.forEach(paint); queued = new Set(); }
  function queue(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const b = el && el.closest && el.closest(".bubble.me");
    if (b) { queued.add(b); if (!raf) raf = requestAnimationFrame(flush); }
  }
  new MutationObserver((list) => list.forEach((m) => {
    queue(m.target);
    m.addedNodes.forEach((n) => { queue(n); if (n.nodeType === 1 && n.querySelectorAll) n.querySelectorAll(".bubble.me").forEach(queue); });
  })).observe(box, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "data-id"] });
  box.querySelectorAll(".bubble.me").forEach(queue);

  // Delivered updates from the server
  function markDelivered(b) {
    const t = b.querySelector(".ticks");
    if (t && !t.classList.contains("seen") && t.textContent.indexOf("\u2713\u2713") < 0) t.textContent = "\u2713\u2713";
  }
  let hooked = null;
  setInterval(() => {
    const s = window.kyroSocket;
    if (!s || s === hooked || typeof s.on !== "function") return;
    hooked = s;
    s.on("message-delivered", (d) => {
      const b = d && [...box.querySelectorAll(".bubble.me")].find((x) => x.dataset.id === String(d.id));
      if (b) markDelivered(b);
    });
    s.on("messages-delivered", (d) => {
      if (typeof currentPeer !== "undefined" && currentPeer && d && String(d.otherUserId) === String(currentPeer.id)) box.querySelectorAll(".bubble.me").forEach(markDelivered);
    });
  }, 2000);
})();
