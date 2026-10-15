/* "Install Kyro" button for login / signup / forgot pages.
   Shows only when the browser says the app can be installed (Chrome/Edge/Android).
   Registers the existing sw.js the same way js/extras.js does in the app. */
(function () {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
  var card = document.querySelector(".auth-card");
  if (!card) return;
  var deferred = null;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "k-install";
  btn.hidden = true;
  btn.textContent = "Install Kyro on this device";
  var anchor = card.querySelector(".k-trust");
  if (anchor) anchor.insertAdjacentElement("afterend", btn); else card.appendChild(btn);

  addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener("click", function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; btn.hidden = true; });
  });
  addEventListener("appinstalled", function () { btn.hidden = true; });
})();
