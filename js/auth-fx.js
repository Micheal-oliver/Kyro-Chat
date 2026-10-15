/* Visual-only extras for login/signup. Does not touch any form logic:
   it only adds a show/hide button next to the password field. */
(function () {
  var EYE_ON = '<svg class="k-eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg class="k-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  ["password", "newPassword", "confirmPassword"].forEach(function (id) {
    var pw = document.getElementById(id);
    if (!pw || pw.parentNode.classList.contains("k-field")) return;
    var wrap = document.createElement("div");
    wrap.className = "k-field";
    pw.parentNode.insertBefore(wrap, pw);
    wrap.appendChild(pw); // same element, same id, same listeners

    var btn = document.createElement("button");
    btn.type = "button"; // never submits the form
    btn.className = "k-eye";
    btn.setAttribute("aria-label", "Show password");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = EYE_ON + EYE_OFF;
    wrap.appendChild(btn);

    btn.addEventListener("click", function () {
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
})();
