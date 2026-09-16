/* Progressive enhancement shared by every page.

   Content is authored fully visible. The `.reveal` opacity rule only takes
   effect once this script adds `js-reveal` to <html>, so if the script fails,
   is blocked, or the browser lacks IntersectionObserver, nothing is ever left
   stranded at zero opacity. */

(function () {
  "use strict";

  var root = document.documentElement;
  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) return;

  root.classList.add("js-reveal");

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    // Deliberately eager. A lazier threshold leaves a tall card blank while it
    // is already partly on screen, which reads as a broken page rather than a
    // considered entrance — especially on a phone.
    { rootMargin: "0px 0px -4% 0px", threshold: 0.01 }
  );

  function observe(scope) {
    (scope || document).querySelectorAll(".reveal:not(.is-visible)").forEach(function (el) {
      observer.observe(el);
    });
  }

  observe();

  // The board and the admin console render cards after their fetches resolve,
  // so they re-register newly inserted elements through this hook.
  window.okaymaReveal = observe;
})();
