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

/* Team strip under the founder. Runs only on a page that has the container,
   and builds every node with DOM APIs so an uploaded name or bio can never
   become markup. */
(function () {
  "use strict";

  var wrap = document.getElementById("team");
  var list = document.getElementById("team-list");
  if (!wrap || !list) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  fetch("/api/team", { credentials: "same-origin" })
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (data) {
      if (!data || !data.team || !data.team.length) return;

      data.team.forEach(function (person) {
        var item = el("li", "team-card");

        if (person.photoUrl) {
          var img = document.createElement("img");
          img.className = "team-photo";
          img.src = person.photoUrl;
          img.alt = person.name;
          img.width = 96;
          img.height = 96;
          img.loading = "lazy";
          img.decoding = "async";
          item.append(img);
        } else {
          // Initials keep the row aligned when there is no portrait yet.
          var initials = person.name
            .split(/\s+/)
            .slice(0, 2)
            .map(function (part) {
              return part.charAt(0).toUpperCase();
            })
            .join("");
          item.append(el("span", "team-photo team-initials", initials));
        }

        var body = el("div", "team-body");
        body.append(el("p", "team-name", person.name));
        if (person.role) body.append(el("p", "team-role", person.role));
        if (person.bio) body.append(el("p", "team-bio", person.bio));

        if (person.linkedinUrl) {
          var link = el("a", "contact-link", "LinkedIn");
          // The server only stores an https linkedin.com address, and these
          // two attributes keep the new tab from reaching back into ours.
          link.href = person.linkedinUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          body.append(link);
        }

        item.append(body);
        list.append(item);
      });

      wrap.hidden = false;
      if (typeof window.okaymaReveal === "function") window.okaymaReveal(wrap);
      startCarousel(data.team.length);
    })
    .catch(function () {
      /* The founder section stands on its own; a failed roster shows nothing. */
    });

  /* Carousel ------------------------------------------------------------- */

  function startCarousel(count) {
    var controls = document.getElementById("team-controls");
    var dotsWrap = document.getElementById("team-dots");
    var prev = document.getElementById("team-prev");
    var next = document.getElementById("team-next");

    // One card cannot slide, so the controls would be decoration that lies
    // about there being more to see.
    if (count < 2) return;

    controls.hidden = false;
    dotsWrap.hidden = false;

    var reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var behavior = reduced ? "auto" : "smooth";

    function step() {
      var card = list.querySelector(".team-card");
      if (!card) return 0;
      var styles = window.getComputedStyle(list);
      var gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
      return card.getBoundingClientRect().width + gap;
    }

    // How far the track can scroll; used to decide when to wrap around.
    function maxScroll() {
      return list.scrollWidth - list.clientWidth;
    }

    function go(direction) {
      var amount = step();
      if (!amount) return;
      var atEnd = list.scrollLeft >= maxScroll() - 2;
      var atStart = list.scrollLeft <= 2;

      if (direction > 0 && atEnd) list.scrollTo({ left: 0, behavior: behavior });
      else if (direction < 0 && atStart) {
        list.scrollTo({ left: maxScroll(), behavior: behavior });
      } else {
        list.scrollBy({ left: amount * direction, behavior: behavior });
      }
    }

    next.addEventListener("click", function () {
      go(1);
      restart();
    });
    prev.addEventListener("click", function () {
      go(-1);
      restart();
    });

    // Dots ----------------------------------------------------------------
    var dots = [];
    var cards = list.querySelectorAll(".team-card");
    cards.forEach(function (card, index) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Show team member " + (index + 1));
      dot.addEventListener("click", function () {
        list.scrollTo({ left: step() * index, behavior: behavior });
        restart();
      });
      dotsWrap.append(dot);
      dots.push(dot);
    });

    function syncDots() {
      var amount = step();
      if (!amount) return;
      var active = Math.round(list.scrollLeft / amount);
      dots.forEach(function (dot, index) {
        var on = index === active;
        dot.setAttribute("aria-selected", String(on));
        dot.classList.toggle("is-active", on);
      });
    }

    var ticking = false;
    list.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        syncDots();
        ticking = false;
      });
    });
    syncDots();

    // Autoplay ------------------------------------------------------------
    //
    // Under reduced motion nothing below starts anything: play() returns
    // immediately. The arrows, dots, swipe and keyboard all still work, so
    // nothing is lost but the movement.
    var timer = null;

    function play() {
      // Guarded here rather than only at the call below: the arrow and dot
      // handlers call restart(), which would otherwise start autoplay for
      // someone who has asked for reduced motion.
      if (reduced) return;
      stop();
      timer = window.setInterval(function () {
        // Pointless work while the tab is in the background, and it would
        // otherwise queue up jumps that all land at once on return.
        if (document.hidden) return;
        go(1);
      }, 5000);
    }

    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function restart() {
      stop();
      play();
    }

    // Stop while someone is reading or interacting, by any means of getting
    // there: mouse, keyboard, or touch.
    ["pointerenter", "focusin", "touchstart"].forEach(function (event) {
      wrap.addEventListener(event, stop, { passive: true });
    });
    ["pointerleave", "focusout"].forEach(function (event) {
      wrap.addEventListener(event, play);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else play();
    });

    play();
  }
})();
