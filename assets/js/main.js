(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- theme ---------- */
  const prefersDark = matchMedia("(prefers-color-scheme: dark)");
  const currentTheme = () => root.dataset.theme || (prefersDark.matches ? "dark" : "light");
  const toggle = $(".theme-toggle");
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const syncToggle = () => {
    const dark = currentTheme() === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    // keep the browser bar in step with a theme chosen by hand, not only with the system setting
    if (root.dataset.theme) themeMetas.forEach((m) => m.setAttribute("content", dark ? "#0c0d0f" : "#f7f7f5"));
  };
  syncToggle();
  prefersDark.addEventListener("change", syncToggle);
  toggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    syncToggle();
    window.dispatchEvent(new Event("themechange"));
  });

  /* ---------- header border + active nav link ---------- */
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const navLinks = new Map($$(".nav-links a").map((a) => [a.getAttribute("href").slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.remove("active"));
      navLinks.get(e.target.id)?.classList.add("active");
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("section[id]").forEach((s) => spy.observe(s));

  /* ---------- hero: the background comes into focus as you scroll (--p runs 0 → 1) ---------- */
  const hero = $(".hero"), soft = $("#flow"), sharp = $("#flow-sharp");
  if (hero && soft && sharp) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let range = 1; // read layout on resize only, so scrolling stays cheap
    const layout = () => { range = Math.max(hero.offsetHeight - window.innerHeight, window.innerHeight * 0.6); };
    const progress = () => {
      const p = still ? 1 : Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / range));
      hero.style.setProperty("--p", p.toFixed(3));
      soft.style.opacity = (1 - 0.9 * p).toFixed(3); // only opacity changes while scrolling: no relayout, no repaint
      sharp.style.opacity = p.toFixed(3);
    };
    layout(); progress();
    window.addEventListener("resize", () => { layout(); progress(); });
    window.addEventListener("scroll", progress, { passive: true });
  }

  /* ---------- reveal on scroll ---------- */
  const revealables = $$(".section-head, .card, .pub, .timeline, .contact-grid");
  const rio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.classList.add("visible");
      rio.unobserve(el);
      // once revealed, hand the element its own transitions back (cards lift and glow on hover)
      setTimeout(() => { el.classList.remove("reveal", "visible"); el.style.transitionDelay = ""; }, 1300);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  revealables.forEach((el) => {
    el.classList.add("reveal");
    if (el.classList.contains("card")) el.style.transitionDelay = `${([...el.parentElement.children].indexOf(el) % 2) * 90}ms`;
    rio.observe(el);
  });

  /* ---------- BibTeX ---------- */
  $$(".bib-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest(".pub-body").querySelector(".bibtex");
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      box.hidden = open;
    });
  });
  $$(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.parentElement.querySelector("code").textContent;
      try { await navigator.clipboard.writeText(code); btn.textContent = "Copied"; }
      catch { btn.textContent = "Select & copy"; }
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    });
  });

  $("#year").textContent = new Date().getFullYear();

  /* ======================================================================
     Easter eggs. If you are reading this: hello, fellow curious person.
     ====================================================================== */
  const toastEl = $(".toast");
  let toastTimer;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  // 0. Click the greeting: a few more ways to say hello
  const greet = $(".greet");
  if (greet) {
    const words = ["Hi", "Servus", "Moin", "Hallo", "Hey"];
    let i = 0;
    greet.addEventListener("click", () => { greet.textContent = words[(i = (i + 1) % words.length)]; });
  }

  // 1. A note for people who open the console
  console.log(
    "%c∇ Hi there.%c\n\nYou opened the console, so you are my kind of person.\n" +
      "The landing page responds to a certain classic sequence of arrow keys.\n" +
      "And everything ends with a proof. ∎\n\n— Emil",
    "font: 600 16px Futura, Jost, sans-serif; color: #0a7c5a;",
    "font: 13px Futura, Jost, sans-serif;"
  );

  // 2. Konami code heats up the density in the background, then it cools down
  const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let keys = []; // the last few keys, so a stray extra key does not spoil the sequence
  // 3. Typing "qed" anywhere
  let typed = "";

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    keys = keys.concat(k).slice(-konami.length);
    if (keys.join() === konami.join()) {
      keys = [];
      window.EP?.heat();
      document.getElementById("top").scrollIntoView({ behavior: "smooth" });
      toast("T → ∞. Now cooling back to equilibrium…", 4500);
    }

    if (k.length === 1) {
      typed = (typed + k).slice(-3);
      if (typed === "qed") {
        toast("∎  Quod erat demonstrandum.");
        const q = $(".qed");
        q.animate([{ transform: "scale(1)" }, { transform: "scale(2.2) rotate(90deg)" }, { transform: "scale(1)" }], { duration: 700, easing: "ease-in-out" });
      }
    }
  });

  // 4. The tombstone at the very end of the page
  const endings = [
    "The rest of the proof is left as an exercise to the reader.",
    "Converged, up to a set of measure zero.",
    "This page is complete. Gödel has reservations.",
    "No gradients were harmed in the making of this website.",
    "∎",
  ];
  let endIdx = 0;
  $(".qed").addEventListener("click", () => toast(endings[endIdx++ % endings.length]));

  // 5. The tab title when you look away
  const title = document.title;
  document.addEventListener("visibilitychange", () => {
    document.title = document.hidden ? "∇ still converging…" : title;
  });
})();
