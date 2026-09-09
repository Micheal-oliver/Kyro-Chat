(() => {
  const SLIDE_MS = 6500;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const dotsRoot = document.getElementById("dots");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const skipBtn = document.getElementById("skipBtn");
  const progressFill = document.getElementById("progressFill");
  const shell = document.getElementById("onboarding");

  let index = 0;
  let timer = null;
  let startX = 0;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.className = "dot" + (i === 0 ? " is-active" : "");
    dot.type = "button";
    dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
    dot.addEventListener("click", () => goTo(i));
    dotsRoot.appendChild(dot);
  });

  const dots = Array.from(dotsRoot.children);

  function goTo(next, auto = false) {
    if (next < 0 || next >= slides.length || next === index) {
      restartProgress();
      return;
    }

    slides[index].classList.remove("is-active");
    slides[next].classList.add("is-active");

    dots[index].classList.remove("is-active");
    dots[next].classList.add("is-active");

    index = next;
    prevBtn.disabled = index === 0;
    shell.classList.toggle("is-last", index === slides.length - 1);

    if (index === slides.length - 1) {
      nextBtn.setAttribute("aria-label", "Create account");
    } else {
      nextBtn.setAttribute("aria-label", "Next slide");
    }

    restartProgress();
    if (!auto) schedule();
  }

  function next() {
    if (index === slides.length - 1) {
      window.location.href = "signup.html";
      return;
    }
    goTo(index + 1);
  }

  function prev() {
    goTo(index - 1);
  }

  function schedule() {
    clearTimeout(timer);
    if (index === slides.length - 1) {
      progressFill.classList.remove("is-running");
      progressFill.style.width = "100%";
      return;
    }
    timer = setTimeout(() => goTo(index + 1, true), SLIDE_MS);
  }

  function restartProgress() {
    progressFill.classList.remove("is-running");
    progressFill.style.width = index === slides.length - 1 ? "100%" : "0";
    void progressFill.offsetWidth;
    if (index !== slides.length - 1) {
      progressFill.classList.add("is-running");
    }
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  skipBtn.addEventListener("click", () => goTo(slides.length - 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });

  const slidesEl = document.getElementById("slides");
  slidesEl.addEventListener("touchstart", (e) => {
    startX = e.changedTouches[0].clientX;
  }, { passive: true });

  slidesEl.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) next();
    else prev();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(timer);
      progressFill.classList.remove("is-running");
    } else {
      restartProgress();
      schedule();
    }
  });

  prevBtn.disabled = true;
  restartProgress();
  schedule();
})();
