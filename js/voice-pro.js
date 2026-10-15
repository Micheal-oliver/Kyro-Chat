/* Kyro voice recorder upgrade: live timer + waveform, cancel, send.
   Replaces the tap-tap recorder. Hooks the mic button in the capture phase, uses app.js globals (makeBubble, appendMsg, sendChat).
   Remove the <script> and <link> in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const MAX_SEC = 180;
  const BARS = 28;
  const say = (t) => { try { toast(t); } catch (_) {} };
  const buzz = (n) => { try { navigator.vibrate && navigator.vibrate(n); } catch (_) {} };

  const btn = $("#recBtn");
  const composer = $("#composer");
  if (!btn || !composer) return;

  let st = null; // active recording state

  function pickMime() {
    const list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  function mmss(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function buildBar() {
    const bar = document.createElement("div");
    bar.className = "vp-bar";
    bar.innerHTML =
      '<button type="button" class="vp-cancel" aria-label="Cancel recording">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>' +
      '<span class="vp-dot" aria-hidden="true"></span>' +
      '<span class="vp-time" aria-live="off">0:00</span>' +
      '<div class="vp-wave" aria-hidden="true">' + '<i></i>'.repeat(BARS) + "</div>" +
      '<button type="button" class="vp-send" aria-label="Send voice message">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2L2 14v7z"/></svg></button>';
    return bar;
  }

  async function start() {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { say("Voice notes aren't supported on this browser."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { say("Allow the microphone to send voice notes."); return; }

    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    let ctx = null, analyser = null, data = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
    } catch (_) {}

    const bar = buildBar();
    composer.appendChild(bar);
    composer.classList.add("vp-on");
    btn.classList.add("hot");
    const bars = Array.from(bar.querySelectorAll(".vp-wave i"));
    const timeEl = $(".vp-time", bar);

    st = { rec, stream, chunks, ctx, bar, t0: Date.now(), raf: 0, tick: 0, peer: currentPeer, sent: false };
    rec.start(250);
    buzz(12);
    if (window.kyroSocket) window.kyroSocket.emit("recording", { to: st.peer.id, recording: true });

    const level = new Array(BARS).fill(0.08);
    const draw = () => {
      if (!st) return;
      let v = 0.06;
      if (analyser) {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        v = Math.min(1, Math.max(0.06, (sum / data.length) / 110));
      }
      level.shift();
      level.push(v);
      for (let i = 0; i < BARS; i++) bars[i].style.transform = "scaleY(" + level[i].toFixed(3) + ")";
      st.raf = requestAnimationFrame(draw);
    };
    draw();

    st.tick = setInterval(() => {
      if (!st) return;
      const s = Math.floor((Date.now() - st.t0) / 1000);
      timeEl.textContent = mmss(s);
      if (s >= MAX_SEC) finish(true);
    }, 250);

    $(".vp-cancel", bar).addEventListener("click", () => finish(false));
    $(".vp-send", bar).addEventListener("click", () => finish(true));
  }

  function cleanup() {
    if (!st) return;
    clearInterval(st.tick);
    cancelAnimationFrame(st.raf);
    try { st.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { st.ctx && st.ctx.close(); } catch (_) {}
    const bar = st.bar;
    bar.classList.add("vp-out");
    setTimeout(() => bar.remove(), 220);
    composer.classList.remove("vp-on");
    btn.classList.remove("hot");
    if (window.kyroSocket && st.peer) window.kyroSocket.emit("recording", { to: st.peer.id, recording: false });
  }

  function finish(send) {
    if (!st || st.done) return;
    const cur = st;
    cur.done = true;
    const secs = (Date.now() - cur.t0) / 1000;
    cur.rec.onstop = async () => {
      cleanup();
      st = null;
      buzz(send ? 8 : [8, 40, 8]);
      if (!send) return;
      if (secs < 0.7 || !cur.chunks.length) { say("Hold on a bit longer to record."); return; }
      const blob = new Blob(cur.chunks, { type: cur.rec.mimeType || "audio/webm" });
      const media = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
      /* the chat may have changed while recording: only post into the same chat */
      if (typeof currentPeer === "undefined" || !currentPeer || String(currentPeer.id) !== String(cur.peer.id)) {
        say("Chat changed, voice note discarded.");
        return;
      }
      const box = document.getElementById("messages");
      if (box.querySelector(".hint")) box.innerHTML = "";
      const bubble = makeBubble({ mine: true, senderId: meId, kind: "voice", media, text: "voice" });
      appendMsg(box, bubble);
      box.scrollTop = box.scrollHeight;
      try { await sendChat({ kind: "voice", media, text: "voice" }, bubble); } catch (_) { say("Couldn't send the voice note."); }
    };
    try { cur.rec.stop(); } catch (_) { cur.rec.onstop(); }
  }

  btn.addEventListener("click", (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    if (st) return;
    start();
  }, true);

  /* leaving the chat while recording cancels it */
  const thread = $("#threadScreen");
  if (thread) new MutationObserver(() => { if (thread.hidden && st) finish(false); }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (document.hidden && st) finish(false); });
})();
