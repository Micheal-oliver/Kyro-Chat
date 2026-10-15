/* Kyro round video messages (Telegram-style circles).
   Record: camera-circle button next to the mic. Play: round, autoplay muted loop, tap for sound with a progress ring.
   Sent as a normal video message (fileName "kyro-round.*") so the server needs no change. Remove the <script> and <link> in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const say = (t) => { try { toast(t); } catch (_) {} };
  const buzz = (n) => { try { navigator.vibrate && navigator.vibrate(n); } catch (_) {} };
  const MAX_SEC = 60;
  const MAIN = "kyro-round";
  const RING = 2 * Math.PI * 47;

  const composer = $("#composer");
  const recBtn = $("#recBtn");
  const box = $("#messages");
  if (!composer || !recBtn || !box) return;

  /* ---------------- player (turns round videos in the chat into circles) ---------------- */
  const isRound = (bubble) => {
    const b = bubble.querySelector(":scope > .file-tile .file-info b");
    return !!b && b.textContent.indexOf(MAIN) === 0;
  };

  function ringSvg() {
    return '<svg class="rv-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" class="rv-ring-bg"/><circle cx="50" cy="50" r="47" class="rv-ring-fg" stroke-dasharray="' + RING.toFixed(2) + '" stroke-dashoffset="' + RING.toFixed(2) + '"/></svg>';
  }

  function upgrade(bubble) {
    if (bubble.dataset.rv === "1" || !isRound(bubble)) return;
    bubble.dataset.rv = "1";
    const tile = bubble.querySelector(":scope > .file-tile");
    bubble.classList.add("rv-bubble");

    const wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "rv-wrap";
    wrap.setAttribute("aria-label", "Play round video");
    wrap.innerHTML = '<span class="rv-circle"><span class="rv-poster"><i class="rv-play"></i></span></span>' + ringSvg();
    tile.replaceWith(wrap);
    const circle = $(".rv-circle", wrap);
    const fg = $(".rv-ring-fg", wrap);
    let v = null;
    let loading = false;

    const attach = (src) => {
      v = document.createElement("video");
      v.src = src;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.className = "rv-video";
      v.addEventListener("timeupdate", () => {
        if (!v.duration || !isFinite(v.duration)) return;
        fg.style.strokeDashoffset = String(RING * (1 - v.currentTime / v.duration));
      });
      circle.appendChild(v);
      wrap.classList.add("rv-ready");
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    };

    const load = async () => {
      if (v || loading) return;
      loading = true;
      wrap.classList.add("rv-loading");
      let src = bubble._media || "";
      if (!src && typeof getBubbleMedia === "function") {
        try { src = await getBubbleMedia(bubble, { _id: bubble.dataset.id }); } catch (_) {}
      }
      loading = false;
      wrap.classList.remove("rv-loading");
      if (!src) { say("Couldn't load that video. Tap to retry."); return; }
      attach(src);
    };

    /* your own videos already have their data, so they start right away; received ones load when tapped */
    if (bubble._media) attach(bubble._media);

    wrap.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!v) { await load(); if (v) { v.muted = false; v.currentTime = 0; wrap.classList.add("rv-sound"); } return; }
      if (v.muted) { v.muted = false; v.currentTime = 0; wrap.classList.add("rv-sound"); const p = v.play(); if (p && p.catch) p.catch(() => {}); return; }
      if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); wrap.classList.remove("rv-paused"); }
      else { v.pause(); wrap.classList.add("rv-paused"); }
    });
  }

  const scan = (node) => { if (node && node.nodeType === 1 && node.classList.contains("bubble")) upgrade(node); };
  new MutationObserver((list) => list.forEach((r) => r.addedNodes.forEach(scan))).observe(box, { childList: true });
  Array.from(box.children).forEach(scan);

  /* ---------------- recorder ---------------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-round rv-btn";
  btn.id = "rvBtn";
  btn.setAttribute("aria-label", "Record round video");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/></svg>';
  recBtn.before(btn);

  let S = null; // recorder state

  function pickMime() {
    const list = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  async function openCamera(facing) {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: facing, width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1 }
    });
  }

  async function openRecorder() {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { say("Round videos aren't supported on this browser."); return; }
    let facing = "user";
    let stream;
    try { stream = await openCamera(facing); }
    catch (_) { say("Allow the camera and microphone to send round videos."); return; }

    const ov = document.createElement("div");
    ov.className = "rv-overlay";
    ov.innerHTML =
      '<div class="rv-stage">' +
      '<div class="rv-live"><video class="rv-preview" autoplay muted playsinline></video></div>' + ringSvg() +
      '<span class="rv-timer" hidden>0:00</span></div>' +
      '<p class="rv-hint">Tap the red button to start</p>' +
      '<div class="rv-controls">' +
      '<button type="button" class="rv-c rv-x" aria-label="Cancel">&times;</button>' +
      '<button type="button" class="rv-c rv-go" aria-label="Start recording"><i></i></button>' +
      '<button type="button" class="rv-c rv-flip" aria-label="Switch camera"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-4l-2-3h-4L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M9 14a3 3 0 0 1 5-2M15 14a3 3 0 0 1-5 2"/></svg></button>' +
      "</div>";
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("on"));

    const pv = $(".rv-preview", ov);
    const fg = $(".rv-ring-fg", ov);
    const timer = $(".rv-timer", ov);
    const hint = $(".rv-hint", ov);
    const go = $(".rv-go", ov);
    const flip = $(".rv-flip", ov);
    pv.srcObject = stream;
    pv.classList.toggle("mirror", facing === "user");

    S = { ov, stream, rec: null, chunks: [], t0: 0, tick: 0, peer: currentPeer, facing, recording: false, done: false };

    flip.addEventListener("click", async () => {
      if (!S || S.recording) return;
      const next = S.facing === "user" ? "environment" : "user";
      try {
        const ns = await openCamera(next);
        S.stream.getTracks().forEach((t) => t.stop());
        S.stream = ns; S.facing = next;
        pv.srcObject = ns;
        pv.classList.toggle("mirror", next === "user");
      } catch (_) { say("Couldn't switch the camera."); }
    });

    $(".rv-x", ov).addEventListener("click", () => close(false));

    go.addEventListener("click", () => {
      if (!S) return;
      if (!S.recording) {
        const mime = pickMime();
        let rec;
        try { rec = mime ? new MediaRecorder(S.stream, { mimeType: mime, videoBitsPerSecond: 700000, audioBitsPerSecond: 64000 }) : new MediaRecorder(S.stream); }
        catch (_) { say("Couldn't start recording."); return; }
        S.rec = rec; S.chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) S.chunks.push(e.data); };
        rec.start(300);
        S.recording = true; S.t0 = Date.now();
        ov.classList.add("recording");
        flip.disabled = true;
        timer.hidden = false;
        hint.textContent = "Tap again to send";
        go.setAttribute("aria-label", "Send round video");
        buzz(14);
        if (window.kyroSocket) window.kyroSocket.emit("recording", { to: S.peer.id, recording: true });
        S.tick = setInterval(() => {
          const s = (Date.now() - S.t0) / 1000;
          timer.textContent = Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
          fg.style.strokeDashoffset = String(RING * (1 - Math.min(1, s / MAX_SEC)));
          if (s >= MAX_SEC) close(true);
        }, 100);
      } else {
        close(true);
      }
    });
  }

  function close(send) {
    if (!S || S.done) return;
    const cur = S;
    cur.done = true;
    clearInterval(cur.tick);
    const secs = cur.t0 ? (Date.now() - cur.t0) / 1000 : 0;
    const finish = async () => {
      cur.stream.getTracks().forEach((t) => t.stop());
      cur.ov.classList.remove("on");
      setTimeout(() => cur.ov.remove(), 260);
      if (window.kyroSocket && cur.peer) window.kyroSocket.emit("recording", { to: cur.peer.id, recording: false });
      S = null;
      if (!send) return;
      if (secs < 1 || !cur.chunks.length) { say("Record a little longer."); return; }
      const type = ((cur.rec && cur.rec.mimeType) || "video/webm").split(";")[0];
      const blob = new Blob(cur.chunks, { type });
      if (blob.size > 7000000) { say("That video is too big. Try a shorter one."); return; }
      if (typeof currentPeer === "undefined" || !currentPeer || String(currentPeer.id) !== String(cur.peer.id)) { say("Chat changed, video discarded."); return; }
      const media = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
      const fileName = MAIN + (type.indexOf("mp4") >= 0 ? ".mp4" : ".webm");
      const meta = { kind: "video", media, fileName, fileSize: blob.size, text: "\ud83c\udfa5 " + fileName };
      if (box.querySelector(".hint")) box.innerHTML = "";
      const bubble = makeBubble({ mine: true, senderId: meId, ...meta });
      appendMsg(box, bubble);
      box.scrollTop = box.scrollHeight;
      buzz(8);
      try { await sendChat(meta, bubble); } catch (_) { say("Couldn't send the video."); }
    };
    if (cur.rec && cur.rec.state !== "inactive") { cur.rec.onstop = finish; try { cur.rec.stop(); } catch (_) { finish(); } }
    else finish();
  }

  btn.addEventListener("click", (e) => { e.preventDefault(); if (!S) openRecorder(); });
  const thread = $("#threadScreen");
  if (thread) new MutationObserver(() => { if (thread.hidden && S) close(false); }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (document.hidden && S) close(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S) close(false); });
})();
