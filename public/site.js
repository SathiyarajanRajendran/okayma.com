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
    })
    .catch(function () {
      /* The founder section stands on its own; a failed roster shows nothing. */
    });
})();
