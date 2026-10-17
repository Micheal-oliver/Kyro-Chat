/* Fills the {name}/{email}/... placeholders on privacy.html and terms.html from js/legal-config.js. */
(() => {
  const L = window.KYRO_LEGAL || {};
  document.querySelectorAll("[data-k]").forEach((el) => {
    const v = L[el.dataset.k];
    if (v === undefined || v === "") return;
    if (el.tagName === "A" && el.dataset.k === "email") { el.href = "mailto:" + v; }
    el.textContent = String(v);
  });
  document.querySelectorAll("[data-if]").forEach((el) => { if (!L[el.dataset.if]) el.remove(); });
  const warn = document.getElementById("ldWarn");
  if (warn && L.email) warn.remove();
})();
