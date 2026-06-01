(function () {
  const header = document.querySelector("[data-header]");
  const nav = document.querySelector("[data-nav]");
  const toggle = document.querySelector("[data-menu-toggle]");
  const navLinks = Array.from(document.querySelectorAll(".site-nav a[href^='#']"));
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const scrollProgress = document.querySelector("[data-scroll-progress]");
  const heroSurface = document.querySelector(".hero-surface");
  const closeMs =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur")) || 150;
  let closeTimer = null;
  let lastCaseTrigger = null;
  let progressFrame = 0;

  function setHeaderState() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }

  function setActiveLink() {
    if (sections.length === 0) return;

    let activeId = "";
    const activationLine = Math.min(window.innerHeight * 0.35, 360);

    if (window.scrollY > 260) {
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= activationLine) {
          activeId = section.id;
        }
      });
    }

    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + activeId);
    });
  }

  function setScrollProgress() {
    if (!scrollProgress) return;
    const root = document.scrollingElement || document.documentElement;
    const max = Math.max(root.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(1, Math.max(0, root.scrollTop / max));
    scrollProgress.style.setProperty("--progress", progress.toFixed(4));
  }

  function queueScrollProgress() {
    if (!scrollProgress || progressFrame) return;
    progressFrame = window.requestAnimationFrame(() => {
      setScrollProgress();
      progressFrame = 0;
    });
  }

  function closeMenu() {
    if (!toggle || !nav) return;
    if (!nav.classList.contains("is-open")) return;
    window.clearTimeout(closeTimer);
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
    nav.classList.add("is-closing");
    closeTimer = window.setTimeout(() => {
      nav.classList.remove("is-closing");
    }, closeMs);
  }

  function openMenu() {
    if (!toggle || !nav) return;
    window.clearTimeout(closeTimer);
    toggle.setAttribute("aria-expanded", "true");
    nav.classList.remove("is-closing");
    nav.classList.add("is-open");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const willOpen = toggle.getAttribute("aria-expanded") !== "true";
      if (willOpen) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      closeMenu();
    });
  }

  if (
    heroSurface &&
    window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches
  ) {
    heroSurface.addEventListener("pointermove", (event) => {
      const rect = heroSurface.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 6;
      heroSurface.style.setProperty("--hero-x", x.toFixed(2) + "px");
      heroSurface.style.setProperty("--hero-y", y.toFixed(2) + "px");
    });

    heroSurface.addEventListener("pointerleave", () => {
      heroSurface.style.setProperty("--hero-x", "0px");
      heroSurface.style.setProperty("--hero-y", "0px");
    });
  }

  navLinks.forEach((link) =>
    link.addEventListener("click", () => {
      navLinks.forEach((item) => item.classList.toggle("is-active", item === link));
      closeMenu();
    })
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.querySelectorAll("[data-case-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const dialog = document.getElementById(trigger.getAttribute("data-case-target"));
      if (!dialog || typeof dialog.showModal !== "function") return;
      lastCaseTrigger = trigger;
      dialog.showModal();
      document.body.classList.add("has-case-dialog");
    });
  });

  document.querySelectorAll(".case-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.querySelectorAll("[data-close-case]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("has-case-dialog");
      if (lastCaseTrigger) lastCaseTrigger.focus({ preventScroll: true });
      lastCaseTrigger = null;
    });
  });

  const revealTargets = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );

    revealTargets.forEach((item) => revealObserver.observe(item));
  } else {
    revealTargets.forEach((item) => item.classList.add("is-visible"));
  }

  window.addEventListener(
    "scroll",
    () => {
      setHeaderState();
      setActiveLink();
      queueScrollProgress();
    },
    { passive: true }
  );
  window.addEventListener("resize", () => {
    closeMenu();
    setScrollProgress();
  });
  window.addEventListener("hashchange", () => {
    if (!location.hash || location.hash === "#top") {
      navLinks.forEach((link) => link.classList.remove("is-active"));
    }
    window.setTimeout(setActiveLink, 220);
  });
  setHeaderState();
  setActiveLink();
  setScrollProgress();

  document.querySelectorAll(".t-avatar-group").forEach((root) => {
    const avatars = Array.from(root.querySelectorAll(".t-avatar"));
    if (avatars.length === 0) return;

    const cs = getComputedStyle(document.documentElement);
    const num = (name, fallback) => {
      const value = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const ease = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;

    function setShifts(activeIdx, phase) {
      const lift = num("--avatar-lift", -4);
      const falloff = num("--avatar-falloff", 0.45);
      const scale = num("--avatar-scale", 1.05);
      const timing =
        phase === "out"
          ? ease("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
          : ease("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

      avatars.forEach((item, index) => {
        item.style.transitionTimingFunction = timing;
        if (activeIdx == null) {
          item.style.setProperty("--shift", "0px");
          item.style.setProperty("--scale-active", "1");
          return;
        }

        const distance = Math.abs(index - activeIdx);
        item.style.setProperty("--shift", (lift * Math.pow(falloff, distance)).toFixed(3) + "px");
        item.style.setProperty("--scale-active", index === activeIdx ? String(scale) : "1");
      });
    }

    avatars.forEach((item, index) => {
      item.addEventListener("mouseenter", () => setShifts(index, "in"));
    });
    root.addEventListener("mouseleave", () => setShifts(null, "out"));
  });
})();
